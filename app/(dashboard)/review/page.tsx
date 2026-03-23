"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Edit3,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { formatConfidenceScore, getConfidenceColor, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { ReviewDecisionType } from "@prisma/client";
import { useSearchParams } from "next/navigation";

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  const { data: pendingObjects, refetch } = trpc.migration.pendingReview.useQuery(
    { projectId, limit: 20 },
    { enabled: !!projectId }
  );

  const { data: selectedObject } = trpc.migration.objectById.useQuery(
    { id: selectedObjectId! },
    { enabled: !!selectedObjectId }
  );

  const submitReview = trpc.migration.submitReview.useMutation({
    onSuccess: () => {
      toast.success("Review submitted");
      setSelectedObjectId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDecision = (decision: ReviewDecisionType) => {
    if (!selectedObjectId) return;
    submitReview.mutate({
      objectId: selectedObjectId,
      decision,
    });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve converted objects.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Pending Review
              {pendingObjects && (
                <Badge variant="secondary">{pendingObjects.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!projectId ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Select a project to review objects.
              </div>
            ) : !pendingObjects?.length ? (
              <div className="flex flex-col items-center py-12 text-center">
                <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No objects pending review.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {pendingObjects.map((obj) => (
                  <button
                    key={obj.id}
                    className={`w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-muted/50 transition-colors ${
                      selectedObjectId === obj.id ? "bg-primary/5" : ""
                    }`}
                    onClick={() => setSelectedObjectId(obj.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {obj.objectName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {obj.objectType} · {formatRelativeTime(obj.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {obj.confidenceScore !== null && (
                        <span
                          className={`text-xs font-medium ${getConfidenceColor(obj.confidenceScore)}`}
                        >
                          {formatConfidenceScore(obj.confidenceScore)}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Object detail / code viewer */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {selectedObject
                  ? selectedObject.objectName
                  : "Select an object to review"}
              </CardTitle>
              {selectedObject && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleDecision(ReviewDecisionType.REJECTED)}
                    disabled={submitReview.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                    onClick={() => handleDecision(ReviewDecisionType.MODIFIED)}
                    disabled={submitReview.isPending}
                  >
                    <Edit3 className="h-4 w-4" />
                    Modify
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleDecision(ReviewDecisionType.APPROVED)}
                    disabled={submitReview.isPending}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedObject ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Select an object from the queue to review its converted code.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{selectedObject.objectType}</Badge>
                  <Badge variant="outline">
                    Confidence:{" "}
                    {formatConfidenceScore(selectedObject.confidenceScore)}
                  </Badge>
                  <Badge variant="outline">{selectedObject.status}</Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Converted Code
                  </p>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-96 font-mono leading-relaxed">
                    {selectedObject.convertedCode ??
                      "No converted code available yet."}
                  </pre>
                </div>

                {selectedObject.reviewDecisions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Previous Reviews
                    </p>
                    {selectedObject.reviewDecisions.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="font-medium">{r.user.name}</span>
                        <Badge
                          variant={
                            r.decision === "APPROVED"
                              ? "success"
                              : r.decision === "REJECTED"
                              ? "destructive"
                              : "warning"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {r.decision}
                        </Badge>
                        {r.notes && (
                          <span className="text-muted-foreground truncate">
                            {r.notes}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
