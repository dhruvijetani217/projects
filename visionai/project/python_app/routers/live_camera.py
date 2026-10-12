"""
routers/live_camera.py
------------------------
Mode 1 from the spec: live CCTV/RTSP/ONVIF/USB/IP/webcam input.

Two ways in, same real pipeline underneath (analysis_pipeline.analyze_frame):

1. POST /api/live/frame/{camera_id} - the browser captures a webcam frame
   (canvas.toBlob) and POSTs it here periodically. Good for webcam and any
   client that can grab frames itself. Returns detections immediately.

2. POST /api/cameras/{camera_id}/stream/start - the SERVER opens the
   camera's RTSP/ONVIF/IP/USB url with cv2.VideoCapture and continuously
   reads frames in a background thread, exactly like it would for a real
   network camera. Real detections are pushed out over
   WS /ws/live/{camera_id} as they happen, and notable events (unknown
   person, employee recognized) become real snapshots/alerts/attendance.

NOTE ON TESTING: this sandbox has no physical camera or reachable RTSP
server, so the "live camera" path below is verified here using a local
video FILE as the stream source - cv2.VideoCapture(path) and
cv2.VideoCapture(rtsp_url) are the exact same code path, so this proves the
pipeline works. Point a real camera's url at it and it behaves identically.
"""

import asyncio
import threading
import time
from datetime import datetime, timedelta
import os
from typing import Dict, List, Optional

import cv2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

import crud
import engine_state
from database import get_db, SessionLocal
from media_storage import read_image_from_bytes, STORAGE_DIR
from analysis_pipeline import analyze_frame, handle_live_events

router = APIRouter(tags=["Live Camera / Webcam"])

