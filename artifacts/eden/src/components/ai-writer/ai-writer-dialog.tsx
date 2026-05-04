import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  BookOpen,
  Newspaper,
  FileSpreadsheet,
  Sparkles,
  ChevronRight,
  Loader2,
  Check,
  Quote,
  Copy,
} from "lucide-react";
import { useListSources } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { streamChat } from "@/lib/ai";

interface AIWriterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSourceIds?: number[];
  onSave?: (content: string, title: string) => void;
}

type OutputFormat = "article" | "summary" | "bullet_points" | "qa" | "essay" | "custom";
type Tone = "professional" | "casual" | "academic" | "creative" | "technical";

const templates: Record<OutputFormat, { name: string; icon: React.ReactNode; prompt: string }> = {
  article: {
    name: "Blog Article",
    icon: <Newspaper className="w-4 h-4" />,
    prompt: "Write a well-structured blog article based on the provided sources. Include an engaging introduction, clear sections with headings, and a conclusion. Use quotes and references from the sources.",
  },
  summary: {
    name: "Executive Summary",
    icon: <FileText className="w-4 h-4" />,
    prompt: "Create a concise executive summary highlighting the key points, findings, and actionable insights from the sources. Keep it under 500 words.",
  },
  bullet_points: {
    name: "Key Takeaways",
    icon: <FileSpreadsheet className="w-4 h-4" />,
    prompt: "Extract the most important points from the sources as a numbered list of key takeaways. Each point should be clear and actionable.",
  },
  qa: {
    name: "Q&A Format",
    icon: <BookOpen className="w-4 h-4" />,
    prompt: "Transform the source content into a question-and-answer format. Anticipate what readers would want to know and answer based on the sources.",
  },
  essay: {
    name: "Research Essay",
    icon: <Quote className="w-4 h-4" />,
    prompt: "Write an academic-style essay synthesizing the sources. Include a thesis statement, supporting arguments with citations, and a conclusion.",
  },
  custom: {
    name: "Custom",
    icon: <Sparkles className="w-4 h-4" />,
    prompt: "",
  },
};

const tones: Record<Tone, { name: string; description: string }> = {
  professional: { name: "Professional", description: "Business-appropriate, clear and concise" },
  casual: { name: "Casual", description: "Conversational and approachable" },
  academic: { name: "Academic", description: "Formal, scholarly with citations" },
  creative: { name: "Creative", description: "Engaging, storytelling style" },
  technical: { name: "Technical", description: "Precise, detailed, jargon-appropriate" },
};

