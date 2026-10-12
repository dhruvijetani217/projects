import React, { useState } from 'react';
import {
  Camera as CameraIcon,
  Plus,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  Search
} from 'lucide-react';
import { Camera } from '../types';
import { CreateCameraInput } from '../api/client';

interface CameraManagerProps {
  cameras: Camera[];
  loading: boolean;
  error: string | null;
  onAddCamera: (input: CreateCameraInput) => Promise<void>;
  onDeleteCamera: (id: string) => Promise<void>;
  onTestConnection: (id: string) => Promise<void>;
}

export const CameraManager: React.FC<CameraManagerProps> = ({
  cameras, loading, error, onAddCamera, onDeleteCamera, onTestConnection,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'RTSP' | 'ONVIF' | 'IP' | 'USB' | 'WEBCAM'>('RTSP');
  const [url, setUrl] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [location, setLocation] = useState('');
  const [group, setGroup] = useState<Camera['group']>('Main Gate');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await onAddCamera({
        name: name || 'New Camera',
        code: `CAM-${Math.floor(100 + Math.random() * 900)}`,
        type, url, ipAddress, location: location || 'Unassigned', group,
        detectionCapabilities: ['FACE', 'OBJECT'],
      });
      setShowAddModal(false);
      setName(''); setUrl(''); setIpAddress(''); setLocation('');
    } catch (err: any) {
      setFormError(err.message || 'Failed to create camera');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await onTestConnection(id);
    } finally {
      setTestingId(null);
    }
  };

  const filteredCameras = cameras.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <CameraIcon className="w-5 h-5 text-indigo-400" /> Camera Stream & Device Management
          </h2>
          <p className="text-xs text-slate-400">
            Real RTSP / ONVIF / USB / IP camera connections - status reflects an actual OpenCV connection test, not a guess.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search camera or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none w-56"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Camera
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          Could not load cameras from the backend: {error}. Is the Python server running?
        </div>
      )}

      {loading && !cameras.length && (
        <div className="p-8 text-center text-slate-500 text-sm">Loading cameras from the backend...</div>
      )}

      {!loading && !cameras.length && !error && (
        <div className="p-8 text-center text-slate-500 text-sm">No cameras yet - click "Add Camera" to connect your first one.</div>
      )}

      {/* Cameras Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCameras.map((cam) => (
          <div key={cam.id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg hover:border-slate-700 transition-all">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      cam.status === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : cam.status === 'WARNING' ? 'bg-amber-500' : 'bg-slate-600'
                    }`}
                  />
                  <h3 className="font-bold text-sm text-slate-100">{cam.name}</h3>
                </div>
                <p className="text-xs text-slate-400">{cam.location}</p>
              </div>

              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                {cam.type}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Stream URL:</span>
              </div>
              <p className="text-cyan-300 truncate text-[11px] bg-slate-900 p-1.5 rounded border border-slate-800">{cam.url}</p>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                <div>
                  <span className="text-slate-500">IP Address:</span>
                  <div className="text-slate-200 font-bold">{cam.ipAddress || '-'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Latency:</span>
                  <div className="text-emerald-400 font-bold">{cam.latencyMs} ms</div>
                </div>
                <div>
                  <span className="text-slate-500">Resolution:</span>
                  <div className="text-slate-200 font-bold">{cam.resolution}</div>
                </div>
                <div>
                  <span className="text-slate-500">FPS Rate:</span>
                  <div className="text-slate-200 font-bold">{cam.fps} FPS</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono">Group: {cam.group}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleTest(cam.id)}
                  disabled={testingId === cam.id}
                  className="text-slate-400 hover:text-indigo-400 flex items-center gap-1 font-medium disabled:opacity-50"
                >
                  {testingId === cam.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : cam.status === 'ONLINE' ? (
                    <Wifi className="w-3.5 h-3.5" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5" />
                  )}
                  Test Connection
                </button>
                <button
                  onClick={() => onDeleteCamera(cam.id)}
                  className="text-slate-400 hover:text-rose-400 flex items-center gap-1 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <CameraIcon className="w-5 h-5 text-indigo-400" /> Add Camera
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">{formError}</div>
            )}

            <form onSubmit={handleCreateCamera} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Camera Name *</label>
                <input
                  type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. North Gate Camera"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Stream Protocol</label>
                  <select value={type} onChange={(e: any) => setType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono">
                    <option value="RTSP">RTSP (H.264 / H.265)</option>
                    <option value="ONVIF">ONVIF Profile S</option>
                    <option value="IP">IP Camera Stream</option>
                    <option value="USB">USB Camera (device index)</option>
                    <option value="WEBCAM">Browser Webcam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Camera Group</label>
                  <select value={group} onChange={(e: any) => setGroup(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100">
                    <option value="Main Gate">Main Gate</option>
                    <option value="Perimeter">Perimeter</option>
                    <option value="Office Floor">Office Floor</option>
                    <option value="Parking">Parking</option>
                    <option value="Factory Floor">Factory Floor</option>
                    <option value="Restricted Area">Restricted Area</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Stream URL / Device Index *</label>
                <input
                  type="text" required value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="rtsp://user:pass@192.168.1.50:554/stream  or  0 for first USB camera"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-cyan-300 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  After adding, click "Test Connection" - the backend actually opens this URL with OpenCV and reports the real result.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">IP Address</label>
                  <input
                    type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.1.50"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Location Tag</label>
                  <input
                    type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                    placeholder="Building A - Entrance"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg disabled:opacity-50 flex items-center gap-2">
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add Camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
