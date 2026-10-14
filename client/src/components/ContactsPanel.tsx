import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Check,
  X,
  Ban,
  MessageSquare,
  QrCode,
  ShieldAlert,
} from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useSocialStore } from '../store/useSocialStore.js';
import { useChatStore } from '../store/useChatStore.js';

interface ContactsPanelProps {
  currentUser: UserSummary;
  onOpenChat: () => void;
}

export const ContactsPanel: React.FC<ContactsPanelProps> = ({ currentUser, onOpenChat }) => {
  const {
    contacts,
    socialError,
    loadContacts,
    sendContactRequest,
    respondToRequest,
    blockUser,
    unblockUser,
    clearSocialError,
  } = useSocialStore();

  const startDirectConversation = useChatStore((s) => s.startDirectConversation);

  const [identifier, setIdentifier] = useState('');
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const acceptedContacts = contacts.filter((c) => c.status === 'accepted');
  const incomingRequests = contacts.filter(
    (c) => c.status === 'pending' && c.direction === 'incoming'
  );
  const outgoingRequests = contacts.filter(
    (c) => c.status === 'pending' && c.direction === 'outgoing'
  );
  const blockedContacts = contacts.filter((c) => c.status === 'blocked');

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    clearSocialError();
    setRequestSuccess(null);
    try {
      await sendContactRequest(identifier.trim());
      setRequestSuccess('Contact request sent!');
      setIdentifier('');
    } catch {
      // Displayed via socialError
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-5">
      {/* Add Contact by Username / Email / QR Code */}
      <form
        onSubmit={handleAddContact}
        className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-sky-400" />
            Add Contact (Username, Email, or QR)
          </span>
          <QrCode className="w-3.5 h-3.5 text-slate-400" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="@username, email, or kamand://contact/…"
            aria-label="Add contact by username, email, or QR code"
            className="flex-1 rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={!identifier.trim()}
            className="fluid-press px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold"
          >
            Add
          </button>
        </div>

        {socialError && <p className="text-[11px] text-rose-300">{socialError}</p>}
        {requestSuccess && <p className="text-[11px] text-emerald-400">{requestSuccess}</p>}
      </form>

      {/* Incoming Contact Requests */}
      {incomingRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
            Incoming Requests ({incomingRequests.length})
          </h3>
          {incomingRequests.map((req) => (
            <div
              key={req.id}
              className="p-3 rounded-2xl bg-sky-500/10 border border-sky-400/25 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {req.peer.displayName}
                </div>
                <div className="text-[11px] text-slate-400 truncate">@{req.peer.username}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void respondToRequest(req.id, 'accept')}
                  className="fluid-press min-h-[36px] px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium flex items-center gap-1"
                  aria-label={`Accept ${req.peer.displayName}`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept</span>
                </button>
                <button
                  type="button"
                  onClick={() => void respondToRequest(req.id, 'decline')}
                  className="fluid-press min-h-[36px] px-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs"
                  aria-label={`Decline ${req.peer.displayName}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accepted Contacts List */}
      <div className="space-y-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          My Contacts ({acceptedContacts.length})
        </h3>
        {acceptedContacts.length === 0 ? (
          <p className="text-xs text-slate-500 px-1 py-3">
            No accepted contacts yet. Add classmates above to see their hostel room and status.
          </p>
        ) : (
          acceptedContacts.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                    {c.peer.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  {c.peer.isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {c.peer.displayName}
                    </span>
                    {c.peer.roomCode && (
                      <span className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 text-[10px] font-medium">
                        {c.peer.roomCode}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    @{c.peer.username} · {c.peer.bio}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    await startDirectConversation(c.peer.id, currentUser.id);
                    onOpenChat();
                  }}
                  className="fluid-press p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300"
                  aria-label={`Message ${c.peer.displayName}`}
                  title="Message"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void blockUser(c.peer.id)}
                  className="fluid-press p-2 rounded-xl hover:bg-rose-500/15 text-slate-400 hover:text-rose-300"
                  aria-label={`Block ${c.peer.displayName}`}
                  title="Block contact"
                >
                  <Ban className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Outgoing Pending Requests */}
      {outgoingRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Sent Requests ({outgoingRequests.length})
          </h3>
          {outgoingRequests.map((req) => (
            <div
              key={req.id}
              className="p-2.5 rounded-xl bg-slate-900/40 border border-white/5 flex items-center justify-between text-xs text-slate-400"
            >
              <span>
                {req.peer.displayName} (@{req.peer.username})
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5">Pending</span>
            </div>
          ))}
        </div>
      )}

      {/* Blocked Users */}
      {blockedContacts.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            Blocked Users ({blockedContacts.length})
          </h3>
          {blockedContacts.map((b) => (
            <div
              key={b.id}
              className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/20 flex items-center justify-between"
            >
              <span className="text-xs text-slate-300">
                {b.peer.displayName} (@{b.peer.username})
              </span>
              <button
                type="button"
                onClick={() => void unblockUser(b.peer.id)}
                className="fluid-press px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] text-slate-200"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
