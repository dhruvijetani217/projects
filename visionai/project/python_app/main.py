"""
main.py
-------
VisionAI FastAPI application entrypoint - Phase 2.

Phase 0: real database + CRUD routers.
Phase 1: real face detection/embedding (InsightFace) + FAISS matching.
Phase 2 adds:
  - Real YOLO object detection + ByteTrack tracking (yolo26_detector.py).
  - analysis_pipeline.py: the shared real inference+persistence logic used
    by BOTH the video-upload flow and the live-camera/webcam flow.
  - routers/video_processing.py: upload MP4/AVI/MOV/MKV, background-thread
    processing, real per-frame detections, real auto-built timeline.
  - routers/live_camera.py: RTSP/ONVIF/USB/IP camera streaming (background
    thread + WebSocket push) and a webcam/single-frame endpoint - both call
    the same real pipeline and fire real snapshots/alerts/attendance.

Still stubbed, on purpose, for a later phase:
  - JWT/RBAC auth enforcement (UserDB table exists, no middleware yet).
  - AI Video Search (natural language search over stored detections).
  - Helmet/fire/smoke/license-plate detection (needs a specialized model
    beyond the base COCO-trained YOLO used here).
"""

import os
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

import engine_state
from database import init_db, SessionLocal
from media_storage import STORAGE_DIR
from routers import (
    organization, cameras, employees, visitors, attendance, leaves,
    snapshots_alerts, dashboard, face_recognition, video_processing, live_camera, search, settings,
    attendance_policy,
)

app = FastAPI(
    title="VisionAI Video Intelligence Platform - API",
    description="Real REST API backing the VisionAI enterprise dashboard. Phase 1: Real Face Recognition.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serves real saved face crops / snapshots so the frontend can load image_url directly.
app.mount("/media", StaticFiles(directory=STORAGE_DIR), name="media")


@app.on_event("startup")
def startup_event():
    init_db()
    print("Loading AI engines (this can take a few seconds on first run)...")
    engine_state.init_face_engine()
    engine_state.init_yolo_detector()
    db = SessionLocal()
    try:
        count = engine_state.rebuild_face_index(db)
        print(f"Face index built from DB: {count} enrolled face vector(s).")
    finally:
        db.close()
    print("VisionAI FastAPI backend started - Phase 1 (real DB + CRUD + real face recognition).")


@app.exception_handler(IntegrityError)
def integrity_error_handler(request: Request, exc: IntegrityError):
    """
    Turns duplicate-key / FK-violation errors from the DB into a clean 400
    instead of leaking a raw 500 + stack trace to the client.
    """
    return JSONResponse(
        status_code=400,
        content={"detail": "Conflict: a record with this unique value (code/email/etc.) already exists."},
    )


@app.get("/")
def root():
    return {
        "status": "ONLINE",
        "service": "VisionAI Python Backend",
        "phase": "Phase 2 - Real Object Detection + Live Camera/Video Pipeline",
        "timestamp": datetime.utcnow().isoformat(),
    }


app.include_router(organization.router)
app.include_router(cameras.router)
app.include_router(employees.router)
app.include_router(visitors.router)
app.include_router(attendance.router)
app.include_router(leaves.router)
app.include_router(snapshots_alerts.router)
app.include_router(dashboard.router)
app.include_router(face_recognition.router)
app.include_router(video_processing.router)
app.include_router(live_camera.router)
app.include_router(search.router)
app.include_router(settings.router)
app.include_router(attendance_policy.router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8020))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
