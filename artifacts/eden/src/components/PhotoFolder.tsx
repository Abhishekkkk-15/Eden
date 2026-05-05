import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Folder,
  MoreVertical,
  Pencil,
  Trash2,
  FileText,
  ImageIcon,
  Film,
  Link as LinkIcon,
  Youtube,
  FileAudio,
  FileCode,
  File,
  FileSpreadsheet,
  Eye,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

export type FolderItem = {
  id: number;
  title: string;
  kind: "document" | "image" | "video" | "youtube" | "url" | "audio" | "text" | "file";
  thumbnailUrl?: string | null;
};

interface PhotoFolderProps {
  items: FolderItem[];
  title: string;
  emoji?: string | null;
  className?: string;
  onClick?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

// Get icon based on file type
function getFileIcon(kind: FolderItem["kind"]) {
  switch (kind) {
    case "document":
      return <FileText className="w-8 h-8 text-blue-500" />;
    case "image":
      return <ImageIcon className="w-8 h-8 text-purple-500" />;
    case "video":
      return <Film className="w-8 h-8 text-rose-500" />;
    case "youtube":
      return <Youtube className="w-8 h-8 text-red-500" />;
    case "url":
      return <LinkIcon className="w-8 h-8 text-emerald-500" />;
    case "audio":
      return <FileAudio className="w-8 h-8 text-amber-500" />;
    case "text":
      return <FileCode className="w-8 h-8 text-cyan-500" />;
    default:
      return <File className="w-8 h-8 text-gray-500" />;
  }
}

// Get gradient based on file type
function getFileGradient(kind: FolderItem["kind"]) {
  switch (kind) {
    case "document":
      return "from-blue-100 to-blue-200";
    case "image":
      return "from-purple-100 to-purple-200";
    case "video":
      return "from-rose-100 to-rose-200";
    case "youtube":
      return "from-red-100 to-red-200";
    case "url":
      return "from-emerald-100 to-emerald-200";
    case "audio":
      return "from-amber-100 to-amber-200";
    case "text":
      return "from-cyan-100 to-cyan-200";
    default:
      return "from-gray-100 to-gray-200";
  }
}

export function PhotoFolder({
  items,
  title,
  emoji,
  className,
  onClick,
  onRename,
  onDelete,
  onExport,
  isDragging,
  isDropTarget,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: PhotoFolderProps) {
  // Get up to 4 items to display behind the folder
  const displayItems = items.slice(0, 4);
  const itemCount = items.length;
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);
  const [previewItem, setPreviewItem] = useState<FolderItem | null>(null);

  // Find first image/video item for preview
  const firstMediaItem = items.find(
    (item) =>
      (item.kind === "image" || item.kind === "video" || item.kind === "youtube") &&
      item.thumbnailUrl
  );

  return (
    <motion.div
      className={cn(
        "relative group",
        isDragging ? "opacity-50" : "",
        className
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className={cn(
          "relative cursor-pointer w-full h-[200px] rounded-2xl",
          isDropTarget ? "ring-2 ring-primary ring-offset-2" : ""
        )}
        onClick={onClick}
      >
        <motion.div
          className="relative w-full h-full"
          whileHover="hover"
          initial="initial"
        >
          {/* Items behind the folder */}
          <div className="absolute inset-0 flex items-center justify-center">
            {displayItems.map((item, index) => {
              const rotations = [-12, -4, 4, 12];
              const offsets = [
                { x: -50, y: -15 },
                { x: -15, y: -25 },
                { x: 15, y: -25 },
                { x: 50, y: -15 },
              ];
              const rotation = rotations[index] || 0;
              const offset = offsets[index] || { x: 0, y: 0 };
              const hasThumbnail = item.thumbnailUrl;
              const isMedia = item.kind === "image" || item.kind === "video" || item.kind === "youtube";

              return (
                <motion.div
                  key={item.id}
                  className={cn(
                    "absolute w-[100px] h-[75px] rounded-lg overflow-hidden shadow-lg border-2 border-white bg-white flex items-center justify-center cursor-pointer",
                    !hasThumbnail && `bg-gradient-to-br ${getFileGradient(item.kind)}`
                  )}
                  style={{ zIndex: index }}
                  variants={{
                    initial: {
                      x: offset.x * 0.2,
                      y: offset.y * 0.2 + 25,
                      rotate: rotation * 0.3,
                      scale: 0.9,
                      opacity: 0.7,
                    },
                    hover: {
                      x: offset.x,
                      y: offset.y - 5,
                      rotate: rotation,
                      scale: 1,
                      opacity: 1,
                      transition: {
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                        delay: index * 0.05,
                      },
                    },
                  }}
                  onMouseEnter={() => {
                    setHoveredItem(item.id);
                    if (isMedia && item.thumbnailUrl) {
                      setPreviewItem(item);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredItem(null);
                    setPreviewItem(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Could open file detail here
                  }}
                >
                  {hasThumbnail ? (
                    <>
                      <img
                        src={item.thumbnailUrl!}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      {/* Hover overlay with preview icon */}
                      <motion.div
                        className="absolute inset-0 bg-black/40 flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: hoveredItem === item.id ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Eye className="w-6 h-6 text-white" />
                      </motion.div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-2">
                      {getFileIcon(item.kind)}
                      <span className="text-[8px] text-gray-600 mt-1 truncate max-w-[80px] text-center leading-tight">
                        {item.title}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Empty state - show empty folder hint */}
            {displayItems.length === 0 && (
              <motion.div
                className="absolute w-[100px] h-[75px] rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center"
                variants={{
                  initial: { opacity: 0.5, scale: 0.9 },
                  hover: { opacity: 0.7, scale: 1 },
                }}
              >
                <span className="text-xs text-gray-400">Empty</span>
              </motion.div>
            )}
          </div>

          {/* Large preview tooltip for images */}
          {previewItem?.thumbnailUrl && (
            <motion.div
              className="absolute -top-[180px] left-1/2 -translate-x-1/2 w-[200px] h-[150px] rounded-xl overflow-hidden shadow-2xl border-2 border-white bg-white z-50"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <img
                src={previewItem.thumbnailUrl}
                alt={previewItem.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <span className="text-white text-xs font-medium truncate block">
                  {previewItem.title}
                </span>
              </div>
            </motion.div>
          )}

          {/* Folder body */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-[140px] bg-gradient-to-b from-card to-muted rounded-2xl shadow-xl border border-border overflow-hidden"
            variants={{
              initial: { y: 0, scale: 1 },
              hover: {
                y: -5,
                scale: 1.02,
                transition: {
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                },
              },
            }}
          >
            {/* Folder tab */}
            <div className="absolute -top-4 left-6 w-[90px] h-[18px] bg-gradient-to-b from-card to-muted rounded-t-xl border-t border-x border-border" />

            {/* Folder content area */}
            <div className="relative w-full h-full p-4 pt-6">
              {/* Emoji or Folder icon - top left */}
              <motion.div
                className="absolute top-3 left-4 w-10 h-10 flex items-center justify-center"
                variants={{
                  initial: { scale: 1, rotate: 0 },
                  hover: {
                    scale: 1.1,
                    rotate: [-3, 3, -3, 0],
                    transition: {
                      scale: { type: "spring", stiffness: 400, damping: 20 },
                      rotate: { duration: 0.5, ease: "easeInOut" },
                    },
                  },
                }}
              >
                {emoji ? (
                  <span className="text-2xl">{emoji}</span>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Folder className="w-5 h-5 text-primary" />
                  </div>
                )}
              </motion.div>

              {/* Menu button - top right */}
              <div className="absolute top-3 right-3 z-20">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename?.(); }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport?.(); }}>
                      <Cloud className="h-4 w-4 mr-2 text-blue-500" />
                      Export to Cloud
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Item count - right side */}
              <motion.div
                className="absolute top-10 right-4 text-xs font-medium text-muted-foreground"
                variants={{
                  initial: { scale: 1, y: 0 },
                  hover: {
                    scale: 1.1,
                    y: -3,
                    transition: {
                      type: "spring",
                      stiffness: 400,
                      damping: 15,
                    },
                  },
                }}
              >
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </motion.div>

              {/* Title at bottom */}
              <motion.div
                className="absolute bottom-3 left-4 right-4"
                variants={{
                  initial: { opacity: 0.9, y: 0 },
                  hover: {
                    opacity: 1,
                    y: -2,
                    transition: {
                      type: "spring",
                      stiffness: 400,
                      damping: 20,
                    },
                  },
                }}
              >
                <div className="font-medium text-foreground truncate pr-2">
                  {title}
                </div>
              </motion.div>
            </div>

            {/* Gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-muted/40 pointer-events-none" />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

