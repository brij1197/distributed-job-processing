const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API!;
const NODE_API = process.env.NEXT_PUBLIC_NODE_API!;

export type Backend = "python" | "node";

function apiBase(backend: Backend): string {
  return backend === "python" ? PYTHON_API : NODE_API;
}

function jobsPath(backend: Backend): string {
  return backend === "python" ? "/jobs/" : "/jobs";
}

export type JobStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "retrying";
export type JobType = "scrape" | "resize" | "convert";

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  retries: number;
  max_retries: number;
  worker_stack: "celery" | "bullmq" | null;
  created_at: string;
  updated_at: string;
  start_at: string | null;
  finished_at: string | null;
}

export interface JobListReponse {
  jobs: Job[];
  total: number;
}

// The two backends share one Postgres jobs table, so listing from either
// returns every job regardless of which stack ran it. We read from Python
// (the always-on full worker) and use worker_stack to distinguish rows.
export async function listJobs(
  status?: string,
  limit = 20,
  offset = 0,
): Promise<JobListReponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (status) {
    params.set("status", status);
  }
  const res = await fetch(`${PYTHON_API}/jobs/?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch jobs.");
  return res.json();
}

export async function getJob(
  id: string,
  backend: Backend = "python",
): Promise<Job> {
  const res = await fetch(`${apiBase(backend)}/jobs/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch job.");
  return res.json();
}

export async function uploadFile(
  file: File,
  backend: Backend = "python",
): Promise<{ path: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${apiBase(backend)}/jobs/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Failed to upload file.");
  return res.json();
}

export async function submitJob(
  type: JobType,
  payload: Record<string, unknown>,
  max_retries = 3,
  backend: Backend = "python",
): Promise<Job> {
  const res = await fetch(`${apiBase(backend)}${jobsPath(backend)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      payload,
      max_retries,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || detail?.detail || "Failed to submit job.");
  }
  return res.json();
}

export async function deleteJob(
  id: string,
  backend: Backend = "python",
): Promise<void> {
  await fetch(`${apiBase(backend)}/jobs/${id}`, { method: "DELETE" });
}

// Derive which backend to talk to for a given job
export function backendForJob(job: Job, hint: Backend = "python"): Backend {
  if (job.worker_stack === "bullmq") return "node";
  if (job.worker_stack === "celery") return "python";
  return hint;
}
