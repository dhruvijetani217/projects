import React from 'react';
import {
  Video,
  Upload,
  UserCheck,
  Sparkles,
  Clock,
  Users,
  Camera,
  ShieldAlert,
  BarChart3,
  Bell,
  ShieldCheck,
  Activity,
  Cpu,
  Building2,
  Car,
  Home,
  HardHat,
  Filter,
  Layers
} from 'lucide-react';

export type NavTab =
  | 'LIVE_MONITORING'
  | 'OFFLINE_VIDEO'
  | 'FACE_REGISTRATION'
  | 'AI_SEARCH'
  | 'ATTENDANCE'
  | 'LEAVE_VISITORS'
  | 'CAMERA_MANAGER'
  | 'CAMERA_HEALTH'
  | 'SNAPSHOTS_ALERTS'
  | 'ANALYTICS'
  | 'NOTIFICATIONS';

export type SurveillanceMode = 'ALL' | 'OFFICE' | 'TRAFFIC' | 'HOME' | 'INDUSTRIAL';

export const MODE_TABS: Record<SurveillanceMode, NavTab[]> = {
  ALL: [
    'LIVE_MONITORING',
    'OFFLINE_VIDEO',
    'AI_SEARCH',
    'SNAPSHOTS_ALERTS',
    'FACE_REGISTRATION',
    'ATTENDANCE',
    'LEAVE_VISITORS',
    'CAMERA_MANAGER',
    'CAMERA_HEALTH',
    'ANALYTICS',
    'NOTIFICATIONS'
  ],
  OFFICE: [
    'LIVE_MONITORING',
    'OFFLINE_VIDEO',
    'AI_SEARCH',
    'SNAPSHOTS_ALERTS',
    'FACE_REGISTRATION',
    'ATTENDANCE',
    'LEAVE_VISITORS',
    'CAMERA_MANAGER',
    'CAMERA_HEALTH',
    'ANALYTICS',
    'NOTIFICATIONS'
  ],
  TRAFFIC: [
    'LIVE_MONITORING',
    'OFFLINE_VIDEO',
    'AI_SEARCH',
    'SNAPSHOTS_ALERTS',
    'CAMERA_MANAGER',
    'CAMERA_HEALTH',
    'ANALYTICS',
    'NOTIFICATIONS'
  ],
  HOME: [
    'LIVE_MONITORING',
    'OFFLINE_VIDEO',
    'AI_SEARCH',
    'SNAPSHOTS_ALERTS',
    'FACE_REGISTRATION',
    'CAMERA_MANAGER',
    'CAMERA_HEALTH',
    'NOTIFICATIONS'
  ],
  INDUSTRIAL: [
    'LIVE_MONITORING',
    'OFFLINE_VIDEO',
    'AI_SEARCH',
    'SNAPSHOTS_ALERTS',
    'FACE_REGISTRATION',
    'ATTENDANCE',
    'CAMERA_MANAGER',
    'CAMERA_HEALTH',
    'ANALYTICS',
    'NOTIFICATIONS'
  ]
};

interface NavItem {
  id: NavTab;
  label: string;
  icon: any;
  badge?: string;
  badgeType?: string;
  highlight?: boolean;
}

