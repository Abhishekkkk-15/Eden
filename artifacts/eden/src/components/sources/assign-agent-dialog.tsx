import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Check, X, Loader2 } from "lucide-react";
import { useListAgents } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/config";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AssignedAgent = {
  workflowId: number;
  agent: { id: number; name: string; emoji: string } | null;
} | null;

interface AssignAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: number;
  folderTitle: string;
  onAssigned: () => void;
}

export function AssignAgentDialog({
  open,
  onOpenChange,
  folderId,
  folderTitle,
  onAssigned,
}: AssignAgentDialogProps) {
  const { data: agents, isLoading: agentsLoading } = useListAgents();
  const [current, setCurrent] = useState<AssignedAgent>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCurrent(true);
    const token = localStorage.getItem("token");
    fetch(`${API_BASE_URL}/workflows/folder-agent/${folderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setCurrent(data);
        setSelectedAgentId(data?.agent?.id ?? null);
      })
      .catch(() => setCurrent(null))
      .finally(() => setLoadingCurrent(false));
  }, [open, folderId]);

  const handleSave = async () => {
    if (selectedAgentId === null) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/workflows/folder-agent/${folderId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Agent assigned to folder");
      onAssigned();
      onOpenChange(false);
    } catch {
      toast.error("Failed to assign agent");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!current?.workflowId) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/workflows/folder-agent/${folderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Agent removed from folder");
      onAssigned();
      onOpenChange(false);
    } catch {
      toast.error("Failed to remove agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Agent to Folder</DialogTitle>
          <DialogDescription>
            When a new file is added to &quot;{folderTitle}&quot;, the selected agent will
            automatically process it.
          </DialogDescription>
        </DialogHeader>

        {loadingCurrent || agentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !agents?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No agents found. Create an agent first from the Agents page.
          </div>
        ) : (
          <ScrollArea className="max-h-64 -mx-1 px-1">
            <div className="space-y-1 py-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() =>
                    setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)
                  }
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors",
                    selectedAgentId === agent.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent",
                  )}>
                  <span className="text-xl leading-none">{agent.emoji || "✨"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{agent.name}</div>
                    {agent.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </div>
                    )}
                  </div>
                  {selectedAgentId === agent.id && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {current?.workflowId && (
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={saving}
              className="mr-auto text-destructive hover:text-destructive border-destructive/30">
              <X className="h-4 w-4 mr-1.5" /> Remove Agent
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || selectedAgentId === null}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Bot className="h-4 w-4 mr-1.5" />
            )}
            Assign Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
