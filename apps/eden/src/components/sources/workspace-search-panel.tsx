import { useState, useEffect } from "react";
import { useSearchWorkspace } from "@/hooks/use-search";
import { useLocation } from "wouter";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function WorkspaceSearchPanel({ className }: { className?: string } = {}) {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQ = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentQ = params.get("q") || "";
    
    if (debouncedQuery !== currentQ) {
      if (debouncedQuery.trim()) {
        params.set("q", debouncedQuery);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      const nextPath = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      setLocation(nextPath, { replace: true });
      
      // Also trigger a custom event for local sync if popstate doesn't fire
      window.dispatchEvent(new Event("eden:url-change"));
    }
  }, [debouncedQuery, setLocation]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q") || "";
      setQuery(q);
      setDebouncedQuery(q);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const { data: results, isLoading } = useSearchWorkspace(
    { q: debouncedQuery },
    { enabled: !!debouncedQuery.trim() },
  );

  return (
    <div className={cn("relative max-w-2xl", className)}>
      <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search workspace…"
        className="h-11 border-border/80 bg-background/80 pl-10 shadow-sm backdrop-blur-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/20"
        aria-label="Search workspace"
      />
    </div>
  );
}
