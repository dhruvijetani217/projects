"""
schemas.py
----------
Pydantic v2 schemas: one Create + one Read model per entity.
Read models use from_attributes=True so they serialize directly off the
SQLAlchemy ORM objects returned by crud.py - nothing here is faked or mocked.
"""

from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Organization hierarchy
# ---------------------------------------------------------------------------

class CompanyCreate(BaseModel):
    name: str
    code: str


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    code: str
    created_at: datetime
    branches_count: int
    total_cameras: int
    total_employees: int


class BranchCreate(BaseModel):
    company_id: str
    name: str
    location: str


class BranchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    company_id: str
    name: str
    location: str
    buildings_count: int


class BuildingCreate(BaseModel):
    branch_id: str
    name: str


class BuildingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    branch_id: str
    name: str
    floors_count: int


class FloorCreate(BaseModel):
    building_id: str
    floor_number: int
    name: str
    map_url: Optional[str] = None


class FloorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    building_id: str
    floor_number: int
    name: str
    map_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------

class CameraCreate(BaseModel):
    name: str
    code: str
    type: str = Field(default="RTSP", pattern="^(RTSP|ONVIF|USB|IP|WEBCAM)$")
    url: str
    ip_address: Optional[str] = None
    floor_id: Optional[str] = None
    location: str = "Unassigned"
    group: str = "Main Gate"
    detection_capabilities: List[str] = []
    enable_attendance: bool = True
    shift_start_time: str = "09:00"
    shift_end_time: str = "17:00"


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    group: Optional[str] = None
    detection_capabilities: Optional[List[str]] = None
    enable_attendance: Optional[bool] = None
    shift_start_time: Optional[str] = None
    shift_end_time: Optional[str] = None


class CameraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    code: str
    type: str
    url: str
    ip_address: Optional[str] = None
    floor_id: Optional[str] = None
    location: str
    group: str
    status: str
    fps: int
    resolution: str
    bitrate_kbps: int
    storage_used_gb: float
    latency_ms: int
    last_ping_time: Optional[datetime] = None
    detection_capabilities: List[str] = []
    enable_attendance: bool = True
    shift_start_time: str = "09:00"
    shift_end_time: str = "17:00"
    created_at: datetime


class CameraStatusHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    camera_id: str
    status: str
    reason: Optional[str] = None
    fps: int = 0
    latency_ms: int = 0
    timestamp: datetime


class CameraRecordingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    camera_id: str
    file_path: str
    file_url: str
    duration_seconds: float
    file_size_bytes: int
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None


class CameraHealthRead(BaseModel):
    camera_id: str
    camera_name: str
    camera_code: str
    camera_type: str
    camera_url: str
    location: str
    group: str
    status: str
    uptime_percentage_24h: float
    offline_events_24h: int
    fps: int
    latency_ms: int
    resolution: str
    video_url: Optional[str] = None
    preview_url: Optional[str] = None
    last_ping_time: Optional[datetime] = None
    recording_active: bool = False
    recording_duration_seconds: float = 0.0
    current_recording_file: Optional[str] = None
    ptz_capable: bool = False
    ptz_info: dict = Field(default_factory=dict)
    recent_events: List[CameraStatusHistoryRead] = []



# ---------------------------------------------------------------------------
# Employees & Faces
# ---------------------------------------------------------------------------

class EmployeeCreate(BaseModel):
    employee_code: str
    full_name: str
    email: EmailStr
    department: str
    role: str = "Employee"
    company_id: Optional[str] = None
    branch_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    department: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class FaceEmbeddingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_id: str
    image_url: Optional[str] = None
    bbox: Optional[List[float]] = None
    quality_score: float
    pose_tag: Optional[str] = "FRONT"
    sharpness_score: Optional[float] = 0.0
    created_at: datetime


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_code: str
    full_name: str
    email: str
    department: str
    role: str
    company_id: Optional[str] = None
    branch_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str
    created_at: datetime
    face_embeddings: List[FaceEmbeddingRead] = []


# ---------------------------------------------------------------------------
# Visitors
# ---------------------------------------------------------------------------

class VisitorCreate(BaseModel):
    full_name: str
    phone: Optional[str] = None
    company: Optional[str] = None
    host_employee_id: Optional[str] = None
    host_name: Optional[str] = None
    visit_reason: Optional[str] = None
    category: str = "REGULAR"


class VisitorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    full_name: str
    phone: Optional[str] = None
    company: Optional[str] = None
    host_employee_id: Optional[str] = None
    host_name: Optional[str] = None
    visit_reason: Optional[str] = None
    category: str
    pass_number: Optional[str] = None
    face_image_url: Optional[str] = None
    badge_status: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Attendance & Leave
