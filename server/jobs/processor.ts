import { Worker, Job } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";
import { db } from "@/lib/db";
import { ObjectStatus } from "@prisma/client";
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

// ─── Migration Worker ─────────────────────────────────────────────────────────

async function processConvertObject(job: Job<ConvertObjectJob>) {
  const { objectId, projectId } = job.data;
  const startTime = Date.now();

  console.log(`[Worker] Processing object ${objectId}`);

  const migrationObject = await db.migrationObject.findUnique({
    where: { id: objectId },
  });

  if (!migrationObject) {
    throw new Error(`Object ${objectId} not found`);
  }

  // Update progress
  await job.updateProgress(10);

  try {
    // Simulate AI conversion (replace with actual AI call)
    // e.g., OpenAI API call to convert SAP ABAP to target language
    await job.updateProgress(30);

    const conversionResult = await simulateConversion(
      migrationObject.sourceCode,
      migrationObject.objectType
    );

    await job.updateProgress(80);

    const processingTime = Date.now() - startTime;

    await db.migrationObject.update({
      where: { id: objectId },
      data: {
        convertedCode: conversionResult.code,
        confidenceScore: conversionResult.confidence,
        status: ObjectStatus.CONVERTED,
        processingTime,
        errorMessage: null,
      },
    });

    await job.updateProgress(90);

    // Log the action
    await db.auditLog.create({
      data: {
        projectId,
        userId: job.data.userId,
        action: "OBJECT_CONVERTED",
        metadata: {
          objectId,
          confidence: conversionResult.confidence,
          processingTime,
        },
      },
    });

    await job.updateProgress(100);

    console.log(
      `[Worker] Object ${objectId} converted in ${processingTime}ms (confidence: ${conversionResult.confidence})`
    );

    return { objectId, confidence: conversionResult.confidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await db.migrationObject.update({
      where: { id: objectId },
      data: {
        status: ObjectStatus.FAILED,
        errorMessage: message,
      },
    });

    throw err;
  }
}

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
    processConvertObject,
    {
      connection,
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
    { connection, concurrency: 10 }
  );

  const exportWorker = new Worker<ExportProjectJob>(
    QUEUE_NAMES.EXPORTS,
    processExport,
    { connection, concurrency: 2 }
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

// ─── Simulation Helper (replace with real AI) ────────────────────────────────

async function simulateConversion(
  sourceCode: string,
  objectType: string
): Promise<{ code: string; confidence: number }> {
  // Simulate processing delay
  await new Promise((resolve) =>
    setTimeout(resolve, 500 + Math.random() * 1500)
  );

  const confidence = 0.6 + Math.random() * 0.4;

  const converted = `// Converted from SAP ABAP (${objectType})
// Confidence: ${Math.round(confidence * 100)}%
// Generated: ${new Date().toISOString()}

${sourceCode
  .split("\n")
  .map((line) => `// ${line}`)
  .join("\n")}

// TODO: Review and finalize the converted code above
`;

  return { code: converted, confidence };
}
