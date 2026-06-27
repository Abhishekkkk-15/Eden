import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  Database,
  MessageSquare,
  Bot,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Zap,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CommandPalette } from "../command-palette";
import { ProcessingStatus, useProcessingJobs } from "../processing-status";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Database, label: "Sources", href: "/sources" },
    { icon: MessageSquare, label: "Chat", href: "/chat" },
    { icon: Bot, label: "Agents", href: "/agents" },
    { icon: Zap, label: "Workflows", href: "/workflows" },
    { icon: Settings, label: "Settings", href: "/settings/integrations" },
  ];

  const { jobs, cancelJob, retryJob, clearJobs } = useProcessingJobs();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <CommandPalette />
      
      {/* Sidebar */}
      <div
        className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'w-64' : 'w-10'} overflow-hidden shrink-0`}
      >
        <div className={`flex items-center min-h-[52px] text-sidebar-foreground font-semibold ${sidebarOpen ? 'justify-between px-3 py-3.5' : 'justify-center py-3.5'}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0">E</div>
              <span className="truncate">Eden Workspace</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="group relative p-1.5 rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <span className="relative block w-4 h-4">
                <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
                  <span className="w-4 h-4 rounded bg-gradient-to-br from-primary to-emerald-600 text-white flex items-center justify-center text-[9px] font-bold shadow-sm">E</span>
                </span>
                <PanelLeftOpen className="w-4 h-4 absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <TooltipProvider delayDuration={200}>
            <div className={`mb-4 space-y-1 ${sidebarOpen ? 'px-3' : 'px-1'}`}>
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href === "/sources" && location.startsWith("/sources"));
                const navItem = (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center rounded-md text-sm cursor-pointer transition-colors
                        ${sidebarOpen ? 'gap-3 px-2 py-1.5' : 'justify-center p-2'}
                        ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {sidebarOpen && item.label}
                    </div>
                  </Link>
                );
                return sidebarOpen ? navItem : (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>

        {sidebarOpen && (
          <div className="p-4 border-t border-sidebar-border space-y-4">
            <div className="flex items-center gap-2 justify-center text-xs text-sidebar-foreground/50">
              <kbd className="bg-sidebar-accent px-1.5 py-0.5 rounded border border-sidebar-border shadow-sm">⌘</kbd>
              <kbd className="bg-sidebar-accent px-1.5 py-0.5 rounded border border-sidebar-border shadow-sm">K</kbd>
              <span>command palette</span>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        <ProcessingStatus
          jobs={jobs}
          onCancel={cancelJob}
          onRetry={retryJob}
          onClear={() => {
            clearJobs();
            toast.success("Notification list cleared");
          }}
        />
      </div>
    </div>
  );
}
