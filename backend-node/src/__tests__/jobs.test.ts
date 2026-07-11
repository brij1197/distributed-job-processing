import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const query = vi.fn();
const dispatch = vi.fn();

vi.mock("../db", () => ({
  query: (...args: unknown[]) => query(...args),
  default: {},
}));

vi.mock("../queue", () => ({
  dispatch: (...args: unknown[]) => dispatch(...args),
}));

import { createApp } from "../app";

const app = createApp();

beforeEach(() => {
  query.mockReset();
  dispatch.mockReset();

  query.mockResolvedValue([]);
  dispatch.mockResolvedValue(undefined);
});

describe("Node jobs API", () => {
  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("POST /jobs creates a scrape job", async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "x", type: "scrape", status: "pending" }]);

    const res = await request(app)
      .post("/jobs")
      .send({ type: "scrape", payload: { url: "https://example.com" } });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("scrape");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("POST /jobs rejects non-scrape types with 400", async () => {
    const res = await request(app)
      .post("/jobs")
      .send({ type: "resize", payload: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported job type");

    expect(query).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("POST /jobs requires a type", async () => {
    const res = await request(app).post("/jobs").send({ payload: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("type is required");
  });

  it("POST /jobs marks the job failed and returns 503 when dispatch throws", async () => {
    dispatch.mockRejectedValueOnce(new Error("redis down"));

    const res = await request(app)
      .post("/jobs")
      .send({ type: "scrape", payload: { url: "https://example.com" } });

    expect(res.status).toBe(503);
    const sqlCalls = query.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => s.includes("status = 'failed'"))).toBe(true);
  });

  it("GET /jobs/:id returns 404 for unknown job", async () => {
    query.mockResolvedValueOnce([]);
    const res = await request(app).get("/jobs/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("DELETE /jobs/:id returns 404 for unknown job", async () => {
    query.mockResolvedValueOnce([]);
    const res = await request(app).delete("/jobs/does-not-exist");
    expect(res.status).toBe(404);
  });
});
