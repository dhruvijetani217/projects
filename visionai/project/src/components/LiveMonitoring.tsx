import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera as CameraIcon,
  Video,
  Radio,
  Eye,
  AlertTriangle,
  Wifi,
  WifiOff,
  Loader2,
  Info,
  Grid2x2,
  Grid3x3,
  Square,
  CheckSquare,
  Disc,
  Download,
  Sliders
} from 'lucide-react';
import { Camera } from '../types';
import {
  analyzeSingleFrame,
  startCameraStream,
  stopCameraStream,
  connectLiveFeed,
  startCameraRecording,
  stopCameraRecording
} from '../api/client';
import { API_BASE_URL } from '../api/config';
import { RawLiveFrameResponse } from '../api/rawTypes';
import { useVideoOverlayRect, bboxToPixelStyle } from '../hooks/useVideoOverlayRect';

interface LiveMonitoringProps {
  cameras: Camera[];
  loading: boolean;
  error: string | null;
}

type DetectionState = {
  objects: RawLiveFrameResponse['objects'];
  faces: RawLiveFrameResponse['faces'];
  updatedAt: number;
} | null;

const WEBCAM_CAPTURE_INTERVAL_MS = 600;

// ---------------------------------------------------------------------------
// One tile = one real camera's server-side stream (RTSP/ONVIF/IP/USB).
// Each tile owns its own start/stop + WebSocket connection, so any number of
// real cameras can run concurrently in a grid, independent of each other.
// Includes automatic WebSocket reconnection with exponential backoff.
// ---------------------------------------------------------------------------

