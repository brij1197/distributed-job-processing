import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://jobuser:jobpassword@localhost:5432/jobsdb",
});

export async function query<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

export default pool;
