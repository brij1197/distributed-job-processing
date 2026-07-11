import uuid
import os
import shutil
from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Job
from app.schemas import JobCreate, JobResponse, JobListResponse
from app.tasks import dispatch

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()


# POST /upload
@router.post("/upload")
def upload_file(file: UploadFile = File(...)):
    dest = os.path.join(UPLOAD_DIR, file.filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return JSONResponse({"path": dest})


# POST /jobs
@router.post("/", response_model=JobResponse, status_code=201)
def submit_job(body: JobCreate, db: Session = Depends(get_db)):
    job = Job(
        type=body.type,
        payload=body.payload,
        max_retries=body.max_retries,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Enqueue the job. If the broker is unreachable, don't leave the row
    # stranded as "pending" - mark it failed so its state is honest.
    try:
        dispatch(str(job.id), job.type, job.payload)
    except Exception as exc:
        job.status = "failed"
        job.error = f"dispatch_failed: {exc}"
        db.commit()
        db.refresh(job)
        raise HTTPException(
            status_code=503,
            detail="Job accepted but could not be queued; marked failed.",
        )

    return job


# GET /jobs
@router.get("/", response_model=JobListResponse)
def list_jobs(
    status: str | None = Query(None, description="Filter by job status"),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    query = db.query(Job)
    if status:
        query = query.filter(Job.status == status)

    total = query.count()
    jobs = query.order_by(Job.created_at.desc()).offset(offset).limit(limit).all()

    return {"jobs": jobs, "total": total}


# GET /jobs/{id}
@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# DELETE /jobs/{id}
@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
