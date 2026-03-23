/**
 * Conversion Worker
 *
 * BullMQ job processor that calls the real ABAPConverter, writes results to
 * the database, and streams progress via Redis pub/sub → SSE endpoint.
 *
 * Replaces the simulateConversion() stub in processor.ts.
 */

import type { Job } from "bullmq";
import { ObjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { ABAPConverter, ConversionError } from "@/lib/ai/converter";
import type { ConvertObjectJob } from "@/server/jobs/queue";

// ─── SSE Event Types ──────────────────────────────────────────────────────────

export type ConversionEventType =
  | "started"
  | "analyzing"
  | "converting"
  | "persisting"
  | "completed"
  | "failed";

export interface ConversionSSEEvent {
  type: ConversionEventType;
  objectId: string;
  projectId: string;
  jobId: string;
  progress: number; // 0–100
  timestamp: string;
  data?: {
    objectName?: string;
    objectType?: string;
    confidenceScore?: number;
    manualReviewRequired?: boolean;
    breakingChangesCount?: number;
    processingTimeMs?: number;
    costUsd?: number;
    totalTokens?: number;
    errorMessage?: string;
  };
}

/** Redis pub/sub channel for a specific object's conversion events */
export function conversionChannel(objectId: string): string {
  return `conversion:${objectId}`;
}

/** Redis pub/sub channel for all events in a project (dashboard-level) */
export function projectConversionChannel(projectId: string): string {
  return `conversion:project:${projectId}`;
}

// ─── Event Publisher ──────────────────────────────────────────────────────────

async function publish(event: ConversionSSEEvent): Promise<void> {
  const payload = JSON.stringify(event);
  try {
    await Promise.all([
      redis.publish(conversionChannel(event.objectId), payload),
      redis.publish(projectConversionChannel(event.projectId), payload),
    ]);
  } catch (err) {
    // Never let a pub/sub failure abort the conversion
    console.error("[ConversionWorker] Redis publish error:", err);
  }
}

// ─── Main Processor ───────────────────────────────────────────────────────────

/**
 * processConversionJob — called by the BullMQ migration worker.
 *
 * Drop-in replacement for the old simulateConversion() approach in processor.ts.
 */
export async function processConversionJob(
  job: Job<ConvertObjectJob>,
): Promise<{ objectId: string; confidenceScore: number; costUsd: number }> {
  const { objectId, projectId, userId } = job.data;
  const jobId = job.id ?? "unknown";
  const startTime = Date.now();

  // ── 1. Load the object ─────────────────────────────────────────────────────
  const migrationObject = await db.migrationObject.findUnique({
    where: { id: objectId },
  });

  if (!migrationObject) {
    throw new Error(`MigrationObject ${objectId} not found`);
  }

  const baseEvent = {
    objectId,
    projectId,
    jobId,
    timestamp: new Date().toISOString(),
    data: {
      objectName: migrationObject.objectName,
      objectType: migrationObject.objectType,
    },
  };

  // ── 2. Mark as CONVERTING + emit started ──────────────────────────────────
  await db.migrationObject.update({
    where: { id: objectId },
    data: { status: ObjectStatus.CONVERTING },
  });

  await publish({ ...baseEvent, type: "started", progress: 5 });
  await job.updateProgress(5);

  // ── 3. Static ABAP analysis ────────────────────────────────────────────────
  await publish({ ...baseEvent, type: "analyzing", progress: 15 });
  await job.updateProgress(15);

  // ── 4. AI conversion ───────────────────────────────────────────────────────
  await publish({ ...baseEvent, type: "converting", progress: 20 });
  await job.updateProgress(20);

  let conversionResult;
  try {
    const converter = new ABAPConverter();
    conversionResult = await converter.convertObject(migrationObject);
  } catch (err) {
    const message =
      err instanceof ConversionError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown conversion error";

    await db.migrationObject.update({
      where: { id: objectId },
      data: { status: ObjectStatus.FAILED, errorMessage: message },
    });

    await publish({
      ...baseEvent,
      type: "failed",
      progress: 0,
      timestamp: new Date().toISOString(),
      data: { ...baseEvent.data, errorMessage: message },
    });

    throw err;
  }

  await job.updateProgress(75);

  // ── 5. Persist results ─────────────────────────────────────────────────────
  await publish({
    ...baseEvent,
    type: "persisting",
    progress: 80,
    timestamp: new Date().toISOString(),
  });

  const processingTimeMs = Date.now() - startTime;
  // Normalise 1–10 → 0.0–1.0 for DB storage (consistent with schema convention)
  const confidenceScoreDb = conversionResult.confidenceScore / 10;

  await db.migrationObject.update({
    where: { id: objectId },
    data: {
      convertedCode: conversionResult.convertedCode,
      confidenceScore: confidenceScoreDb,
      status: conversionResult.manualReviewRequired
        ? ObjectStatus.CONVERTED  // stays at CONVERTED so reviewer picks it up
        : ObjectStatus.CONVERTED,
      errorMessage: null,
      processingTime: processingTimeMs,
      tokenCount: conversionResult.cost.totalTokens,
    },
  });

  await job.updateProgress(90);

  // ── 6. Audit log ───────────────────────────────────────────────────────────
  await db.auditLog.create({
    data: {
      projectId,
      userId,
      action: "OBJECT_CONVERTED",
      metadata: {
        objectId,
        objectName: migrationObject.objectName,
        confidenceScore: conversionResult.confidenceScore,
        manualReviewRequired: conversionResult.manualReviewRequired,
        breakingChangesCount: conversionResult.breakingChanges.length,
        processingTimeMs,
        costUsd: conversionResult.cost.estimatedCostUsd,
        totalTokens: conversionResult.cost.totalTokens,
        model: "claude-sonnet-4-5",
      },
    },
  });

  await job.updateProgress(100);

  // ── 7. Emit completed event ────────────────────────────────────────────────
  await publish({
    ...baseEvent,
    type: "completed",
    progress: 100,
    timestamp: new Date().toISOString(),
    data: {
      objectName: migrationObject.objectName,
      objectType: migrationObject.objectType,
      confidenceScore: conversionResult.confidenceScore,
      manualReviewRequired: conversionResult.manualReviewRequired,
      breakingChangesCount: conversionResult.breakingChanges.length,
      processingTimeMs,
      costUsd: conversionResult.cost.estimatedCostUsd,
      totalTokens: conversionResult.cost.totalTokens,
    },
  });

  console.log(
    `[ConversionWorker] ✓ ${migrationObject.objectName} ` +
      `confidence=${conversionResult.confidenceScore}/10 ` +
      `review=${conversionResult.manualReviewRequired} ` +
      `cost=$${conversionResult.cost.estimatedCostUsd.toFixed(6)} ` +
      `time=${processingTimeMs}ms`,
  );

  return {
    objectId,
    confidenceScore: conversionResult.confidenceScore,
    costUsd: conversionResult.cost.estimatedCostUsd,
  };
}
