/**
 * client.ts
 * ---------
 * Every function here hits the real FastAPI backend (python_app/). No mock
 * data, no localStorage fallback - if the backend is down, these throw
 * ApiError and the calling component should show that error, not fabricate
 * a result.
 */

import { apiGet, apiPost, apiPatch, apiDelete, apiPostForm, mediaUrl, API_BASE_URL, ApiError } from './config';
import * as Raw from './rawTypes';
import * as M from './mappers';
import {
  Company, Branch, Building, Floor, Camera, Employee,
  AttendanceRecord, LeaveRequest, SnapshotEvent, AlertNotification, Visitor,
  CameraHealth, CameraRecording, CameraStatusEvent,
} from '../types';

// ---------------------------------------------------------------------------
// Organization hierarchy
// ---------------------------------------------------------------------------

export const getCompanies = async (): Promise<Company[]> =>
  (await apiGet<Raw.RawCompany[]>('/api/companies')).map(M.mapCompany);

export const createCompany = async (name: string, code: string): Promise<Company> =>
  M.mapCompany(await apiPost<Raw.RawCompany>('/api/companies', { name, code }));

export const getBranches = async (companyId?: string): Promise<Branch[]> =>
  (await apiGet<Raw.RawBranch[]>(`/api/branches${companyId ? `?company_id=${companyId}` : ''}`)).map(M.mapBranch);

export const createBranch = async (companyId: string, name: string, location: string): Promise<Branch> =>
  M.mapBranch(await apiPost<Raw.RawBranch>('/api/branches', { company_id: companyId, name, location }));

export const getBuildings = async (branchId?: string): Promise<Building[]> =>
  (await apiGet<Raw.RawBuilding[]>(`/api/buildings${branchId ? `?branch_id=${branchId}` : ''}`)).map(M.mapBuilding);

export const getFloors = async (buildingId?: string): Promise<Floor[]> =>
  (await apiGet<Raw.RawFloor[]>(`/api/floors${buildingId ? `?building_id=${buildingId}` : ''}`)).map(M.mapFloor);

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

export const getCameras = async (): Promise<Camera[]> =>
  (await apiGet<Raw.RawCamera[]>('/api/cameras')).map(M.mapCamera);

export interface CreateCameraInput {
  name: string; code: string; type: Camera['type']; url: string;
  ipAddress?: string; floorId?: string; location: string; group: string;
  detectionCapabilities: string[];
}

export const createCamera = async (input: CreateCameraInput): Promise<Camera> =>
  M.mapCamera(await apiPost<Raw.RawCamera>('/api/cameras', {
    name: input.name, code: input.code, type: input.type, url: input.url,
    ip_address: input.ipAddress || null, floor_id: input.floorId || null,
    location: input.location, group: input.group, detection_capabilities: input.detectionCapabilities,
  }));

export const deleteCamera = async (id: string): Promise<void> => apiDelete(`/api/cameras/${id}`);

export interface TestConnectionResult {
  camera_id: string; status: 'ONLINE' | 'OFFLINE'; resolution: string; fps: number; latency_ms: number;
}

/** Actually opens the camera URL with OpenCV server-side and reports what it really found. */
export const testCameraConnection = async (id: string): Promise<TestConnectionResult> =>
  apiPost<TestConnectionResult>(`/api/cameras/${id}/test-connection`);

export const startCameraStream = async (id: string) =>
  apiPost<{ status: string; camera_id: string }>(`/api/cameras/${id}/stream/start`);

export const stopCameraStream = async (id: string) =>
  apiPost<{ status: string; camera_id: string }>(`/api/cameras/${id}/stream/stop`);

