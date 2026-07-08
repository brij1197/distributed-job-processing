import { Worker, Job } from "bullmq";
import { connection, JobType } from "./queue";
import { query } from "./db";

//Update Job in Postgres
async function setStatus(
  jobId: string,
  status: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const fields = ["status = $2"];
  const values: unknown[] = [jobId, status];
  let i = 3;

  if (status === "running") {
    fields.push(`start_at = NOW()`);
  } else if (status === "success" || status === "failed") {
    fields.push(`finished_at = NOW()`);
  }

  for (const [key, val] of Object.entries(extras)) {
    fields.push(`${key} = $${i++}`);
    values.push(typeof val === "object" ? JSON.stringify(val) : val);
  }

  await query(`UPDATE jobs SET ${fields.join(", ")} WHERE id = $1 `, values);
}

// Job Handlers
async function handleScrape(
  _jobId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = payload["url"] as string;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}  from ${url}`);
  const html = await res.text();
  const titleMatch = html.match(/<title>(.*?)<\/title>/is);
  return {
    status_code: res.status,
    content_length: html.length,
    title: titleMatch ? titleMatch[1].trim() : "No title found",
  };
}

// Handler map
// NOTE: The Node backend is intentionally scoped to `scrape` only. It exists to
// demonstrate the same BullMQ + Postgres queue architecture on a second stack
const handlers: Record<
  JobType,
  (
    jobId: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
> = {
  scrape: handleScrape,
};

// BullMQ Worker
const worker = new Worker(
  "jobs",
  async (job: Job) => {
    const { jobId, payload } = job.data as {
      jobId: string;
      payload: Record<string, unknown>;
    };

    const type = job.name as JobType;

    // Record which stack executed this job, set on the running transition
    // so it reflects the worker that picked it up.
    await setStatus(jobId, "running", { worker_stack: "bullmq" });

    const handler = handlers[type];
    if (!handler) throw new Error(`Unknown job type: ${type}`);

    const result = await handler(jobId, payload);
    await setStatus(jobId, "success", { result });
    return result;
  },
  { connection },
);

// Lifecycle Events
worker.on("failed", async (job, err) => {
  if (!job) return;
  const { jobId } = job.data as { jobId: string };
  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

  if (isLastAttempt) {
    await setStatus(jobId, "failed", { error: err.message });
  } else {
    await query(
      `UPDATE jobs SET status = 'retrying', retries = retries + 1, error = $2 WHERE id = $1`,
      [jobId, err.message],
    );
  }
});

worker.on("ready", () =>
  console.log("Worker ready - listening on queue: jobs"),
);
worker.on("error", (err) => console.error("Worker error:", err));
