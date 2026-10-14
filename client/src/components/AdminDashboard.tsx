import React, { useEffect, useState } from 'react';
import {
  Shield,
  Users,
  Flag,
  Activity,
  Ban,
  LogOut,
  Trash2,
  Sparkles,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import type { ReportDTO, UserSummary, ConnectorHealthDTO } from '@kamand/shared';
import { apiFetch } from '../lib/api.js';

interface AdminOverviewResponse {
  stats: {
    totalUsers: number;
    suspendedUsers: number;
    totalConversations: number;
    totalMessagesMetadataCount: number;
    openReportsCount: number;
    totalCommunities: number;
    e2eeContentReadableByAdmin: boolean;
  };
  connectors: ConnectorHealthDTO[];
  auditLogs: Array<{
    id: string;
    action: string;
    actorUsername: string;
    targetId: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
}

export const AdminDashboard: React.FC<{ currentUser: UserSummary }> = ({ currentUser }) => {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<Array<UserSummary & { isSuspended?: boolean }>>([]);
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'reports' | 'audit'>('overview');
  const [triageByReport, setTriageByReport] = useState<
    Record<string, { severity: string; category: string; recommendedAction: string }>
  >({});

  const loadAll = async () => {
    const [ov, us, rp] = await Promise.all([
      apiFetch<AdminOverviewResponse>('/api/admin/overview'),
      apiFetch<{ users: Array<UserSummary & { isSuspended?: boolean }> }>(
        `/api/admin/users?q=${encodeURIComponent(userSearch)}`
      ),
      apiFetch<{ reports: ReportDTO[] }>('/api/admin/reports'),
    ]);
    setOverview(ov);
    setUsers(us.users);
    setReports(rp.reports);
  };

  useEffect(() => {
    void loadAll();
  }, [userSearch]);

  const handleToggleSuspend = async (targetId: string, suspend: boolean) => {
    await apiFetch(`/api/admin/users/${targetId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ suspend }),
    });
    await loadAll();
  };

  const handleForceLogout = async (targetId: string) => {
    await apiFetch(`/api/admin/users/${targetId}/force-logout`, {
      method: 'POST',
    });
    await loadAll();
  };

  const handleDeleteUser = async (targetId: string) => {
    await apiFetch(`/api/admin/users/${targetId}`, {
      method: 'DELETE',
    });
    await loadAll();
  };

  const handleResolveReport = async (
    reportId: string,
    status: 'resolved' | 'dismissed',
    suspendTargetUser = false
  ) => {
    await apiFetch(`/api/admin/reports/${reportId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        resolutionNote: `Reviewed by @${currentUser.username}`,
        suspendTargetUser,
      }),
    });
    await loadAll();
  };

  const handleAiTriageReport = async (report: ReportDTO) => {
    const res = await apiFetch<{
      triage: { severity: string; category: string; recommendedAction: string };
    }>('/api/ai/triage-report', {
      method: 'POST',
      body: JSON.stringify({
        reason: report.reason,
        attachedMessages: report.voluntarilyAttachedMessages,
      }),
    });
    setTriageByReport((prev) => ({ ...prev, [report.id]: res.triage }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      <header className="px-6 py-4 glass-chrome glass-top-highlight border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h1 className="text-heading text-lg text-white">
              Admin & Moderation Console ({currentUser.role})
            </h1>
          </div>
          <p className="text-caption text-slate-400 flex items-center gap-1 mt-0.5">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>
              Zero-Knowledge E2EE Enforcement: Admins CANNOT read private encrypted chats;
              moderation operates strictly on metadata & user-attached reports.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-2xl border border-white/10">
          {(
            [
              { id: 'overview', label: 'System & Connectors' },
              { id: 'users', label: `Users (${users.length})` },
              { id: 'reports', label: `Reports Queue (${reports.filter((r) => r.status === 'open').length})` },
              { id: 'audit', label: 'Audit Log' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`fluid-press px-3 py-1.5 rounded-xl text-xs font-semibold ${
                activeTab === t.id ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && overview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Users', value: overview.stats.totalUsers },
                { label: 'Suspended', value: overview.stats.suspendedUsers },
                { label: 'Conversations', value: overview.stats.totalConversations },
                { label: 'Msg Metadata', value: overview.stats.totalMessagesMetadataCount },
                { label: 'Open Reports', value: overview.stats.openReportsCount },
                { label: 'Communities', value: overview.stats.totalCommunities },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 text-center"
                >
                  <div className="text-xl font-bold text-white">{stat.value}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              <h2 className="text-heading text-sm text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <span>Campus Connector Health Panel</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {overview.connectors.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-400">
                        Failures: {c.failureCount} · Source: {c.sourceMode}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        c.status === 'connected'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Users className="w-4 h-4 text-sky-400" />
                <span>Campus User Directory & Session Controls</span>
              </div>
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by @username or email…"
                aria-label="Search users in admin table"
                className="w-72 rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2 text-xs text-white"
              />
            </div>

            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{u.displayName}</span>
                      <span className="text-xs text-slate-400">@{u.username}</span>
                      <span className="px-2 py-0.2 rounded bg-sky-500/15 text-sky-300 text-[10px] font-semibold">
                        {u.role}
                      </span>
                      {u.isSuspended && (
                        <span className="px-2 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{u.email}</div>
                  </div>

                  {u.id !== currentUser.id && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggleSuspend(u.id, !u.isSuspended)}
                        className="fluid-press px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-200 text-xs font-medium flex items-center gap-1"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{u.isSuspended ? 'Unsuspend' : 'Suspend'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleForceLogout(u.id)}
                        className="fluid-press px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Force Logout</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(u.id)}
                        className="fluid-press px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-3">
            <h2 className="text-heading text-sm text-white flex items-center gap-2">
              <Flag className="w-4 h-4 text-rose-400" />
              <span>User-Submitted Moderation Reports Queue</span>
            </h2>

            {reports.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No moderation reports submitted.</p>
            ) : (
              reports.map((rp) => {
                const triage = triageByReport[rp.id];
                return (
                  <div
                    key={rp.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-white">
                        Reported by @{rp.reporterUsername}{' '}
                        {rp.targetUsername ? `→ against @${rp.targetUsername}` : ''}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          rp.status === 'open'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {rp.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200">Reason: {rp.reason}</p>

                    {rp.voluntarilyAttachedMessages.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-1 text-xs">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Voluntarily Attached Message Evidence:
                        </div>
                        {rp.voluntarilyAttachedMessages.map((m, idx) => (
                          <div key={idx} className="text-slate-300">
                            <strong className="text-sky-300">{m.senderName}:</strong> {m.body}
                          </div>
                        ))}
                      </div>
                    )}

                    {triage && (
                      <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/30 text-xs text-sky-200">
                        <strong>AI Triage ({triage.severity.toUpperCase()}):</strong>{' '}
                        {triage.category} — {triage.recommendedAction}
                      </div>
                    )}

                    {rp.status === 'open' && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleAiTriageReport(rp)}
                          className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Run AI Report Triage</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleResolveReport(rp.id, 'resolved', false)}
                          className="fluid-press px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Resolve</span>
                        </button>

                        {rp.targetUserId && (
                          <button
                            type="button"
                            onClick={() => void handleResolveReport(rp.id, 'resolved', true)}
                            className="fluid-press px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-semibold"
                          >
                            Resolve & Suspend User
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleResolveReport(rp.id, 'dismissed', false)}
                          className="fluid-press px-3 py-1.5 rounded-xl bg-white/10 text-slate-300 text-xs"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'audit' && overview && (
          <div className="space-y-2">
            <h2 className="text-heading text-sm text-white">Security & Moderation Audit Log</h2>
            {overview.auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-900/70 border border-white/10 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono font-semibold text-sky-300">{log.action}</span>{' '}
                  <span className="text-slate-400">by @{log.actorUsername}</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
