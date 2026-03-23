import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import {
  SAPConnector,
  SAPConnectionError,
} from "@/lib/sap/connector";
import {
  sapExtractionQueue,
  SAP_EXTRACTION_QUEUE_NAME,
  type SAPExtractionProgress,
} from "@/lib/sap/extractor";
import { Queue, type ConnectionOptions } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";

// ─── Shared Input Schema ──────────────────────────────────────────────────────

const SAPConnectionParamsSchema = z.object({
  host: z.string().min(1, "Host is required"),
  systemNumber: z
    .string()
    .length(2, "System number must be 2 digits (e.g. 00)")
    .regex(/^\d{2}$/, "System number must be numeric"),
  client: z
    .string()
    .min(1)
    .max(3, "Client is up to 3 digits (e.g. 800)")
    .regex(/^\d+$/, "Client must be numeric"),
  user: z.string().min(1, "SAP user is required"),
  password: z.string().min(1, "SAP password is required"),
  lang: z.string().length(2).default("EN"),
});

// ─── SAP Router ───────────────────────────────────────────────────────────────

export const sapRouter = createTRPCRouter({
  /**
   * Test connectivity to an SAP system.
   * Returns success flag + system information on success.
   */
  testConnection: protectedProcedure
    .input(SAPConnectionParamsSchema)
    .mutation(async ({ input }) => {
      const connector = new SAPConnector(input);

      try {
        await connector.connect();

        const [alive, systemInfo] = await Promise.all([
          connector.ping(),
          connector.getSystemInfo(),
        ]);

        if (!alive) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "SAP system did not respond to RFC_PING",
          });
        }

        return { success: true as const, systemInfo };
      } catch (err) {
        if (err instanceof TRPCError) throw err;

        const message =
          err instanceof SAPConnectionError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown connection error";

        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `SAP connection failed: ${message}`,
        });
      } finally {
        await connector.disconnect();
      }
    }),

  /**
   * Enqueue a full SAP extraction job for the given project.
   * Returns the BullMQ jobId for progress polling.
   */
  startExtraction: protectedProcedure
    .input(
      z.object({
        projectId: z.string().cuid(),
        connectionParams: SAPConnectionParamsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, connectionParams } = input;

      // Verify the project exists and belongs to the caller's org
      const project = await ctx.db.project.findUnique({
        where: { id: projectId },
        select: { id: true, orgId: true, name: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const orgId = ctx.session.user.organizationId;
      if (orgId && project.orgId !== orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Project does not belong to your organization",
        });
      }

      // Check no extraction is already running for this project
      const waiting = await sapExtractionQueue.getJobs(["active", "waiting"]);
      const duplicate = waiting.find((j) => j.data.projectId === projectId);
      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An extraction is already queued for this project (jobId: ${duplicate.id})`,
        });
      }

      const job = await sapExtractionQueue.add(
        `extract-${projectId}`,
        {
          projectId,
          userId: ctx.session.user.id,
          connectionParams,
        },
        {
          jobId: `sap-extract-${projectId}-${Date.now()}`,
        },
      );

      await ctx.db.auditLog.create({
        data: {
          projectId,
          userId: ctx.session.user.id,
          action: "SAP_EXTRACTION_STARTED",
          metadata: {
            jobId: job.id,
            host: connectionParams.host,
            client: connectionParams.client,
          },
        },
      });

      return { jobId: job.id as string };
    }),

  /**
   * Poll the progress of a running or completed extraction job.
   */
  getExtractionProgress: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ input }) => {
      // Re-use the same Redis connection to look up the job
      const queue = new Queue(SAP_EXTRACTION_QUEUE_NAME, {
        connection: createBullMQConnection() as unknown as ConnectionOptions,
      });

      try {
        const job = await queue.getJob(input.jobId);

        if (!job) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Job ${input.jobId} not found`,
          });
        }

        const state = await job.getState();

        // job.progress is whatever we passed to job.updateProgress()
        const rawProgress = job.progress as SAPExtractionProgress | number | undefined;

        const progress: SAPExtractionProgress =
          rawProgress && typeof rawProgress === "object"
            ? rawProgress
            : {
                total: 0,
                processed: 0,
                failed: 0,
                status:
                  state === "completed"
                    ? "completed"
                    : state === "failed"
                      ? "failed"
                      : state === "active"
                        ? "running"
                        : "queued",
                currentBatch: 0,
                totalBatches: 0,
              };

        // Normalise status against BullMQ job state (source of truth)
        if (state === "completed") progress.status = "completed";
        if (state === "failed") progress.status = "failed";

        return {
          jobId: input.jobId,
          state,
          failedReason: job.failedReason ?? null,
          ...progress,
        };
      } finally {
        await queue.close();
      }
    }),
});
