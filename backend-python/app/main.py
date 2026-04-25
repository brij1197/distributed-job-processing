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
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])

os.makedirs("/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/uploads"), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
