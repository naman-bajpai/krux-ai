"use client";

import { useState, useEffect } from "react";
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
  Code2,
  FileCode,
} from "lucide-react";
import {
  formatConfidenceScore,
  getConfidenceColor,
  formatRelativeTime,
} from "@/lib/utils";
import { toast } from "sonner";
import { ReviewDecisionType } from "@prisma/client";
import { useSearchParams } from "next/navigation";

type Tab = "converted" | "original";

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? undefined;
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<Tab>("converted");

  // Modify mode state
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedCode, setModifiedCode] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: pendingObjects, refetch } =
    trpc.migration.pendingReview.useQuery(
      { projectId, limit: 50 },
      { enabled: true, refetchInterval: 5000 }
    );

  const { data: selectedObject } = trpc.migration.objectById.useQuery(
    { id: selectedObjectId! },
    { enabled: !!selectedObjectId },
  );

  // Pre-fill modify editor when a new object is loaded
  useEffect(() => {
    if (selectedObject) {
      setModifiedCode(selectedObject.convertedCode ?? "");
    }
  }, [selectedObject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitReview = trpc.migration.submitReview.useMutation({
    onSuccess: () => {
      toast.success("Review submitted");
      setSelectedObjectId(null);
      setIsModifying(false);
      setModifiedCode("");
      setReviewNotes("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSelect = (id: string) => {
    setSelectedObjectId(id);
    setIsModifying(false);
    setCodeTab("converted");
    setReviewNotes("");
  };

  const handleDecision = (decision: ReviewDecisionType) => {
    if (!selectedObjectId) return;
    submitReview.mutate({
      objectId: selectedObjectId,
      decision,
      notes: reviewNotes || undefined,
      ...(decision === ReviewDecisionType.MODIFIED && {
        modifiedCode: modifiedCode || undefined,
      }),
    });
  };

  const enterModify = () => {
    setModifiedCode(selectedObject?.convertedCode ?? "");
    setIsModifying(true);
    setCodeTab("converted");
  };

  const confidenceLabel = (score: number | null) => {
    if (score === null) return null;
    const pct = Math.round(score * 100);
    if (pct >= 80) return { text: `${pct}% confidence`, color: "text-green-600 dark:text-green-400" };
    if (pct >= 60) return { text: `${pct}% confidence`, color: "text-yellow-600 dark:text-yellow-400" };
    return { text: `${pct}% confidence`, color: "text-red-600 dark:text-red-400" };
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve AI-converted objects. Low-confidence items appear first.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue list — 1 column */}
        <Card className="lg:col-span-1">
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
            {!pendingObjects?.length ? (
              <div className="flex flex-col items-center py-12 text-center">
                <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No objects pending review.
                </p>
              </div>
            ) : (
              <div className="divide-y max-h-[calc(100vh-280px)] overflow-y-auto">
                {pendingObjects.map((obj) => {
                  const conf = confidenceLabel(obj.confidenceScore);
                  return (
                    <button
                      key={obj.id}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                        selectedObjectId === obj.id ? "bg-primary/5 border-l-2 border-primary" : ""
                      }`}
                      onClick={() => handleSelect(obj.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {obj.objectName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {obj.objectType.replace(/_/g, " ")} ·{" "}
                          {formatRelativeTime(obj.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {conf && (
                          <span className={`text-xs font-medium ${conf.color}`}>
                            {conf.text}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Code viewer + actions — 2 columns */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">
                  {selectedObject ? selectedObject.objectName : "Select an object"}
                </CardTitle>
                {selectedObject && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {selectedObject.objectType.replace(/_/g, " ")}
                    </Badge>
                    {(() => {
                      const conf = confidenceLabel(selectedObject.confidenceScore);
                      return conf ? (
                        <Badge variant="outline" className={`text-xs ${conf.color}`}>
                          {conf.text}
                        </Badge>
                      ) : null;
                    })()}
                    <Badge variant="outline" className="text-xs">
                      {selectedObject.status}
                    </Badge>
                    {selectedObject.processingTime && (
                      <Badge variant="outline" className="text-xs">
                        {(selectedObject.processingTime / 1000).toFixed(1)}s
                      </Badge>
                    )}
                    {selectedObject.tokenCount && (
                      <Badge variant="outline" className="text-xs">
                        {selectedObject.tokenCount.toLocaleString()} tokens
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {selectedObject && !isModifying && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => handleDecision(ReviewDecisionType.REJECTED)}
                    disabled={submitReview.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={enterModify}
                    disabled={submitReview.isPending}
                  >
                    <Edit3 className="h-4 w-4" />
                    Modify
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDecision(ReviewDecisionType.APPROVED)}
                    disabled={submitReview.isPending}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </Button>
                </div>
              )}
              {selectedObject && isModifying && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsModifying(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDecision(ReviewDecisionType.MODIFIED)}
                    disabled={submitReview.isPending}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Save & Approve
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 space-y-3">
            {!selectedObject ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FileCode className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select an object from the queue to review its converted code.
                </p>
              </div>
            ) : (
              <>
                {/* Code tabs (only in view mode) */}
                {!isModifying && (
                  <div className="flex gap-1 border-b text-sm">
                    <button
                      onClick={() => setCodeTab("converted")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 transition-colors ${
                        codeTab === "converted"
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Converted
                    </button>
                    <button
                      onClick={() => setCodeTab("original")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 transition-colors ${
                        codeTab === "original"
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <FileCode className="h-3.5 w-3.5" />
                      Original ABAP
                    </button>
                  </div>
                )}

                {/* Code display / editor */}
                {isModifying ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Edit the converted code below, then click "Save & Approve".
                    </p>
                    <textarea
                      className="w-full h-80 text-xs font-mono bg-muted rounded-md p-3 border border-input resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                      value={modifiedCode}
                      onChange={(e) => setModifiedCode(e.target.value)}
                      spellCheck={false}
                    />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Review notes (optional)
                      </p>
                      <textarea
                        className="w-full h-16 text-sm bg-muted rounded-md p-3 border border-input resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Describe what you changed…"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-80 font-mono leading-relaxed whitespace-pre-wrap">
                      {codeTab === "converted"
                        ? (selectedObject.convertedCode ?? "No converted code available.")
                        : (selectedObject.sourceCode ?? "Source code not available.")}
                    </pre>

                    {/* Notes input in view mode too */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Review notes (optional)
                      </p>
                      <textarea
                        className="w-full h-16 text-sm bg-muted rounded-md p-3 border border-input resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Add notes for Approve or Reject…"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* Previous reviews */}
                {selectedObject.reviewDecisions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Previous Reviews
                    </p>
                    {selectedObject.reviewDecisions.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 text-xs py-1 border-t"
                      >
                        <span className="font-medium">{r.user.name}</span>
                        <Badge
                          variant={
                            r.decision === "APPROVED"
                              ? "default"
                              : r.decision === "REJECTED"
                              ? "destructive"
                              : "secondary"
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
