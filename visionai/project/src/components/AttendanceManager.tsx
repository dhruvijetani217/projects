import React, { useState } from 'react';
import {
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  Search,
  Plus,
  Briefcase,
  Loader2,
  Trash2,
  Save,
  Sliders,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AttendanceRecord, Employee } from '../types';
import {
  deleteAttendanceRecord,
  getLiveActiveEmployees,
  LiveActiveEmployee,
  getAttendanceTimeSummary,
  AttendanceTimeSummary,
  getAttendancePolicy,
  updateAttendancePolicy,
  getSystemSettings
} from '../api/client';

function formatDuration(hours: number): string {
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

import { ConfirmModal } from './ConfirmModal';

interface AttendanceManagerProps {
  attendanceRecords: AttendanceRecord[];
  employees: Employee[];
  loading: boolean;
  error: string | null;
  onManualCheckIn: (employeeId: string, reason: string) => Promise<void>;
  onDeleteRecord?: (id: string) => Promise<void>;
}

const EmployeeTimeReport: React.FC<{ employees: Employee[] }> = ({ employees }) => {
  const [query, setQuery] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [summary, setSummary] = useState<AttendanceTimeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const matches = query.length && !selectedEmp
    ? employees.filter((e) => e.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  React.useEffect(() => {
    if (!selectedEmp) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getAttendanceTimeSummary(selectedEmp.id, period)
      .then((res) => { if (!cancelled) setSummary(res); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedEmp, period]);

  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
      <h3 className="font-bold text-xs uppercase text-slate-400 tracking-wider flex items-center gap-2">
        <Clock className="w-4 h-4 text-indigo-400" /> Employee Time-on-Camera Report
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search employee e.g. Rajesh"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedEmp(null); setSummary(null); }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none w-56"
          />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-56 rounded-xl bg-slate-800 border border-slate-700 shadow-xl overflow-hidden">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedEmp(m); setQuery(m.fullName); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
                >
                  {m.fullName} <span className="text-slate-500">({m.employeeCode})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
          {(['day', 'week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all capitalize ${
                period === p ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-xs text-slate-500">Loading...</p>}
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {!selectedEmp && !loading && (
        <p className="text-[11px] text-slate-500">Search and select an employee above to see their real camera time report.</p>
      )}

      {summary && !loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px]">Real Time On Any Camera</span>
              <div className="font-bold text-emerald-400 text-base">{formatHoursMinutes(summary.total_hours)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px]">Present / Tracked Days</span>
              <div className="font-bold text-slate-100 text-base">{summary.present_days} / {summary.tracked_days}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px]">Punctuality</span>
              <div className="font-bold text-cyan-400 text-base">{summary.punctuality_percent}%</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px]">Most-Used Camera</span>
              <div className="font-bold text-slate-100 text-sm truncate">{summary.most_used_camera || '-'}</div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            {summary.range_start} to {summary.range_end} - real presence computed from camera detections
            (gaps under {summary.presence_gap_merge_seconds}s between sightings, even across different cameras,
            count as continuous presence; longer gaps count as time away).
          </div>

          {summary.camera_breakdown.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Time Per Camera</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {summary.camera_breakdown.map((c) => (
                  <div key={c.camera_id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 truncate">{c.camera_name}</span>
                    <span className="text-[11px] font-bold text-indigo-300 font-mono">{formatHoursMinutes(c.hours)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] text-slate-300">
              <thead className="uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="p-2">{summary.period === 'year' ? 'Month' : 'Date'}</th>
                  <th className="p-2">Real Hours on Camera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {summary.breakdown.map((b) => (
                  <tr key={b.date}>
                    <td className="p-2 font-mono">{b.date}</td>
                    <td className="p-2">{formatHoursMinutes(b.hours)}</td>
                  </tr>
                ))}
                {summary.breakdown.length === 0 && (
                  <tr><td className="p-2 text-slate-500" colSpan={2}>No camera detections in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  attendanceRecords, employees, loading, error, onManualCheckIn, onDeleteRecord
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || '');
  const [reason, setReason] = useState('');
  const [shiftStartTime, setShiftStartTime] = useState('09:00');
  const [shiftEndTime, setShiftEndTime] = useState('17:00');
  const [lateGraceMinutes, setLateGraceMinutes] = useState(15);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policySavedSuccess, setPolicySavedSuccess] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  // Load shift policy from backend SQLite database on mount
  React.useEffect(() => {
    getAttendancePolicy()
      .then((policy) => {
        if (policy) {
          if (policy.shift_start_time) setShiftStartTime(policy.shift_start_time);
          if (policy.shift_end_time) setShiftEndTime(policy.shift_end_time);
          if (policy.late_grace_minutes !== undefined) setLateGraceMinutes(policy.late_grace_minutes);
        }
      })
      .catch(() => {
        getSystemSettings().then((s) => {
          if (s.shift_start_time) setShiftStartTime(s.shift_start_time);
          if (s.shift_end_time) setShiftEndTime(s.shift_end_time);
          if (s.late_grace_minutes !== undefined) setLateGraceMinutes(s.late_grace_minutes);
        }).catch(() => {});
      });
  }, []);

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    setPolicyError(null);
    setPolicySavedSuccess(false);
    try {
      await updateAttendancePolicy({
        shift_start_time: shiftStartTime,
        shift_end_time: shiftEndTime,
        late_grace_minutes: Number(lateGraceMinutes) || 0,
      });
      setPolicySavedSuccess(true);
      setTimeout(() => setPolicySavedSuccess(false), 4000);
    } catch (err: any) {
      setPolicyError(err?.message || 'Failed to save shift policy');
    } finally {
      setSavingPolicy(false);
    }
  };
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [liveActiveEmployees, setLiveActiveEmployees] = useState<LiveActiveEmployee[]>([]);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeletingId(id);
    try {
      if (onDeleteRecord) {
        await onDeleteRecord(id);
      } else {
        await deleteAttendanceRecord(id);
      }
    } catch (err) {
      console.error('Delete attendance error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  React.useEffect(() => {
    let mounted = true;
    const fetchLive = async () => {
      try {
        const list = await getLiveActiveEmployees();
        if (mounted) setLiveActiveEmployees(list);
      } catch (err) {
        // ignore offline API errors
      }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const totalEmployees = employees.length;
  const presentCount = attendanceRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EARLY_LEAVE').length;
  const lateCount = attendanceRecords.filter((r) => r.status === 'LATE').length;
  const earlyLeaveCount = attendanceRecords.filter((r) => r.status === 'EARLY_LEAVE').length;
  const faceRecognizedCount = attendanceRecords.filter((r) => r.verificationMethod === 'FACE_RECOGNITION').length;
  const autoCheckInRate = attendanceRecords.length
    ? Math.round((faceRecognizedCount / attendanceRecords.length) * 1000) / 10
    : 0;

  const handleManualCheckIn = async () => {
    const emp = employees.find((e) => e.id === selectedEmpId) || employees[0];
    if (!emp) return;
    setSubmitting(true);
    try {
      await onManualCheckIn(emp.id, reason);
      setShowCorrectionModal(false);
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const exportReport = (format: 'PDF' | 'EXCEL' | 'CSV') => {
    const dataStr = JSON.stringify(attendanceRecords, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VisionAI_Attendance_Report_${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`;
    a.click();
  };

  const liveEmpIds = new Set(liveActiveEmployees.map((e) => e.employee_id));

  const filtered = attendanceRecords.filter((r) => {
    const matchesSearch =
      r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'ALL' || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Total Registered Staff</span>
          <div className="text-xl font-bold text-slate-100 flex items-center justify-between">
            <span>{totalEmployees} Employees</span>
            <Briefcase className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Present Today</span>
          <div className="text-xl font-bold text-emerald-400 flex items-center justify-between">
            <span>{presentCount} Checked In</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Late Arrivals</span>
          <div className="text-xl font-bold text-amber-400 flex items-center justify-between">
            <span>{lateCount} Flagged</span>
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium">Auto CCTV Check-In Rate</span>
          <div className="text-xl font-bold text-cyan-400 flex items-center justify-between">
            <span>{autoCheckInRate}%</span>
            <UserCheck className="w-5 h-5 text-cyan-400" />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          Could not load attendance from the backend: {error}. Is the Python server running?
        </div>
      )}

      {/* Live CCTV Radar Banner */}
      {liveActiveEmployees.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 flex items-center justify-between gap-3 text-xs text-emerald-300 shadow-lg animate-pulse">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="font-bold">LIVE CAMERA DETECTIONS ACTIVE</span> — Currently seeing {liveActiveEmployees.length} employee(s) on live video stream right now:
            <span className="font-semibold text-emerald-200">
              {liveActiveEmployees.map((e) => e.name).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Office Shift & Attendance Policy Card */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-950/60 border border-indigo-800 text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                Office Shift Hours & Grace Policy
                <span className="text-[10px] lowercase font-normal px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  persisted in database
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Attendance records (PRESENT / LATE / EARLY_LEAVE) are calculated automatically from these shift hours.
              </p>
            </div>
          </div>

          <button
            onClick={handleSavePolicy}
            disabled={savingPolicy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {savingPolicy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : policySavedSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>Saved to Database!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Shift Policy</span>
              </>
            )}
          </button>
        </div>

        {policyError && (
          <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
            {policyError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Shift Start Time (Office In)</span>
              <span className="text-[10px] text-indigo-400">24-hr format</span>
            </label>
            <input
              type="time"
              value={shiftStartTime}
              onChange={(e) => setShiftStartTime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Shift End Time (Office Out)</span>
              <span className="text-[10px] text-indigo-400">24-hr format</span>
            </label>
            <input
              type="time"
              value={shiftEndTime}
              onChange={(e) => setShiftEndTime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Late Grace Period (Minutes)</span>
              <span className="text-[10px] text-emerald-400">Buffer time</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="120"
                value={lateGraceMinutes}
                onChange={(e) => setLateGraceMinutes(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-1.5 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-xs text-slate-400 font-medium">mins</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>
              On-Time: Check-in before <strong className="text-emerald-300 font-mono">{shiftStartTime}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>
              Late Flagged: Check-in after <strong className="text-amber-300 font-mono">{shiftStartTime} (+{lateGraceMinutes}m grace)</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>
              Early Leave: Check-out before <strong className="text-cyan-300 font-mono">{shiftEndTime}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Employee Time-on-Camera Report */}
      <EmployeeTimeReport employees={employees} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none w-56"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            {['ALL', 'PRESENT', 'LATE', 'EARLY_LEAVE', 'ABSENT'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterStatus === status ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCorrectionModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" /> Manual Correction / Override
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => exportReport('CSV')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md"
            >
              <Download className="w-3.5 h-3.5" /> Export Report (CSV)
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-950/60 border-b border-slate-800">
            <tr>
              <th className="p-3">Employee</th>
              <th className="p-3">Department</th>
              <th className="p-3">Date</th>
              <th className="p-3">Check-In Time</th>
              <th className="p-3">Detection Camera</th>
              <th className="p-3">Status</th>
              <th className="p-3">Work Hours</th>
              <th className="p-3">Method</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.map((record) => {
              const isCurrentlyLive = liveEmpIds.has(record.employeeId);
              return (
                <tr key={record.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-slate-100 flex items-center gap-2">
                      <span>{record.employeeName}</span>
                      {isCurrentlyLive && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/30 text-emerald-300 border border-emerald-400 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> LIVE ON CAMERA
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-indigo-400 font-mono">{record.employeeCode}</div>
                  </td>
                  <td className="p-3 text-slate-300">{record.department}</td>
                  <td className="p-3 font-mono text-slate-400">{record.date}</td>
                  <td className="p-3 font-bold text-emerald-400 font-mono">
                    {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}
                  </td>
                  <td className="p-3 text-slate-300">{record.checkInCamera || 'Video Upload / CCTV'}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        record.status === 'PRESENT'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : record.status === 'LATE'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : record.status === 'EARLY_LEAVE'
                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {record.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-slate-200">{formatDuration(record.workDurationHours)}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 text-[10px] font-mono">
                      {record.verificationMethod}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setPendingDeleteId(record.id)}
                      disabled={deletingId === record.id}
                      title="Delete Record"
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-all"
                    >
                      {deletingId === record.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" /> Manual Attendance Override
              </h3>
              <button onClick={() => setShowCorrectionModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select Employee</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode}) - {emp.department}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Reason / HR Note</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Card scanner offline, verified by supervisor"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleManualCheckIn}
                disabled={submitting || !selectedEmpId}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Approve Attendance Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sleek Delete Confirm Popup Modal */}
      <ConfirmModal
        isOpen={!!pendingDeleteId}
        title="Delete Attendance Record?"
        message="Are you sure you want to delete this check-in/out attendance record? This action cannot be undone."
        confirmText="Delete Record"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
};