import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

export type ShortcutScope = "global" | "sources" | "pages" | "chat";

interface ShortcutDefinition {
  key: string;
  modifiers?: ("ctrl" | "shift" | "alt" | "meta")[];
  scope: ShortcutScope;
  description: string;
  handler: (e: KeyboardEvent) => void | boolean;
  preventDefault?: boolean;
}

// Global shortcut registry
const shortcuts = new Map<string, ShortcutDefinition>();

export function registerShortcut(definition: ShortcutDefinition): () => void {
  const id = `${definition.scope}:${definition.modifiers?.join("+") ?? ""}${definition.key}`;
  shortcuts.set(id, definition);

  // Return unregister function
  return () => {
    shortcuts.delete(id);
  };
}

export function getShortcutsByScope(scope: ShortcutScope): ShortcutDefinition[] {
  return Array.from(shortcuts.values()).filter((s) => s.scope === scope || s.scope === "global");
}

export function formatShortcut(shortcut: ShortcutDefinition): string {
  const parts: string[] = [];

  if (shortcut.modifiers?.includes("ctrl")) parts.push("Ctrl");
  if (shortcut.modifiers?.includes("shift")) parts.push("Shift");
  if (shortcut.modifiers?.includes("alt")) parts.push("Alt");
  if (shortcut.modifiers?.includes("meta")) parts.push("⌘");

  parts.push(shortcut.key.toUpperCase());

  return parts.join("+");
}

export function useKeyboardShortcuts(
  scope: ShortcutScope,
  customShortcuts?: Omit<ShortcutDefinition, "scope">[]
) {
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts in input fields unless specifically allowed
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      // Check all shortcuts that match this scope
      for (const shortcut of shortcuts.values()) {
        if (shortcut.scope !== scopeRef.current && shortcut.scope !== "global") {
          continue;
        }

        // Check modifiers
        const ctrl = shortcut.modifiers?.includes("ctrl") ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const shift = shortcut.modifiers?.includes("shift") ? e.shiftKey : !e.shiftKey;
        const alt = shortcut.modifiers?.includes("alt") ? e.altKey : !e.altKey;

        if (!ctrl || !shift || !alt) continue;

        // Check key (case insensitive)
        if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;

        // Skip if typing in input and shortcut doesn't explicitly handle it
        if (isInput && shortcut.scope !== "global") continue;

        // Execute handler
        if (shortcut.preventDefault !== false) {
          e.preventDefault();
        }

        const result = shortcut.handler(e);

        // If handler returns false, stop propagation
        if (result === false) {
          e.stopPropagation();
        }

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Register custom shortcuts
  useEffect(() => {
    if (!customShortcuts) return;

    const unregisterFns = customShortcuts.map((shortcut) =>
      registerShortcut({ ...shortcut, scope })
    );

    return () => {
      unregisterFns.forEach((fn) => fn());
    };
  }, [scope, customShortcuts]);
}

// Common shortcuts
export function useGlobalShortcuts() {
  useEffect(() => {
    const unregisterFns: (() => void)[] = [];

    // ? - Show keyboard shortcuts help
    unregisterFns.push(
      registerShortcut({
        key: "?",
        modifiers: ["shift"],
        scope: "global",
        description: "Show keyboard shortcuts",
        handler: () => {
          toast.info("Keyboard Shortcuts Help", {
            description: "Shift+?: This help\nCtrl+N: New source\nCtrl+K: Search\nCtrl+/: Open chat",
            duration: 5000,
          });
        },
      })
    );

    // Ctrl/Cmd+K - Search
    unregisterFns.push(
      registerShortcut({
        key: "k",
        modifiers: ["ctrl"],
        scope: "global",
        description: "Open search",
        handler: () => {
          // Dispatch custom event for search
          window.dispatchEvent(new CustomEvent("eden:open-search"));
        },
      })
    );

    // Ctrl/Cmd+N - New source
    unregisterFns.push(
      registerShortcut({
        key: "n",
        modifiers: ["ctrl"],
        scope: "global",
        description: "Create new source",
        handler: () => {
          window.dispatchEvent(new CustomEvent("eden:create-source"));
        },
      })
    );

    return () => {
      unregisterFns.forEach((fn) => fn());
    };
  }, []);
}

// Source page specific shortcuts
export function useSourceShortcuts(handlers: {
  onSelectAll?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onRename?: () => void;
  onToggleView?: () => void;
  onRefresh?: () => void;
}) {
  useEffect(() => {
    const unregisterFns: (() => void)[] = [];

    if (handlers.onSelectAll) {
      unregisterFns.push(
        registerShortcut({
          key: "a",
          modifiers: ["ctrl"],
          scope: "sources",
          description: "Select all sources",
          handler: () => {
            handlers.onSelectAll?.();
            return false;
          },
        })
      );
    }

    if (handlers.onDelete) {
      unregisterFns.push(
        registerShortcut({
          key: "Delete",
          scope: "sources",
          description: "Delete selected",
          handler: () => {
            handlers.onDelete?.();
          },
        })
      );
    }

    if (handlers.onMove) {
      unregisterFns.push(
        registerShortcut({
          key: "m",
          modifiers: ["ctrl", "shift"],
          scope: "sources",
          description: "Move to folder",
          handler: () => {
            handlers.onMove?.();
          },
        })
      );
    }

    if (handlers.onRefresh) {
      unregisterFns.push(
        registerShortcut({
          key: "r",
          modifiers: ["ctrl"],
          scope: "sources",
          description: "Refresh sources",
          handler: () => {
            handlers.onRefresh?.();
          },
        })
      );
    }

    // Escape - Clear selection
    unregisterFns.push(
      registerShortcut({
        key: "Escape",
        scope: "sources",
        description: "Clear selection",
        handler: () => {
          window.dispatchEvent(new CustomEvent("eden:clear-selection"));
        },
      })
    );

    return () => {
      unregisterFns.forEach((fn) => fn());
    };
  }, [handlers]);
}

// Bulk selection hook
export function useBulkSelection<T extends { id: number }>(items: T[]) {
  const selectedIds = useRef<Set<number>>(new Set());
  const lastSelectedIndex = useRef<number>(-1);

  const toggleSelection = useCallback((id: number, index: number, shiftKey: boolean) => {
    if (shiftKey && lastSelectedIndex.current !== -1) {
      // Range selection
      const start = Math.min(lastSelectedIndex.current, index);
      const end = Math.max(lastSelectedIndex.current, index);

      for (let i = start; i <= end; i++) {
        selectedIds.current.add(items[i].id);
      }
    } else {
      // Toggle single
      if (selectedIds.current.has(id)) {
        selectedIds.current.delete(id);
      } else {
        selectedIds.current.add(id);
        lastSelectedIndex.current = index;
      }
    }

    return Array.from(selectedIds.current);
  }, [items]);

  const selectAll = useCallback(() => {
    items.forEach((item) => selectedIds.current.add(item.id));
    return Array.from(selectedIds.current);
  }, [items]);

  const clearSelection = useCallback(() => {
    selectedIds.current.clear();
    lastSelectedIndex.current = -1;
    return [];
  }, []);

  const isSelected = useCallback((id: number) => selectedIds.current.has(id), []);

  return {
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    get selectedCount() {
      return selectedIds.current.size;
    },
    get selectedIds() {
      return Array.from(selectedIds.current);
    },
  };
}
