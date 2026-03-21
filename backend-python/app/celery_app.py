from celery import Celery
from app.config import settings

celery_app = Celery(
    "distributed_jobs",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # If the worker crashes mid-task, Redis re-queues it automatically
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Results in Redis expire after 1 hour
    result_expires=3600,
    # All tasks go to the "jobs" queue
    task_default_queue="jobs",
    task_routes={"app.tasks.*": {"queue": "jobs"}},
)
