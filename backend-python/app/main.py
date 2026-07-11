from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
from app.routers import jobs
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Distributed Job Queue",
    description="A simple distributed job queue system using FastAPI, Celery, and PostgreSQL.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://reimagined-parakeet-vgvw566vq5xhp4xw-3000.app.github.dev"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])

os.makedirs("/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/uploads"), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
