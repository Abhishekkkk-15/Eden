import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/providers/socket-provider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Clock,
  FileText,
  Image,
  Film,
  Headphones,
  FileCode,
  Link,
  Youtube,
  MoreHorizontal,
  X,
  RotateCcw,
} from "lucide-react";

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type JobType = "transcribe" | "analyze_video" | "analyze_image" | "extract_text" | "generate_summary" | "import_url" | "ai_transform";

interface ProcessingJob {
  id: number;
  type: JobType;
  entityType: string;
  entityId: number;
  entityName: string;
  status: JobStatus;
  progress: number;
  message: string;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

interface ProcessingStatusProps {
  jobs: ProcessingJob[];
  onCancel?: (jobId: number) => void;
  onRetry?: (jobId: number) => void;
  onClear?: () => void;
  className?: string;
}

const jobTypeConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  transcribe: { icon: <Headphones className="w-4 h-4" />, label: "Transcribing", color: "text-blue-500" },
  analyze_video: { icon: <Film className="w-4 h-4" />, label: "Analyzing Video", color: "text-purple-500" },
  analyze_image: { icon: <Image className="w-4 h-4" />, label: "Analyzing Image", color: "text-green-500" },
  extract_text: { icon: <FileText className="w-4 h-4" />, label: "Extracting Text", color: "text-orange-500" },
  generate_summary: { icon: <FileCode className="w-4 h-4" />, label: "Summarizing", color: "text-pink-500" },
  import_url: { icon: <Link className="w-4 h-4" />, label: "Importing URL", color: "text-cyan-500" },
  ai_transform: { icon: <FileCode className="w-4 h-4" />, label: "AI Processing", color: "text-amber-500" },
  ai_organize: { icon: <FileCode className="w-4 h-4" />, label: "Organizing", color: "text-indigo-500" },
  generate_tags: { icon: <Link className="w-4 h-4" />, label: "Tagging", color: "text-teal-500" },
  extract_entities: { icon: <FileText className="w-4 h-4" />, label: "Extracting Entities", color: "text-orange-500" },
};

const DEFAULT_CONFIG = { icon: <Clock className="w-4 h-4" />, label: "Processing", color: "text-muted-foreground" };

const statusConfig: Record<JobStatus, { icon: React.ReactNode; badge: string; progressColor: string }> = {
  pending: { icon: <Clock className="w-4 h-4" />, badge: "Pending", progressColor: "bg-muted" },
  processing: { icon: <Loader2 className="w-4 h-4 animate-spin" />, badge: "Processing", progressColor: "bg-primary" },
  completed: { icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, badge: "Completed", progressColor: "bg-green-500" },
  failed: { icon: <XCircle className="w-4 h-4 text-red-500" />, badge: "Failed", progressColor: "bg-red-500" },
  cancelled: { icon: <X className="w-4 h-4 text-gray-500" />, badge: "Cancelled", progressColor: "bg-gray-500" },
};

