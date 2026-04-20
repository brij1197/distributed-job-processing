"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitJob, type JobType } from "@/lib/api";

const EXAMPLE_PAYLOADS: Record<JobType, Record<string, unknown>> = {
  scrape: { url: "https://example.com" },
  resize: { path: "/uploads/image.jpg", width: 800, height: 600 },
  convert: { input_path: "/uploads/doc.docx", format: "pdf" },
  script: { command: ["echo", "hello world"], timeout: 30 },
};

export default function SubmitPage() {
  const router = useRouter();
  const [type, setType] = useState<JobType>("scrape");
  const [payload, setPayload] = useState(
    JSON.stringify(EXAMPLE_PAYLOADS["scrape"], null, 2),
  );
  const [maxRetries, setMaxRetries] = useState(3);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleTypeChange(newType: JobType) {
    setType(newType);
    setPayload(JSON.stringify(EXAMPLE_PAYLOADS[newType], null, 2));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Payload must be valid JSON");
      return;
    }
    setSubmitting(true);
    try {
      const job = await submitJob(type, parsed, maxRetries);
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission Failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold mb-6">Submit a Job</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Job Type</label>
          <div className="grid grid-cols-4 gap-2">
            {(["scrape", "resize", "convert", "script"] as JobType[]).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`py-2 rounded-lg text-sm capitalize font-medium transition-colors ${type === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"} `}
                >
                  {t}
                </button>
              ),
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Payload (JSON)
          </label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={8}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Max Retries: {maxRetries}
          </label>
          <input
            type="range"
            min={0}
            max={5}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 diabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Job"}
        </button>
      </form>
    </div>
  );
}
