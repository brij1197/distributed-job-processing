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

async function handleResize(
  _jobId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sharp = require("sharp");
  const { path, width = 800, height = 600 } = payload;
  const outPath = `${path}-resized.png`;
  await sharp(path).resize(width, height).toFile(outPath);
  return { outPath };
}

async function handleConvert(
  _jobId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const { dirname, extname } = await import("path");

  const inputPath = payload["input_path"] as string;
  const format = (payload["format"] as string) || "pdf";
  const outDir = dirname(inputPath);

  await promisify(execFile)(
    "libreoffice",
    ["--headless", "--convert-to", format, "--outDir", outDir, inputPath],
    { timeout: 120_000 },
  );

  const outPath = inputPath.replace(extname(inputPath), `.${format}`);
  return { input: inputPath, output: outPath, format };
}

// Handler map
const handlers: Record<
  JobType,
  (
    jobId: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
> = {
  scrape: handleScrape,
  resize: handleResize,
  convert: handleConvert,
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

    await setStatus(jobId, "running");

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
