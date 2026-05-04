import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2,
  FolderOpen,
  Tags,
  X,
  Check,
  Move,
  Copy,
  Sparkles,
  Download,
  MoreHorizontal,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AIWriterDialog } from "@/components/ai-writer/ai-writer-dialog";

interface FolderPage {
  id: number;
  title: string;
  kind: string;
  parentId: number | null;
  emoji?: string | null;
}

interface BulkOperationsToolbarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  onMove: (folderId: number | null) => void;
  onTag: (tags: string[]) => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  availableFolders: { id: number; title: string; emoji?: string | null }[];
  folderPages?: FolderPage[];
  selectedSourceIds: number[];
}

export function BulkOperationsToolbar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  onDelete,
  onMove,
  onTag,
  onDuplicate,
  onExport,
  availableFolders,
  folderPages = [],
  selectedSourceIds,
}: BulkOperationsToolbarProps) {
  // Build folder tree for nested display
  const buildFolderTree = (parentId: number | null): FolderPage[] => {
    return folderPages.filter((f) => (f.parentId ?? null) === parentId);
  };

  const renderFolderTree = (parentId: number | null, level = 0) => {
    const folders = buildFolderTree(parentId);
    return folders.map((folder) => (
      <div key={folder.id}>
        <button
          className="w-full text-left px-3 py-2 hover:bg-accent rounded-md flex items-center gap-2 transition-colors"
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => {
            onMove(folder.id);
            setIsMoveDialogOpen(false);
          }}
        >
          <Folder className="h-4 w-4 text-primary" />
          <span className="truncate">{folder.emoji ? `${folder.emoji} ` : ""}{folder.title}</span>
        </button>
        {renderFolderTree(folder.id, level + 1)}
      </div>
    ));
  };
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAIWriterOpen, setIsAIWriterOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const allSelected = selectedCount === totalCount && totalCount > 0;

  const handleAddTag = () => {
    if (tagInput.trim() && !selectedTags.includes(tagInput.trim())) {
      setSelectedTags([...selectedTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleApplyTags = () => {
    onTag(selectedTags);
    setIsTagDialogOpen(false);
    setSelectedTags([]);
  };

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-card border shadow-xl rounded-full px-4 py-2 flex items-center gap-2">
              {/* Selection info */}
              <div className="flex items-center gap-2 pr-2 border-r">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => (allSelected ? onClearSelection() : onSelectAll())}
                />
                <span className="text-sm font-medium">
                  {selectedCount} selected
                </span>
                <Badge variant="secondary" className="text-xs">
                  {Math.round((selectedCount / totalCount) * 100)}%
                </Badge>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {/* Move */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setIsMoveDialogOpen(true)}
                >
                  <Move className="w-4 h-4" />
                  Move
                </Button>

                {/* Tag */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setIsTagDialogOpen(true)}
                >
                  <Tags className="w-4 h-4" />
                  Tag
                </Button>

                {/* AI Writer */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setIsAIWriterOpen(true)}
                >
                  <Sparkles className="w-4 h-4" />
                  AI Writer
                </Button>

                {/* More actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onDuplicate && (
                      <DropdownMenuItem onClick={onDuplicate}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    {onExport && (
                      <DropdownMenuItem onClick={onExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setIsDeleteDialogOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Divider */}
                <div className="w-px h-6 bg-border mx-1" />

                {/* Clear selection */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={onClearSelection}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>Move {selectedCount} selected items</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 py-2">
            <div className="space-y-1">
              <button
                className="w-full text-left px-3 py-2 hover:bg-accent rounded-md flex items-center gap-2 transition-colors"
                onClick={() => {
                  onMove(null);
                  setIsMoveDialogOpen(false);
                }}
              >
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="truncate">My Drive (root)</span>
              </button>

              {renderFolderTree(null, 0)}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Tags</DialogTitle>
            <DialogDescription>
              Add tags to {selectedCount} selected items
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Enter tag and press Enter..."
                className="flex-1 px-3 py-2 border rounded-md text-sm"
              />
              <Button onClick={handleAddTag} size="sm">
                Add
              </Button>
            </div>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      setSelectedTags(selectedTags.filter((t) => t !== tag))
                    }
                  >
                    {tag} <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleApplyTags} disabled={selectedTags.length === 0}>
                Apply Tags
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Items</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedCount} selected items? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                setIsDeleteDialogOpen(false);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Writer Dialog */}
      <AIWriterDialog
        open={isAIWriterOpen}
        onOpenChange={setIsAIWriterOpen}
        selectedSourceIds={selectedSourceIds}
        onSave={(content, title) => {
          // Dispatch event to create a new page with this content
          window.dispatchEvent(
            new CustomEvent("eden:create-ai-document", {
              detail: { content, title },
            })
          );
        }}
      />
    </>
  );
}
