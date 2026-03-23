import { ConnectionOptions, Worker, type Job } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";
import {
  QUEUE_NAMES,
  type ConvertObjectJob,
  type SendNotificationJob,
  type ExportProjectJob,
} from "@/server/jobs/queue";
import {
  SAP_EXTRACTION_QUEUE_NAME,
  runSAPExtraction,
  type SAPExtractionJobData,
} from "@/lib/sap/extractor";
import { processConversionJob } from "@/server/jobs/conversion-worker";

// ─── Migration Worker ─────────────────────────────────────────────────────────
// Delegates to the real AI converter — see /server/jobs/conversion-worker.ts

// ─── Notification Worker ──────────────────────────────────────────────────────

async function processNotification(job: Job<SendNotificationJob>) {
  const { userId, type, payload } = job.data;
  console.log(`[Worker] Sending ${type} notification to user ${userId}`, payload);
  // Integrate with your notification service (email, push, etc.)
}

// ─── Export Worker ────────────────────────────────────────────────────────────

async function processExport(job: Job<ExportProjectJob>) {
  const { projectId, format } = job.data;
  console.log(`[Worker] Exporting project ${projectId} as ${format}`);
  // Build export archive
}

// ─── Worker Instantiation ─────────────────────────────────────────────────────

export function startWorkers() {
  const connection = createBullMQConnection();

  const migrationWorker = new Worker<ConvertObjectJob>(
    QUEUE_NAMES.MIGRATION,
    processConversionJob,
    {
      connection: connection as ConnectionOptions,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  const notificationWorker = new Worker<SendNotificationJob>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotification,
    { connection: connection as ConnectionOptions, concurrency: 10 }
  );

  const exportWorker = new Worker<ExportProjectJob>(
    QUEUE_NAMES.EXPORTS,
    processExport,
    { connection: connection as ConnectionOptions, concurrency: 2 }
  );

  // ── SAP Extraction Worker ───────────────────────────────────────────────────
  const sapExtractionWorker = new Worker<SAPExtractionJobData>(
    SAP_EXTRACTION_QUEUE_NAME,
    runSAPExtraction,
    // cast: project ioredis vs bullmq bundled ioredis version mismatch (pre-existing)
    { connection: connection as never, concurrency: 2 },
  );

  migrationWorker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  migrationWorker.on("error", (err) => {
    console.error("[Worker] Migration worker error:", err);
  });

  sapExtractionWorker.on("failed", (job, err) => {
    console.error(`[Worker] SAP extraction job ${job?.id} failed:`, err.message);
  });

  sapExtractionWorker.on("error", (err) => {
    console.error("[Worker] SAP extraction worker error:", err);
  });

  console.log("[Worker] All workers started");

  return { migrationWorker, notificationWorker, exportWorker, sapExtractionWorker };
}
export type Workers = ReturnType<typeof startWorkers>;
