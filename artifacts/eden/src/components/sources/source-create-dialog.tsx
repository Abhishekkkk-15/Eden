import { ReactNode, useMemo, useState } from "react";
import {
  getListSourcesQueryKey,
  useCreateSource,
  useListPages,
  type CreateSourceInputKind,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

type SourceCreateDialogProps = {
  trigger: ReactNode;
  defaultParentPageId?: number | null;
  lockParentPageId?: boolean;
  titleText?: string;
  parentKinds?: Array<"page" | "folder">;
};

export function SourceCreateDialog({
  trigger,
  defaultParentPageId = null,
  lockParentPageId = false,
  titleText = "Add a new source",
  parentKinds = ["page", "folder"],
}: SourceCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CreateSourceInputKind>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parentPageId, setParentPageId] = useState<string>(
    defaultParentPageId == null ? "__root__" : String(defaultParentPageId),
  );

  const queryClient = useQueryClient();
  const createSource = useCreateSource();
  const { data: pages } = useListPages();
  const pageList = Array.isArray(pages) ? pages : [];

  const availableParents = useMemo(
    () => pageList.filter((page) => parentKinds.includes(page.kind)),
    [pageList, parentKinds],
  );

  const resetForm = () => {
    setKind("text");
    setTitle("");
    setContent("");
    setUrl("");
    setFile(null);
    setParentPageId(defaultParentPageId == null ? "__root__" : String(defaultParentPageId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let fileDataUrl: string | undefined;
      if (kind === "image" || kind === "video" || kind === "audio") {
        if (!file) {
          toast.error("Select a file to upload");
          return;
        }
        fileDataUrl = await fileToDataUrl(file);
      }

      await createSource.mutateAsync({
        data: {
          kind,
          title,
          content: kind === "text" ? content : undefined,
          url: kind === "url" || kind === "youtube" ? url : undefined,
          parentPageId:
            parentPageId === "__root__" ? null : Number(parentPageId),
          fileDataUrl,
          originalFilename: file?.name,
          mediaMimeType: file?.type,
        },
      });

      await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      toast.success("Source added");
      setOpen(false);
      resetForm();
    } catch {
      toast.error("Failed to add source");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(val: CreateSourceInputKind) => setKind(val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text Snippet</SelectItem>
                <SelectItem value="url">Web URL</SelectItem>
                <SelectItem value="youtube">YouTube URL</SelectItem>
                <SelectItem value="image">Image Upload</SelectItem>
                <SelectItem value="video">Video Upload</SelectItem>
                <SelectItem value="audio">Audio Upload</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Research Notes"
            />
          </div>

          {!lockParentPageId && (
            <div className="space-y-2">
              <Label>Store In</Label>
              <Select value={parentPageId} onValueChange={setParentPageId}>
                <SelectTrigger><SelectValue placeholder="Root workspace" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">Root workspace</SelectItem>
                  {availableParents.map((page) => (
                    <SelectItem key={page.id} value={String(page.id)}>
                      {page.kind === "folder" ? "Folder: " : "Page: "}{page.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "text" && (
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={5}
              />
            </div>
          )}

          {(kind === "url" || kind === "youtube") && (
            <div className="space-y-2">
              <Label>{kind === "youtube" ? "YouTube URL" : "URL"}</Label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder={
                  kind === "youtube"
                    ? "https://www.youtube.com/watch?v=..."
                    : "https://..."
                }
              />
            </div>
          )}

          {(kind === "image" || kind === "video" || kind === "audio") && (
            <div className="space-y-2">
              <Label>
                {kind === "image" ? "Image File" : kind === "audio" ? "Audio File" : "Video File"}
              </Label>
              <Input
                type="file"
                accept={kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : "video/*"}
                required
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] ?? null;
                  setFile(nextFile);
                  if (nextFile && !title.trim()) {
                    setTitle(nextFile.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {kind === "image"
                  ? "Image files are stored as sources and indexed for search."
                  : kind === "audio"
                  ? "Audio files are transcribed using Whisper and indexed for search."
                  : "Video files are stored as sources and transcribed when supported by the backend."}
              </p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={createSource.isPending}>
            Add Source
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
