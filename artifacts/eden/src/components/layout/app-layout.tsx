import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Home, 
  Search, 
  Database, 
  MessageSquare, 
  Bot, 
  Plus,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
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

  const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Search, label: "Search", href: "/search" },
    { icon: Database, label: "Sources", href: "/sources" },
    { icon: MessageSquare, label: "Chat", href: "/chat" },
    { icon: Bot, label: "Agents", href: "/agents" },
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
                <div className={`flex items-center gap-3 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${location === item.href ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            ))}
          </div>

          <div className="px-3">
            <div className="flex items-center justify-between px-2 py-1 group">
              <span className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">Pages</span>
              <button onClick={handleNewPage} className="text-sidebar-foreground/50 hover:text-sidebar-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {pageList.map((p) => (
                <Link key={p.id} href={`/pages/${p.id}`}>
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${location === `/pages/${p.id}` ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
                    <FileText className="w-4 h-4 opacity-50" />
                    <span className="truncate">{p.emoji ? `${p.emoji} ` : ''}{p.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/50">
          <div className="flex items-center gap-2 justify-center">
            <kbd className="bg-sidebar-accent px-1.5 py-0.5 rounded border border-sidebar-border shadow-sm">⌘</kbd>
            <kbd className="bg-sidebar-accent px-1.5 py-0.5 rounded border border-sidebar-border shadow-sm">K</kbd>
            <span>to search</span>
          </div>
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
