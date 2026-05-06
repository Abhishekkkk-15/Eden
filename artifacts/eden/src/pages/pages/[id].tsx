import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPage,
  useUpdatePage,
  useCreateBlock,
  useUpdateBlock,
  useDeleteBlock,
  useReorderBlocks,
  useCreatePage,
  useListPages,
  useListSources,
  getGetPageQueryKey,
  type Block,
  type BlockType,
  type Page,
  type Source,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sparkles,
  Heading1,
  Heading2,
  Heading3,
  Text as TextIcon,
  CheckSquare,
  List,
  ListOrdered,
  Quote,
  Code as CodeIcon,
  Minus,
  Plus,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Trash2,
  Folder,
  FileText,
  Database,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SourceCreateDialog } from "@/components/sources/source-create-dialog";
import { streamChat } from "@/lib/ai";
import { cn } from "@/lib/utils";

interface BlockTypeOption {
  type: BlockType;
  label: string;
  icon: typeof Heading1;
  hint: string;
}

const BLOCK_TYPES: BlockTypeOption[] = [
  { type: "ai" as any, label: "Ask AI", icon: Sparkles, hint: "Generate with AI" },
  { type: "text", label: "Text", icon: TextIcon, hint: "Plain paragraph" },
  { type: "heading1", label: "Heading 1", icon: Heading1, hint: "Section title" },
  { type: "heading2", label: "Heading 2", icon: Heading2, hint: "Subsection" },
  { type: "heading3", label: "Heading 3", icon: Heading3, hint: "Smaller heading" },
  { type: "todo", label: "To-do", icon: CheckSquare, hint: "Task with checkbox" },
  { type: "bulleted", label: "Bulleted list", icon: List, hint: "Unordered list item" },
  { type: "numbered", label: "Numbered list", icon: ListOrdered, hint: "Ordered list item" },
  { type: "quote", label: "Quote", icon: Quote, hint: "Pull quote" },
  { type: "code", label: "Code", icon: CodeIcon, hint: "Monospace block" },
  { type: "divider", label: "Divider", icon: Minus, hint: "Horizontal rule" },
];

function placeholderFor(type: BlockType): string {
  switch (type as any) {
    case "ai":
      return "What's on your mind?";
    case "heading1":
      return "Heading 1";
    case "heading2":
      return "Heading 2";
    case "heading3":
      return "Heading 3";
    case "todo":
      return "To-do";
    case "bulleted":
      return "List item";
    case "numbered":
      return "List item";
    case "quote":
      return "Quote";
    case "code":
      return "Code";
    case "divider":
      return "";
    default:
      return "Type ‘/’ for commands";
  }
}

function classesFor(type: BlockType): string {
  switch (type as any) {
    case "ai":
      return "text-base font-medium text-primary";
    case "heading1":
      return "text-3xl font-semibold tracking-tight leading-tight";
    case "heading2":
      return "text-2xl font-semibold tracking-tight leading-snug";
    case "heading3":
      return "text-xl font-semibold tracking-tight leading-snug";
    case "quote":
      return "italic text-foreground/80 border-l-2 border-border pl-4";
    case "code":
      return "font-mono text-sm bg-muted/60 rounded-md px-3 py-2";
    case "bulleted":
      return "text-base";
    case "numbered":
      return "text-base";
    case "todo":
      return "text-base";
    default:
      return "text-base leading-relaxed";
  }
}

