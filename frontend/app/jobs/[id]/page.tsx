"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getJob, deleteJob, type Job, type JobStatus } from "@/lib/api";

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  running: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  retrying: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  success: "bg-green-500/20 text-green-300 border-green-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
};

const TERMINAL_STATUSES: JobStatus[] = ["success", "failed"];

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const data = await getJob(id);
        setJob(data);
        if (TERMINAL_STATUSES.includes(data.status)) {
          clearInterval(interval);
        }
      } catch {
        setError("Could not load job");
        clearInterval(interval);
      }
    }
    poll();
    interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [id]);

  async function handleDelete() {
    await deleteJob(id);
    router.push("/");
  }

  if (error) return <p className="text-red-400">{error}</p>;
  if (!job) return <p className="text-gray-500">Loading...</p>;

  const duration =
    job.start_at && job.finished_at
      ? (
          (new Date(job.finished_at).getTime() -
            new Date(job.start_at).getTime()) /
          1000
        ).toFixed(2) + "s"
      : job.start_at
        ? "Running..."
        : "-";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-gray-500 hover:text-white text-sm"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold capitalize">{job.type}</h2>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${STATUS_COLORS[job.status]}`}
          >
            {job.status}
          </span>
        </div>
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-300 text-sm"
        >
          Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          ["Job ID", job.id],
          ["Retries", `${job.retries} / ${job.max_retries}`],
          ["Created", new Date(job.created_at).toLocaleString()],
          ["Duration", duration],
        ].map(([label, value]) => (
          <div
            key={label}
            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
          >
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-sm font-mono break-all">{value}</p>
          </div>
        ))}
      </div>
      <Section title="Payload">
        <pre className="text-xs text-gray-300 overflow-auto">
          {JSON.stringify(job.payload, null, 2)}
        </pre>
      </Section>

      {job.result && (
        <Section title="Result">
          <pre className="text-xs text-green-300 overflow-auto">
            {JSON.stringify(job.result, null, 2)}
          </pre>
          {(() => {
            const outPath = (job.result.output_path ?? job.result.output) as
              | string
              | undefined;
            return outPath ? (
              <a
                href={`${process.env.NEXT_PUBLIC_PYTHON_API}/uploads/${outPath.split("/").pop()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Download output file
              </a>
            ) : null;
          })()}
        </Section>
      )}

      {job.error && (
        <Section title="Error">
          <pre className="text-xs text-red-300 overflow-auto whitespace-pre-wrap">
            {job.error}
          </pre>
        </Section>
      )}

      {!TERMINAL_STATUSES.includes(job.status) && (
        <p className="text-xs text-gray-500 mt-4 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Auto-refreshing every 2 seconds...
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mb-4">
      <p className="text-xs text-gray-500 uppercase mb-2 font-medium tracking-wider">
        {title}
      </p>
      {children}
    </div>
  );
}
