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
  FolderInput,
  HardDrive
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
  one_drive: <HardDrive className="h-5 w-5 text-blue-700" />,
};

const providerLabels = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  one_drive: "OneDrive",
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
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <FolderInput className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle>Import from Cloud</DialogTitle>
              <DialogDescription>
                Browse and import files from your connected accounts
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "browse" | "queue")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full rounded-none border-b bg-muted/50 p-0 h-auto">
            <TabsTrigger 
              value="browse" 
              className="flex-1 py-3 px-4 rounded-none data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Browse Files</span>
                <span className="sm:hidden">Browse</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="queue"
              className="flex-1 py-3 px-4 rounded-none data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Import Queue</span>
                <span className="sm:hidden">Queue</span>
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {pendingCount}
                  </Badge>
                )}
              </div>
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="flex-1 min-h-0 m-0 p-0">
            <div className="h-full flex flex-col">
              {/* Source Selector */}
              <div className="px-4 sm:px-6 py-4 border-b bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-sm font-medium shrink-0">
                    Source Account:
                  </span>
                  <Select
                    value={selectedIntegrationId}
                    onValueChange={setSelectedIntegrationId}
                    disabled={isLoadingIntegrations || activeIntegrations.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-[320px]">
                      <SelectValue placeholder="Select cloud storage account" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeIntegrations.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No accounts connected
                        </SelectItem>
                      ) : (
                        activeIntegrations.map((integration) => (
                          <SelectItem key={integration.id} value={integration.id.toString()}>
                            <div className="flex items-center gap-2">
                              {providerIcons[integration.provider]}
                              <span className="font-medium">
                                {providerLabels[integration.provider]}
                              </span>
                              <span className="text-muted-foreground text-xs truncate max-w-[180px]">
                                {integration.providerAccountEmail}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  
                  {activeIntegrations.length === 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => onOpenChange(false)}
                      className="shrink-0"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Connect Account
                    </Button>
                  )}
                </div>
              </div>

              {/* File Browser Area */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {selectedIntegration ? (
                  <div className="h-full p-4 sm:p-6">
                    <CloudFileBrowser
                      integrationId={selectedIntegration.id}
                      provider={selectedIntegration.provider}
                      targetPageId={targetPageId}
                      onImport={() => setActiveTab("queue")}
                    />
                  </div>
                ) : (
                  <Card className="h-full border-0 shadow-none">
                    <CardContent className="h-full flex flex-col items-center justify-center text-center p-6">
                      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                        <Cloud className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        {activeIntegrations.length === 0
                          ? "No Cloud Storage Connected"
                          : "Select a Cloud Storage"}
                      </h3>
                      <p className="text-muted-foreground text-sm max-w-sm mb-6">
                        {activeIntegrations.length === 0
                          ? "Connect your Google Drive or Dropbox account to import files directly into Eden."
                          : "Choose a cloud storage account from the dropdown above to browse your files."}
                      </p>
                      {activeIntegrations.length === 0 && (
                        <Button onClick={() => onOpenChange(false)}>
                          <Settings className="h-4 w-4 mr-2" />
                          Go to Settings
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Queue Tab */}
          <TabsContent value="queue" className="flex-1 min-h-0 m-0 p-0">
            <ScrollArea className="h-full">
              <div className="p-4 sm:p-6">
                {isLoadingQueue ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Card key={i} className="h-20 animate-pulse bg-muted" />
                    ))}
                  </div>
                ) : queueItems?.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-16 text-center">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-medium mb-1">
                        No Imports in Queue
                      </h3>
                      <p className="text-muted-foreground text-sm mb-6">
                        Browse your cloud files and import them to get started
                      </p>
                      <Button onClick={() => setActiveTab("browse")}>
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Browse Files
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {queueItems?.map((item) => {
                      const status = statusConfig[item.status] || statusConfig.pending;
                      return (
                        <Card key={item.id}>
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                              {/* File Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="p-2.5 rounded-lg bg-muted shrink-0">
                                  {providerIcons[item.provider as keyof typeof providerIcons]}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">
                                    {item.providerFileName}
                                  </p>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {item.providerFilePath || providerLabels[item.provider as keyof typeof providerLabels]}
                                  </p>
                                </div>
                              </div>

                              {/* Status & Time */}
                              <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0">
                                <Badge variant={status.variant}>
                                  <span className="flex items-center gap-1.5">
                                    {status.icon}
                                    <span className="hidden sm:inline">{status.label}</span>
                                    <span className="sm:hidden">{item.status.slice(0, 4)}</span>
                                  </span>
                                </Badge>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                            
                            {item.errorMessage && (
                              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                                <span className="font-medium">Error:</span> {item.errorMessage}
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
