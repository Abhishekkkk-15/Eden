import { useState, useEffect } from "react";
import { useCloudIntegrations } from "@/hooks/use-cloud-integrations";
import { CloudFileBrowser } from "./file-browser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Cloud, 
  FolderOpen, 
  RefreshCw, 
  CheckCircle2, 
  FileText, 
  Clock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useImportQueue } from "@/hooks/use-cloud-integrations";
import { formatDistanceToNow } from "date-fns";

interface CloudImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPageId?: number;
}

const providerIcons = {
  google_drive: <FolderOpen className="h-5 w-5 text-blue-500" />,
  dropbox: <Cloud className="h-5 w-5 text-blue-600" />,
  one_drive: <RefreshCw className="h-5 w-5 text-blue-700" />,
  notion: <FileText className="h-5 w-5 text-black" />,
};

const providerLabels = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  one_drive: "OneDrive",
  notion: "Notion",
};

const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; label: string }> = {
  pending: { 
    variant: "secondary",
    icon: <Clock className="h-3.5 w-3.5" />,
    label: "Pending"
  },
  downloading: { 
    variant: "default",
    icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
    label: "Downloading"
  },
  processing: { 
    variant: "default",
    icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
    label: "Processing"
  },
  completed: { 
    variant: "outline",
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    label: "Completed"
  },
  failed: { 
    variant: "destructive",
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    label: "Failed"
  },
};

