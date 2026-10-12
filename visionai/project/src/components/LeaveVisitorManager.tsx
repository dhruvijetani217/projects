import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Calendar,
  Loader2
} from 'lucide-react';
import { Visitor, LeaveRequest, Employee } from '../types';
import { CreateVisitorInput } from '../api/client';

interface LeaveVisitorManagerProps {
  employees: Employee[];
  visitors: Visitor[];
  leaves: LeaveRequest[];
  loading: boolean;
  error: string | null;
  onCreateVisitor: (input: CreateVisitorInput) => Promise<void>;
  onCheckoutVisitor: (id: string) => Promise<void>;
  onDecideLeave: (leaveId: string, approve: boolean) => Promise<void>;
}

export const LeaveVisitorManager: React.FC<LeaveVisitorManagerProps> = ({
  employees, visitors, leaves, loading, error, onCreateVisitor, onCheckoutVisitor, onDecideLeave,
}) => {
  const [activeTab, setActiveTab] = useState<'VISITORS' | 'LEAVES'>('VISITORS');

  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorCompany, setVisitorCompany] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [hostEmpId, setHostEmpId] = useState(employees[0]?.id || '');
  const [visitorCategory, setVisitorCategory] = useState<'REGULAR' | 'VIP' | 'BLACK_LISTED'>('REGULAR');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const handleCreateVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    const host = employees.find((emp) => emp.id === hostEmpId);
    setSubmitting(true);
    try {
      await onCreateVisitor({
        fullName: visitorName, phone: visitorPhone, company: visitorCompany,
        hostEmployeeId: host?.id, hostName: host?.fullName, visitReason: reason,
        category: visitorCategory,
      });
      setShowVisitorModal(false);
      setVisitorName(''); setVisitorCompany(''); setVisitorPhone(''); setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveLeave = async (id: string, approve: boolean) => {
    setDecidingId(id);
    try {
      await onDecideLeave(id, approve);
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Header Tabs */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('VISITORS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'VISITORS' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" /> Visitor Pass & Blacklist Management
          </button>

          <button
            onClick={() => setActiveTab('LEAVES')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'LEAVES' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" /> Employee Leave & Shifts
          </button>
        </div>

        {activeTab === 'VISITORS' && (
          <button
            onClick={() => setShowVisitorModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md"
          >
            <UserPlus className="w-4 h-4" /> Issue New Visitor Pass
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          Could not load from the backend: {error}. Is the Python server running?
        </div>
      )}

      {activeTab === 'VISITORS' ? (
        <div className="space-y-4">
          {!loading && !visitors.length && !error && (
            <div className="p-8 text-center text-slate-500 text-sm">No visitors yet - click "Issue New Visitor Pass" to add one.</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visitors.map((vis) => (
              <div
                key={vis.id}
                className={`p-4 rounded-2xl bg-slate-900 border space-y-3 shadow-lg ${
                  vis.category === 'BLACK_LISTED'
                    ? 'border-rose-500/50 bg-rose-950/10'
                    : vis.category === 'VIP'
                    ? 'border-amber-500/50 bg-amber-950/10'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">{vis.fullName}</h3>
                    <p className="text-xs text-slate-400">{vis.company}</p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      vis.category === 'BLACK_LISTED'
                        ? 'bg-rose-600 text-white animate-pulse'
                        : vis.category === 'VIP'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                    }`}
                  >
                    {vis.category}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pass Code:</span>
                    <span className="font-mono text-cyan-300 font-bold">{vis.passNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Host Employee:</span>
                    <span className="text-slate-200 font-medium">{vis.hostName || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Purpose:</span>
                    <span className="text-slate-300">{vis.visitReason || '-'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Check In: {vis.checkInTime ? new Date(vis.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                  {vis.badgeStatus === 'ISSUED' ? (
                    <button
                      onClick={() => onCheckoutVisitor(vis.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                    >
                      Check Out
                    </button>
                  ) : (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        vis.badgeStatus === 'BLOCKED' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {vis.badgeStatus}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!loading && !leaves.length && !error && (
            <div className="p-8 text-center text-slate-500 text-sm">No leave requests yet.</div>
          )}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-950/60 border-b border-slate-800">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Leave Type</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {leaves.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-bold text-slate-100">{req.employeeName}</td>
                    <td className="p-3 font-semibold text-indigo-400">{req.leaveType}</td>
                    <td className="p-3 font-mono text-slate-300">
                      {req.startDate} to {req.endDate} ({req.days} days)
                    </td>
                    <td className="p-3 text-slate-300">{req.reason}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : req.status === 'PENDING'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {req.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApproveLeave(req.id, true)}
                            disabled={decidingId === req.id}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] disabled:opacity-50 flex items-center gap-1"
                          >
                            {decidingId === req.id && <Loader2 className="w-3 h-3 animate-spin" />} Approve
                          </button>
                          <button
                            onClick={() => handleApproveLeave(req.id, false)}
                            disabled={decidingId === req.id}
                            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">By {req.approverName || 'HR Admin'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issue Visitor Modal */}
      {showVisitorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" /> Issue Visitor Access Badge
              </h3>
              <button onClick={() => setShowVisitorModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateVisitor} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Visitor Full Name *</label>
                <input type="text" required value={visitorName} onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="e.g. Jonathan Sterling"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Organization / Company</label>
                  <input type="text" value={visitorCompany} onChange={(e) => setVisitorCompany(e.target.value)}
                    placeholder="e.g. Sentinel Corp"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Phone Number</label>
                  <input type="text" value={visitorPhone} onChange={(e) => setVisitorPhone(e.target.value)}
                    placeholder="+1 (555) 019-2831"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Purpose of Visit</label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Client Consultation"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Host Staff Member</label>
                  <select value={hostEmpId} onChange={(e) => setHostEmpId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100">
                    <option value="">- None -</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Security Badge Tag</label>
                  <select value={visitorCategory} onChange={(e: any) => setVisitorCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-bold">
                    <option value="REGULAR">Regular Visitor</option>
                    <option value="VIP">VIP Delegate</option>
                    <option value="BLACK_LISTED">Blacklisted Entity</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowVisitorModal(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg disabled:opacity-50 flex items-center gap-2">
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Issue Digital Pass Badge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