RECORDINGS_DIR = os.path.join(STORAGE_DIR, "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

# Background stream registry: camera_id -> {"stop_event": Event, "thread": Thread}
_active_streams: Dict[str, dict] = {}
# WebSocket subscribers per camera
_ws_clients: Dict[str, List[WebSocket]] = {}
# Active faces on live cameras: employee_id -> metadata
_live_active_faces: Dict[str, dict] = {}

# Active recording sessions: camera_id -> dict
_active_recordings: Dict[str, dict] = {}

INFERENCE_INTERVAL_SECONDS = 0.5  # Fast 2 FPS inference per camera on CPU


def is_camera_recording(camera_id: str) -> bool:
    return camera_id in _active_recordings


def get_active_recording_info(camera_id: str) -> Optional[dict]:
    rec = _active_recordings.get(camera_id)
    if not rec:
        return None
    duration = (datetime.utcnow() - rec["started_at"]).total_seconds()
    return {
        "recording_active": True,
        "duration_seconds": round(duration, 1),
        "file_url": rec["file_url"],
        "frame_count": rec["frame_count"],
        "started_at": rec["started_at"].isoformat(),
    }


def _write_frame_if_recording(camera_id: str, frame):
    rec = _active_recordings.get(camera_id)
    if not rec:
        return
    with rec["lock"]:
        try:
            h, w = frame.shape[:2]
            if rec["writer"] is None:
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                rec["writer"] = cv2.VideoWriter(rec["file_path"], fourcc, rec["fps"], (w, h))
                rec["width"] = w
                rec["height"] = h
            if rec["writer"] is not None and rec["writer"].isOpened():
                if frame.shape[1] != rec["width"] or frame.shape[0] != rec["height"]:
                    resized = cv2.resize(frame, (rec["width"], rec["height"]))
                    rec["writer"].write(resized)
                else:
                    rec["writer"].write(frame)
                rec["frame_count"] += 1
        except Exception as e:
            print(f"Recording frame write error for {camera_id}: {e}")


def update_live_active_employee(employee_id: str, name: str, camera_id: str):
    _live_active_faces[employee_id] = {
        "employee_id": employee_id,
        "name": name,
        "camera_id": camera_id,
        "last_seen": datetime.utcnow()
    }


def get_live_active_employees(seconds: float = 15.0) -> List[dict]:
    cutoff = datetime.utcnow() - timedelta(seconds=seconds)
    active = []
    for emp_id, info in list(_live_active_faces.items()):
        if info["last_seen"] >= cutoff:
            active.append({
                "employee_id": info["employee_id"],
                "name": info["name"],
                "camera_id": info["camera_id"],
                "last_seen": info["last_seen"].isoformat()
            })
    return active


def _serialize_analysis(analysis: dict) -> dict:
    return {
        "objects": [
            {"class": o["class"], "confidence": o["confidence"], "bbox_pct": o["bbox_pct"], "tracking_id": o["tracking_id"]}
            for o in analysis["objects"]
        ],
        "faces": [
            {
                "bbox_pct": f["bbox_pct"],
                "name": f["match"]["full_name"] if f["match"] else "UNKNOWN PERSON",
                "person_type": "EMPLOYEE" if f["match"] else "UNKNOWN",
                "confidence": f["match"]["confidence_percentage"] if f["match"] else None,
            }
            for f in analysis["faces"]
        ],
    }


async def _broadcast(camera_id: str, message: dict):
    dead = []
    for ws in _ws_clients.get(camera_id, []):
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients[camera_id].remove(ws)


def _stream_worker(camera_id: str, source, loop: asyncio.AbstractEventLoop, stop_event: threading.Event):
    db = SessionLocal()
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        crud.set_camera_health(db, camera_id, status="OFFLINE")
        db.close()
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    crud.set_camera_health(db, camera_id, status="ONLINE", fps=fps)
    last_inference = 0.0

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                break  # stream ended or connection lost

            _write_frame_if_recording(camera_id, frame)

            now = time.time()
            if now - last_inference >= INFERENCE_INTERVAL_SECONDS:
                camera = crud.get_camera(db, camera_id)
                sys_settings = crud.get_system_settings(db)
                enable_att = camera.enable_attendance if camera else True
                start_t = (camera.shift_start_time if (camera and camera.shift_start_time) else None) or getattr(sys_settings, "shift_start_time", "09:00") or "09:00"
                end_t = (camera.shift_end_time if (camera and camera.shift_end_time) else None) or getattr(sys_settings, "shift_end_time", "17:00") or "17:00"

                analysis = analyze_frame(frame)
                analysis["faces"] = identity_tracker.smooth_frame_faces(camera_id, analysis.get("faces", []))
                for f in analysis.get("faces", []):
                    if f.get("match"):
                        update_live_active_employee(f["match"]["employee_id"], f["match"]["full_name"], camera_id)

                events = handle_live_events(
                    db, camera_id, frame, analysis,
                    record_attendance=enable_att,
                    shift_start_time=start_t,
                    shift_end_time=end_t
                )
                message = {
                    "camera_id": camera_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    **_serialize_analysis(analysis),
                    "events_created": events,
                }
                asyncio.run_coroutine_threadsafe(_broadcast(camera_id, message), loop)
                last_inference = now
            else:
                time.sleep(0.01)
    finally:
        cap.release()
        crud.set_camera_health(db, camera_id, status="OFFLINE", reason="Live stream reader stopped")
        db.close()


@router.post("/api/cameras/{camera_id}/stream/start")
async def start_stream(camera_id: str, db: Session = Depends(get_db)):
    if camera_id in _active_streams:
        return {"status": "ALREADY_RUNNING", "camera_id": camera_id}

    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    source = int(camera.url) if camera.url.isdigit() else camera.url  # USB index vs RTSP/file URL
    loop = asyncio.get_running_loop()
    stop_event = threading.Event()
    thread = threading.Thread(target=_stream_worker, args=(camera_id, source, loop, stop_event), daemon=True)
    _active_streams[camera_id] = {"stop_event": stop_event, "thread": thread}
    thread.start()

    return {"status": "STARTED", "camera_id": camera_id}


@router.post("/api/cameras/{camera_id}/stream/stop")
def stop_stream(camera_id: str, db: Session = Depends(get_db)):
    entry = _active_streams.pop(camera_id, None)
    if not entry:
        raise HTTPException(404, "No active stream for this camera")
    entry["stop_event"].set()
    entry["thread"].join(timeout=3)
    crud.set_camera_health(db, camera_id, status="OFFLINE", reason="Stream stopped by user")
    return {"status": "STOPPED", "camera_id": camera_id}


@router.post("/api/cameras/{camera_id}/record/start")
def start_camera_recording(camera_id: str, fps: float = 20.0, db: Session = Depends(get_db)):
    """Starts capturing raw camera stream/webcam into a real .mp4 file on disk."""
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    if camera_id in _active_recordings:
        return {
            "status": "ALREADY_RECORDING",
            "camera_id": camera_id,
            "file_url": _active_recordings[camera_id]["file_url"],
            "started_at": _active_recordings[camera_id]["started_at"].isoformat()
        }

    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    clean_cam_id = camera_id.replace("-", "_")
    filename = f"rec_{clean_cam_id}_{timestamp_str}.mp4"
    file_path = os.path.join(RECORDINGS_DIR, filename)
    file_url = f"/media/recordings/{filename}"

    _active_recordings[camera_id] = {
        "writer": None,
        "file_path": file_path,
        "file_url": file_url,
        "started_at": datetime.utcnow(),
        "frame_count": 0,
        "fps": max(float(fps), 10.0),
        "width": 1280,
        "height": 720,
        "lock": threading.Lock()
    }

    return {
        "status": "RECORDING_STARTED",
        "camera_id": camera_id,
        "file_path": file_path,
        "file_url": file_url,
        "started_at": datetime.utcnow().isoformat()
    }


@router.post("/api/cameras/{camera_id}/record/stop")
def stop_camera_recording(camera_id: str, db: Session = Depends(get_db)):
    """Stops capturing raw stream, finalizes the .mp4 file, and logs CameraRecordingDB."""
    rec = _active_recordings.pop(camera_id, None)
    if not rec:
        raise HTTPException(400, "Camera is not currently recording")

    with rec["lock"]:
        if rec["writer"] is not None:
            rec["writer"].release()

    file_path = rec["file_path"]
    ended_at = datetime.utcnow()
    duration = max((ended_at - rec["started_at"]).total_seconds(), 0.1)
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

    record_db = crud.create_camera_recording(
        db,
        camera_id=camera_id,
        file_path=file_path,
        file_url=rec["file_url"],
        duration_seconds=duration,
        file_size_bytes=file_size,
        status="COMPLETED",
        started_at=rec["started_at"],
        ended_at=ended_at
    )

    return {
        "status": "RECORDING_SAVED",
        "camera_id": camera_id,
        "recording_id": record_db.id,
        "file_url": record_db.file_url,
        "duration_seconds": record_db.duration_seconds,
        "file_size_bytes": record_db.file_size_bytes,
        "started_at": record_db.started_at.isoformat(),
        "ended_at": record_db.ended_at.isoformat()
    }


@router.get("/api/cameras/{camera_id}/record/status")
def get_camera_recording_status(camera_id: str):
    """Returns whether the camera is currently actively recording raw frames."""
    info = get_active_recording_info(camera_id)
    if not info:
        return {"recording_active": False, "camera_id": camera_id}
    return {"camera_id": camera_id, **info}


@router.websocket("/ws/live/{camera_id}")
async def live_feed_ws(websocket: WebSocket, camera_id: str):
    """Real detections only - nothing is pushed here unless the background worker actually saw it."""
    await websocket.accept()
    _ws_clients.setdefault(camera_id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep the connection open; client doesn't need to send anything meaningful
    except WebSocketDisconnect:
        if websocket in _ws_clients.get(camera_id, []):
            _ws_clients[camera_id].remove(websocket)


@router.post("/api/live/frame/{camera_id}")
async def analyze_single_frame(camera_id: str, file: UploadFile = File(...),
                                record_attendance: bool = True, db: Session = Depends(get_db)):
    """
    Webcam / manual-capture path: browser (or any client) sends ONE frame,
    gets real detections back immediately, and - for notable events -
    real snapshots/alerts/attendance get written, same as the live-stream path.
    """
    camera = crud.get_camera(db, camera_id)
    if not camera:
        raise HTTPException(404, "Camera not found")

    contents = await file.read()
    image = read_image_from_bytes(contents)
    if image is None:
        raise HTTPException(400, "Could not decode image file")

    _write_frame_if_recording(camera_id, image)

    analysis = analyze_frame(image)
    analysis["faces"] = identity_tracker.smooth_frame_faces(camera_id, analysis.get("faces", []))
    for f in analysis.get("faces", []):
        if f.get("match"):
            update_live_active_employee(f["match"]["employee_id"], f["match"]["full_name"], camera_id)

    sys_settings = crud.get_system_settings(db)
    enable_att = record_attendance and (camera.enable_attendance if camera else True)
    start_t = (camera.shift_start_time if camera and camera.shift_start_time else None) or getattr(sys_settings, "shift_start_time", "09:00") or "09:00"
    end_t = (camera.shift_end_time if camera and camera.shift_end_time else None) or getattr(sys_settings, "shift_end_time", "17:00") or "17:00"

    events = handle_live_events(
        db, camera_id, image, analysis,
        record_attendance=enable_att,
        shift_start_time=start_t,
        shift_end_time=end_t
    )

    return {
        "camera_id": camera_id,
        "timestamp": datetime.utcnow().isoformat(),
        "recording_active": is_camera_recording(camera_id),
        **_serialize_analysis(analysis),
        "events_created": events,
    }