export function CloudImportDialog({ open, onOpenChange, targetPageId }: CloudImportDialogProps) {
  const { data: integrations, isLoading: isLoadingIntegrations } = useCloudIntegrations();
  const { data: queueItems, isLoading: isLoadingQueue } = useImportQueue();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"browse" | "queue">("browse");

  const activeIntegrations = integrations?.filter((i) => i.isActive) || [];
  const selectedIntegration = activeIntegrations.find(
    (i) => i.id.toString() === selectedIntegrationId
  );

  // Reset selected integration when dialog opens/closes
  useEffect(() => {
    if (open && activeIntegrations.length > 0 && !selectedIntegrationId) {
      setSelectedIntegrationId(activeIntegrations[0].id.toString());
    }
    if (!open) {
      setSelectedIntegrationId("");
      setActiveTab("browse");
    }
  }, [open, activeIntegrations, selectedIntegrationId]);

  const pendingCount = queueItems?.filter(i => 
    ["pending", "downloading", "processing"].includes(i.status)
  ).length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[98vw] sm:w-[95vw] h-[95vh] sm:h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-0 sm:border rounded-none sm:rounded-2xl shadow-2xl">
        {/* Header - Premium look with subtle gradient */}
        <DialogHeader className="px-6 py-5 border-b bg-gradient-to-r from-background to-muted/30 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-sm border border-primary/20">
              <Cloud className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight">Cloud Library</DialogTitle>
              <DialogDescription className="text-sm font-medium text-muted-foreground line-clamp-1">
                Access your files from Google Drive, Dropbox, and more
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs 
          value={activeTab} 
          onValueChange={(v) => setActiveTab(v as "browse" | "queue")} 
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="bg-muted/30 border-b px-4">
            <TabsList className="w-full sm:w-auto h-12 bg-transparent p-0 gap-1">
              <TabsTrigger 
                value="browse" 
                className="h-full px-6 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all duration-200"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <FolderOpen className="h-4 w-4" />
                  <span>Browse</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="queue"
                className="h-full px-6 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all duration-200"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4" />
                  <span>Queue</span>
                  {pendingCount > 0 && (
                    <Badge className="ml-1 h-5 min-w-[20px] px-1 justify-center bg-primary text-primary-foreground animate-pulse">
                      {pendingCount}
                    </Badge>
                  )}
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Browse Tab */}
          <TabsContent value="browse" className="flex-1 min-h-0 m-0 p-0 overflow-hidden flex flex-col">
            {/* Account Selector Section */}
            <div className="px-6 py-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Source Account
                  </span>
                  <Select
                    value={selectedIntegrationId}
                    onValueChange={setSelectedIntegrationId}
                    disabled={isLoadingIntegrations || activeIntegrations.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-[280px] bg-muted/40 border-muted-foreground/10 hover:bg-muted transition-colors rounded-xl h-10">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-muted-foreground/10 shadow-xl">
                      {activeIntegrations.length === 0 ? (
                        <SelectItem value="none" disabled>No accounts connected</SelectItem>
                      ) : (
                        activeIntegrations.map((integration) => (
                          <SelectItem key={integration.id} value={integration.id.toString()}>
                            <div className="flex items-center gap-3 py-0.5">
                              {providerIcons[integration.provider as keyof typeof providerIcons]}
                              <div className="flex flex-col">
                                <span className="font-bold text-sm leading-tight">
                                  {providerLabels[integration.provider as keyof typeof providerLabels]}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                  {integration.providerAccountEmail}
                                </span>
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                {activeIntegrations.length === 0 && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => onOpenChange(false)}
                    className="shadow-md rounded-full px-5"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Setup Cloud Access
                  </Button>
                )}
              </div>
            </div>

            {/* Browser Content */}
            <div className="flex-1 min-h-0 overflow-hidden relative">
              {selectedIntegration ? (
                <div className="absolute inset-0">
                  <CloudFileBrowser
                    integrationId={selectedIntegration.id}
                    provider={selectedIntegration.provider}
                    targetPageId={targetPageId}
                    onImport={() => setActiveTab("queue")}
                    integrations={activeIntegrations}
                  />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-muted/5">
                  <div className="w-24 h-24 bg-muted/20 rounded-3xl flex items-center justify-center mb-8 animate-in zoom-in-95 duration-500 shadow-inner">
                    <Cloud className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mb-3 text-foreground">
                    {activeIntegrations.length === 0
                      ? "Connect your cloud library"
                      : "Choose an account to browse"}
                  </h3>
                  <p className="text-muted-foreground text-base max-w-md mx-auto mb-10 leading-relaxed">
                    {activeIntegrations.length === 0
                      ? "Link your Google Drive or Dropbox to start importing research documents and media directly into your workspace."
                      : "Select one of your connected cloud accounts from the dropdown menu to start exploring your files."}
                  </p>
                  {activeIntegrations.length === 0 && (
                    <Button 
                      size="lg" 
                      onClick={() => onOpenChange(false)}
                      className="px-8 rounded-full shadow-xl hover:scale-105 transition-transform"
                    >
                      <Settings className="h-5 w-5 mr-3" />
                      Go to Integrations
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Queue Tab */}
          <TabsContent value="queue" className="flex-1 min-h-0 m-0 p-0 flex flex-col overflow-hidden bg-muted/5">
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-4xl mx-auto w-full">
                {isLoadingQueue ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Card key={i} className="h-24 animate-pulse bg-muted/50 border-none shadow-sm rounded-2xl" />
                    ))}
                  </div>
                ) : queueItems?.length === 0 ? (
                  <Card className="border-dashed bg-transparent shadow-none py-20 flex flex-col items-center border-muted-foreground/20">
                    <div className="w-20 h-20 bg-muted/30 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                      <Clock className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Queue is empty</h3>
                    <p className="text-muted-foreground text-base max-w-xs text-center mb-8">
                      Your recently imported files will show up here as they process.
                    </p>
                    <Button variant="outline" onClick={() => setActiveTab("browse")} className="rounded-full px-8 border-primary/20 hover:bg-primary/5">
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Browse Files
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                        Recent Imports ({queueItems?.length || 0})
                      </h3>
                    </div>
                    {queueItems?.map((item) => {
                      const status = statusConfig[item.status] || statusConfig.pending;
                      return (
                        <Card key={item.id} className="group hover:border-primary/40 transition-all duration-300 border-muted/50 shadow-sm hover:shadow-md rounded-2xl overflow-hidden bg-background">
                          <CardContent className="p-5">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                              {/* File Info */}
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="p-3.5 rounded-2xl bg-muted/50 group-hover:bg-primary/5 shrink-0 transition-colors border border-transparent group-hover:border-primary/10">
                                  {providerIcons[item.provider as keyof typeof providerIcons]}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-base truncate mb-0.5">
                                    {item.providerFileName}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="truncate max-w-[200px] font-medium">
                                      {item.providerFilePath || providerLabels[item.provider as keyof typeof providerLabels]}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                                    <span className="shrink-0">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="flex items-center justify-between sm:justify-end gap-4 pt-4 sm:pt-0 border-t sm:border-t-0">
                                <Badge 
                                  variant={status.variant}
                                  className={cn(
                                    "px-4 py-1.5 text-[11px] font-bold rounded-full flex items-center gap-2 border shadow-sm",
                                    item.status === "completed" && "bg-green-50 text-green-700 border-green-200",
                                    item.status === "failed" && "bg-red-50 text-red-700 border-red-200",
                                    item.status === "pending" && "bg-amber-50 text-amber-700 border-amber-200"
                                  )}
                                >
                                  <span className={cn(item.status === "processing" || item.status === "downloading" ? "animate-spin" : "")}>
                                    {status.icon}
                                  </span>
                                  {status.label}
                                </Badge>
                              </div>
                            </div>
                            
                            {item.errorMessage && (
                              <div className="mt-4 p-4 bg-red-50/50 border border-red-100 rounded-2xl text-xs text-red-700 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="bg-red-100 p-1 rounded-md shrink-0">
                                  <RefreshCw className="h-3 w-3" />
                                </div>
                                <div className="flex-1">
                                  <span className="font-bold block mb-1">Processing Error</span>
                                  <p className="leading-relaxed">{item.errorMessage}</p>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default CloudImportDialog;
