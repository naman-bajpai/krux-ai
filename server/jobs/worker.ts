/**
 * Worker entry point — run with:
 *   npm run worker
 *   (or: tsx server/jobs/worker.ts)
 */
import { startWorkers } from "./processor";

console.log("[Worker] Starting AI Migrator workers...");
const workers = startWorkers();

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down...");
  await Promise.all([
    workers.migrationWorker.close(),
    workers.notificationWorker.close(),
    workers.exportWorker.close(),
    workers.sapExtractionWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
