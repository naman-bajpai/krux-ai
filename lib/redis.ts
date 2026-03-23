import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;

  const client = url
    ? new Redis(url, { maxRetriesPerRequest: null })
    : new Redis({
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
      });

  client.on("error", (err) => {
    console.error("[Redis] Connection error:", err);
  });

  client.on("connect", () => {
    console.log("[Redis] Connected");
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Separate connection for BullMQ (needs maxRetriesPerRequest: null)
export function createBullMQConnection(): Redis {
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