export const getCameraHealth = async (id: string): Promise<CameraHealth> => {
  const raw = await apiGet<any>(`/api/cameras/${id}/health`);
  return {
    cameraId: raw.camera_id,
    cameraName: raw.camera_name,
    cameraCode: raw.camera_code,
    cameraType: raw.camera_type,
    cameraUrl: raw.camera_url,
    location: raw.location,
    group: raw.group,
    status: raw.status,
    uptimePercentage24h: raw.uptime_percentage_24h,
    offlineEvents24h: raw.offline_events_24h,
    fps: raw.fps,
    latencyMs: raw.latency_ms,
    resolution: raw.resolution,
    videoUrl: mediaUrl(raw.video_url || raw.preview_url || (raw.camera_url?.endsWith('.mp4') || raw.camera_url?.startsWith('/media/') ? raw.camera_url : undefined)),
    previewUrl: mediaUrl(raw.preview_url || raw.video_url),
    lastPingTime: raw.last_ping_time,
    recordingActive: raw.recording_active,
    recordingDurationSeconds: raw.recording_duration_seconds,
    currentRecordingFile: raw.current_recording_file ? mediaUrl(raw.current_recording_file) : undefined,
    ptzCapable: raw.ptz_capable,
    ptzInfo: {
      hardwarePtz: raw.ptz_info?.hardware_ptz || false,
      protocol: raw.ptz_info?.protocol || 'RTSP/ONVIF',
      digitalPtz: raw.ptz_info?.digital_ptz ?? true,
      note: raw.ptz_info?.note || 'Digital Pan/Zoom active.',
    },
    recentEvents: (raw.recent_events || []).map((e: any) => ({
      id: e.id,
      cameraId: e.camera_id,
      status: e.status,
      reason: e.reason,
      fps: e.fps,
      latencyMs: e.latency_ms,
      timestamp: e.timestamp,
    })),
  };
};

export const getAllCamerasHealth = async (): Promise<CameraHealth[]> => {
  const rawList = await apiGet<any[]>('/api/cameras/health/all');
  return rawList.map((raw) => ({
    cameraId: raw.camera_id,
    cameraName: raw.camera_name,
    cameraCode: raw.camera_code,
    cameraType: raw.camera_type,
    cameraUrl: raw.camera_url,
    location: raw.location,
    group: raw.group,
    status: raw.status,
    uptimePercentage24h: raw.uptime_percentage_24h,
    offlineEvents24h: raw.offline_events_24h,
    fps: raw.fps,
    latencyMs: raw.latency_ms,
    resolution: raw.resolution,
    videoUrl: mediaUrl(raw.video_url || raw.preview_url || (raw.camera_url?.endsWith('.mp4') || raw.camera_url?.startsWith('/media/') ? raw.camera_url : undefined)),
    previewUrl: mediaUrl(raw.preview_url || raw.video_url),
    lastPingTime: raw.last_ping_time,
    recordingActive: raw.recording_active,
    recordingDurationSeconds: raw.recording_duration_seconds,
    currentRecordingFile: raw.current_recording_file ? mediaUrl(raw.current_recording_file) : undefined,
    ptzCapable: raw.ptz_capable,
    ptzInfo: {
      hardwarePtz: raw.ptz_info?.hardware_ptz || false,
      protocol: raw.ptz_info?.protocol || 'RTSP/ONVIF',
      digitalPtz: raw.ptz_info?.digital_ptz ?? true,
      note: raw.ptz_info?.note || 'Digital Pan/Zoom active.',
    },
    recentEvents: (raw.recent_events || []).map((e: any) => ({
      id: e.id,
      cameraId: e.camera_id,
      status: e.status,
      reason: e.reason,
      fps: e.fps,
      latencyMs: e.latency_ms,
      timestamp: e.timestamp,
    })),
  }));
};

export const startCameraRecording = async (id: string, fps = 20.0): Promise<{ status: string; file_url: string; started_at: string }> =>
  apiPost<{ status: string; file_url: string; started_at: string }>(`/api/cameras/${id}/record/start?fps=${fps}`);

export const stopCameraRecording = async (id: string): Promise<{ status: string; recording: CameraRecording }> => {
  const res = await apiPost<any>(`/api/cameras/${id}/record/stop`);
  return {
    status: res.status,
    recording: {
      id: res.recording_id,
      cameraId: res.camera_id,
      filePath: res.file_url,
      fileUrl: res.file_url,
      durationSeconds: res.duration_seconds,
      fileSizeBytes: res.file_size_bytes,
      status: 'COMPLETED',
      startedAt: res.started_at,
      endedAt: res.ended_at,
    },
  };
};

export const getCameraRecordingStatus = async (id: string): Promise<{ recording_active: boolean; duration_seconds?: number; file_url?: string }> =>
  apiGet<{ recording_active: boolean; duration_seconds?: number; file_url?: string }>(`/api/cameras/${id}/record/status`);

