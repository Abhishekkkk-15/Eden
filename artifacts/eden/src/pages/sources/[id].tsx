import { useGetSource, useDeleteSource, getGetSourceQueryKey, getListSourcesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SourceDetail({ params }: { params: { id: string } }) {
  const sourceId = parseInt(params.id);
  const { data: source, isLoading } = useGetSource(sourceId, { query: { enabled: !!sourceId, queryKey: getGetSourceQueryKey(sourceId) } });
  const deleteSource = useDeleteSource();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this source?")) {
      deleteSource.mutate({ id: sourceId }, {
        onSuccess: () => {
          toast.success("Source deleted");
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          setLocation("/sources");
        },
        onError: () => toast.error("Failed to delete source")
      });
    }
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
        <Button variant="destructive" size="icon" onClick={handleDelete} disabled={deleteSource.isPending}>
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
          <CardContent><p className="text-sm leading-relaxed">{source.summary}</p></CardContent>
        </Card>
      )}

      {/* Indexed Content removed per user request */}
    </div>
  );
}
