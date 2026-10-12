import React, { useState } from 'react';
import {
  Building2,
  Video,
  ShieldAlert,
  Search,
  Bell,
  Cpu,
  Activity,
  Layers,
  Sparkles,
  Sun,
  Moon,
  ChevronDown,
  User,
  CheckCircle2,
  Database
} from 'lucide-react';
import { Company, Branch, Building, Floor } from '../types';

interface HeaderProps {
  companies: Company[];
  branches: Branch[];
  buildings: Building[];
  floors: Floor[];
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  selectedBuildingId: string;
  setSelectedBuildingId: (id: string) => void;
  selectedFloorId: string;
  setSelectedFloorId: (id: string) => void;
  onOpenAISearch: () => void;
  unreadAlertsCount: number;
  onOpenAlerts: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  onOpenDataControl: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  companies,
  branches,
  buildings,
  floors,
  selectedCompanyId,
  setSelectedCompanyId,
  selectedBranchId,
  setSelectedBranchId,
  selectedBuildingId,
  setSelectedBuildingId,
  selectedFloorId,
  setSelectedFloorId,
  onOpenAISearch,
  unreadAlertsCount,
  onOpenAlerts,
  isDarkMode,
  setIsDarkMode,
  onOpenDataControl,
}) => {
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0];
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId) || buildings[0];

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 md:px-6 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md text-slate-100 shadow-lg">
      {/* Brand & Multi-Tenant Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-md shadow-indigo-500/20 text-white font-bold text-xl">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              VisionAI <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-medium">Enterprise v2.4</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-none">AI Video Intelligence Platform</p>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 hidden md:block" />

        {/* Tenant Hierarchical Dropdown */}
        <div className="relative hidden lg:block">
          <button
            onClick={() => setShowTenantDropdown(!showTenantDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="max-w-[140px] truncate font-semibold text-slate-100">{selectedCompany?.name || 'No company yet'}</span>
            <span className="text-slate-500">/</span>
            <span className="max-w-[120px] truncate">{selectedBranch?.name || 'No branch yet'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showTenantDropdown && (
            <div className="absolute top-full left-0 mt-2 w-80 p-3 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 text-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" /> Multi-Tenant Hierarchy
                </span>
                <span className="text-[10px] text-slate-400">SaaS / On-Premise</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-1">Company / Entity</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-1">Branch / Site</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} - {b.location}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-1">Building</label>
                <select
                  value={selectedBuildingId}
                  onChange={(e) => setSelectedBuildingId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  onClick={() => setShowTenantDropdown(false)}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[11px] font-medium"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Natural Language Search Command Bar */}
      <div className="flex-1 max-w-lg mx-4 hidden md:block">
        <button
          onClick={onOpenAISearch}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-800/90 border border-slate-700/80 hover:border-indigo-500/80 text-slate-400 hover:text-slate-200 transition-all text-xs group shadow-inner"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-400 group-hover:animate-pulse" />
            <span>Search live video... <span className="italic text-slate-500">"Show Rahul yesterday carrying laptop"</span></span>
          </div>
          <kbd className="px-2 py-0.5 rounded bg-slate-700 border border-slate-600 text-[10px] font-mono text-slate-300">⌘K</kbd>
        </button>
      </div>

      {/* Right System Telemetry & Quick Action Menu */}
      <div className="flex items-center gap-3">
        {/* Hardware Status */}
        <div className="hidden xl:flex items-center gap-3 px-3 py-1 rounded-lg bg-slate-800/60 border border-slate-800 text-[11px]">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-semibold text-emerald-300">Vision AI Active</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>GPU Accelerated</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1 text-slate-300">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>60 FPS</span>
          </div>
        </div>

        {/* Manage Data Button */}
        <button
          onClick={onOpenDataControl}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 text-xs font-bold transition-all shadow-md"
          title="Inspect & Test Real Datasets"
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Test Your Data</span>
        </button>

        {/* Alerts Bell */}
        <button
          onClick={onOpenAlerts}
          className="relative p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-slate-300 hover:text-white transition-all shadow-sm group"
          title="Live System Security Alerts"
        >
          <Bell className="w-4 h-4 transition-transform group-hover:rotate-12" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9.5px] font-mono font-extrabold text-white bg-rose-600 rounded-full border-2 border-slate-900 shadow-md animate-pulse">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Dark/Light Mode Toggle */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors"
          title="Toggle UI Color Scheme"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-indigo-500/30">
            SA
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-semibold text-slate-200 leading-none">Security Admin</div>
            <div className="text-[10px] text-slate-400">Super Administrator</div>
          </div>
        </div>
      </div>
    </header>
  );
};
