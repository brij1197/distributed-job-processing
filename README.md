# Distributed Job Processing

A distributed job queue with **two interchangeable backend stacks** - Python
(FastAPI + Celery) and Node (Express + BullMQ) - running side by side against a
shared PostgreSQL database and Redis broker, with a Next.js dashboard for
submitting and monitoring jobs.

The point of the project is the comparison: the same job-processing
architecture, implemented on two stacks, sharing one data model, so each job
records which stack actually executed it.

## Architecture

```mermaid
flowchart LR
    UI[Next.js dashboard] -->|submit / poll| PY[FastAPI api]
    UI -->|submit / poll| ND[Express api]
    PY -->|enqueue| R[(Redis)]
    ND -->|enqueue| R
    R --> CW[Celery worker]
    R --> BW[BullMQ worker]
    PY --> PG[(PostgreSQL)]
    ND --> PG
    CW --> PG
    BW --> PG
```

Both backends write to the same `jobs` table. A `worker_stack` column records
whether a job ran on `celery` or `bullmq`, so the dashboard can show - per job -
which stack processed it.

## Job types

| Type      | Python (Celery) | Node (BullMQ) |
| --------- | :-------------: | :-----------: |
| `scrape`  |        ✓        |       ✓       |
| `resize`  |        ✓        |       -       |
| `convert` |        ✓        |       -       |

The Node backend is intentionally scoped to `scrape` only - it exists to
demonstrate the same queue architecture on a second stack, not to duplicate the
full Python worker. Requests for unsupported types return a `400`.

## Quickstart

Requires Docker.

```bash
docker compose up --build
```

Then open the dashboard at **http://localhost:3000**.

Services and ports:

| Service        | Port | Purpose                        |
| -------------- | ---- | ------------------------------ |
| frontend       | 3000 | Next.js dashboard              |
| api-python     | 8000 | FastAPI job API                |
| api-node       | 3001 | Express job API                |
| flower         | 5555 | Celery monitoring UI           |
| postgres       | 5432 | shared job store               |
| redis          | 6379 | shared broker / queue          |

## API

Both backends expose the same shape. Python mounts at `/jobs/` (trailing
slash); Node at `/jobs`.

```bash
# Submit a scrape job (Python)
curl -X POST http://localhost:8000/jobs/ \
  -H "Content-Type: application/json" \
  -d '{"type": "scrape", "payload": {"url": "https://example.com"}}'

# Submit a scrape job (Node)
curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "scrape", "payload": {"url": "https://example.com"}}'

# Fetch a job by id
curl http://localhost:8000/jobs/<id>

# List jobs (optionally filter by status)
curl "http://localhost:8000/jobs/?status=success&limit=20"

# Delete a job
curl -X DELETE http://localhost:8000/jobs/<id>
```

A job moves through `pending → running → success | failed`, with `retries`
tracked against `max_retries`.

## Design notes

**Two backends, one data model.** Both stacks share the same Postgres `jobs`
table and Redis instance. This is what makes the comparison meaningful - the
`worker_stack` column is the single piece of telemetry that makes "which stack
ran this?" answerable.

**Delivery semantics.** The queues are configured for at-least-once delivery
(Celery uses `task_acks_late`), so a worker crash can cause a job to run twice.
The current handlers are not idempotent - making them so (e.g. an idempotency
key) is the correct next step for production use.

**Dispatch is not transactional across systems.** Submitting a job inserts a
Postgres row and then enqueues to Redis - two systems that can't be committed
atomically here. If the enqueue fails, the row is marked `failed` rather than
left stranded as `pending`, and the API returns `503`. A transactional outbox
(insert row + outbox event in one DB transaction, relayed to Redis by a
separate process) would close the gap fully.

**Configuration via environment.** API URLs and CORS origin default to
localhost and are overridable via environment variables - see
[.env.example](.env.example). This keeps the committed defaults working for
local Docker while allowing other environments (see below).

## Tests

Both backends have automated tests that run in CI on every push.

```bash
# Python - needs Postgres (docker compose up -d postgres)
cd backend-python
pip install -r requirements.txt -r requirements-dev.txt
TEST_DATABASE_URL="postgresql://jobuser:jobpassword@localhost:5432/jobsdb" pytest tests/ -v

# Node - no external services (db and queue are mocked)
cd backend-node
npm install
npm test
```

## Tech stack

- **Python backend:** FastAPI, Celery, SQLAlchemy, psycopg2
- **Node backend:** Express, BullMQ, node-postgres
- **Frontend:** Next.js, TypeScript, Tailwind
- **Infrastructure:** PostgreSQL, Redis, Docker Compose
- **CI:** GitHub Actions (pytest + Vitest)