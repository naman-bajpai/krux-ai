"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GitMerge,
  Search,
  Play,
  RefreshCw,
  Filter,
  CheckSquare,
  Upload,
  Loader2,
} from "lucide-react";
import { getStatusColor, formatRelativeTime, formatConfidenceScore } from "@/lib/utils";
import { toast } from "sonner";
import { ObjectStatus, ObjectType } from "@prisma/client";
import { UploadDialog } from "@/components/migration/upload-dialog";

// ─── SSE progress hook ────────────────────────────────────────────────────────

/** Tracks which objectIds are currently converting via SSE, with live progress. */
function useConversionProgress(projectId: string, enabled: boolean) {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || !enabled) return;

    const url = `/api/sse/conversion?projectId=${encodeURIComponent(projectId)}`;
    const evtSource = new EventSource(url);

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as {
          type: string;
          objectId?: string;
          progress?: number;
        };
        if (!event.objectId) return;

        if (event.type === "completed" || event.type === "failed") {
          setCompletedIds((prev) => new Set(Array.from(prev).concat(event.objectId!)));
          setProgress((prev) => {
            const next = { ...prev };
            delete next[event.objectId!];
            return next;
          });
        } else if (typeof event.progress === "number") {
          setProgress((prev) => ({
            ...prev,
            [event.objectId!]: event.progress!,
          }));
        }
      } catch {
        // ignore malformed messages
      }
    };

    evtSource.onerror = () => evtSource.close();

    return () => evtSource.close();
  }, [projectId, enabled]);

  return { progress, completedIds };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MigrationPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ObjectStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<ObjectType | "ALL">("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.migration.listObjects.useQuery(
    {
      projectId,
      page,
      limit: 20,
      ...(statusFilter !== "ALL" && { status: statusFilter }),
      ...(typeFilter !== "ALL" && { objectType: typeFilter }),
      ...(search && { search }),
    },
    { enabled: !!projectId, refetchInterval: 5000 },
  );

  const enqueue = trpc.migration.enqueueConversion.useMutation({
    onSuccess: (result) => {
      toast.success(`Enqueued ${result.enqueued} objects for conversion`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Track live SSE progress for any converting objects
  const hasConverting = data?.objects.some(
    (o: any) => o.status === ObjectStatus.CONVERTING,
  ) ?? false;
  const { progress: liveProgress, completedIds } = useConversionProgress(
    projectId,
    hasConverting,
  );

  // Auto-refetch when a conversion completes via SSE
  const completedCount = completedIds.size;
  useEffect(() => {
    if (completedCount > 0) refetch();
  }, [completedCount, refetch]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!data?.objects) return;
    setSelectedIds((prev) =>
      prev.size === data.objects.length
        ? new Set()
        : new Set(data.objects.map((o: any) => o.id)),
    );
  }, [data?.objects]);

  const handleEnqueue = () => {
    if (!projectId || selectedIds.size === 0) return;
    enqueue.mutate({ projectId, objectIds: Array.from(selectedIds) });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Migration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and convert SAP objects.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Upload ABAP
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={handleEnqueue}
              disabled={enqueue.isPending}
            >
              {enqueue.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Convert {selectedIds.size} selected
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search objects..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as ObjectStatus | "ALL")}
            >
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {Object.values(ObjectStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as ObjectType | "ALL")}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Object Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {Object.values(ObjectType).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Objects table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GitMerge className="h-4 w-4" />
              Objects
              {data?.total !== undefined && (
                <Badge variant="secondary">{data.total}</Badge>
              )}
            </CardTitle>
            {data && data.objects.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="gap-1.5 text-xs"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {selectedIds.size === data.objects.length
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !projectId ? (
            <div className="flex flex-col items-center py-12 text-center">
              <GitMerge className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Select a project to view objects.
              </p>
            </div>
          ) : !data?.objects.length ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Upload className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No objects yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Upload .abap files to begin migration.
              </p>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" />
                Upload ABAP Files
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {data.objects.map((obj: any) => {
                const isConverting = obj.status === ObjectStatus.CONVERTING;
                const pct = liveProgress[obj.id];

                return (
                  <div
                    key={obj.id}
                    className={`flex items-center gap-3 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                      selectedIds.has(obj.id) ? "bg-primary/5" : ""
                    }`}
                    onClick={() => {
                      if (!isConverting) toggleSelect(obj.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(obj.id)}
                      disabled={isConverting}
                      onChange={() => toggleSelect(obj.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-border disabled:opacity-40"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {obj.objectName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {obj.objectType.replace(/_/g, " ")}
                        {obj.packageName && ` · ${obj.packageName}`}
                      </p>
                      {/* Live progress bar */}
                      {isConverting && typeof pct === "number" && (
                        <div className="mt-1.5 h-1 w-full max-w-xs rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {obj.confidenceScore !== null && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {formatConfidenceScore(obj.confidenceScore)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground hidden md:block">
                        {formatRelativeTime(obj.updatedAt)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(obj.status)}`}
                      >
                        {isConverting && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {obj.status}
                        {isConverting && typeof pct === "number" && ` ${pct}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Page {page} of {data.pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === data.pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UploadDialog
        projectId={projectId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => refetch()}
      />
    </div>
  );
}
