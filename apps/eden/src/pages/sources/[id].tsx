import { useGetSource, useDeleteSource, getListSourcesQueryKey } from "@/hooks/use-sources";
import { useCreateConversation, getListConversationsQueryKey } from "@/hooks/use-conversations";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2, ArrowLeft, MessageSquare, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function SourceDetail({ params }: { params: { id: string } }) {
  const sourceId = parseInt(params.id);
  const { data: source, isLoading } = useGetSource(sourceId);
  const deleteSource = useDeleteSource();
  const createConversation = useCreateConversation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);

  const handleChatAbout = () => {
    createConversation.mutate(
      { data: { title: source?.title ?? "New Conversation" } },
      {
        onSuccess: (c) => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          sessionStorage.setItem(`chat-prefill-${c.id}`, JSON.stringify({ type: "source", id: sourceId, title: source?.title }));
          setLocation(`/chat/${c.id}`);
        },
      },
    );
  };

  const handleDelete = () => {
    deleteSource.mutate({ id: sourceId }, {
      onSuccess: () => {
        toast.success("Source deleted");
        queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
        setLocation("/sources");
      },
      onError: () => toast.error("Failed to delete source"),
    });
  };

  if (isLoading) {
    return <div className="p-8 max-w-4xl mx-auto space-y-6"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!source) {
    return <div className="p-8 text-center text-muted-foreground">Source not found</div>;
  }

  const chunkList = source.chunks?.length
    ? source.chunks
    : source.content
      ? [{ id: 0, sourceId, position: 0, content: source.content }]
      : [];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/sources")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{source.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline" className="capitalize">{source.kind}</Badge>
            <Badge variant={source.status === "ready" ? "secondary" : "outline"}>{source.status}</Badge>
            <span>{format(new Date(source.createdAt), "MMM d, yyyy")}</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleChatAbout}
          disabled={createConversation.isPending || source.status !== "ready"}
          className="gap-1.5"
        >
          <MessageSquare className="w-4 h-4" />
          Chat about this
        </Button>
        <Button variant="destructive" size="icon" onClick={() => setDeleteOpen(true)} disabled={deleteSource.isPending}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {source.kind === "youtube" && source.embedUrl && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Video</CardTitle></CardHeader>
          <CardContent>
            <div className="aspect-video overflow-hidden rounded-lg border bg-black">
              <iframe
                src={source.embedUrl}
                title={source.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </CardContent>
        </Card>
      )}

      {source.kind === "image" && source.mediaUrl && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Image</CardTitle></CardHeader>
          <CardContent>
            <img
              src={source.mediaUrl}
              alt={source.title}
              className="max-h-[32rem] w-full rounded-lg border object-contain bg-muted"
            />
          </CardContent>
        </Card>
      )}

      {source.kind === "video" && source.mediaUrl && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Video</CardTitle></CardHeader>
          <CardContent>
            <video
              src={source.mediaUrl}
              controls
              className="max-h-[32rem] w-full rounded-lg border bg-black"
            />
          </CardContent>
        </Card>
      )}

      {source.url && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">URL</CardTitle></CardHeader>
          <CardContent><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{source.url}</a></CardContent>
        </Card>
      )}

      {source.summary && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary prose-code:text-foreground prose-li:marker:text-muted-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {source.summary}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {chunkList.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setContentOpen((v) => !v)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm text-muted-foreground">Indexed Content</CardTitle>
                <span className="text-xs text-muted-foreground/60">
                  {chunkList.length} {chunkList.length === 1 ? "chunk" : "chunks"}
                </span>
              </div>
              {contentOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {contentOpen && (
            <CardContent className="pt-0 space-y-3">
              {chunkList.map((chunk, i) => (
                <div key={chunk.id ?? i} className="rounded-md border bg-muted/40 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                    Chunk {i + 1}
                  </p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this source?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{source.title}&rdquo; and all its indexed content will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteSource.isPending} onClick={handleDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
