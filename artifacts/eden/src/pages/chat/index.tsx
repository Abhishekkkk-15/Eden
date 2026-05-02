import {
  useListConversations,
  useCreateConversation,
  useDeleteConversation,
  getListConversationsQueryKey,
  getGetRecentActivityQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { MessageSquare, Plus, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

export default function ChatList() {
  const { data: conversations, isLoading } = useListConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    title: string;
  } | null>(null);

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

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    deleteConversation.mutate(
      { id },
      {
        onSuccess: async () => {
          setPendingDelete(null);
          await queryClient.invalidateQueries({
            queryKey: getListConversationsQueryKey(),
          });
          await queryClient.invalidateQueries({
            queryKey: getGetRecentActivityQueryKey(),
          });
          await queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          toast.success("Conversation deleted");
        },
        onError: () => {
          toast.error("Could not delete conversation");
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
              <div
                key={c.id}
                className="group flex items-stretch rounded-md transition-colors hover:bg-sidebar-accent">
                <Link href={`/chat/${c.id}`} className="min-w-0 flex-1 p-3">
                  <div className="flex items-center gap-2 font-medium text-sm text-sidebar-foreground truncate">
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between mt-1">
                    <span>{c.messageCount} msgs</span>
                    <span>{format(new Date(c.updatedAt), "MMM d")}</span>
                  </div>
                </Link>
                <div className="flex items-center pr-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    aria-label={`Delete ${c.title}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPendingDelete({ id: c.id, title: c.title });
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
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
              Ask questions about your pages and uploaded files. Each reply searches
              your library and lists the documents and sources it used.
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

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ?
                <>
                  This removes &ldquo;{pendingDelete.title}&rdquo; and all of its messages.
                  This cannot be undone.
                </>
              : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConversation.isPending}
              onClick={() => confirmDelete()}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
