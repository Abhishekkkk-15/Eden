import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useRunWorkflow,
  type Workflow,
} from "@/hooks/use-workflows";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useListPages } from "@workspace/api-client-react";
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
  X,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TriggerType = "source_created" | "source_updated" | "scheduled" | "manual";
type ActionType = "tag" | "generate_tags" | "move_to_folder" | "ai_organize" | "summarize" | "transcribe" | "extract_entities" | "send_notification" | "webhook" | "ai_transform";

interface WorkflowAction {
  type: ActionType;
  config: Record<string, unknown>;
}

type WorkflowWithActions = Workflow & { actions: WorkflowAction[]; };

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
  generate_tags: <Sparkles className="w-4 h-4 text-purple-500" />,
  move_to_folder: <Folder className="w-4 h-4" />,
  ai_organize: <FolderOpen className="w-4 h-4 text-blue-500" />,
  summarize: <Sparkles className="w-4 h-4" />,
  transcribe: <Bot className="w-4 h-4" />,
  extract_entities: <Zap className="w-4 h-4" />,
  send_notification: <Bell className="w-4 h-4" />,
  webhook: <Webhook className="w-4 h-4" />,
  ai_transform: <Sparkles className="w-4 h-4" />,
};

const actionLabels: Record<ActionType, string> = {
  tag: "Add manual tags",
  generate_tags: "AI auto-generate tags",
  move_to_folder: "Move to specific folder",
  ai_organize: "AI auto-organize into folders",
  summarize: "Generate summary",
  transcribe: "Transcribe media",
  extract_entities: "Extract entities",
  send_notification: "Send notification",
  webhook: "Call webhook",
  ai_transform: "AI transform",
};

export default function WorkflowsList() {
  const { data: workflows, isLoading } = useWorkflows();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const runWorkflow = useRunWorkflow();

  const handleToggleWorkflow = async (id: number, currentActive: boolean) => {
    try {
      await updateWorkflow.mutateAsync({ id, data: { isActive: !currentActive } });
      toast.success("Workflow updated");
    } catch {
      toast.error("Failed to update workflow");
    }
  };

  const handleDeleteWorkflow = async (id: number) => {
    try {
      await deleteWorkflow.mutateAsync(id);
      toast.success("Workflow deleted");
    } catch {
      toast.error("Failed to delete workflow");
    }
  };

  const handleRunWorkflow = async (id: number) => {
    try {
      await runWorkflow.mutateAsync(id);
      toast.success("Workflow started");
    } catch {
      toast.error("Failed to run workflow");
    }
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
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows?.map((workflow, index) => (
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
                      onCheckedChange={(checked) => {
                      handleToggleWorkflow(workflow.id, workflow.isActive);
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
                  {workflow.actions.map((action, i) => {
                    const actionType = action.type as ActionType;
                    return (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {actionIcons[actionType]}
                        <span className="ml-1">{actionLabels[actionType]}</span>
                      </Badge>
                    );
                  })}
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
      )}

      {!isLoading && workflows?.length === 0 && (
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
            onSave={async (workflow) => {
              try {
                await createWorkflow.mutateAsync(workflow);
                setIsCreateOpen(false);
                toast.success("Workflow created");
              } catch {
                toast.error("Failed to create workflow");
              }
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
              onSave={async (updated) => {
                try {
                  await updateWorkflow.mutateAsync({
                    id: editingWorkflow.id,
                    data: updated,
                  });
                  setEditingWorkflow(null);
                  toast.success("Workflow updated");
                } catch {
                  toast.error("Failed to update workflow");
                }
              }}
              onCancel={() => setEditingWorkflow(null)}
              onDelete={() => handleDeleteWorkflow(editingWorkflow.id)}
              onRun={() => handleRunWorkflow(editingWorkflow.id)}
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
  onSave: (workflow: Omit<Workflow, "id" | "runCount" | "createdAt" | "updatedAt" | "lastRunAt">) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onRun?: () => void;
}

function WorkflowBuilder({ initialWorkflow, onSave, onCancel, onDelete, onRun }: WorkflowBuilderProps) {
  const { data: pages } = useListPages();
  const folders = Array.isArray(pages) ? pages.filter(p => p.kind === "folder") : [];
  
  const [name, setName] = useState(initialWorkflow?.name ?? "");
  const [description, setDescription] = useState(initialWorkflow?.description ?? "");
  const [emoji, setEmoji] = useState(initialWorkflow?.emoji ?? "🤖");
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialWorkflow?.triggerType ?? "source_created"
  );
  const [actions, setActions] = useState<WorkflowAction[]>(
    (initialWorkflow?.actions as WorkflowAction[]) ?? []
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleAddAction = (type: ActionType) => {
    const defaultConfig: Record<ActionType, Record<string, unknown>> = {
      tag: { tags: [] },
      generate_tags: {},
      move_to_folder: { folderId: null },
      ai_organize: { autoCreate: false },
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
      triggerConfig: {},
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
                      className="space-y-3 p-3 border rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {actionIcons[action.type]}
                          <span className="font-medium">{actionLabels[action.type]}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAction(index)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>

                      {action.type === "tag" && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-xs">Tags to add</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g. urgent, project-x"
                              className="h-8 text-xs"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const val = e.currentTarget.value.trim();
                                  if (val) {
                                    const currentTags = (action.config.tags as string[]) || [];
                                    if (!currentTags.includes(val)) {
                                      const newActions = [...actions];
                                      newActions[index] = {
                                        ...action,
                                        config: { ...action.config, tags: [...currentTags, val] }
                                      };
                                      setActions(newActions);
                                    }
                                    e.currentTarget.value = "";
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {((action.config.tags as string[]) || []).map((tag) => (
                              <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px] flex items-center gap-1">
                                {tag}
                                <X 
                                  className="w-3 h-3 cursor-pointer hover:text-destructive" 
                                  onClick={() => {
                                    const currentTags = (action.config.tags as string[]) || [];
                                    const newActions = [...actions];
                                    newActions[index] = {
                                      ...action,
                                      config: { ...action.config, tags: currentTags.filter(t => t !== tag) }
                                    };
                                    setActions(newActions);
                                  }}
                                />
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {action.type === "generate_tags" && (
                        <div className="space-y-1 pt-2 border-t">
                          <p className="text-[10px] text-muted-foreground italic">
                            AI will analyze the content and automatically assign relevant tags.
                          </p>
                        </div>
                      )}

                      {action.type === "ai_organize" && (
                        <div className="space-y-1 pt-2 border-t">
                          <p className="text-[10px] text-muted-foreground italic">
                            AI will intelligently move files into the most relevant existing folder.
                          </p>
                        </div>
                      )}

                      {action.type === "move_to_folder" && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-xs">Target Folder</Label>
                          <Select
                            value={action.config.folderId?.toString() || "null"}
                            onValueChange={(val) => {
                              const newActions = [...actions];
                              newActions[index] = {
                                ...action,
                                config: { ...action.config, folderId: val === "null" ? null : parseInt(val) }
                              };
                              setActions(newActions);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select folder..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="null">My Drive (root)</SelectItem>
                              {folders.map((f) => (
                                <SelectItem key={f.id} value={f.id.toString()}>
                                  {f.emoji || "📁"} {f.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
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
        <div className="flex gap-2">
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
          {onRun && step === 3 && (
            <Button variant="outline" onClick={onRun}>
              <Play className="w-4 h-4 mr-2" /> Run Now
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
              <Zap className="w-4 h-4 mr-2" /> {initialWorkflow ? "Save Workflow" : "Create Workflow"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
