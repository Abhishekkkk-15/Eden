import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import {
  useCloudIntegrations,
  useConnectGoogleDrive,
  useConnectDropbox,
  useDeleteCloudIntegration,
  useSyncCloudIntegration,
  useConnectNotion,
  useSetupNotionDatabase,
} from "@/hooks/use-cloud-integrations";
import { Button } from "@/components/ui/button";
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
  Plug,
  Unplug,
  Calendar,
  FileText,
  Sparkles,
} from "lucide-react";

const providerMeta = {
  google_drive: {
    label: "Google Drive",
    description: "Import documents, images, spreadsheets, and videos from Google Drive.",
    icon: FolderOpen,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    activeBg: "from-blue-500/5 to-transparent",
  },
  dropbox: {
    label: "Dropbox",
    description: "Browse and import files directly from your Dropbox folders.",
    icon: Cloud,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    activeBg: "from-sky-500/5 to-transparent",
  },
  one_drive: {
    label: "OneDrive",
    description: "Connect Microsoft OneDrive to access and import your files.",
    icon: HardDrive,
    color: "text-blue-700",
    bgColor: "bg-blue-700/10",
    borderColor: "border-blue-700/30",
    activeBg: "from-blue-700/5 to-transparent",
  },
  notion: {
    label: "Notion",
    description: "Import pages and databases from your Notion workspace.",
    icon: FileText,
    color: "text-black",
    bgColor: "bg-black/5",
    borderColor: "border-black/10",
    activeBg: "from-black/5 to-transparent",
  },
} as const;

type Provider = keyof typeof providerMeta;

export default function IntegrationsSettings() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const status = searchParams.get("status");
  const error = searchParams.get("error");
  const provider = searchParams.get("provider");

  const { data: integrations, isLoading } = useCloudIntegrations();
  const connectGoogle = useConnectGoogleDrive();
  const connectDropbox = useConnectDropbox();
  const connectNotion = useConnectNotion();
  const deleteIntegration = useDeleteCloudIntegration();
  const syncIntegration = useSyncCloudIntegration();
  const setupNotion = useSetupNotionDatabase();

  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (status === "connected" && provider) {
      const label = providerMeta[provider as Provider]?.label ?? provider;
      toast.success(`${label} connected successfully!`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      toast.error(`Connection failed: ${error}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [status, error, provider]);

  const handleConnect = async (p: "google_drive" | "dropbox" | "notion") => {
    setIsConnecting(p);
    try {
      if (p === "google_drive") {
        await connectGoogle.mutateAsync();
      } else if (p === "dropbox") {
        await connectDropbox.mutateAsync();
      } else {
        await connectNotion.mutateAsync();
      }
    } catch {
      toast.error("Failed to initiate connection");
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async (id: number, p: string) => {
    const label = providerMeta[p as Provider]?.label ?? p;
    if (!confirm(`Are you sure you want to disconnect ${label}?`)) return;
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

  const handleSetupNotion = async (id: number) => {
    try {
      const res = await setupNotion.mutateAsync(id);
      toast.success("Notion Research database created!");
      if (res.databaseUrl) window.open(res.databaseUrl, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Failed to setup database");
    }
  };

  const connectedProviders = new Set(integrations?.map((i) => i.provider) ?? []);

  const availableProviders: ("google_drive" | "dropbox" | "notion")[] = ["google_drive", "dropbox", "notion"];

  return (
    <div className="min-h-full p-6 md:p-8 max-w-4xl mx-auto space-y-10">

      {/* Page Header */}
      <div className="space-y-1 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect your cloud storage accounts to import files directly into Eden.
        </p>
      </div>

      <Separator />

      {/* Available Providers */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Cloud Storage</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect a provider to browse and import files.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {availableProviders.map((p) => {
            const meta = providerMeta[p];
            const Icon = meta.icon;
            const isConnected = connectedProviders.has(p);
            const connecting = isConnecting === p;

            return (
              <div
                key={p}
                className={`relative rounded-xl border bg-card overflow-hidden transition-all ${
                  isConnected
                    ? `border-green-500/40 bg-gradient-to-br ${meta.activeBg}`
                    : "border-border hover:border-border/80"
                }`}
              >
                {isConnected && (
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${meta.bgColor} shrink-0`}>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{meta.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  {!isConnected && (
                    <Button
                      onClick={() => handleConnect(p)}
                      disabled={connecting}
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                    >
                      {connecting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          <Plug className="h-3.5 w-3.5" />
                          Connect {meta.label}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* Connected Accounts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              Connected Accounts
              {integrations && integrations.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {integrations.length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage your active cloud storage connections.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : !integrations || integrations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
            <Cloud className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No accounts connected</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Connect a provider above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration) => {
              const meta = providerMeta[integration.provider as Provider];
              const Icon = meta?.icon ?? Cloud;

              return (
                <div
                  key={integration.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Left: Icon + Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${meta?.bgColor ?? "bg-muted"} shrink-0`}>
                        <Icon className={`h-4 w-4 ${meta?.color ?? "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">
                            {meta?.label ?? integration.provider}
                          </span>
                          <Badge
                            variant={integration.isActive ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {integration.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {integration.syncError && (
                            <span className="inline-flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="h-3 w-3" />
                              Sync error
                            </span>
                          )}
                        </div>
                        {integration.providerAccountEmail && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {integration.providerAccountEmail}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Date + Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-0 sm:pl-2 border-t sm:border-t-0 pt-3 sm:pt-0 mt-0">
                      {integration.lastSyncedAt && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(integration.lastSyncedAt).toLocaleDateString()}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {integration.provider === "notion" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                            onClick={() => handleSetupNotion(integration.id)}
                            disabled={setupNotion.isPending}
                            title="Setup Research Database"
                          >
                            {setupNotion.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleSync(integration.id)}
                          disabled={syncIntegration.isPending}
                          title="Sync now"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${syncIntegration.isPending ? "animate-spin" : ""}`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDisconnect(integration.id, integration.provider)}
                          disabled={deleteIntegration.isPending}
                          title="Disconnect"
                        >
                          <Unplug className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
