import { Queue, QueueEvents } from "bullmq";
import { createBullMQConnection } from "@/lib/redis";

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  MIGRATION: "migration",
  NOTIFICATIONS: "notifications",
  EXPORTS: "exports",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job Types ────────────────────────────────────────────────────────────────

export interface ConvertObjectJob {
  objectId: string;
  projectId: string;
  userId: string;
}

export interface SendNotificationJob {
  userId: string;
  type: "CONVERSION_COMPLETE" | "REVIEW_NEEDED" | "PROJECT_COMPLETE";
  payload: Record<string, unknown>;
}

export interface ExportProjectJob {
  projectId: string;
  userId: string;
  format: "JSON" | "ZIP";
}

// ─── Queue Instances ──────────────────────────────────────────────────────────

const connection = createBullMQConnection();

export const migrationQueue = new Queue<ConvertObjectJob>(
  QUEUE_NAMES.MIGRATION,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: { count: 1000, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  }
);

export const notificationQueue = new Queue<SendNotificationJob>(
  QUEUE_NAMES.NOTIFICATIONS,
  {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "fixed", delay: 1000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  }
);

export const exportQueue = new Queue<ExportProjectJob>(QUEUE_NAMES.EXPORTS, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ─── Queue Events ─────────────────────────────────────────────────────────────

export const migrationQueueEvents = new QueueEvents(QUEUE_NAMES.MIGRATION, {
  connection: createBullMQConnection(),
});

migrationQueueEvents.on("completed", ({ jobId }) => {
  console.log(`[Queue] Migration job ${jobId} completed`);
});

migrationQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`[Queue] Migration job ${jobId} failed:`, failedReason);
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

export async function getQueueStats() {
  const [migrationCounts, notificationCounts, exportCounts] = await Promise.all(
    [
      migrationQueue.getJobCounts(
        "active",
        "waiting",
        "completed",
        "failed",
        "delayed"
      ),
      notificationQueue.getJobCounts("active", "waiting", "completed"),
      exportQueue.getJobCounts("active", "waiting", "completed"),
    ]
  );

  return {
    migration: migrationCounts,
    notifications: notificationCounts,
    exports: exportCounts,
  };
}
