import { useState, useEffect } from "react";
import {
  useSearchWorkspace,
  getSearchWorkspaceQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceSearchPanel() {
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
    if (debouncedQuery.trim()) {
      url.searchParams.set("q", debouncedQuery);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", url.toString());
  }, [debouncedQuery]);

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
    {
      query: {
        enabled: !!debouncedQuery.trim(),
        queryKey: getSearchWorkspaceQueryKey({ q: debouncedQuery }),
      },
    },
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-2xl">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages, sources, and indexed content…"
          className="h-11 border-border/80 bg-background/80 pl-10 shadow-sm backdrop-blur-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-label="Search workspace"
        />
      </div>

      {!!debouncedQuery.trim() && (
        <div className="space-y-3">
          {isLoading ?
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))
          : results && results.length > 0 ?
            results.map((result, i) => {
              const href =
                result.kind === "page" || result.kind === "block" ?
                  `/pages/${result.pageId || result.refId}`
                : `/sources/${result.sourceId || result.refId}`;

              return (
                <Link key={`${href}-${i}`} href={href}>
                  <Card className="border-border/80 bg-card/60 transition-colors hover:border-primary/25 hover:bg-card">
                    <CardContent className="space-y-1.5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="shrink-0 capitalize">
                            {result.kind}
                          </Badge>
                          <span className="truncate font-medium text-foreground">
                            {result.title}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {result.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {result.snippet}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          : <p className="py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          }
        </div>
      )}
    </div>
  );
}