interface NavSection {
  title: string;
  dotColor: string;
  items: NavItem[];
}

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onlineCamerasCount: number;
  unacknowledgedAlertsCount: number;
  surveillanceMode: SurveillanceMode;
  setSurveillanceMode: (mode: SurveillanceMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onlineCamerasCount,
  unacknowledgedAlertsCount,
  surveillanceMode,
  setSurveillanceMode
}) => {
  const allowedTabs = MODE_TABS[surveillanceMode] || MODE_TABS.ALL;

  const navSections: NavSection[] = [
    {
      title: 'Real-Time Operations',
      dotColor: 'bg-emerald-400',
      items: [
        { id: 'LIVE_MONITORING' as NavTab, label: 'Live CCTV Monitoring', icon: Video, badge: `${onlineCamerasCount} Live`, badgeType: 'live' },
        { id: 'OFFLINE_VIDEO' as NavTab, label: 'Offline Video Analysis', icon: Upload, badge: 'MP4 / AVI', badgeType: 'neutral' },
      ]
    },
    {
      title: 'AI Intelligence & Search',
      dotColor: 'bg-indigo-400',
      items: [
        { id: 'AI_SEARCH' as NavTab, label: 'AI Natural Language Search', icon: Sparkles, highlight: true },
        { id: 'SNAPSHOTS_ALERTS' as NavTab, label: surveillanceMode === 'TRAFFIC' ? 'Traffic Snapshots & Alerts' : 'Snapshots & Alert Evidence', icon: ShieldAlert, badge: unacknowledgedAlertsCount > 0 ? `${unacknowledgedAlertsCount} New` : undefined, badgeType: 'danger' },
      ]
    },
    {
      title: surveillanceMode === 'HOME' ? 'Known Family & Members' : 'Access Control & Staff',
      dotColor: 'bg-cyan-400',
      items: [
        { id: 'FACE_REGISTRATION' as NavTab, label: surveillanceMode === 'HOME' ? 'Family & Member Enrollment' : 'Face Registration & Enrolment', icon: UserCheck },
        { id: 'ATTENDANCE' as NavTab, label: 'Attendance & Time Tracking', icon: Clock },
        { id: 'LEAVE_VISITORS' as NavTab, label: 'Visitors & Leave Management', icon: Users },
      ]
    },
    {
      title: 'Infrastructure & System',
      dotColor: 'bg-amber-400',
      items: [
        { id: 'CAMERA_MANAGER' as NavTab, label: 'Camera Stream Manager', icon: Camera },
        { id: 'CAMERA_HEALTH' as NavTab, label: 'Camera Health & Diagnostics', icon: Activity, badge: 'Fleet Health', badgeType: 'live' },
        { id: 'ANALYTICS' as NavTab, label: surveillanceMode === 'TRAFFIC' ? 'Traffic Analytics' : 'Executive Analytics', icon: BarChart3 },
        { id: 'NOTIFICATIONS' as NavTab, label: 'Notification Settings', icon: Bell },
      ]
    }
  ];

  // Filter out items and sections that are not applicable in this mode
  const filteredSections = navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowedTabs.includes(item.id))
  })).filter((section) => section.items.length > 0);

  return (
    <aside className="w-64 bg-slate-900/95 backdrop-blur-md border-r border-slate-800/80 flex flex-col justify-between shrink-0 select-none shadow-2xl z-20">
      {/* Navigation Scrollable Area without bulky scrollbar */}
      <div className="p-3.5 space-y-4 overflow-y-auto no-scrollbar flex-1">
        {/* Domain View Filter Selector */}
        <div className="p-2.5 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-400" /> Domain View
            </span>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold font-mono border ${
              surveillanceMode === 'TRAFFIC'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                : surveillanceMode === 'HOME'
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800/60'
                : surveillanceMode === 'INDUSTRIAL'
                ? 'bg-amber-950 text-amber-300 border-amber-800/60'
                : 'bg-indigo-950 text-indigo-300 border-indigo-800/60'
            }`}>
              {surveillanceMode === 'ALL' ? 'FULL SYSTEM' : surveillanceMode}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setSurveillanceMode('ALL')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                surveillanceMode === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3 h-3" /> All
            </button>
            <button
              type="button"
              onClick={() => setSurveillanceMode('OFFICE')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                surveillanceMode === 'OFFICE'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3 h-3" /> Office
            </button>
            <button
              type="button"
              onClick={() => setSurveillanceMode('TRAFFIC')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                surveillanceMode === 'TRAFFIC'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Car className="w-3 h-3" /> Traffic
            </button>
            <button
              type="button"
              onClick={() => setSurveillanceMode('HOME')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                surveillanceMode === 'HOME'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Home className="w-3 h-3" /> Home
            </button>
            <button
              type="button"
              onClick={() => setSurveillanceMode('INDUSTRIAL')}
              className={`col-span-2 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                surveillanceMode === 'INDUSTRIAL'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <HardHat className="w-3 h-3" /> Industrial / Factory
            </button>
          </div>
        </div>

        {filteredSections.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center gap-2 px-3 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${section.dotColor} shadow-sm`} />
              <h3 className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">
                {section.title}
              </h3>
            </div>

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 relative group ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 border-l-2 border-indigo-400'
                        : item.highlight
                        ? 'text-indigo-300 hover:bg-slate-800/90 bg-indigo-950/40 border border-indigo-900/50 hover:text-white'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 hover:translate-x-0.5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-white' : item.highlight ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'
                      }`} />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge && (
                      <span className={`px-2 py-0.5 text-[9.5px] font-mono rounded-full font-bold shadow-sm shrink-0 ml-1.5 ${
                        item.badgeType === 'danger'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                          : item.badgeType === 'live'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isActive
                          ? 'bg-indigo-800/80 text-indigo-100 border border-indigo-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer System Status Radar */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 text-xs space-y-2 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>VisionAI Engine</span>
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-800/60">
            <span className="flex items-center gap-1 text-slate-400">
              <Cpu className="w-3 h-3 text-cyan-400" /> Neural Vision Engine
            </span>
            <span className="text-emerald-400 font-mono font-bold">ONLINE</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