export const getCameraRecordings = async (id: string): Promise<CameraRecording[]> => {
  const list = await apiGet<any[]>(`/api/cameras/${id}/recordings`);
  return list.map((r) => ({
    id: r.id,
    cameraId: r.camera_id,
    filePath: r.file_path,
    fileUrl: r.file_url,
    durationSeconds: r.duration_seconds,
    fileSizeBytes: r.file_size_bytes,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  }));
};

// ---------------------------------------------------------------------------
// Employees & Face Recognition
// ---------------------------------------------------------------------------

export const getEmployees = async (params?: { search?: string; department?: string }): Promise<Employee[]> => {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.department) qs.set('department', params.department);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return (await apiGet<Raw.RawEmployee[]>(`/api/employees${suffix}`)).map(M.mapEmployee);
};

export interface CreateEmployeeInput {
  employeeCode: string; fullName: string; email: string; department: string; role?: string;
}

export const createEmployee = async (input: CreateEmployeeInput): Promise<Employee> =>
  M.mapEmployee(await apiPost<Raw.RawEmployee>('/api/employees', {
    employee_code: input.employeeCode, full_name: input.fullName, email: input.email,
    department: input.department, role: input.role || 'Employee',
  }));

export const deleteEmployee = async (id: string): Promise<void> => apiDelete(`/api/employees/${id}`);

export interface FaceValidationResult {
  valid: boolean;
  message: string;
  sharpness: number;
  clarity_percent: number;
  face_detected: boolean;
  det_score: number;
  face_width: number;
  face_height: number;
  brightness: number;
  pose_tag?: string;
  issues: string[];
}

/** Real-time pre-validation of a face photo against blur, low-light, and face resolution before saving. */
export const validateFacePhoto = async (
  imageBlob: Blob,
  filename = 'face.jpg',
  poseTag = 'FRONT'
): Promise<FaceValidationResult> => {
  const form = new FormData();
  form.append('file', imageBlob, filename);
  form.append('pose_tag', poseTag);
  return apiPostForm<FaceValidationResult>('/api/face-recognition/validate', form);
};

/**
 * Real face enrollment: uploads an actual image (from a file input or a
 * webcam-captured Blob) - the backend runs InsightFace on it for real.
 * Throws ApiError(422, "No face detected...") if the photo has no visible face or is blurry.
 */
export const registerFace = async (
  employeeId: string,
  imageBlob: Blob,
  poseTag: string = 'FRONT',
  filename = 'face.jpg'
) => {
  const form = new FormData();
  form.append('file', imageBlob, filename);
  form.append('pose_tag', poseTag);
  return apiPostForm<Raw.RawFaceEmbedding>(`/api/employees/${employeeId}/faces`, form);
};

export interface MultiAngleEnrollmentItem {
  blob: Blob;
  poseTag: 'FRONT' | 'LEFT' | 'RIGHT' | 'BACK' | 'TILT' | 'OTHER';
  filename?: string;
}

export interface BatchEnrollmentResponse {
  employee_id: string;
  enrolled_count: number;
  enrolled_faces: Array<{
    id: string;
    image_url: string;
    pose_tag: string;
    quality_score: number;
    sharpness: number;
    clarity_percent?: number;
  }>;
  warnings: string[];
}

/** Enrolls multiple multi-angle photos (Front, Left, Right, Back/Tilt) in a single request. */
export const registerMultipleFaces = async (
  employeeId: string,
  items: MultiAngleEnrollmentItem[]
): Promise<BatchEnrollmentResponse> => {
  const form = new FormData();
  items.forEach((item, idx) => {
    form.append('files', item.blob, item.filename || `face_${item.poseTag.toLowerCase()}_${idx}.jpg`);
    form.append('pose_tags', item.poseTag);
  });
  return apiPostForm<BatchEnrollmentResponse>(`/api/employees/${employeeId}/faces/batch`, form);
};

export const deleteFace = async (employeeId: string, embeddingId: string): Promise<void> =>
  apiDelete(`/api/employees/${employeeId}/faces/${embeddingId}`);

/** Real identification: every face in the image matched against real enrolled employees. */
export const identifyFaces = async (imageBlob: Blob, filename = 'frame.jpg'): Promise<Raw.RawIdentifyResponse> => {
  const form = new FormData();
  form.append('file', imageBlob, filename);
  return apiPostForm<Raw.RawIdentifyResponse>('/api/face-recognition/identify', form);
};

// ---------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------

