import { Link } from "wouter";
import { 
  FileText, 
  MessageSquare, 
  Database, 
  Bot,
  Activity,
  Plus
} from "lucide-react";
import { useGetDashboardSummary, useGetRecentActivity, useCreatePage, useCreateConversation } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function Home() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const createPage = useCreatePage();
  const createConversation = useCreateConversation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleNewPage = () => {
    createPage.mutate({ data: { title: "Untitled" } }, {
      onSuccess: (p) => {
        queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
        setLocation(`/pages/${p.id}`);
      }
    });
  };

  const handleNewChat = () => {
    createConversation.mutate({ data: { title: "New Conversation" } }, {
      onSuccess: (c) => {
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        setLocation(`/chat/${c.id}`);
      }
    });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="space-y-2">
        <h1 className="text-3xl font-serif text-foreground tracking-tight">Good morning.</h1>
        <p className="text-muted-foreground">Ready to focus? Your workspace is waiting.</p>
      </header>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover-elevate bg-card border-card-border" onClick={handleNewPage}>
          <FileText className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">New Page</span>
        </Button>
        <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover-elevate bg-card border-card-border" onClick={handleNewChat}>
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">New Chat</span>
        </Button>
        <Link href="/sources">
          <Button variant="outline" className="h-24 w-full flex flex-col items-center justify-center gap-2 hover-elevate bg-card border-card-border">
            <Database className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Add Source</span>
          </Button>
        </Link>
        <Link href="/agents">
          <Button variant="outline" className="h-24 w-full flex flex-col items-center justify-center gap-2 hover-elevate bg-card border-card-border">
            <Bot className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">New Agent</span>
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Recent Activity
            </h2>
          </div>
          
          <div className="space-y-4">
            {isLoadingActivity ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))
            ) : activity && activity.length > 0 ? (
              activity.map((item, i) => (
                <Card key={`${item.kind}-${item.refId}-${i}`} className="bg-card hover-elevate transition-all border-card-border">
                  <Link href={
                    item.kind === 'page' ? `/pages/${item.refId}` :
                    item.kind === 'source' ? `/sources/${item.refId}` :
                    `/chat/${item.refId}`
                  }>
                    <CardContent className="p-4 flex items-start gap-4 cursor-pointer">
                      <div className="p-2 rounded-md bg-muted text-muted-foreground">
                        {item.kind === 'page' && <FileText className="h-4 w-4" />}
                        {item.kind === 'source' && <Database className="h-4 w-4" />}
                        {item.kind === 'conversation' && <MessageSquare className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 border rounded-lg border-dashed">
                <Activity className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Workspace Overview</h2>
          <Card className="bg-card border-card-border">
            <CardContent className="p-0 divide-y divide-border/50">
              {isLoadingSummary ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))
              ) : (
                <>
                  <div className="p-4 flex justify-between items-center group cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setLocation('/pages')}>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground">
                      <FileText className="h-4 w-4" /> Pages
                    </div>
                    <span className="font-medium">{summary?.pageCount || 0}</span>
                  </div>
                  <div className="p-4 flex justify-between items-center group cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setLocation('/sources')}>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground">
                      <Database className="h-4 w-4" /> Sources
                    </div>
                    <span className="font-medium">{summary?.sourceCount || 0}</span>
                  </div>
                  <div className="p-4 flex justify-between items-center group cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setLocation('/agents')}>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground">
                      <Bot className="h-4 w-4" /> Agents
                    </div>
                    <span className="font-medium">{summary?.agentCount || 0}</span>
                  </div>
                  <div className="p-4 flex justify-between items-center group cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setLocation('/chat')}>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground">
                      <MessageSquare className="h-4 w-4" /> Conversations
                    </div>
                    <span className="font-medium">{summary?.conversationCount || 0}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
