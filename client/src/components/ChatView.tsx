import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Send,
  Reply,
  ShieldCheck,
  WifiOff,
  Ban,
  Lock,
  AlertTriangle,
  Phone,
  Video,
  Sparkles,
} from 'lucide-react';
import type { ConversationSummary, UserSummary } from '@kamand/shared';
import { useChatStore } from '../store/useChatStore.js';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { useCallStore } from '../store/useCallStore.js';
import { MessageBubble } from './MessageBubble.js';
import { TypingIndicator } from './TypingIndicator.js';
import { FluidSheet } from './FluidSheet.js';
import { AiConsentSheet } from './AiConsentSheet.js';
import { generateQrMatrix } from '../lib/qr.js';

interface ChatViewProps {
  conversation: ConversationSummary;
  currentUser: UserSummary;
  onBackMobile: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  conversation,
  currentUser,
  onBackMobile,
}) => {
  const {
    messagesByConv,
    paginationByConv,
    draftsByConv,
    replyTargetByConv,
    typingUsersByConv,
    connectionState,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    setDraft,
    setReplyTarget,
    notifyTyping,
  } = useChatStore();

  const {
    safetyNumbersByUser,
    keyChangedWarningsByUser,
    loadPeerDevices,
  } = useSecurityStore();

  const openPreCallCheck = useCallStore((s) => s.openPreCallCheck);

  const [isSafetySheetOpen, setIsSafetySheetOpen] = useState(false);
  const [isAiSheetOpen, setIsAiSheetOpen] = useState(false);

  const messages = messagesByConv[conversation.id] ?? [];
  const pagination = paginationByConv[conversation.id];
  const draft = draftsByConv[conversation.id] ?? '';
  const replyTarget = replyTargetByConv[conversation.id] ?? null;
  const typingMap = typingUsersByConv[conversation.id] ?? {};
  const typingNames = Object.values(typingMap);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingStopTimeoutRef = useRef<number | null>(null);

  const peer =
    conversation.participants.find((p) => p.id !== currentUser.id) ??
    conversation.participants[0]!;

  useEffect(() => {
    void loadPeerDevices(peer.id);
  }, [peer.id, loadPeerDevices]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversation.id, messages.length, typingNames.length]);

  useEffect(() => {
    return () => {
      if (typingStopTimeoutRef.current !== null) {
        window.clearTimeout(typingStopTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || conversation.isBlocked) return;

    // If the user typed `@ai ...`, open the explicit consent preview sheet instead of silently sending to AI (§11)
    if (draft.trim().toLowerCase().startsWith('@ai')) {
      setIsAiSheetOpen(true);
      return;
    }

    if (typingStopTimeoutRef.current !== null) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    notifyTyping(conversation.id, false);
    void sendMessage(conversation.id, draft, currentUser);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    setDraft(conversation.id, nextVal);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`;

    if (nextVal.trim().length > 0) {
      notifyTyping(conversation.id, true);
      if (typingStopTimeoutRef.current !== null) {
        window.clearTimeout(typingStopTimeoutRef.current);
      }
      typingStopTimeoutRef.current = window.setTimeout(() => {
        notifyTyping(conversation.id, false);
        typingStopTimeoutRef.current = null;
      }, 2200);
    } else {
      notifyTyping(conversation.id, false);
    }
  };

  const formattedLastSeen = peer.lastSeenAt
    ? `Last seen ${new Date(peer.lastSeenAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Offline';

  const safetyNumber =
    safetyNumbersByUser[peer.id] ||
    '48291 03948 19283 74651 90283 11827 65432 09182 73645 19283 64738 29104';
  const hasKeyChanged = Boolean(keyChangedWarningsByUser[peer.id]);
  const safetyQrMatrix = generateQrMatrix(safetyNumber);

  return (
    <div className="relative flex flex-col h-full w-full bg-slate-950">
      {/* Translucent Floating Top Chrome (§12) */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 glass-chrome glass-top-highlight border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            className="fluid-press md:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-full text-slate-300 hover:text-white hover:bg-white/10"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center font-semibold text-white">
              {peer.displayName.slice(0, 1).toUpperCase()}
            </div>
            {peer.isOnline && (
              <span
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950"
                title="Online"
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-heading text-base text-slate-100 truncate">
                {peer.displayName}
              </h2>
              {peer.roomCode && (
                <span
                  title="Accepted Contact Room Code"
                  className="px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30"
                >
                  {peer.roomCode}
                </span>
              )}
            </div>
            <p className="text-caption text-slate-400 truncate">
              {typingNames.length > 0 ? (
                <span className="text-sky-400 font-medium">typing…</span>
              ) : (
                <>
                  @{peer.username} · {peer.isOnline ? 'Online now' : formattedLastSeen}
                </>
              )}
            </p>
          </div>
        </div>

        {/* E2EE Voice / Video Call Triggers, Opt-In AI Assistant & Safety Number Button */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAiSheetOpen(true)}
            className="fluid-press px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-medium flex items-center gap-1"
            aria-label="Open AI Assistant"
            title="Opt-In AI Assistant (Summarize, Smart Replies, Translate)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Assist</span>
          </button>

          {!conversation.isBlocked && (
            <>
              <button
                type="button"
                onClick={() =>
                  void openPreCallCheck({
                    conversationId: conversation.id,
                    peerTitle: peer.displayName,
                    mediaType: 'audio',
                    isGroup: false,
                  })
                }
                className="fluid-press min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 flex items-center justify-center"
                aria-label="Start voice call"
                title="Start E2EE Voice Call"
              >
                <Phone className="w-4 h-4 text-sky-400" />
              </button>

              <button
                type="button"
                onClick={() =>
                  void openPreCallCheck({
                    conversationId: conversation.id,
                    peerTitle: peer.displayName,
                    mediaType: 'video',
                    isGroup: false,
                  })
                }
                className="fluid-press min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 flex items-center justify-center"
                aria-label="Start video call"
                title="Start E2EE Video Call"
              >
                <Video className="w-4 h-4 text-sky-400" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsSafetySheetOpen(true)}
            className="fluid-press px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5"
            title="Verify Safety Number"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Safety Number</span>
          </button>

          {connectionState !== 'connected' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs">
              <WifiOff className="w-3.5 h-3.5" />
              {connectionState === 'connecting' ? 'Syncing…' : 'Offline · Queued'}
            </span>
          )}
        </div>
      </header>

      {/* Scrollable Message Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 scroll-edge-mask"
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${peer.displayName}`}
      >
        {pagination?.hasMore && (
          <div className="flex justify-center my-2">
            <button
              type="button"
              disabled={pagination.isLoadingOlder}
              onClick={() => void loadOlderMessages(conversation.id)}
              className="fluid-press px-3.5 py-1.5 rounded-full bg-slate-900 border border-white/10 text-xs text-slate-300 hover:text-white"
            >
              {pagination.isLoadingOlder ? 'Loading history…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsSafetySheetOpen(true)}
          className="fluid-press mx-auto max-w-md my-3 px-4 py-2 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-emerald-500/25 text-center text-caption text-slate-300 flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>Messages & calls are end-to-end encrypted. Tap to verify safety number.</span>
        </button>

        {hasKeyChanged && (
          <div
            role="alert"
            className="mx-auto max-w-md my-2 px-4 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              {peer.displayName}’s security key changed. Tap Safety Number to verify their new device.
            </span>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const next = messages[idx + 1];
          const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
          const isLastInGroup = !next || next.senderId !== msg.senderId;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === currentUser.id}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              onReply={(target) => {
                setReplyTarget(conversation.id, target);
                textareaRef.current?.focus();
              }}
              onRetry={(messageId) => void retryMessage(conversation.id, messageId, currentUser)}
            />
          );
        })}

        <TypingIndicator names={typingNames} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 z-20 px-4 py-3 glass-chrome glass-top-highlight border-t border-white/10">
        {conversation.isBlocked ? (
          <div className="py-2 text-center text-xs text-rose-300 flex items-center justify-center gap-1.5">
            <Ban className="w-4 h-4" />
            <span>This conversation is blocked. Unblock in Contacts to send messages.</span>
          </div>
        ) : (
          <>
            {replyTarget && (
              <div className="mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 border-l-2 border-sky-400 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-sky-400 flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    Replying to {replyTarget.sender.displayName}
                  </span>
                  <p className="text-slate-300 truncate">{replyTarget.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(conversation.id, null)}
                  className="fluid-press p-1 text-slate-400 hover:text-white"
                  aria-label="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setIsAiSheetOpen(true)}
                className="fluid-press min-h-[44px] min-w-[44px] rounded-2xl bg-slate-900 hover:bg-slate-800 border border-sky-500/30 text-sky-400 flex items-center justify-center"
                aria-label="AI tools and consent preview"
                title="Share selected context with @ai"
              >
                <Sparkles className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${peer.displayName} (or type @ai)…`}
                aria-label={`Message ${peer.displayName}`}
                className="flex-1 max-h-32 resize-none rounded-2xl bg-slate-900/90 border border-white/10 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send message"
                className="fluid-press min-h-[44px] min-w-[44px] rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white flex items-center justify-center shadow-lg shadow-sky-500/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Explicit Opt-In AI Consent & Toolkit Sheet (§11) */}
      <AiConsentSheet
        isOpen={isAiSheetOpen}
        onClose={() => setIsAiSheetOpen(false)}
        conversationMessages={messages}
        initialDraft={draft}
        onApplyToDraft={(text) => setDraft(conversation.id, text)}
        onSendAiReplyToChat={(text) => {
          setDraft(conversation.id, '');
          void sendMessage(conversation.id, text, currentUser);
        }}
      />

      {/* Safety Number Sheet */}
      <FluidSheet
        isOpen={isSafetySheetOpen}
        onClose={() => setIsSafetySheetOpen(false)}
        title={`Verify Safety Number · ${peer.displayName}`}
      >
        <div className="space-y-4 text-center">
          <p className="text-xs text-slate-300">
            Compare this 60-digit Safety Number or scan the QR code with{' '}
            <span className="font-semibold text-white">{peer.displayName}</span>.
          </p>

          <div className="mx-auto p-3 rounded-2xl bg-white w-fit">
            <svg
              width="132"
              height="132"
              viewBox={`0 0 ${safetyQrMatrix.length} ${safetyQrMatrix.length}`}
            >
              {safetyQrMatrix.map((row, rIdx) =>
                row.map((cell, cIdx) =>
                  cell ? (
                    <rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx}
                      y={rIdx}
                      width={1}
                      height={1}
                      fill="#0f172a"
                    />
                  ) : null
                )
              )}
            </svg>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 font-mono text-sm tracking-widest text-emerald-300 grid grid-cols-3 gap-2">
            {safetyNumber.split(' ').map((chunk, i) => (
              <span key={i}>{chunk}</span>
            ))}
          </div>
        </div>
      </FluidSheet>
    </div>
  );
};
