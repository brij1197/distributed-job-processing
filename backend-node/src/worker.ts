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
