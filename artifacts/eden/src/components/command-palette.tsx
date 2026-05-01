import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Command } from "cmdk";
import { 
  Search, 
  FileText, 
  Database, 
  MessageSquare, 
  Bot,
  Plus
} from "lucide-react";
import { useListPages, useListSources, useListAgents } from "@workspace/api-client-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: pages } = useListPages();
  const pageList = Array.isArray(pages) ? pages : [];
  const { data: sources } = useListSources();
  const { data: agents } = useListAgents();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh]">
      <div className="w-full max-w-xl bg-background rounded-xl shadow-2xl border overflow-hidden">
        <Command className="w-full" label="Command Menu" loop>
          <div className="flex items-center px-3 border-b">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input 
              autoFocus
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" 
              placeholder="Search or jump to..." 
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm">No results found.</Command.Empty>
            
            <Command.Group heading="Quick Actions">
              <Command.Item onSelect={() => { setLocation("/pages/new"); setOpen(false); }} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-accent aria-selected:bg-accent text-sm">
                <Plus className="mr-2 h-4 w-4" /> New Page
              </Command.Item>
              <Command.Item onSelect={() => { setLocation("/chat"); setOpen(false); }} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-accent aria-selected:bg-accent text-sm">
                <MessageSquare className="mr-2 h-4 w-4" /> New Chat
              </Command.Item>
            </Command.Group>

            {pageList.length > 0 && (
              <Command.Group heading="Pages">
                {pageList.map((p) => (
                  <Command.Item key={`page-${p.id}`} onSelect={() => { setLocation(`/pages/${p.id}`); setOpen(false); }} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-accent aria-selected:bg-accent text-sm">
                    <FileText className="mr-2 h-4 w-4 text-primary/70" /> 
                    {p.emoji ? <span className="mr-2">{p.emoji}</span> : null}
                    {p.title}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {sources && sources.length > 0 && (
              <Command.Group heading="Sources">
                {sources.map((s) => (
                  <Command.Item key={`source-${s.id}`} onSelect={() => { setLocation(`/sources/${s.id}`); setOpen(false); }} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-accent aria-selected:bg-accent text-sm">
                    <Database className="mr-2 h-4 w-4 text-primary/70" /> {s.title}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {agents && agents.length > 0 && (
              <Command.Group heading="Agents">
                {agents.map((a) => (
                  <Command.Item key={`agent-${a.id}`} onSelect={() => { setLocation(`/agents/${a.id}`); setOpen(false); }} className="flex items-center p-2 rounded-md cursor-pointer hover:bg-accent aria-selected:bg-accent text-sm">
                    <Bot className="mr-2 h-4 w-4 text-primary/70" /> 
                    {a.emoji ? <span className="mr-2">{a.emoji}</span> : null}
                    {a.name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

          </Command.List>
        </Command>
      </div>
      <div className="fixed inset-0 -z-10" onClick={() => setOpen(false)}></div>
    </div>
  );
}