export const getVisitors = async (category?: string): Promise<Visitor[]> =>
  (await apiGet<Raw.RawVisitor[]>(`/api/visitors${category ? `?category=${category}` : ''}`)).map(M.mapVisitor);

export interface CreateVisitorInput {
  fullName: string; phone?: string; company?: string; hostEmployeeId?: string;
  hostName?: string; visitReason?: string; category?: Visitor['category'];
}

export const createVisitor = async (input: CreateVisitorInput): Promise<Visitor> =>
  M.mapVisitor(await apiPost<Raw.RawVisitor>('/api/visitors', {
    full_name: input.fullName, phone: input.phone, company: input.company,
    host_employee_id: input.hostEmployeeId, host_name: input.hostName,
    visit_reason: input.visitReason, category: input.category || 'REGULAR',
  }));

export const checkoutVisitor = async (id: string): Promise<Visitor> =>
  M.mapVisitor(await apiPost<Raw.RawVisitor>(`/api/visitors/${id}/checkout`));

// ---------------------------------------------------------------------------
// Attendance & Leave
// ---------------------------------------------------------------------------

export const getAttendance = async (
  employeesById: Map<string, Employee>, params?: { employeeId?: string; date?: string }
): Promise<AttendanceRecord[]> => {
  const qs = new URLSearchParams();
  if (params?.employeeId) qs.set('employee_id', params.employeeId);
  if (params?.date) qs.set('date', params.date);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const raw = await apiGet<Raw.RawAttendance[]>(`/api/attendance${suffix}`);
  return raw.map((r) => M.mapAttendance(r, employeesById.get(r.employee_id)));
};

export const recordManualAttendance = async (input: {
  employeeId: string; date: string; checkInTime?: string; checkOutTime?: string; status?: string;
}): Promise<Raw.RawAttendance> =>
  apiPost<Raw.RawAttendance>('/api/attendance/manual', {
    employee_id: input.employeeId, date: input.date,
    check_in_time: input.checkInTime, check_out_time: input.checkOutTime,
    status: input.status || 'PRESENT',
  });

export interface LiveActiveEmployee {
  employee_id: string;
  name: string;
  camera_id: string;
  last_seen: string;
}

export const getLiveActiveEmployees = async (): Promise<LiveActiveEmployee[]> =>
  apiGet<LiveActiveEmployee[]>('/api/attendance/live-active');

export const getLeaves = async (employeesById: Map<string, Employee>): Promise<LeaveRequest[]> => {
  const raw = await apiGet<Raw.RawLeave[]>('/api/leaves');
  return raw.map((r) => M.mapLeave(r, employeesById.get(r.employee_id)?.fullName));
};

export const applyLeave = async (input: {
  employeeId: string; leaveType: string; startDate: string; endDate: string; days: number; reason?: string;
}): Promise<Raw.RawLeave> =>
  apiPost<Raw.RawLeave>('/api/leaves', {
    employee_id: input.employeeId, leave_type: input.leaveType,
    start_date: input.startDate, end_date: input.endDate, days: input.days, reason: input.reason,
  });

export const decideLeave = async (leaveId: string, status: 'APPROVED' | 'REJECTED', approverName: string) =>
  apiPatch<Raw.RawLeave>(`/api/leaves/${leaveId}/decision`, { status, approver_name: approverName });

// ---------------------------------------------------------------------------
// Snapshots & Alerts
// ---------------------------------------------------------------------------

export const getSnapshots = async (camerasById: Map<string, Camera>, cameraId?: string): Promise<SnapshotEvent[]> => {
  const raw = await apiGet<Raw.RawSnapshot[]>(`/api/snapshots${cameraId ? `?camera_id=${cameraId}` : ''}`);
  return raw.map((r) => M.mapSnapshot(r, camerasById.get(r.camera_id)?.name));
};

export const acknowledgeSnapshot = async (id: string): Promise<void> => {
  await apiPost(`/api/snapshots/${id}/acknowledge`);
};

export const getAlerts = async (camerasById: Map<string, Camera>): Promise<AlertNotification[]> => {
  const raw = await apiGet<Raw.RawAlert[]>('/api/alerts');
  return raw.map((r) => M.mapAlert(r, r.camera_id ? camerasById.get(r.camera_id)?.name : undefined));
};

