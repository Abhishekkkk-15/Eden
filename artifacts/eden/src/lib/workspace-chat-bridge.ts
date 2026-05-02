/** Payload written by Sources (My Drive) cards when dragging into chat. */
export type WorkspaceDragPayload =
  | { type: "folder"; id: number; title: string }
  | { type: "source"; id: number; isPage?: boolean; title: string };

export type ChatAttachment = {
  key: string;
  apiType: "source" | "page" | "folder";
  id: number;
  title: string;
};

export type PersistedContextItem = {
  type: "source" | "page" | "folder";
  id: number;
  title?: string;
};

export function parseWorkspaceDragJson(raw: string): WorkspaceDragPayload | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.type === "folder" && typeof o.id === "number") {
      return {
        type: "folder",
        id: o.id,
        title: typeof o.title === "string" ? o.title : `Folder #${o.id}`,
      };
    }
    if (o.type === "source" && typeof o.id === "number") {
      return {
        type: "source",
        id: o.id,
        isPage: Boolean(o.isPage),
        title: typeof o.title === "string" ? o.title : `Item #${o.id}`,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function attachmentFromDrag(p: WorkspaceDragPayload): ChatAttachment {
  if (p.type === "folder") {
    return { key: `folder-${p.id}`, apiType: "folder", id: p.id, title: p.title };
  }
  if (p.isPage) {
    return { key: `page-${p.id}`, apiType: "page", id: p.id, title: p.title };
  }
  return { key: `source-${p.id}`, apiType: "source", id: p.id, title: p.title };
}

export function attachmentFromContextItem(item: PersistedContextItem): ChatAttachment {
  const fallbackTitle =
    item.type === "folder" ? `Folder #${item.id}`
    : item.type === "page" ? `Document #${item.id}`
    : `File #${item.id}`;
  return {
    key: `${item.type}-${item.id}`,
    apiType: item.type,
    id: item.id,
    title: item.title || fallbackTitle,
  };
}
