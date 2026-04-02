import Link from "next/link";
import { ArrowRight, Clock, DollarSign, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ROICardProps {
  approvedObjects: number;
  totalObjects: number;
  completionRate: number;
}

// Conservative industry estimates
const HOURS_PER_OBJECT = 8; // avg manual ABAP migration hours per object
const HOURLY_RATE = 150; // avg SAP developer cost USD/hr

export function ROICard({
  approvedObjects,
  totalObjects,
  completionRate,
}: ROICardProps) {
  const hoursSaved = approvedObjects * HOURS_PER_OBJECT;
  const daysSaved = Math.round(hoursSaved / 8);
  const valueSaved = hoursSaved * HOURLY_RATE;
  const projectedTotal = totalObjects > 0
    ? Math.round((totalObjects * HOURS_PER_OBJECT * HOURLY_RATE))
    : 0;

  const formatCurrency = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${n}`;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          ROI at a Glance
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {approvedObjects === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Zap className="h-7 w-7 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Approve your first objects to see ROI metrics.
            </p>
          </div>
        ) : (
          <>
            {/* Hero value */}
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900 p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
                Value Generated
              </p>
              <p
                className="text-4xl font-bold text-emerald-700 dark:text-emerald-300 leading-none"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {formatCurrency(valueSaved)}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-1">
                in avoided migration costs
              </p>
            </div>

            {/* Supporting metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="h-3 w-3 text-blue-500" />
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                    Hours Saved
                  </span>
                </div>
                <p className="text-xl font-mono font-bold text-blue-700 dark:text-blue-300">
                  {hoursSaved.toLocaleString()}
                </p>
                <p className="text-[10px] text-blue-600/70 dark:text-blue-500 mt-0.5">
                  ≈ {daysSaved} developer days
                </p>
              </div>

              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                    Objects Done
                  </span>
                </div>
                <p className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-300">{approvedObjects}</p>
                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500 mt-0.5">
                  of {totalObjects} total ({completionRate}%)
                </p>
              </div>
            </div>

            {/* Projected full value */}
            {totalObjects > approvedObjects && (
              <div className="rounded-lg border border-dashed border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">
                  Projected value at completion
                </p>
                <p className="text-lg font-mono font-semibold text-muted-foreground mt-0.5">
                  {formatCurrency(projectedTotal)}
                </p>
              </div>
            )}
          </>
        )}

        {/* Footer assumption note */}
        <p className="text-[10px] text-muted-foreground border-t pt-3">
          Estimates based on 8 hrs/object at $150/hr industry average SAP migration cost.{" "}
          <Link href="/analytics" className="underline underline-offset-2 hover:text-foreground transition-colors">
            View detailed analytics
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
