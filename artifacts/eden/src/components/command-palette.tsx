import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  FileText, 
  Database, 
  MessageSquare, 
  Bot,
  Plus,
  Sparkles,
  History,
  ArrowRight,
  Zap,
  Keyboard,
  X
} from "lucide-react";
import { 
  useListPages, 
  useListSources, 
  useListAgents,
  useSearchWorkspace 
} from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface RecentItem {
  id: string;
  type: 'page' | 'source' | 'agent';
  title: string;
  timestamp: number;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [, setLocation] = useLocation();
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  // Load recently viewed
  useEffect(() => {
    const stored = localStorage.getItem("eden_recent_items");
    if (stored) {
      setRecentItems(JSON.parse(stored));
    }
  }, [open]);

  const addToRecent = (item: Omit<RecentItem, 'timestamp'>) => {
    const newItem = { ...item, timestamp: Date.now() };
    const filtered = recentItems.filter(i => i.id !== item.id);
    const updated = [newItem, ...filtered].slice(0, 5);
    setRecentItems(updated);
    localStorage.setItem("eden_recent_items", JSON.stringify(updated));
  };

  // Data fetching
  const { data: pages } = useListPages();
  const { data: sources } = useListSources();
  const { data: agents } = useListAgents();
  const { data: searchHits, isLoading: isSearching } = useSearchWorkspace(
    { q: debouncedQuery },
    { query: { enabled: debouncedQuery.length > 2 } }
  );

  const pageList = Array.isArray(pages) ? pages : [];
  const sourceList = Array.isArray(sources) ? sources : [];
  const agentList = Array.isArray(agents) ? agents : [];

  const isCommand = query.length > 3 && (
    query.toLowerCase().startsWith("summarize") || 
    query.toLowerCase().startsWith("add") ||
    query.toLowerCase().startsWith("analyze") ||
    query.toLowerCase().startsWith("ask")
  );

  const handleSelect = (callback: () => void, item?: Omit<RecentItem, 'timestamp'>) => {
    if (item) addToRecent(item);
    callback();
    setOpen(false);
    setQuery("");
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <Command className="w-full bg-transparent" label="Global Search" loop>
              <div className="flex items-center px-4 py-3 border-b border-white/5 gap-3">
                <div className="relative flex items-center justify-center w-6 h-6">
                  {isSearching ? (
                    <Zap className="w-4 h-4 text-primary animate-pulse" />
                  ) : (
                    <Search className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <Command.Input 
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  className="flex-1 h-10 bg-transparent text-slate-100 placeholder:text-slate-500 outline-none text-base" 
                  placeholder="Search pages, sources, or type a command..." 
                />
                <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-medium text-slate-500 uppercase tracking-wider select-none">
                  <Keyboard className="w-2.5 h-2.5" />
                  <span>K</span>
                </div>
              </div>

              <Command.List className="max-h-[60vh] overflow-y-auto p-2 scrollbar-none">
                <Command.Empty className="py-12 text-center">
                  <div className="flex flex-col items-center gap-3 opacity-50">
                    <Search className="w-8 h-8" />
                    <p className="text-sm">No results found for "{query}"</p>
                  </div>
                </Command.Empty>
                
                {query.length > 0 && (
                  <Command.Group heading="Actions">
                    <Command.Item 
                      onSelect={() => handleSelect(() => {
                        setLocation(`/chat?q=${encodeURIComponent(query)}`);
                      })}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 aria-selected:bg-white/10 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100">Ask Eden AI</div>
                        <div className="text-xs text-slate-400 truncate">"{query}"</div>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <span>Enter</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </Command.Item>
                  </Command.Group>
                )}

                {debouncedQuery.length > 2 && searchHits && searchHits.length > 0 && (
                  <Command.Group heading="Workspace Insights">
                    {searchHits.map((hit) => (
                      <Command.Item 
                        key={`hit-${hit.id}`}
                        onSelect={() => handleSelect(() => {
                          setLocation(hit.kind === 'page' ? `/pages/${hit.id}` : `/sources/${hit.id}`);
                        }, { id: String(hit.id), type: hit.kind as any, title: hit.title })}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 aria-selected:bg-white/10 transition-colors group"
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          hit.kind === 'page' ? "bg-blue-500/10" : "bg-teal-500/10"
                        )}>
                          {hit.kind === 'page' ? (
                            <FileText className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Database className="w-4 h-4 text-teal-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-100 group-aria-selected:text-primary transition-colors">{hit.title}</div>
                          <div className="text-xs text-slate-500 truncate">{hit.snippet}</div>
                        </div>
                        {hit.score && (
                          <div className="text-[10px] font-mono text-slate-600 bg-slate-800/50 px-1.5 py-0.5 rounded">
                            {Math.round(hit.score * 100)}%
                          </div>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {query.length === 0 && recentItems.length > 0 && (
                  <Command.Group heading="Recent">
                    {recentItems.map((item) => (
                      <Command.Item 
                        key={`recent-${item.id}`}
                        onSelect={() => handleSelect(() => {
                          setLocation(`/${item.type}s/${item.id}`);
                        })}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 aria-selected:bg-white/10 transition-colors"
                      >
                        <History className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-300">{item.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Quick Jump">
                  <Command.Item 
                    onSelect={() => handleSelect(() => setLocation("/pages/new"))}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 aria-selected:bg-white/10 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-300">Create new page</span>
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => handleSelect(() => setLocation("/chat"))}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 aria-selected:bg-white/10 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-300">New AI chat</span>
                  </Command.Item>
                </Command.Group>

                {query.length === 0 && (
                  <div className="mt-4 px-3 py-4 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5">↑↓</span>
                        <span>Navigate</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5">↵</span>
                        <span>Open</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-primary/70 font-medium">
                      Magic Search v1.0
                    </div>
                  </div>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
