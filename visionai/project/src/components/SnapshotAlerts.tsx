import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldAlert,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Camera as CameraIcon,
  Filter,
  Send,
  BellRing,
  Mail,
  MessageSquare,
  Smartphone,
  Globe,
  Tag,
  Zap,
  Check,
  Trash2,
  CalendarX,
  Loader2,
  Image as ImageIcon,
  Eye,
  X,
  Maximize2,
  Search,
  RotateCcw,
  SearchX
} from 'lucide-react';
import { SnapshotEvent, AlertNotification } from '../types';

interface SnapshotAlertsProps {
  snapshots: SnapshotEvent[];
  alerts: AlertNotification[];
  loading: boolean;
  error: string | null;
  onAcknowledgeAlert: (alertId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => Promise<void>;
  onBulkDeleteSnapshots: (params: { beforeDate?: string; all?: boolean }) => Promise<{ status: string; count: number }>;
  onBulkDeleteAlerts?: (params: { beforeDate?: string; all?: boolean }) => Promise<{ status: string; count: number }>;
  onDeleteAlert?: (alertId: string) => Promise<void>;
}

const CONFIRM_WINDOW_MS = 3000;

export const SnapshotAlerts: React.FC<SnapshotAlertsProps> = ({
  snapshots,
  alerts,
  loading,
  error,
  onAcknowledgeAlert,
  onDeleteSnapshot,
  onBulkDeleteSnapshots,
  onBulkDeleteAlerts,
  onDeleteAlert,
}) => {
  const [activeTab, setActiveTab] = useState<'EVIDENCE_VAULT' | 'ALERTS_DISPATCHER'>('EVIDENCE_VAULT');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotEvent | null>(null);
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(null);

  // No browser confirm()/alert() dialogs anywhere below - fast inline
  // "click again to confirm" pattern instead, auto-reverting after CONFIRM_WINDOW_MS.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBeforeDate, setCleanupBeforeDate] = useState('');
  const [confirmingBulk, setConfirmingBulk] = useState<'before_date' | 'all' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const bulkConfirmTimerRef = useRef<number | null>(null);

  const [confirmingClearAlerts, setConfirmingClearAlerts] = useState(false);
  const clearAlertsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewSnapshot(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => () => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    if (bulkConfirmTimerRef.current) window.clearTimeout(bulkConfirmTimerRef.current);
  }, []);

  const filterCategories = [
    { id: 'ALL', label: 'All Evidence' },
    { id: 'VEHICLES', label: 'Vehicles & Transport' },
    { id: 'PERSONS', label: 'People & Staff' },
    { id: 'UNKNOWN', label: 'Unknown Visitors' },
    { id: 'SAFETY', label: 'Safety & Compliance' },
    { id: 'BELONGINGS', label: 'Bags & Electronics' },
    { id: 'RESTRICTED', label: 'Restricted Area' },
  ];

  const filteredSnapshots = snapshots.filter((s) => {
    const ev = (s.eventType || '').toUpperCase();
    const tags = (s.tags || []).map((t) => String(t).toLowerCase());
    const name = (s.recognizedName || '').toLowerCase();
    const camera = (s.cameraName || '').toLowerCase();
    const tracking = (s.trackingId || '').toLowerCase();
    const dept = (s.recognizedDept || '').toLowerCase();
    const severity = (s.severity || '').toLowerCase();

    const vehicleKeywords = ['car', 'vehicle', 'truck', 'bus', 'motorcycle', 'bicycle', 'bike', 'van', 'auto', 'airplane', 'boat', 'train', 'suv', 'scooter', 'cart', 'trailer'];
    const peopleKeywords = ['person', 'man', 'woman', 'staff', 'employee', 'pedestrian', 'human', 'child', 'visitor', 'crowd'];
    const safetyKeywords = ['helmet', 'hardhat', 'vest', 'safety', 'mask', 'violation', 'no_helmet', 'ppe', 'hazard', 'restricted'];
    const belongingKeywords = ['backpack', 'bag', 'handbag', 'suitcase', 'luggage', 'phone', 'cell phone', 'laptop', 'device', 'box', 'package', 'parcel'];

    // 1. Universal Smart Category Filtering
    let matchCategory = true;
    if (selectedCategory === 'VEHICLES') {
      matchCategory = (
        ev.includes('VEHICLE') ||
        ev.includes('CAR') ||
        tags.some((t) => vehicleKeywords.some((k) => t.includes(k)))
      );
    } else if (selectedCategory === 'PERSONS') {
      matchCategory = (
        ev.includes('PERSON') ||
        ev.includes('EMPLOYEE') ||
        tags.some((t) => peopleKeywords.some((k) => t.includes(k))) ||
        !!s.recognizedName
      );
    } else if (selectedCategory === 'UNKNOWN') {
      matchCategory = (
        ev.includes('UNKNOWN') ||
        (tags.some((t) => peopleKeywords.some((k) => t.includes(k))) && !s.recognizedName) ||
        tags.includes('unknown')
      );
    } else if (selectedCategory === 'SAFETY') {
      matchCategory = (
        ev.includes('HELMET') ||
        ev.includes('VIOLATION') ||
        ev.includes('SAFETY') ||
        tags.some((t) => safetyKeywords.some((k) => t.includes(k)))
      );
    } else if (selectedCategory === 'BELONGINGS') {
      matchCategory = tags.some((t) => belongingKeywords.some((k) => t.includes(k)));
    } else if (selectedCategory === 'RESTRICTED') {
      matchCategory = (
        ev.includes('RESTRICTED') ||
        tags.some((t) => t.includes('restricted') || t.includes('zone') || t.includes('boundary'))
      );
    }

    if (!matchCategory) return false;

    // 2. Search Query Matching (matches ANY keyword dynamically)
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();

    return (
      name.includes(q) ||
      ev.toLowerCase().includes(q) ||
      tags.some((t) => t.includes(q)) ||
      camera.includes(q) ||
      tracking.includes(q) ||
      dept.includes(q) ||
      severity.includes(q)
    );
  });

