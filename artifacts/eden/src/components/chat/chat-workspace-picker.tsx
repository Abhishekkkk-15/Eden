import { useMemo, useState } from "react";
import { useListPages, useListSources } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, FileText, Database } from "lucide-react";
import type { ChatAttachment } from "@/lib/workspace-chat-bridge";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: ChatAttachment) => void;
  existingKeys: Set<string>;
};

export function ChatWorkspacePicker({ open, onOpenChange, onPick, existingKeys }: Props) {
  const [q, setQ] = useState("");
  const { data: pages } = useListPages();
  const { data: sources } = useListSources();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pageList = Array.isArray(pages) ? pages : [];
    const sourceList = Array.isArray(sources) ? sources : [];

    type Row = { attach: ChatAttachment; icon: "folder" | "page" | "file"; subtitle: string };
    const out: Row[] = [];

    for (const p of pageList) {
      if (p.kind === "folder") {
        const title = `${p.emoji ? `${p.emoji} ` : ""}${p.title}`;
        const attach: ChatAttachment = {
          key: `folder-${p.id}`,
          apiType: "folder",
          id: p.id,
          title,
        };
        if (
          (!needle || title.toLowerCase().includes(needle)) &&
          !existingKeys.has(attach.key)
        ) {
          out.push({ attach, icon: "folder", subtitle: "Folder" });
        }
      } else if (p.kind === "page") {
        const title = `${p.emoji ? `${p.emoji} ` : ""}${p.title}`;
        const attach: ChatAttachment = {
          key: `page-${p.id}`,
          apiType: "page",
          id: p.id,
          title,
        };
        if (
          (!needle || title.toLowerCase().includes(needle)) &&
          !existingKeys.has(attach.key)
        ) {
          out.push({ attach, icon: "page", subtitle: "Document" });
        }
      }
    }

    for (const s of sourceList) {
      if ("isPage" in s && (s as { isPage?: boolean }).isPage) continue;
      const attach: ChatAttachment = {
        key: `source-${s.id}`,
        apiType: "source",
        id: s.id,
        title: s.title,
      };
      if (
        (!needle || s.title.toLowerCase().includes(needle)) &&
        !existingKeys.has(attach.key)
      ) {
        out.push({ attach, icon: "file", subtitle: s.kind });
      }
    }

    return out.slice(0, 80);
  }, [pages, sources, q, existingKeys]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Add from workspace</DialogTitle>
          <DialogDescription>
            Attach folders, documents, or files. The assistant will focus on them for your next
            messages until you remove them.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9"
        />
        <ScrollArea className="h-[min(50vh,320px)] pr-3">
          <div className="space-y-1">
            {rows.length === 0 ?
              <p className="text-sm text-muted-foreground py-6 text-center">No matching items.</p>
            : rows.map(({ attach, icon, subtitle }) => (
                <Button
                  key={attach.key}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 px-3 py-2.5 font-normal"
                  onClick={() => {
                    onPick(attach);
                    onOpenChange(false);
                    setQ("");
                  }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {icon === "folder" ?
                      <Folder className="h-4 w-4 text-primary" />
                    : icon === "page" ?
                      <FileText className="h-4 w-4 text-primary" />
                    : <Database className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{attach.title}</span>
                    <span className="text-xs text-muted-foreground capitalize">{subtitle}</span>
                  </span>
                </Button>
              ))
            }
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