# ---------------------------------------------------------------------------

class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_id: str
    date: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    check_in_camera_id: Optional[str] = None
    check_out_camera_id: Optional[str] = None
    status: str
    work_duration_hours: float
    overtime_hours: float
    break_duration_minutes: int
    verification_method: str


class AttendanceManualCreate(BaseModel):
    """For MANUAL_OVERRIDE check-in/out done by an HR admin, not face recognition."""
    employee_id: str
    date: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    status: str = "PRESENT"


class LeaveCreate(BaseModel):
    employee_id: str
    leave_type: str = "CASUAL"
    start_date: str
    end_date: str
    days: float
    reason: Optional[str] = None


class LeaveDecision(BaseModel):
    status: str  # APPROVED or REJECTED
    approver_name: str


class LeaveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_id: str
    leave_type: str
    start_date: str
    end_date: str
    days: float
    reason: Optional[str] = None
    status: str
    applied_on: datetime
    approver_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Snapshots & Alerts
# ---------------------------------------------------------------------------

class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    camera_id: str
    timestamp: datetime
    event_type: str
    severity: str
    image_path: Optional[str] = None
    tracking_id: Optional[str] = None
    recognized_name: Optional[str] = None
    recognized_dept: Optional[str] = None
    confidence: float
    bbox: Optional[List[float]] = None
    tags: List[str] = []
    acknowledged: bool


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    message: str
    timestamp: datetime
    severity: str
    camera_id: Optional[str] = None
    type: str
    image_path: Optional[str] = None
    channel_sent: List[str] = []
    read_status: bool


# ---------------------------------------------------------------------------
# Videos
# ---------------------------------------------------------------------------

class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    camera_id: Optional[str] = None
    filename: str
    file_path: str
    duration_seconds: float
    total_frames: int
    fps: float
    status: str
    surveillance_profile: str = "OFFICE"
    enable_attendance: bool = True
    enable_face_recognition: bool = True
    enable_object_detection: bool = True
    shift_start_time: str = "09:00"
    shift_end_time: str = "17:00"
    processed_frames: int = 0
    progress_percent: int = 0
    uploaded_at: datetime
    processed_at: Optional[datetime] = None


class DetectedObjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tracking_id: Optional[str] = None
    type: str
    label: str
    confidence: float
    bbox: List[float]
    face_person_id: Optional[str] = None
    face_person_name: Optional[str] = None
    face_person_type: Optional[str] = None
    face_confidence: Optional[float] = None


class VideoFrameRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    video_id: str
    frame_index: int
    timestamp_seconds: float
    image_path: Optional[str] = None
    timeline_text: Optional[str] = None
    detected_objects: List[DetectedObjectRead] = []


# ---------------------------------------------------------------------------
# Notification Settings (WhatsApp / Email)
# ---------------------------------------------------------------------------

class NotificationSettingsUpdate(BaseModel):
    whatsapp_enabled: Optional[bool] = None
    whatsapp_phone: Optional[str] = None
    whatsapp_apikey: Optional[str] = None
    email_enabled: Optional[bool] = None
    email_address: Optional[str] = None
    email_app_password: Optional[str] = None


class NotificationSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    whatsapp_enabled: bool
    whatsapp_phone: Optional[str] = None
    email_enabled: bool
    email_address: Optional[str] = None
    updated_at: datetime


class SystemSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    active_surveillance_mode: str = "ALL"
    active_tab: str = "LIVE_MONITORING"
    theme_mode: str = "dark"
    shift_start_time: str = "09:00"
    shift_end_time: str = "17:00"
    late_grace_minutes: int = 15
    early_leave_grace_minutes: int = 0
    enable_auto_attendance: bool = True
    updated_at: datetime


class SystemSettingsUpdate(BaseModel):
    active_surveillance_mode: Optional[str] = None
    active_tab: Optional[str] = None
    theme_mode: Optional[str] = None
    shift_start_time: Optional[str] = None
    shift_end_time: Optional[str] = None
    late_grace_minutes: Optional[int] = None
    early_leave_grace_minutes: Optional[int] = None
    enable_auto_attendance: Optional[bool] = None


class AttendancePolicyRead(BaseModel):
    shift_start_time: str = "09:00"
    shift_end_time: str = "17:00"
    late_grace_minutes: int = 15
    early_leave_grace_minutes: int = 0
    enabled: bool = True


class AttendancePolicyUpdate(BaseModel):
    shift_start_time: Optional[str] = None
    shift_end_time: Optional[str] = None
    late_grace_minutes: Optional[int] = None
    early_leave_grace_minutes: Optional[int] = None
    enabled: Optional[bool] = None
