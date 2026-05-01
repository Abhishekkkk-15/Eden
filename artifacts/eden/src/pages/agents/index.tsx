import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAgents,
  useCreateAgent,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function AgentsList() {
  const { data: agents, isLoading } = useListAgents();
  const createAgent = useCreateAgent();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");
  const [prompt, setPrompt] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
    setEmoji("");
    setPrompt("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAgent.mutate(
      {
        data: {
          name: name.trim(),
          description: description.trim(),
          emoji: emoji.trim(),
          prompt: prompt.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Agent created");
          setOpen(false);
          reset();
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        },
        onError: () => toast.error("Failed to create agent"),
      },
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Reusable AI personas with their own system prompt.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an agent</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-[80px_1fr] gap-3">
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <Input
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={4}
                    placeholder="✨"
                    className="text-center text-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Research Analyst"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this agent is good at"
                />
              </div>
              <div className="space-y-2">
                <Label>System prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  required
                  rows={6}
                  placeholder="You are a careful research analyst. Cite specifics from the workspace context. Keep answers under 200 words."
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createAgent.isPending}
              >
                Create agent
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !agents?.length ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Briefcase className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <h3 className="text-lg font-medium">No agents yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create reusable AI personas tailored to your workflow.
          </p>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Create your first agent
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="hover-elevate cursor-pointer h-full transition-colors">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl leading-none">
                      {agent.emoji || "✨"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {agent.description || "No description"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
