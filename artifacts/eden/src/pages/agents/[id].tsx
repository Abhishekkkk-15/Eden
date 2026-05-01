import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAgents,
  useUpdateAgent,
  useDeleteAgent,
  useRunAgent,
  getListAgentsQueryKey,
  type Citation,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Sparkles, FileText, Database } from "lucide-react";
import { toast } from "sonner";

export default function AgentDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { data: agents, isLoading } = useListAgents();
  const agent = useMemo(() => agents?.find((a) => a.id === id), [agents, id]);
  const queryClient = useQueryClient();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const runAgent = useRunAgent();
  const [, navigate] = useLocation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");
  const [prompt, setPrompt] = useState("");
  const [input, setInput] = useState("");
  const [useContext, setUseContext] = useState(true);
  const [output, setOutput] = useState("");
  const [outputCitations, setOutputCitations] = useState<Citation[]>([]);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description);
      setEmoji(agent.emoji);
      setPrompt(agent.prompt);
    }
  }, [agent?.id]);

  const handleSave = () => {
    updateAgent.mutate(
      {
        id,
        data: {
          name: name.trim(),
          description: description.trim(),
          emoji: emoji.trim(),
          prompt: prompt.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Agent saved");
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        },
        onError: () => toast.error("Failed to save agent"),
      },
    );
  };

  const handleDelete = () => {
    deleteAgent.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Agent deleted");
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
          navigate("/agents");
        },
        onError: () => toast.error("Failed to delete agent"),
      },
    );
  };

  const handleRun = () => {
    if (!input.trim()) return;
    setOutput("");
    setOutputCitations([]);
    runAgent.mutate(
      {
        id,
        data: { input: input.trim(), useWorkspaceContext: useContext },
      },
      {
        onSuccess: (data) => {
          setOutput(data.output);
          setOutputCitations(data.citations ?? []);
        },
        onError: () => toast.error("Run failed"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-10 text-muted-foreground">
        Agent not found. <Link href="/agents" className="underline">Back to agents</Link>.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="text-4xl leading-none">{emoji || "✨"}</div>
          <div>
            <Link href="/agents" className="text-xs text-muted-foreground hover:text-foreground">
              {"←"} Agents
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">
              {agent.description || "No description"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="space-y-2">
                <Label>Emoji</Label>
                <Input
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  maxLength={4}
                  className="text-center text-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>System prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleSave} disabled={updateAgent.isPending}>
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Input</Label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="Ask the agent to do something…"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Use workspace context</p>
                <p className="text-xs text-muted-foreground">
                  Search pages and sources, then ground the answer.
                </p>
              </div>
              <Switch checked={useContext} onCheckedChange={setUseContext} />
            </div>
            <Button
              onClick={handleRun}
              disabled={runAgent.isPending || !input.trim()}
              className="w-full"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {runAgent.isPending ? "Running…" : "Run agent"}
            </Button>

            {(output || runAgent.isPending) && (
              <div className="space-y-3 pt-2">
                <Label>Output</Label>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[120px]">
                  {runAgent.isPending && !output ? (
                    <span className="text-muted-foreground italic">Thinking…</span>
                  ) : (
                    output
                  )}
                </div>
                {outputCitations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {outputCitations.map((c, i) => (
                      <Link
                        key={`${c.kind}-${c.refId}-${i}`}
                        href={c.kind === "page" ? `/pages/${c.refId}` : `/sources/${c.refId}`}
                      >
                        <Badge variant="outline" className="gap-1.5 hover:bg-accent cursor-pointer">
                          {c.kind === "page" ? (
                            <FileText className="h-3 w-3" />
                          ) : (
                            <Database className="h-3 w-3" />
                          )}
                          <span className="font-normal">{c.title}</span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
