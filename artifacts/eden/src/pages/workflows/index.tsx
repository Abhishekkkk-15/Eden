import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Zap,
  Play,
  Pause,
  Trash2,
  ChevronRight,
  Folder,
  Tag,
  Sparkles,
  Webhook,
  Bell,
  Clock,
  Upload,
  Edit3,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TriggerType = "source_created" | "source_updated" | "scheduled" | "manual";
type ActionType = "tag" | "move_to_folder" | "summarize" | "transcribe" | "extract_entities" | "send_notification" | "webhook" | "ai_transform";

interface Workflow {
  id: number;
  name: string;
  description: string;
  emoji: string;
  triggerType: TriggerType;
  actions: WorkflowAction[];
  isActive: boolean;
  runCount: number;
  lastRunAt?: string;
  createdAt: string;
}

interface WorkflowAction {
  type: ActionType;
  config: Record<string, unknown>;
}

const triggerIcons: Record<TriggerType, React.ReactNode> = {
  source_created: <Upload className="w-4 h-4" />,
  source_updated: <Edit3 className="w-4 h-4" />,
  scheduled: <Clock className="w-4 h-4" />,
  manual: <Play className="w-4 h-4" />,
};

const triggerLabels: Record<TriggerType, string> = {
  source_created: "When source is created",
  source_updated: "When source is updated",
  scheduled: "On a schedule",
  manual: "Manual trigger",
};

const actionIcons: Record<ActionType, React.ReactNode> = {
  tag: <Tag className="w-4 h-4" />,
  move_to_folder: <Folder className="w-4 h-4" />,
  summarize: <Sparkles className="w-4 h-4" />,
  transcribe: <Bot className="w-4 h-4" />,
  extract_entities: <Zap className="w-4 h-4" />,
  send_notification: <Bell className="w-4 h-4" />,
  webhook: <Webhook className="w-4 h-4" />,
  ai_transform: <Sparkles className="w-4 h-4" />,
};

const actionLabels: Record<ActionType, string> = {
  tag: "Add tags",
  move_to_folder: "Move to folder",
  summarize: "Generate summary",
  transcribe: "Transcribe media",
  extract_entities: "Extract entities",
  send_notification: "Send notification",
  webhook: "Call webhook",
  ai_transform: "AI transform",
};

// Sample workflows for demo
const sampleWorkflows: Workflow[] = [
  {
    id: 1,
    name: "Auto-tag Receipts",
    description: "Automatically tag uploaded images with 'receipt' and 'finance'",
    emoji: "📄",
    triggerType: "source_created",
    actions: [
      { type: "tag", config: { tags: ["receipt", "finance"] } },
    ],
    isActive: true,
    runCount: 23,
    lastRunAt: "2024-01-15T10:30:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Video Auto-Process",
    description: "Transcribe and summarize all uploaded videos",
    emoji: "🎬",
    triggerType: "source_created",
    actions: [
      { type: "transcribe", config: {} },
      { type: "summarize", config: { maxLength: 300 } },
    ],
    isActive: true,
    runCount: 8,
    lastRunAt: "2024-01-14T16:20:00Z",
    createdAt: "2024-01-05T00:00:00Z",
  },
  {
    id: 3,
    name: "Daily Newsletter",
    description: "Generate a summary of yesterday's sources every morning",
    emoji: "📰",
    triggerType: "scheduled",
    actions: [
      { type: "ai_transform", config: { prompt: "Create a daily digest", outputField: "summary" } },
      { type: "send_notification", config: { message: "Your daily summary is ready!" } },
    ],
    isActive: false,
    runCount: 45,
    lastRunAt: "2024-01-10T09:00:00Z",
    createdAt: "2023-12-01T00:00:00Z",
  },
];