interface BlockRowProps {
  block: Block;
  index: number;
  numberedIndex: number;
  total: number;
  isFocused: boolean;
  onFocus: () => void;
  onChangeContent: (content: string) => void;
  onChangeType: (type: BlockType) => void;
  onToggleChecked: (checked: boolean) => void;
  onAddAfter: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BlockRow({
  block,
  index,
  numberedIndex,
  total,
  isFocused,
  onFocus,
  onChangeContent,
  onChangeType,
  onToggleChecked,
  onAddAfter,
  onDelete,
  onMoveUp,
  onMoveDown,
}: BlockRowProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!editorRef.current || isGenerating) return;
    if (editorRef.current.innerText !== block.content) {
      editorRef.current.innerText = block.content;
    }
  }, [block.id, block.content, isGenerating]);

  const handleInput = () => {
    const value = editorRef.current?.innerText ?? "";
    if (value === "/" && !slashOpen) {
      setSlashOpen(true);
    } else if (value !== "/" && slashOpen) {
      setSlashOpen(false);
    }
    onChangeContent(value);
  };

  const handleAIKeyPress = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && prompt.trim()) {
      setIsGenerating(true);
      let fullContent = "";
      try {
        const stream = streamChat([
          { role: "system", content: "You are a helpful writing assistant. Provide concise, well-formatted text without any introductory or concluding remarks." },
          { role: "user", content: prompt },
        ]);

        for await (const chunk of stream) {
          fullContent += chunk;
          if (editorRef.current) {
            editorRef.current.innerText = fullContent;
          }
        }
        
        onChangeType("text");
        onChangeContent(fullContent);
      } catch (err) {
        toast.error("AI generation failed");
      } finally {
        setIsGenerating(false);
        setPrompt("");
      }
    } else if (e.key === "Escape") {
      onChangeType("text");
      setPrompt("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      onAddAfter();
      return;
    }
    if (e.key === "Backspace") {
      const value = editorRef.current?.innerText ?? "";
      if (value.length === 0 && total > 1) {
        e.preventDefault();
        onDelete();
      }
    }
  };

  const pickType = (type: BlockType) => {
    setSlashOpen(false);
    if (editorRef.current) {
      editorRef.current.innerText = "";
    }
    onChangeContent("");
    onChangeType(type);
    setTimeout(() => editorRef.current?.focus(), 0);
  };

  if (block.type === "divider") {
    return (
      <div
        className="group relative flex items-center gap-2 py-2"
        data-testid={`block-${block.id}`}
      >
        <BlockHandle
          index={index}
          total={total}
          onAddAfter={onAddAfter}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
        <hr className="flex-1 border-border" />
      </div>
    );
  }

  return (
    <div
      className="group relative flex items-start gap-2 py-1"
      data-testid={`block-${block.id}`}
    >
      <BlockHandle
        index={index}
        total={total}
        onAddAfter={onAddAfter}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDelete}
      />

      {block.type === "todo" && (
        <Checkbox
          checked={block.checked}
          onCheckedChange={(v) => onToggleChecked(Boolean(v))}
          className="mt-2"
        />
      )}
      {block.type === "bulleted" && (
        <span className="mt-2 select-none text-muted-foreground">{"•"}</span>
      )}
      {block.type === "numbered" && (
        <span className="mt-1 select-none text-muted-foreground tabular-nums">
          {numberedIndex}.
        </span>
      )}

      {(block.type as string) === "ai" ? (
        <div className="flex-1 relative flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.05)]">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <input
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-primary/40 text-foreground"
            placeholder={isGenerating ? "AI is thinking..." : "Ask AI to write anything..."}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleAIKeyPress}
            disabled={isGenerating}
          />
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <button onClick={() => onChangeType("text")} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <Popover open={slashOpen} onOpenChange={setSlashOpen}>
          <PopoverTrigger asChild>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={placeholderFor(block.type)}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={onFocus}
              className={`flex-1 min-h-[1.75rem] outline-none rounded-sm transition-colors ${classesFor(
                block.type,
              )} ${block.type === "todo" && block.checked ? "line-through text-muted-foreground" : ""} empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 ${
                isFocused ? "" : ""
              }`}
            />
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={4} className="w-72 p-1">
            <div className="text-xs text-muted-foreground px-2 py-1.5">Insert block</div>
            <div className="max-h-72 overflow-y-auto">
              {BLOCK_TYPES.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => pickType(opt.type)}
                    className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
                  >
                    <Icon className={cn("h-4 w-4", (opt.type as string) === 'ai' ? "text-primary" : "text-muted-foreground")} />
                    <span className="flex-1">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function BlockHandle({
  index,
  total,
  onAddAfter,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  index: number;
  total: number;
  onAddAfter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col items-center pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-foreground rounded-sm p-0.5"
            aria-label="Block actions"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="w-44 p-1">
          <button
            type="button"
            onClick={onAddAfter}
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
          >
            <Plus className="h-4 w-4" /> Insert below
          </button>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronUp className="h-4 w-4" /> Move up
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronDown className="h-4 w-4" /> Move down
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PageSourcesSection({
  pageId,
  sources,
}: {
  pageId: number;
  sources: Source[];
}) {
  return (
    <Card className="mt-10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Sources</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Files attached to this page.
          </p>
        </div>
        <SourceCreateDialog
          defaultParentPageId={pageId}
          lockParentPageId
          titleText="Add source to this page"
          trigger={<Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Add Source</Button>}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {sources.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No sources attached to this page yet.
          </div>
        ) : (
          sources.map((source) => (
            <Link key={source.id} href={`/sources/${source.id}`}>
              <div className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/40 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{source.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {source.kind}
                    </div>
                  </div>
                </div>
                <Badge variant={source.status === "ready" ? "secondary" : "outline"}>
                  {source.status}
                </Badge>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FolderCanvas({
  folder,
  childPages,
  childSources,
  onCreatePage,
  onCreateFolder,
}: {
  folder: Page;
  childPages: Page[];
  childSources: Source[];
  onCreatePage: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <div className="px-10 py-12 max-w-5xl mx-auto animate-in fade-in duration-300 space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Folder className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{folder.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Folder canvas for pages and sources.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onCreatePage}><FileText className="h-4 w-4 mr-1.5" /> New Page</Button>
        <Button variant="outline" onClick={onCreateFolder}><Folder className="h-4 w-4 mr-1.5" /> New Folder</Button>
        <SourceCreateDialog
          defaultParentPageId={folder.id}
          lockParentPageId
          titleText="Add source to this folder"
          trigger={<Button variant="outline"><Database className="h-4 w-4 mr-1.5" /> Add Source</Button>}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pages & Folders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {childPages.length === 0 ? (
              <div className="text-sm text-muted-foreground">No pages or folders inside this folder yet.</div>
            ) : (
              childPages.map((child) => (
                <Link key={child.id} href={`/pages/${child.id}`}>
                  <div className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/40 transition-colors cursor-pointer">
                    {child.kind === "folder" ? <Folder className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{child.emoji ? `${child.emoji} ` : ""}{child.title}</div>
                      <div className="text-xs text-muted-foreground capitalize">{child.kind}</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {childSources.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sources inside this folder yet.</div>
            ) : (
              childSources.map((source) => (
                <Link key={source.id} href={`/sources/${source.id}`}>
                  <div className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/40 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{source.title}</div>
                        <div className="text-xs text-muted-foreground">{source.kind}</div>
                      </div>
                    </div>
                    <Badge variant={source.status === "ready" ? "secondary" : "outline"}>
                      {source.status}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PageEditor({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: page, isLoading } = useGetPage(id);
  const { data: pages } = useListPages();
  const { data: sources } = useListSources();
  const queryClient = useQueryClient();
  const updatePage = useUpdatePage();
  const createPage = useCreatePage();
  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();
  const deleteBlock = useDeleteBlock();
  const reorderBlocks = useReorderBlocks();
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const debounce = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setEmoji(page.emoji ?? "");
    }
  }, [page?.id]);

  const blocks = useMemo<Block[]>(() => page?.blocks ?? [], [page?.blocks]);
  const pageList = useMemo<Page[]>(() => (Array.isArray(pages) ? pages : []), [pages]);
  const sourceList = useMemo<Source[]>(() => (Array.isArray(sources) ? sources : []), [sources]);
  const childPages = useMemo(
    () =>
      pageList
        .filter((candidate) => candidate.parentId === id)
        .sort((a, b) => (a.position === b.position ? a.id - b.id : a.position - b.position)),
    [id, pageList],
  );
  const attachedSources = useMemo(
    () => sourceList.filter((source) => source.parentPageId === id),
    [id, sourceList],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetPageQueryKey(id) });

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetPageQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: ["/api/pages"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] }),
    ]);
  };

  const debounced = (key: string, fn: () => void, ms = 350) => {
    const map = debounce.current;
    const existing = map.get(key);
    if (existing) clearTimeout(existing);
    map.set(
      key,
      setTimeout(() => {
        map.delete(key);
        fn();
      }, ms),
    );
  };

  const handleTitle = (e: FormEvent<HTMLInputElement>) => {
    const value = (e.target as HTMLInputElement).value;
    setTitle(value);
    debounced("title", () => {
      updatePage.mutate({ id, data: { title: value } }, { onSuccess: refresh });
    });
  };

  const handleEmoji = (e: FormEvent<HTMLInputElement>) => {
    const value = (e.target as HTMLInputElement).value;
    setEmoji(value);
    debounced(
      "emoji",
      () => {
        updatePage.mutate(
          { id, data: { emoji: value || null } },
          { onSuccess: refresh },
        );
      },
      500,
    );
  };

  const handleAddAfter = (afterIndex: number) => {
    createBlock.mutate(
      {
        id,
        data: { type: "text", content: "", position: afterIndex + 1 },
      },
      {
        onSuccess: async () => {
          await refresh();
          if (blocks.length > 0) {
            const ordered = [...blocks.map((b) => b.id)];
            ordered.splice(afterIndex + 1, 0, -1);
          }
        },
      },
    );
  };

  const handleAppend = () => {
    createBlock.mutate(
      { id, data: { type: "text", content: "" } },
      { onSuccess: refresh },
    );
  };

  const handleChangeContent = (block: Block, content: string) => {
    debounced(
      `block-content-${block.id}`,
      () => {
        updateBlock.mutate(
          { id: block.id, data: { content } },
          { onSuccess: refresh },
        );
      },
      400,
    );
  };

  const handleChangeType = (block: Block, type: BlockType) => {
    updateBlock.mutate(
      { id: block.id, data: { type } },
      { onSuccess: refresh },
    );
  };

  const handleToggleChecked = (block: Block, checked: boolean) => {
    updateBlock.mutate(
      { id: block.id, data: { checked } },
      { onSuccess: refresh },
    );
  };

  const handleDelete = (block: Block) => {
    deleteBlock.mutate({ id: block.id }, { onSuccess: refresh });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const ordered = blocks.map((b) => b.id);
    [ordered[index - 1], ordered[index]] = [ordered[index]!, ordered[index - 1]!];
    reorderBlocks.mutate(
      { id, data: { orderedIds: ordered } },
      { onSuccess: refresh },
    );
  };

  const handleMoveDown = (index: number) => {
    if (index >= blocks.length - 1) return;
    const ordered = blocks.map((b) => b.id);
    [ordered[index + 1], ordered[index]] = [ordered[index]!, ordered[index + 1]!];
    reorderBlocks.mutate(
      { id, data: { orderedIds: ordered } },
      { onSuccess: refresh },
    );
  };

  const handleCreateChild = (kind: "page" | "folder") => {
    createPage.mutate(
      {
        data: {
          kind,
          title: kind === "folder" ? "Untitled Folder" : "Untitled",
          parentId: id,
        },
      },
      {
        onSuccess: async (created) => {
          await refreshWorkspace();
          setLocation(`/pages/${created.id}`);
        },
        onError: () => toast.error(`Failed to create ${kind}`),
      },
    );
  };

  if (isLoading || !page) {
    return (
      <div className="p-10 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-4/6" />
        </div>
      </div>
    );
  }

  let numberedCounter = 0;

  if (page.kind === "folder") {
    return (
      <FolderCanvas
        folder={page}
        childPages={childPages}
        childSources={attachedSources}
        onCreatePage={() => handleCreateChild("page")}
        onCreateFolder={() => handleCreateChild("folder")}
      />
    );
  }

  return (
    <div className="px-10 py-12 max-w-3xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-2">
        <Input
          value={emoji}
          onChange={handleEmoji}
          placeholder="✨"
          className="w-14 h-14 text-3xl text-center border-none focus-visible:ring-1 focus-visible:ring-ring/40 bg-transparent"
          maxLength={4}
        />
      </div>
      <Input
        value={title}
        onChange={handleTitle}
        placeholder="Untitled"
        className="text-4xl font-semibold tracking-tight border-none px-0 h-auto focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/40"
      />
      <p className="text-xs text-muted-foreground mt-1">
        Last edited {new Date(page.updatedAt).toLocaleString()}
      </p>

      <div className="mt-8 space-y-1">
        {blocks.length === 0 ? (
          <button
            type="button"
            onClick={handleAppend}
            className="text-muted-foreground/60 hover:text-foreground text-base"
          >
            Click to add the first block, or press the button below.
          </button>
        ) : (
          blocks.map((block, index) => {
            if (block.type === "numbered") numberedCounter += 1;
            else numberedCounter = 0;
            return (
              <BlockRow
                key={block.id}
                block={block}
                index={index}
                numberedIndex={numberedCounter || 1}
                total={blocks.length}
                isFocused={focusedId === block.id}
                onFocus={() => setFocusedId(block.id)}
                onChangeContent={(c) => handleChangeContent(block, c)}
                onChangeType={(t) => handleChangeType(block, t)}
                onToggleChecked={(c) => handleToggleChecked(block, c)}
                onAddAfter={() => handleAddAfter(index)}
                onDelete={() => handleDelete(block)}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
              />
            );
          })
        )}

        <div className="pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAppend}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add block
          </Button>
        </div>
      </div>

      <PageSourcesSection pageId={id} sources={attachedSources} />
    </div>
  );
}
