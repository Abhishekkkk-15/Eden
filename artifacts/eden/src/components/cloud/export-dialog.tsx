import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Database, Cloud, Loader2 } from "lucide-react";
import { useCloudIntegrations, useExportCloudFile } from "@/hooks/use-cloud-integrations";
import { toast } from "sonner";
import { Link } from "wouter";

export function CloudExportDialog({
  open,
  onOpenChange,
  sourceId,
  isPage,
  fileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: number;
  isPage: boolean;
  fileName: string;
}) {
  const { data: integrations } = useCloudIntegrations();
  const exportFile = useExportCloudFile();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const activeIntegrations = integrations?.filter(i => i.isActive) || [];

  const handleExport = async () => {
    if (!selectedIntegrationId) return;
    
    setIsExporting(true);
    try {
      await exportFile.mutateAsync({
        integrationId: selectedIntegrationId,
        data: {
          sourceId,
          isPage,
        },
      });
      toast.success(`"${fileName}" exported successfully`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to export "${fileName}"`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to Cloud</DialogTitle>
          <DialogDescription>
            Choose a connected cloud account to export "{fileName}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {activeIntegrations.length === 0 ? (
            <div className="text-center p-4 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">No active cloud integrations found.</p>
              <Link href="/settings/integrations">
                <Button variant="link" size="sm">Connect an account</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Select Account</Label>
              <div className="grid gap-2">
                {activeIntegrations.map((integration) => (
                  <Button
                    key={integration.id}
                    variant={selectedIntegrationId === integration.id ? "default" : "outline"}
                    className="justify-start h-auto py-3 px-4"
                    onClick={() => setSelectedIntegrationId(integration.id)}
                  >
                    <div className="flex items-center gap-3 w-full text-left">
                      <div className="p-2 rounded-lg bg-background border">
                        {integration.provider === "google_drive" ? (
                          <Database className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Cloud className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium capitalize leading-none mb-1">
                          {integration.provider.replace("_", " ")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {integration.providerAccountEmail || "Active Connection"}
                        </p>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={!selectedIntegrationId || isExporting}
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Cloud className="w-4 h-4 mr-2" />}
            Export Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
