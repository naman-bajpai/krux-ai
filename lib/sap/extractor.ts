/**
 * SAP Extraction Pipeline
 *
 * Runs inside a BullMQ job worker. Takes a connected SAPConnector, lists
 * all custom objects, fetches their source in batches of 50, and persists
 * each one to the database via Prisma. Progress is streamed through BullMQ
 * job.updateProgress() so the tRPC router can poll it.
 */

import { Job, Queue, type ConnectionOptions } from "bullmq";
import { ObjectStatus } from "@prisma/client";
import { createBullMQConnection } from "@/lib/redis";
import { db } from "@/lib/db";
import {
  SAPConnector,
  SAPConnectionParams,
  SAPExtractionError,
  SAP_TYPE_TO_PRISMA_MAP,
  type SAPObjectTypeCode,
  type SAPRepositoryObject,
} from "./connector";

// ─── Extraction Queue ─────────────────────────────────────────────────────────

export const SAP_EXTRACTION_QUEUE_NAME = "sap-extraction";

export interface SAPExtractionJobData {
  projectId: string;
  userId: string;
  connectionParams: SAPConnectionParams;
}

/** Shape stored in job.progress — readable by getExtractionProgress */
export interface SAPExtractionProgress {
  total: number;
  processed: number;
  failed: number;
  status: "queued" | "running" | "completed" | "failed";
  currentBatch: number;
  totalBatches: number;
}

export const sapExtractionQueue = new Queue<SAPExtractionJobData>(
  SAP_EXTRACTION_QUEUE_NAME,
  {
    // cast needed: project ioredis vs bullmq bundled ioredis version mismatch
    connection: createBullMQConnection() as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 1, // extraction is long-running; manual retry via new job
      removeOnComplete: { count: 200, age: 7 * 24 * 3600 },
      removeOnFail: { count: 100, age: 14 * 24 * 3600 },
    },
  },
);

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

// ─── Main Extraction Orchestrator ─────────────────────────────────────────────

/**
 * Called by the BullMQ worker processor.  Connects to SAP, extracts all custom
 * objects in batches, persists results, and keeps the job progress up to date.
 *
 * Errors on individual objects are caught, logged, and persisted as FAILED
 * records so the rest of the batch continues.
 */
export async function runSAPExtraction(
  job: Job<SAPExtractionJobData>,
): Promise<SAPExtractionProgress> {
  const { projectId, connectionParams } = job.data;

  const connector = new SAPConnector(connectionParams);

  await reportProgress(job, {
    total: 0,
    processed: 0,
    failed: 0,
    status: "running",
    currentBatch: 0,
    totalBatches: 0,
  });

  await connector.connect();

  try {
    // ── Step 1: Discover all custom objects ──────────────────────────────────
    console.log(`[SAPExtractor] Discovering custom objects for project ${projectId}`);
    const allObjects = await connector.listCustomObjects();
    const total = allObjects.length;

    console.log(`[SAPExtractor] Found ${total} custom objects`);

    // ── Step 2: Slice into batches ────────────────────────────────────────────
    const batches: typeof allObjects[] = [];
    for (let i = 0; i < allObjects.length; i += BATCH_SIZE) {
      batches.push(allObjects.slice(i, i + BATCH_SIZE));
    }

    let processed = 0;
    let failed = 0;

    // ── Step 3: Process each batch ────────────────────────────────────────────
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      for (const objectMeta of batch) {
        try {
          const sapObject = await connector.extractObject(
            objectMeta.objectType,
            objectMeta.objectName,
            objectMeta.packageName,
          );

          await persistObject(projectId, sapObject);
          processed++;
        } catch (err) {
          failed++;
          const message = extractErrorMessage(err, objectMeta.objectName);

          console.error(
            `[SAPExtractor] Failed: ${objectMeta.objectType}/${objectMeta.objectName} — ${message}`,
          );

          // Record the failure in the DB so reviewers can see which objects are broken
          await persistFailedObject(
            projectId,
            objectMeta.objectType,
            objectMeta.objectName,
            objectMeta.packageName,
            message,
          ).catch((dbErr) => {
            // Don't let a DB write failure abort the whole extraction
            console.error(
              `[SAPExtractor] Could not persist failure for ${objectMeta.objectName}:`,
              dbErr,
            );
          });
        }

        await reportProgress(job, {
          total,
          processed,
          failed,
          status: "running",
          currentBatch: batchIdx + 1,
          totalBatches: batches.length,
        });
      }
    }

    const finalProgress: SAPExtractionProgress = {
      total,
      processed,
      failed,
      status: "completed",
      currentBatch: batches.length,
      totalBatches: batches.length,
    };

    await reportProgress(job, finalProgress);

    console.log(
      `[SAPExtractor] Done. processed=${processed} failed=${failed} total=${total}`,
    );

    return finalProgress;
  } finally {
    await connector.disconnect();
  }
}

// ─── Persistence Helpers ──────────────────────────────────────────────────────

async function persistObject(
  projectId: string,
  obj: SAPRepositoryObject,
): Promise<void> {
  await db.migrationObject.upsert({
    where: {
      projectId_objectType_objectName: {
        projectId,
        objectType: obj.prismaObjectType,
        objectName: obj.objectName,
      },
    },
    create: {
      projectId,
      objectType: obj.prismaObjectType,
      objectName: obj.objectName,
      packageName: obj.packageName || null,
      sourceCode: obj.sourceCode,
      status: ObjectStatus.PENDING,
    },
    update: {
      packageName: obj.packageName || null,
      sourceCode: obj.sourceCode,
      status: ObjectStatus.PENDING,
      errorMessage: null,
    },
  });
}

async function persistFailedObject(
  projectId: string,
  objectType: SAPObjectTypeCode,
  objectName: string,
  packageName: string,
  errorMessage: string,
): Promise<void> {
  const prismaType = SAP_TYPE_TO_PRISMA_MAP[objectType];

  await db.migrationObject.upsert({
    where: {
      projectId_objectType_objectName: {
        projectId,
        objectType: prismaType,
        objectName,
      },
    },
    create: {
      projectId,
      objectType: prismaType,
      objectName,
      packageName: packageName || null,
      sourceCode: "",
      status: ObjectStatus.FAILED,
      errorMessage,
    },
    update: {
      status: ObjectStatus.FAILED,
      errorMessage,
    },
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

async function reportProgress(
  job: Job<SAPExtractionJobData>,
  progress: SAPExtractionProgress,
): Promise<void> {
  // BullMQ accepts number | object for progress
  await job.updateProgress(progress as unknown as number);
}

function extractErrorMessage(err: unknown, objectName: string): string {
  if (err instanceof SAPExtractionError) return err.message;
  if (err instanceof Error) return err.message;
  return `Unknown error extracting ${objectName}`;
}