export function AIWriterDialog({
  open,
  onOpenChange,
  selectedSourceIds = [],
  onSave,
}: AIWriterDialogProps) {
  const { data: sources } = useListSources();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [format, setFormat] = useState<OutputFormat>("article");
  const [tone, setTone] = useState<Tone>("professional");
  const [customPrompt, setCustomPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [includeCitations, setIncludeCitations] = useState(true);
  const [selectedSources, setSelectedSources] = useState<number[]>(selectedSourceIds);
  const [generatedContent, setGeneratedContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const availableSources = useMemo(() => {
    return sources?.filter((s) => s.status === "ready") ?? [];
  }, [sources]);

  const selectedSourceDetails = useMemo(() => {
    return availableSources.filter((s) => selectedSources.includes(s.id));
  }, [availableSources, selectedSources]);

  const handleGenerate = async () => {
    if (selectedSources.length === 0) {
      toast.error("Please select at least one source");
      return;
    }

    setIsGenerating(true);
    setStep(3);
    setGeneratedContent("");

    const sourceContext = selectedSourceDetails
      .map((s, i) => `Source ${i + 1} - "${s.title}":\n${s.summary || "No summary available"}`)
      .join("\n\n---\n\n");

    const promptTemplate = templates[format].prompt;
    const lengthInstruction =
      length === "short" ? "Keep it concise (300-500 words)." :
      length === "medium" ? "Write a moderate length piece (500-1000 words)." :
      "Write a comprehensive piece (1000-2000 words).";

    const citationInstruction = includeCitations
      ? "Include inline citations like [Source 1], [Source 2] when referencing specific information."
      : "";

    const systemPrompt = `You are an expert content writer. ${promptTemplate}

Tone: ${tones[tone].name} - ${tones[tone].description}

${lengthInstruction}
${citationInstruction}

Based on the following sources, generate the requested content:`;

    try {
      const stream = streamChat([
        { role: "system", content: systemPrompt },
        { role: "user", content: format === "custom" ? customPrompt : sourceContext },
      ]);

      for await (const chunk of stream) {
        setGeneratedContent((prev) => prev + chunk);
      }

      toast.success("Content generated successfully!");
    } catch (error) {
      toast.error("Failed to generate content");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const handleSave = () => {
    if (onSave && generatedContent) {
      onSave(generatedContent, title || `AI Generated - ${templates[format].name}`);
      toast.success("Saved to your workspace");
      onOpenChange(false);
      setStep(1);
      setGeneratedContent("");
    }
  };

  const toggleSource = (id: number) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Writer
          </DialogTitle>
          <DialogDescription>
            Generate documents from your sources using AI
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="px-6 py-3 border-b">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    step >= s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {s < step ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
                )}
              </div>
            ))}
            <span className="ml-3 text-sm text-muted-foreground">
              {step === 1 && "Select Sources"}
              {step === 2 && "Configure Output"}
              {step === 3 && "Generate Content"}
            </span>
          </div>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-6 space-y-6">
            {/* Step 1: Source Selection */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base">Select Sources</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Choose the sources to include in your document ({selectedSources.length} selected)
                  </p>
                </div>

                <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
                  {availableSources.map((source) => (
                    <label
                      key={source.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedSources.includes(source.id)
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={selectedSources.includes(source.id)}
                        onCheckedChange={() => toggleSource(source.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{source.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {source.kind} • {source.summary?.slice(0, 60)}...
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={selectedSources.length === 0}
                  >
                    Continue <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Configuration */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Output Format */}
                <div className="space-y-3">
                  <Label className="text-base">Output Format</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(templates) as OutputFormat[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                          format === f
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        )}
                      >
                        {templates[f].icon}
                        <span className="font-medium">{templates[f].name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Prompt */}
                {format === "custom" && (
                  <div className="space-y-2">
                    <Label>Custom Instructions</Label>
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Describe exactly what you want the AI to generate..."
                      rows={4}
                    />
                  </div>
                )}

                {/* Tone */}
                <div className="space-y-3">
                  <Label className="text-base">Tone</Label>
                  <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(tones) as Tone[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          <div>
                            <div className="font-medium">{tones[t].name}</div>
                            <div className="text-xs text-muted-foreground">
                              {tones[t].description}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Length */}
                <div className="space-y-3">
                  <Label className="text-base">Length</Label>
                  <div className="flex gap-2">
                    {(["short", "medium", "long"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLength(l)}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-colors",
                          length === l
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <Label className="text-base">Options</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="citations"
                      checked={includeCitations}
                      onCheckedChange={(checked) => setIncludeCitations(checked as boolean)}
                    />
                    <Label htmlFor="citations" className="cursor-pointer">
                      Include source citations
                    </Label>
                  </div>
                </div>

                {/* Title Input */}
                <div className="space-y-2">
                  <Label>Document Title (optional)</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Leave empty for auto-generated title"
                  />
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={handleGenerate} disabled={format === "custom" && !customPrompt}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Content
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Generated Content */}
            {step === 3 && (
              <div className="space-y-4">
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Generating your document...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">
                        {selectedSources.length} sources used
                      </Badge>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopy}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm leading-relaxed"
                    />

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={() => setStep(2)}>
                        Back
                      </Button>
                      <Button onClick={handleSave} disabled={!generatedContent}>
                        Save to Workspace
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
