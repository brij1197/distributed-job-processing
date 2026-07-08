import { Request, Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { query } from "../db";
import { dispatch, JobType } from "../queue";

const router = Router();

// POST /jobs - submit a new job
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const {
    type,
    payload = {},
    max_retries = 3,
  } = req.body as {
    type: JobType;
    payload?: Record<string, unknown>;
    max_retries: number;
  };
  if (!type) {
    res.status(400).json({ error: "type is required" });
    return;
  }
  // Node backend is scrape-only; reject other types explicitly rather than
  // inserting a row no handler can process
  if (type !== "scrape") {
    res.status(400).json({
      error: `Unsupported job type '${type}' on the Node backend. Only 'scrape' is supported here; use the Python backend for resize/convert.`,
    });
    return;
  }

  const id = uuidv4();
  await query(
    `INSERT INTO jobs (id, type, payload, max_retries, status) VALUES ($1, $2, $3, $4, 'pending')`,
    [id, type, JSON.stringify(payload), max_retries],
  );

  // Enqueue the job. If the broker is unreachable, don't leave the row
  // stranded as "pending" - mark it failed so its state is honest.
  try {
    await dispatch(id, type, payload, max_retries);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(`UPDATE jobs SET status = 'failed', error = $2 WHERE id = $1`, [
      id,
      `dispatch_failed: ${message}`,
    ]);
    res
      .status(503)
      .json({ error: "Job accepted but could not be queued; marked failed." });
    return;
  }

  const [job] = await query(`SELECT * FROM jobs WHERE id = $1`, [id]);
  res.status(201).json(job);
});

// GET /jobs - list jobs
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const {
    status,
    limit = "20",
    offset = "0",
  } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (status) {
    conditions.push(`status=$${values.length + 1}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  const jobs = await query(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limitNum, offsetNum],
  );

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM jobs ${where}`,
    values,
  );

  res.json({ jobs, total: parseInt(count) });
});

// GET /jobs/:id - get job
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [job] = await query(`SELECT * FROM jobs WHERE id = $1`, [
    req.params.id,
  ]);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// DELETE /jobs/:id - remove job
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const [job] = await query(`SELECT * FROM jobs WHERE id = $1`, [
    req.params.id,
  ]);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  await query(`DELETE FROM jobs WHERE id = $1`, [req.params.id]);
  res.status(204).send();
});

export default router;
