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
import engine_state

router = APIRouter(prefix="/api/videos", tags=["Video Processing"])

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}
# Sample 1 frame per second rather than every frame - keeps CPU-only
# processing fast while still catching every distinct event in the timeline.
SAMPLE_EVERY_N_SECONDS = 1.0


@router.post("", response_model=schemas.VideoRead)
async def upload_video(file: UploadFile = File(...),
                       camera_id: str | None = None,
                       surveillance_profile: str = "OFFICE",
                       enable_attendance: bool = True,
                       enable_face_recognition: bool = True,
                       enable_object_detection: bool = True,
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

    sys_settings = crud.get_system_settings(db)
    eff_shift_start = shift_start_time or getattr(sys_settings, "shift_start_time", "09:00") or "09:00"
    eff_shift_end = shift_end_time or getattr(sys_settings, "shift_end_time", "17:00") or "17:00"

    video = crud.create_video(db, filename=file.filename, file_path=saved_path, camera_id=camera_id)
    video.surveillance_profile = surveillance_profile or "OFFICE"
    video.enable_attendance = enable_attendance
    video.enable_face_recognition = enable_face_recognition
    video.enable_object_detection = enable_object_detection
    video.shift_start_time = eff_shift_start
    video.shift_end_time = eff_shift_end
    db.commit()
    db.refresh(video)

    thread = threading.Thread(target=_process_video_job, args=(video.id,), daemon=True)
    thread.start()

    return video


def _process_video_job(video_id: str):
    """
    Runs ultra-fast in a background thread with adaptive keyframe sampling,
    fast sequential frame grab, and modular AI inference.
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

        # Ultra-fast adaptive keyframe sampling (targets ~40-80 high-value frames across the clip)
        if duration <= 15:
            interval_sec = 1.0
        elif duration <= 60:
            interval_sec = 1.5
        elif duration <= 180:
            interval_sec = 2.5
        else:
            # For long videos (>3 min), sample every ~3.5 to 4.0s (captures all events without CPU lag)
            interval_sec = min(5.0, max(3.0, duration / 75.0))

        frame_step = max(int(fps * interval_sec), 1)
        sample_indices = list(range(0, total_frames, frame_step))
        if not sample_indices:
            sample_indices = [0]

        total_sampled = len(sample_indices)
        processed_count = 0
        video_start_time = video.uploaded_at
        recognized_emp_ids = set()

        enable_obj = getattr(video, 'enable_object_detection', True)
        enable_face = getattr(video, 'enable_face_recognition', True)
        enable_att = getattr(video, 'enable_attendance', True)

        # Sync FAISS face index before processing video
        engine_state.rebuild_face_index(db)

        # Track continuity memory for ByteTrack person tracks (smooths recognition across continuous tracks)
        person_track_identities: dict = {}

        current_frame_pos = 0
        for target_frame_idx in sample_indices:
            # Fast seek: if jump is large (>30 frames), use seek; otherwise grab forward
            if abs(target_frame_idx - current_frame_pos) > 40:
                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame_idx)
            else:
                while current_frame_pos < target_frame_idx:
                    cap.grab()
                    current_frame_pos += 1

            ret, frame = cap.read()
            current_frame_pos = target_frame_idx + 1
            if not ret or frame is None:
                continue

            timestamp_seconds = target_frame_idx / fps if fps > 0 else 0.0
            try:
                # Downscale 4K/2K/1080p frames to standard 960px for ultra-fast AI inference
                h, w = frame.shape[:2]
                if max(h, w) > 960:
                    scale = 960.0 / max(h, w)
                    analysis_frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                else:
                    analysis_frame = frame

                analysis = analyze_frame(analysis_frame, enable_objects=enable_obj, enable_face=enable_face, orig_frame_bgr=frame)
                
                # Apply track-level identity continuity & smoothing across frames
                for f in analysis.get("faces", []):
                    tid = f.get("tracking_id")
                    if f.get("match"):
                        if tid is not None:
                            person_track_identities[tid] = f["match"]
                        recognized_emp_ids.add(f["match"]["employee_id"])
                    elif tid is not None and tid in person_track_identities:
                        # Smooth confirmed identity across person track
                        f["match"] = person_track_identities[tid]
                        recognized_emp_ids.add(f["match"]["employee_id"])

                persist_video_frame(db, video_id=video_id, frame_index=target_frame_idx,
                                     timestamp_seconds=timestamp_seconds, analysis=analysis,
                                     frame_bgr=frame, video_start_time=video_start_time,
                                     camera_id=video.camera_id,
                                     enable_attendance=enable_att,
                                     shift_start_time=video.shift_start_time or "09:00",
                                     shift_end_time=video.shift_end_time or "17:00")
            except Exception as frame_err:
                print(f"Warning: frame {target_frame_idx} error on {video_id}: {frame_err}")

            processed_count += 1
            progress_pct = min(int((processed_count / total_sampled) * 100), 99)
            crud.update_video_progress(db, video_id, processed_frames=processed_count, progress_percent=progress_pct)

        cap.release()
        crud.update_video_status(db, video_id, status="DONE", processed_frames=processed_count, progress_percent=100)

        # Mark absent employees who were not detected in the video
        if enable_att and recognized_emp_ids:
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
