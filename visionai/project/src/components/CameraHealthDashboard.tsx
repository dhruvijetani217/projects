import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Radio,
  Wifi,
  WifiOff,
  Video,
  Disc,
  Clock,
  Download,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Sliders,
  ShieldCheck,
  HardDrive,
  Gauge,
  Play,
  RotateCcw,
  Zap,
  Info,
  Maximize2,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { Camera, CameraHealth, CameraRecording } from '../types';
import {
  getAllCamerasHealth,
  startCameraRecording,
  stopCameraRecording,
  getCameraRecordings,
  testCameraConnection,
  deleteCamera,
  deleteVideo
} from '../api/client';

interface CameraHealthDashboardProps {
  cameras: Camera[];
  onRefreshCameras?: () => void;
}

export const CameraHealthDashboard: React.FC<CameraHealthDashboardProps> = ({ cameras, onRefreshCameras }) => {
  const [healthData, setHealthData] = useState<CameraHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');

  // Recording State
  const [recordingTimers, setRecordingTimers] = useState<Record<string, number>>({});
  const [recordingBusy, setRecordingBusy] = useState<Record<string, boolean>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Recordings modal / drawer
  const [recordingsModalCamera, setRecordingsModalCamera] = useState<CameraHealth | null>(null);
  const [cameraRecordings, setCameraRecordings] = useState<CameraRecording[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);

  // PTZ Modal
  const [ptzModalCamera, setPtzModalCamera] = useState<CameraHealth | null>(null);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [selectedVideoSource, setSelectedVideoSource] = useState<string>('');

  const handleOpenPtz = (cam: CameraHealth) => {
    setPtzModalCamera(cam);
    setDigitalZoom(1);
    setPanOffset({ x: 0, y: 0 });
    const directUrl = cam.videoUrl || cam.previewUrl || (cam.cameraUrl?.endsWith('.mp4') || cam.cameraUrl?.startsWith('/media/') ? cam.cameraUrl : '');
    if (directUrl) {
      setSelectedVideoSource(directUrl);
    } else {
      const firstAvailable = healthData.find((h) => h.videoUrl)?.videoUrl || '';
      setSelectedVideoSource(firstAvailable);
    }
  };

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const data = await getAllCamerasHealth();
      setHealthData(data);
      if (data.length > 0 && !selectedCameraId) {
        setSelectedCameraId(data[0].cameraId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch camera health diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    fetchHealth();
    const interval = window.setInterval(fetchHealth, 8000); // 8s polling
    return () => window.clearInterval(interval);
  }, [fetchHealth]);

  // Recording timer ticker
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRecordingTimers((prev) => {
        const next = { ...prev };
        healthData.forEach((h) => {
          if (h.recordingActive) {
            next[h.cameraId] = (next[h.cameraId] || Math.floor(h.recordingDurationSeconds || 0)) + 1;
          } else {
            delete next[h.cameraId];
          }
        });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [healthData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchHealth();
    if (onRefreshCameras) onRefreshCameras();
  };

  const handleToggleRecord = async (cam: CameraHealth) => {
    setRecordingBusy((prev) => ({ ...prev, [cam.cameraId]: true }));
    try {
      if (cam.recordingActive) {
        const res = await stopCameraRecording(cam.cameraId);
        setActionNotice(`Recording saved (${(res.recording.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB). Ready to download.`);
        window.setTimeout(() => setActionNotice(null), 5000);
      } else {
        await startCameraRecording(cam.cameraId);
        setActionNotice(`Recording started for ${cam.cameraName}. Saving raw stream to disk.`);
        window.setTimeout(() => setActionNotice(null), 4000);
      }
      await fetchHealth();
    } catch (err: any) {
      setActionNotice(`Recording action failed: ${err.message}`);
      window.setTimeout(() => setActionNotice(null), 5000);
    } finally {
      setRecordingBusy((prev) => ({ ...prev, [cam.cameraId]: false }));
    }
  };

  const handleTestCamera = async (camId: string) => {
    try {
      await testCameraConnection(camId);
      await fetchHealth();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleOpenRecordings = async (cam: CameraHealth) => {
    setRecordingsModalCamera(cam);
    setLoadingRecordings(true);
    try {
      const list = await getCameraRecordings(cam.cameraId);
      setCameraRecordings(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRecordings(false);
    }
  };

  const handleDeleteStream = async (cam: CameraHealth) => {
    if (!window.confirm(`Are you sure you want to delete "${cam.cameraName}"? This will permanently remove it from the system.`)) {
      return;
    }
    try {
      if (cam.cameraType === 'UPLOAD' || cam.cameraId.startsWith('vid-')) {
        await deleteVideo(cam.cameraId);
      } else {
        await deleteCamera(cam.cameraId);
      }
      setActionNotice(`Successfully deleted "${cam.cameraName}".`);
      window.setTimeout(() => setActionNotice(null), 4000);
      await fetchHealth();
      if (onRefreshCameras) onRefreshCameras();
    } catch (err: any) {
      setActionNotice(`Failed to delete: ${err.message}`);
      window.setTimeout(() => setActionNotice(null), 4000);
    }
  };

  // Filtered cameras
  const filteredHealth = healthData.filter((h) => {
    const matchesSearch =
      h.cameraName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.cameraCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || h.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Fleet Statistics
  const totalCams = healthData.length;
  const onlineCams = healthData.filter((h) => h.status === 'ONLINE').length;
  const avgUptime = totalCams
    ? Math.round(healthData.reduce((acc, h) => acc + h.uptimePercentage24h, 0) / totalCams)
    : 0;
  const activeRecordingsCount = healthData.filter((h) => h.recordingActive).length;

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto no-scrollbar">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Camera Health &amp; Stream Diagnostics</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                  Fleet Engine Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Real-time uptime monitoring, connection telemetry, raw stream recording controls, and PTZ diagnostics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Health'}</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 rounded-xl bg-indigo-950/80 border border-indigo-800 text-indigo-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          Could not fetch camera health data: {error}
        </div>
      )}

      {/* Fleet Summary Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Cameras</span>
            <Radio className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">{totalCams}</div>
          <div className="text-[11px] text-slate-500">Configured endpoints</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Online Streams</span>
            <Wifi className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {onlineCams} <span className="text-xs font-normal text-slate-400">/ {totalCams}</span>
          </div>
          <div className="text-[11px] text-slate-500">Active video feeds</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>24h Avg Uptime</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-400">{avgUptime}%</div>
          <div className="text-[11px] text-slate-500">Computed over 24h history</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Recordings</span>
            <Disc className={`w-4 h-4 ${activeRecordingsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="text-xl font-bold font-mono text-rose-400">{activeRecordingsCount}</div>
          <div className="text-[11px] text-slate-500">Capturing to disk (.mp4)</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by camera name, code, or location..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {(['ALL', 'ONLINE', 'OFFLINE'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
                statusFilter === st ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Health Grid */}
      {loading && !healthData.length ? (
        <div className="p-12 text-center text-slate-500 text-sm">Computing camera health diagnostics...</div>
      ) : filteredHealth.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
          <p className="text-slate-300 font-bold text-sm">No cameras match the selected criteria.</p>
          <p className="text-slate-500 text-xs">Try clearing the search or status filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHealth.map((cam) => {
            const isRec = cam.recordingActive;
            const recTimer = recordingTimers[cam.cameraId] || Math.floor(cam.recordingDurationSeconds || 0);

            return (
              <div
                key={cam.cameraId}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                {/* Header Info */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            cam.status === 'ONLINE'
                              ? 'bg-emerald-500 animate-pulse'
                              : cam.status === 'WARNING'
                              ? 'bg-amber-500'
                              : 'bg-slate-600'
                          }`}
                        />
                        <h3 className="font-bold text-sm text-slate-100 truncate max-w-[180px]">{cam.cameraName}</h3>
                      </div>
                      <p className="text-xs text-slate-400">{cam.location} · {cam.group}</p>
                    </div>

                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                      {cam.cameraType}
                    </span>
                  </div>

                  {/* Uptime Radial / Metric Box */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <div>
                      <span className="text-[10px] text-slate-500 block">24h Uptime</span>
                      <span
                        className={`text-sm font-bold font-mono ${
                          cam.uptimePercentage24h >= 99
                            ? 'text-emerald-400'
                            : cam.uptimePercentage24h >= 90
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {cam.uptimePercentage24h}%
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block">Offline Drops</span>
                      <span className="text-sm font-bold font-mono text-slate-300">
                        {cam.offlineEvents24h}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block">Latency</span>
                      <span className="text-sm font-bold font-mono text-cyan-400">
                        {cam.latencyMs}ms
                      </span>
                    </div>
                  </div>

                  {/* Telemetry Details */}
                  <div className="space-y-1.5 text-[11px] font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Stream Resolution:</span>
                      <span className="text-slate-200 font-bold">{cam.resolution}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>FPS Frame Rate:</span>
                      <span className="text-slate-200 font-bold">{cam.fps} FPS</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>PTZ Control:</span>
                      <span className="text-cyan-400 font-semibold">Digital (Software)</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Stream Endpoint:</span>
                      <span className="text-slate-400 truncate max-w-[140px] text-[10px]" title={cam.cameraUrl}>
                        {cam.cameraUrl}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Control Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    {/* Live Stream Record Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleRecord(cam)}
                      disabled={recordingBusy[cam.cameraId]}
                      className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                        isRec
                          ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                    >
                      <Disc className={`w-3.5 h-3.5 ${isRec ? 'text-white' : 'text-rose-400'}`} />
                      <span>{isRec ? `REC ${formatSeconds(recTimer)}` : 'Record Stream'}</span>
                    </button>

                    {/* PTZ Software Control Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenPtz(cam)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
                      title="Digital PTZ & Pan Controls"
                    >
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      <span>PTZ</span>
                    </button>

                    {/* Saved Recordings Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenRecordings(cam)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
                      title="View Saved .mp4 Recordings"
                    >
                      <Video className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Clips</span>
                    </button>

                    {/* Delete Stream Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteStream(cam)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-800/80 text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
                      title={`Delete ${cam.cameraName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Connection Test & Recent Event Note */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>
                      {cam.recentEvents.length > 0
                        ? `Last event: ${cam.recentEvents[0].reason || cam.recentEvents[0].status}`
                        : 'Continuous monitoring active'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTestCamera(cam.cameraId)}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PTZ Digital Controls Modal */}
      {ptzModalCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  PTZ &amp; Optical Controls: {ptzModalCamera.cameraName}
                </h3>
              </div>
              <button
                onClick={() => {
                  setPtzModalCamera(null);
                  setDigitalZoom(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            {/* Video Stream Selector */}
            {healthData.filter((h) => h.videoUrl).length > 0 && (
              <div className="flex items-center justify-between text-xs bg-slate-950 p-2 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Video className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold text-[11px]">Stream Feed:</span>
                </div>
                <select
                  value={selectedVideoSource}
                  onChange={(e) => setSelectedVideoSource(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none max-w-[280px] truncate font-mono"
                >
                  {healthData
                    .filter((h) => h.videoUrl)
                    .map((h) => (
                      <option key={h.cameraId} value={h.videoUrl}>
                        {h.cameraName}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Interactive Live Viewfinder Preview with Real Video Element */}
            <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center select-none shadow-2xl">
              {/* Scaled & Panned Viewport */}
              <div
                className="w-full h-full relative transition-transform duration-150 ease-out flex items-center justify-center overflow-hidden"
                style={{
                  transform: `scale(${digitalZoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                  transformOrigin: 'center center',
                }}
              >
                {selectedVideoSource ? (
                  <video
                    key={selectedVideoSource}
                    src={selectedVideoSource}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  /* Fallback Optical Visual Grid */
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black flex items-center justify-center">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px]" />
                    <div className="relative flex flex-col items-center justify-center space-y-2 p-6 text-center">
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-cyan-400/60 flex items-center justify-center animate-[spin_10s_linear_infinite]">
                        <div className="w-8 h-8 rounded-full border border-indigo-400/80" />
                      </div>
                      <span className="text-xs font-mono font-bold text-cyan-300 tracking-wider">
                        {ptzModalCamera.cameraName.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {ptzModalCamera.location} · {ptzModalCamera.resolution}
                      </span>
                    </div>
                  </div>
                )}

                {/* Optical HUD Crosshairs */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-full h-[1px] bg-cyan-400/30" />
                  <div className="h-full w-[1px] bg-cyan-400/30 absolute" />
                </div>
              </div>

              {/* Viewfinder HUD Overlays (Fixed to frame) */}
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-slate-900/90 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-400 border border-slate-800">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>MAG: {digitalZoom.toFixed(1)}x</span>
                <span className="text-slate-500">|</span>
                <span>PAN: [{panOffset.x > 0 ? `+${panOffset.x}` : panOffset.x}, {panOffset.y > 0 ? `+${panOffset.y}` : panOffset.y}]</span>
              </div>

              {/* Mini Radar / FOV Viewfinder box */}
              <div className="absolute bottom-2 left-2 z-10 w-16 h-10 bg-slate-900/90 border border-slate-700 rounded p-0.5 pointer-events-none">
                <div
                  className="border border-cyan-400 bg-cyan-500/20 rounded-sm transition-all duration-150"
                  style={{
                    width: `${Math.max(100 / digitalZoom, 25)}%`,
                    height: `${Math.max(100 / digitalZoom, 25)}%`,
                    transform: `translate(${Math.min(Math.max(-panOffset.x / 4, 0), 100 - 100 / digitalZoom)}%, ${Math.min(Math.max(-panOffset.y / 4, 0), 100 - 100 / digitalZoom)}%)`
                  }}
                />
              </div>

              <div className="absolute top-2 right-2 z-10 bg-slate-900/80 px-2 py-0.5 rounded text-[9px] font-mono text-slate-300 border border-slate-800">
                FOV: {Math.round(85 / digitalZoom)}°
              </div>
            </div>

            {/* Digital Zoom Slider & Controls */}
            <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">Optical Magnification:</span>
                <span className="font-bold font-mono text-cyan-400 text-sm">{digitalZoom.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={digitalZoom}
                onChange={(e) => setDigitalZoom(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />

              {/* Directional Pad */}
              <div className="pt-2 text-center space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                  <span>Pan &amp; Tilt Directional Controls</span>
                  <button
                    onClick={() => { setDigitalZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset (1.0x Center)
                  </button>
                </div>
                <div className="inline-grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <div />
                  <button
                    onClick={() => setPanOffset((p) => ({ ...p, y: Math.max(p.y - 20, -100) }))}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 text-xs font-bold transition-all active:scale-95 shadow"
                    title="Pan Up"
                  >
                    ▲
                  </button>
                  <div />

                  <button
                    onClick={() => setPanOffset((p) => ({ ...p, x: Math.max(p.x - 20, -100) }))}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 text-xs font-bold transition-all active:scale-95 shadow"
                    title="Pan Left"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => { setDigitalZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold active:scale-95 shadow"
                    title="Center Reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mx-auto" />
                  </button>
                  <button
                    onClick={() => setPanOffset((p) => ({ ...p, x: Math.min(p.x + 20, 100) }))}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 text-xs font-bold transition-all active:scale-95 shadow"
                    title="Pan Right"
                  >
                    ▶
                  </button>

                  <div />
                  <button
                    onClick={() => setPanOffset((p) => ({ ...p, y: Math.min(p.y + 20, 100) }))}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-200 text-xs font-bold transition-all active:scale-95 shadow"
                    title="Pan Down"
                  >
                    ▼
                  </button>
                  <div />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setPtzModalCamera(null);
                  setDigitalZoom(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Close Controls
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Recordings Modal */}
      {recordingsModalCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-2xl p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base text-slate-100">
                  Recorded Stream Clips: {recordingsModalCamera.cameraName}
                </h3>
              </div>
              <button onClick={() => setRecordingsModalCamera(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {loadingRecordings ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading recorded clips from disk...</div>
            ) : cameraRecordings.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm space-y-1">
                <p className="font-bold text-slate-300">No recorded clips found for this camera.</p>
                <p className="text-xs text-slate-500">
                  Click "Record Stream" on the live camera tile to record real .mp4 video files to disk.
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
                {cameraRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-200 font-mono">
                        {rec.filePath.split('/').pop()}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Duration: <span className="font-mono text-cyan-400">{rec.durationSeconds.toFixed(1)}s</span> ·
                        Size: <span className="font-mono text-emerald-400">{(rec.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span> ·
                        Started: <span className="font-mono text-slate-400">{new Date(rec.startedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={rec.fileUrl}
                        download
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Download className="w-3.5 h-3.5" /> Download .mp4
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setRecordingsModalCamera(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
