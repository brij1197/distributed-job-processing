"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { listJobs, deleteJob, type Job, type JobStatus } from "@/lib/api";

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "bg-yellow-500/20 text-yellow-300",
  running: "bg-blue-500/20 text-blue-300",
  success: "bg-green-500/20 text-green-300",
  failed: "bg-red-500/20 text-red-300",
  retrying: "bg-orange-500/20 text-orange-300",
};

const FILTERS: (JobStatus | "all")[] = [
  "all",
  "pending",
  "running",
  "retrying",
  "success",
  "failed",
];

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await listJobs(filter === "all" ? undefined : filter);
      setJobs(data.jobs);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleDelete(id: string) {
    await deleteJob(id);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          Jobs
          <span className="text-gray-500 text-base font-normal ml-1">
            ({total})
          </span>
        </h2>
        <Link
          href="/submit"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + Submit Job
        </Link>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${filter === f ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
          >
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-grey-500">Loading...</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-500">No jobs found.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[job.status]}`}
                >
                  {job.status}
                </span>
                <span className="text-sm font-medium capitalize">
                  {job.type}
                </span>
                <span className="tex-cs text-gray-500 truncate hidden sm-block">
                  {job.id}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 ml-4">
                <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                <Link
                  href={`/jobs/${job.id}`}
                  className="text-blue-400 hover:text-blue-300"
                >
                  View
                </Link>
                <button
                  onClick={() => handleDelete(job.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
