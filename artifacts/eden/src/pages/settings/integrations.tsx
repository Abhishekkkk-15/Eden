import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import {
  useCloudIntegrations,
  useConnectGoogleDrive,
  useConnectDropbox,
  useDeleteCloudIntegration,
  useSyncCloudIntegration,
} from "@/hooks/use-cloud-integrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Cloud,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

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

export default function IntegrationsSettings() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const status = searchParams.get("status");
  const error = searchParams.get("error");
  const provider = searchParams.get("provider");

  const { data: integrations, isLoading } = useCloudIntegrations();
  const connectGoogle = useConnectGoogleDrive();
  const connectDropbox = useConnectDropbox();
  const deleteIntegration = useDeleteCloudIntegration();
  const syncIntegration = useSyncCloudIntegration();

  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  // Show success/error messages from OAuth callback
  useEffect(() => {
    if (status === "connected" && provider) {
      toast.success(`${providerLabels[provider as keyof typeof providerLabels]} connected successfully!`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      toast.error(`Connection failed: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [status, error, provider]);

  const handleConnect = async (provider: "google_drive" | "dropbox") => {
    setIsConnecting(provider);
    try {
      if (provider === "google_drive") {
        await connectGoogle.mutateAsync();
      } else {
        await connectDropbox.mutateAsync();
      }
    } catch (err) {
      toast.error("Failed to initiate connection");
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (id: number, provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${providerLabels[provider as keyof typeof providerLabels]}?`)) {
      return;
    }
    try {
      await deleteIntegration.mutateAsync(id);
      toast.success("Integration disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleSync = async (id: number) => {
    try {
      await syncIntegration.mutateAsync(id);
      toast.success("Sync started");
    } catch {
      toast.error("Failed to start sync");
    }
  };

  const hasGoogleDrive = integrations?.some((i) => i.provider === "google_drive");
  const hasDropbox = integrations?.some((i) => i.provider === "dropbox");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrations</h2>
        <p className="text-muted-foreground">
          Connect your cloud storage accounts to import files directly into Eden.
        </p>
      </div>

      <Separator />

      {/* Available Integrations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          Available Providers
        </h3>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Google Drive */}
          <Card className={hasGoogleDrive ? "border-green-500/50" : ""}>
            <CardHeader className="flex flex-row items-center gap-4 pb-3">
              <div className="p-2 rounded-lg bg-muted">
                {providerIcons.google_drive}
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">{providerLabels.google_drive}</CardTitle>
                <CardDescription className="text-xs">
                  Import documents, images, and videos
                </CardDescription>
              </div>
              {hasGoogleDrive && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
            </CardHeader>
            <CardContent>
              {hasGoogleDrive ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Connected</span>
                </div>
              ) : (
                <Button 
                  onClick={() => handleConnect("google_drive")} 
                  disabled={isConnecting === "google_drive"}
                  className="w-full"
                  size="sm"
                >
                  {isConnecting === "google_drive" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Dropbox */}
          <Card className={hasDropbox ? "border-green-500/50" : ""}>
            <CardHeader className="flex flex-row items-center gap-4 pb-3">
              <div className="p-2 rounded-lg bg-muted">
                {providerIcons.dropbox}
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">{providerLabels.dropbox}</CardTitle>
                <CardDescription className="text-xs">
                  Import from your Dropbox folders
                </CardDescription>
              </div>
              {hasDropbox && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
            </CardHeader>
            <CardContent>
              {hasDropbox ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Connected</span>
                </div>
              ) : (
                <Button 
                  onClick={() => handleConnect("dropbox")} 
                  disabled={isConnecting === "dropbox"}
                  className="w-full"
                  size="sm"
                >
                  {isConnecting === "dropbox" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Connected Integrations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          Connected Accounts
          {integrations && integrations.length > 0 && (
            <Badge variant="secondary">{integrations.length}</Badge>
          )}
        </h3>
        
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Card key={i} className="h-20 animate-pulse bg-muted" />
            ))}
          </div>
        ) : integrations?.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Cloud className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No cloud storage accounts connected yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {integrations?.map((integration) => (
              <Card key={integration.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-muted shrink-0">
                        {providerIcons[integration.provider]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {providerLabels[integration.provider]}
                          </span>
                          <Badge 
                            variant={integration.isActive ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {integration.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {integration.providerAccountEmail}
                        </p>
                        {integration.syncError && (
                          <div className="flex items-center gap-1.5 mt-1 text-destructive text-xs">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Sync error</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0">
                      {integration.lastSyncedAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(integration.lastSyncedAt).toLocaleDateString()}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSync(integration.id)}
                          disabled={syncIntegration.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 ${syncIntegration.isPending ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDisconnect(integration.id, integration.provider)}
                          disabled={deleteIntegration.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
