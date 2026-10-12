"""
routers/video_processing.py
-----------------------------
Offline testing mode from the spec: upload MP4/AVI/MOV/MKV -> real frame
extraction (OpenCV) -> real YOLO detection+tracking -> real face detection
+recognition -> results written to video_frames/detected_objects ->
timeline auto-built from what was actually seen.

Processing runs in a background thread so the upload responds immediately;
poll GET /api/videos/{id} for status (UPLOADED -> PROCESSING -> DONE/FAILED).
"""

import os
import subprocess
import threading
import uuid

import cv2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db, SessionLocal
from media_storage import UPLOADS_DIR, CLIPS_DIR
from analysis_pipeline import analyze_frame, persist_video_frame

router = APIRouter(prefix="/api/videos", tags=["Video Processing"])

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}
# Sample 1 frame per second rather than every frame - keeps CPU-only
# processing fast while still catching every distinct event in the timeline.
SAMPLE_EVERY_N_SECONDS = 1.0


@router.post("", response_model=schemas.VideoRead)
async def upload_video(file: UploadFile = File(...),
                       camera_id: str | None = None,
                       enable_attendance: bool = True,
                       shift_start_time: str = "09:00",
                       shift_end_time: str = "17:00",
                       db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    saved_name = f"{uuid.uuid4().hex[:10]}{ext}"
    saved_path = os.path.join(UPLOADS_DIR, saved_name)
    contents = await file.read()
    with open(saved_path, "wb") as f:
        f.write(contents)

    if not camera_id:
        camera_id = crud.get_or_create_virtual_upload_camera(db).id

    video = crud.create_video(db, filename=file.filename, file_path=saved_path, camera_id=camera_id)
    video.enable_attendance = enable_attendance
    video.shift_start_time = shift_start_time
    video.shift_end_time = shift_end_time
    db.commit()
    db.refresh(video)

    thread = threading.Thread(target=_process_video_job, args=(video.id,), daemon=True)
    thread.start()

    return video


def _process_video_job(video_id: str):
    """
    Runs in a background thread with its OWN DB session (SQLAlchemy sessions
    aren't thread-safe to share across requests/threads).
    """
    db = SessionLocal()
    try:
        video = crud.get_video(db, video_id)
        if not video:
            return

        cap = cv2.VideoCapture(video.file_path)
        if not cap.isOpened():
            crud.update_video_status(db, video_id, status="FAILED")
            return

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = total_frames / fps if fps > 0 else 0.0
        crud.update_video_status(db, video_id, status="PROCESSING", duration_seconds=duration,
                                  total_frames=total_frames, fps=fps)

        frame_step = max(int(fps * SAMPLE_EVERY_N_SECONDS), 1)
        total_sampled = max(int(total_frames / frame_step), 1)
        frame_index = 0
        processed_count = 0
        video_start_time = video.uploaded_at
        recognized_emp_ids = set()

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_index % frame_step == 0:
                timestamp_seconds = frame_index / fps if fps > 0 else 0.0
                try:
                    analysis = analyze_frame(frame)
                    for f in analysis.get("faces", []):
                        if f.get("match"):
                            recognized_emp_ids.add(f["match"]["employee_id"])

                    persist_video_frame(db, video_id=video_id, frame_index=frame_index,
                                         timestamp_seconds=timestamp_seconds, analysis=analysis,
                                         frame_bgr=frame, video_start_time=video_start_time,
                                         camera_id=video.camera_id,
                                         enable_attendance=video.enable_attendance,
                                         shift_start_time=video.shift_start_time or "09:00",
                                         shift_end_time=video.shift_end_time or "17:00")
                except Exception as frame_err:
                    print(f"Warning: frame {frame_index} error on {video_id}: {frame_err}")
                
                processed_count += 1
                progress_pct = min(int((processed_count / total_sampled) * 100), 99)
                crud.update_video_progress(db, video_id, processed_frames=processed_count, progress_percent=progress_pct)

            frame_index += 1

        cap.release()
        crud.update_video_status(db, video_id, status="DONE", processed_frames=processed_count, progress_percent=100)

        if video.enable_attendance:
            date_str = video_start_time.strftime("%Y-%m-%d")
            crud.mark_absent_employees(db, date_str=date_str, present_employee_ids=recognized_emp_ids)
    except Exception as e:
        print(f"Video processing failed for {video_id}: {e}")
        crud.update_video_status(db, video_id, status="FAILED")
    finally:
        db.close()


@router.get("", response_model=list[schemas.VideoRead])
def list_videos(db: Session = Depends(get_db)):
    return crud.list_videos(db)


@router.get("/{video_id}", response_model=schemas.VideoRead)
def get_video(video_id: str, db: Session = Depends(get_db)):
    obj = crud.get_video(db, video_id)
    if not obj:
        raise HTTPException(404, "Video not found")
    return obj


@router.get("/{video_id}/download")
def download_full_video(video_id: str, db: Session = Depends(get_db)):
    """
    Returns the complete uploaded/recorded source video file as a downloadable file attachment.
    """
    video = crud.get_video(db, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not os.path.exists(video.file_path):
        raise HTTPException(404, "Video file not found on disk")

    raw_name = video.filename or os.path.basename(video.file_path)
    ext = os.path.splitext(raw_name)[1].lower()
    media_types = {
        ".mp4": "video/mp4",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
    }
    media_type = media_types.get(ext, "video/mp4")

    return FileResponse(
        path=video.file_path,
        media_type=media_type,
        filename=raw_name,
        headers={"Content-Disposition": f'attachment; filename="{raw_name}"'},
    )


@router.delete("/{video_id}")
def delete_video(video_id: str, db: Session = Depends(get_db)):
    """Real delete: removes the DB row (and its frames/detections via cascade) AND the file on disk."""
    if not crud.delete_video(db, video_id):
        raise HTTPException(404, "Video not found")
    return {"status": "DELETED", "id": video_id}


@router.delete("")
def bulk_delete_videos(
    before_date: str | None = None,
    after_date: str | None = None,
    all: bool = False,
    db: Session = Depends(get_db),
):
    """
    Bulk delete for retention/cleanup - same safety rule as snapshots: requires
    before_date/after_date or all=true, otherwise deletes nothing.
    Dates are ISO format, e.g. before_date=2026-01-01.
    """
    if not all and not (before_date or after_date):
        raise HTTPException(400, "Provide before_date, after_date, or set all=true")
    count = crud.delete_videos_bulk(db, before_date=before_date, after_date=after_date, all_=all)
    return {"status": "DELETED", "count": count}


@router.get("/{video_id}/timeline", response_model=list[schemas.VideoFrameRead])
def get_timeline(video_id: str, db: Session = Depends(get_db)):
    """
    The spec's 'Video Timeline' feature: every real event found during
    processing, in order, with its timestamp - click one on the frontend
    to jump to that point in the video.
    """
    if not crud.get_video(db, video_id):
        raise HTTPException(404, "Video not found")
    return crud.list_video_timeline(db, video_id)


@router.post("/{video_id}/export-clip")
def export_video_clip(
    video_id: str,
    start_seconds: float = Query(..., description="Start timestamp in seconds"),
    end_seconds: float = Query(..., description="End timestamp in seconds"),
    db: Session = Depends(get_db),
):
    """
    Exports a short subclip around a specific event timestamp from an uploaded video
    using ffmpeg (-ss / -t flags with fast stream copy and ultrafast transcode fallback).
    Returns the real MP4 clip as a downloadable file attachment.
    """
    video = crud.get_video(db, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not os.path.exists(video.file_path):
        raise HTTPException(404, "Source video file not found on disk")

    start_sec = max(0.0, float(start_seconds))
    end_sec = float(end_seconds)

    if end_sec <= start_sec:
        end_sec = start_sec + 5.0

    if video.duration_seconds > 0 and end_sec > video.duration_seconds:
        end_sec = video.duration_seconds
        if start_sec >= end_sec:
            start_sec = max(0.0, end_sec - 5.0)

    duration = max(0.5, end_sec - start_sec)

    # Sanitize base filename
    raw_name = os.path.splitext(os.path.basename(video.filename or video.file_path))[0]
    safe_base = "".join(c for c in raw_name if c.isalnum() or c in ("-", "_")).strip() or "video"
    clip_filename = f"{safe_base}_{start_sec:.1f}s_{end_sec:.1f}s_{uuid.uuid4().hex[:6]}.mp4"
    output_clip_path = os.path.join(CLIPS_DIR, clip_filename)

    # 1. Try fast stream copy (-c copy)
    cmd_copy = [
        "ffmpeg", "-y",
        "-ss", f"{start_sec:.3f}",
        "-i", video.file_path,
        "-t", f"{duration:.3f}",
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        output_clip_path,
    ]

    success = False
    try:
        proc = subprocess.run(cmd_copy, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        if proc.returncode == 0 and os.path.exists(output_clip_path) and os.path.getsize(output_clip_path) > 1024:
            success = True
    except Exception as e:
        print(f"Stream copy attempt note: {e}")

    # 2. Fallback to ultrafast H.264 encode if stream copy failed or produced an unplayable/empty file
    if not success:
        cmd_transcode = [
            "ffmpeg", "-y",
            "-ss", f"{start_sec:.3f}",
            "-i", video.file_path,
            "-t", f"{duration:.3f}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "aac",
            "-movflags", "+faststart",
            output_clip_path,
        ]
        proc = subprocess.run(cmd_transcode, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if proc.returncode != 0 or not os.path.exists(output_clip_path) or os.path.getsize(output_clip_path) == 0:
            err_msg = proc.stderr.decode("utf-8", errors="ignore")
            raise HTTPException(500, f"ffmpeg failed to export clip: {err_msg[:200]}")

    download_name = f"{safe_base}_{start_sec:.1f}s-{end_sec:.1f}s.mp4"
    return FileResponse(
        path=output_clip_path,
        media_type="video/mp4",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )
