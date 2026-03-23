/**
 * Server-Sent Events endpoint for real-time conversion progress.
 *
 * Usage:
 *   const evtSource = new EventSource(`/api/sse/conversion?objectId=<id>`);
 *   evtSource.onmessage = (e) => {
 *     const event = JSON.parse(e.data);  // ConversionSSEEvent
 *   };
 *
 * Or subscribe to all events for a project:
 *   const evtSource = new EventSource(`/api/sse/conversion?projectId=<id>`);
 */

import { type NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { conversionChannel, projectConversionChannel } from "@/server/jobs/conversion-worker";

// Build a fresh ioredis client for subscriber mode (cannot share with the
// general-purpose client once subscribe() is called).
function createSubscriber(): Redis {
  const url = process.env.REDIS_URL;
  return url
    ? new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false })
    : new Redis({
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const objectId = searchParams.get("objectId");
  const projectId = searchParams.get("projectId");

  if (!objectId && !projectId) {
    return NextResponse.json(
      { error: "Provide objectId or projectId query param" },
      { status: 400 },
    );
  }

  const channel = objectId
    ? conversionChannel(objectId)
    : projectConversionChannel(projectId!);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const subscriber = createSubscriber();

      // Send heartbeat every 25 s to keep the connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      function cleanup() {
        clearInterval(heartbeat);
        subscriber.unsubscribe(channel).catch(() => undefined);
        subscriber.quit().catch(() => undefined);
      }

      // Register message handler BEFORE subscribing (no events are missed)
      subscriber.on("message", (_chan: string, message: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));

          // Auto-close when the job reaches a terminal state
          const event = JSON.parse(message) as { type: string };
          if (event.type === "completed" || event.type === "failed") {
            cleanup();
            controller.close();
          }
        } catch {
          // Malformed message — ignore
        }
      });

      subscriber.on("error", (err: Error) => {
        console.error("[SSE] Redis subscriber error:", err.message);
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      });

      await subscriber.subscribe(channel);

      // Emit a "connected" event so the client knows the stream is live
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", channel })}\n\n`,
        ),
      );

      // Tear down when the client disconnects
      request.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx proxy buffering
    },
  });
}
