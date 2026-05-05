import { useState, useRef } from "react";
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
import { streamChat, completeChat } from "@/lib/ai";
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
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {file.type === "file" && (
          <>
            <DropdownMenuItem onClick={onImport}>
              <FolderInput className="mr-2 h-4 w-4" />
              Import to Eden
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAnalyze}>
              <BrainCircuit className="mr-2 h-4 w-4" />
              Analyze with AI
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isGoogleDrive && (
          <>
            <DropdownMenuItem onClick={onRename}>
              <Edit3 className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
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
      <DialogContent className="max-w-2xl max-h-[80vh]">
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analyze">Quick Analysis</TabsTrigger>
            <TabsTrigger value="chat">Interactive Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="space-y-4">
            <div className="space-y-2">
              <Label>Analysis Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What would you like to know about this file?"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleAnalyze} 
                disabled={isAnalyzing || !file}
                className="flex-1"
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
                <Button variant="outline" onClick={handleImport} disabled={!file}>
                  <FolderInput className="w-4 h-4 mr-2" />
                  Import to Eden
                </Button>
              )}
            </div>

            {analysis && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Analysis Result:</h4>
                <div className="text-sm whitespace-pre-wrap">{analysis}</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
            <div className="space-y-2">
              <Label>Chat with AI about this file</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask a specific question about this document..."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleChatAnalysis} 
                disabled={isAnalyzing || !file}
                className="flex-1"
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
                <Button variant="destructive" onClick={handleStop}>
                  <X className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>

            {analysis && (
              <div className="mt-4 p-4 bg-muted rounded-lg max-h-[300px] overflow-y-auto">
                <h4 className="font-medium mb-2">AI Response:</h4>
                <div className="text-sm whitespace-pre-wrap">{analysis}</div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <p className="text-xs text-muted-foreground flex-1">
            💡 Import to Eden for full AI features: transcription, chunking, search, and more.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Create a new folder in your Google Drive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Folder Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FolderPlus className="w-4 h-4 mr-2" />}
            Create Folder
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
  useState(() => {
    setName(file?.name || "");
  });

  const handleRename = () => {
    if (name.trim() && name !== file?.name) {
      onRename(name.trim());
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {file?.type === "folder" ? "Folder" : "File"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>New Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter new name"
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={!name.trim() || name === file?.name || isRenaming}>
            {isRenaming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Rename
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Create Document with AI
          </DialogTitle>
          <DialogDescription>
            AI will generate content and create a new document in your Google Drive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <div className="flex gap-2">
              {(["document", "notes", "report"] as const).map((t) => (
                <Button
                  key={t}
                  variant={type === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType(t)}
                  className="capitalize"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Meeting Notes, Project Proposal"
            />
          </div>
          <div className="space-y-2">
            <Label>What should the AI write?</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Write a comprehensive guide about..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || !prompt.trim() || isCreating}>
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FilePlus className="w-4 h-4 mr-2" />}
            Create with AI
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
          filePath: currentPath,
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
      const result = await createAIDoc.mutateAsync({
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
      <Card>
        <CardContent className="p-8 text-center">
          <Cloud className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Failed to load files</p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Cloud Files</CardTitle>
              {enableCrud && isGoogleDrive && (
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsCreateFolderOpen(true)}
                    className="h-8 px-2"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsAICreateOpen(true)}
                    className="h-8 px-2"
                  >
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </Button>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          
          {/* Breadcrumbs */}
          <Breadcrumb className="mt-2">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <BreadcrumbItem key={crumb.path}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbLink
                    onClick={() => handleBreadcrumbClick(index)}
                    className={cn(
                      "cursor-pointer",
                      index === breadcrumbs.length - 1 && "font-medium text-foreground"
                    )}
                  >
                    {index === 0 ? <Folder className="w-4 h-4" /> : crumb.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </CardHeader>

        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 animate-pulse bg-muted rounded" />
                ))}
              </div>
            ) : data?.files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Folder className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">This folder is empty</p>
                {enableCrud && isGoogleDrive && (
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => setIsCreateFolderOpen(true)}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Create Folder
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsAICreateOpen(true)}>
                      <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                      AI Create
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {/* Folders first */}
                {data?.files
                  .filter((f) => f.type === "folder")
                  .map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors group"
                    >
                      <button
                        onClick={() => handleFolderClick(file)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        {getFileIcon(file)}
                        <span className="flex-1 font-medium truncate">{file.name}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                      
                      {enableCrud && isGoogleDrive && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <FileContextMenu
                            file={file}
                            isGoogleDrive={isGoogleDrive}
                            onRename={() => openRenameDialog(file)}
                            onDelete={() => handleDelete(file)}
                            onDownload={() => handleDownload(file)}
                            onAnalyze={() => openAIAnalysis(file)}
                            onImport={() => handleImport(file)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                
                {/* Files */}
                {data?.files
                  .filter((f) => f.type === "file")
                  .map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getFileIcon(file)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{file.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                            {file.modifiedAt && ` • ${new Date(file.modifiedAt).toLocaleDateString()}`}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleImport(file)}
                          disabled={importingFile === file.id || importFile.isPending}
                          className="h-8 w-8 p-0"
                          title="Import to Eden"
                        >
                          {importingFile === file.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FolderInput className="w-4 h-4 text-blue-500" />
                          )}
                        </Button>
                        
                        <FileContextMenu
                          file={file}
                          isGoogleDrive={isGoogleDrive}
                          onRename={() => openRenameDialog(file)}
                          onDelete={() => handleDelete(file)}
                          onDownload={() => handleDownload(file)}
                          onAnalyze={() => openAIAnalysis(file)}
                          onImport={() => handleImport(file)}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialogs */}
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

export default CloudFileBrowser;
