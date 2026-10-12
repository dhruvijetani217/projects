import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavTab, SurveillanceMode, MODE_TABS } from './components/Sidebar';
import { LiveMonitoring } from './components/LiveMonitoring';
import { OfflineVideoAnalysis } from './components/OfflineVideoAnalysis';
import { FaceRegistration } from './components/FaceRegistration';
import { AIVideoSearch } from './components/AIVideoSearch';
import { AttendanceManager } from './components/AttendanceManager';
import { LeaveVisitorManager } from './components/LeaveVisitorManager';
import { CameraManager } from './components/CameraManager';
import { CameraHealthDashboard } from './components/CameraHealthDashboard';
import { SnapshotAlerts } from './components/SnapshotAlerts';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { NotificationSettings } from './components/NotificationSettings';
import { DataControlModal } from './components/DataControlModal';

import * as api from './api/client';
import { ApiError } from './api/config';
import {
  SnapshotEvent, Employee, Camera, Company, Branch, Building, Floor,
  AttendanceRecord, Visitor, LeaveRequest, AlertNotification,
} from './types';

const EMPTY_COMPANY: Company = { id: '', name: 'No company yet', code: '-', branchesCount: 0, totalCameras: 0, totalEmployees: 0 };

/** Generic async fetch-state hook so every domain (cameras, employees, ...) follows the same real load/error pattern. */
function useApiState<T>(initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed - is the backend running?');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  return { data, setData, loading, error, run };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>(
    (localStorage.getItem('visionai_active_tab') as NavTab) || 'LIVE_MONITORING'
  );
  const [surveillanceMode, setSurveillanceMode] = useState<SurveillanceMode>(
    (localStorage.getItem('visionai_surveillance_mode') as SurveillanceMode) || 'ALL'
  );
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isDataControlOpen, setIsDataControlOpen] = useState(false);
  const [isDataCleared, setIsDataCleared] = useState(false);

  // Load database-persisted system settings on boot
  useEffect(() => {
    api.getSystemSettings()
      .then((settings) => {
        if (settings?.active_surveillance_mode) {
          setSurveillanceMode(settings.active_surveillance_mode);
          localStorage.setItem('visionai_surveillance_mode', settings.active_surveillance_mode);
        }
        if (settings?.active_tab) {
          const mode = settings.active_surveillance_mode || 'ALL';
          const allowed = MODE_TABS[mode] || MODE_TABS.ALL;
          if (allowed.includes(settings.active_tab as NavTab)) {
            setActiveTab(settings.active_tab as NavTab);
            localStorage.setItem('visionai_active_tab', settings.active_tab);
          }
        }
      })
      .catch((err) => {
        console.warn('System settings loaded from localStorage (DB sync unavailable):', err);
      });
  }, []);

  const handleSurveillanceModeChange = (mode: SurveillanceMode) => {
    setSurveillanceMode(mode);
    localStorage.setItem('visionai_surveillance_mode', mode);
    const allowed = MODE_TABS[mode] || MODE_TABS.ALL;
    let nextTab = activeTab;
    if (!allowed.includes(activeTab)) {
      nextTab = 'LIVE_MONITORING';
      setActiveTab(nextTab);
      localStorage.setItem('visionai_active_tab', nextTab);
    }
    // Persist permanently in SQLite database
    api.updateSystemSettings({ active_surveillance_mode: mode, active_tab: nextTab }).catch((err) => {
      console.error('Failed to persist surveillance mode to database:', err);
    });
  };

  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);
    localStorage.setItem('visionai_active_tab', tab);
    api.updateSystemSettings({ active_tab: tab }).catch(() => {});
  };

  // Multi-tenant selection
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');

  // Real backend-backed state - every one of these is fetched from the FastAPI server, never fabricated.
  const companiesState = useApiState<Company[]>([]);
  const branchesState = useApiState<Branch[]>([]);
  const buildingsState = useApiState<Building[]>([]);
  const floorsState = useApiState<Floor[]>([]);
  const camerasState = useApiState<Camera[]>([]);
  const employeesState = useApiState<Employee[]>([]);
  const attendanceState = useApiState<AttendanceRecord[]>([]);
  const visitorsState = useApiState<Visitor[]>([]);
  const leavesState = useApiState<LeaveRequest[]>([]);
  const snapshotsState = useApiState<SnapshotEvent[]>([]);
  const alertsState = useApiState<AlertNotification[]>([]);

  const employeesById = useMemo(() => new Map(employeesState.data.map((e) => [e.id, e])), [employeesState.data]);
  const camerasById = useMemo(() => new Map(camerasState.data.map((c) => [c.id, c])), [camerasState.data]);

  // ---------------------------------------------------------------------
  // Initial + refetch loaders
  // ---------------------------------------------------------------------

  const refetchCameras = useCallback(() => camerasState.run(() => api.getCameras()), []);
  const refetchEmployees = useCallback(() => employeesState.run(() => api.getEmployees()), []);
  const refetchAttendance = useCallback(
    () => attendanceState.run(() => api.getAttendance(employeesById)),
    [employeesById]
  );
  const refetchVisitors = useCallback(() => visitorsState.run(() => api.getVisitors()), []);
  const refetchLeaves = useCallback(
    () => leavesState.run(() => api.getLeaves(employeesById)),
    [employeesById]
  );
  const refetchSnapshots = useCallback(
    () => snapshotsState.run(() => api.getSnapshots(camerasById)),
    [camerasById]
  );
  const refetchAlerts = useCallback(
    () => alertsState.run(() => api.getAlerts(camerasById)),
    [camerasById]
  );

  const refetchAll = useCallback(() => {
    refetchCameras().catch(() => {});
    refetchEmployees().catch(() => {});
    refetchVisitors().catch(() => {});
    refetchAttendance().catch(() => {});
    refetchLeaves().catch(() => {});
    refetchSnapshots().catch(() => {});
    refetchAlerts().catch(() => {});
  }, [refetchCameras, refetchEmployees, refetchVisitors, refetchAttendance, refetchLeaves, refetchSnapshots, refetchAlerts]);

  // Load everything once on mount.
  useEffect(() => {
    companiesState.run(() => api.getCompanies()).then((cs) => { if (cs[0]) setSelectedCompanyId(cs[0].id); }).catch(() => {});
    branchesState.run(() => api.getBranches()).then((bs) => { if (bs[0]) setSelectedBranchId(bs[0].id); }).catch(() => {});
    buildingsState.run(() => api.getBuildings()).then((bs) => { if (bs[0]) setSelectedBuildingId(bs[0].id); }).catch(() => {});
    floorsState.run(() => api.getFloors()).then((fs) => { if (fs[0]) setSelectedFloorId(fs[0].id); }).catch(() => {});
    refetchCameras().catch(() => {});
    refetchEmployees().catch(() => {});
    refetchVisitors().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attendance/leaves/snapshots/alerts depend on employees/cameras being loaded first (for name joins).
  useEffect(() => { if (employeesState.data.length || !employeesState.loading) refetchAttendance().catch(() => {}); }, [employeesState.loading]);
  useEffect(() => { if (employeesState.data.length || !employeesState.loading) refetchLeaves().catch(() => {}); }, [employeesState.loading]);
  useEffect(() => { if (camerasState.data.length || !camerasState.loading) refetchSnapshots().catch(() => {}); }, [camerasState.loading]);
  useEffect(() => { if (camerasState.data.length || !camerasState.loading) refetchAlerts().catch(() => {}); }, [camerasState.loading]);

  // Keyboard shortcut for Command+K to trigger AI Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActiveTab('AI_SEARCH');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---------------------------------------------------------------------
  // Real handlers - every one calls the FastAPI backend, then refreshes
  // local state from what the server actually now contains.
  // ---------------------------------------------------------------------

  const handleAddCamera = async (input: api.CreateCameraInput) => {
    await api.createCamera(input);
    await refetchCameras();
  };
  const handleDeleteCamera = async (id: string) => {
    await api.deleteCamera(id);
    await refetchCameras();
  };
  const handleTestConnection = async (id: string) => {
    await api.testCameraConnection(id);
    await refetchCameras();
  };

  const handleCreateEmployee = async (input: api.CreateEmployeeInput): Promise<Employee> => {
    const emp = await api.createEmployee(input);
    await refetchEmployees();
    return emp;
  };

  const handleManualCheckIn = async (employeeId: string, reason: string) => {
    const now = new Date();
    await api.recordManualAttendance({
      employeeId,
      date: now.toISOString().split('T')[0],
      checkInTime: now.toISOString(),
      status: 'PRESENT',
    });
    await refetchAttendance();
  };

  const handleCreateVisitor = async (input: api.CreateVisitorInput) => {
    await api.createVisitor(input);
    await refetchVisitors();
  };
  const handleCheckoutVisitor = async (id: string) => {
    await api.checkoutVisitor(id);
    await refetchVisitors();
  };
  const handleDecideLeave = async (leaveId: string, approve: boolean) => {
    await api.decideLeave(leaveId, approve ? 'APPROVED' : 'REJECTED', 'HR Admin');
    await refetchLeaves();
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    await api.markAlertRead(alertId);
    await refetchAlerts();
  };

  /** Real delete: removes the DB row AND the saved image file on disk (python_app: crud.delete_snapshot). */
  const handleDeleteSnapshot = async (snapshotId: string) => {
    await api.deleteSnapshot(snapshotId);
    await refetchSnapshots();
    await refetchAlerts();
  };

  const handleDeleteAttendance = async (id: string) => {
    await api.deleteAttendanceRecord(id);
    await refetchAttendance();
  };

  const handleDeleteAlert = async (id: string) => {
    await api.deleteAlert(id);
    await refetchAlerts();
    await refetchSnapshots();
  };

  const handleBulkDeleteAlerts = async (params: { beforeDate?: string; all?: boolean }) => {
    const result = await api.bulkDeleteAlerts(params);
    await refetchAlerts();
    await refetchSnapshots();
    return result;
  };

  /** Bulk cleanup for 24/7 installs: purges BOTH snapshots and alert notifications so counts sync to 0 immediately. */
  const handleBulkDeleteSnapshots = async (params: { beforeDate?: string; all?: boolean }) => {
    const result = await api.bulkDeleteSnapshots(params);
    try {
      await api.bulkDeleteAlerts(params);
    } catch {
      // ignore if alerts already empty
    }
    await refetchSnapshots();
    await refetchAlerts();
    return result;
  };

  const unreadAlertsCount = alertsState.data.filter((a) => !a.readStatus).length;
  const onlineCamerasCount = camerasState.data.filter((c) => c.status === 'ONLINE').length;
  const currentCompany = companiesState.data.find((c) => c.id === selectedCompanyId) || companiesState.data[0] || EMPTY_COMPANY;

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header Bar */}
      <Header
        companies={companiesState.data}
        branches={branchesState.data}
        buildings={buildingsState.data}
        floors={floorsState.data}
        selectedCompanyId={selectedCompanyId}
        setSelectedCompanyId={setSelectedCompanyId}
        selectedBranchId={selectedBranchId}
        setSelectedBranchId={setSelectedBranchId}
        selectedBuildingId={selectedBuildingId}
        setSelectedBuildingId={setSelectedBuildingId}
        selectedFloorId={selectedFloorId}
        setSelectedFloorId={setSelectedFloorId}
        onOpenAISearch={() => handleTabChange('AI_SEARCH')}
        unreadAlertsCount={unreadAlertsCount}
        onOpenAlerts={() => handleTabChange('SNAPSHOTS_ALERTS')}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onOpenDataControl={() => setIsDataControlOpen(true)}
      />

      {/* Main Workspace with Sidebar Navigation */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onlineCamerasCount={onlineCamerasCount}
          unacknowledgedAlertsCount={unreadAlertsCount}
          surveillanceMode={surveillanceMode}
          setSurveillanceMode={handleSurveillanceModeChange}
        />

        {/* Tab View Container */}
        <main className="flex-1 h-full overflow-hidden relative">
          {activeTab === 'LIVE_MONITORING' && (
            <LiveMonitoring cameras={camerasState.data} loading={camerasState.loading} error={camerasState.error} />
          )}

          {activeTab === 'OFFLINE_VIDEO' && (
            <OfflineVideoAnalysis employees={employeesState.data} surveillanceMode={surveillanceMode} />
          )}

          {activeTab === 'FACE_REGISTRATION' && (
            <FaceRegistration
              employees={employeesState.data}
              loading={employeesState.loading}
              error={employeesState.error}
              onCreateEmployee={handleCreateEmployee}
              onFaceRegistered={refetchEmployees}
            />
          )}

          {activeTab === 'AI_SEARCH' && (
            <AIVideoSearch />
          )}

          {activeTab === 'ATTENDANCE' && (
            <AttendanceManager
              attendanceRecords={attendanceState.data}
              employees={employeesState.data}
              loading={attendanceState.loading}
              error={attendanceState.error}
              onManualCheckIn={handleManualCheckIn}
              onDeleteRecord={handleDeleteAttendance}
            />
          )}

          {activeTab === 'LEAVE_VISITORS' && (
            <LeaveVisitorManager
              employees={employeesState.data}
              visitors={visitorsState.data}
              leaves={leavesState.data}
              loading={visitorsState.loading || leavesState.loading}
              error={visitorsState.error || leavesState.error}
              onCreateVisitor={handleCreateVisitor}
              onCheckoutVisitor={handleCheckoutVisitor}
              onDecideLeave={handleDecideLeave}
            />
          )}

          {activeTab === 'CAMERA_MANAGER' && (
            <CameraManager
              cameras={camerasState.data}
              loading={camerasState.loading}
              error={camerasState.error}
              onAddCamera={handleAddCamera}
              onDeleteCamera={handleDeleteCamera}
              onTestConnection={handleTestConnection}
            />
          )}

          {activeTab === 'CAMERA_HEALTH' && (
            <CameraHealthDashboard
              cameras={camerasState.data}
              onRefreshCameras={refetchCameras}
            />
          )}

          {activeTab === 'SNAPSHOTS_ALERTS' && (
            <SnapshotAlerts
              snapshots={snapshotsState.data}
              alerts={alertsState.data}
              loading={snapshotsState.loading || alertsState.loading}
              error={snapshotsState.error || alertsState.error}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onDeleteSnapshot={handleDeleteSnapshot}
              onBulkDeleteSnapshots={handleBulkDeleteSnapshots}
              onBulkDeleteAlerts={handleBulkDeleteAlerts}
              onDeleteAlert={handleDeleteAlert}
            />
          )}

          {activeTab === 'ANALYTICS' && (
            <AnalyticsDashboard
              company={currentCompany}
              cameras={camerasState.data}
              employees={employeesState.data}
              snapshots={snapshotsState.data}
              alerts={alertsState.data}
            />
          )}

          {activeTab === 'NOTIFICATIONS' && (
            <NotificationSettings />
          )}
        </main>
      </div>

      {/* Test Custom Data Manager Modal */}
      <DataControlModal
        isOpen={isDataControlOpen}
        onClose={() => setIsDataControlOpen(false)}
        onClearStaticData={async () => {
          setIsDataCleared(true);
          try {
            await api.bulkDeleteSnapshots({ all: true });
            await api.bulkDeleteAlerts({ all: true });
          } catch (err) {
            console.warn('Wipe data error:', err);
          }
          await refetchSnapshots();
          await refetchAlerts();
        }}
        onRestoreSampleData={() => {
          setIsDataCleared(false);
          refetchAll();
        }}
        isDataCleared={isDataCleared}
        totalEmployees={employeesState.data.length}
        totalCameras={camerasState.data.length}
        totalSnapshots={snapshotsState.data.length}
        totalAlerts={alertsState.data.length}
        totalAttendance={attendanceState.data.length}
      />
    </div>
  );
}
