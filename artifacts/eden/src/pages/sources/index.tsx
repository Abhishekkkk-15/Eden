import { useMemo, useState, useCallback, useEffect } from "react";
import {
  getListPagesQueryKey,
  getListSourcesQueryKey,
  useCreatePage,
  useListPages,
  useListSources,
  useUpdatePage,
  useDeletePage,
  useUpdateSource,
  useDeleteSource,
  type Page,
  type Source,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ChevronRight,
  Database,
  FileText,
  Film,
  Folder,
  HardDrive,
  ImageIcon,
  Link as LinkIcon,
  Plus,
  Youtube,
  MoreVertical,
  Pencil,
  Trash2,
  FolderOpen,
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
  DialogTrigger,
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
import { toast } from "sonner";

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

type SourceWithPage = Source & { isPage?: boolean };

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
}) {
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
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
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "folder", id: folder.id }));
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

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative ${isDragging ? "opacity-50" : ""}`}>
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left">
          <Card
            className={`h-full border-border/80 bg-card/50 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md ${
              isDragOver || isDropTarget ? "ring-2 ring-primary ring-offset-2" : ""
            }`}>
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Folder className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRenameOpen(true);
                        }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsDeleteOpen(true);
                        }}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
              <div>
                <div className="truncate font-medium text-foreground">
                  {folder.emoji ? `${folder.emoji} ` : ""}
                  {folder.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Folder</div>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

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
}

function SourceCard({
  source,
  onRename,
  onDelete,
  onMove,
}: {
  source: Source & { isPage?: boolean };
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onMove: (targetFolderId: number | null) => void;
}) {
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(source.title);
  const isPage = source.isPage ?? false;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "source", id: source.id, isPage }));
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

  return (
    <>
      <div draggable onDragStart={handleDragStart} className="group relative">
        <Card className="h-full border-border/80 bg-card/50 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md">
          <CardContent className="flex h-full flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
                {getSourceIcon(source.kind, isPage)}
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
            <div className="mt-2 text-xs text-muted-foreground">
              {format(new Date(source.createdAt), "MMM d, yyyy")}
            </div>
          </CardContent>
        </Card>
      </div>

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
            <DialogTitle>Delete {isPage ? "document" : "file"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{source.title}"? This action cannot be undone.
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

      <MoveDialog
        open={isMoveOpen}
        onOpenChange={setIsMoveOpen}
        currentFolderId={source.parentPageId}
        onMove={onMove}
      />
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

function CreateFolderDialog({ parentId }: { parentId: number | null }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setTitle("");
    } catch {
      toast.error("Failed to create folder");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Folder className="h-4 w-4 mr-1.5" /> New Folder
        </Button>
      </DialogTrigger>
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

function CreateDocumentDialog({ parentId }: { parentId: number | null }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setTitle("");
    } catch {
      toast.error("Failed to create document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="h-4 w-4 mr-1.5" /> New Doc
        </Button>
      </DialogTrigger>
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
function sourcesPathForFolder(targetFolderId: number | null): string {
  const params = new URLSearchParams(window.location.search);
  if (targetFolderId == null) {
    params.delete("folder");
  } else {
    params.set("folder", String(targetFolderId));
  }
  const qs = params.toString();
  return qs ? `/sources?${qs}` : "/sources";
}

export default function SourcesList() {
  const { data: sources, isLoading: sourcesLoading } = useListSources();
  const { data: pages, isLoading: pagesLoading } = useListPages();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Mutations
  const updatePage = useUpdatePage();
  const deletePage = useDeletePage();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();

  // Drag state
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  const [folderId, setFolderId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("folder");
    const parsed = raw ? Number(raw) : null;
    setFolderId(parsed && Number.isFinite(parsed) ? parsed : null);
  }, [location]); // Re-run when route changes

  const sourceList = Array.isArray(sources) ? sources : [];
  const folderPages =
    Array.isArray(pages) ? pages.filter((page) => page.kind === "folder") : [];

  const currentFolder =
    folderId == null ? null : (
      (folderPages.find((folder) => folder.id === folderId) ?? null)
    );

  const childFolders = useMemo(
    () =>
      folderPages
        .filter((folder) => (folder.parentId ?? null) === folderId)
        .sort((a, b) =>
          a.position === b.position ? a.id - b.id : a.position - b.position,
        ),
    [folderId, folderPages],
  );

  const childItems = useMemo(
    () =>
      (sourceList as SourceWithPage[]).filter((source) => (source.parentPageId ?? null) === folderId),
    [folderId, sourceList],
  );

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

  const isLoading = sourcesLoading || pagesLoading;

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
      <div className="mx-auto max-w-7xl px-8 py-8 space-y-8 animate-in fade-in duration-500">
        <div className="rounded-2xl border border-border/60 bg-card/30 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-inner sm:flex">
                <HardDrive className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {breadcrumbs.map((crumb, index) => (
                    <div
                      key={`${crumb.id ?? "root"}-${index}`}
                      className="flex items-center gap-2">
                      {index > 0 ?
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      : null}
                      <button
                        type="button"
                        onClick={() => setLocation(sourcesPathForFolder(crumb.id))}
                        className="truncate text-left hover:text-foreground transition-colors">
                        {crumb.title}
                      </button>
                    </div>
                  ))}
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {currentFolder ? currentFolder.title : "My Drive"}
                </h1>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Organize folders, documents, and files in one library. Everything here can be
                  searched and used in chat. Drag items to move them.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <CreateFolderDialog parentId={folderId} />
              <CreateDocumentDialog parentId={folderId} />
              <SourceCreateDialog
                defaultParentPageId={folderId}
                lockParentPageId
                parentKinds={["folder"]}
                titleText={
                  currentFolder ?
                    `Add source to ${currentFolder.title}`
                  : "Add source to My Drive"
                }
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-1.5" /> Add File
                  </Button>
                }
              />
            </div>
          </div>

          <div className="mt-8 border-t border-border/50 pt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Search workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Full-text search across pages, sources, and chunks.
            </p>
            <div className="mt-4">
              <WorkspaceSearchPanel />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/80 bg-card/50 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Folder className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {childFolders.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Folders here
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card/50 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {childDocuments.length}
                </div>
                <div className="text-sm text-muted-foreground">Documents</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card/50 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {childFiles.length}
                </div>
                <div className="text-sm text-muted-foreground">Files</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ?
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
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
        : <div className="space-y-8">
            {childFolders.length > 0 ?
              <section>
                <div className="mb-4 text-sm font-medium text-muted-foreground">
                  Folders
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {childFolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onOpen={() => setLocation(sourcesPathForFolder(folder.id))}
                      onDrop={(item) => handleFolderDrop(folder.id, item)}
                      onRename={(newTitle) => handleFolderRename(folder.id, newTitle)}
                      onDelete={() => handleFolderDelete(folder.id)}
                      isDragging={draggingId === folder.id}
                      isDropTarget={dropTargetId === folder.id}
                      onDragStart={() => setDraggingId(folder.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropTargetId(null);
                      }}
                    />
                  ))}
                </div>
              </section>
            : null}

            {childDocuments.length > 0 ?
              <section>
                <div className="mb-4 text-sm font-medium text-muted-foreground">
                  Documents
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {childDocuments.map((doc) => (
                    <SourceCard
                      key={doc.id}
                      source={doc}
                      onRename={(newTitle) => handleSourceRename(doc.id, newTitle)}
                      onDelete={() => handleSourceDelete(doc.id)}
                      onMove={(targetFolderId) => handleSourceMove(doc.id, targetFolderId)}
                    />
                  ))}
                </div>
              </section>
            : null}

            {childFiles.length > 0 ?
              <section>
                <div className="mb-4 text-sm font-medium text-muted-foreground">
                  Files
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {childFiles.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      onRename={(newTitle) => handleSourceRename(source.id, newTitle)}
                      onDelete={() => handleSourceDelete(source.id)}
                      onMove={(targetFolderId) => handleSourceMove(source.id, targetFolderId)}
                    />
                  ))}
                </div>
              </section>
            : null}
          </div>
        }
      </div>
    </div>
  );
}
