import React from 'react';
import {
  Trash2,
  RefreshCw,
  Upload,
  Video,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Info,
  ShieldAlert,
  Sliders,
  Cpu
} from 'lucide-react';

interface DataControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearStaticData: () => void;
  onRestoreSampleData: () => void;
  isDataCleared: boolean;
  totalEmployees: number;
  totalCameras: number;
  totalSnapshots: number;
  totalAlerts?: number;
  totalAttendance: number;
}

export const DataControlModal: React.FC<DataControlModalProps> = ({
  isOpen,
  onClose,
  onClearStaticData,
  onRestoreSampleData,
  isDataCleared,
  totalEmployees,
  totalCameras,
  totalSnapshots,
  totalAlerts = 0,
  totalAttendance,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Testing Environment & Custom Data Manager</h2>
              <p className="text-xs text-slate-400">Manage demo state or start testing with your own video, cameras, and employees.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* AI Engine Status Banner */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-cyan-950/80 border border-indigo-800/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <span className="font-bold text-slate-100">AI Vision Neural Engine Active</span>
              <p className="text-[11px] text-slate-400">High-speed multi-object detection, trajectory tracking, and facial recognition pipeline.</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
            Real-Time Ready
          </span>
        </div>

        {/* Quick Actions Bar */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">Current Dataset Status</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isDataCleared ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
              {isDataCleared ? 'Custom Data Mode (Sample Data Wiped)' : 'Demo Dataset Active'}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Employees</span>
              <span className="font-bold text-indigo-400 text-sm">{totalEmployees}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Cameras</span>
              <span className="font-bold text-cyan-400 text-sm">{totalCameras}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Snapshots</span>
              <span className="font-bold text-amber-400 text-sm">{totalSnapshots}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Alerts</span>
              <span className="font-bold text-rose-400 text-sm">{totalAlerts}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Attendance</span>
              <span className="font-bold text-emerald-400 text-sm">{totalAttendance}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => {
                onClearStaticData();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition-all"
            >
              <Trash2 className="w-4 h-4" /> Wipe All Static Demo Data
            </button>

            <button
              onClick={() => {
                onRestoreSampleData();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all"
            >
              <RefreshCw className="w-4 h-4 text-indigo-400" /> Restore Sample Demo Data
            </button>
          </div>
        </div>

        {/* Step-by-Step Instructions to Test Custom Data */}
        <div className="space-y-3 text-xs">
          <h3 className="font-bold text-slate-200 flex items-center gap-1.5 text-sm">
            <Info className="w-4 h-4 text-indigo-400" /> How to Test with Your Own Data
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 font-bold">
                <Video className="w-4 h-4 text-indigo-400" /> 1. Test Live Webcams &amp; RTSP
              </div>
              <p className="text-slate-400 text-[11px]">
                Go to <span className="text-slate-200 font-semibold">Live Monitoring</span> and click <span className="text-indigo-400 font-semibold">"Start Live Webcam"</span> to process your browser camera with real-time AI bounding box overlays. Or add RTSP streams under <span className="text-slate-200 font-semibold">Camera Manager</span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-cyan-300 font-bold">
                <Upload className="w-4 h-4 text-cyan-400" /> 2. Upload Custom Video Files
              </div>
              <p className="text-slate-400 text-[11px]">
                Go to <span className="text-slate-200 font-semibold">Offline Video Analysis</span> and drag & drop any MP4, MOV, or AVI video from your computer. System extracts keyframes and applies bounding box detection.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <UserCheck className="w-4 h-4 text-emerald-400" /> 3. Register Custom Employees
              </div>
              <p className="text-slate-400 text-[11px]">
                Go to <span className="text-slate-200 font-semibold">Face Registration</span>, click <span className="text-emerald-400 font-semibold">"Enroll New Face Profile"</span>, and snap webcam photos or upload real employee face images to generate 512d vectors.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <CheckCircle2 className="w-4 h-4 text-amber-400" /> 4. Log Attendance & Visitors
              </div>
              <p className="text-slate-400 text-[11px]">
                Log check-ins for registered custom employees in <span className="text-slate-200 font-semibold">Attendance Manager</span> or issue custom visitor badges in <span className="text-slate-200 font-semibold">Leave & Visitor Manager</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg"
          >
            Start Testing
          </button>
        </div>
      </div>
    </div>
  );
};
