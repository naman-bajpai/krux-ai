"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Layers,
  TrendingUp,
  Edit3,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Metadata } from "next";

// ─── Tiny bar chart (pure CSS, no dep) ───────────────────────────────────────

function MiniBar({
  value,
  max,
  color = "bg-primary",
  label,
  sublabel,
}: {
  value: number;
  max: number;
  color?: string;
  label: string;
  sublabel?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-right">
        <p className="text-xs font-medium truncate" title={label}>
          {label}
        </p>
        {sublabel && (
          <p className="text-[10px] text-muted-foreground">{sublabel}</p>
        )}
      </div>
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            )}
          </div>
          <Icon className="h-7 w-7 text-muted-foreground opacity-60 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Trend sparkline (14-day bar chart) ──────────────────────────────────────

function Sparkline({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center gap-0.5 group relative"
          title={`${d.label}: ${d.count} conversions`}
        >
          <div
            className="w-full rounded-sm bg-primary/70 hover:bg-primary transition-all duration-200"
            style={{ height: `${Math.max(4, (d.count / max) * 52)}px` }}
          />
          {i % 4 === 0 && (
            <span className="text-[9px] text-muted-foreground rotate-0 leading-none">
              {d.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Donut ring (pure CSS clip-path workaround using conic-gradient) ──────────

function DonutRing({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;

  let accumulated = 0;
  const gradient = segments
    .map(({ value, color }) => {
      const pct = (value / total) * 100;
      const start = accumulated;
      accumulated += pct;
      return `${color} ${start.toFixed(1)}% ${accumulated.toFixed(1)}%`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-6">
      <div
        className="w-20 h-20 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${gradient})`,
          WebkitMaskImage:
            "radial-gradient(circle at center, transparent 35%, black 36%)",
          maskImage:
            "radial-gradient(circle at center, transparent 35%, black 36%)",
        }}
      />
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-xs font-medium ml-auto pl-4">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [projectId, setProjectId] = useState<string>("");

  const { data: projects } = trpc.project.list.useQuery({ limit: 50 });

  const { data: stats, isLoading, refetch } = trpc.analytics.projectStats.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const { data: reviewStats } = trpc.analytics.reviewStats.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Migration insights and performance metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select a project…" />
            </SelectTrigger>
            <SelectContent>
              {projects?.projects.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectId && (
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!projectId && (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium">Select a project to view analytics</p>
            <p className="text-xs text-muted-foreground mt-1">
              Conversion rates, confidence scores, review stats and cost breakdowns.
            </p>
          </CardContent>
        </Card>
      )}

      {projectId && isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {projectId && stats && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Layers}
              label="Total Objects"
              value={stats.total}
              sub={`${stats.completionRate}% complete`}
            />
            <StatCard
              icon={CheckCircle2}
              label="Approved"
              value={stats.byStatus["APPROVED"] ?? 0}
              color="text-green-600 dark:text-green-400"
              sub={stats.total > 0 ? `${Math.round(((stats.byStatus["APPROVED"] ?? 0) / stats.total) * 100)}% of total` : undefined}
            />
            <StatCard
              icon={Clock}
              label="Avg Convert Time"
              value={
                stats.avgProcessingMs
                  ? `${(stats.avgProcessingMs / 1000).toFixed(1)}s`
                  : "—"
              }
              sub="per ABAP object"
            />
            <StatCard
              icon={DollarSign}
              label="Est. AI Cost"
              value={`$${stats.estimatedCostUsd.toFixed(2)}`}
              sub={`${stats.totalTokens.toLocaleString()} tokens`}
            />
          </div>

          {/* Middle row: status breakdown + confidence + review */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Status breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Objects by Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {(
                  [
                    ["APPROVED",   "bg-green-500",  "APPROVED"],
                    ["CONVERTED",  "bg-blue-400",   "CONVERTED"],
                    ["REVIEWED",   "bg-indigo-400", "REVIEWED"],
                    ["CONVERTING", "bg-yellow-400", "CONVERTING"],
                    ["PENDING",    "bg-muted-foreground", "PENDING"],
                    ["FAILED",     "bg-red-500",    "FAILED"],
                  ] as const
                ).map(([status, color, label]) => (
                  <MiniBar
                    key={status}
                    label={label}
                    value={(stats.byStatus as Record<string, number>)[status] ?? 0}
                    max={stats.total}
                    color={color}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Confidence distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Confidence Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DonutRing
                  segments={[
                    {
                      label: "High (80–100%)",
                      value: stats.confBuckets.high,
                      color: "#22c55e",
                    },
                    {
                      label: "Medium (60–79%)",
                      value: stats.confBuckets.medium,
                      color: "#eab308",
                    },
                    {
                      label: "Low (<60%)",
                      value: stats.confBuckets.low,
                      color: "#ef4444",
                    },
                  ]}
                />
                {stats.confBuckets.high + stats.confBuckets.medium + stats.confBuckets.low > 0 && (
                  <p className="text-xs text-muted-foreground mt-4">
                    {Math.round(
                      (stats.confBuckets.high /
                        (stats.confBuckets.high + stats.confBuckets.medium + stats.confBuckets.low)) *
                        100
                    )}% of conversions are high confidence — ready for fast approval.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Review decisions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Edit3 className="h-4 w-4" />
                  Review Decisions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {reviewStats ? (
                  <>
                    <DonutRing
                      segments={[
                        {
                          label: "Approved",
                          value: reviewStats.byDecision["APPROVED"],
                          color: "#22c55e",
                        },
                        {
                          label: "Modified",
                          value: reviewStats.byDecision["MODIFIED"],
                          color: "#3b82f6",
                        },
                        {
                          label: "Rejected",
                          value: reviewStats.byDecision["REJECTED"],
                          color: "#ef4444",
                        },
                      ]}
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="rounded-md bg-muted p-2 text-center">
                        <p className="text-lg font-bold text-green-600">
                          {reviewStats.approvalRate}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Approval rate
                        </p>
                      </div>
                      <div className="rounded-md bg-muted p-2 text-center">
                        <p className="text-lg font-bold text-blue-500">
                          {reviewStats.modifiedRate}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Modified by reviewer
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No reviews yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom row: sparkline + object type breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* 14-day conversion trend */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Conversions — Last 14 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Sparkline data={stats.timeSeries} />
                <p className="text-xs text-muted-foreground mt-3">
                  Counts objects that moved to CONVERTED, REVIEWED, or APPROVED each day.
                </p>
              </CardContent>
            </Card>

            {/* Object type breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Objects by Type
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats.byType.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                ) : (
                  stats.byType.slice(0, 8).map((t) => (
                    <MiniBar
                      key={t.type}
                      label={t.type.replace(/_/g, " ")}
                      value={t.count}
                      max={stats.byType[0].count}
                      color="bg-primary/70"
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Failed objects callout */}
          {stats.failed > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-center gap-3 py-4">
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {stats.failed} object{stats.failed > 1 ? "s" : ""} failed conversion
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Go to Migration → filter by FAILED status to re-queue or inspect errors.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
