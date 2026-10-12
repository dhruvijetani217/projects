/**
 * mappers.ts
 * ----------
 * Converts real backend responses (snake_case, python_app/schemas.py) into
 * the frontend's existing camelCase types (src/types.ts) so every component
 * that already renders these shapes keeps working unmodified.
 */

import {
  Company, Branch, Building, Floor, Camera, Employee, FaceEmbedding, Visitor,
  AttendanceRecord, LeaveRequest, SnapshotEvent, AlertNotification,
} from '../types';
import * as Raw from './rawTypes';
import { mediaUrl } from './config';

export function mapCompany(r: Raw.RawCompany): Company {
  return {
    id: r.id, name: r.name, code: r.code,
    branchesCount: r.branches_count, totalCameras: r.total_cameras, totalEmployees: r.total_employees,
  };
}

export function mapBranch(r: Raw.RawBranch): Branch {
  return { id: r.id, companyId: r.company_id, name: r.name, location: r.location, buildingsCount: r.buildings_count };
}

export function mapBuilding(r: Raw.RawBuilding): Building {
  return { id: r.id, branchId: r.branch_id, name: r.name, floorsCount: r.floors_count };
}

export function mapFloor(r: Raw.RawFloor): Floor {
  return { id: r.id, buildingId: r.building_id, floorNumber: r.floor_number, name: r.name, mapUrl: r.map_url || undefined };
}

export function mapCamera(r: Raw.RawCamera): Camera {
  return {
    id: r.id, name: r.name, code: r.code, type: r.type as Camera['type'], url: r.url,
    ipAddress: r.ip_address || '',
    location: r.location,
    // NOTE: the backend links cameras to a floor (floor_id), not directly to branch/building.
    // Those aren't resolved here to keep this mapping a pure 1:1 conversion - join through
    // GET /api/floors and /api/buildings if a component needs the full hierarchy path.
    branchId: '', buildingId: '', floorId: r.floor_id || '',
    status: r.status as Camera['status'], fps: r.fps, resolution: r.resolution,
    bitrateKbps: r.bitrate_kbps, storageUsedGb: r.storage_used_gb, latencyMs: r.latency_ms,
    group: r.group as Camera['group'],
    lastPingTime: r.last_ping_time || 'Never',
    detectionCapabilities: r.detection_capabilities as Camera['detectionCapabilities'],
  };
}

export function mapFaceEmbedding(r: Raw.RawFaceEmbedding): FaceEmbedding {
  return {
    id: r.id, employeeId: r.employee_id, imageUrl: mediaUrl(r.image_url) || '',
    vector: [], // the real 512-d vector is never sent to the frontend - no reason to ship it over the wire
    bbox: (r.bbox as [number, number, number, number]) || [0, 0, 0, 0],
    qualityScore: r.quality_score,
    poseTag: (r.pose_tag as any) || 'FRONT',
    sharpnessScore: r.sharpness_score ?? 0,
    createdAt: r.created_at,
  };
}

export function mapEmployee(r: Raw.RawEmployee): Employee {
  return {
    id: r.id, employeeCode: r.employee_code, fullName: r.full_name, email: r.email,
    department: r.department, role: r.role,
    branchId: r.branch_id || '', buildingId: r.building_id || '', floorId: r.floor_id || '',
    faceEmbeddings: r.face_embeddings.map(mapFaceEmbedding),
    avatarUrl: mediaUrl(r.avatar_url) || mediaUrl(r.face_embeddings[0]?.image_url) || '',
    status: r.status as Employee['status'], createdAt: r.created_at,
  };
}

export function mapVisitor(r: Raw.RawVisitor): Visitor {
  return {
    id: r.id, fullName: r.full_name, phone: r.phone || '', company: r.company || '',
    hostEmployeeId: r.host_employee_id || '', hostName: r.host_name || '', visitReason: r.visit_reason || '',
    category: r.category as Visitor['category'], passNumber: r.pass_number || '',
    faceImageUrl: mediaUrl(r.face_image_url), badgeStatus: r.badge_status as Visitor['badgeStatus'],
    checkInTime: r.check_in_time || undefined, checkOutTime: r.check_out_time || undefined,
  };
}

export function mapAttendance(r: Raw.RawAttendance, employee?: Employee): AttendanceRecord {
  return {
    id: r.id, employeeId: r.employee_id,
    employeeName: employee?.fullName || '', employeeCode: employee?.employeeCode || '',
    department: employee?.department || '',
    date: r.date, checkInTime: r.check_in_time || '', checkOutTime: r.check_out_time || undefined,
    checkInCamera: r.check_in_camera_id || '', checkOutCamera: r.check_out_camera_id || undefined,
    status: r.status as AttendanceRecord['status'],
    workDurationHours: r.work_duration_hours, overtimeHours: r.overtime_hours,
    breakDurationMinutes: r.break_duration_minutes,
    verificationMethod: r.verification_method as AttendanceRecord['verificationMethod'],
  };
}

export function mapLeave(r: Raw.RawLeave, employeeName = ''): LeaveRequest {
  return {
    id: r.id, employeeId: r.employee_id, employeeName,
    leaveType: r.leave_type as LeaveRequest['leaveType'], startDate: r.start_date, endDate: r.end_date,
    days: r.days, reason: r.reason || '', status: r.status as LeaveRequest['status'],
    appliedOn: r.applied_on, approverName: r.approver_name || undefined,
  };
}

export function mapSnapshot(r: Raw.RawSnapshot, cameraName = ''): SnapshotEvent {
  return {
    id: r.id, cameraId: r.camera_id, cameraName,
    timestamp: r.timestamp, eventType: r.event_type as SnapshotEvent['eventType'],
    severity: r.severity as SnapshotEvent['severity'], imageUrl: mediaUrl(r.image_path) || '',
    trackingId: r.tracking_id || '', recognizedName: r.recognized_name || undefined,
    recognizedDept: r.recognized_dept || undefined, confidence: r.confidence,
    bbox: (r.bbox as [number, number, number, number]) || [0, 0, 0, 0],
    tags: r.tags, acknowledged: r.acknowledged,
  };
}

export function mapAlert(r: Raw.RawAlert, cameraName = ''): AlertNotification {
  return {
    id: r.id, title: r.title, message: r.message, timestamp: r.timestamp,
    severity: r.severity as AlertNotification['severity'], cameraName,
    type: r.type as AlertNotification['type'], imageUrl: mediaUrl(r.image_path),
    channelSent: r.channel_sent as AlertNotification['channelSent'], readStatus: r.read_status,
  };
}
