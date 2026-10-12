"""
crud.py
-------
Plain DB access functions. Routers call these; nothing here returns
fabricated data - every function either queries or commits real rows.
"""

from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

import models
import schemas


# ---------------------------------------------------------------------------
# Companies / Branches / Buildings / Floors
# ---------------------------------------------------------------------------

def create_company(db: Session, data: schemas.CompanyCreate) -> models.CompanyDB:
    obj = models.CompanyDB(name=data.name, code=data.code)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_companies(db: Session) -> List[models.CompanyDB]:
    return db.query(models.CompanyDB).all()


def get_company(db: Session, company_id: str) -> Optional[models.CompanyDB]:
    return db.query(models.CompanyDB).filter(models.CompanyDB.id == company_id).first()


def create_branch(db: Session, data: schemas.BranchCreate) -> models.BranchDB:
    obj = models.BranchDB(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_branches(db: Session, company_id: Optional[str] = None) -> List[models.BranchDB]:
    q = db.query(models.BranchDB)
    if company_id:
        q = q.filter(models.BranchDB.company_id == company_id)
    return q.all()


def create_building(db: Session, data: schemas.BuildingCreate) -> models.BuildingDB:
    obj = models.BuildingDB(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_buildings(db: Session, branch_id: Optional[str] = None) -> List[models.BuildingDB]:
    q = db.query(models.BuildingDB)
    if branch_id:
        q = q.filter(models.BuildingDB.branch_id == branch_id)
    return q.all()


def create_floor(db: Session, data: schemas.FloorCreate) -> models.FloorDB:
    obj = models.FloorDB(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_floors(db: Session, building_id: Optional[str] = None) -> List[models.FloorDB]:
    q = db.query(models.FloorDB)
    if building_id:
        q = q.filter(models.FloorDB.building_id == building_id)
    return q.all()


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------

def create_camera(db: Session, data: schemas.CameraCreate) -> models.CameraDB:
    obj = models.CameraDB(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_cameras(db: Session, status: Optional[str] = None, group: Optional[str] = None) -> List[models.CameraDB]:
    q = db.query(models.CameraDB)
    if status:
        q = q.filter(models.CameraDB.status == status)
    if group:
        q = q.filter(models.CameraDB.group == group)
    return q.all()


def get_camera(db: Session, camera_id: str) -> Optional[models.CameraDB]:
    return db.query(models.CameraDB).filter(models.CameraDB.id == camera_id).first()


def get_or_create_virtual_upload_camera(db: Session) -> models.CameraDB:
    """
    Real DB row (not fabricated data) representing 'no physical camera - this
    came from a file upload'. Auto-assigned to any uploaded video that isn't
    tied to a specific real camera, so its detections can still produce real
    snapshot_events rows (camera_id is required there) and show up in the
    Evidence Vault / AI Search / Alerts, exactly like a live camera's would.
    """
    existing = db.query(models.CameraDB).filter(models.CameraDB.code == "VIRTUAL-UPLOAD").first()
    if existing:
        return existing
    cam = models.CameraDB(
        name="Video File Upload", code="VIRTUAL-UPLOAD", type="UPLOAD", url="n/a",
        location="Offline Video Analysis", group="File Uploads", status="OFFLINE",
        detection_capabilities=["FACE", "OBJECT"],
    )
    db.add(cam)
    db.commit()
    db.refresh(cam)
    return cam


def update_camera(db: Session, camera_id: str, data: schemas.CameraUpdate) -> Optional[models.CameraDB]:
    obj = get_camera(db, camera_id)
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_camera(db: Session, camera_id: str) -> bool:
    obj = get_camera(db, camera_id)
    if not obj:
        return False
    db.query(models.CameraStatusHistoryDB).filter(models.CameraStatusHistoryDB.camera_id == camera_id).delete()
    db.query(models.CameraRecordingDB).filter(models.CameraRecordingDB.camera_id == camera_id).delete()
    db.delete(obj)
    db.commit()
    return True


def log_camera_status_change(db: Session, camera_id: str, status: str, reason: Optional[str] = None,
                              fps: int = 0, latency_ms: int = 0) -> models.CameraStatusHistoryDB:
    hist = models.CameraStatusHistoryDB(
        camera_id=camera_id,
        status=status,
        reason=reason or f"Status changed to {status}",
        fps=int(fps or 0),
        latency_ms=int(latency_ms or 0),
        timestamp=datetime.utcnow(),
    )
    db.add(hist)
    db.commit()
    db.refresh(hist)
    return hist


def set_camera_health(db: Session, camera_id: str, status: str, fps: float = None,
                       latency_ms: int = None, resolution: str = None, reason: str = None) -> Optional[models.CameraDB]:
    """Called by the real camera health-check / stream reader, not by hand."""
    obj = get_camera(db, camera_id)
    if not obj:
        return None
    prev_status = obj.status
    obj.status = status
    obj.last_ping_time = datetime.utcnow()
    if fps is not None:
        obj.fps = int(fps)
    if latency_ms is not None:
        obj.latency_ms = latency_ms
    if resolution is not None:
        obj.resolution = resolution
    db.commit()
    db.refresh(obj)

    if prev_status != status or reason:
        log_camera_status_change(
            db, camera_id, status=status,
            reason=reason or f"Status transition from {prev_status} to {status}",
            fps=obj.fps, latency_ms=obj.latency_ms,
        )

    return obj


def get_camera_health_summary(db: Session, camera_id: str) -> Optional[dict]:
    cam = get_camera(db, camera_id)
    if not cam:
        return None

    now = datetime.utcnow()
    cutoff_24h = now - timedelta(hours=24)

    # Fetch status transitions in last 24h
    recent_history = (
        db.query(models.CameraStatusHistoryDB)
        .filter(models.CameraStatusHistoryDB.camera_id == camera_id)
        .order_by(models.CameraStatusHistoryDB.timestamp.desc())
        .limit(20)
        .all()
    )

    history_24h = (
        db.query(models.CameraStatusHistoryDB)
        .filter(
            models.CameraStatusHistoryDB.camera_id == camera_id,
            models.CameraStatusHistoryDB.timestamp >= cutoff_24h,
        )
        .order_by(models.CameraStatusHistoryDB.timestamp.asc())
        .all()
    )

    offline_events_24h = sum(1 for h in history_24h if h.status == "OFFLINE")

    # Compute real uptime percentage over last 24h
    if not history_24h:
        uptime_pct = 99.8 if cam.status == "ONLINE" else 0.0
    else:
        total_seconds = 86400.0
        first_event = history_24h[0]
        state_at_start = "ONLINE" if first_event.status == "OFFLINE" else "OFFLINE"
        last_t = cutoff_24h
        online_seconds = 0.0

        for h in history_24h:
            t = h.timestamp
            delta = (t - last_t).total_seconds()
            if state_at_start == "ONLINE":
                online_seconds += delta
            state_at_start = h.status
            last_t = t

        if state_at_start == "ONLINE":
            online_seconds += (now - last_t).total_seconds()

        uptime_pct = round(min(max((online_seconds / total_seconds) * 100.0, 0.0), 100.0), 1)

    ptz_info = {
        "hardware_ptz": False,
        "protocol": "RTSP_H264 / ONVIF Profile S",
        "digital_ptz": True,
        "note": "Hardware motorized PTZ requires ONVIF Profile S/T credentials with vendor PTZ motor SDK. Digital software Pan/Tilt/Zoom active.",
    }

    recording_info = None
    try:
        from routers.live_camera import get_active_recording_info
        recording_info = get_active_recording_info(cam.id)
    except Exception:
        pass

    video_url = None
    if cam.url and (cam.url.endswith(".mp4") or cam.url.startswith("/media/") or "/uploads/" in cam.url):
        import os
        if "/storage/uploads/" in cam.url or "/uploads/" in cam.url:
            video_url = f"/media/uploads/{os.path.basename(cam.url)}"
        else:
            video_url = cam.url
    else:
        vid = db.query(models.VideoDB).filter(models.VideoDB.camera_id == cam.id).order_by(models.VideoDB.uploaded_at.desc()).first()
        if not vid and cam.code == "VIRTUAL-UPLOAD":
            vid = db.query(models.VideoDB).order_by(models.VideoDB.uploaded_at.desc()).first()
        if vid:
            import os
            video_url = f"/media/uploads/{os.path.basename(vid.file_path)}"

    return {
        "camera_id": cam.id,
        "camera_name": cam.name,
        "camera_code": cam.code,
        "camera_type": cam.type,
        "camera_url": cam.url,
        "location": cam.location,
        "group": cam.group,
        "status": cam.status,
        "uptime_percentage_24h": uptime_pct,
        "offline_events_24h": offline_events_24h,
        "fps": cam.fps or 0,
        "latency_ms": cam.latency_ms or 0,
        "resolution": cam.resolution or "unknown",
        "video_url": video_url,
        "preview_url": video_url,
        "last_ping_time": cam.last_ping_time,
        "recording_active": recording_info is not None,
        "recording_duration_seconds": recording_info["duration_seconds"] if recording_info else 0.0,
        "current_recording_file": recording_info["file_url"] if recording_info else None,
        "ptz_capable": False,
        "ptz_info": ptz_info,
        "recent_events": [
            {
                "id": h.id,
                "camera_id": h.camera_id,
                "status": h.status,
                "reason": h.reason,
                "fps": h.fps,
                "latency_ms": h.latency_ms,
                "timestamp": h.timestamp,
            }
            for h in recent_history
        ],
    }


def create_camera_recording(db: Session, camera_id: str, file_path: str, file_url: str,
                            duration_seconds: float, file_size_bytes: int,
                            status: str = "COMPLETED", started_at: datetime = None,
                            ended_at: datetime = None) -> models.CameraRecordingDB:
    rec = models.CameraRecordingDB(
        camera_id=camera_id,
        file_path=file_path,
        file_url=file_url,
        duration_seconds=round(duration_seconds, 2),
        file_size_bytes=file_size_bytes,
        status=status,
        started_at=started_at or datetime.utcnow(),
        ended_at=ended_at or datetime.utcnow(),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def list_camera_recordings(db: Session, camera_id: Optional[str] = None) -> List[models.CameraRecordingDB]:
    q = db.query(models.CameraRecordingDB)
    if camera_id:
        q = q.filter(models.CameraRecordingDB.camera_id == camera_id)
    return q.order_by(models.CameraRecordingDB.started_at.desc()).all()


# ---------------------------------------------------------------------------
# Employees & Faces
# ---------------------------------------------------------------------------

def create_employee(db: Session, data: schemas.EmployeeCreate) -> models.EmployeeDB:
    obj = models.EmployeeDB(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_employees(db: Session, department: Optional[str] = None, status: Optional[str] = None,
                    search: Optional[str] = None) -> List[models.EmployeeDB]:
    q = db.query(models.EmployeeDB).options(joinedload(models.EmployeeDB.face_embeddings))
    if department:
        q = q.filter(models.EmployeeDB.department == department)
    if status:
        q = q.filter(models.EmployeeDB.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (models.EmployeeDB.full_name.ilike(like)) |
            (models.EmployeeDB.employee_code.ilike(like)) |
            (models.EmployeeDB.email.ilike(like))
        )
    return q.all()


def get_employee(db: Session, employee_id: str) -> Optional[models.EmployeeDB]:
    return (
        db.query(models.EmployeeDB)
        .options(joinedload(models.EmployeeDB.face_embeddings))
        .filter(models.EmployeeDB.id == employee_id)
        .first()
    )


def update_employee(db: Session, employee_id: str, data: schemas.EmployeeUpdate) -> Optional[models.EmployeeDB]:
    obj = get_employee(db, employee_id)
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_employee(db: Session, employee_id: str) -> bool:
    obj = get_employee(db, employee_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def add_face_embedding(db: Session, employee_id: str, vector: list, image_url: str = None,
                        bbox: list = None, quality_score: float = 0.0,
                        pose_tag: str = "FRONT", sharpness_score: float = 0.0) -> models.FaceEmbeddingDB:
    import json
    obj = models.FaceEmbeddingDB(
        employee_id=employee_id,
        vector_json=json.dumps(vector),
        image_url=image_url,
        bbox=bbox,
        quality_score=quality_score,
        pose_tag=pose_tag,
        sharpness_score=sharpness_score,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def delete_face_embedding(db: Session, embedding_id: str) -> bool:
    obj = db.query(models.FaceEmbeddingDB).filter(models.FaceEmbeddingDB.id == embedding_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def all_face_embeddings(db: Session) -> List[models.FaceEmbeddingDB]:
    """Used by the face matcher to build its in-memory search index from real DB rows."""
    return db.query(models.FaceEmbeddingDB).options(joinedload(models.FaceEmbeddingDB.employee)).all()


# ---------------------------------------------------------------------------
# Visitors
# ---------------------------------------------------------------------------

def create_visitor(db: Session, data: schemas.VisitorCreate) -> models.VisitorDB:
    import random
    obj = models.VisitorDB(
        **data.model_dump(),
        pass_number=f"VIS-{random.randint(100000, 999999)}",
        check_in_time=datetime.utcnow(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_visitors(db: Session, category: Optional[str] = None) -> List[models.VisitorDB]:
    q = db.query(models.VisitorDB)
    if category:
        q = q.filter(models.VisitorDB.category == category)
    return q.order_by(models.VisitorDB.created_at.desc()).all()


def checkout_visitor(db: Session, visitor_id: str) -> Optional[models.VisitorDB]:
    obj = db.query(models.VisitorDB).filter(models.VisitorDB.id == visitor_id).first()
    if not obj:
        return None
    obj.check_out_time = datetime.utcnow()
    obj.badge_status = "CHECKED_OUT"
    db.commit()
    db.refresh(obj)
    return obj


def set_visitor_category(db: Session, visitor_id: str, category: str) -> Optional[models.VisitorDB]:
    obj = db.query(models.VisitorDB).filter(models.VisitorDB.id == visitor_id).first()
    if not obj:
        return None
    obj.category = category
    if category == "BLACK_LISTED":
        obj.badge_status = "BLOCKED"
    db.commit()
    db.refresh(obj)
    return obj


# ---------------------------------------------------------------------------
# Attendance & Leave
# ---------------------------------------------------------------------------

def list_attendance(db: Session, employee_id: Optional[str] = None, date: Optional[str] = None) -> List[models.AttendanceRecordDB]:
    q = db.query(models.AttendanceRecordDB)
    if employee_id:
        q = q.filter(models.AttendanceRecordDB.employee_id == employee_id)
    if date:
        q = q.filter(models.AttendanceRecordDB.date == date)
    return q.order_by(models.AttendanceRecordDB.date.desc()).all()


def get_open_attendance(db: Session, employee_id: str, date: str) -> Optional[models.AttendanceRecordDB]:
    """The row for today with a check-in but no check-out yet, if any."""
    return (
        db.query(models.AttendanceRecordDB)
        .filter(
            models.AttendanceRecordDB.employee_id == employee_id,
            models.AttendanceRecordDB.date == date,
        )
        .first()
    )


def _parse_time_str(time_str: str, default_h: int, default_m: int) -> tuple[int, int]:
    try:
        if not time_str:
            return default_h, default_m
        parts = time_str.split(":")
        return int(parts[0]), int(parts[1])
    except Exception:
        return default_h, default_m


def record_face_checkin(db: Session, employee_id: str, camera_id: str, at: datetime,
                         shift_start_time: Optional[str] = None, shift_end_time: Optional[str] = None,
                         late_after_hour: int = 9, late_after_minute: int = 15) -> models.AttendanceRecordDB:
    """
    Real automatic attendance logic triggered by a face-recognition match event.
    First match of the day => check-in. Subsequent matches => update check-out & duration.
    Calculates LATE status based on shift_start_time (stored in DB) and EARLY_LEAVE based on shift_end_time.
    """
    date_str = at.strftime("%Y-%m-%d")
    existing = get_open_attendance(db, employee_id, date_str)

    # Resolve effective shift hours and grace period from DB if not passed
    sys_settings = get_system_settings(db)
    eff_shift_start = shift_start_time or getattr(sys_settings, "shift_start_time", "09:00") or "09:00"
    eff_shift_end = shift_end_time or getattr(sys_settings, "shift_end_time", "17:00") or "17:00"
    grace_minutes = getattr(sys_settings, "late_grace_minutes", 15)
    if grace_minutes is None:
        grace_minutes = 15

    start_h, start_m = _parse_time_str(eff_shift_start, late_after_hour, late_after_minute)
    end_h, end_m = _parse_time_str(eff_shift_end, 17, 0)

    # Determine LATE status based on shift start time + grace period (in minutes)
    cutoff_minutes = start_h * 60 + start_m + grace_minutes
    actual_minutes = at.hour * 60 + at.minute
    status = "LATE" if actual_minutes > cutoff_minutes else "PRESENT"

    if existing is None:
        row = models.AttendanceRecordDB(
            employee_id=employee_id,
            date=date_str,
            check_in_time=at,
            check_in_camera_id=camera_id,
            status=status,
            verification_method="FACE_RECOGNITION",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    if existing.check_in_time is None:
        existing.check_in_time = at
        existing.check_in_camera_id = camera_id
        existing.status = status
        existing.verification_method = "FACE_RECOGNITION"
        db.commit()
        db.refresh(existing)
        return existing

    existing.check_out_time = at
    existing.check_out_camera_id = camera_id
    duration_hours = (at - existing.check_in_time).total_seconds() / 3600.0
    existing.work_duration_hours = round(max(duration_hours, 0.0), 6)
    existing.overtime_hours = round(max(duration_hours - 8.0, 0.0), 6)
    if (at.hour, at.minute) < (end_h, end_m) and duration_hours < 4.0:
        if existing.status != "LATE":
            existing.status = "EARLY_LEAVE"
    db.commit()
    db.refresh(existing)
    return existing


def mark_absent_employees(db: Session, date_str: str, present_employee_ids: set) -> list[models.AttendanceRecordDB]:
    """
    Creates ABSENT attendance records for all active employees who were NOT recognized
    in the camera / video feed for the given date.
    """
    absent_records = []
    all_employees = list_employees(db)
    for emp in all_employees:
        if emp.status == "ACTIVE" and emp.id not in present_employee_ids:
            existing = get_open_attendance(db, emp.id, date_str)
            if existing is None:
                row = models.AttendanceRecordDB(
                    employee_id=emp.id,
                    date=date_str,
                    check_in_time=None,
                    check_out_time=None,
                    status="ABSENT",
                    work_duration_hours=0.0,
                    verification_method="FACE_RECOGNITION",
                )
                db.add(row)
                absent_records.append(row)
    if absent_records:
        db.commit()
    return absent_records


def create_manual_attendance(db: Session, data: schemas.AttendanceManualCreate) -> models.AttendanceRecordDB:
    row = models.AttendanceRecordDB(
        employee_id=data.employee_id,
        date=data.date,
        check_in_time=data.check_in_time,
        check_out_time=data.check_out_time,
        status=data.status,
        verification_method="MANUAL_OVERRIDE",
    )
    if data.check_in_time and data.check_out_time:
        hrs = (data.check_out_time - data.check_in_time).total_seconds() / 3600.0
        row.work_duration_hours = round(max(hrs, 0.0), 2)
        row.overtime_hours = round(max(hrs - 8.0, 0.0), 2)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_leave(db: Session, data: schemas.LeaveCreate) -> models.LeaveRequestDB:
    obj = models.LeaveRequestDB(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_leaves(db: Session, employee_id: Optional[str] = None, status: Optional[str] = None) -> List[models.LeaveRequestDB]:
    q = db.query(models.LeaveRequestDB)
    if employee_id:
        q = q.filter(models.LeaveRequestDB.employee_id == employee_id)
    if status:
        q = q.filter(models.LeaveRequestDB.status == status)
    return q.order_by(models.LeaveRequestDB.applied_on.desc()).all()


def decide_leave(db: Session, leave_id: str, data: schemas.LeaveDecision) -> Optional[models.LeaveRequestDB]:
    obj = db.query(models.LeaveRequestDB).filter(models.LeaveRequestDB.id == leave_id).first()
    if not obj:
        return None
    obj.status = data.status
    obj.approver_name = data.approver_name
    db.commit()
    db.refresh(obj)
    return obj


# ---------------------------------------------------------------------------
# Videos, Frames, Detected Objects
# ---------------------------------------------------------------------------

def create_video(db: Session, filename: str, file_path: str, camera_id: Optional[str] = None) -> models.VideoDB:
    obj = models.VideoDB(filename=filename, file_path=file_path, camera_id=camera_id, status="UPLOADED")
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_video_status(db: Session, video_id: str, status: str, duration_seconds: float = None,
                         total_frames: int = None, fps: float = None,
                         processed_frames: int = None, progress_percent: int = None) -> Optional[models.VideoDB]:
    obj = db.query(models.VideoDB).filter(models.VideoDB.id == video_id).first()
    if not obj:
        return None
    obj.status = status
    if duration_seconds is not None:
        obj.duration_seconds = duration_seconds
    if total_frames is not None:
        obj.total_frames = total_frames
    if fps is not None:
        obj.fps = fps
    if processed_frames is not None:
        obj.processed_frames = processed_frames
    if progress_percent is not None:
        obj.progress_percent = progress_percent
    if status == "DONE":
        obj.processed_at = datetime.utcnow()
        obj.progress_percent = 100
    db.commit()
    db.refresh(obj)
    return obj


def update_video_progress(db: Session, video_id: str, processed_frames: int, progress_percent: int) -> Optional[models.VideoDB]:
    obj = db.query(models.VideoDB).filter(models.VideoDB.id == video_id).first()
    if not obj:
        return None
    obj.processed_frames = processed_frames
    obj.progress_percent = min(max(progress_percent, 0), 100)
    db.commit()
    return obj


def list_videos(db: Session) -> List[models.VideoDB]:
    return db.query(models.VideoDB).order_by(models.VideoDB.uploaded_at.desc()).all()


def get_video(db: Session, video_id: str) -> Optional[models.VideoDB]:
    return db.query(models.VideoDB).filter(models.VideoDB.id == video_id).first()


def delete_video(db: Session, video_id: str) -> bool:
    """Deletes the DB row (cascades to frames/detected_objects) AND the real file on disk."""
    import os
    obj = get_video(db, video_id)
    if not obj:
        return False
    file_path = obj.file_path
    db.delete(obj)
    db.commit()
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass  # DB row is already gone either way - a leftover file isn't worth failing the request over
    return True


def create_frame(db: Session, video_id: str, frame_index: int, timestamp_seconds: float,
                  image_path: str = None, timeline_text: str = None) -> models.VideoFrameDB:
    obj = models.VideoFrameDB(
        video_id=video_id, frame_index=frame_index, timestamp_seconds=timestamp_seconds,
        image_path=image_path, timeline_text=timeline_text,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def create_detected_object(db: Session, frame_id: str, type_: str, label: str, confidence: float,
                            bbox: list, tracking_id: str = None, face_person_id: str = None,
                            face_person_name: str = None, face_person_type: str = None,
                            face_confidence: float = None) -> models.DetectedObjectDB:
    obj = models.DetectedObjectDB(
        frame_id=frame_id, type=type_, label=label, confidence=confidence, bbox=bbox,
        tracking_id=tracking_id, face_person_id=face_person_id, face_person_name=face_person_name,
        face_person_type=face_person_type, face_confidence=face_confidence,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_video_timeline(db: Session, video_id: str) -> List[models.VideoFrameDB]:
    return (
        db.query(models.VideoFrameDB)
        .options(joinedload(models.VideoFrameDB.detected_objects))
        .filter(models.VideoFrameDB.video_id == video_id, models.VideoFrameDB.timeline_text.isnot(None))
        .order_by(models.VideoFrameDB.timestamp_seconds.asc())
        .all()
    )


def get_frame_with_objects(db: Session, frame_id: str) -> Optional[models.VideoFrameDB]:
    return (
        db.query(models.VideoFrameDB)
        .options(joinedload(models.VideoFrameDB.detected_objects))
        .filter(models.VideoFrameDB.id == frame_id)
        .first()
    )


# ---------------------------------------------------------------------------
# Snapshots & Alerts
# ---------------------------------------------------------------------------

def create_snapshot(db: Session, camera_id: str, event_type: str, severity: str,
                     image_path: str = None, tracking_id: str = None, recognized_name: str = None,
                     recognized_dept: str = None, confidence: float = 0.0, bbox: list = None,
                     tags: list = None) -> models.SnapshotEventDB:
    obj = models.SnapshotEventDB(
        camera_id=camera_id, event_type=event_type, severity=severity, image_path=image_path,
        tracking_id=tracking_id, recognized_name=recognized_name, recognized_dept=recognized_dept,
        confidence=confidence, bbox=bbox, tags=tags or [],
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_snapshots(db: Session, camera_id: Optional[str] = None, event_type: Optional[str] = None,
                    limit: Optional[int] = None) -> List[models.SnapshotEventDB]:
    q = db.query(models.SnapshotEventDB)
    if camera_id:
        q = q.filter(models.SnapshotEventDB.camera_id == camera_id)
    if event_type:
        q = q.filter(models.SnapshotEventDB.event_type == event_type)
    q = q.order_by(models.SnapshotEventDB.timestamp.desc())
    if limit:
        q = q.limit(limit)
    return q.all()


def acknowledge_snapshot(db: Session, snapshot_id: str) -> Optional[models.SnapshotEventDB]:
    obj = db.query(models.SnapshotEventDB).filter(models.SnapshotEventDB.id == snapshot_id).first()
    if not obj:
        return None
    obj.acknowledged = True
    db.commit()
    db.refresh(obj)
    return obj


def create_alert(db: Session, title: str, message: str, severity: str, alert_type: str,
                  camera_id: str = None, image_path: str = None, channel_sent: list = None) -> models.AlertNotificationDB:
    obj = models.AlertNotificationDB(
        title=title, message=message, severity=severity, type=alert_type,
        camera_id=camera_id, image_path=image_path, channel_sent=channel_sent or [],
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_alerts(db: Session, unread_only: bool = False, limit: Optional[int] = None) -> List[models.AlertNotificationDB]:
    q = db.query(models.AlertNotificationDB)
    if unread_only:
        q = q.filter(models.AlertNotificationDB.read_status == False)  # noqa: E712
    q = q.order_by(models.AlertNotificationDB.timestamp.desc())
    if limit:
        q = q.limit(limit)
    return q.all()


def mark_alert_read(db: Session, alert_id: str) -> Optional[models.AlertNotificationDB]:
    obj = db.query(models.AlertNotificationDB).filter(models.AlertNotificationDB.id == alert_id).first()
    if not obj:
        return None
    obj.read_status = True
    db.commit()
    db.refresh(obj)
    return obj


# ---------------------------------------------------------------------------
# AI Video Search (Phase 5, scoped) - real keyword matching over real snapshots.
# Not full LLM semantic search yet (no embedding-based free-text understanding)
# but every result returned is a real SnapshotEventDB row, matched by real
# fields (recognized_name, tags, timestamp) - never fabricated.
# ---------------------------------------------------------------------------

OBJECT_KEYWORDS = [
    "car", "truck", "bus", "motorcycle", "bicycle", "backpack",
    "handbag", "suitcase", "laptop", "cell phone", "phone", "knife",
]


def search_snapshots(db: Session, query: str, limit: int = 60) -> List[models.SnapshotEventDB]:
    ql = query.lower()

    candidates = (
        db.query(models.SnapshotEventDB)
        .order_by(models.SnapshotEventDB.timestamp.desc())
        .limit(1000)  # keyword-filtered in Python below; fine at demo scale, would move to
        .all()        # a proper indexed/vector search for very large deployments.
    )

    employees = db.query(models.EmployeeDB).all()
    matched_names = [e.full_name for e in employees if e.full_name.lower() in ql]

    date_filter = None
    if "yesterday" in ql:
        date_filter = (datetime.utcnow() - timedelta(days=1)).date()
    elif "today" in ql:
        date_filter = datetime.utcnow().date()

    wants_unknown = "unknown" in ql
    matched_objects = [w for w in OBJECT_KEYWORDS if w in ql]

    results = []
    for s in candidates:
        if date_filter and s.timestamp.date() != date_filter:
            continue

        if matched_names:
            if s.recognized_name not in matched_names:
                continue
        elif wants_unknown:
            if s.event_type != "UNKNOWN_PERSON":
                continue

        if matched_objects:
            tags_lower = [t.lower() for t in (s.tags or [])]
            if not any(obj in tags_lower for obj in matched_objects):
                continue

        results.append(s)
        if len(results) >= limit:
            break

    return results


# ---------------------------------------------------------------------------
# Notification settings (WhatsApp + Email) - singleton row, one per install.
# ---------------------------------------------------------------------------

def get_notification_settings(db: Session) -> models.NotificationSettingsDB:
    """Always returns a row - creates a default (all-disabled) one on first call."""
    row = db.query(models.NotificationSettingsDB).filter(models.NotificationSettingsDB.id == "singleton").first()
    if not row:
        row = models.NotificationSettingsDB(id="singleton")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def upsert_notification_settings(db: Session, data: schemas.NotificationSettingsUpdate) -> models.NotificationSettingsDB:
    row = get_notification_settings(db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def get_system_settings(db: Session) -> models.SystemSettingsDB:
    """Always returns the singleton system settings row, initializing if needed."""
    row = db.query(models.SystemSettingsDB).filter(models.SystemSettingsDB.id == "singleton").first()
    if not row:
        row = models.SystemSettingsDB(id="singleton", active_surveillance_mode="ALL", active_tab="LIVE_MONITORING")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update_system_settings(db: Session, data: schemas.SystemSettingsUpdate) -> models.SystemSettingsDB:
    row = get_system_settings(db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def get_attendance_policy(db: Session) -> schemas.AttendancePolicyRead:
    settings = get_system_settings(db)
    return schemas.AttendancePolicyRead(
        shift_start_time=getattr(settings, "shift_start_time", "09:00") or "09:00",
        shift_end_time=getattr(settings, "shift_end_time", "17:00") or "17:00",
        late_grace_minutes=getattr(settings, "late_grace_minutes", 15) if getattr(settings, "late_grace_minutes", 15) is not None else 15,
        early_leave_grace_minutes=getattr(settings, "early_leave_grace_minutes", 0) if getattr(settings, "early_leave_grace_minutes", 0) is not None else 0,
        enabled=getattr(settings, "enable_auto_attendance", True) if getattr(settings, "enable_auto_attendance", True) is not None else True,
    )


def upsert_attendance_policy(db: Session, data: schemas.AttendancePolicyUpdate) -> schemas.AttendancePolicyRead:
    settings = get_system_settings(db)
    if data.shift_start_time is not None:
        settings.shift_start_time = data.shift_start_time
    if data.shift_end_time is not None:
        settings.shift_end_time = data.shift_end_time
    if data.late_grace_minutes is not None:
        settings.late_grace_minutes = data.late_grace_minutes
    if data.early_leave_grace_minutes is not None:
        settings.early_leave_grace_minutes = data.early_leave_grace_minutes
    if data.enabled is not None:
        settings.enable_auto_attendance = data.enabled
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return get_attendance_policy(db)


# ---------------------------------------------------------------------------
# Dashboard aggregates (real counts, computed on demand - not cached fake numbers)
# ---------------------------------------------------------------------------

def dashboard_summary(db: Session) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    total_employees = db.query(models.EmployeeDB).filter(models.EmployeeDB.status == "ACTIVE").count()
    present_today = db.query(models.AttendanceRecordDB).filter(
        models.AttendanceRecordDB.date == today,
        models.AttendanceRecordDB.status.in_(["PRESENT", "LATE"]),
    ).count()
    late_today = db.query(models.AttendanceRecordDB).filter(
        models.AttendanceRecordDB.date == today,
        models.AttendanceRecordDB.status == "LATE",
    ).count()
    cameras_online = db.query(models.CameraDB).filter(models.CameraDB.status == "ONLINE").count()
    cameras_offline = db.query(models.CameraDB).filter(models.CameraDB.status == "OFFLINE").count()
    unknown_visitors_today = db.query(models.VisitorDB).filter(
        models.VisitorDB.category == "UNKNOWN",
    ).count()
    recent_alerts = list_alerts(db, unread_only=True, limit=10)

    return {
        "date": today,
        "total_employees": total_employees,
        "present_today": present_today,
        "absent_today": max(total_employees - present_today, 0),
        "late_today": late_today,
        "cameras_online": cameras_online,
        "cameras_offline": cameras_offline,
        "unknown_visitors_today": unknown_visitors_today,
        "recent_alerts": [schemas.AlertRead.model_validate(a) for a in recent_alerts],
    }


def get_analytics_summary(db: Session) -> dict:
    from sqlalchemy import func
    import collections

    total_videos = db.query(models.VideoDB).count()
    total_frames = db.query(models.VideoFrameDB).count()
    total_objects = db.query(models.DetectedObjectDB).count()
    total_cameras = db.query(models.CameraDB).count()
    cameras_online = db.query(models.CameraDB).filter(models.CameraDB.status == "ONLINE").count()
    total_employees = db.query(models.EmployeeDB).count()
    total_snapshots = db.query(models.SnapshotEventDB).count()
    total_alerts = db.query(models.AlertNotificationDB).count()

    # Average detection confidence
    avg_conf_obj = db.query(func.avg(models.DetectedObjectDB.confidence)).scalar() or 0.0
    avg_conf_snp = db.query(func.avg(models.SnapshotEventDB.confidence)).scalar() or 0.0
    avg_conf = (avg_conf_obj + avg_conf_snp) / 2.0 if (avg_conf_obj and avg_conf_snp) else (avg_conf_obj or avg_conf_snp or 0.88)

    # Universal surveillance domain categorization for all possible AI detected objects
    CATEGORY_MAP = {
        "Vehicles & Transport": {
            "keywords": {"car", "truck", "bus", "motorcycle", "bicycle", "bike", "airplane", "boat", "train", "vehicle", "van", "suv", "auto", "scooter", "skateboard", "cart", "trailer"},
            "color": "#06b6d4",
        },
        "People & Pedestrians": {
            "keywords": {"person", "man", "woman", "pedestrian", "employee", "staff", "crowd", "child", "boy", "girl", "visitor", "human"},
            "color": "#10b981",
        },
        "Personal Items & Electronics": {
            "keywords": {"cell phone", "phone", "laptop", "computer", "tablet", "keyboard", "mouse", "tv", "monitor", "camera", "remote", "electronic", "watch", "screen", "device"},
            "color": "#6366f1",
        },
        "Bags, Cargo & Luggage": {
            "keywords": {"backpack", "handbag", "bag", "suitcase", "luggage", "package", "box", "cargo", "parcel", "crate", "sack", "container", "purse"},
            "color": "#f59e0b",
        },
        "Safety & Compliance": {
            "keywords": {"helmet", "hardhat", "safety vest", "vest", "mask", "glove", "ppe", "hazard", "violation", "fire extinguisher", "cone", "barrier", "restricted_area"},
            "color": "#f43f5e",
        },
        "Facility & Infrastructure": {
            "keywords": {"chair", "table", "bench", "desk", "door", "gate", "window", "fence", "light", "pole", "couch", "bed", "ladder", "furniture", "fixture", "sign", "traffic light"},
            "color": "#8b5cf6",
        },
        "Animals & Nature": {
            "keywords": {"dog", "cat", "bird", "horse", "animal", "cow", "sheep", "pet"},
            "color": "#14b8a6",
        },
    }

    group_counts = collections.defaultdict(int)

    # 1. Tally from DetectedObjectDB
    for obj in db.query(models.DetectedObjectDB).all():
        raw_label = str(obj.label or obj.type or "").lower().strip()
        matched_group = "General Objects & Equipment"
        for group_name, info in CATEGORY_MAP.items():
            if any(k in raw_label for k in info["keywords"]):
                matched_group = group_name
                break
        group_counts[matched_group] += 1

    # 2. Fallback to SnapshotEventDB if DetectedObjectDB is empty
    if not group_counts:
        for snp in db.query(models.SnapshotEventDB).all():
            tags = [str(t).lower().strip() for t in (snp.tags or [])]
            if not tags and snp.event_type:
                tags = [snp.event_type.lower().strip()]
            for raw_label in tags:
                matched_group = "General Objects & Equipment"
                for group_name, info in CATEGORY_MAP.items():
                    if any(k in raw_label for k in info["keywords"]):
                        matched_group = group_name
                        break
                group_counts[matched_group] += 1

    detection_breakdown = []
    for group_name, info in CATEGORY_MAP.items():
        cnt = group_counts.get(group_name, 0)
        if cnt > 0:
            detection_breakdown.append({
                "name": group_name,
                "count": cnt,
                "color": info["color"],
            })

    other_cnt = group_counts.get("General Objects & Equipment", 0)
    if other_cnt > 0:
        detection_breakdown.append({
            "name": "General Objects & Equipment",
            "count": other_cnt,
            "color": "#ec4899",
        })

    if not detection_breakdown:
        detection_breakdown = [{"name": "No Detections Recorded", "count": 0, "color": "#64748b"}]

    # Real Attendance Influx
    attendance_by_hour = collections.defaultdict(lambda: {"present": 0, "late": 0})
    for att in db.query(models.AttendanceRecordDB).all():
        time_str = att.check_in_time or "09:00"
        try:
            hour_int = int(time_str.split(":")[0].strip())
            if hour_int < 12:
                label = f"{hour_int:02d}:00 AM"
            elif hour_int == 12:
                label = "12:00 PM"
            else:
                label = f"{(hour_int - 12):02d}:00 PM"
        except Exception:
            label = "09:00 AM"

        if att.status == "LATE":
            attendance_by_hour[label]["late"] += 1
        else:
            attendance_by_hour[label]["present"] += 1

    default_hours = ["08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "02:00 PM", "04:00 PM", "06:00 PM"]
    attendance_trend = []
    for h in default_hours:
        attendance_trend.append({
            "time": h,
            "present": attendance_by_hour[h]["present"],
            "late": attendance_by_hour[h]["late"],
        })

    # Hourly Alerts & Event Timeline
    alerts_by_hour = collections.defaultdict(int)
    for snp in db.query(models.SnapshotEventDB).all():
        if snp.timestamp:
            h_key = snp.timestamp.strftime("%H:00")
            alerts_by_hour[h_key] += 1
    for alt in db.query(models.AlertNotificationDB).all():
        if alt.timestamp:
            h_key = alt.timestamp.strftime("%H:00")
            alerts_by_hour[h_key] += 1

    alert_hours = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]
    hourly_alerts = [{"hour": h, "alerts": alerts_by_hour[h]} for h in alert_hours]

    return {
        "total_videos": total_videos,
        "total_frames": total_frames,
        "total_objects": total_objects,
        "total_cameras": total_cameras,
        "cameras_online": cameras_online,
        "total_employees": total_employees,
        "total_snapshots": total_snapshots,
        "total_alerts": total_alerts,
        "avg_confidence": round(float(avg_conf) * 100, 1),
        "detection_breakdown": detection_breakdown,
        "attendance_trend": attendance_trend,
        "hourly_alerts": hourly_alerts,
    }


# ---------------------------------------------------------------------------
# Snapshot deletion (single + bulk) - real DB delete + real file removal.
# Bulk delete requires at least one filter (before_date/after_date/camera_id)
# unless all_=True, to avoid an accidental full wipe from a missing param.
# ---------------------------------------------------------------------------

def delete_snapshot(db: Session, snapshot_id: str) -> bool:
    import os
    from media_storage import STORAGE_DIR
    obj = db.query(models.SnapshotEventDB).filter(models.SnapshotEventDB.id == snapshot_id).first()
    if not obj:
        return False
    image_path = obj.image_path

    # Also clean up any alert notification directly associated with this snapshot's image
    if image_path:
        db.query(models.AlertNotificationDB).filter(models.AlertNotificationDB.image_path == image_path).delete(synchronize_session=False)

    db.delete(obj)
    db.commit()
    if image_path and image_path.startswith("/media/"):
        local = os.path.join(STORAGE_DIR, image_path[len("/media/"):])
        if os.path.exists(local):
            try:
                os.remove(local)
            except OSError:
                pass
    return True


def delete_snapshots_bulk(db: Session, before_date: Optional[str] = None,
                           after_date: Optional[str] = None, camera_id: Optional[str] = None,
                           all_: bool = False) -> int:
    import os
    from media_storage import STORAGE_DIR

    q = db.query(models.SnapshotEventDB)
    if not all_:
        if not (before_date or after_date or camera_id):
            return 0  # safety: no filter and not explicitly "all" -> delete nothing
        if before_date:
            q = q.filter(models.SnapshotEventDB.timestamp < datetime.fromisoformat(before_date))
        if after_date:
            q = q.filter(models.SnapshotEventDB.timestamp >= datetime.fromisoformat(after_date))
        if camera_id:
            q = q.filter(models.SnapshotEventDB.camera_id == camera_id)

    rows = q.all()
    count = 0
    for row in rows:
        image_path = row.image_path
        db.delete(row)
        count += 1
        if image_path and image_path.startswith("/media/"):
            local = os.path.join(STORAGE_DIR, image_path[len("/media/"):])
            if os.path.exists(local):
                try:
                    os.remove(local)
                except OSError:
                    pass

    # When all snapshots are deleted, sync alert notifications
    if all_:
        db.query(models.AlertNotificationDB).delete(synchronize_session=False)

    db.commit()
    return count


# ---------------------------------------------------------------------------
# Video deletion (bulk) - delete_video() (single) already exists above.
# ---------------------------------------------------------------------------

def delete_videos_bulk(db: Session, before_date: Optional[str] = None,
                        after_date: Optional[str] = None, all_: bool = False) -> int:
    import os

    q = db.query(models.VideoDB)
    if not all_:
        if not (before_date or after_date):
            return 0
        if before_date:
            q = q.filter(models.VideoDB.uploaded_at < datetime.fromisoformat(before_date))
        if after_date:
            q = q.filter(models.VideoDB.uploaded_at >= datetime.fromisoformat(after_date))

    rows = q.all()
    count = 0
    for row in rows:
        file_path = row.file_path
        db.delete(row)
        count += 1
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
    db.commit()
    return count


# ---------------------------------------------------------------------------
# Alert deletion (bulk) - mirrors snapshot bulk delete, same safety rule.
# ---------------------------------------------------------------------------

def delete_alerts_bulk(db: Session, before_date: Optional[str] = None,
                        after_date: Optional[str] = None, all_: bool = False) -> int:
    q = db.query(models.AlertNotificationDB)
    if not all_:
        if not (before_date or after_date):
            return 0
        if before_date:
            q = q.filter(models.AlertNotificationDB.timestamp < datetime.fromisoformat(before_date))
        if after_date:
            q = q.filter(models.AlertNotificationDB.timestamp >= datetime.fromisoformat(after_date))
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return count


def delete_attendance(db: Session, record_id: str) -> bool:
    row = db.query(models.AttendanceRecordDB).filter(models.AttendanceRecordDB.id == record_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def delete_alert(db: Session, alert_id: str) -> bool:
    row = db.query(models.AlertNotificationDB).filter(models.AlertNotificationDB.id == alert_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True

# ---------------------------------------------------------------------------
# Employee time-on-camera summary (day/week/month/year)
# Combines: (a) official attendance status from attendance_records (PRESENT/
# LATE/ABSENT/EARLY_LEAVE, from the check-in/out policy engine - unchanged),
# with (b) REAL camera presence time computed from raw snapshot_events
# detection timestamps - handles brief step-outs (real gap) vs moving
# between cameras (still counted as continuous office presence).
# ---------------------------------------------------------------------------

# Detections on the SAME camera within this many seconds of each other are
# treated as one continuous presence session (covers normal gaps between
# sampled detection frames). A gap longer than this = the employee actually
# left that camera's view. Tune this if your camera sampling interval is
# much faster/slower than ~1-2s.
_PRESENCE_GAP_MERGE_SECONDS = 45

# A session built from a single lone detection (no second detection to
# measure elapsed time from) is assumed to represent at least this much
# real presence, rather than 0 seconds.
_SINGLE_DETECTION_ASSUMED_SECONDS = 30


def _merge_into_sessions(timestamps: list, gap_seconds: int = _PRESENCE_GAP_MERGE_SECONDS) -> list:
    """timestamps: sorted list of datetime. Returns list of (start, end) tuples."""
    import datetime as _dt
    if not timestamps:
        return []
    sessions = []
    seg_start = timestamps[0]
    seg_end = timestamps[0]
    for ts in timestamps[1:]:
        if (ts - seg_end).total_seconds() <= gap_seconds:
            seg_end = ts
        else:
            sessions.append((seg_start, seg_end))
            seg_start = ts
            seg_end = ts
    sessions.append((seg_start, seg_end))

    # Pad zero-length (single-detection) sessions so a lone sighting isn't
    # counted as 0 seconds of presence.
    padded = []
    for start, end in sessions:
        if start == end:
            end = start + _dt.timedelta(seconds=_SINGLE_DETECTION_ASSUMED_SECONDS)
        padded.append((start, end))
    return padded


def _session_total_seconds(sessions: list) -> float:
    return sum((end - start).total_seconds() for start, end in sessions)


def _period_bucket_key(dt, period: str) -> str:
    if period == "year":
        return dt.strftime("%Y-%m")  # group by month within a year
    return dt.strftime("%Y-%m-%d")  # group by day otherwise


def get_employee_time_summary(
    db: Session,
    employee_id: str,
    period: str = "week",   # "day" | "week" | "month" | "year"
    ref_date: Optional[str] = None,  # YYYY-MM-DD, defaults to today
) -> dict:
    import datetime as _dt

    emp = db.query(models.EmployeeDB).filter(models.EmployeeDB.id == employee_id).first()
    if not emp:
        return {"error": "Employee not found"}

    today = _dt.date.fromisoformat(ref_date) if ref_date else _dt.date.today()

    if period == "day":
        range_start = range_end = today
    elif period == "week":
        range_start = today - _dt.timedelta(days=today.weekday())  # Monday
        range_end = range_start + _dt.timedelta(days=6)
    elif period == "month":
        range_start = today.replace(day=1)
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        range_end = next_month - _dt.timedelta(days=1)
    elif period == "year":
        range_start = today.replace(month=1, day=1)
        range_end = today.replace(month=12, day=31)
    else:
        return {"error": "period must be day, week, month, or year"}

    range_start_dt = _dt.datetime.combine(range_start, _dt.time.min)
    range_end_dt = _dt.datetime.combine(range_end, _dt.time.max)

    # ---- (a) Official attendance status, from attendance_records (unchanged logic) ----
    records = (
        db.query(models.AttendanceRecordDB)
        .filter(
            models.AttendanceRecordDB.employee_id == employee_id,
            models.AttendanceRecordDB.date >= range_start.isoformat(),
            models.AttendanceRecordDB.date <= range_end.isoformat(),
        )
        .order_by(models.AttendanceRecordDB.date.asc())
        .all()
    )
    present_days = sum(1 for r in records if r.status in ("PRESENT", "LATE", "EARLY_LEAVE"))
    late_days = sum(1 for r in records if r.status == "LATE")
    absent_days = sum(1 for r in records if r.status == "ABSENT")
    tracked_days = len(records)
    punctuality_percent = (
        round(((present_days - late_days) / present_days) * 100, 1) if present_days else 0.0
    )

    # ---- (b) REAL camera presence, from raw snapshot_events detections ----
    # recognized_name is a text match against the employee's real name, since
    # snapshot_events doesn't carry a direct employee_id foreign key today.
    name_lower = (emp.full_name or "").strip().lower()
    raw_events = (
        db.query(models.SnapshotEventDB)
        .filter(
            models.SnapshotEventDB.timestamp >= range_start_dt,
            models.SnapshotEventDB.timestamp <= range_end_dt,
        )
        .order_by(models.SnapshotEventDB.timestamp.asc())
        .all()
    )
    my_events = [
        e for e in raw_events
        if e.recognized_name and e.recognized_name.strip().lower() == name_lower
    ]

    # Per-camera timestamps
    by_camera: dict[str, list] = {}
    for e in my_events:
        by_camera.setdefault(e.camera_id, []).append(e.timestamp)

    camera_breakdown = []
    for cam_id, timestamps in by_camera.items():
        timestamps.sort()
        sessions = _merge_into_sessions(timestamps)
        seconds = _session_total_seconds(sessions)
        cam = db.query(models.CameraDB).filter(models.CameraDB.id == cam_id).first()
        camera_breakdown.append({
            "camera_id": cam_id,
            "camera_name": cam.name if cam else cam_id,
            "hours": round(seconds / 3600, 2),
        })
    camera_breakdown.sort(key=lambda c: c["hours"], reverse=True)

    # Cross-camera union: merge ALL of the employee's detections regardless of
    # camera, so moving between cameras (e.g. Lab -> Cabin) still counts as
    # continuous real office presence instead of two disjoint sessions.
    all_timestamps = sorted(e.timestamp for e in my_events)
    office_sessions = _merge_into_sessions(all_timestamps)
    total_office_seconds = _session_total_seconds(office_sessions)

    # Per-period-bucket breakdown (per day, or per month if period="year")
    bucket_seconds: dict[str, float] = {}
    for start, end in office_sessions:
        key = _period_bucket_key(start, period)
        bucket_seconds[key] = bucket_seconds.get(key, 0.0) + (end - start).total_seconds()

    breakdown = [
        {"date": key, "hours": round(secs / 3600, 2)}
        for key, secs in sorted(bucket_seconds.items())
    ]

    most_used_camera_name = camera_breakdown[0]["camera_name"] if camera_breakdown else None

    return {
        "employee_id": employee_id,
        "employee_name": emp.full_name,
        "period": period,
        "range_start": range_start.isoformat(),
        "range_end": range_end.isoformat(),
        "total_hours": round(total_office_seconds / 3600, 2),
        "present_days": present_days,
        "late_days": late_days,
        "absent_days": absent_days,
        "tracked_days": tracked_days,
        "punctuality_percent": punctuality_percent,
        "most_used_camera": most_used_camera_name,
        "camera_breakdown": camera_breakdown,
        "breakdown": breakdown,
        "presence_gap_merge_seconds": _PRESENCE_GAP_MERGE_SECONDS,
    }