  const downloadSnapshotMetadata = (snap: SnapshotEvent) => {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(snap, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `VisionAI_Snapshot_${snap.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const downloadSnapshotImage = async (snap: SnapshotEvent) => {
    setDownloadingPhotoId(snap.id);
    try {
      const response = await fetch(snap.imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = (snap.recognizedName || snap.eventType || 'snapshot').replace(/[^a-zA-Z0-9-_]/g, '_');
      a.download = `VisionAI_${cleanName}_${snap.id.slice(0, 8)}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionMessage('Could not download the photo - the backend media server may be unreachable.');
      window.setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setDownloadingPhotoId(null);
    }
  };

  /** Fast, no-popup delete: first click arms a 3s "confirm" state on that
   *  card's own delete button; a second click within the window actually
   *  deletes (real DB row + real photo file on disk). */
  const handleDelete = async (snap: SnapshotEvent) => {
    if (confirmingId !== snap.id) {
      setConfirmingId(snap.id);
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setConfirmingId(null), CONFIRM_WINDOW_MS);
      return;
    }
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    setConfirmingId(null);
    setDeletingId(snap.id);
    try {
      await onDeleteSnapshot(snap.id);
    } catch (err) {
      setActionMessage('Delete failed - is the backend running?');
      window.setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async (mode: 'before_date' | 'all') => {
    if (mode === 'before_date' && !cleanupBeforeDate) return;
    if (confirmingBulk !== mode) {
      setConfirmingBulk(mode);
      if (bulkConfirmTimerRef.current) window.clearTimeout(bulkConfirmTimerRef.current);
      bulkConfirmTimerRef.current = window.setTimeout(() => setConfirmingBulk(null), CONFIRM_WINDOW_MS);
      return;
    }
    if (bulkConfirmTimerRef.current) window.clearTimeout(bulkConfirmTimerRef.current);
    setConfirmingBulk(null);

    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = mode === 'all'
        ? await onBulkDeleteSnapshots({ all: true })
        : await onBulkDeleteSnapshots({ beforeDate: cleanupBeforeDate });
      setBulkMessage(`Deleted ${result.count} snapshot(s).`);
      setCleanupBeforeDate('');
    } catch (err) {
      setBulkMessage('Bulk delete failed - is the backend running?');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleClearAlerts = async () => {
    if (!confirmingClearAlerts) {
      setConfirmingClearAlerts(true);
      if (clearAlertsTimerRef.current) window.clearTimeout(clearAlertsTimerRef.current);
      clearAlertsTimerRef.current = window.setTimeout(() => setConfirmingClearAlerts(false), CONFIRM_WINDOW_MS);
      return;
    }
    if (clearAlertsTimerRef.current) window.clearTimeout(clearAlertsTimerRef.current);
    setConfirmingClearAlerts(false);

    try {
      if (onBulkDeleteAlerts) {
        await onBulkDeleteAlerts({ all: true });
      }
      setActionMessage('All alert notifications cleared successfully.');
      window.setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setActionMessage('Failed to clear alerts.');
      window.setTimeout(() => setActionMessage(null), 3000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('EVIDENCE_VAULT')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'EVIDENCE_VAULT' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" /> Evidence Vault ({snapshots.length})
          </button>

          <button
            onClick={() => setActiveTab('ALERTS_DISPATCHER')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ALERTS_DISPATCHER' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <BellRing className="w-4 h-4" /> Live Alert Dispatcher ({alerts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'EVIDENCE_VAULT' && (
            <button
              onClick={() => setCleanupOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold shadow-sm self-start sm:self-auto"
            >
              <CalendarX className="w-3.5 h-3.5" /> Cleanup Old Files
            </button>
          )}

          {activeTab === 'ALERTS_DISPATCHER' && alerts.length > 0 && (
            <button
              onClick={handleClearAlerts}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all self-start sm:self-auto ${
                confirmingClearAlerts
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmingClearAlerts ? 'Confirm: Wipe All Alerts' : 'Clear All Alerts'}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'EVIDENCE_VAULT' && (
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          {/* Quick Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by object (car, person, truck), name, camera, ID..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs p-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Smart Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto no-scrollbar">
            {filterCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800 text-amber-300 text-xs">
          {actionMessage}
        </div>
      )}

      {activeTab === 'EVIDENCE_VAULT' && cleanupOpen && (
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <p className="text-[11px] text-slate-400">
            Free up disk space from old evidence snapshots. Deletes the real saved photo, not just the entry -
            useful for a 24/7 install so storage doesn't grow forever.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-slate-400">Delete everything from before:</label>
            <input
              type="date"
              value={cleanupBeforeDate}
              onChange={(e) => { setCleanupBeforeDate(e.target.value); setConfirmingBulk(null); }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => handleBulkDelete('before_date')}
              disabled={!cleanupBeforeDate || bulkBusy}
              className={`px-3 py-1 rounded-lg text-white text-[11px] font-semibold disabled:opacity-40 transition-colors ${
                confirmingBulk === 'before_date' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-700 hover:bg-amber-600'
              }`}
            >
              {confirmingBulk === 'before_date' ? 'Click again to confirm' : 'Delete Older Than This Date'}
            </button>
            <button
              onClick={() => handleBulkDelete('all')}
              disabled={bulkBusy}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-white text-[11px] font-semibold disabled:opacity-40 transition-colors ${
                confirmingBulk === 'all' ? 'bg-rose-500 hover:bg-rose-400' : 'bg-rose-700 hover:bg-rose-600'
              }`}
            >
              <Trash2 className="w-3 h-3" /> {confirmingBulk === 'all' ? 'Click again to confirm' : 'Delete All Snapshots'}
            </button>
            {bulkBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
          {bulkMessage && <p className="text-[11px] text-emerald-400">{bulkMessage}</p>}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          Could not load snapshots/alerts from the backend: {error}. Is the Python server running?
        </div>
      )}
      {loading && !snapshots.length && !alerts.length && (
        <div className="p-8 text-center text-slate-500 text-sm">Loading from the backend...</div>
      )}      {activeTab === 'EVIDENCE_VAULT' ? (
        filteredSnapshots.length === 0 ? (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-400 shadow-inner">
              <SearchX className="w-8 h-8 text-indigo-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-100">No Evidence Snapshots Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {searchQuery
                  ? `No snapshot records match the search term "${searchQuery}" in the selected category.`
                  : `No snapshots found under the "${filterCategories.find((c) => c.id === selectedCategory)?.label || selectedCategory}" filter.`}
              </p>
            </div>
            {(selectedCategory !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters &amp; Show All</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSnapshots.map((snap) => (
              <div key={snap.id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl hover:border-slate-700 transition-all relative group">
                <button
                  onClick={() => handleDelete(snap)}
                  disabled={deletingId === snap.id}
                  title={confirmingId === snap.id ? 'Click again to confirm delete' : 'Delete this snapshot'}
                  className={`absolute top-2 right-2 z-10 rounded-lg p-1.5 transition-all disabled:opacity-100 shadow-md ${
                    confirmingId === snap.id
                      ? 'bg-rose-600 text-white text-[10px] font-bold px-2'
                      : 'bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-800/80'
                  }`}
                >
                  {deletingId === snap.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirmingId === snap.id ? 'Sure?' : <Trash2 className="w-3.5 h-3.5" />}
                </button>

                <div
                  onClick={() => setPreviewSnapshot(snap)}
                  className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 cursor-pointer group/img"
                >
                  <img
                    src={snap.imageUrl}
                    alt={snap.eventType}
                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                  />

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs">
                    <Eye className="w-4 h-4 text-indigo-400" />
                    <span>Click to View Photo</span>
                  </div>

                  <div
                    className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold ${
                      snap.severity === 'CRITICAL'
                        ? 'bg-rose-600 text-white animate-pulse'
                        : snap.severity === 'HIGH'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {snap.eventType.replace('_', ' ')}
                  </div>

                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-900/90 text-cyan-300 font-mono text-[10px] border border-cyan-500/30">
                    ByteTrack: {snap.trackingId}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{snap.recognizedName || snap.cameraName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{snap.timestamp}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Confidence Score</span>
                    <span className="font-bold text-emerald-400 font-mono">{Math.round(snap.confidence * 100)}%</span>
                  </div>

                  {snap.tags && snap.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <Tag className="w-3 h-3 text-slate-500" />
                      {snap.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-mono">{snap.cameraName}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewSnapshot(snap)}
                      title="View full resolution photo"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] shadow-sm transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" /> Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSnapshotMetadata(snap)}
                      title="Download event metadata (JSON)"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-[11px] transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-400" /> Data
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="font-bold text-xs uppercase text-slate-400 tracking-wider">Multi-Channel Alert Gateway</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-slate-400 text-[10px]">Email Dispatch</span>
                  <div className="font-bold text-slate-100">Active (WhatsApp/Gmail settings)</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="text-slate-400 text-[10px]">SMS Gateway</span>
                  <div className="font-bold text-slate-400">Not configured</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="text-slate-400 text-[10px]">Mobile Push</span>
                  <div className="font-bold text-slate-400">Not configured</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-slate-400 text-[10px]">Alerts saved to DB</span>
                  <div className="font-bold text-slate-100">Active</div>
                </div>
              </div>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-200">No Active Security Alerts</h4>
                <p className="text-xs text-slate-400 mt-0.5">All camera streams are operating normally. Real-time dispatches will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alt) => (
                <div
                  key={alt.id}
                  className={`p-4 rounded-2xl bg-slate-900 border space-y-3 transition-all ${
                    alt.severity === 'CRITICAL' ? 'border-rose-500/50 bg-rose-950/10' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {alt.imageUrl && (
                        <div
                          onClick={() =>
                            setPreviewSnapshot({
                              id: alt.id,
                              cameraName: 'Live Security Alert',
                              eventType: alt.type,
                              severity: alt.severity as any,
                              imageUrl: alt.imageUrl!,
                              trackingId: 'ALERT',
                              confidence: 1.0,
                              tags: ['ALERT', alt.type],
                              acknowledged: alt.readStatus,
                              timestamp: alt.timestamp,
                            })
                          }
                          className="cursor-pointer group/alertimg relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-700 hover:border-indigo-500 transition-all shadow-sm"
                          title="Click to view alert photo"
                        >
                          <img src={alt.imageUrl} alt="Alert" className="w-full h-full object-cover group-hover/alertimg:scale-110 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/alertimg:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-sm text-slate-100">{alt.title}</h4>
                        <p className="text-xs text-slate-300 mt-0.5">{alt.message}</p>
                      </div>
                    </div>

                    <span className="text-xs font-mono text-slate-400">{alt.timestamp}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span>Dispatched to:</span>
                      {alt.channelSent.map((ch) => (
                        <span key={ch} className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-mono">
                          {ch}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      {!alt.readStatus ? (
                        <button
                          onClick={() => onAcknowledgeAlert(alt.id)}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                        >
                          <Check className="w-3.5 h-3.5" /> Acknowledge Alert
                        </button>
                      ) : (
                        <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged
                        </span>
                      )}

                      {onDeleteAlert && (
                        <button
                          onClick={() => onDeleteAlert(alt.id)}
                          title="Delete Alert Notification"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Resolution Photo Viewer Modal */}
      {previewSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewSnapshot(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/70">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    previewSnapshot.severity === 'CRITICAL'
                      ? 'bg-rose-600 text-white'
                      : previewSnapshot.severity === 'HIGH'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {previewSnapshot.eventType.replace('_', ' ')}
                </span>
                <h3 className="font-bold text-sm text-slate-100">
                  {previewSnapshot.recognizedName || previewSnapshot.cameraName}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  {previewSnapshot.timestamp}
                </span>
              </div>

              <button
                onClick={() => setPreviewSnapshot(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Image View */}
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/60 min-h-[320px]">
              <img
                src={previewSnapshot.imageUrl}
                alt={previewSnapshot.eventType}
                className="max-h-[60vh] max-w-full object-contain rounded-xl border border-slate-800 shadow-xl"
              />
            </div>

            {/* Modal Details & Actions Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {previewSnapshot.trackingId && (
                  <span className="px-2 py-1 rounded bg-slate-800 text-cyan-300 font-mono border border-slate-700">
                    Tracking: {previewSnapshot.trackingId}
                  </span>
                )}
                <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Camera: {previewSnapshot.cameraName}
                </span>
                {previewSnapshot.confidence > 0 && (
                  <span className="px-2 py-1 rounded bg-emerald-950 text-emerald-400 font-mono border border-emerald-800/50">
                    Confidence: {Math.round(previewSnapshot.confidence * 100)}%
                  </span>
                )}
                {previewSnapshot.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadSnapshotImage(previewSnapshot)}
                  disabled={downloadingPhotoId === previewSnapshot.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {downloadingPhotoId === previewSnapshot.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Downloading Photo...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Photo (JPG)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => downloadSnapshotMetadata(previewSnapshot)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download Data (JSON)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};