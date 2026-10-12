import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Play,
  Pause,
  Clock,
  Download,
  Sliders,
  Video,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Film,
  Trash2,
  Building2,
  Car,
  Home,
  HardHat,
  UserCheck,
  Eye,
  ShieldCheck,
  Zap,
  Save
} from 'lucide-react';
import { Employee } from '../types';
import {
  uploadVideo,
  getVideos,
  getVideo,
  getVideoTimeline,
  videoPlaybackUrl,
  deleteVideo,
  bulkDeleteVideos,
  exportVideoClip,
  downloadFullVideo,
  getAttendancePolicy,
  updateAttendancePolicy,
  getSystemSettings,
  updateSystemSettings
} from '../api/client';
import { ApiError } from '../api/config';
import { RawVideo, RawVideoFrame } from '../api/rawTypes';
import { useVideoOverlayRect, bboxToPixelStyle } from '../hooks/useVideoOverlayRect';
import { ConfirmModal } from './ConfirmModal';

interface OfflineVideoAnalysisProps {
  employees: Employee[];
  surveillanceMode?: 'ALL' | 'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL';
}

const ALLOWED_TYPES = ['.mp4', '.avi', '.mov', '.mkv'];
const POLL_INTERVAL_MS = 600;

export const OfflineVideoAnalysis: React.FC<OfflineVideoAnalysisProps> = ({ employees, surveillanceMode }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const [videoHistory, setVideoHistory] = useState<RawVideo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pendingDeleteVideoId, setPendingDeleteVideoId] = useState<string | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const [video, setVideo] = useState<RawVideo | null>(null);
  const [timeline, setTimeline] = useState<RawVideoFrame[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<RawVideoFrame | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liveOverlay, setLiveOverlay] = useState(true);
  const [exportingClipId, setExportingClipId] = useState<string | null>(null);
  const [downloadingFullVideoId, setDownloadingFullVideoId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [surveillanceProfile, setSurveillanceProfile] = useState<'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL'>(
    surveillanceMode && surveillanceMode !== 'ALL' ? surveillanceMode : 'OFFICE'
  );
  const [enableAttendance, setEnableAttendance] = useState<boolean>(surveillanceMode !== 'TRAFFIC' && surveillanceMode !== 'HOME');
  const [enableFaceRecognition, setEnableFaceRecognition] = useState<boolean>(surveillanceMode !== 'TRAFFIC');
  const [enableObjectDetection, setEnableObjectDetection] = useState<boolean>(true);
  const [shiftStartTime, setShiftStartTime] = useState<string>('09:00');
  const [shiftEndTime, setShiftEndTime] = useState<string>('17:00');
  const [savingDefaultShift, setSavingDefaultShift] = useState<boolean>(false);
  const [savedDefaultShiftSuccess, setSavedDefaultShiftSuccess] = useState<boolean>(false);

  // Load shift hours from database on mount
  useEffect(() => {
    getAttendancePolicy()
      .then((policy) => {
        if (policy) {
          if (policy.shift_start_time) setShiftStartTime(policy.shift_start_time);
          if (policy.shift_end_time) setShiftEndTime(policy.shift_end_time);
        }
      })
      .catch(() => {
        getSystemSettings().then((s) => {
          if (s.shift_start_time) setShiftStartTime(s.shift_start_time);
          if (s.shift_end_time) setShiftEndTime(s.shift_end_time);
        }).catch(() => {});
      });
  }, []);

  const handleSaveDefaultShift = async () => {
    setSavingDefaultShift(true);
    try {
      await updateAttendancePolicy({
        shift_start_time: shiftStartTime,
        shift_end_time: shiftEndTime,
      });
      setSavedDefaultShiftSuccess(true);
      setTimeout(() => setSavedDefaultShiftSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to save default shift hours to DB:', e);
    } finally {
      setSavingDefaultShift(false);
    }
  };

  const handleSelectProfile = (profile: 'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL') => {
    setSurveillanceProfile(profile);
    if (profile === 'TRAFFIC') {
      setEnableAttendance(false);
      setEnableFaceRecognition(false);
      setEnableObjectDetection(true);
    } else if (profile === 'HOME') {
      setEnableAttendance(false);
      setEnableFaceRecognition(true);
      setEnableObjectDetection(true);
    } else if (profile === 'INDUSTRIAL') {
      setEnableAttendance(true);
      setEnableFaceRecognition(true);
      setEnableObjectDetection(true);
    } else { // OFFICE
      setEnableAttendance(true);
      setEnableFaceRecognition(true);
      setEnableObjectDetection(true);
    }
  };

  useEffect(() => {
    if (surveillanceMode && surveillanceMode !== 'ALL') {
      handleSelectProfile(surveillanceMode);
    }
  }, [surveillanceMode]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const overlayRect = useVideoOverlayRect(videoRef, videoContainerRef);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const list = await getVideos();
      setVideoHistory(list);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : 'Could not load video history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  const loadVideoResult = async (v: RawVideo) => {
    setVideo(v);
    setLocalFile(null);
    setLocalPreviewUrl(null);
    setSelectedFrame(null);
    if (v.status === 'DONE' || v.status === 'PROCESSING') {
      const frames = await getVideoTimeline(v.id);
      setTimeline(frames);
      if (frames[0]) setSelectedFrame(frames[0]);
    } else {
      setTimeline([]);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const handleFileSelected = async (file: File) => {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_TYPES.includes(ext)) {
      setUploadError(`Unsupported file type "${ext}". Allowed: ${ALLOWED_TYPES.join(', ')}`);
      return;
    }
    stopPolling();
    setUploadError(null);
    setTimeline([]);
    setSelectedFrame(null);
    setLocalFile(file);
    setLocalPreviewUrl(URL.createObjectURL(file));
    setUploading(true);

    try {
      const uploaded = await uploadVideo(
        file,
        undefined,
        surveillanceProfile,
        enableAttendance,
        enableFaceRecognition,
        enableObjectDetection,
        shiftStartTime,
        shiftEndTime
      );
      setVideo(uploaded);
      refreshHistory();
      pollRef.current = window.setInterval(async () => {
        try {
          const updated = await getVideo(uploaded.id);
          setVideo(updated);

          // Real-time progressive timeline streaming: fetch new frames while processing
          try {
            const frames = await getVideoTimeline(uploaded.id);
            if (frames && frames.length > 0) {
              setTimeline(frames);
              setSelectedFrame((prev) => prev || frames[0]);
            }
          } catch {
            // ignore timeline fetch errors while processing
          }

          if (updated.status === 'DONE') {
            stopPolling();
            const finalFrames = await getVideoTimeline(uploaded.id);
            setTimeline(finalFrames);
            if (finalFrames[0]) setSelectedFrame(finalFrames[0]);
            refreshHistory();
          } else if (updated.status === 'FAILED') {
            stopPolling();
            setUploadError('Processing failed on the backend - check the server logs.');
            refreshHistory();
          }
        } catch (err) {
          stopPolling();
          setUploadError(err instanceof ApiError ? err.message : 'Lost connection while checking processing status');
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    else { videoRef.current.play(); setIsPlaying(true); }
  };

  /** Real-time sync: as the video plays, keep swapping in whichever real
   *  analyzed frame is closest to (at or before) the current playback time -
   *  so bounding boxes track the video instead of only updating on a click. */
  const handleTimeUpdate = () => {
    if (!liveOverlay || !videoRef.current || !timeline.length) return;
    const t = videoRef.current.currentTime;
    let nearest: RawVideoFrame | null = null;
    for (const f of timeline) {
      if (f.timestamp_seconds <= t + 0.05) nearest = f;
      else break;
    }
    // Clear the overlay once we've moved past a detection's window (avoids boxes "sticking" on empty frames)
    if (nearest && t - nearest.timestamp_seconds > 1.5) nearest = null;
    setSelectedFrame(nearest);
  };

  const handleJumpToFrame = (frame: RawVideoFrame) => {
    setSelectedFrame(frame);
    if (videoRef.current) {
      videoRef.current.currentTime = frame.timestamp_seconds;
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const playbackUrl = localPreviewUrl || (video ? videoPlaybackUrl(video) : null);
  const filteredTimeline = timeline.map((f) => ({
    ...f,
    detected_objects: f.detected_objects.filter((o) => o.confidence * 100 >= confidenceThreshold),
  })).filter((f) => f.detected_objects.length > 0);

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visionai_video_analysis_${video?.id || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportClip = async (e: React.MouseEvent, frame: RawVideoFrame) => {
    e.stopPropagation();
    if (!video) return;
    setExportingClipId(frame.id);
    setExportError(null);
    try {
      const startSec = Math.max(0, frame.timestamp_seconds - 2.5);
      const endSec = video.duration_seconds > 0
        ? Math.min(video.duration_seconds, frame.timestamp_seconds + 2.5)
        : frame.timestamp_seconds + 2.5;

      const rawBase = video.filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
      const filename = `${rawBase}_event_${frame.timestamp_seconds.toFixed(1)}s_clip.mp4`;

      await exportVideoClip(video.id, startSec, endSec, filename);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : (err as Error).message || 'Failed to export clip');
    } finally {
      setExportingClipId(null);
    }
  };

  const handleDownloadFullVideo = async (e: React.MouseEvent, targetVideo: RawVideo) => {
    e.stopPropagation();
    setDownloadingFullVideoId(targetVideo.id);
    setExportError(null);
    try {
      const rawName = targetVideo.filename || `video_${targetVideo.id.slice(0, 8)}.mp4`;
      await downloadFullVideo(targetVideo.id, rawName);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : (err as Error).message || 'Failed to download full video');
    } finally {
      setDownloadingFullVideoId(null);
    }
  };

  const isProcessing = video && (video.status === 'UPLOADED' || video.status === 'PROCESSING');

  const handleConfirmDeleteVideo = async () => {
    if (!pendingDeleteVideoId) return;
    const vid = pendingDeleteVideoId;
    setPendingDeleteVideoId(null);
    try {
      await deleteVideo(vid);
      if (video?.id === vid) {
        setVideo(null);
        setTimeline([]);
        setSelectedFrame(null);
      }
      refreshHistory();
    } catch (err) {
      console.error('Delete video error:', err);
    }
  };

  const toggleSelectAllVideos = () => {
    if (selectedVideoIds.size === videoHistory.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(videoHistory.map((v) => v.id)));
    }
  };

  const toggleSelectVideo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmBulkDeleteVideos = async () => {
    setIsBulkDeleteModalOpen(false);
    try {
      if (selectedVideoIds.size === videoHistory.length && videoHistory.length > 0) {
        await bulkDeleteVideos({ all: true });
      } else {
        for (const vid of Array.from<string>(selectedVideoIds)) {
          await deleteVideo(vid);
        }
      }
      setSelectedVideoIds(new Set());
      setVideo(null);
      setTimeline([]);
      setSelectedFrame(null);
      refreshHistory();
    } catch (err) {
      console.error('Bulk delete video error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      <ConfirmModal
        isOpen={!!pendingDeleteVideoId}
        title="Delete Video Recording?"
        message="Are you sure you want to permanently delete this video recording and all associated frame analysis data from disk?"
        confirmText="Delete Video"
        cancelText="Cancel"
        onConfirm={handleConfirmDeleteVideo}
        onCancel={() => setPendingDeleteVideoId(null)}
      />

      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        title={`Delete ${selectedVideoIds.size} Video(s)?`}
        message={`Are you sure you want to delete ${selectedVideoIds.size} selected video recording(s) and all their frame data from disk?`}
        confirmText="Delete Selected"
        cancelText="Cancel"
        onConfirm={handleConfirmBulkDeleteVideos}
        onCancel={() => setIsBulkDeleteModalOpen(false)}
      />

      {/* Top Banner & Control */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Film className="w-5 h-5 text-indigo-400" /> Offline Video Intelligence & Timeline
            </h2>
            <p className="text-xs text-slate-400">
              Upload CCTV footage (MP4/AVI/MOV/MKV) &rarr; server runs automated object tracking and biometric recognition frame-by-frame &rarr; populates interactive timeline.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!isProcessing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-md disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading...' : 'Upload Video File'}
            </button>
            <input
              type="file" ref={fileInputRef} accept="video/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFileSelected(e.target.files[0]); }}
            />
          </div>
        </div>

        {/* Surveillance Profile & Modular Capability Controls */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
            <div>
              <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400" /> Surveillance Domain Profile:
              </span>
              <p className="text-[11px] text-slate-400">
                Choose a pre-configured profile or toggle individual AI modules below to optimize speed &amp; data relevance.
              </p>
            </div>

            {/* Profile Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectProfile('OFFICE')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                  surveillanceProfile === 'OFFICE'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Office / Corporate</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProfile('TRAFFIC')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                  surveillanceProfile === 'TRAFFIC'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>Traffic &amp; Road</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProfile('HOME')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                  surveillanceProfile === 'HOME'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Home &amp; Residential</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProfile('INDUSTRIAL')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                  surveillanceProfile === 'INDUSTRIAL'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <HardHat className="w-3.5 h-3.5" />
                <span>Industrial / Site</span>
              </button>
            </div>
          </div>

          {/* Granular Module Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Object & Vehicle Detection Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <div className="flex items-center gap-2">
                <Eye className={`w-4 h-4 ${enableObjectDetection ? 'text-indigo-400' : 'text-slate-500'}`} />
                <div>
                  <span className="font-semibold text-xs text-slate-200 block">Objects &amp; Vehicles</span>
                  <span className="text-[10px] text-slate-400">YOLO Object Detection</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableObjectDetection}
                  onChange={(e) => setEnableObjectDetection(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Face Recognition Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <div className="flex items-center gap-2">
                <UserCheck className={`w-4 h-4 ${enableFaceRecognition ? 'text-cyan-400' : 'text-slate-500'}`} />
                <div>
                  <span className="font-semibold text-xs text-slate-200 block">Face Biometrics</span>
                  <span className="text-[10px] text-slate-400">ArcFace Recognition</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableFaceRecognition}
                  onChange={(e) => {
                    setEnableFaceRecognition(e.target.checked);
                    if (!e.target.checked) setEnableAttendance(false);
                  }}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            {/* Attendance Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${enableAttendance ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div>
                  <span className="font-semibold text-xs text-slate-200 block">Employee Attendance</span>
                  <span className="text-[10px] text-slate-400">Shift Clock-In &amp; Log</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAttendance}
                  disabled={!enableFaceRecognition}
                  onChange={(e) => setEnableAttendance(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-40"></div>
              </label>
            </div>
          </div>

          {/* Shift Time Configuration when Attendance is Enabled */}
          {enableAttendance && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> Shift Hours:
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Start:</span>
                  <input
                    type="time"
                    value={shiftStartTime}
                    onChange={(e) => setShiftStartTime(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-100 font-mono px-2 py-0.5 rounded text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">End:</span>
                  <input
                    type="time"
                    value={shiftEndTime}
                    onChange={(e) => setShiftEndTime(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-100 font-mono px-2 py-0.5 rounded text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDefaultShift}
                  disabled={savingDefaultShift}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 hover:text-white transition-all disabled:opacity-50"
                  title="Save this shift timing into database as official office hours"
                >
                  {savingDefaultShift ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                      <span>Saving to DB...</span>
                    </>
                  ) : savedDefaultShiftSuccess ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300 font-medium">Saved to Database!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3 text-indigo-400" />
                      <span>Save as Office Default</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {!localFile && !video && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`p-8 rounded-xl border-2 border-dashed text-center text-xs transition-all ${
              isDragging ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 text-slate-500'
            }`}
          >
            <Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Drag and drop a video file here, or use the Upload button above.
          </div>
        )}

        {uploadError && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {uploadError}
          </div>
        )}

        {isProcessing && (
          <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800 text-indigo-300 text-xs flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            Backend status: <span className="font-mono font-bold">{video.status}</span> - analyzing real frames server-side, this can take a little while on CPU.
          </div>
        )}

        {video?.status === 'DONE' && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> Processing complete - {timeline.length} event(s) found across {video.total_frames} frames ({video.duration_seconds.toFixed(1)}s, {video.fps.toFixed(0)} fps).
          </div>
        )}
      </div>

      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
              <Film className="w-4 h-4 text-indigo-400" /> Previously Processed Videos ({videoHistory.length})
            </h3>
            {videoHistory.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                <input
                  type="checkbox"
                  checked={selectedVideoIds.size === videoHistory.length && videoHistory.length > 0}
                  onChange={toggleSelectAllVideos}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <span className="font-semibold text-[11px]">Select All ({videoHistory.length})</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedVideoIds.size > 0 && (
              <button
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all animate-pulse"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedVideoIds.size})
              </button>
            )}

            {videoHistory.length > 0 && (
              <button
                onClick={() => {
                  setSelectedVideoIds(new Set(videoHistory.map((v) => v.id)));
                  setIsBulkDeleteModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-xs border border-rose-800 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete All Videos
              </button>
            )}

            {historyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
          </div>
        </div>

        {historyError && <p className="text-xs text-rose-400">{historyError}</p>}
        {!historyLoading && !videoHistory.length && !historyError && (
          <p className="text-xs text-slate-500">No videos uploaded yet - this list is read straight from the database, so anything you upload will still be here after a refresh.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {videoHistory.map((v) => {
            const displayStatus = video?.id === v.id ? video.status : v.status;
            return (
              <div
                key={v.id}
                onClick={() => loadVideoResult(v)}
                className={`px-3 py-2 rounded-xl border text-xs text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedVideoIds.has(v.id)
                    ? 'bg-rose-950/40 border-rose-500/60'
                    : video?.id === v.id
                    ? 'bg-indigo-950/80 border-indigo-500'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedVideoIds.has(v.id)}
                    onChange={(e) => toggleSelectVideo(v.id, e as any)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <div>
                    <div className="font-bold text-slate-200 truncate max-w-[180px]">{v.filename}</div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className={`px-1.5 py-0.5 rounded font-mono ${
                        displayStatus === 'DONE' ? 'bg-emerald-950 text-emerald-400' : displayStatus === 'FAILED' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'
                      }`}>{displayStatus}</span>
                      <span>{new Date(v.uploaded_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleDownloadFullVideo(e, v)}
                    disabled={downloadingFullVideoId === v.id}
                    title="Download Full Recorded Video"
                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-600/30 text-emerald-400 hover:text-white border border-emerald-500/30 transition-all shrink-0 disabled:opacity-50"
                  >
                    {downloadingFullVideoId === v.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteVideoId(v.id);
                    }}
                    title="Delete Video Recording"
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-600/30 text-rose-400 hover:text-white border border-rose-500/30 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {playbackUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: video player + overlay for the selected frame's real detections */}
          <div className="lg:col-span-2 space-y-3">
            <div ref={videoContainerRef} className="relative rounded-2xl overflow-hidden bg-black border border-slate-800">
              <video
                ref={videoRef}
                src={playbackUrl}
                className="w-full aspect-video"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                controls
              />
              {selectedFrame?.detected_objects.filter((o) => o.confidence * 100 >= confidenceThreshold).map((o) => {
                const label = o.label.toLowerCase();
                let borderCls = 'border-sky-400';
                let badgeCls = 'bg-sky-600';
                if (o.type === 'FACE') {
                  if (o.face_person_type === 'EMPLOYEE') {
                    borderCls = 'border-emerald-400';
                    badgeCls = 'bg-emerald-600';
                  } else {
                    borderCls = 'border-rose-500';
                    badgeCls = 'bg-rose-600';
                  }
                } else if (label === 'person') {
                  borderCls = 'border-amber-400';
                  badgeCls = 'bg-amber-600';
                } else if (['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'].includes(label)) {
                  borderCls = 'border-purple-400';
                  badgeCls = 'bg-purple-600';
                } else if (['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'airplane', 'boat', 'train'].includes(label)) {
                  borderCls = 'border-cyan-400';
                  badgeCls = 'bg-cyan-600';
                } else if (['traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'potted plant'].includes(label)) {
                  borderCls = 'border-emerald-400';
                  badgeCls = 'bg-emerald-700';
                }
                return (
                  <div key={o.id}
                    className={`absolute border-2 rounded pointer-events-none ${borderCls}`}
                    style={bboxToPixelStyle(o.bbox, overlayRect)}>
                    <span className={`absolute -top-5 left-0 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${badgeCls}`}>
                      {o.label} {Math.round(o.confidence * 100)}%
                    </span>
                  </div>
                );
              })}
              {isPlaying && liveOverlay && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded text-[10px] text-emerald-300 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Overlay
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLiveOverlay((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all ${
                    liveOverlay ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {liveOverlay ? 'Live Overlay: ON' : 'Live Overlay: OFF'}
                </button>
                {video && (
                  <button
                    type="button"
                    onClick={(e) => handleDownloadFullVideo(e, video)}
                    disabled={downloadingFullVideoId === video.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition-all shadow-sm disabled:opacity-50"
                  >
                    {downloadingFullVideoId === video.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Download Full Video</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-slate-200">Confidence filter:</span>
                <span className="font-mono text-indigo-400 font-bold">{confidenceThreshold}%</span>
              </div>
              <input
                type="range" min={0} max={95} value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
                className="w-48 h-1.5 bg-slate-800 accent-indigo-500 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Right: real timeline built from backend detections */}
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" /> Detection Timeline
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">{filteredTimeline.length} event(s)</span>
              </div>

              {isProcessing && (
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5 text-[11px]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      ⚡ AI Video Analysis in Progress...
                    </span>
                    <span className="font-mono font-bold text-indigo-400 text-[11px]">
                      {video?.progress_percent ?? 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-2 rounded-full transition-all duration-300 shadow-sm"
                      style={{ width: `${Math.max(video?.progress_percent || 0, 5)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Processed {video?.processed_frames || 0} sampled frames</span>
                    <span className="text-emerald-400 font-semibold">{filteredTimeline.length} real events streamed</span>
                  </div>
                </div>
              )}

              {!isProcessing && video?.status === 'DONE' && (
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Analysis Complete (100%)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-300">{filteredTimeline.length} total event(s)</span>
                </div>
              )}

              {!timeline.length && !isProcessing && video?.status === 'DONE' && (
                <p className="text-xs text-slate-500">No detections found in this video.</p>
              )}

              {exportError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{exportError}</span>
                  </div>
                  <button onClick={() => setExportError(null)} className="text-rose-400 hover:text-rose-200 text-xs font-bold px-1">✕</button>
                </div>
              )}

              <p className="text-xs text-slate-400">Click any event to jump to that timestamp, or click Export Clip to download a ~5s video cut of that event.</p>

              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                {filteredTimeline.map((frame) => {
                  const isSelected = selectedFrame?.id === frame.id;
                  return (
                    <div
                      key={frame.id}
                      onClick={() => handleJumpToFrame(frame)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                        isSelected ? 'bg-indigo-950/80 border-indigo-500 ring-2 ring-indigo-500/40 shadow-md' : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-bold text-indigo-300 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-400" /> {frame.timestamp_seconds.toFixed(1)}s
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleExportClip(e, frame)}
                          disabled={exportingClipId === frame.id}
                          title={`Export ~5s MP4 clip around ${frame.timestamp_seconds.toFixed(1)}s`}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500/60 font-bold text-[10px] transition-all disabled:opacity-50 shadow-sm"
                        >
                          {exportingClipId === frame.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                              <span>Exporting...</span>
                            </>
                          ) : (
                            <>
                              <Film className="w-3 h-3 text-indigo-400" />
                              <span>Export Clip</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs font-bold text-slate-100">{frame.timeline_text}</p>
                      <div className="flex flex-wrap gap-1">
                        {frame.detected_objects.map((o) => (
                          <span key={o.id} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                            {o.label} {Math.round(o.confidence * 100)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={(e) => video && handleDownloadFullVideo(e, video)}
                  disabled={!video || downloadingFullVideoId === video.id}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
                >
                  {downloadingFullVideoId === video?.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export Full Video</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={exportLog}
                  disabled={!timeline.length}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Export Log (JSON)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