export const markAlertRead = async (id: string): Promise<void> => {
  await apiPost(`/api/alerts/${id}/read`);
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const getDashboardSummary = async (): Promise<Raw.RawDashboardSummary> =>
  apiGet<Raw.RawDashboardSummary>('/api/dashboard/summary');

export interface AnalyticsSummary {
  total_videos: number;
  total_frames: number;
  total_objects: number;
  total_cameras: number;
  cameras_online: number;
  total_employees: number;
  total_snapshots: number;
  total_alerts: number;
  avg_confidence: number;
  detection_breakdown: { name: string; count: number; color: string }[];
  attendance_trend: { time: string; present: number; late: number }[];
  hourly_alerts: { hour: string; alerts: number }[];
}

export const getAnalyticsSummary = async (): Promise<AnalyticsSummary> =>
  apiGet<AnalyticsSummary>('/api/dashboard/analytics');

// ---------------------------------------------------------------------------
// AI Video Search (real keyword matching over real snapshots - see
// python_app/routers/search.py docstring for exactly what this does and
// doesn't do yet)
// ---------------------------------------------------------------------------

export interface SearchResponse {
  query: string;
  matched_employee_names: string[];
  results: Raw.RawSnapshot[];
}

export const searchVideoEvents = async (query: string): Promise<SearchResponse> =>
  apiPost<SearchResponse>('/api/search', { query });

// ---------------------------------------------------------------------------
// Video Processing (offline testing mode)
// ---------------------------------------------------------------------------

export const uploadVideo = async (
  file: File,
  cameraId?: string,
  surveillanceProfile: string = "OFFICE",
  enableAttendance: boolean = true,
  enableFaceRecognition: boolean = true,
  enableObjectDetection: boolean = true,
  shiftStartTime: string = "09:00",
  shiftEndTime: string = "17:00"
): Promise<Raw.RawVideo> => {
  const form = new FormData();
  form.append('file', file);
  let url = `/api/videos?surveillance_profile=${encodeURIComponent(surveillanceProfile)}&enable_attendance=${enableAttendance}&enable_face_recognition=${enableFaceRecognition}&enable_object_detection=${enableObjectDetection}&shift_start_time=${encodeURIComponent(shiftStartTime)}&shift_end_time=${encodeURIComponent(shiftEndTime)}`;
  if (cameraId) url += `&camera_id=${encodeURIComponent(cameraId)}`;
  return apiPostForm<Raw.RawVideo>(url, form);
};

/** All previously uploaded/processed videos - real DB rows, survives page refresh. */
export const getVideos = async (): Promise<Raw.RawVideo[]> => apiGet<Raw.RawVideo[]>('/api/videos');

export const getVideo = async (id: string): Promise<Raw.RawVideo> => apiGet<Raw.RawVideo>(`/api/videos/${id}`);

export const getVideoTimeline = async (id: string): Promise<Raw.RawVideoFrame[]> =>
  apiGet<Raw.RawVideoFrame[]>(`/api/videos/${id}/timeline`);

/**
 * Real Video Clip Export: requests the backend to cut a short subclip around an event timestamp
 * using ffmpeg and downloads the resulting MP4 file.
 */
export const exportVideoClip = async (
  videoId: string,
  startSeconds: number,
  endSeconds: number,
  suggestedFilename?: string
): Promise<void> => {
  const url = `${API_BASE_URL}/api/videos/${videoId}/export-clip?start_seconds=${startSeconds}&end_seconds=${endSeconds}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    let errMessage = 'Clip export failed';
    try {
      const body = await res.json();
      if (body.detail) errMessage = body.detail;
    } catch {
      errMessage = `Clip export failed (${res.status} ${res.statusText})`;
    }
    throw new ApiError(res.status, errMessage);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = suggestedFilename || `clip_${videoId.slice(0, 8)}_${Math.round(startSeconds)}s-${Math.round(endSeconds)}s.mp4`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(blobUrl);
  document.body.removeChild(a);
};

/**
 * Downloads the complete original recorded/uploaded video file.
 */
export const downloadFullVideo = async (videoId: string, suggestedFilename?: string): Promise<void> => {
  const url = `${API_BASE_URL}/api/videos/${videoId}/download`;
  const res = await fetch(url);
  if (!res.ok) {
    let errMessage = 'Full video download failed';
    try {
      const body = await res.json();
      if (body.detail) errMessage = body.detail;
    } catch {
      errMessage = `Download failed (${res.status} ${res.statusText})`;
    }
    throw new ApiError(res.status, errMessage);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = suggestedFilename || `video_${videoId.slice(0, 8)}.mp4`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(blobUrl);
  document.body.removeChild(a);
};

/** The backend mounts its whole storage/ dir at /media, so a file_path like
 *  ".../python_app/storage/uploads/x.mp4" is playable at "/media/uploads/x.mp4". */
export const videoPlaybackUrl = (video: Raw.RawVideo): string | null => {
  const marker = '/storage/';
  const idx = video.file_path.indexOf(marker);
  if (idx === -1) return null;
  const suffix = video.file_path.slice(idx + marker.length); // e.g. "uploads/abc.mp4"
  return mediaUrl(`/media/${suffix}`) || null;
};

// ---------------------------------------------------------------------------
// Live Camera / Webcam
// ---------------------------------------------------------------------------

/** Sends one frame (e.g. a webcam capture) for real, immediate AI analysis. */
export const analyzeSingleFrame = async (cameraId: string, imageBlob: Blob): Promise<Raw.RawLiveFrameResponse> => {
  const form = new FormData();
  form.append('file', imageBlob, 'frame.jpg');
  return apiPostForm<Raw.RawLiveFrameResponse>(`/api/live/frame/${cameraId}?record_attendance=true`, form);
};

/** Opens ws://.../ws/live/{cameraId} - the caller owns the connection lifecycle. */
export function connectLiveFeed(cameraId: string, apiBaseUrl: string): WebSocket {
  const wsUrl = apiBaseUrl.replace(/^http/, 'ws');
  return new WebSocket(`${wsUrl}/ws/live/${cameraId}`);
}

// ---------------------------------------------------------------------------
// Notification Settings (WhatsApp / Email) - real per-install config,
// backed by python_app/routers/settings.py + notification_settings table.
// ---------------------------------------------------------------------------

export interface NotificationSettings {
  id: string;
  whatsappEnabled: boolean;
  whatsappPhone: string | null;
  emailEnabled: boolean;
  emailAddress: string | null;
  updatedAt: string;
}

interface RawNotificationSettings {
  id: string;
  whatsapp_enabled: boolean;
  whatsapp_phone: string | null;
  email_enabled: boolean;
  email_address: string | null;
  updated_at: string;
}

const mapNotificationSettings = (r: RawNotificationSettings): NotificationSettings => ({
  id: r.id,
  whatsappEnabled: r.whatsapp_enabled,
  whatsappPhone: r.whatsapp_phone,
  emailEnabled: r.email_enabled,
  emailAddress: r.email_address,
  updatedAt: r.updated_at,
});

export const getNotificationSettings = async (): Promise<NotificationSettings> =>
  mapNotificationSettings(await apiGet<RawNotificationSettings>('/api/settings/notifications'));

export interface UpdateNotificationSettingsInput {
  whatsappEnabled?: boolean;
  whatsappPhone?: string;
  whatsappApikey?: string;
  emailEnabled?: boolean;
  emailAddress?: string;
  emailAppPassword?: string;
}

export const updateNotificationSettings = async (
  input: UpdateNotificationSettingsInput
): Promise<NotificationSettings> =>
  mapNotificationSettings(await apiPatch<RawNotificationSettings>('/api/settings/notifications', {
    whatsapp_enabled: input.whatsappEnabled,
    whatsapp_phone: input.whatsappPhone,
    whatsapp_apikey: input.whatsappApikey,
    email_enabled: input.emailEnabled,
    email_address: input.emailAddress,
    email_app_password: input.emailAppPassword,
  }));

export const testNotifications = async (): Promise<{ whatsapp_sent: boolean; email_sent: boolean }> =>
  apiPost<{ whatsapp_sent: boolean; email_sent: boolean }>('/api/settings/notifications/test');

// ---------------------------------------------------------------------------
// Delete features (videos, snapshots) - real delete: removes the DB row AND
// the actual file on disk. Bulk delete requires at least one filter or
// all=true (server-side safety rule - see python_app/routers/*.py).
// ---------------------------------------------------------------------------

export interface BulkDeleteResult {
  status: string;
  count: number;
}

export const deleteVideo = async (id: string): Promise<void> => {
  await apiDelete(`/api/videos/${id}`);
};

export const bulkDeleteVideos = async (params: {
  beforeDate?: string; afterDate?: string; all?: boolean;
}): Promise<BulkDeleteResult> => {
  const qs = new URLSearchParams();
  if (params.beforeDate) qs.set('before_date', params.beforeDate);
  if (params.afterDate) qs.set('after_date', params.afterDate);
  if (params.all) qs.set('all', 'true');
  return apiDelete<BulkDeleteResult>(`/api/videos?${qs.toString()}`);
};

export const deleteSnapshot = async (id: string): Promise<void> => {
  await apiDelete(`/api/snapshots/${id}`);
};

export const deleteAttendanceRecord = async (id: string): Promise<void> => {
  await apiDelete(`/api/attendance/${id}`);
};

export const deleteAlert = async (id: string): Promise<void> => {
  await apiDelete(`/api/alerts/${id}`);
};

export const bulkDeleteSnapshots = async (params: {
  beforeDate?: string; afterDate?: string; cameraId?: string; all?: boolean;
}): Promise<BulkDeleteResult> => {
  const qs = new URLSearchParams();
  if (params.beforeDate) qs.set('before_date', params.beforeDate);
  if (params.afterDate) qs.set('after_date', params.afterDate);
  if (params.cameraId) qs.set('camera_id', params.cameraId);
  if (params.all) qs.set('all', 'true');
  return apiDelete<BulkDeleteResult>(`/api/snapshots?${qs.toString()}`);
};

export const bulkDeleteAlerts = async (params: {
  beforeDate?: string; afterDate?: string; all?: boolean;
}): Promise<BulkDeleteResult> => {
  const qs = new URLSearchParams();
  if (params.beforeDate) qs.set('before_date', params.beforeDate);
  if (params.afterDate) qs.set('after_date', params.afterDate);
  if (params.all) qs.set('all', 'true');
  return apiDelete<BulkDeleteResult>(`/api/alerts?${qs.toString()}`);
};

// ---------------------------------------------------------------------------
// System & UI Domain Settings (Database Persisted)
// ---------------------------------------------------------------------------

export interface RawSystemSettings {
  id: string;
  active_surveillance_mode: 'ALL' | 'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL';
  active_tab: string;
  theme_mode: string;
  shift_start_time?: string;
  shift_end_time?: string;
  late_grace_minutes?: number;
  early_leave_grace_minutes?: number;
  enable_auto_attendance?: boolean;
  updated_at: string;
}

export interface AttendancePolicy {
  shift_start_time: string;
  shift_end_time: string;
  late_grace_minutes: number;
  early_leave_grace_minutes: number;
  enabled: boolean;
}

export const getSystemSettings = async (): Promise<RawSystemSettings> =>
  apiGet<RawSystemSettings>('/api/settings/system');

export const updateSystemSettings = async (
  data: Partial<{
    active_surveillance_mode: 'ALL' | 'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL';
    active_tab: string;
    theme_mode: string;
    shift_start_time: string;
    shift_end_time: string;
    late_grace_minutes: number;
    early_leave_grace_minutes: number;
    enable_auto_attendance: boolean;
  }>
): Promise<RawSystemSettings> =>
  apiPatch<RawSystemSettings>('/api/settings/system', data);

export const getAttendancePolicy = async (): Promise<AttendancePolicy> =>
  apiGet<AttendancePolicy>('/api/settings/attendance-policy');

export const updateAttendancePolicy = async (
  data: Partial<AttendancePolicy>
): Promise<AttendancePolicy> =>
  apiPatch<AttendancePolicy>('/api/settings/attendance-policy', data);

export interface AttendanceTimeSummary {
  employee_id: string;
  employee_name: string;
  period: string;
  range_start: string;
  range_end: string;
  total_hours: number;
  present_days: number;
  late_days: number;
  absent_days: number;
  tracked_days: number;
  punctuality_percent: number;
  most_used_camera: string | null;
  camera_breakdown: Array<{ camera_id: string; camera_name: string; hours: number }>;
  breakdown: Array<{ date: string; hours: number }>;
  presence_gap_merge_seconds: number;
}

export const getAttendanceTimeSummary = async (
  employeeId: string,
  period: 'day' | 'week' | 'month' | 'year',
  refDate?: string
): Promise<AttendanceTimeSummary> =>
  apiGet<AttendanceTimeSummary>(
    `/api/attendance/summary?employee_id=${employeeId}&period=${period}${refDate ? `&ref_date=${refDate}` : ''}`
  );