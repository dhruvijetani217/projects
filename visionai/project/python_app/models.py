"""
models.py
---------
Complete SQLAlchemy ORM schema for the VisionAI platform.

Every table here backs a real entity used by the React frontend (see src/types.ts).
No dummy/random data generators live in this file - rows only get created
through real API calls (employee registration, camera add, face capture, etc.)

Hierarchy: Company -> Branch -> Building -> Floor -> Camera
Employees / Visitors / Attendance / Leaves / Snapshots / Alerts all reference
back into this hierarchy so a multi-tenant, multi-branch org chart is possible.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship

from database import Base


def gen_id(prefix: str) -> str:
    """Short, readable unique IDs, e.g. emp-3f1a9c2b"""
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Organization hierarchy
# ---------------------------------------------------------------------------

class CompanyDB(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, default=lambda: gen_id("cmp"))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    branches = relationship("BranchDB", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("EmployeeDB", back_populates="company", cascade="all, delete-orphan")

    @property
    def branches_count(self) -> int:
        return len(self.branches)

    @property
    def total_cameras(self) -> int:
        return sum(len(b.cameras_all()) for b in self.branches)

    @property
    def total_employees(self) -> int:
        return len(self.employees)


class BranchDB(Base):
    __tablename__ = "branches"

    id = Column(String, primary_key=True, default=lambda: gen_id("brn"))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)

    company = relationship("CompanyDB", back_populates="branches")
    buildings = relationship("BuildingDB", back_populates="branch", cascade="all, delete-orphan")

    def cameras_all(self):
        cams = []
        for building in self.buildings:
            for floor in building.floors:
                cams.extend(floor.cameras)
        return cams

    @property
    def buildings_count(self) -> int:
        return len(self.buildings)


class BuildingDB(Base):
    __tablename__ = "buildings"

    id = Column(String, primary_key=True, default=lambda: gen_id("bld"))
    branch_id = Column(String, ForeignKey("branches.id"), nullable=False)
    name = Column(String, nullable=False)

    branch = relationship("BranchDB", back_populates="buildings")
    floors = relationship("FloorDB", back_populates="building", cascade="all, delete-orphan")

    @property
    def floors_count(self) -> int:
        return len(self.floors)


class FloorDB(Base):
    __tablename__ = "floors"

    id = Column(String, primary_key=True, default=lambda: gen_id("flr"))
    building_id = Column(String, ForeignKey("buildings.id"), nullable=False)
    floor_number = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    map_url = Column(String, nullable=True)

    building = relationship("BuildingDB", back_populates="floors")
    cameras = relationship("CameraDB", back_populates="floor", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------

class CameraDB(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, default=lambda: gen_id("cam"))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    type = Column(String, default="RTSP")  # RTSP, ONVIF, USB, IP, WEBCAM
    url = Column(String, nullable=False)   # rtsp://..., device index for USB/webcam, etc.
    ip_address = Column(String, nullable=True)

    floor_id = Column(String, ForeignKey("floors.id"), nullable=True)
    location = Column(String, nullable=False, default="Unassigned")
    group = Column(String, default="Main Gate")

    status = Column(String, default="OFFLINE")  # ONLINE, OFFLINE, WARNING - set by health checker, not hardcoded
    fps = Column(Integer, default=0)
    resolution = Column(String, default="unknown")
    bitrate_kbps = Column(Integer, default=0)
    storage_used_gb = Column(Float, default=0.0)
    latency_ms = Column(Integer, default=0)
    last_ping_time = Column(DateTime, nullable=True)

    detection_capabilities = Column(JSON, default=list)  # ["FACE","OBJECT","HELMET",...]
    enable_attendance = Column(Boolean, default=True)
    shift_start_time = Column(String, default="09:00")
    shift_end_time = Column(String, default="17:00")
    created_at = Column(DateTime, default=datetime.utcnow)

    floor = relationship("FloorDB", back_populates="cameras")
    videos = relationship("VideoDB", back_populates="camera")
    snapshots = relationship("SnapshotEventDB", back_populates="camera")
    status_history = relationship("CameraStatusHistoryDB", back_populates="camera", cascade="all, delete-orphan")
    recordings = relationship("CameraRecordingDB", back_populates="camera", cascade="all, delete-orphan")


class CameraStatusHistoryDB(Base):
    __tablename__ = "camera_status_history"

    id = Column(String, primary_key=True, default=lambda: gen_id("csh"))
    camera_id = Column(String, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False)  # ONLINE, OFFLINE, WARNING
    reason = Column(String, nullable=True)   # "Health check success", "Stream started", "Connection lost", etc.
    fps = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow)

    camera = relationship("CameraDB", back_populates="status_history")


class CameraRecordingDB(Base):
    __tablename__ = "camera_recordings"

    id = Column(String, primary_key=True, default=lambda: gen_id("rec"))
    camera_id = Column(String, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    duration_seconds = Column(Float, default=0.0)
    file_size_bytes = Column(Integer, default=0)
    status = Column(String, default="COMPLETED")  # RECORDING, COMPLETED, FAILED
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    camera = relationship("CameraDB", back_populates="recordings")


# ---------------------------------------------------------------------------
# Employees & Faces
# ---------------------------------------------------------------------------

class EmployeeDB(Base):
    __tablename__ = "employees"

    id = Column(String, primary_key=True, default=lambda: gen_id("emp"))
    employee_code = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    department = Column(String, nullable=False)
    role = Column(String, default="Employee")

    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    branch_id = Column(String, ForeignKey("branches.id"), nullable=True)
    building_id = Column(String, ForeignKey("buildings.id"), nullable=True)
    floor_id = Column(String, ForeignKey("floors.id"), nullable=True)

    avatar_url = Column(String, nullable=True)
    status = Column(String, default="ACTIVE")  # ACTIVE, ON_LEAVE, TERMINATED
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("CompanyDB", back_populates="employees")
    face_embeddings = relationship("FaceEmbeddingDB", back_populates="employee", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecordDB", back_populates="employee", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequestDB", back_populates="employee", cascade="all, delete-orphan")


class FaceEmbeddingDB(Base):
    """
    Stores ONE real face embedding vector per row, produced by an actual
    face-recognition model (InsightFace, wired in Phase 1). vector_json holds
    the float array (512-d) as JSON text, l2-normalized before storage.
    """
    __tablename__ = "face_embeddings"

    id = Column(String, primary_key=True, default=lambda: gen_id("fem"))
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    image_url = Column(String, nullable=True)     # stored crop of the face used
    vector_json = Column(Text, nullable=False)     # JSON list[float], length = model dim
    bbox = Column(JSON, nullable=True)             # [x,y,w,h] % of source image
    quality_score = Column(Float, default=0.0)     # detector confidence, not fabricated
    pose_tag = Column(String, default="FRONT")      # FRONT, LEFT, RIGHT, BACK, TILT, OTHER
    sharpness_score = Column(Float, default=0.0)    # Laplacian variance sharpness measurement
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("EmployeeDB", back_populates="face_embeddings")


# ---------------------------------------------------------------------------
# Visitors
# ---------------------------------------------------------------------------

class VisitorDB(Base):
    __tablename__ = "visitors"

    id = Column(String, primary_key=True, default=lambda: gen_id("vis"))
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    company = Column(String, nullable=True)
    host_employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    host_name = Column(String, nullable=True)
    visit_reason = Column(String, nullable=True)
    category = Column(String, default="REGULAR")  # REGULAR, VIP, BLACK_LISTED, UNKNOWN
    pass_number = Column(String, unique=True, nullable=True)
    face_image_url = Column(String, nullable=True)
    badge_status = Column(String, default="ISSUED")  # ISSUED, CHECKED_OUT, EXPIRED, BLOCKED
    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Attendance & Leave
# ---------------------------------------------------------------------------

class AttendanceRecordDB(Base):
    __tablename__ = "attendance_records"

    id = Column(String, primary_key=True, default=lambda: gen_id("att"))
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD

    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    check_in_camera_id = Column(String, ForeignKey("cameras.id"), nullable=True)
    check_out_camera_id = Column(String, ForeignKey("cameras.id"), nullable=True)

    status = Column(String, default="ABSENT")  # PRESENT, LATE, EARLY_LEAVE, ABSENT, ON_LEAVE
    work_duration_hours = Column(Float, default=0.0)
    overtime_hours = Column(Float, default=0.0)
    break_duration_minutes = Column(Integer, default=0)
    verification_method = Column(String, default="FACE_RECOGNITION")  # or MANUAL_OVERRIDE

    employee = relationship("EmployeeDB", back_populates="attendance_records")


class LeaveRequestDB(Base):
    __tablename__ = "leave_requests"

    id = Column(String, primary_key=True, default=lambda: gen_id("lve"))
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    leave_type = Column(String, default="CASUAL")  # SICK, CASUAL, ANNUAL, MATERNITY, UNPAID
    start_date = Column(String, nullable=False)
    end_date = Column(String, nullable=False)
    days = Column(Float, default=1.0)
    reason = Column(String, nullable=True)
    status = Column(String, default="PENDING")  # PENDING, APPROVED, REJECTED
    applied_on = Column(DateTime, default=datetime.utcnow)
    approver_name = Column(String, nullable=True)

    employee = relationship("EmployeeDB", back_populates="leave_requests")


# ---------------------------------------------------------------------------
# Videos, Snapshots, Detected Objects, Alerts
# ---------------------------------------------------------------------------

class VideoDB(Base):
    """An uploaded or recorded video/clip that has been (or will be) analyzed."""
    __tablename__ = "videos"

    id = Column(String, primary_key=True, default=lambda: gen_id("vid"))
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    duration_seconds = Column(Float, default=0.0)
    total_frames = Column(Integer, default=0)
    fps = Column(Float, default=0.0)
    status = Column(String, default="UPLOADED")  # UPLOADED, PROCESSING, DONE, FAILED
    surveillance_profile = Column(String, default="OFFICE")  # OFFICE, TRAFFIC, HOME, INDUSTRIAL
    enable_attendance = Column(Boolean, default=True)
    enable_face_recognition = Column(Boolean, default=True)
    enable_object_detection = Column(Boolean, default=True)
    shift_start_time = Column(String, default="09:00")
    shift_end_time = Column(String, default="17:00")
    processed_frames = Column(Integer, default=0)
    progress_percent = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    camera = relationship("CameraDB", back_populates="videos")
    frames = relationship("VideoFrameDB", back_populates="video", cascade="all, delete-orphan")


class VideoFrameDB(Base):
    """One analyzed keyframe from a video, with its detections attached."""
    __tablename__ = "video_frames"

    id = Column(String, primary_key=True, default=lambda: gen_id("frm"))
    video_id = Column(String, ForeignKey("videos.id"), nullable=False)
    frame_index = Column(Integer, nullable=False)
    timestamp_seconds = Column(Float, nullable=False)
    image_path = Column(String, nullable=True)
    timeline_text = Column(String, nullable=True)  # e.g. "Rahul Entered", "White Car Detected"

    video = relationship("VideoDB", back_populates="frames")
    detected_objects = relationship("DetectedObjectDB", back_populates="frame", cascade="all, delete-orphan")


class DetectedObjectDB(Base):
    """A single YOLO/tracker detection (and optional face match) within a frame."""
    __tablename__ = "detected_objects"

    id = Column(String, primary_key=True, default=lambda: gen_id("obj"))
    frame_id = Column(String, ForeignKey("video_frames.id"), nullable=False)
    tracking_id = Column(String, nullable=True)  # ByteTrack ID, e.g. BYT-1042
    type = Column(String, nullable=False)        # PERSON, CAR, HELMET, ...
    label = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    bbox = Column(JSON, nullable=False)           # [x,y,w,h] % of frame

    face_person_id = Column(String, nullable=True)
    face_person_name = Column(String, nullable=True)
    face_person_type = Column(String, nullable=True)  # EMPLOYEE, VISITOR, UNKNOWN
    face_confidence = Column(Float, nullable=True)

    has_violation = Column(Boolean, default=False)
    violation_type = Column(String, nullable=True)

    frame = relationship("VideoFrameDB", back_populates="detected_objects")


class SnapshotEventDB(Base):
    __tablename__ = "snapshot_events"

    id = Column(String, primary_key=True, default=lambda: gen_id("snp"))
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String, default="OBJECT_DETECTED")
    severity = Column(String, default="INFO")  # CRITICAL, HIGH, MEDIUM, INFO
    image_path = Column(String, nullable=True)
    tracking_id = Column(String, nullable=True)
    recognized_name = Column(String, nullable=True)
    recognized_dept = Column(String, nullable=True)
    confidence = Column(Float, default=0.0)
    bbox = Column(JSON, nullable=True)
    tags = Column(JSON, default=list)
    acknowledged = Column(Boolean, default=False)

    camera = relationship("CameraDB", back_populates="snapshots")


class AlertNotificationDB(Base):
    __tablename__ = "alert_notifications"

    id = Column(String, primary_key=True, default=lambda: gen_id("alt"))
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    severity = Column(String, default="INFO")  # CRITICAL, WARNING, INFO
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=True)
    type = Column(String, nullable=False)  # UNKNOWN_PERSON, BLACKLIST, CAMERA_OFFLINE, ...
    image_path = Column(String, nullable=True)
    channel_sent = Column(JSON, default=list)  # ["EMAIL","PUSH",...]
    read_status = Column(Boolean, default=False)


# ---------------------------------------------------------------------------
# Users / Auth (RBAC) - table only in Phase 0, wired to JWT auth in a later phase
# ---------------------------------------------------------------------------

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: gen_id("usr"))
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="SECURITY_OPERATOR")
    # SUPER_ADMIN, COMPANY_ADMIN, SECURITY_OPERATOR, HR_MANAGER, FACILITY_DIRECTOR
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NotificationSettingsDB(Base):
    """
    ONE row per installation - this install's own WhatsApp/Gmail,
    configured once via setup_notifications.py or PATCH /api/settings/notifications.
    """
    __tablename__ = "notification_settings"

    id = Column(String, primary_key=True, default=lambda: gen_id("cfg"))
    whatsapp_enabled = Column(Boolean, default=False)
    whatsapp_phone = Column(String, nullable=True)
    whatsapp_apikey = Column(String, nullable=True)

    email_enabled = Column(Boolean, default=False)
    email_address = Column(String, nullable=True)
    email_app_password = Column(String, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemSettingsDB(Base):
    """
    Global system settings singleton row persisted in SQLite database.
    Stores the active surveillance mode, active tab view, user UI configurations,
    and global office shift hours for attendance calculation.
    """
    __tablename__ = "system_settings"

    id = Column(String, primary_key=True, default="singleton")
    active_surveillance_mode = Column(String, default="ALL")  # ALL, OFFICE, TRAFFIC, HOME, INDUSTRIAL
    active_tab = Column(String, default="LIVE_MONITORING")
    theme_mode = Column(String, default="dark")
    shift_start_time = Column(String, default="09:00")
    shift_end_time = Column(String, default="17:00")
    late_grace_minutes = Column(Integer, default=15)
    early_leave_grace_minutes = Column(Integer, default=0)
    enable_auto_attendance = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
