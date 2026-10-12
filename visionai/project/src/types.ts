export type TenantRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'SECURITY_OPERATOR' | 'HR_MANAGER' | 'FACILITY_DIRECTOR';

export interface Company {
  id: string;
  name: string;
  code: string;
  branchesCount: number;
  totalCameras: number;
  totalEmployees: number;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  location: string;
  buildingsCount: number;
}

export interface Building {
  id: string;
  branchId: string;
  name: string;
  floorsCount: number;
}

export interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  mapUrl?: string;
}

export interface Camera {
  id: string;
  name: string;
  code: string;
  type: 'RTSP' | 'ONVIF' | 'USB' | 'IP' | 'WEBCAM';
  url: string;
  ipAddress: string;
  location: string;
  branchId: string;
  buildingId: string;
  floorId: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  fps: number;
  resolution: string;
  bitrateKbps: number;
  storageUsedGb: number;
  latencyMs: number;
  group: 'Main Gate' | 'Perimeter' | 'Office Floor' | 'Parking' | 'Factory Floor' | 'Restricted Area';
  lastPingTime: string;
  detectionCapabilities: Array<'FACE' | 'OBJECT' | 'HELMET' | 'FIRE' | 'LICENSE_PLATE' | 'LOITERING'>;
}

export type PoseTag = 'FRONT' | 'LEFT' | 'RIGHT' | 'BACK' | 'TILT' | 'OTHER';

export interface FaceEmbedding {
  id: string;
  employeeId: string;
  imageUrl: string;
  vector: number[];
  bbox: [number, number, number, number]; // [x, y, width, height] in percentage
  qualityScore: number;
  poseTag?: PoseTag;
  sharpnessScore?: number;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  role: string;
  branchId: string;
  buildingId: string;
  floorId: string;
  faceEmbeddings: FaceEmbedding[];
  avatarUrl: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  createdAt: string;
}

export interface Visitor {
  id: string;
  fullName: string;
  phone: string;
  company: string;
  hostEmployeeId: string;
  hostName: string;
  visitReason: string;
  category: 'REGULAR' | 'VIP' | 'BLACK_LISTED' | 'UNKNOWN';
  passNumber: string;
  faceImageUrl?: string;
  badgeStatus: 'ISSUED' | 'CHECKED_OUT' | 'EXPIRED' | 'BLOCKED';
  checkInTime?: string;
  checkOutTime?: string;
}

export interface DetectedObject {
  id: string;
  trackingId: string; // ByteTrack ID e.g., TRK-1042
  type: 'PERSON' | 'CAR' | 'BIKE' | 'TRUCK' | 'BUS' | 'HELMET' | 'BAG' | 'LAPTOP' | 'PHONE' | 'DOG' | 'CAT' | 'FIRE' | 'SMOKE' | 'LICENSE_PLATE';
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h] %
  faceRecognized?: {
    personId: string;
    personName: string;
    personType: 'EMPLOYEE' | 'VISITOR' | 'UNKNOWN';
    department?: string;
    confidence: number;
  };
  hasViolation?: boolean;
  violationType?: 'NO_HELMET' | 'RESTRICTED_ACCESS' | 'LOITERING' | 'SPEEDING' | 'FIRE_HAZARD';
}

export interface VideoFrameSample {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  timeSeconds: number;
  imageUrl: string;
  detectedObjects: DetectedObject[];
  timelineText: string;
}

export interface SnapshotEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  eventType: 'UNKNOWN_PERSON' | 'KNOWN_EMPLOYEE' | 'VEHICLE_DETECTED' | 'HELMET_VIOLATION' | 'RESTRICTED_AREA' | 'FIRE_ALERT' | 'LOITERING' | 'SUSPICIOUS_BEHAVIOR';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  imageUrl: string;
  trackingId: string;
  recognizedName?: string;
  recognizedDept?: string;
  confidence: number;
  bbox: [number, number, number, number];
  tags: string[];
  acknowledged: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  checkInCamera: string;
  checkOutCamera?: string;
  status: 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'ON_LEAVE';
  workDurationHours: number;
  overtimeHours: number;
  breakDurationMinutes: number;
  verificationMethod: 'FACE_RECOGNITION' | 'MANUAL_OVERRIDE';
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: 'SICK' | 'CASUAL' | 'ANNUAL' | 'MATERNITY' | 'UNPAID';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedOn: string;
  approverName?: string;
}

export interface AlertNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  cameraName: string;
  type: 'UNKNOWN_PERSON' | 'BLACKLIST' | 'CAMERA_OFFLINE' | 'NO_HELMET' | 'LOITERING' | 'RESTRICTED_AREA' | 'CROWD' | 'FIRE';
  imageUrl?: string;
  channelSent: ('EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK')[];
  readStatus: boolean;
}

export interface AISearchResult {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  confidence: number;
  thumbnailUrl: string;
  clipUrl?: string;
  detectedName?: string;
  trackingId: string;
  matchReason: string;
  snapshotId: string;
}

export interface ArchitectureDocItem {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  category: 'System Design' | 'Data Architecture' | 'API & Protocol' | 'DevOps & Pipeline';
  contentMarkdown: string;
}

export interface CameraStatusEvent {
  id: string;
  cameraId: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  reason?: string;
  fps: number;
  latencyMs: number;
  timestamp: string;
}

export interface CameraRecording {
  id: string;
  cameraId: string;
  filePath: string;
  fileUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
  status: string;
  startedAt: string;
  endedAt?: string;
}

export interface CameraHealth {
  cameraId: string;
  cameraName: string;
  cameraCode: string;
  cameraType: string;
  cameraUrl: string;
  location: string;
  group: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  uptimePercentage24h: number;
  offlineEvents24h: number;
  fps: number;
  latencyMs: number;
  resolution: string;
  videoUrl?: string;
  previewUrl?: string;
  lastPingTime?: string;
  recordingActive: boolean;
  recordingDurationSeconds: number;
  currentRecordingFile?: string;
  ptzCapable: boolean;
  ptzInfo: {
    hardwarePtz: boolean;
    protocol: string;
    digitalPtz: boolean;
    note: string;
  };
  recentEvents: CameraStatusEvent[];
}

export interface SystemSettings {
  id: string;
  activeSurveillanceMode: 'ALL' | 'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL';
  activeTab: string;
  themeMode: string;
  updatedAt: string;
}

