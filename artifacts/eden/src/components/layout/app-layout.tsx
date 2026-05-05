import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Home, 
  Database, 
  MessageSquare, 
  Bot, 
  Plus,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Zap,
  Settings,
} from "lucide-react";
import { useListPages, useCreatePage, getListPagesQueryKey } from "@workspace/api-client-react";
import { CommandPalette } from "../command-palette";
import { useQueryClient } from "@tanstack/react-query";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: pages } = useListPages();
  const pageList = Array.isArray(pages)
    ? pages.filter((page) => page.kind === "page")
    : [];
  const createPage = useCreatePage();
  const queryClient = useQueryClient();

  const handleNewPage = () => {
    createPage.mutate({ data: { title: "Untitled", kind: "page" } }, {
      onSuccess: (p) => {
        queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
        setLocation(`/pages/${p.id}`);
      }
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Database, label: "Sources", href: "/sources" },
    { icon: MessageSquare, label: "Chat", href: "/chat" },
    { icon: Bot, label: "Agents", href: "/agents" },
    { icon: Zap, label: "Workflows", href: "/workflows" },
    { icon: Settings, label: "Settings", href: "/settings/integrations" },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <CommandPalette />
      
      {/* Sidebar */}
      <div 
        className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'w-64' : 'w-0 opacity-0'} overflow-hidden shrink-0`}
      >
        <div className="p-4 flex items-center gap-2 text-sidebar-foreground font-semibold">
          <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs">E</div>
          <span>Eden Workspace</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-4 space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${location === item.href || (item.href === "/sources" && location.startsWith("/sources")) ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            ))}
          </div>

        </div>

        <div className="p-4 border-t border-sidebar-border space-y-4">
          <div className="flex items-center gap-2 justify-center text-xs text-sidebar-foreground/50">
            <kbd className="bg-sidebar-accent px-1.5 py-0.5 rounded border border-sidebar-border shadow-sm">⌘</kbd>
            <kbd className="bg-sidebar-accent px-1.5 py-0.5 rounded border border-sidebar-border shadow-sm">K</kbd>
            <span>command palette</span>
          </div>
          
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-sm text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-10 p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
        </button>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
