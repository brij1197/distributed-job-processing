import httpx
import subprocess
import os
from datetime import datetime, timezone
from celery import Task
from celery.utils.log import get_task_logger
from PIL import Image
from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Job

logger = get_task_logger(__name__)


# Update Job Status in Postgres
def _set_status(job_id: str, status: str, **kwargs):
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            return
        job.status = status
        now = datetime.now(timezone.utc)
        if status == "running":
            job.start_at = now
        elif status in ["success", "failed"]:
            job.finished_at = now
        for key, value in kwargs.items():
            setattr(job, key, value)
        db.commit()
    finally:
        db.close()


# Handle Retry Logic in Postgres
class JobTask(Task):
    abstract = True

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        job_id = args[0]
        db = SessionLocal()
        try:
            job = db.get(Job, job_id)
            if job:
                job.status = "retrying"
                job.retries += 1
                job.error = str(exc)
                db.commit()
        finally:
            db.close()

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        job_id = args[0]
        _set_status(job_id, "failed", error=str(exc))


# Scrape a Webpage
@celery_app.task(base=JobTask, bind=True, max_retries=3, default_retry_delay=10)
def scrape_job(self, job_id: str, payload: dict):
    _set_status(job_id, "running")
    try:
        url = payload["url"]
        response = httpx.get(url, timeout=15, follow_redirects=True)
        response.raise_for_status()
        result = {
            "status_code": response.status_code,
            "content_length": len(response.content),
            "title": _extract_title(response.text),
        }
        _set_status(job_id, "success", result=result)
        return result
    except Exception as exc:
        logger.warning(f"Scrape_job {job_id} failed: {exc}, retrying...")
        raise self.retry(exc=exc)


def _extract_title(html: str) -> str:
    import re

    match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    return match.group(1).strip() if match else "No title found"


# Resize an Image
@celery_app.task(bind=True, base=JobTask, max_retries=3, default_retry_delay=10)
def resize_job(self, job_id: str, payload: dict):
    _set_status(job_id, "running")
    try:
        path = payload["path"]
        width = int(payload.get("width", 800))
        height = int(payload.get("height", 600))

        img = Image.open(path)
        original_size = img.size
        img = img.resize((width, height), Image.LANCZOS)

        out_path = path.rsplit(".", 1)
        out_path = f"{out_path[0]}_resized.{out_path[1]}"
        img.save(out_path)

        result = {
            "original_size": original_size,
            "new_size": (width, height),
            "output_path": out_path,
        }

        _set_status(job_id, "success", result=result)
        return result
    except Exception as exc:
        logger.warning(f"Resize_job {job_id} failed: {exc}, retrying...")
        raise self.retry(exc=exc)


# Convert a file
@celery_app.task(bind=True, base=JobTask, max_retries=3, default_retry_delay=10)
def convert_job(self, job_id: str, payload: dict):
    _set_status(job_id, "running")
    try:
        input_path = payload["input_path"]
        target_format = payload.get("format", "pdf")

        out_dir = os.path.dirname(os.path.abspath(input_path))
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        out_path = os.path.join(out_dir, f"{base_name}.{target_format}")

        subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                target_format,
                "--outdir",
                out_dir,
                input_path,
            ],
            check=True,
            timeout=120,
        )

        result = {"input": input_path, "output": out_path, "format": target_format}
        _set_status(job_id, "success", result=result)
        return result
    except Exception as exc:
        logger.warning(f"Convert_job {job_id} failed: {exc}, retrying...")
        raise self.retry(exc=exc)


# Run a custom script
@celery_app.task(bind=True, base=JobTask, max_retries=2, default_retry_delay=5)
def script_job(self, job_id: str, payload: dict):
    _set_status(job_id, "running")
    try:
        command = payload["command"]
        timeout = int(payload.get("timeout", 30))

        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        result = {
            "returncode": proc.returncode,
            "stdout": proc.stdout[-4000:],
            "stderr": proc.stderr[-1000:],
        }
        if proc.returncode != 0:
            raise Exception(f"Script exited with code {proc.returncode}")

        _set_status(job_id, "success", result=result)
        return result
    except subprocess.TimeoutExpired as exc:
        logger.warning(f"Script_job {job_id} timed out: {exc}, retrying...")
        raise self.retry(exc=exc)
    except Exception as exc:
        logger.warning(f"Script_job {job_id} failed: {exc}, retrying...")
        raise self.retry(exc=exc)


# Dispatch jobs to the correct task based on type
TASK_MAP = {
    "scrape": scrape_job,
    "resize": resize_job,
    "convert": convert_job,
    "script": script_job,
}


def dispatch(job_id: str, job_type: str, payload: dict):
    task = TASK_MAP.get(job_type)
    if not task:
        raise ValueError(f"Unknown job type: {job_type}")
    return task.delay(job_id, payload)
