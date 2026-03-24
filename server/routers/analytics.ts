import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { ObjectStatus, ObjectType, ReviewDecisionType } from "@prisma/client";

export const analyticsRouter = createTRPCRouter({

  // ── Project-level overview ─────────────────────────────────────────────────
  projectStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { projectId } = input;

      const [statusGroups, typeGroups, objects] = await Promise.all([
        // Status breakdown
        ctx.db.migrationObject.groupBy({
          by: ["status"],
          where: { projectId },
          _count: { status: true },
        }),
        // Type breakdown
        ctx.db.migrationObject.groupBy({
          by: ["objectType"],
          where: { projectId },
          _count: { objectType: true },
        }),
        // All objects for time-series + confidence
        ctx.db.migrationObject.findMany({
          where: { projectId },
          select: {
            status: true,
            confidenceScore: true,
            processingTime: true,
            tokenCount: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      const byStatus = Object.fromEntries(
        statusGroups.map((g) => [g.status, g._count.status])
      ) as Record<ObjectStatus, number>;

      const byType = typeGroups
        .map((g) => ({ type: g.objectType, count: g._count.objectType }))
        .sort((a, b) => b.count - a.count);

      // Confidence distribution buckets
      const converted = objects.filter(
        (o) => o.confidenceScore !== null
      );
      const confBuckets = {
        high:   converted.filter((o) => o.confidenceScore! >= 0.8).length,
        medium: converted.filter((o) => o.confidenceScore! >= 0.6 && o.confidenceScore! < 0.8).length,
        low:    converted.filter((o) => o.confidenceScore! < 0.6).length,
      };

      // Avg processing time (ms) for converted objects
      const withTime = objects.filter((o) => o.processingTime !== null);
      const avgProcessingMs =
        withTime.length > 0
          ? Math.round(
              withTime.reduce((s, o) => s + o.processingTime!, 0) / withTime.length
            )
          : null;

      // Total tokens & estimated cost
      const totalTokens = objects.reduce((s, o) => s + (o.tokenCount ?? 0), 0);
      // Rough cost: sonnet-4-5 avg ~$0.000009 per token combined
      const estimatedCostUsd = Math.round(totalTokens * 0.000009 * 100) / 100;

      // Objects converted per day (last 14 days)
      const now = Date.now();
      const dayMs = 86_400_000;
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now - (13 - i) * dayMs);
        return d.toISOString().slice(0, 10);
      });

      const conversionsByDay = Object.fromEntries(days.map((d) => [d, 0]));
      for (const o of objects) {
        if (
          o.status === ObjectStatus.CONVERTED ||
          o.status === ObjectStatus.REVIEWED ||
          o.status === ObjectStatus.APPROVED
        ) {
          const day = o.updatedAt.toISOString().slice(0, 10);
          if (day in conversionsByDay) conversionsByDay[day]++;
        }
      }

      const timeSeries = days.map((day) => ({
        day,
        label: new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        count: conversionsByDay[day],
      }));

      const total = objects.length;
      const approved = byStatus[ObjectStatus.APPROVED] ?? 0;
      const failed = byStatus[ObjectStatus.FAILED] ?? 0;
      const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0;

      return {
        total,
        byStatus,
        byType,
        confBuckets,
        avgProcessingMs,
        totalTokens,
        estimatedCostUsd,
        completionRate,
        failed,
        timeSeries,
      };
    }),

  // ── Review decision breakdown ──────────────────────────────────────────────
  reviewStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const decisions = await ctx.db.reviewDecision.findMany({
        where: { migrationObject: { projectId: input.projectId } },
        select: {
          decision: true,
          createdAt: true,
          migrationObject: {
            select: { updatedAt: true, createdAt: true },
          },
        },
      });

      const byDecision = {
        [ReviewDecisionType.APPROVED]: 0,
        [ReviewDecisionType.REJECTED]: 0,
        [ReviewDecisionType.MODIFIED]: 0,
      };
      for (const d of decisions) byDecision[d.decision]++;

      const totalReviews = decisions.length;
      const modifiedRate =
        totalReviews > 0
          ? Math.round((byDecision[ReviewDecisionType.MODIFIED] / totalReviews) * 100)
          : 0;
      const approvalRate =
        totalReviews > 0
          ? Math.round((byDecision[ReviewDecisionType.APPROVED] / totalReviews) * 100)
          : 0;

      return {
        totalReviews,
        byDecision,
        modifiedRate,
        approvalRate,
      };
    }),

  // ── Org-wide summary (dashboard cards) ────────────────────────────────────
  orgSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const orgId = ctx.session.user.organizationId;
      const where = orgId ? { project: { orgId } } : {};

      const [total, approved, failed, avgConf] = await Promise.all([
        ctx.db.migrationObject.count({ where }),
        ctx.db.migrationObject.count({
          where: { ...where, status: ObjectStatus.APPROVED },
        }),
        ctx.db.migrationObject.count({
          where: { ...where, status: ObjectStatus.FAILED },
        }),
        ctx.db.migrationObject.aggregate({
          where: { ...where, confidenceScore: { not: null } },
          _avg: { confidenceScore: true },
        }),
      ]);

      return {
        total,
        approved,
        failed,
        avgConfidence: avgConf._avg.confidenceScore
          ? Math.round(avgConf._avg.confidenceScore * 100)
          : null,
      };
    }),
});
