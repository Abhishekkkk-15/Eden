import {
  useListConversations,
  useCreateConversation,
  getListConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { MessageSquare, Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function ChatList() {
  const { data: conversations, isLoading } = useListConversations();
  const createConversation = useCreateConversation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleNewChat = () => {
    createConversation.mutate(
      { data: { title: "New Conversation", agentId: null } },
      {
        onSuccess: (c) => {
          queryClient.invalidateQueries({
            queryKey: getListConversationsQueryKey(),
          });
          setLocation(`/chat/${c.id}`);
        },
      },
    );
  };

  return (
    <div className="flex h-full">
      <div className="w-80 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold tracking-tight text-sidebar-foreground">
            Conversations
          </h2>
          <Button size="icon" variant="ghost" onClick={handleNewChat}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ?
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))
          : conversations?.map((c) => (
              <Link key={c.id} href={`/chat/${c.id}`}>
                <div className="p-3 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors space-y-1">
                  <div className="flex items-center gap-2 font-medium text-sm text-sidebar-foreground truncate">
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>{c.messageCount} msgs</span>
                    <span>{format(new Date(c.updatedAt), "MMM d")}</span>
                  </div>
                </div>
              </Link>
            ))
          }
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center bg-background/50 p-8 text-center animate-in fade-in duration-500">
        <div className="max-w-md space-y-6">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto">
            <Bot className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Workspace AI Assistant</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ask questions about your pages and sources. The assistant
              automatically searches your workspace to provide accurate, cited
              answers.
            </p>
          </div>
          <Button
            onClick={handleNewChat}
            size="lg"
            className="w-full shadow-sm">
            <Plus className="w-5 h-5 mr-2" /> Start a new chat
          </Button>
        </div>
      </div>
    </div>
  );
}