const LiveCameraTile: React.FC<{ camera: Camera; onRemove: () => void }> = ({ camera, onRemove }) => {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [nextRetrySeconds, setNextRetrySeconds] = useState(0);
  const [detections, setDetections] = useState<DetectionState>(null);
  const [tileError, setTileError] = useState<string | null>(null);

  // Live Stream Recording State
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [savedClipUrl, setSavedClipUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const isDesiredActiveRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    let interval: number | null = null;
    if (recordingActive) {
      interval = window.setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [recordingActive]);

  const handleToggleRecord = async () => {
    setRecordingBusy(true);
    try {
      if (recordingActive) {
        const res = await stopCameraRecording(camera.id);
        setRecordingActive(false);
        setSavedClipUrl(res.recording.fileUrl);
      } else {
        setSavedClipUrl(null);
        await startCameraRecording(camera.id);
        setRecordingActive(true);
        setRecordingDuration(0);
      }
    } catch (err: any) {
      setTileError(err.message || 'Recording failed');
    } finally {
      setRecordingBusy(false);
    }
  };

  const cleanupTimers = () => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const scheduleReconnect = (backoffDelayMs: number) => {
    cleanupTimers();
    if (!isDesiredActiveRef.current) return;

    setReconnecting(true);
    setConnecting(false);
    setActive(false);

    const seconds = Math.ceil(backoffDelayMs / 1000);
    setNextRetrySeconds(seconds);

    let remaining = seconds;
    countdownIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setNextRetrySeconds(0);
      } else {
        setNextRetrySeconds(remaining);
      }
    }, 1000);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      cleanupTimers();
      if (isDesiredActiveRef.current) {
        connect();
      }
    }, backoffDelayMs);
  };

  const connect = async () => {
    if (!isDesiredActiveRef.current) return;

    cleanupTimers();
    setConnecting(true);
    setTileError(null);

    try {
      await startCameraStream(camera.id);
      if (!isDesiredActiveRef.current) return;

      const ws = connectLiveFeed(camera.id, API_BASE_URL);

      ws.onopen = () => {
        if (!isDesiredActiveRef.current) {
          ws.close();
          return;
        }
        setActive(true);
        setConnecting(false);
        setReconnecting(false);
        setTileError(null);
        retryAttemptRef.current = 0;
        setRetryAttempt(0);
        setNextRetrySeconds(0);
      };

      ws.onmessage = (event) => {
        try {
          const data: RawLiveFrameResponse = JSON.parse(event.data);
          setDetections({ objects: data.objects, faces: data.faces, updatedAt: Date.now() });
        } catch { /* ignore malformed frame */ }
      };

      ws.onerror = () => {
        // ws.onclose handles retry triggering
      };

      ws.onclose = () => {
        wsRef.current = null;
        setActive(false);
        if (isDesiredActiveRef.current) {
          const currentAttempt = retryAttemptRef.current;
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
          const delay = Math.min(1000 * Math.pow(2, currentAttempt), 30000);
          retryAttemptRef.current = currentAttempt + 1;
          setRetryAttempt(retryAttemptRef.current);
          scheduleReconnect(delay);
        }
      };

      wsRef.current = ws;
    } catch (err: any) {
      if (!isDesiredActiveRef.current) return;
      setTileError(err.message || 'Could not connect to camera stream');
      const currentAttempt = retryAttemptRef.current;
      const delay = Math.min(1000 * Math.pow(2, currentAttempt), 30000);
      retryAttemptRef.current = currentAttempt + 1;
      setRetryAttempt(retryAttemptRef.current);
      scheduleReconnect(delay);
    }
  };

  const start = () => {
    isDesiredActiveRef.current = true;
    retryAttemptRef.current = 0;
    setRetryAttempt(0);
    setNextRetrySeconds(0);
    connect();
  };

  const stop = async () => {
    isDesiredActiveRef.current = false;
    cleanupTimers();

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setActive(false);
    setConnecting(false);
    setReconnecting(false);
    setRetryAttempt(0);
    setNextRetrySeconds(0);
    setDetections(null);

    try {
      await stopCameraStream(camera.id);
    } catch {
      /* already stopped (e.g. backend down or finite source ended) - fine */
    }
  };

  const handleRemove = async () => {
    await stop();
    onRemove();
  };

  useEffect(() => {
    return () => {
      isDesiredActiveRef.current = false;
      cleanupTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video flex flex-col">
      {/* Top Header Badge */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-200 backdrop-blur border border-slate-800 shadow-sm">
        <span
          className={`w-2 h-2 rounded-full ${
            active
              ? 'bg-emerald-400 animate-pulse'
              : reconnecting
              ? 'bg-amber-400 animate-ping'
              : connecting
              ? 'bg-cyan-400 animate-pulse'
              : 'bg-slate-500'
          }`}
        />
        <span className="truncate max-w-[140px]">{camera.name}</span>
        {active && <span className="text-[9px] text-emerald-400 font-mono tracking-wider ml-0.5">LIVE</span>}
        {reconnecting && <span className="text-[9px] text-amber-400 font-mono tracking-wider ml-0.5">RECONNECTING</span>}
        {connecting && !reconnecting && <span className="text-[9px] text-cyan-400 font-mono tracking-wider ml-0.5">CONNECTING</span>}
      </div>

      <button
        onClick={handleRemove}
        className="absolute top-2 right-2 z-20 bg-slate-900/80 hover:bg-rose-900/80 text-slate-300 hover:text-white rounded-lg px-2 py-1 text-[10px] backdrop-blur border border-slate-800 transition-colors"
        title="Remove camera from grid"
      >
        ✕
      </button>

      <div className="flex-1 relative flex items-center justify-center bg-slate-950/90">
        {/* Idle State */}
        {!active && !connecting && !reconnecting && (
          <div className="flex flex-col items-center justify-center p-4 space-y-2">
            <button
              onClick={start}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Wifi className="w-3.5 h-3.5" /> Start Stream
            </button>
            {tileError && (
              <p className="text-[10px] text-rose-400 max-w-[90%] text-center mt-1">
                {tileError}
              </p>
            )}
          </div>
        )}

        {/* Initial Connecting State */}
        {connecting && !reconnecting && (
          <div className="flex flex-col items-center justify-center space-y-2 text-center p-4">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            <p className="text-[11px] text-slate-300 font-medium">Starting camera stream...</p>
            <button
              onClick={stop}
              className="mt-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold border border-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Reconnecting State with Exponential Backoff Indicator */}
        {reconnecting && (
          <div className="flex flex-col items-center justify-center text-center p-4 space-y-2.5 z-10">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-400 shadow-inner">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                Connection Lost · Reconnecting...
              </p>
              <p className="text-[11px] text-slate-300">
                Next retry in <span className="font-mono font-bold text-amber-400">{nextRetrySeconds > 0 ? nextRetrySeconds : 1}s</span>
                {retryAttempt > 0 && <span className="text-slate-400"> (Attempt #{retryAttempt})</span>}
              </p>
              {tileError && (
                <p className="text-[10px] text-slate-400 max-w-[240px] truncate mx-auto">
                  {tileError}
                </p>
              )}
            </div>
            <button
              onClick={stop}
              className="px-3 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[10px] font-bold transition-all shadow-md"
            >
              Cancel & Stop
            </button>
          </div>
        )}

        {/* Active Live Stream State */}
        {active && (
          <>
            {detections?.objects.map((o, i) => (
              <div
                key={`o-${i}`}
                className="absolute border-2 border-cyan-400 rounded transition-all duration-200"
                style={{ left: `${o.bbox_pct[0]}%`, top: `${o.bbox_pct[1]}%`, width: `${o.bbox_pct[2]}%`, height: `${o.bbox_pct[3]}%` }}
              >
                <span className="absolute -top-4 left-0 bg-cyan-600 text-white text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap shadow-sm">
                  {o.class.toUpperCase()} {Math.round(o.confidence * 100)}%
                </span>
              </div>
            ))}
            {detections?.faces.map((f, i) => (
              <div
                key={`f-${i}`}
                className={`absolute border-2 rounded transition-all duration-200 ${
                  f.person_type === 'EMPLOYEE' ? 'border-emerald-400' : 'border-rose-500'
                }`}
                style={{ left: `${f.bbox_pct[0]}%`, top: `${f.bbox_pct[1]}%`, width: `${f.bbox_pct[2]}%`, height: `${f.bbox_pct[3]}%` }}
              >
                <span
                  className={`absolute -top-4 left-0 text-white text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap shadow-sm ${
                    f.person_type === 'EMPLOYEE' ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                >
                  {f.name}
                </span>
              </div>
            ))}
            {savedClipUrl && (
              <div className="absolute bottom-11 right-2 z-30 flex items-center gap-1.5 p-1.5 px-2.5 rounded-lg bg-emerald-950/95 border border-emerald-600 text-emerald-300 text-[10px] shadow-lg backdrop-blur">
                <span className="font-semibold">Clip Saved!</span>
                <a href={savedClipUrl} download className="font-bold underline text-white flex items-center gap-0.5">
                  <Download className="w-3 h-3" /> Download .mp4
                </a>
                <button onClick={() => setSavedClipUrl(null)} className="ml-1 text-emerald-400 hover:text-white">✕</button>
              </div>
            )}
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-20">
              <button
                onClick={handleToggleRecord}
                disabled={recordingBusy}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-md transition-all flex items-center gap-1.5 ${
                  recordingActive
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700'
                }`}
                title={recordingActive ? 'Stop and save recording' : 'Record raw camera stream to MP4 file'}
              >
                <Disc className={`w-3 h-3 ${recordingActive ? 'text-white' : 'text-rose-400'}`} />
                <span>
                  {recordingActive
                    ? `REC ${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, '0')}`
                    : 'Record'}
                </span>
              </button>
              <button
                onClick={stop}
                className="px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[10px] font-bold shadow-md transition-all"
              >
                Stop
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const LiveMonitoring: React.FC<LiveMonitoringProps> = ({ cameras, loading, error }) => {
  const [gridCameraIds, setGridCameraIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const [webcamCamId, setWebcamCamId] = useState<string>('');
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamDetections, setWebcamDetections] = useState<DetectionState>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Webcam stream recording state
  const [webcamRecording, setWebcamRecording] = useState(false);
  const [webcamRecDuration, setWebcamRecDuration] = useState(0);
  const [savedWebcamClipUrl, setSavedWebcamClipUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureIntervalRef = useRef<number | null>(null);

  const overlayRect = useVideoOverlayRect(videoRef, videoContainerRef);

  useEffect(() => {
    let interval: number | null = null;
    if (webcamRecording) {
      interval = window.setInterval(() => setWebcamRecDuration((d) => d + 1), 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [webcamRecording]);

  const handleToggleWebcamRecord = async () => {
    if (!webcamCamId) return;
    try {
      if (webcamRecording) {
        const res = await stopCameraRecording(webcamCamId);
        setWebcamRecording(false);
        setSavedWebcamClipUrl(res.recording.fileUrl);
      } else {
        setSavedWebcamClipUrl(null);
        await startCameraRecording(webcamCamId);
        setWebcamRecording(true);
        setWebcamRecDuration(0);
      }
    } catch (err: any) {
      setStreamError(err.message || 'Webcam recording action failed');
    }
  };

  useEffect(() => {
    if (!webcamCamId && cameras.length) setWebcamCamId(cameras[0].id);
  }, [cameras, webcamCamId]);

  const toggleGridCamera = (id: string) => {
    setGridCameraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ---------------------------------------------------------------------
  // Browser webcam mode (single physical device)
  // ---------------------------------------------------------------------

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !webcamCamId || analyzing) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setAnalyzing(true);
      try {
        const result = await analyzeSingleFrame(webcamCamId, blob);
        setWebcamDetections({ objects: result.objects, faces: result.faces, updatedAt: Date.now() });
        setStreamError(null);
      } catch (err: any) {
        setStreamError(err.message || 'Analysis request failed');
      } finally {
        setAnalyzing(false);
      }
    }, 'image/jpeg', 0.85);
  }, [webcamCamId, analyzing]);

  const startWebcam = async () => {
    if (!webcamCamId) {
      setStreamError('Add and select a camera first (Camera Manager) - detections need a camera_id to attach to.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setWebcamActive(true);
        setStreamError(null);
        captureIntervalRef.current = window.setInterval(captureAndAnalyze, WEBCAM_CAPTURE_INTERVAL_MS);
      }
    } catch (err) {
      setStreamError('Camera permission denied or unavailable.');
    }
  };

  const stopWebcam = () => {
    if (captureIntervalRef.current) { window.clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setWebcamActive(false);
    setWebcamDetections(null);
  };

  useEffect(() => () => stopWebcam(), []);

  const gridCols = gridCameraIds.length <= 1 ? 'grid-cols-1' : gridCameraIds.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">
            <Radio className={`w-3.5 h-3.5 ${gridCameraIds.length || webcamActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span>Live Camera Analysis</span>
          </div>

          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            {gridCameraIds.length > 4 ? <Grid3x3 className="w-3.5 h-3.5" /> : <Grid2x2 className="w-3.5 h-3.5" />}
            Select Cameras for Grid ({gridCameraIds.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <select
            value={webcamCamId}
            onChange={(e) => setWebcamCamId(e.target.value)}
            disabled={webcamActive}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 disabled:opacity-50"
          >
            {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {webcamActive && (
            <button
              onClick={handleToggleWebcamRecord}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all text-xs shadow-md ${
                webcamRecording
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
              }`}
              title={webcamRecording ? 'Stop and save webcam recording' : 'Record webcam stream to MP4'}
            >
              <Disc className={`w-3.5 h-3.5 ${webcamRecording ? 'text-white' : 'text-rose-400'}`} />
              <span>
                {webcamRecording
                  ? `REC ${Math.floor(webcamRecDuration / 60)}:${(webcamRecDuration % 60).toString().padStart(2, '0')}`
                  : 'Record Webcam'}
              </span>
            </button>
          )}
          <button
            onClick={() => (webcamActive ? stopWebcam() : startWebcam())}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
              webcamActive ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <CameraIcon className="w-3.5 h-3.5" /> {webcamActive ? 'Stop Browser Webcam' : 'Start Browser Webcam'}
          </button>
        </div>
      </div>

      {savedWebcamClipUrl && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-emerald-400" />
            <span>Webcam recording saved successfully!</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={savedWebcamClipUrl}
              download
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Download .mp4
            </a>
            <button onClick={() => setSavedWebcamClipUrl(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        </div>
      )}

      {/* Camera picker for grid */}
      {showPicker && (
        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <p className="text-[11px] text-slate-400">Tick any real cameras (RTSP/ONVIF/IP/USB) to add them to the live grid below - each one streams and analyzes independently.</p>
          <div className="flex flex-wrap gap-2">
            {cameras.map((c) => {
              const checked = gridCameraIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleGridCamera(c.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    checked ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {checked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  {c.name} <span className="text-[9px] text-slate-500">({c.type})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          Could not load cameras from the backend: {error}. Is the Python server running?
        </div>
      )}
      {streamError && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{streamError}</div>
      )}
      {!loading && !cameras.length && !error && (
        <div className="p-8 text-center text-slate-500 text-sm">No cameras yet - add one in Camera Manager first.</div>
      )}

      {/* Multi-camera grid (server-side streams) */}
      {gridCameraIds.length > 0 && (
        <div className={`grid ${gridCols} gap-3`}>
          {gridCameraIds.map((id) => {
            const cam = cameras.find((c) => c.id === id);
            if (!cam) return null;
            return <LiveCameraTile key={id} camera={cam} onRemove={() => toggleGridCamera(id)} />;
          })}
        </div>
      )}

      {/* Browser webcam panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[300px]">
        <div ref={videoContainerRef} className="lg:col-span-2 relative rounded-2xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center min-h-[300px]">
          {webcamActive ? (
            <>
              <video ref={videoRef} className="w-full h-full" autoPlay playsInline muted />
              {webcamDetections?.objects.map((o, i) => (
                <div key={`o-${i}`} className="absolute border-2 border-cyan-400 rounded"
                  style={bboxToPixelStyle(o.bbox_pct, overlayRect)}>
                  <span className="absolute -top-5 left-0 bg-cyan-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                    {o.class.toUpperCase()} {Math.round(o.confidence * 100)}%
                  </span>
                </div>
              ))}
              {webcamDetections?.faces.map((f, i) => (
                <div key={`f-${i}`} className={`absolute border-2 rounded ${f.person_type === 'EMPLOYEE' ? 'border-emerald-400' : 'border-rose-500'}`}
                  style={bboxToPixelStyle(f.bbox_pct, overlayRect)}>
                  <span className={`absolute -top-5 left-0 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${f.person_type === 'EMPLOYEE' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {f.name}{f.confidence ? ` ${Math.round(f.confidence)}%` : ''}
                  </span>
                </div>
              ))}
              {analyzing && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded text-[10px] text-slate-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> Analyzing frame...
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </>
          ) : (
            <div className="text-center p-6 text-slate-500 text-xs">
              <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Start the browser webcam, or select cameras above for the server-stream grid.
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col space-y-3 overflow-y-auto">
          <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-indigo-400" /> Webcam Detections {webcamDetections && `(${new Date(webcamDetections.updatedAt).toLocaleTimeString()})`}
          </span>
          {!webcamDetections && <p className="text-xs text-slate-500">No detections yet.</p>}
          {webcamDetections?.faces.map((f, i) => (
            <div key={`fl-${i}`} className={`p-2.5 rounded-xl border text-xs ${f.person_type === 'EMPLOYEE' ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-rose-950/30 border-rose-800/50'}`}>
              <div className="flex items-center gap-1.5 font-bold">
                {f.person_type !== 'EMPLOYEE' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                {f.name}
              </div>
              {f.confidence != null && <div className="text-[10px] text-slate-400">Confidence: {Math.round(f.confidence)}%</div>}
            </div>
          ))}
          {webcamDetections?.objects.map((o, i) => (
            <div key={`ol-${i}`} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="font-bold text-cyan-300">{o.class.toUpperCase()}</div>
              <div className="text-[10px] text-slate-400">Confidence: {Math.round(o.confidence * 100)}% · {o.tracking_id}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-500 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Grid tiles show real AI telemetry (bounding boxes/labels), not raw RTSP video pixels - browsers can't decode
        RTSP directly without an HLS/WebRTC relay (not included in this build).
      </div>
    </div>
  );
};
