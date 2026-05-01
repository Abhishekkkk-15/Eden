import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetConversation,
  getGetConversationQueryKey,
  type Citation,
  type Message,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, FileText, Database, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface PendingMessage {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
}

export default function ChatDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { data: conversation, isLoading } = useGetConversation(id);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [, navigate] = useLocation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = useMemo<(Message | PendingMessage)[]>(() => {
    const persisted = conversation?.messages ?? [];
    return [...persisted, ...pending];
  }, [conversation?.messages, pending]);

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
    setPending([
      { role: "user", content, citations: [] },
      { role: "assistant", content: "", citations: [] },
    ]);

    try {
      const url = `${import.meta.env.BASE_URL}api/conversations/${id}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
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
      await queryClient.invalidateQueries({ queryKey: ["/conversations"] });
    }
  };

  const handleCitationClick = (c: Citation) => {
    if (c.kind === "page") navigate(`/pages/${c.refId}`);
    else navigate(`/sources/${c.refId}`);
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
        <Link href="/chat" className="text-xs text-muted-foreground hover:text-foreground">
          {"←"} All conversations
        </Link>
        <h1 className="text-lg font-semibold tracking-tight mt-1">
          {conversation.title}
        </h1>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {isEmpty && (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 mb-3 opacity-60" />
              <p className="text-sm">Ask anything about your workspace.</p>
              <p className="text-xs mt-1 opacity-70">
                Eden grounds answers in your pages and sources when relevant.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={`${("id" in m && m.id) || "p"}-${i}`}
              role={m.role}
              content={m.content}
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
          <div className="flex gap-2 items-end">
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
              placeholder="Ask Eden anything…"
              rows={1}
              className="resize-none min-h-[44px] max-h-40"
              disabled={streaming}
            />
            <Button
              onClick={() => void handleSend()}
              disabled={streaming || !input.trim()}
              size="icon"
              className="h-11 w-11"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {streaming ? "Eden is thinking…" : "Press Enter to send, Shift+Enter for newline."}
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  citations,
  onCitationClick,
  isStreaming,
}: {
  role: "user" | "assistant" | "system";
  content: string;
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
        {!isUser && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {citations.map((c, i) => (
              <button
                key={`${c.kind}-${c.refId}-${i}`}
                type="button"
                onClick={() => onCitationClick(c)}
                className="group"
              >
                <Badge
                  variant="outline"
                  className="gap-1.5 hover:bg-accent transition-colors"
                >
                  {c.kind === "page" ? (
                    <FileText className="h-3 w-3" />
                  ) : (
                    <Database className="h-3 w-3" />
                  )}
                  <span className="font-normal">{c.title}</span>
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
