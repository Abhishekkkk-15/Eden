import { ReactNode, useMemo, useState } from "react";
import { getListSourcesQueryKey, useCreateSource, type SourceKind } from "@/hooks/use-sources";
import { useListPages } from "@/hooks/use-pages";
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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { API_BASE_URL } from "@/config";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function cloudinaryResourceType(mimeType: string): "image" | "video" {
  if (mimeType.startsWith("image/")) return "image";
  return "video"; // Cloudinary uses "video" for both video and audio
}

async function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ url: string; mimeType: string; sizeBytes: number }> {
  const sigRes = await fetch(`${API_BASE_URL}/uploads/sign`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
  });
  if (!sigRes.ok) throw new Error("Failed to get upload signature");
  const { signature, timestamp, apiKey, cloudName, folder } = await sigRes.json();

  const resourceType = cloudinaryResourceType(file.type);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = JSON.parse(xhr.responseText);
        resolve({ url: result.secure_url, mimeType: file.type, sizeBytes: result.bytes });
      } else {
        reject(new Error(`Cloudinary upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(formData);
  });
}

type SourceCreateDialogProps = {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultParentPageId?: number | null;
  lockParentPageId?: boolean;
  titleText?: string;
  parentKinds?: Array<"page" | "folder">;
};

export function SourceCreateDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultParentPageId = null,
  lockParentPageId = false,
  titleText = "Add a new source",
  parentKinds = ["page", "folder"],
}: SourceCreateDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const [kind, setKind] = useState<SourceKind>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [parentPageId, setParentPageId] = useState<string>(
    defaultParentPageId == null ? "__root__" : String(defaultParentPageId),
  );

  useMemo(() => {
    setParentPageId(defaultParentPageId == null ? "__root__" : String(defaultParentPageId));
  }, [defaultParentPageId]);

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
    setUploadProgress(null);
    setParentPageId(defaultParentPageId == null ? "__root__" : String(defaultParentPageId));
  };

  const isUploading = uploadProgress !== null && uploadProgress < 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      let mediaSizeBytes: number | undefined;

      if (kind === "image" || kind === "video" || kind === "audio") {
        if (!file) {
          toast.error("Select a file to upload");
          return;
        }
        setUploadProgress(0);
        const result = await uploadToCloudinary(file, setUploadProgress);
        mediaUrl = result.url;
        mediaMimeType = result.mimeType;
        mediaSizeBytes = result.sizeBytes;
        setUploadProgress(100);
      }

      await createSource.mutateAsync({
        data: {
          kind,
          title,
          content: kind === "text" ? content : undefined,
          url: kind === "url" || kind === "youtube" ? url : undefined,
          parentPageId: parentPageId === "__root__" ? null : Number(parentPageId),
          mediaUrl,
          originalFilename: file?.name,
          mediaMimeType,
          mediaSizeBytes,
        },
      });

      await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      toast.success("Source added");
      handleOpenChange(false);
      resetForm();
    } catch (err) {
      setUploadProgress(null);
      toast.error(err instanceof Error ? err.message : "Failed to add source");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(nextOpen);
    else setInternalOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(val: SourceKind) => setKind(val)}>
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
                placeholder={kind === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://..."}
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
                disabled={isUploading}
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] ?? null;
                  setFile(nextFile);
                  if (nextFile && !title.trim()) {
                    setTitle(nextFile.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Upload complete"}
                  </p>
                </div>
              )}
              {uploadProgress === null && (
                <p className="text-xs text-muted-foreground">
                  {kind === "image"
                    ? "Uploaded directly to cloud storage and indexed for search."
                    : kind === "audio"
                    ? "Uploaded directly to cloud storage and transcribed with Whisper."
                    : "Uploaded directly to cloud storage and transcribed when supported."}
                </p>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={createSource.isPending || isUploading}
          >
            {isUploading ? `Uploading… ${uploadProgress}%` : createSource.isPending ? "Saving…" : "Add Source"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
