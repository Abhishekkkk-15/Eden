import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import Home from "@/pages/home";
import PageEditor from "@/pages/pages/[id]";
import SourcesList from "@/pages/sources/index";
import SourceDetail from "@/pages/sources/[id]";
import Search from "@/pages/search";
import ChatList from "@/pages/chat/index";
import ChatDetail from "@/pages/chat/[id]";
import AgentsList from "@/pages/agents/index";
import AgentDetail from "@/pages/agents/[id]";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/pages/:id" component={PageEditor} />
        <Route path="/sources" component={SourcesList} />
        <Route path="/sources/:id" component={SourceDetail} />
        <Route path="/search" component={Search} />
        <Route path="/chat" component={ChatList} />
        <Route path="/chat/:id" component={ChatDetail} />
        <Route path="/agents" component={AgentsList} />
        <Route path="/agents/:id" component={AgentDetail} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