function JobItem({ job, onCancel, onRetry }: { job: ProcessingJob; onCancel?: (id: number) => void; onRetry?: (id: number) => void }) {
  const config = jobTypeConfig[job.type] || DEFAULT_CONFIG;
  const status = statusConfig[job.status];

  const formatDuration = () => {
    if (!job.startedAt) return "";
    const start = new Date(job.startedAt);
    const end = job.completedAt ? new Date(job.completedAt) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  return (
    <div className="p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn("mt-0.5", config.color)}>{config.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{job.entityName}</span>
            <Badge
              variant={
                job.status === "processing"
                  ? "default"
                  : job.status === "completed"
                  ? "secondary"
                  : job.status === "failed"
                  ? "destructive"
                  : "outline"
              }
              className="text-xs"
            >
              {status.icon}
              <span className="ml-1">{status.badge}</span>
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {job.message || config.label}
          </p>

          {/* Progress bar */}
          {job.status === "processing" && (
            <div className="mt-2 space-y-1">
              <Progress value={job.progress} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{job.progress}%</span>
                <span>{formatDuration()}</span>
              </div>
            </div>
          )}

          {/* Retry info */}
          {job.retryCount > 0 && job.status !== "completed" && (
            <p className="text-xs text-muted-foreground mt-1">
              Retry {job.retryCount}/{job.maxRetries}
            </p>
          )}

          {/* Error message */}
          {job.errorMessage && job.status === "failed" && (
            <p className="text-xs text-red-500 mt-1 line-clamp-2">{job.errorMessage}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {job.status === "processing" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onCancel?.(job.id)}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          {job.status === "failed" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onRetry?.(job.id)}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProcessingStatus({
  jobs,
  onCancel,
  onRetry,
  onClear,
  className,
}: ProcessingStatusProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const activeJobs = jobs.filter((j) => j.status === "processing" || j.status === "pending");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  if (jobs.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.95 }}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-3rem)]",
          className
        )}
      >
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="bg-card/80 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
            {/* Header */}
            <CollapsibleTrigger asChild>
              <button className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-all group">
                <div className="relative">
                  {activeJobs.length > 0 ? (
                    <div className="relative">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
                    </div>
                  ) : failedJobs.length > 0 ? (
                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-500" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>

                <div className="text-left flex-1">
                  <div className="font-semibold text-[15px] tracking-tight">
                    {activeJobs.length > 0
                      ? `${activeJobs.length} Background Task${activeJobs.length > 1 ? 's' : ''}`
                      : failedJobs.length > 0
                      ? `${failedJobs.length} Issue${failedJobs.length > 1 ? 's' : ''} Detected`
                      : "System Up to Date"}
                  </div>
                  <div className="text-[12px] text-muted-foreground/80 font-medium">
                    {jobs.length} total • {completedJobs.length} completed
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(completedJobs.length > 0 || failedJobs.length > 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log("[ProcessingStatus] Clear clicked");
                        onClear?.();
                      }}
                    >
                      Clear All
                    </Button>
                  )}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted group-hover:scale-110 transition-transform">
                    <ChevronDown
                      className={cn("w-4 h-4 text-muted-foreground transition-transform duration-300", isOpen && "rotate-180")}
                    />
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>

            {/* Job list */}
            <CollapsibleContent>
              <div className="max-h-[400px] overflow-y-auto">
                {/* Active jobs first */}
                {activeJobs.map((job) => (
                  <JobItem key={job.id} job={job} onCancel={onCancel} />
                ))}

                {/* Failed jobs */}
                {failedJobs.length > 0 && (
                  <>
                    {activeJobs.length > 0 && (
                      <div className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium">
                        Failed
                      </div>
                    )}
                    {failedJobs.map((job) => (
                      <JobItem key={job.id} job={job} onRetry={onRetry} />
                    ))}
                  </>
                )}

                {/* Completed jobs (collapsed by default if many) */}
                {completedJobs.length > 0 && (
                  <>
                    {(activeJobs.length > 0 || failedJobs.length > 0) && (
                      <button
                        className="w-full px-3 py-1 bg-green-50 text-green-600 text-xs font-medium flex items-center justify-between hover:bg-green-100"
                        onClick={() => setIsExpanded(!isExpanded)}
                      >
                        <span>Completed ({completedJobs.length})</span>
                        <ChevronDown
                          className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>
                    )}
                    {(isExpanded || activeJobs.length === 0) &&
                      completedJobs.map((job) => <JobItem key={job.id} job={job} />)}
                  </>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook for real-time job updates
export function useProcessingJobs(pollInterval = 5000) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const { socket, isConnected } = useSocket();

  const fetchJobs = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch("/api/jobs", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    
    // Only poll as a fallback if socket isn't connected
    let interval: any;
    if (!isConnected) {
      console.log("[Socket] Fallback: Starting polling for jobs...");
      interval = setInterval(fetchJobs, pollInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchJobs, pollInterval, isConnected]);

  useEffect(() => {
    if (!socket) return;

    socket.on("job:progress", (data: { jobId: number; progress: number; message: string }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.jobId
            ? { ...j, status: "processing", progress: data.progress, message: data.message }
            : j
        )
      );
    });

    socket.on("job:created", (job: ProcessingJob) => {
      setJobs((prev) => [job, ...prev]);
    });

    socket.on("job:completed", (data: { jobId: number }) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === data.jobId ? { ...j, status: "completed", progress: 100 } : j))
      );
    });

    return () => {
      socket.off("job:progress");
      socket.off("job:created");
      socket.off("job:completed");
    };
  }, [socket]);

  const cancelJob = async (jobId: number) => {
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "cancelled" } : j))
      );
    } catch (error) {
      console.error("Failed to cancel job:", error);
    }
  };

  const retryJob = async (jobId: number) => {
    try {
      await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: "pending", retryCount: j.retryCount + 1 }
            : j
        )
      );
    } catch (error) {
      console.error("Failed to retry job:", error);
    }
  };

  const clearJobs = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/jobs/clear", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setJobs((prev) => prev.filter((j) => j.status === "processing" || j.status === "pending"));
      }
    } catch (error) {
      console.error("Failed to clear jobs:", error);
    }
  }, []);

  return { jobs, cancelJob, retryJob, clearJobs };
}
