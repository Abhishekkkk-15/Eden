import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSocket } from "@/providers/socket-provider";
import {
  getListPagesQueryKey,
  useCreatePage,
  useListPages,
  useUpdatePage,
  useDeletePage,
  type Page,
} from "@/hooks/use-pages";
import {
  getListSourcesQueryKey,
  useListSources,
  useListSourcesInFolder,
  useSourceFolderCounts,
  useUpdateSource,
  useDeleteSource,
  type Source,
} from "@/hooks/use-sources";
import { useSearchWorkspace } from "@/hooks/use-search";
import { useListAgents } from "@/hooks/use-agents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ChevronRight,
  ChevronDown,
  Database,
  FileText,
  Film,
  Folder,
  HardDrive,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  Youtube,
  MoreVertical,
  Pencil,
  Trash2,
  FolderOpen,
  CheckSquare,
  Cloud,
  Bot,
  LayoutGrid,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SourceCreateDialog } from "@/components/sources/source-create-dialog";
import { WorkspaceSearchPanel } from "@/components/sources/workspace-search-panel";
import { AssignAgentDialog } from "@/components/sources/assign-agent-dialog";
import { PhotoFolder, type FolderItem } from "@/components/PhotoFolder";
import { BulkOperationsToolbar } from "@/components/sources/bulk-operations-toolbar";
import { useSourceShortcuts, useBulkSelection } from "@/hooks/use-keyboard-shortcuts";
  import { CloudImportDialog } from "@/components/cloud/import-dialog";
import {
  useCloudIntegrations,
  useExportCloudFile,
} from "@/hooks/use-cloud-integrations";
import { CloudExportDialog } from "@/components/cloud/export-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {cn} from "@/lib/utils.ts";
import { useBulkTagSources } from "@/hooks/use-sources";

function getSourceIcon(kind: string, isPage?: boolean) {
  if (isPage) return <FileText className="w-5 h-5 text-blue-500" />;
  switch (kind) {
    case "url":
      return <LinkIcon className="w-5 h-5" />;
    case "youtube":
      return <Youtube className="w-5 h-5" />;
    case "image":
      return <ImageIcon className="w-5 h-5" />;
    case "video":
      return <Film className="w-5 h-5" />;
    default:
      return <FileText className="w-5 h-5" />;
  }
}

type DragItem = { type: "folder"; id: number } | { type: "source"; id: number; isPage?: boolean };

type SourceWithPage = Source & { isPage?: boolean; tags?: string[] };
type FolderPreviewItem = { id: number; title: string; kind: "document" | "file" };