export default function WorkflowsList() {
  const [workflows, setWorkflows] = useState<Workflow[]>(sampleWorkflows);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const toggleWorkflow = (id: number) => {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, isActive: !w.isActive } : w
      )
    );
    toast.success("Workflow updated");
  };

  const deleteWorkflow = (id: number) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    toast.success("Workflow deleted");
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automate actions when sources are created, updated, or on a schedule
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Workflow
        </Button>
      </div>

      {/* Workflow Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map((workflow, index) => (
          <motion.div
            key={workflow.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card
              className={cn(
                "h-full transition-all cursor-pointer hover:shadow-md",
                !workflow.isActive && "opacity-75"
              )}
              onClick={() => setEditingWorkflow(workflow)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{workflow.emoji}</span>
                    <div>
                      <CardTitle className="text-base font-medium">
                        {workflow.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {workflow.runCount} runs
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={workflow.isActive}
                    onCheckedChange={(e) => {
                      e.stopPropagation();
                      toggleWorkflow(workflow.id);
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {workflow.description}
                </p>

                {/* Trigger */}
                <div className="flex items-center gap-2 text-sm">
                  <div className="p-1.5 rounded bg-muted">
                    {triggerIcons[workflow.triggerType]}
                  </div>
                  <span className="text-muted-foreground">
                    {triggerLabels[workflow.triggerType]}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5">
                  {workflow.actions.map((action, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {actionIcons[action.type]}
                      <span className="ml-1">{actionLabels[action.type]}</span>
                    </Badge>
                  ))}
                </div>

                {workflow.lastRunAt && (
                  <p className="text-xs text-muted-foreground">
                    Last run: {new Date(workflow.lastRunAt).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            Create workflows to automatically process, tag, and organize your sources
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create your first workflow
          </Button>
        </div>
      )}

      {/* Create Workflow Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              Build an automation that runs when triggers fire
            </DialogDescription>
          </DialogHeader>

          <WorkflowBuilder
            onSave={(workflow) => {
              setWorkflows((prev) => [
                ...prev,
                { ...workflow, id: Date.now(), runCount: 0, createdAt: new Date().toISOString() },
              ]);
              setIsCreateOpen(false);
              toast.success("Workflow created");
            }}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Workflow Dialog */}
      <Dialog open={!!editingWorkflow} onOpenChange={() => setEditingWorkflow(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>Edit Workflow</DialogTitle>
          </DialogHeader>
          {editingWorkflow && (
            <WorkflowBuilder
              initialWorkflow={editingWorkflow}
              onSave={(updated) => {
                setWorkflows((prev) =>
                  prev.map((w) => (w.id === editingWorkflow.id ? { ...updated, id: w.id } : w))
                );
                setEditingWorkflow(null);
                toast.success("Workflow updated");
              }}
              onCancel={() => setEditingWorkflow(null)}
              onDelete={() => deleteWorkflow(editingWorkflow.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Workflow Builder Component
interface WorkflowBuilderProps {
  initialWorkflow?: Workflow;
  onSave: (workflow: Omit<Workflow, "id" | "runCount" | "createdAt">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function WorkflowBuilder({ initialWorkflow, onSave, onCancel, onDelete }: WorkflowBuilderProps) {
  const [name, setName] = useState(initialWorkflow?.name ?? "");
  const [description, setDescription] = useState(initialWorkflow?.description ?? "");
  const [emoji, setEmoji] = useState(initialWorkflow?.emoji ?? "🤖");
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialWorkflow?.triggerType ?? "source_created"
  );
  const [actions, setActions] = useState<WorkflowAction[]>(
    initialWorkflow?.actions ?? []
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleAddAction = (type: ActionType) => {
    const defaultConfig: Record<ActionType, Record<string, unknown>> = {
      tag: { tags: [] },
      move_to_folder: { folderId: null },
      summarize: { maxLength: 300 },
      transcribe: {},
      extract_entities: { entityTypes: ["person", "organization", "location"] },
      send_notification: { message: "", notifyType: "toast" },
      webhook: { url: "", method: "POST", headers: {} },
      ai_transform: { prompt: "", outputField: "summary" },
    };

    setActions([...actions, { type, config: defaultConfig[type] }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a workflow name");
      return;
    }
    if (actions.length === 0) {
      toast.error("Please add at least one action");
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      emoji,
      triggerType,
      actions,
      isActive: true,
      lastRunAt: undefined,
    });
  };

  return (
    <div className="flex flex-col h-[70vh]">
      <ScrollArea className="flex-1 p-6">
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="space-y-2">
                <Label>Emoji</Label>
                <Input
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  maxLength={4}
                  className="text-center text-2xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Workflow Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Auto-tag Receipts"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-base">Trigger</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(triggerLabels) as TriggerType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTriggerType(type)}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border text-left transition-colors",
                      triggerType === type
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="p-2 rounded bg-muted">{triggerIcons[type]}</div>
                    <div>
                      <div className="font-medium text-sm">{triggerLabels[type]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base">Actions</Label>
              <p className="text-sm text-muted-foreground">
                What should happen when the trigger fires?
              </p>

              {actions.length > 0 && (
                <div className="space-y-2">
                  {actions.map((action, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        {actionIcons[action.type]}
                        <span>{actionLabels[action.type]}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAction(index)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(actionLabels) as ActionType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleAddAction(type)}
                    className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  >
                    {actionIcons[type]}
                    <span className="text-sm">{actionLabels[type]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <div className="font-medium">{name}</div>
                  <div className="text-sm text-muted-foreground">{description}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">
                  {triggerIcons[triggerType]}
                  <span className="ml-1">{triggerLabels[triggerType]}</span>
                </Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{actions.length} actions</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Workflow Actions</Label>
              {actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                  {actionIcons[action.type]}
                  <span className="text-sm">{actionLabels[action.type]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

      <div className="p-6 border-t flex justify-between">
        <div>
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSave}>
              <Zap className="w-4 h-4 mr-2" /> Create Workflow
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
