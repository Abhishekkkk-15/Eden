import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetConversation,
  useDeleteConversation,
  getGetConversationQueryKey,
  getListConversationsQueryKey,
  getGetRecentActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  type ChatContextItem,
  type Citation,
  type Message,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ChatWorkspacePicker } from "@/components/chat/chat-workspace-picker";
import {
  attachmentFromContextItem,
  attachmentFromDrag,
  parseWorkspaceDragJson,
  type ChatAttachment,
} from "@/lib/workspace-chat-bridge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, FileText, Database, Sparkles, FolderOpen, Trash2, Paperclip, X, WandSparkles } from "lucide-react";
import { toast } from "sonner";

function chatPostHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface PendingMessage {
  role: "user" | "assistant";
  content: string;
  contextItems: ChatContextItem[];
  citations: Citation[];
}

type ChatMode = "default" | "repurpose";

export default function ChatDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { data: conversation, isLoading } = useGetConversation(id);
  const deleteConversation = useDeleteConversation();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [composerDragOver, setComposerDragOver] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("default");
  const [, navigate] = useLocation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const attachmentKeys = useMemo(() => new Set(attachments.map((a) => a.key)), [attachments]);

  const addAttachment = useCallback((a: ChatAttachment) => {
    setAttachments((prev) => (prev.some((x) => x.key === a.key) ? prev : [...prev, a]));
  }, []);

  const removeAttachment = useCallback((key: string) => {
    setAttachments((prev) => prev.filter((x) => x.key !== key));
  }, []);

  const messages = useMemo<(Message | PendingMessage)[]>(() => {
    const persisted = conversation?.messages ?? [];
    return [...persisted, ...pending];
  }, [conversation?.messages, pending]);

  useEffect(() => {
    const persisted = conversation?.messages ?? [];
    for (let i = persisted.length - 1; i >= 0; i--) {
      const msg = persisted[i]!;
      if (msg.role !== "user" || !msg.contextItems || msg.contextItems.length === 0) continue;
      setAttachments(msg.contextItems.map((item) => attachmentFromContextItem(item)));
      return;
    }
    setAttachments([]);
  }, [conversation?.id, conversation?.messages]);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length, pending]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || streaming) return;

    setInput("");
    setStreaming(true);
    const contextPayload = attachments.map((a) => ({ type: a.apiType, id: a.id }));
    setPending([
      {
        role: "user",
        content,
        contextItems: attachments.map((a) => ({ type: a.apiType, id: a.id, title: a.title })),
        citations: [],
      },
      { role: "assistant", content: "", contextItems: [], citations: [] },
    ]);

    try {
      const url = `${import.meta.env.BASE_URL}api/conversations/${id}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: chatPostHeaders(),
        body: JSON.stringify({
          content,
          chatMode,
          ...(contextPayload.length > 0 ?
            {
              contextItems: attachments.map((a) => ({
                type: a.apiType,
                id: a.id,
                title: a.title,
              })),
            }
          : {}),
        }),
      });
      if (res.status === 401) {
        toast.error("Session expired — sign in again.");
        throw new Error("Unauthorized");
      }
      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) {
          done = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 2);
          if (!raw.startsWith("data:")) continue;
          const json = raw.slice(5).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json) as {
              content?: string;
              citations?: Citation[];
              done?: boolean;
            };
            if (event.content) {
              setPending((prev) => {
                if (prev.length === 0) return prev;
                const next = [...prev];
                const last = next[next.length - 1]!;
                next[next.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
                return next;
              });
            }
            if (event.citations) {
              setPending((prev) => {
                if (prev.length === 0) return prev;
                const next = [...prev];
                const last = next[next.length - 1]!;
                next[next.length - 1] = { ...last, citations: event.citations! };
                return next;
              });
            }
            if (event.done) {
              done = true;
              break;
            }
          } catch {
            // ignore malformed event
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Streaming failed");
    } finally {
      setStreaming(false);
      setPending([]);
      await queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    }
  };

  const handleCitationClick = (c: Citation) => {
    if (c.kind === "page") navigate(`/pages/${c.refId}`);
    else navigate(`/sources/${c.refId}`);
  };

  const handleConfirmDelete = () => {
    deleteConversation.mutate(
      { id },
      {
        onSuccess: async () => {
          setDeleteOpen(false);
          await queryClient.removeQueries({ queryKey: getGetConversationQueryKey(id) });
          await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          await queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast.success("Conversation deleted");
          navigate("/chat");
        },
        onError: () => toast.error("Could not delete conversation"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-[100dvh]">
        <div className="px-8 py-5 border-b border-border">
          <Skeleton className="h-5 w-1/3" />
        </div>
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-24 w-3/4 ml-auto" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-10 text-muted-foreground">Conversation not found.</div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[100dvh]">
      <div className="px-8 py-5 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/chat" className="text-xs text-muted-foreground hover:text-foreground">
              {"←"} All conversations
            </Link>
            <h1 className="text-lg font-semibold tracking-tight mt-1 truncate">
              {conversation.title}
            </h1>
            {attachments.length > 0 ?
              <p className="mt-1 text-xs text-muted-foreground">
                {attachments.length} workspace item{attachments.length === 1 ? "" : "s"} pinned for
                your next message — drop more from{" "}
                <Link href="/sources" className="underline hover:text-foreground">
                  Sources
                </Link>{" "}
                or use Add.
              </p>
            : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {isEmpty && (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 mb-3 opacity-60" />
              <p className="text-sm">Ask anything about your workspace.</p>
              <p className="text-xs mt-1 opacity-70 max-w-sm mx-auto">
                Drag folders or files from{" "}
                <Link href="/sources" className="underline hover:text-foreground">
                  My Drive
                </Link>{" "}
                into the box below, or use Add — then ask for summaries, plans, or next steps.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-[11px]">
                <WandSparkles className="h-3.5 w-3.5 text-primary" />
                Tip: switch to Repurpose Studio for multi-platform outputs.
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={`${("id" in m && m.id) || "p"}-${i}`}
              role={m.role}
              content={m.content}
              contextItems={m.contextItems ?? []}
              citations={m.citations ?? []}
              onCitationClick={handleCitationClick}
              isStreaming={
                streaming &&
                i === messages.length - 1 &&
                m.role === "assistant"
              }
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div
            className={`rounded-xl border bg-card/40 p-3 transition-colors ${
              composerDragOver ? "border-primary ring-2 ring-primary/20" : "border-border/80"
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              setComposerDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setComposerDragOver(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setComposerDragOver(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setComposerDragOver(false);
              const raw = e.dataTransfer.getData("application/json");
              const p = parseWorkspaceDragJson(raw);
              if (!p) {
                toast.error("Drop items from Sources (My Drive) — folders, documents, or files.");
                return;
              }
              addAttachment(attachmentFromDrag(p));
              toast.success("Added to chat context");
            }}>
            {attachments.length > 0 ?
              <div className="mb-3 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <Badge
                    key={a.key}
                    variant="secondary"
                    className="gap-1 pr-1 font-normal max-w-[220px]">
                    <span className="truncate">
                      {a.apiType === "folder" ?
                        <FolderOpen className="inline h-3 w-3 mr-1 align-text-bottom" />
                      : a.apiType === "page" ?
                        <FileText className="inline h-3 w-3 mr-1 align-text-bottom" />
                      : <Database className="inline h-3 w-3 mr-1 align-text-bottom" />}
                      {a.title}
                    </span>
                    <button
                      type="button"
                      className="ml-0.5 rounded-sm p-0.5 hover:bg-background/80"
                      aria-label={`Remove ${a.title}`}
                      onClick={() => removeAttachment(a.key)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            : null}
            <div className="flex gap-2 items-end">
              <div className="mb-0.5 flex shrink-0 items-center gap-1 rounded-lg border border-border/70 bg-background/80 p-1">
                <button
                  type="button"
                  onClick={() => setChatMode("default")}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    chatMode === "default" ?
                      "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  }`}>
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode("repurpose")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    chatMode === "repurpose" ?
                      "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <WandSparkles className="h-3 w-3" />
                  Repurpose
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={streaming}
                aria-label="Add workspace items"
                onClick={() => setPickerOpen(true)}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={
                  attachments.length ?
                    "Ask for a summary, plan, risks, timeline…"
                  : "Ask Eden anything…"
                }
                rows={1}
                className="resize-none min-h-[44px] max-h-40 flex-1"
                disabled={streaming}
              />
              <Button
                onClick={() => void handleSend()}
                disabled={streaming || !input.trim()}
                size="icon"
                className="h-11 w-11 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {composerDragOver ?
                "Drop folder or file here…"
              : streaming ?
                "Eden is thinking…"
              : chatMode === "repurpose" ?
                "Repurpose Studio is on. Ask for threads, scripts, carousels, newsletters, and CTAs."
              : "Press Enter to send. Drag from My Drive or use the clip to attach."}
            </p>
          </div>
        </div>
      </div>

      <ChatWorkspacePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addAttachment}
        existingKeys={attachmentKeys}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              All messages in &ldquo;{conversation.title}&rdquo; will be removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConversation.isPending}
              onClick={() => handleConfirmDelete()}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CitationReferences({
  citations,
  onCitationClick,
}: {
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
}) {
  const pages = citations.filter((c) => c.kind === "page");
  const files = citations.filter((c) => c.kind === "source");

  const row = (c: Citation, i: number) => (
    <HoverCard key={`${c.kind}-${c.refId}-${i}`} openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => onCitationClick(c)}
          className="w-full rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/30 hover:bg-accent/40">
          <div className="flex items-center gap-2">
            {c.kind === "page" ?
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
            : <Database className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="text-sm font-medium leading-tight text-foreground">{c.title}</span>
          </div>
          {c.snippet ?
            <p className="mt-1.5 pl-[22px] text-xs leading-snug text-muted-foreground line-clamp-2">
              {c.snippet.replace(/[<>]/g, "")}
            </p>
          : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[360px] space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          {c.kind === "page" ? <FileText className="h-3.5 w-3.5 text-primary" /> : <Database className="h-3.5 w-3.5 text-primary" />}
          <span className="truncate">{c.title}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {c.snippet?.replace(/[<>]/g, "") || "No preview available."}
        </p>
        <p className="text-[11px] text-muted-foreground">Click to open this source</p>
      </HoverCardContent>
    </HoverCard>
  );

  return (
    <div className="w-full max-w-[95%] space-y-3">
      {files.length > 0 ?
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <FolderOpen className="h-3 w-3" />
            Files &amp; sources
          </div>
          <div className="space-y-2">{files.map((c, i) => row(c, i))}</div>
        </div>
      : null}
      {pages.length > 0 ?
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3 w-3" />
            Pages
          </div>
          <div className="space-y-2">{pages.map((c, i) => row(c, i))}</div>
        </div>
      : null}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  contextItems,
  citations,
  onCitationClick,
  isStreaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  contextItems: ChatContextItem[];
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
  isStreaming: boolean;
}) {
  if (role === "system") return null;
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        <div
          className={`rounded-2xl px-4 py-2.5 whitespace-pre-wrap text-[15px] leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-current/60 animate-pulse" />
          )}
          {!content && !isStreaming && (
            <span className="text-muted-foreground italic">empty</span>
          )}
        </div>
        {isUser && contextItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-w-[95%]">
            {contextItems.map((ctx, i) => (
              <Badge key={`${ctx.type}-${ctx.id}-${i}`} variant="secondary" className="font-normal">
                {ctx.type === "folder" ?
                  <FolderOpen className="h-3 w-3 mr-1" />
                : ctx.type === "page" ?
                  <FileText className="h-3 w-3 mr-1" />
                : <Database className="h-3 w-3 mr-1" />}
                {ctx.title || `${ctx.type} #${ctx.id}`}
              </Badge>
            ))}
          </div>
        )}
        {!isUser && citations.length > 0 && (
          <CitationReferences citations={citations} onCitationClick={onCitationClick} />
        )}
      </div>
    </div>
  );
}