function FolderCard({
  folder,
  onOpen,
  onDrop,
  onRename,
  onDelete,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  previewItems,
  folderSources,
  folderCount,
  assignedAgent,
  onAgentChange,
  viewMode = "grid",
}: {
  folder: Page;
  onOpen: () => void;
  onDrop: (item: DragItem) => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  previewItems: FolderPreviewItem[];
  folderSources: SourceWithPage[];
  folderCount?: number;
  assignedAgent?: { id: number; name: string; emoji: string; workflowId: number } | null;
  onAgentChange?: () => void;
  viewMode?: "grid" | "list";
}) {
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAssignAgentOpen, setIsAssignAgentOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(folder.title);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json")) as DragItem;
      // Prevent dropping folder into itself
      if (data.type === "folder" && data.id === folder.id) return;
      onDrop(data);
    } catch {
      // Invalid drop data
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    const title = `${folder.emoji ? `${folder.emoji} ` : ""}${folder.title}`;
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "folder", id: folder.id, title }),
    );
    e.dataTransfer.effectAllowed = "move";
    onDragStart();
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameTitle.trim()) {
      onRename(renameTitle.trim());
      setIsRenameOpen(false);
    }
  };

  // Convert sources to folder items for display
  const folderItems: FolderItem[] = useMemo(() => {
    return folderSources.slice(0, 4).map((source) => {
      // Map source kind to FolderItem kind
      let kind: FolderItem["kind"] = "file";
      if (source.isPage) {
        kind = "document";
      } else if (source.kind === "image") {
        kind = "image";
      } else if (source.kind === "video") {
        kind = "video";
      } else if (source.kind === "youtube") {
        kind = "youtube";
      } else if (source.kind === "url") {
        kind = "url";
      } else if (source.kind === "audio") {
        kind = "audio";
      } else if (source.kind === "text") {
        kind = "text";
      }

      // Get thumbnail URL for images/videos/youtube
      let thumbnailUrl: string | null = null;
      if (source.kind === "image" && source.mediaUrl) {
        thumbnailUrl = source.mediaUrl;
      } else if (source.kind === "youtube" && source.embedUrl) {
        // Extract YouTube video ID and use standard thumbnail
        const match = source.embedUrl.match(/[?&]v=([^&]+)/);
        if (match) {
          thumbnailUrl = `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
        }
      }

      return {
        id: source.id,
        title: source.title,
        kind,
        thumbnailUrl,
      };
    });
  }, [folderSources]);

  const folderDialogs = (
    <>
      <CloudExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        sourceId={folder.id}
        isPage={true}
        fileName={folder.title}
      />

      <AssignAgentDialog
        open={isAssignAgentOpen}
        onOpenChange={setIsAssignAgentOpen}
        folderId={folder.id}
        folderTitle={folder.title}
        onAssigned={() => {
          setIsAssignAgentOpen(false);
          onAgentChange?.();
        }}
      />

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Folder name"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{folder.title}"? All contents including subfolders and
              files will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (viewMode === "list") {
    return (
      <>
        <div
          draggable
          onDragStart={handleDragStart as any}
          onDragEnd={onDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer",
            isDragging && "opacity-50",
            isDropTarget && "bg-primary/5 ring-1 ring-primary/20"
          )}
          onClick={onOpen}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {folder.emoji ? <span className="text-base leading-none">{folder.emoji}</span> : <Folder className="h-4 w-4" />}
          </div>
          <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{folder.title}</span>
          <span className="hidden sm:block w-24 shrink-0 text-xs text-muted-foreground">Folder</span>
          <span className="hidden md:block w-36 shrink-0 text-xs text-muted-foreground">
            {(folderCount ?? folderSources.length)} {(folderCount ?? folderSources.length) === 1 ? "item" : "items"}
          </span>
          {assignedAgent ? (
            <span className="hidden lg:flex w-24 shrink-0 items-center gap-1 text-[10px] text-primary/80 truncate">
              <Bot className="h-3 w-3 shrink-0" />{assignedAgent.name}
            </span>
          ) : (
            <div className="hidden lg:block w-24 shrink-0" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsAssignAgentOpen(true); }}>
                <Bot className="h-4 w-4 mr-2 text-primary" />Assign Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsRenameOpen(true); }}>
                <Pencil className="h-4 w-4 mr-2" />Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsExportOpen(true); }}>
                <Cloud className="h-4 w-4 mr-2 text-blue-500" />Export to Cloud
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); setIsDeleteOpen(true); }}>
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {folderDialogs}
      </>
    );
  }

  return (
    <>
      <PhotoFolder
        items={folderItems}
        count={folderCount ?? folderSources.length}
        title={folder.title}
        emoji={folder.emoji}
        onClick={onOpen}
        onRename={() => setIsRenameOpen(true)}
        onDelete={() => setIsDeleteOpen(true)}
        onExport={() => setIsExportOpen(true)}
        onAssignAgent={() => setIsAssignAgentOpen(true)}
        agentBadge={assignedAgent ? `${assignedAgent.emoji || "✨"} ${assignedAgent.name}` : null}
        isDragging={isDragging}
        isDropTarget={isDropTarget || isDragOver}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
      {folderDialogs}
    </>
  );
}

function SourceCard({
  source,
  onRename,
  onDelete,
  onMove,
  isSelected,
  onSelect,
  isSelectionMode,
  viewMode = "grid",
}: {
  source: SourceWithPage;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onMove: (targetFolderId: number | null) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  isSelectionMode?: boolean;
  viewMode?: "grid" | "list";
}) {
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(source.title);
  const isPage = source.isPage ?? false;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "source", id: source.id, isPage, title: source.title }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameTitle.trim()) {
      onRename(renameTitle.trim());
      setIsRenameOpen(false);
    }
  };

  const linkHref = isPage ? `/pages/${source.id}` : `/sources/${source.id}`;
  const itemLabel = isPage ? "Document" : source.kind;

  const sourceDialogs = (
    <>
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {isPage ? "document" : "file"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder={isPage ? "Document name" : "File name"}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
              <Button type="submit">Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {isPage ? "document" : "file"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{source.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveDialog open={isMoveOpen} onOpenChange={setIsMoveOpen} currentFolderId={source.parentPageId} onMove={onMove} />
      <CloudExportDialog open={isExportOpen} onOpenChange={setIsExportOpen} sourceId={source.id} isPage={isPage} fileName={source.title} />
    </>
  );

  if (viewMode === "list") {
    return (
      <>
        <div
          draggable
          onDragStart={handleDragStart}
          className={cn(
            "group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors",
            isSelected && "bg-primary/5"
          )}
        >
          {(isSelectionMode || isSelected) && onSelect && (
            <Checkbox checked={isSelected} onCheckedChange={onSelect} className="h-4 w-4 shrink-0" />
          )}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
            {getSourceIcon(source.kind, isPage)}
          </div>
          <Link href={linkHref} className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground hover:underline truncate block">{source.title}</span>
          </Link>
          <span className="hidden sm:block w-24 shrink-0 text-xs text-muted-foreground capitalize">{itemLabel}</span>
          <span className="hidden md:block w-36 shrink-0 text-xs text-muted-foreground">
            {format(new Date(source.createdAt), "MMM d, yyyy")}
          </span>
          {!isPage ? (
            <Badge variant={source.status === "ready" ? "secondary" : "outline"} className="hidden lg:flex w-20 justify-center shrink-0 text-xs">
              {source.status}
            </Badge>
          ) : (
            <div className="hidden lg:block w-20 shrink-0" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsMoveOpen(true)}>
                <FolderOpen className="h-4 w-4 mr-2" />Move to...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsExportOpen(true)}>
                <Cloud className="h-4 w-4 mr-2 text-blue-500" />Export to Cloud
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsRenameOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setIsDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {sourceDialogs}
      </>
    );
  }

  return (
    <>
      <div draggable onDragStart={handleDragStart} className="group relative">
        <Card className={cn(
          "h-full border-border/80 bg-card/50 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md",
          isSelected && "border-primary ring-2 ring-primary/20"
        )}>
          <CardContent className="flex h-full flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(isSelectionMode || isSelected) && onSelect && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={onSelect}
                    className="h-5 w-5"
                  />
                )}
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
                  {getSourceIcon(source.kind, isPage)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isPage && (
                  <Badge variant={source.status === "ready" ? "secondary" : "outline"}>
                    {source.status}
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsMoveOpen(true)}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Move to...
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsExportOpen(true)}>
                      <Cloud className="h-4 w-4 mr-2 text-blue-500" />
                      Export to Cloud
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsRenameOpen(true)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setIsDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <Link href={linkHref} className="min-w-0">
              <div className="truncate font-medium text-foreground hover:underline">
                {source.title}
              </div>
            </Link>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{itemLabel}</span>
              {!isPage && (
                <>
                  <span>•</span>
                  <span>{source.chunkCount} chunks</span>
                </>
              )}
            </div>
            {source.tags && source.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {source.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border-none">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              {format(new Date(source.createdAt), "MMM d, yyyy")}
            </div>
          </CardContent>
        </Card>
      </div>
      {sourceDialogs}
    </>
  );
}

function MoveDialog({
  open,
  onOpenChange,
  currentFolderId,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFolderId: number | null;
  onMove: (targetFolderId: number | null) => void;
}) {
  const { data: pages } = useListPages();
  const folderPages =
    Array.isArray(pages) ? pages.filter((page) => page.kind === "folder") : [];

  const buildFolderTree = (parentId: number | null, excludeId?: number): Page[] => {
    return folderPages.filter(
      (f) => (f.parentId ?? null) === parentId && f.id !== excludeId
    );
  };

  const renderFolderTree = (parentId: number | null, level = 0, excludeId?: number) => {
    const folders = buildFolderTree(parentId, excludeId);
    return folders.map((folder) => (
      <div key={folder.id}>
        <button
          type="button"
          onClick={() => {
            onMove(folder.id);
            onOpenChange(false);
          }}
          className="w-full text-left px-3 py-2 hover:bg-accent rounded-md flex items-center gap-2 transition-colors"
          style={{ paddingLeft: `${12 + level * 16}px` }}>
          <Folder className="h-4 w-4 text-primary" />
          <span className="truncate">{folder.emoji ? `${folder.emoji} ` : ""}{folder.title}</span>
        </button>
        {renderFolderTree(folder.id, level + 1, excludeId)}
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription>Select a destination folder</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto py-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              onMove(null);
              onOpenChange(false);
            }}
            className={`w-full text-left px-3 py-2 hover:bg-accent rounded-md flex items-center gap-2 transition-colors ${
              currentFolderId === null ? "bg-accent" : ""
            }`}>
            <Database className="h-4 w-4 text-muted-foreground" />
            <span>My Drive (root)</span>
          </button>
          {renderFolderTree(null)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateFolderDialog({ parentId, open, onOpenChange }: { parentId: number | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const createPage = useCreatePage();
  const queryClient = useQueryClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPage.mutateAsync({
        data: {
          kind: "folder",
          title,
          parentId,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() }),
      ]);
      toast.success("Folder created");
      onOpenChange(false);
      setTitle("");
    } catch {
      toast.error("Failed to create folder");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTitle(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Folder name"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={createPage.isPending}>
            Create Folder
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateDocumentDialog({ parentId, open, onOpenChange }: { parentId: number | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const createPage = useCreatePage();
  const queryClient = useQueryClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPage.mutateAsync({
        data: {
          kind: "page",
          title,
          parentId,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() }),
      ]);
      toast.success("Document created");
      onOpenChange(false);
      setTitle("");
    } catch {
      toast.error("Failed to create document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTitle(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={createPage.isPending}>
            Create Document
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}


/** Keep `q` (and other params) when opening folders or returning to root. */
function sourcesPathForFolder(targetFolderId: number | null, clearSearch = true): string {
  const params = new URLSearchParams(window.location.search);
  if (clearSearch) {
    params.delete("q");
  }
  if (targetFolderId == null) {
    params.delete("folder");
  } else {
    params.set("folder", String(targetFolderId));
  }
  const qs = params.toString();
  return qs ? `/sources?${qs}` : "/sources";
}

export default function SourcesList() {
  // useListSources: full flat list, used for search filtering (shared cache with command palette)
  const { data: sources } = useListSources();
  const { data: pages, isLoading: pagesLoading } = useListPages();
  const { data: folderCounts } = useSourceFolderCounts();
  const { data: agents } = useListAgents();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();


  // Fetch workflows to build folder-agent map
  const { data: allWorkflows, refetch: refetchFolderAgents } = useQuery({
    queryKey: ["folder-agent-workflows"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{
        id: number;
        triggerConfig: Record<string, unknown>;
        actions: Array<{ type: string; config: Record<string, unknown> }>;
        isActive: boolean;
      }>>;
    },
  });

  const folderAgentMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string; emoji: string; workflowId: number }>();
    if (!allWorkflows || !agents) return map;
    for (const w of allWorkflows) {
      if (!w.isActive) continue;
      const tc = w.triggerConfig;
      const agentAction = w.actions?.find((a) => a.type === "ai_agent_process");
      if (tc?.folderId && agentAction?.config?.agentId) {
        const agent = agents.find((a) => a.id === agentAction.config?.agentId);
        if (agent) {
          map.set(Number(tc.folderId), {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji || "",
            workflowId: w.id,
          });
        }
      }
    }
    return map;
  }, [allWorkflows, agents]);

  // Mutations
  const updatePage = useUpdatePage();
  const deletePage = useDeletePage();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();
  const bulkTagSources = useBulkTagSources();

  // Drag state
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Action menu state
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [cloudImportOpen, setCloudImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() =>
    (localStorage.getItem("sources-view") as "grid" | "list") ?? "grid"
  );
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [sourceCreateOpen, setSourceCreateOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [folderId, setFolderId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Paginated folder data — primary data source for the folder view
  const { data: folderData, isLoading: folderLoading, isFetching: folderFetching } = useListSourcesInFolder(folderId, currentPage);

  // Reset to page 1 whenever the user navigates to a different folder
  useEffect(() => { setCurrentPage(1); }, [folderId]);

  // Search state
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") || "";
  });

  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      console.log("[SourcesList] Refreshing due to real-time update...");
      queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["sources", "folder-counts"] });
    };

    socket.on("job:completed", handleUpdate);
    socket.on("source:updated", handleUpdate);

    return () => {
      socket.off("job:completed", handleUpdate);
      socket.off("source:updated", handleUpdate);
    };
  }, [socket, queryClient]);

  const { data: searchResults, isLoading: searchLoading } = useSearchWorkspace(
    { q: searchQuery },
    { enabled: !!searchQuery.trim() },
  );

  // Keyboard shortcuts
  useSourceShortcuts({
    onSelectAll: () => {
      const allIds = childItems.map((item) => item.id);
      setSelectedIds(new Set(allIds));
      setIsSelectionMode(true);
    },
    onDelete: () => {
      if (selectedIds.size > 0) {
        handleBulkDelete();
      }
    },
    onMove: () => {
      if (selectedIds.size > 0) {
        // Show move dialog - we'll implement this inline
        toast.info("Move dialog opened");
      }
    },
    onRefresh: () => {
      queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
      toast.success("Refreshed");
    },
  });

  // Listen for custom events
  useEffect(() => {
    const handleClearSelection = () => {
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    };
    window.addEventListener("eden:clear-selection", handleClearSelection);
    return () => window.removeEventListener("eden:clear-selection", handleClearSelection);
  }, []);

  const handleNavigate = useCallback((targetFolderId: number | null) => {
    setLocation(sourcesPathForFolder(targetFolderId, true));
    setFolderId(targetFolderId);
    setSearchQuery("");
  }, [setLocation]);

  useEffect(() => {
    const syncParams = () => {
      const params = new URLSearchParams(window.location.search);
      
      // Sync folder
      const rawFolder = params.get("folder");
      const parsedFolder = rawFolder ? Number(rawFolder) : null;
      const nextFolderId = parsedFolder && Number.isFinite(parsedFolder) ? parsedFolder : null;
      if (nextFolderId !== folderId) setFolderId(nextFolderId);
      
      // Sync search
      const nextQ = params.get("q") || "";
      if (nextQ !== searchQuery) setSearchQuery(nextQ);
    };

    // Initial sync
    syncParams();

    // Sync on back/forward or custom event
    window.addEventListener("popstate", syncParams);
    window.addEventListener("eden:url-change", syncParams);
    return () => {
      window.removeEventListener("popstate", syncParams);
      window.removeEventListener("eden:url-change", syncParams);
    };
  }, [folderId, searchQuery]);

  const sourceList = Array.isArray(sources) ? sources : [];
  const pagedItems = folderData?.items ?? [];
  const totalItems = folderData?.total ?? 0;
  const totalPages = folderData?.totalPages ?? 1;

  const folderPages =
    Array.isArray(pages) ? pages.filter((page) => page.kind === "folder") : [];

  const currentFolder =
    folderId == null ? null : (
      (folderPages.find((folder) => folder.id === folderId) ?? null)
    );

  const childFolders = useMemo(() => {
    if (searchQuery.trim()) {
      if (!searchResults) return [];
      const pageIds = new Set(
        searchResults
          .filter((h) => h.kind === "page" || h.kind === "block")
          .map((h) => h.pageId || h.refId)
      );
      return folderPages.filter((p) => pageIds.has(p.id));
    }
    return folderPages
      .filter((folder) => (folder.parentId ?? null) === folderId)
      .sort((a, b) =>
        a.position === b.position ? a.id - b.id : a.position - b.position
      );
  }, [folderId, folderPages, searchQuery, searchResults]);

  const childItems = useMemo(() => {
    if (searchQuery.trim()) {
      if (!searchResults) return [];
      const sourceIds = new Set(
        searchResults
          .filter((h) => h.kind === "source" || h.kind === "chunk")
          .map((h) => h.sourceId || h.refId)
      );
      return (sourceList as SourceWithPage[]).filter((s) => sourceIds.has(s.id));
    }
    return pagedItems as SourceWithPage[];
  }, [pagedItems, sourceList, searchQuery, searchResults]);

  // Separate documents (pages) and files (sources)
  const childDocuments = useMemo(
    () => childItems.filter((item: SourceWithPage) => item.isPage),
    [childItems],
  );

  const childFiles = useMemo(
    () => childItems.filter((item: SourceWithPage) => !item.isPage),
    [childItems],
  );

  const breadcrumbs = useMemo(() => {
    const chain: Array<{ id: number | null; title: string }> = [
      { id: null, title: "My Drive" },
    ];

    if (!currentFolder) return chain;

    const byId = new Map(folderPages.map((folder) => [folder.id, folder]));
    const stack: Page[] = [];
    let cursor: Page | undefined = currentFolder;

    while (cursor) {
      stack.unshift(cursor);
      cursor = cursor.parentId == null ? undefined : byId.get(cursor.parentId);
    }

    for (const folder of stack) {
      chain.push({ id: folder.id, title: folder.title });
    }

    return chain;
  }, [currentFolder, folderPages]);

  // Folder operations
  const handleFolderRename = useCallback(
    async (folderId: number, newTitle: string) => {
      try {
        await updatePage.mutateAsync({
          id: folderId,
          data: { title: newTitle },
        });
        await queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
        toast.success("Folder renamed");
      } catch {
        toast.error("Failed to rename folder");
      }
    },
    [updatePage, queryClient],
  );

  const handleFolderDelete = useCallback(
    async (folderId: number) => {
      try {
        await deletePage.mutateAsync({ id: folderId });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() }),
        ]);
        toast.success("Folder deleted");
      } catch {
        toast.error("Failed to delete folder");
      }
    },
    [deletePage, queryClient],
  );

  const handleFolderDrop = useCallback(
    async (targetFolderId: number, item: DragItem) => {
      try {
        if (item.type === "folder") {
          // Move folder into another folder
          await updatePage.mutateAsync({
            id: item.id,
            data: { parentId: targetFolderId },
          });
        } else {
          // Move source into folder
          await updateSource.mutateAsync({
            id: item.id,
            data: { parentPageId: targetFolderId },
          });
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() }),
        ]);
        toast.success(item.type === "folder" ? "Folder moved" : "File moved");
      } catch (err: unknown) {
        const errorMessage = err instanceof Error && err.message.includes("circular")
          ? "Cannot move a folder into its own subfolder"
          : `Failed to move ${item.type}`;
        toast.error(errorMessage);
      }
    },
    [updatePage, updateSource, queryClient],
  );

  // Source operations
  const handleSourceRename = useCallback(
    async (sourceId: number, newTitle: string) => {
      try {
        await updateSource.mutateAsync({
          id: sourceId,
          data: { title: newTitle },
        });
        await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
        toast.success("File renamed");
      } catch {
        toast.error("Failed to rename file");
      }
    },
    [updateSource, queryClient],
  );

  const handleSourceDelete = useCallback(
    async (sourceId: number) => {
      try {
        await deleteSource.mutateAsync({ id: sourceId });
        await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
        toast.success("File deleted");
      } catch {
        toast.error("Failed to delete file");
      }
    },
    [deleteSource, queryClient],
  );

  const handleSourceMove = useCallback(
    async (sourceId: number, targetFolderId: number | null) => {
      try {
        await updateSource.mutateAsync({
          id: sourceId,
          data: { parentPageId: targetFolderId },
        });
        await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
        toast.success("File moved");
      } catch {
        toast.error("Failed to move file");
      }
    },
    [updateSource, queryClient],
  );

  // Bulk operations
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    let successCount = 0;

    for (const id of ids) {
      try {
        await deleteSource.mutateAsync({ id });
        successCount++;
      } catch {
        // Continue with others
      }
    }

    await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
    setSelectedIds(new Set());
    toast.success(`Deleted ${successCount} items`);
  }, [selectedIds, deleteSource, queryClient]);

  const handleBulkMove = useCallback(async (targetFolderId: number | null) => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    let successCount = 0;

    for (const id of ids) {
      try {
        await updateSource.mutateAsync({
          id,
          data: { parentPageId: targetFolderId },
        });
        successCount++;
      } catch {
        // Continue with others
      }
    }

    await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
    setSelectedIds(new Set());
    toast.success(`Moved ${successCount} items`);
  }, [selectedIds, updateSource, queryClient]);

  const handleBulkTag = useCallback(async (tags: string[]) => {
    if (selectedIds.size === 0) return;
    
    try {
      const ids = Array.from(selectedIds);
      await bulkTagSources.mutateAsync({ ids, tags });
      toast.success(`Tagged ${ids.length} items`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to tag items");
    }
  }, [selectedIds, bulkTagSources]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
    setIsSelectionMode(true);
  }, []);

  // Root drop zone handler (for dropping to current folder)
  const handleRootDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const data = JSON.parse(e.dataTransfer.getData("application/json")) as DragItem;
        if (data.type === "source") {
          // Move source to current folder
          await updateSource.mutateAsync({
            id: data.id,
            data: { parentPageId: folderId },
          });
          await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          toast.success("File moved");
        }
      } catch {
        // Invalid drop or not a source
      }
    },
    [folderId, updateSource, queryClient],
  );

  const isLoading = folderLoading || pagesLoading;

  if (folderId != null && !currentFolder && !isLoading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-lg font-medium">Folder not found</div>
            <div className="mt-2 text-sm text-muted-foreground">
              The requested folder does not exist.
            </div>
            <Button className="mt-4" onClick={() => setLocation(sourcesPathForFolder(null))}>
              Back to My Drive
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-gradient-to-b from-muted/30 via-background to-background"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleRootDrop}>
      <div className="mx-auto max-w-7xl px-6 py-5 space-y-5 animate-in fade-in duration-500">
        {/* Slim header bar */}
        <div className="flex items-center gap-3 border-b border-border/40 pb-5">
          {/* Left: icon + breadcrumb + title */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <HardDrive className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              {breadcrumbs.length > 1 && (
                <div className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {breadcrumbs.map((crumb, index) => (
                    <div key={`${crumb.id ?? "root"}-${index}`} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                      <button
                        type="button"
                        onClick={() => handleNavigate(crumb.id)}
                        className="truncate text-left transition-colors hover:text-foreground"
                      >
                        {crumb.title}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold text-foreground">
                  {searchQuery.trim() ? `"${searchQuery}"` : (currentFolder ? currentFolder.title : "My Drive")}
                </h1>
                {(folderFetching && !folderLoading && !searchQuery.trim()) && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
                {(searchQuery.trim() && searchLoading) && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          {/* Center: search */}
          <div className="hidden sm:block flex-1 max-w-sm">
            <WorkspaceSearchPanel className="max-w-none" />
          </div>

          {/* Right: stats + actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {!searchQuery.trim() && (
              <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground mr-1">
                <span>{childFolders.length} folders</span>
                <span className="opacity-40">·</span>
                <span>{totalItems} items</span>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
              onClick={() => {
                const next = viewMode === "grid" ? "list" : "grid";
                setViewMode(next);
                localStorage.setItem("sources-view", next);
              }}
            >
              {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsSelectionMode(!isSelectionMode)}
              className={cn(isSelectionMode && "bg-primary/10 text-primary")}
            >
              <CheckSquare className="h-4 w-4 mr-1.5" />
              {isSelectionMode ? "Done" : "Select"}
            </Button>

            <div className="relative" ref={actionMenuRef}>
              <Button
                variant="outline"
                onClick={() => setActionMenuOpen((v) => !v)}
                className={cn(actionMenuOpen && "border-primary/40 bg-primary/10 text-primary")}
              >
                <Plus className={cn("h-4 w-4 mr-1.5 transition-transform duration-200", actionMenuOpen && "rotate-45")} />
                New
                <ChevronDown className={cn("ml-1.5 h-3 w-3 transition-transform duration-200", actionMenuOpen && "-rotate-180")} />
              </Button>

              <AnimatePresence>
                {actionMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 top-full z-50 mt-2 min-w-[190px] overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl"
                  >
                    {(
                      [
                        {
                          label: "New Folder",
                          node: (
                            <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onClick={() => { setCreateFolderOpen(true); setActionMenuOpen(false); }}>
                              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                              New Folder
                            </button>
                          ),
                        },
                        {
                          label: "New Doc",
                          node: (
                            <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onClick={() => { setCreateDocOpen(true); setActionMenuOpen(false); }}>
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              New Doc
                            </button>
                          ),
                        },
                        {
                          label: "Add File",
                          node: (
                            <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground" onClick={() => { setSourceCreateOpen(true); setActionMenuOpen(false); }}>
                              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                              Add File
                            </button>
                          ),
                        },
                        {
                          label: "Import from Cloud",
                          node: (
                            <button
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                              onClick={() => { setCloudImportOpen(true); setActionMenuOpen(false); }}
                            >
                              <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" />
                              Import from Cloud
                            </button>
                          ),
                        },
                      ] as const
                    ).map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.12, ease: "easeOut" }}
                      >
                        {item.node}
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <CloudImportDialog
              open={cloudImportOpen}
              onOpenChange={setCloudImportOpen}
              targetPageId={folderId ?? undefined}
            />

            <CreateFolderDialog
              parentId={folderId}
              open={createFolderOpen}
              onOpenChange={setCreateFolderOpen}
            />

            <CreateDocumentDialog
              parentId={folderId}
              open={createDocOpen}
              onOpenChange={setCreateDocOpen}
            />

            <SourceCreateDialog
              open={sourceCreateOpen}
              onOpenChange={setSourceCreateOpen}
              defaultParentPageId={folderId}
              lockParentPageId
              parentKinds={["folder"]}
              titleText={currentFolder ? `Add source to ${currentFolder.title}` : "Add source to My Drive"}
            />
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden">
          <WorkspaceSearchPanel className="max-w-none" />
        </div>

        {isLoading || (searchQuery.trim() && searchLoading) ?
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          )
        : childFolders.length === 0 && childDocuments.length === 0 && childFiles.length === 0 ?
          <Card className="border-dashed border-border/80 bg-card/40 shadow-sm">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                <HardDrive className="h-7 w-7 opacity-70" />
              </div>
              <div className="text-xl font-medium">
                {currentFolder ? "This folder is empty" : "Your drive is empty"}
              </div>
              <div className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Create folders, documents, and upload files. Use search above to find content anywhere
                in your workspace.
              </div>
            </CardContent>
          </Card>
        : <div className={cn("space-y-6 transition-opacity duration-200", folderFetching && !folderLoading && "opacity-60 pointer-events-none")}>
            {/* List view column header */}
            {viewMode === "list" && (
              <div className="flex items-center gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/60 select-none">
                <div className="w-8 shrink-0" />
                <span className="flex-1">Name</span>
                <span className="hidden sm:block w-24 shrink-0">Kind</span>
                <span className="hidden md:block w-36 shrink-0">Date modified</span>
                <span className="hidden lg:block w-20 shrink-0">Status</span>
                <div className="w-7 shrink-0" />
              </div>
            )}

            {childFolders.length > 0 ?
              <section>
                {viewMode === "grid" && (
                  <div className="mb-4 text-sm font-medium text-muted-foreground">Folders</div>
                )}
                <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "space-y-0.5"}>
                  {childFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onOpen={() => handleNavigate(folder.id)}
                      onDrop={(item) => handleFolderDrop(folder.id, item)}
                      onRename={(newTitle) => handleFolderRename(folder.id, newTitle)}
                      onDelete={() => handleFolderDelete(folder.id)}
                      isDragging={draggingId === folder.id}
                      isDropTarget={dropTargetId === folder.id}
                      onDragStart={() => setDraggingId(folder.id)}
                      onDragEnd={() => { setDraggingId(null); setDropTargetId(null); }}
                      previewItems={[]}
                      folderSources={[]}
                      folderCount={folderCounts?.[folder.id] ?? 0}
                      assignedAgent={folderAgentMap.get(folder.id) ?? null}
                      onAgentChange={() => refetchFolderAgents()}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </section>
            : null}

            {childDocuments.length > 0 ?
              <section>
                {viewMode === "grid" && (
                  <div className="mb-4 text-sm font-medium text-muted-foreground">Documents</div>
                )}
                <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "space-y-0.5"}>
                  {childDocuments.map((doc) => (
                    <SourceCard
                      key={doc.id}
                      source={doc}
                      onRename={(newTitle) => handleSourceRename(doc.id, newTitle)}
                      onDelete={() => handleSourceDelete(doc.id)}
                      onMove={(targetFolderId) => handleSourceMove(doc.id, targetFolderId)}
                      isSelected={selectedIds.has(doc.id)}
                      onSelect={() => toggleSelection(doc.id)}
                      isSelectionMode={isSelectionMode}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </section>
            : null}

            {childFiles.length > 0 ?
              <section>
                {viewMode === "grid" && (
                  <div className="mb-4 text-sm font-medium text-muted-foreground">Files</div>
                )}
                <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "space-y-0.5"}>
                  {childFiles.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      onRename={(newTitle) => handleSourceRename(source.id, newTitle)}
                      onDelete={() => handleSourceDelete(source.id)}
                      onMove={(targetFolderId) => handleSourceMove(source.id, targetFolderId)}
                      isSelected={selectedIds.has(source.id)}
                      onSelect={() => toggleSelection(source.id)}
                      isSelectionMode={isSelectionMode}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </section>
            : null}
          </div>
        }

        {/* Pagination */}
        {!searchQuery.trim() && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 1 || folderLoading}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {currentPage} of {totalPages}
              <span className="ml-2 opacity-60">({totalItems} items)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage === totalPages || folderLoading}
            >
              Next
            </Button>
          </div>
        )}

        {/* Bulk Operations Toolbar */}
        <BulkOperationsToolbar
          selectedCount={selectedIds.size}
          totalCount={childItems.length}
          onClearSelection={() => {
            setSelectedIds(new Set());
            setIsSelectionMode(false);
          }}
          onSelectAll={() => {
            const allIds = childItems.map((item) => item.id);
            setSelectedIds(new Set(allIds));
          }}
          onDelete={handleBulkDelete}
          onMove={handleBulkMove}
          onTag={handleBulkTag}
          availableFolders={folderPages.map((f) => ({ id: f.id, title: f.title, emoji: undefined }))}
          folderPages={folderPages.map((f) => ({ id: f.id, title: f.title, kind: f.kind, parentId: f.parentId, emoji: f.emoji }))}
          selectedSourceIds={Array.from(selectedIds)}
        />
      </div>
    </div>
  );
}
