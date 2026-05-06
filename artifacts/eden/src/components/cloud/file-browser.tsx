import { useState, useRef, useEffect } from "react";
import { 
  useCloudFiles, 
  useImportCloudFile, 
  useCreateCloudFolder,
  useUpdateCloudFile,
  useDeleteCloudFile,
  useDownloadCloudFile,
  useAnalyzeCloudFile,
  useCreateAIDocument,
  type CloudFile 
} from "@/hooks/use-cloud-integrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { streamChat } from "@/lib/ai";
import { 
  Folder, 
  FileText, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  File, 
  ChevronRight, 
  Import,
  Loader2,
  Cloud,
  RefreshCw,
  MoreVertical,
  Plus,
  Edit3,
  Trash2,
  Download,
  Sparkles,
  FilePlus,
  FolderPlus,
  BrainCircuit,
  Search,
  X,
  Check,
  FolderInput,
  FileOutput,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileBrowserProps {
  integrationId: number;
  provider: "google_drive" | "dropbox" | "one_drive";
  targetPageId?: number;
  onImport?: () => void;
  enableCrud?: boolean;
}

const fileIcons: Record<string, React.ReactNode> = {
  folder: <Folder className="w-5 h-5 text-blue-500" />,
  "image/": <FileImage className="w-5 h-5 text-purple-500" />,
  "video/": <FileVideo className="w-5 h-5 text-red-500" />,
  "audio/": <FileAudio className="w-5 h-5 text-green-500" />,
  "text/": <FileText className="w-5 h-5 text-gray-500" />,
  "application/pdf": <FileText className="w-5 h-5 text-red-600" />,
  default: <File className="w-5 h-5 text-gray-400" />,
};

function getFileIcon(file: CloudFile): React.ReactNode {
  if (file.type === "folder") return fileIcons.folder;
  if (file.mimeType?.startsWith("image/")) return fileIcons["image/"];
  if (file.mimeType?.startsWith("video/")) return fileIcons["video/"];
  if (file.mimeType?.startsWith("audio/")) return fileIcons["audio/"];
  if (file.mimeType?.startsWith("text/")) return fileIcons["text/"];
  if (file.mimeType === "application/pdf") return fileIcons["application/pdf"];
  return fileIcons.default;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// Context Menu Component for File Operations
function FileContextMenu({
  file,
  isGoogleDrive,
  onRename,
  onDelete,
  onDownload,
  onAnalyze,
  onImport,
  onAICreate,
}: {
  file: CloudFile;
  isGoogleDrive: boolean;
  onRename: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onAnalyze: () => void;
  onImport: () => void;
  onAICreate?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-muted">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl">
        {file.type === "file" && (
          <>
            <DropdownMenuItem onClick={onImport} className="rounded-lg">
              <FolderInput className="mr-2 h-4 w-4" />
              Import to Eden
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownload} className="rounded-lg">
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAnalyze} className="rounded-lg">
              <BrainCircuit className="mr-2 h-4 w-4 text-purple-500" />
              Analyze with AI
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isGoogleDrive && (
          <>
            <DropdownMenuItem onClick={onRename} className="rounded-lg">
              <Edit3 className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600 rounded-lg">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// AI Analysis Dialog Component
function AIAnalysisDialog({
  open,
  onOpenChange,
  file,
  integrationId,
  onImportToEden,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: CloudFile | null;
  integrationId: number;
  onImportToEden?: (file: CloudFile) => void;
}) {
  const [prompt, setPrompt] = useState("Summarize the key points of this document.");
  const [analysis, setAnalysis] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState("analyze");
  const analyzeFile = useAnalyzeCloudFile();
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAnalyze = async () => {
    if (!file) return;
    
    setIsAnalyzing(true);
    setAnalysis("");
    setIsStreaming(true);

    try {
      // Use server-side analysis endpoint for full document content
      const result = await analyzeFile.mutateAsync({
        integrationId,
        fileId: file.id,
        data: { prompt, maxTokens: 2000 },
      });
      
      setAnalysis(result.analysis);
    } catch (error) {
      toast.error("Failed to analyze file");
    } finally {
      setIsAnalyzing(false);
      setIsStreaming(false);
    }
  };

  const handleChatAnalysis = async () => {
    if (!file) return;
    
    setIsAnalyzing(true);
    setAnalysis("");
    setIsStreaming(true);

    try {
      // First get the file content analysis from server
      const result = await analyzeFile.mutateAsync({
        integrationId,
        fileId: file.id,
        data: { prompt: "Extract the main content of this document for analysis.", maxTokens: 4000 },
      });

      // Then use streaming chat for interactive analysis
      abortControllerRef.current = new AbortController();
      
      const messages = [
        { role: "system" as const, content: "You are a helpful AI assistant analyzing documents." },
        { role: "user" as const, content: `${prompt}\n\nDocument: "${file.name}"\n\n${result.analysis}` },
      ];

      let fullResponse = "";
      for await (const chunk of streamChat(messages)) {
        if (abortControllerRef.current?.signal.aborted) break;
        fullResponse += chunk;
        setAnalysis(fullResponse);
      }
    } catch (error) {
      if ((error as Error).message !== "Aborted") {
        toast.error("Failed to analyze file");
      }
    } finally {
      setIsAnalyzing(false);
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setIsAnalyzing(false);
  };

  const handleImport = () => {
    if (file && onImportToEden) {
      onImportToEden(file);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-purple-500" />
            AI Analysis: {file?.name}
          </DialogTitle>
          <DialogDescription>
            Analyze this file using AI. You can also import it to Eden for full AI features.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="analyze" className="rounded-lg">Quick Analysis</TabsTrigger>
            <TabsTrigger value="chat" className="rounded-lg">Interactive Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="space-y-4">
            <div className="space-y-2 pt-2">
              <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Analysis Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What would you like to know about this file?"
                rows={2}
                className="rounded-xl bg-muted/50 focus:bg-background transition-all"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleAnalyze} 
                disabled={isAnalyzing || !file}
                className="flex-1 rounded-xl shadow-lg"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analyze File
                  </>
                )}
              </Button>
              
              {onImportToEden && (
                <Button variant="outline" onClick={handleImport} disabled={!file} className="rounded-xl px-6 border-primary/20">
                  <FolderInput className="w-4 h-4 mr-2" />
                  Import to Eden
                </Button>
              )}
            </div>

            {analysis && (
              <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-muted animate-in fade-in slide-in-from-top-2">
                <h4 className="font-bold text-sm mb-2 text-primary">Analysis Result:</h4>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{analysis}</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
            <div className="space-y-2 pt-2">
              <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Chat with AI about this file</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask a specific question about this document..."
                rows={3}
                className="rounded-xl bg-muted/50 focus:bg-background transition-all"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleChatAnalysis} 
                disabled={isAnalyzing || !file}
                className="flex-1 rounded-xl shadow-lg"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-4 h-4 mr-2" />
                    Chat with AI
                  </>
                )}
              </Button>
              
              {isStreaming && (
                <Button variant="destructive" onClick={handleStop} className="rounded-xl">
                  <X className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>

            {analysis && (
              <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-muted max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
                <h4 className="font-bold text-sm mb-2 text-primary">AI Response:</h4>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{analysis}</div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 sm:justify-between items-center border-t pt-4">
          <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-widest">
            <Sparkles className="w-3 h-3 text-purple-500" />
            Full transcription & search available after import
          </p>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create Folder Dialog
function CreateFolderDialog({
  open,
  onOpenChange,
  onCreate,
  isCreating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isCreating: boolean;
}) {
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim());
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Create Folder</DialogTitle>
          <DialogDescription>
            Enter a name for your new Google Drive folder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Folder Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Projects"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="rounded-xl h-11 bg-muted/30 focus:bg-background border-muted-foreground/10"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating} className="rounded-xl px-8 shadow-lg">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FolderPlus className="w-4 h-4 mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rename Dialog
function RenameDialog({
  open,
  onOpenChange,
  file,
  onRename,
  isRenaming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: CloudFile | null;
  onRename: (newName: string) => void;
  isRenaming: boolean;
}) {
  const [name, setName] = useState(file?.name || "");

  // Update name when file changes
  useEffect(() => {
    if (file) setName(file.name);
  }, [file]);

  const handleRename = () => {
    if (name.trim() && name !== file?.name) {
      onRename(name.trim());
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Rename {file?.type === "folder" ? "Folder" : "File"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">New Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter new name"
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="rounded-xl h-11 bg-muted/30 focus:bg-background border-muted-foreground/10"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={!name.trim() || name === file?.name || isRenaming} className="rounded-xl px-8 shadow-lg">
            {isRenaming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// AI Create Document Dialog
function AICreateDocumentDialog({
  open,
  onOpenChange,
  onCreate,
  isCreating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, prompt: string, type: "document" | "notes" | "report") => void;
  isCreating: boolean;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<"document" | "notes" | "report">("document");

  const handleCreate = () => {
    if (title.trim() && prompt.trim()) {
      onCreate(title.trim(), prompt.trim(), type);
      setTitle("");
      setPrompt("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="w-6 h-6 text-purple-500" />
            AI Document Generator
          </DialogTitle>
          <DialogDescription>
            Eden's AI will generate content and save it to your Google Drive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Document Format</Label>
            <div className="flex gap-2">
              {(["document", "notes", "report"] as const).map((t) => (
                <Button
                  key={t}
                  variant={type === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType(t)}
                  className="capitalize rounded-full px-5 h-9"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Project Vision, Research Summary"
              className="rounded-xl h-11 bg-muted/30 focus:bg-background border-muted-foreground/10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Creative Brief</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the AI write for you?"
              rows={4}
              className="rounded-xl bg-muted/30 focus:bg-background border-muted-foreground/10 resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || !prompt.trim() || isCreating} className="rounded-xl px-8 shadow-xl bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main File Browser Component
export function CloudFileBrowser({ 
  integrationId, 
  provider, 
  targetPageId, 
  onImport,
  enableCrud = true,
}: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ name: string; path: string }>>([
    { name: "Root", path: "" },
  ]);
  const [importingFile, setImportingFile] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<CloudFile | null>(null);
  
  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isAIAnalysisOpen, setIsAIAnalysisOpen] = useState(false);
  const [isAICreateOpen, setIsAICreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useCloudFiles(integrationId, currentPath);
  const importFile = useImportCloudFile();
  const createFolder = useCreateCloudFolder();
  const updateFile = useUpdateCloudFile();
  const deleteFile = useDeleteCloudFile();
  const downloadFile = useDownloadCloudFile();
  const createAIDoc = useCreateAIDocument();

  const isGoogleDrive = provider === "google_drive";
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.path || "";

  const handleFolderClick = (folder: CloudFile) => {
    const newPath = currentPath ? `${currentPath}/${folder.id}` : folder.id;
    setCurrentPath(newPath);
    setBreadcrumbs([...breadcrumbs, { name: folder.name, path: folder.id }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const newPath = newBreadcrumbs.length > 1 
      ? newBreadcrumbs.slice(1).map(b => b.path).join("/")
      : "";
    setCurrentPath(newPath);
  };

  const handleImport = async (file: CloudFile) => {
    if (file.type === "folder") return;
    
    setImportingFile(file.id);
    try {
      await importFile.mutateAsync({
        integrationId,
        data: {
          fileId: file.id,
          fileName: file.name,
          filePath: file.path || currentPath,
          mimeType: file.mimeType,
          fileSize: file.size,
          targetPageId,
        },
      });
      toast.success(`Importing "${file.name}" to Eden...`);
      onImport?.();
    } catch {
      toast.error(`Failed to import "${file.name}"`);
    } finally {
      setImportingFile(null);
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      await createFolder.mutateAsync({
        integrationId,
        data: { name, parentId: currentFolderId || undefined },
      });
      toast.success(`Folder "${name}" created`);
      refetch();
    } catch {
      toast.error("Failed to create folder");
    }
  };

  const handleRename = async (newName: string) => {
    if (!selectedFile) return;
    
    try {
      await updateFile.mutateAsync({
        integrationId,
        fileId: selectedFile.id,
        data: { name: newName },
      });
      toast.success(`Renamed to "${newName}"`);
      refetch();
    } catch {
      toast.error("Failed to rename");
    }
  };

  const handleDelete = async (file: CloudFile) => {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    
    try {
      await deleteFile.mutateAsync({ integrationId, fileId: file.id });
      toast.success(`"${file.name}" deleted`);
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleDownload = async (file: CloudFile) => {
    try {
      const blob = await downloadFile.mutateAsync({ integrationId, fileId: file.id });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Downloaded "${file.name}"`);
    } catch {
      toast.error("Failed to download");
    }
  };

  const handleAICreate = async (title: string, prompt: string, type: "document" | "notes" | "report") => {
    try {
      await createAIDoc.mutateAsync({
        integrationId,
        data: {
          title,
          prompt,
          type,
          parentId: currentFolderId || undefined,
        },
      });
      toast.success(`Document "${title}" created with AI`);
      refetch();
    } catch {
      toast.error("Failed to create AI document");
    }
  };

  const openRenameDialog = (file: CloudFile) => {
    setSelectedFile(file);
    setIsRenameOpen(true);
  };

  const openAIAnalysis = (file: CloudFile) => {
    setSelectedFile(file);
    setIsAIAnalysisOpen(true);
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-red-50/20 rounded-2xl border border-red-100">
        <Cloud className="w-16 h-16 text-red-400 mb-6" />
        <h3 className="text-xl font-bold text-red-700 mb-2">Sync Error</h3>
        <p className="text-muted-foreground text-sm max-w-xs mb-8">
          We encountered a problem connecting to your cloud storage account.
        </p>
        <Button onClick={() => refetch()} variant="outline" className="rounded-full px-8 border-red-200 hover:bg-red-50 text-red-700">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Reconnecting
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col bg-background rounded-2xl border border-muted/50 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b bg-muted/10 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/5 rounded-lg border border-primary/10">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-sm tracking-tight">Cloud Browser</h3>
              {enableCrud && isGoogleDrive && (
                <div className="flex gap-1 ml-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsCreateFolderOpen(true)}
                    className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                    title="New Folder"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsAICreateOpen(true)}
                    className="h-8 w-8 p-0 rounded-full hover:bg-purple-100 hover:text-purple-600 transition-colors"
                    title="Create with AI"
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => refetch()} 
                disabled={isLoading}
                className="h-8 px-3 text-xs font-semibold rounded-full hover:bg-muted"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Syncing..." : "Refresh"}
              </Button>
            </div>
          </div>
          
          {/* Breadcrumbs - Compact on mobile */}
          <div className="mt-4 overflow-x-auto pb-1 no-scrollbar">
            <Breadcrumb>
              <BreadcrumbList className="flex-nowrap whitespace-nowrap">
                {breadcrumbs.map((crumb, index) => (
                  <BreadcrumbItem key={crumb.path || "root"} className="flex-shrink-0">
                    <BreadcrumbLink 
                      className={cn(
                        "text-xs font-bold transition-colors cursor-pointer",
                        index === breadcrumbs.length - 1 ? "text-foreground pointer-events-none" : "text-muted-foreground hover:text-primary"
                      )}
                      onClick={() => handleBreadcrumbClick(index)}
                    >
                      {crumb.name}
                    </BreadcrumbLink>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator className="mx-1" />}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-5">
            {isLoading && !data ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse border border-muted/20" />
                ))}
              </div>
            ) : !data?.files || data.files.length === 0 ? (
              <div className="py-24 flex flex-col items-center text-center opacity-80 animate-in fade-in duration-700">
                <div className="w-16 h-16 bg-muted/20 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                  <Folder className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <h3 className="text-lg font-bold">This folder is empty</h3>
                <p className="text-sm text-muted-foreground max-w-[200px] mt-1">
                  Upload files to your cloud storage to see them here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.files.map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      "group relative flex items-center gap-3 p-3 rounded-xl border border-muted/50 bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2",
                      file.type === "folder" ? "cursor-pointer" : "cursor-default"
                    )}
                    onClick={() => file.type === "folder" && handleFolderClick(file)}
                  >
                    {/* File Icon */}
                    <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center group-hover:bg-muted transition-colors shrink-0">
                      {getFileIcon(file)}
                    </div>

                    {/* File Meta */}
                    <div className="flex-1 min-w-0 pr-8">
                      <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                        {file.name}
                      </p>
                      <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                        {file.type === "folder" ? "Folder" : formatFileSize(file.size)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="absolute right-2 flex items-center gap-1">
                      {file.type === "file" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-primary/10 hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleImport(file);
                          }}
                          disabled={importingFile === file.id}
                        >
                          {importingFile === file.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Import className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                      
                      <div className="opacity-40 group-hover:opacity-100 transition-opacity">
                        <FileContextMenu
                          file={file}
                          isGoogleDrive={isGoogleDrive}
                          onRename={() => openRenameDialog(file)}
                          onDelete={() => handleDelete(file)}
                          onDownload={() => handleDownload(file)}
                          onAnalyze={() => openAIAnalysis(file)}
                          onImport={() => handleImport(file)}
                          onAICreate={() => setIsAICreateOpen(true)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <CreateFolderDialog
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
        onCreate={handleCreateFolder}
        isCreating={createFolder.isPending}
      />

      <RenameDialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        file={selectedFile}
        onRename={handleRename}
        isRenaming={updateFile.isPending}
      />

      <AIAnalysisDialog
        open={isAIAnalysisOpen}
        onOpenChange={setIsAIAnalysisOpen}
        file={selectedFile}
        integrationId={integrationId}
        onImportToEden={handleImport}
      />

      <AICreateDocumentDialog
        open={isAICreateOpen}
        onOpenChange={setIsAICreateOpen}
        onCreate={handleAICreate}
        isCreating={createAIDoc.isPending}
      />
    </>
  );
}
