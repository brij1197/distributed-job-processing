const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API!;

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
  created_at: string;
  updated_at: string;
  start_at: string | null;
  finished_at: string | null;
}

export interface JobListReponse {
  jobs: Job[];
  total: number;
}

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
  const res = await fetch(`${PYTHON_API}/jobs?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch jobs.");
  return res.json();
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`${PYTHON_API}/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch jobs.");
  return res.json();
}

export async function uploadFile(file: File): Promise<{ path: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${PYTHON_API}/jobs/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Failed to upload file.");
  return res.json();
}

export async function submitJob(
  type: JobType,
  payload: Record<string, unknown>,
  max_retries = 3,
): Promise<Job> {
  const res = await fetch(`${PYTHON_API}/jobs`, {
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
  if (!res.ok) throw new Error("Failed to submit jobs.");
  return res.json();
}

export async function deleteJob(id: string): Promise<void> {
  await fetch(`${PYTHON_API}/jobs/${id}`, { method: "DELETE" });
}