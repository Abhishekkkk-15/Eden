/**
 * MarkdownHeaderTextSplitter
 * 
 * LangChain-compatible Markdown Header Text Splitter for TypeScript.
 * Splits documents along markdown header boundaries (# through ######) while
 * tracking the hierarchical header context across chunks.
 */

export type HeaderTuple = [string, string]; // [headerTag, metadataKey], e.g. ["#", "Header 1"]

export interface MarkdownHeaderTextSplitterOptions {
  headersToSplitOn?: HeaderTuple[];
  stripHeaders?: boolean;
  returnEachLine?: boolean;
}

export interface SplitDocument {
  pageContent: string;
  metadata: Record<string, string>;
}

export class MarkdownHeaderTextSplitter {
  private headersToSplitOn: HeaderTuple[];
  private stripHeaders: boolean;
  private returnEachLine: boolean;

  constructor(options?: MarkdownHeaderTextSplitterOptions) {
    this.headersToSplitOn = options?.headersToSplitOn ?? [
      ["#", "Header 1"],
      ["##", "Header 2"],
      ["###", "Header 3"],
      ["####", "Header 4"],
      ["#####", "Header 5"],
      ["######", "Header 6"],
    ];
    // Match longest header prefixes first (e.g., "###" before "#")
    this.headersToSplitOn.sort((a, b) => b[0].length - a[0].length);
    this.stripHeaders = options?.stripHeaders ?? false;
    this.returnEachLine = options?.returnEachLine ?? false;
  }

  /**
   * Splits a markdown string into documents, each tagged with active header metadata.
   */
  public splitText(text: string): SplitDocument[] {
    const clean = text.replace(/\r\n/g, "\n");
    const lines = clean.split("\n");
    const output: SplitDocument[] = [];
    let currentContent: string[] = [];
    let currentMetadata: Record<string, string> = {};

    const headerLevels = new Map<string, number>();
    for (const [tag] of this.headersToSplitOn) {
      headerLevels.set(tag, tag.trim().length);
    }

    const commitSection = () => {
      const content = currentContent.join("\n").trim();
      if (content.length > 0) {
        output.push({
          pageContent: content,
          metadata: { ...currentMetadata },
        });
      }
      currentContent = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      let matchedHeader: [string, string] | null = null;

      for (const [tag, name] of this.headersToSplitOn) {
        if (trimmed === tag || trimmed.startsWith(`${tag} `)) {
          matchedHeader = [tag, name];
          break;
        }
      }

      if (matchedHeader) {
        commitSection();

        const [tag, name] = matchedHeader;
        const currentLevel = headerLevels.get(tag) ?? tag.length;
        const headerValue = trimmed.slice(tag.length).trim();

        // Remove headers at the same or deeper level
        for (const [otherTag, otherName] of this.headersToSplitOn) {
          const otherLevel = headerLevels.get(otherTag) ?? otherTag.length;
          if (otherLevel >= currentLevel) {
            delete currentMetadata[otherName];
          }
        }

        currentMetadata[name] = headerValue;

        if (!this.stripHeaders) {
          currentContent.push(line);
        }
      } else {
        currentContent.push(line);
      }
    }

    commitSection();
    return output;
  }
}

/**
 * Splits plain text using sliding window with natural boundary snapping (paragraphs, sentences).
 */
export function splitByBoundaries(text: string, chunkSize = 2000, overlap = 250): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + chunkSize);
    let cut = end;
    if (end < clean.length) {
      const para = clean.lastIndexOf("\n\n", end);
      const sent = clean.lastIndexOf(". ", end);
      const candidate = Math.max(para, sent);
      if (candidate > i + chunkSize * 0.5) cut = candidate;
    }
    chunks.push(clean.slice(i, cut).trim());
    if (cut >= clean.length) break;
    i = Math.max(cut - overlap, i + 1);
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Primary Chunking Strategy:
 * 1. Uses MarkdownHeaderTextSplitter to group text along logical section headers.
 * 2. If a section exceeds chunkSize, recursively sub-chunks it using natural boundary snapping,
 *    preserving the active header breadcrumbs on all continuation sub-chunks.
 * 3. Falls back gracefully to natural boundary snapping if no markdown headers are present.
 */
export function chunkMarkdownWithHeaders(
  text: string,
  chunkSize = 2000,
  overlap = 250,
  splitterOptions?: MarkdownHeaderTextSplitterOptions
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const splitter = new MarkdownHeaderTextSplitter({
    stripHeaders: false,
    ...splitterOptions,
  });

  const sections = splitter.splitText(clean);

  // If no markdown headers were detected, fall back to boundary sliding window
  const hasHeaders = sections.some((s) => Object.keys(s.metadata).length > 0);
  if (!hasHeaders) {
    return splitByBoundaries(clean, chunkSize, overlap);
  }

  const finalChunks: string[] = [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const content = section.pageContent.trim();
    if (!content) continue;

    // Check if this section is ONLY a header line with no body text
    const isHeaderOnly = /^#{1,6}\s+[^\n]+$/.test(content);
    if (isHeaderOnly && sIdx < sections.length - 1) {
      // Child sections will inherit this header in their metadata breadcrumbs
      continue;
    }

    // Determine parent breadcrumbs (all ancestor headers above the current header)
    const headerEntries = Object.entries(section.metadata);
    const parentBreadcrumbs = headerEntries
      .slice(0, -1)
      .map(([, val]) => val)
      .filter(Boolean);

    const prefix = parentBreadcrumbs.length > 0 ? `[${parentBreadcrumbs.join(" > ")}]\n` : "";
    const enrichedContent = prefix ? `${prefix}${content}` : content;

    if (enrichedContent.length <= chunkSize) {
      finalChunks.push(enrichedContent);
    } else {
      // Split large section using boundary snapping while prepending header context to continuations
      const subChunks = splitByBoundaries(content, chunkSize, overlap);
      const allHeaders = headerEntries.map(([, val]) => val).filter(Boolean);
      subChunks.forEach((subChunk, idx) => {
        if (idx === 0) {
          finalChunks.push(prefix ? `${prefix}${subChunk}` : subChunk);
        } else {
          const continuationPrefix =
            allHeaders.length > 0 ? `[${allHeaders.join(" > ")} (cont.)]\n` : "";
          finalChunks.push(`${continuationPrefix}${subChunk}`);
        }
      });
    }
  }

  return finalChunks.filter((c) => c.length > 0);
}
