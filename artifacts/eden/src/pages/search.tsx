import { useState, useEffect } from "react";
import { useSearchWorkspace, getSearchWorkspaceQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Search as SearchIcon, FileText, Database, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Search() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialQ = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (debouncedQuery) {
      url.searchParams.set("q", debouncedQuery);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url.toString());
  }, [debouncedQuery]);

  const { data: results, isLoading } = useSearchWorkspace(
    { q: debouncedQuery },
    { query: { enabled: !!debouncedQuery.trim(), queryKey: getSearchWorkspaceQueryKey({ q: debouncedQuery }) } }
  );

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages, sources, and chunks..." 
          className="pl-10 h-12 text-lg bg-card border-card-border shadow-sm"
          autoFocus
        />
      </div>

      <div className="space-y-4">
        {isLoading && !!debouncedQuery.trim() ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : results && results.length > 0 ? (
          results.map((result, i) => {
            const href = result.kind === 'page' || result.kind === 'block' 
              ? `/pages/${result.pageId || result.refId}` 
              : `/sources/${result.sourceId || result.refId}`;
              
            return (
              <Link key={i} href={href}>
                <Card className="hover-elevate cursor-pointer border-card-border transition-colors">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize text-xs">{result.kind}</Badge>
                        <span className="font-medium text-foreground">{result.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">Score: {result.score.toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{result.snippet}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        ) : debouncedQuery.trim() ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No results found for "{debouncedQuery}"</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <SearchIcon className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">Type to search your workspace</p>
          </div>
        )}
      </div>
    </div>
  );
}
