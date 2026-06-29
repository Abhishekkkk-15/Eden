import { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { getListSourcesQueryKey, createSourceRequest, type SourceKind } from "@/hooks/use-sources";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { API_BASE_URL } from "@/config";
import { UploadCloud, FileImage, FileVideo, FileAudio, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function kindFromMime(mime: string): SourceKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function cloudinaryResourceType(mime: string): "image" | "video" {
  return mime.startsWith("image/") ? "image" : "video";
}

async function collectFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) =>
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      ),
    );
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    await new Promise<void>((resolve) => {
      const read = () =>
        reader.readEntries(async (entries) => {
          if (!entries.length) { resolve(); return; }
          for (const e of entries) files.push(...await collectFromEntry(e));
          read();
        }, () => resolve());
      read();
    });
    return files;
  }
  return [];
}

async function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ url: string; sizeBytes: number }> {
  const sigRes = await fetch(`${API_BASE_URL}/uploads/sign`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
  });
  if (!sigRes.ok) throw new Error("Failed to get upload signature");
  const { signature, timestamp, apiKey, cloudName, folder } = await sigRes.json();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${cloudName}/${cloudinaryResourceType(file.type)}/upload`,
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const r = JSON.parse(xhr.responseText);
        resolve({ url: r.secure_url, sizeBytes: r.bytes });
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

// ─── types ───────────────────────────────────────────────────────────────────

type UIMode = "text" | "url" | "youtube" | "files";

interface PendingFile {
  id: string;
  file: File;
  kind: SourceKind;
  title: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
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

// ─── component ───────────────────────────────────────────────────────────────

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

  // form state
  const [mode, setMode] = useState<UIMode>("files");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [parentPageId, setParentPageId] = useState<string>(
    defaultParentPageId == null ? "__root__" : String(defaultParentPageId),
  );

  // file upload state
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const queryClient = useQueryClient();
  const { data: pages } = useListPages();
  const pageList = Array.isArray(pages) ? pages : [];
  const availableParents = useMemo(
    () => pageList.filter((p) => parentKinds.includes(p.kind)),
    [pageList, parentKinds],
  );

  useMemo(() => {
    setParentPageId(defaultParentPageId == null ? "__root__" : String(defaultParentPageId));
  }, [defaultParentPageId]);

  const resetForm = () => {
    setMode("files");
    setTitle("");
    setContent("");
    setUrl("");
    setPendingFiles([]);
    setIsDragging(false);
    setIsSubmitting(false);
    setParentPageId(defaultParentPageId == null ? "__root__" : String(defaultParentPageId));
  };

  const handleOpenChange = (next: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(next);
    else setInternalOpen(next);
    if (!next) resetForm();
  };

  // ── file queueing ──────────────────────────────────────────────────────────

  const addFiles = useCallback((files: File[]) => {
    const supported: PendingFile[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const kind = kindFromMime(file.type);
      if (!kind) { skipped.push(file.name); continue; }
      supported.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        kind,
        title: file.name.replace(/\.[^.]+$/, ""),
        progress: 0,
        status: "queued",
      });
    }

    if (skipped.length) {
      toast.warning(`Skipped ${skipped.length} unsupported file(s) — only image, video, and audio are supported`);
    }
    if (supported.length) {
      setPendingFiles((prev) => [...prev, ...supported]);
      setMode("files");
    }
  }, []);

  const removeFile = (id: string) =>
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));

  const updateFile = (id: string, patch: Partial<PendingFile>) =>
    setPendingFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  // ── drag & drop ────────────────────────────────────────────────────────────

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items);
    const collected: File[] = [];

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        collected.push(...await collectFromEntry(entry));
      } else if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) collected.push(f);
      }
    }
    addFiles(collected);
  }, [addFiles]);

  // ── submit ─────────────────────────────────────────────────────────────────

  const resolvedParentPageId = parentPageId === "__root__" ? null : Number(parentPageId);

  const handleFilesSubmit = async () => {
    const queued = pendingFiles.filter((f) => f.status === "queued");
    if (!queued.length) return;
    setIsSubmitting(true);

    await Promise.all(
      queued.map(async (pf) => {
        updateFile(pf.id, { status: "uploading", progress: 0 });
        try {
          const { url: mediaUrl, sizeBytes } = await uploadToCloudinary(pf.file, (pct) =>
            updateFile(pf.id, { progress: pct }),
          );
          await createSourceRequest({
            kind: pf.kind,
            title: pf.title,
            mediaUrl,
            mediaMimeType: pf.file.type,
            mediaSizeBytes: sizeBytes,
            originalFilename: pf.file.name,
            parentPageId: resolvedParentPageId,
          });
          updateFile(pf.id, { status: "done", progress: 100 });
        } catch (err) {
          updateFile(pf.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      }),
    );

    await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
    setIsSubmitting(false);

    const failed = pendingFiles.filter((f) => f.status === "error").length;
    const succeeded = queued.length - failed;
    if (succeeded) toast.success(`${succeeded} source${succeeded > 1 ? "s" : ""} added`);
    if (failed) toast.error(`${failed} file${failed > 1 ? "s" : ""} failed — you can retry them`);
    if (!failed) handleOpenChange(false);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSourceRequest({
        kind: mode as SourceKind,
        title,
        content: mode === "text" ? content : undefined,
        url: mode === "url" || mode === "youtube" ? url : undefined,
        parentPageId: resolvedParentPageId,
      });
      await queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
      toast.success("Source added");
      handleOpenChange(false);
    } catch {
      toast.error("Failed to add source");
    }
  };

  // ── file kind icon ─────────────────────────────────────────────────────────

  const FileKindIcon = ({ kind }: { kind: SourceKind }) => {
    if (kind === "image") return <FileImage className="w-4 h-4 text-purple-500 shrink-0" />;
    if (kind === "video") return <FileVideo className="w-4 h-4 text-rose-500 shrink-0" />;
    return <FileAudio className="w-4 h-4 text-amber-500 shrink-0" />;
  };

  const queuedCount = pendingFiles.filter((f) => f.status === "queued").length;
  const allDone = pendingFiles.length > 0 && pendingFiles.every((f) => f.status === "done");

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="max-w-lg"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 rounded-lg border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <UploadCloud className="w-10 h-10 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Drop files or folders here</p>
            </div>
          </div>
        )}

        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(["files", "text", "url", "youtube"] as UIMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 text-xs px-2 py-1.5 rounded-md font-medium transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "files" ? "Files" : m === "url" ? "URL" : m === "youtube" ? "YouTube" : "Text"}
            </button>
          ))}
        </div>

        {/* Parent folder selector */}
        {!lockParentPageId && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Store in</Label>
            <Select value={parentPageId} onValueChange={setParentPageId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Root workspace" /></SelectTrigger>
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

        {/* ── Files mode ── */}
        {mode === "files" && (
          <div className="space-y-3">
            {/* Drop zone */}
            {pendingFiles.length === 0 ? (
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Drop files or folders here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                <div className="flex gap-2 justify-center mt-4">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    Select files
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    Select folder
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-3">
                  Images, videos, and audio files supported
                </p>
              </div>
            ) : (
              /* File list */
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {pendingFiles.map((pf) => (
                  <div key={pf.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
                    <FileKindIcon kind={pf.kind} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{pf.title}</p>
                      {pf.status === "uploading" && (
                        <Progress value={pf.progress} className="h-1 mt-1" />
                      )}
                      {pf.status === "error" && (
                        <p className="text-[11px] text-destructive truncate">{pf.error}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0 capitalize"
                    >
                      {pf.kind}
                    </Badge>
                    {pf.status === "done" && (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    {pf.status === "error" && (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    {(pf.status === "queued" || pf.status === "error") && (
                      <button
                        type="button"
                        onClick={() => removeFile(pf.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add more / reset when files are queued */}
            {pendingFiles.length > 0 && !allDone && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  + Add more files
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  + Add folder
                </button>
              </div>
            )}

            {/* Hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error – webkitdirectory is non-standard but widely supported
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />

            {allDone ? (
              <Button className="w-full" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={queuedCount === 0 || isSubmitting}
                onClick={handleFilesSubmit}
              >
                {isSubmitting
                  ? "Uploading…"
                  : queuedCount === 0
                  ? "Select files to upload"
                  : `Upload ${queuedCount} file${queuedCount > 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        )}

        {/* ── Text / URL / YouTube mode ── */}
        {mode !== "files" && (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Research Notes"
              />
            </div>

            {mode === "text" && (
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

            {(mode === "url" || mode === "youtube") && (
              <div className="space-y-2">
                <Label>{mode === "youtube" ? "YouTube URL" : "URL"}</Label>
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  placeholder={mode === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://..."}
                />
              </div>
            )}

            <Button type="submit" className="w-full">
              Add Source
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
