import React, { useState, useEffect } from 'react';
import { Plus, Eye, Trash2, Lock, Users } from 'lucide-react';
import type { StatusDTO, UserSummary } from '@kamand/shared';
import { useSocialStore } from '../store/useSocialStore.js';
import { FluidSheet } from './FluidSheet.js';

interface StatusTrayProps {
  currentUser: UserSummary;
}

const BG_PALETTE = ['#0284c7', '#4f46e5', '#059669', '#d97706', '#e11d48', '#334155'];

export const StatusTray: React.FC<StatusTrayProps> = ({ currentUser }) => {
  const {
    statuses,
    contacts,
    loadStatuses,
    loadContacts,
    createStatus,
    markStatusViewed,
    deleteStatus,
  } = useSocialStore();

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState<StatusDTO | null>(null);
  const [caption, setCaption] = useState('');
  const [bgColor, setBgColor] = useState(BG_PALETTE[0]!);
  const [visibility, setVisibility] = useState<'contacts' | 'custom'>('contacts');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    void loadStatuses();
    void loadContacts();
  }, [loadStatuses, loadContacts]);

  const acceptedContacts = contacts.filter((c) => c.status === 'accepted');

  const handleOpenStatus = (status: StatusDTO) => {
    setActiveStatus(status);
    if (status.author.id !== currentUser.id && !status.hasViewed) {
      void markStatusViewed(status.id);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim()) return;
    setIsPosting(true);
    try {
      await createStatus({
        caption: caption.trim(),
        bgColor,
        visibility,
        allowedUserIds: visibility === 'custom' ? selectedUserIds : [],
      });
      setCaption('');
      setIsComposeOpen(false);
    } finally {
      setIsPosting(false);
    }
  };

  const toggleAllowedUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-xs font-semibold text-slate-200">24h Campus Status</h3>
          <p className="text-[11px] text-slate-400">
            Disappears after 24 hours · Shared with contacts
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsComposeOpen(true)}
          className="fluid-press min-h-[38px] px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Post Status</span>
        </button>
      </div>

      {statuses.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 text-center">
          <p className="text-xs text-slate-300 font-medium">No active statuses in the last 24h</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Share what you’re working on or where you’re grabbing chai on campus.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {statuses.map((st) => {
            const isOwn = st.author.id === currentUser.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => handleOpenStatus(st)}
                className="fluid-press w-full p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-white/10 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-0.5 rounded-full ${
                      st.hasViewed
                        ? 'bg-slate-600'
                        : 'bg-gradient-to-tr from-sky-400 via-cyan-300 to-indigo-500'
                    }`}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-xs px-1 text-center truncate"
                      style={{ backgroundColor: st.bgColor }}
                    >
                      {st.author.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white truncate">
                        {isOwn ? 'My Status' : st.author.displayName}
                      </span>
                      {st.visibility === 'custom' && (
                        <span title="Custom contact list">
                          <Lock className="w-3 h-3 text-amber-400" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 truncate mt-0.5">{st.caption}</p>
                    <span className="text-[10px] text-slate-500">
                      {new Date(st.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {isOwn && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 text-[11px] text-slate-300">
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    {st.viewCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Compose Status Sheet */}
      <FluidSheet
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        title="Post 24h Status"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div
            className="rounded-2xl p-6 min-h-[140px] flex items-center justify-center text-center transition-colors border border-white/15"
            style={{ backgroundColor: bgColor }}
          >
            <textarea
              rows={3}
              required
              maxLength={500}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What’s happening on campus?"
              className="w-full bg-transparent text-white placeholder:text-white/60 text-center font-semibold text-base focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Color:</span>
            {BG_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setBgColor(hex)}
                className={`w-6 h-6 rounded-full border-2 ${
                  bgColor === hex ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: hex }}
                aria-label={`Color ${hex}`}
              />
            ))}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Who can view this?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('contacts')}
                className={`fluid-press py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 ${
                  visibility === 'contacts'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Accepted Contacts</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('custom')}
                className={`fluid-press py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 ${
                  visibility === 'custom'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Selected Contacts Only</span>
              </button>
            </div>
          </div>

          {visibility === 'custom' && (
            <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-xl bg-slate-900 border border-white/10">
              {acceptedContacts.length === 0 ? (
                <p className="text-xs text-slate-500">No accepted contacts available.</p>
              ) : (
                acceptedContacts.map((c) => (
                  <label
                    key={c.peer.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-slate-200 cursor-pointer"
                  >
                    <span>
                      {c.peer.displayName} (@{c.peer.username})
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(c.peer.id)}
                      onChange={() => toggleAllowedUser(c.peer.id)}
                      className="accent-sky-500"
                    />
                  </label>
                ))
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isPosting || !caption.trim()}
            className="fluid-press w-full min-h-[44px] rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold"
          >
            {isPosting ? 'Publishing…' : 'Publish 24h Status'}
          </button>
        </form>
      </FluidSheet>

      {/* Active Status Viewer + View Receipts Sheet */}
      <FluidSheet
        isOpen={Boolean(activeStatus)}
        onClose={() => setActiveStatus(null)}
        title={activeStatus ? `${activeStatus.author.displayName}’s Status` : 'Status'}
      >
        {activeStatus && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-8 min-h-[200px] flex flex-col items-center justify-center text-center shadow-lg border border-white/15"
              style={{ backgroundColor: activeStatus.bgColor }}
            >
              <p className="text-lg font-semibold text-white whitespace-pre-wrap">
                {activeStatus.caption}
              </p>
              <span className="mt-4 text-xs text-white/75">
                Posted at{' '}
                {new Date(activeStatus.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {activeStatus.author.id === currentUser.id && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    Viewed by ({activeStatus.viewCount})
                  </h4>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteStatus(activeStatus.id);
                      setActiveStatus(null);
                    }}
                    className="fluid-press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Status
                  </button>
                </div>

                {activeStatus.views && activeStatus.views.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {activeStatus.views.map((v) => (
                      <div
                        key={v.viewer.id}
                        className="px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-200 font-medium">
                          {v.viewer.displayName} (@{v.viewer.username})
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          {new Date(v.viewedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No views yet.</p>
                )}
              </div>
            )}
          </div>
        )}
      </FluidSheet>
    </div>
  );
};
