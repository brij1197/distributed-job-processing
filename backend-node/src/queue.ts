import { Job, Queue } from "bullmq";

const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");

export const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || "6379"),
  maxRetriesPerRequest: null,
};

export const jobQueue = new Queue("jobs", { connection });

export type JobType = "scrape" | "resize" | "convert" | "script";

export async function dispatch(
  jobId: string,
  type: JobType,
  payload: Record<string, unknown>,
  maxRetries = 3,
): Promise<void> {
  await jobQueue.add(
    type,
    { jobId, payload },
    {
      jobId,
      attempts: maxRetries + 1,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}
