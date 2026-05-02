import { useEffect } from "react";
import { useLocation } from "wouter";

/** Legacy route: workspace search now lives on Sources (My Drive). */
export default function SearchRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const search = window.location.search;
    setLocation(search ? `/sources${search}` : "/sources");
  }, [setLocation]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Opening Sources…
    </div>
  );
}
