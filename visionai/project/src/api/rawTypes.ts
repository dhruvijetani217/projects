/**
 * rawTypes.ts
 * -----------
 * TypeScript mirrors of python_app/schemas.py response models - snake_case,
 * exactly what the FastAPI backend actually returns over the wire.
 */

export interface RawCompany {
  id: string; name: string; code: string; created_at: string;
  branches_count: number; total_cameras: number; total_employees: number;
}

export interface RawBranch {
  id: string; company_id: string; name: string; location: string; buildings_count: number;
}

export interface RawBuilding {
  id: string; branch_id: string; name: string; floors_count: number;
}

export interface RawFloor {
  id: string; building_id: string; floor_number: number; name: string; map_url: string | null;
}

export interface RawCamera {
  id: string; name: string; code: string; type: string; url: string; ip_address: string | null;
  floor_id: string | null; location: string; group: string; status: string; fps: number;
  resolution: string; bitrate_kbps: number; storage_used_gb: number; latency_ms: number;
  last_ping_time: string | null; detection_capabilities: string[]; created_at: string;
}

export interface RawFaceEmbedding {
  id: string; employee_id: string; image_url: string | null; bbox: number[] | null;
  quality_score: number; pose_tag?: string; sharpness_score?: number; created_at: string;
}

export interface RawEmployee {
  id: string; employee_code: string; full_name: string; email: string; department: string;
  role: string; company_id: string | null; branch_id: string | null; building_id: string | null;
  floor_id: string | null; avatar_url: string | null; status: string; created_at: string;
  face_embeddings: RawFaceEmbedding[];
}

export interface RawVisitor {
  id: string; full_name: string; phone: string | null; company: string | null;
  host_employee_id: string | null; host_name: string | null; visit_reason: string | null;
  category: string; pass_number: string | null; face_image_url: string | null;
  badge_status: string; check_in_time: string | null; check_out_time: string | null;
}

export interface RawAttendance {
  id: string; employee_id: string; date: string; check_in_time: string | null;
  check_out_time: string | null; check_in_camera_id: string | null; check_out_camera_id: string | null;
  status: string; work_duration_hours: number; overtime_hours: number;
  break_duration_minutes: number; verification_method: string;
}

export interface RawLeave {
  id: string; employee_id: string; leave_type: string; start_date: string; end_date: string;
  days: number; reason: string | null; status: string; applied_on: string; approver_name: string | null;
}

export interface RawSnapshot {
  id: string; camera_id: string; timestamp: string; event_type: string; severity: string;
  image_path: string | null; tracking_id: string | null; recognized_name: string | null;
  recognized_dept: string | null; confidence: number; bbox: number[] | null; tags: string[];
  acknowledged: boolean;
}

export interface RawAlert {
  id: string; title: string; message: string; timestamp: string; severity: string;
  camera_id: string | null; type: string; image_path: string | null; channel_sent: string[];
  read_status: boolean;
}

export interface RawVideo {
  id: string; camera_id: string | null; filename: string; file_path: string;
  duration_seconds: number; total_frames: number; fps: number; status: string;
  enable_attendance?: boolean; shift_start_time?: string; shift_end_time?: string;
  processed_frames?: number; progress_percent?: number;
  uploaded_at: string; processed_at: string | null;
}

export interface RawDetectedObject {
  id: string; tracking_id: string | null; type: string; label: string; confidence: number;
  bbox: number[]; face_person_id: string | null; face_person_name: string | null;
  face_person_type: string | null; face_confidence: number | null;
}

export interface RawVideoFrame {
  id: string; video_id: string; frame_index: number; timestamp_seconds: number;
  image_path: string | null; timeline_text: string | null; detected_objects: RawDetectedObject[];
}

export interface RawDashboardSummary {
  date: string; total_employees: number; present_today: number; absent_today: number;
  late_today: number; cameras_online: number; cameras_offline: number;
  unknown_visitors_today: number; recent_alerts: RawAlert[];
}

export interface RawIdentifyFaceResult {
  bbox_pct: number[]; det_score: number; person_type: 'EMPLOYEE' | 'UNKNOWN';
  employee_id: string | null; full_name: string; department: string | null; confidence: number | null;
}

export interface RawIdentifyResponse {
  faces_found: number; results: RawIdentifyFaceResult[];
}

export interface RawLiveFrameResponse {
  camera_id: string; timestamp: string;
  objects: { class: string; confidence: number; bbox_pct: number[]; tracking_id: string }[];
  faces: { bbox_pct: number[]; name: string; person_type: string; confidence: number | null }[];
  events_created: { type: string; id: string; event_type: string; name?: string }[];
}
