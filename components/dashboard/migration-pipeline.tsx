import Link from "next/link";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MigrationPipelineProps {
  pending: number;
  converting: number;
  converted: number;
  reviewed: number;
  approved: number;
  failed: number;
  projectId?: string;
}

const stages = [
  {
    key: "pending",
    label: "Pending",
    sublabel: "Queued",
    dotColor: "bg-amber-400",
    barColor: "bg-amber-400/50",
    textColor: "text-amber-600 dark:text-amber-400",
    ringColor: "ring-amber-200 dark:ring-amber-900",
    filter: "PENDING",
  },
  {
    key: "converting",
    label: "Converting",
    sublabel: "In Progress",
    dotColor: "bg-blue-500",
    barColor: "bg-blue-400/50",
    textColor: "text-blue-600 dark:text-blue-400",
    ringColor: "ring-blue-200 dark:ring-blue-900",
    filter: "CONVERTING",
    pulse: true,
  },
  {
    key: "converted",
    label: "Converted",
    sublabel: "AI Complete",
    dotColor: "bg-violet-500",
    barColor: "bg-violet-400/50",
    textColor: "text-violet-600 dark:text-violet-400",
    ringColor: "ring-violet-200 dark:ring-violet-900",
    filter: "CONVERTED",
  },
  {
    key: "reviewed",
    label: "Reviewed",
    sublabel: "Awaiting Approval",
    dotColor: "bg-indigo-500",
    barColor: "bg-indigo-400/50",
    textColor: "text-indigo-600 dark:text-indigo-400",
    ringColor: "ring-indigo-200 dark:ring-indigo-900",
    filter: "REVIEWED",
  },
  {
    key: "approved",
    label: "Approved",
    sublabel: "Production Ready",
    dotColor: "bg-emerald-500",
    barColor: "bg-emerald-400/60",
    textColor: "text-emerald-600 dark:text-emerald-400",
    ringColor: "ring-emerald-200 dark:ring-emerald-900",
    filter: "APPROVED",
  },
] as const;

export function MigrationPipeline({
  pending,
  converting,
  converted,
  reviewed,
  approved,
  failed,
  projectId,
}: MigrationPipelineProps) {
  const counts: Record<string, number> = {
    pending,
    converting,
    converted,
    reviewed,
    approved,
  };
  const total = pending + converting + converted + reviewed + approved + failed;

  const migrationBase = projectId
    ? `/migration?projectId=${projectId}`
    : "/migration";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            Migration Pipeline
          </CardTitle>
          {total > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {total.toLocaleString()} objects total
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No migration objects yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload ABAP files to start a migration.
            </p>
          </div>
        ) : (
          <>
            {/* Pipeline stages */}
            <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
              {stages.map((stage, i) => {
                const count = counts[stage.key];
                const pct = total > 0 ? (count / total) * 100 : 0;
                const isLast = i === stages.length - 1;

                return (
                  <div key={stage.key} className="flex items-center gap-0 min-w-0 flex-1">
                    <Link
                      href={`${migrationBase}&status=${stage.filter}`}
                      className={cn(
                        "group flex-1 min-w-[80px] rounded-xl p-3 ring-1 transition-all hover:scale-[1.02] hover:shadow-md",
                        stage.ringColor,
                        count === 0 ? "opacity-40" : "opacity-100"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span
                          className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            stage.dotColor,
                            "pulse" in stage && (stage as any).pulse && count > 0 && "animate-pulse"
                          )}
                        />
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                          {stage.label}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-mono font-bold leading-none mb-1",
                          stage.textColor
                        )}
                      >
                        {count.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {stage.sublabel}
                      </p>
                      {/* Progress bar showing proportion */}
                      <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            stage.barColor
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                    {!isLast && (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mx-0.5" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Failed callout */}
            {failed > 0 && (
              <Link
                href={`${migrationBase}&status=FAILED`}
                className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>{failed}</strong> object{failed > 1 ? "s" : ""} failed
                  conversion — click to inspect and re-queue
                </span>
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
