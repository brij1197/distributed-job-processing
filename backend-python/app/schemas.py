import uuid
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict

# Job Type and status literals
JobType = Literal["scrape", "resize", "convert", "script"]
JobStatus = Literal["pending", "running", "success", "failed", "retrying"]


# POST /jobs
class JobCreate(BaseModel):
    type: JobType
    payload: dict[str, Any] = {}
    max_retries: int = 3


# GET /jobs/{id}, GET /jobs
class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    status: str
    payload: dict[str, Any]
    result: dict[str, Any] | None = None
    error: str | None = None
    retries: int
    max_retries: int
    created_at: datetime
    updated_at: datetime
    start_at: datetime | None = None
    finished_at: datetime | None = None


# GET /jobs  (paginated list)
class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
