import { useMemo, useState } from "react";
import {
  getListPagesQueryKey,
  getListSourcesQueryKey,
  useCreatePage,
  useListPages,
  useListSources,
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
  Grid2X2,
  ImageIcon,
  Link as LinkIcon,
  Plus,
  Youtube,
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
} from "@/components/ui/dialog";
import { SourceCreateDialog } from "@/components/sources/source-create-dialog";
import { toast } from "sonner";

function getSourceIcon(kind: string) {
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

function FolderCard({ folder, onOpen }: { folder: Page; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <Card className="h-full border-border bg-card/50 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Folder className="h-6 w-6" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <Link href={`/sources/${source.id}`}>
      <Card className="h-full cursor-pointer border-border bg-card/50 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
              {getSourceIcon(source.kind)}
            </div>
            <Badge
              variant={source.status === "ready" ? "secondary" : "outline"}>
              {source.status}
            </Badge>
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {source.title}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{source.kind}</span>
              <span>•</span>
              <span>{source.chunkCount} chunks</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {format(new Date(source.createdAt), "MMM d, yyyy")}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
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

export default function SourcesList() {
  const { data: sources, isLoading: sourcesLoading } = useListSources();
  const { data: pages, isLoading: pagesLoading } = useListPages();
  const [location, setLocation] = useLocation();

  const folderId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("folder");
    const parsed = raw ? Number(raw) : null;
    return parsed && Number.isFinite(parsed) ? parsed : null;
  }, [location]);

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

  const childFiles = useMemo(
    () =>
      sourceList.filter((source) => (source.parentPageId ?? null) === folderId),
    [folderId, sourceList],
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
            <Button className="mt-4" onClick={() => setLocation("/sources")}>
              Back to My Drive
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background/50">
      <div className="mx-auto max-w-7xl px-8 py-8 space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <div
                  key={`${crumb.id ?? "root"}-${index}`}
                  className="flex items-center gap-2">
                  {index > 0 ?
                    <ChevronRight className="h-3.5 w-3.5" />
                  : null}
                  <button
                    type="button"
                    onClick={() =>
                      setLocation(
                        crumb.id == null ?
                          "/sources"
                        : `/sources?folder=${crumb.id}`,
                      )
                    }
                    className="hover:text-foreground transition-colors">
                    {crumb.title}
                  </button>
                </div>
              ))}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {currentFolder ? currentFolder.title : "My Drive"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Folders and source files with search-ready content.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CreateFolderDialog parentId={folderId} />
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

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Folder className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {childFolders.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Folders here
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {childFiles.length}
                </div>
                <div className="text-sm text-muted-foreground">Files here</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Grid2X2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {childFiles.reduce((sum, file) => sum + file.chunkCount, 0)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Indexed chunks
                </div>
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
        : childFolders.length === 0 && childFiles.length === 0 ?
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="py-16 text-center">
              <Database className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
              <div className="text-xl font-medium">
                {currentFolder ? "This folder is empty" : "Your drive is empty"}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Create folders and upload files to organize your source library.
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
                      onOpen={() => setLocation(`/sources?folder=${folder.id}`)}
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
                    <SourceCard key={source.id} source={source} />
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
