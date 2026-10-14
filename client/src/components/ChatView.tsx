import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Send,
  Reply,
  ShieldCheck,
  Ban,
  AlertTriangle,
  Phone,
  Video,
  Sparkles,
  Search,
  Paperclip,
  Mic,
  MicOff,
  Bell,
  BellOff,
  Flag,
  X,
  Edit2,
} from 'lucide-react';
import type { ConversationSummary, UserSummary, MessageDTO } from '@kamand/shared';
import { useChatStore } from '../store/useChatStore.js';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { useCallStore } from '../store/useCallStore.js';
import { apiFetch } from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { searchDecryptedMessages } from '../lib/notifications.js';
import { MessageBubble } from './MessageBubble.js';
import { TypingIndicator } from './TypingIndicator.js';
import { FluidSheet } from './FluidSheet.js';
import { AiConsentSheet } from './AiConsentSheet.js';
import { MediaLightbox } from './MediaLightbox.js';
import { generateQrMatrix } from '../lib/qr.js';

interface ChatViewProps {
  conversation: ConversationSummary;
  currentUser: UserSummary;
  onBackMobile: () => void;
  onOpenMapForCode?: (roomCode: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  conversation,
  currentUser,
  onBackMobile,
  onOpenMapForCode,
}) => {
  const {
    messagesByConv,
    paginationByConv,
    draftsByConv,
    replyTargetByConv,
    typingUsersByConv,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    setDraft,
    setReplyTarget,
    notifyTyping,
    reactToMessage,
    editMessage,
    deleteMessage,
    pinStarMessage,
  } = useChatStore();

  const {
    safetyNumbersByUser,
    keyChangedWarningsByUser,
    loadPeerDevices,
  } = useSecurityStore();

  const openPreCallCheck = useCallStore((s) => s.openPreCallCheck);

  const [isSafetySheetOpen, setIsSafetySheetOpen] = useState(false);
  const [isAiSheetOpen, setIsAiSheetOpen] = useState(false);
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null);
  const [isMuted, setIsMuted] = useState(Boolean(conversation.isMuted));

  const [editingMessage, setEditingMessage] = useState<MessageDTO | null>(null);
  const [editBody, setEditBody] = useState('');

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStartTimeRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (el && !searchQuery.trim()) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversation.id, messages.length, typingNames.length, searchQuery]);

  useEffect(() => {
    return () => {
      if (typingStopTimeoutRef.current !== null) {
        window.clearTimeout(typingStopTimeoutRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleToggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await apiFetch(`/api/conversations/${conversation.id}/mute`, {
      method: 'PATCH',
      body: JSON.stringify({ isMuted: nextMuted }),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds the 5 MB safety limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        const uploadRes = await apiFetch<{
          attachment: {
            id: string;
            fileName: string;
            mimeType: string;
            sizeBytes: number;
            url: string;
          };
        }>('/api/media/upload', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data,
          }),
        });

        const isImg = file.type.startsWith('image/');
        const isAud = file.type.startsWith('audio/');
        const msgType = isImg ? 'image' : isAud ? 'voice' : 'file';

        await socketManager.sendMessage({
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          body: file.name,
          type: msgType,
          attachmentId: uploadRes.attachment.id,
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Upload failed');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceStartTimeRef.current = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const durationSec = Math.max(1, (Date.now() - voiceStartTimeRef.current) / 1000);
        const audioBlob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result as string;
          try {
            const uploadRes = await apiFetch<{ attachment: { id: string } }>('/api/media/upload', {
              method: 'POST',
              body: JSON.stringify({
                fileName: `voice-note-${Date.now()}.webm`,
                mimeType: 'audio/webm',
                base64Data,
                durationSec,
              }),
            });

            await socketManager.sendMessage({
              id: crypto.randomUUID(),
              conversationId: conversation.id,
              body: 'Voice message',
              type: 'voice',
              attachmentId: uploadRes.attachment.id,
            });
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Voice note upload failed');
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start();
      setIsRecordingVoice(true);
    } catch {
      alert('Microphone access denied or unavailable.');
    }
  };

  const handleStopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;

    // Voluntarily attach up to 10 recent messages from this conversation
    const attached = messages.slice(-10).map((m) => ({
      messageId: m.id,
      senderName: m.sender.displayName,
      body: m.body,
      createdAt: m.createdAt,
    }));

    await apiFetch('/api/admin/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: peer.id,
        conversationId: conversation.id,
        reason: reportReason.trim(),
        voluntarilyAttachedMessages: attached,
      }),
    });

    setReportSuccess(true);
    setTimeout(() => {
      setIsReportSheetOpen(false);
      setReportSuccess(false);
      setReportReason('');
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || conversation.isBlocked) return;
    const textToSend = draft.trim();
    setDraft(conversation.id, '');
    notifyTyping(conversation.id, false);
    void sendMessage(conversation.id, textToSend, currentUser);
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editBody.trim()) return;
    const ok = await editMessage(conversation.id, editingMessage.id, editBody.trim());
    if (ok) {
      setEditingMessage(null);
      setEditBody('');
    } else {
      alert('Unable to edit message (15-minute window may have expired).');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(conversation.id, val);

    if (val.length > 0) {
      notifyTyping(conversation.id, true);
      if (typingStopTimeoutRef.current !== null) {
        window.clearTimeout(typingStopTimeoutRef.current);
      }
      typingStopTimeoutRef.current = window.setTimeout(() => {
        notifyTyping(conversation.id, false);
      }, 3000);
    } else {
      notifyTyping(conversation.id, false);
    }
  };

  const safetyNumber =
    safetyNumbersByUser[peer.id] ??
    '12345 67890 23456 78901 34567 89012 45678 90123 56789 01234 67890 12345';
  const hasKeyChanged = Boolean(keyChangedWarningsByUser[peer.id]);
  const safetyQrMatrix = generateQrMatrix(`kamand:verify:${peer.id}:${safetyNumber}`);

  const formattedLastSeen = peer.lastSeenAt
    ? `last seen ${new Date(peer.lastSeenAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'offline';

  const displayedMessages = searchQuery.trim()
    ? searchDecryptedMessages(messages, searchQuery)
    : messages;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 relative overflow-hidden">
      <MediaLightbox
        imageUrl={lightboxImage?.url ?? null}
        caption={lightboxImage?.caption}
        onClose={() => setLightboxImage(null)}
      />

      {/* Header */}
      <header className="px-4 py-3 glass-chrome glass-top-highlight border-b border-white/10 flex items-center justify-between gap-3 select-none z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            className="fluid-press md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
              {peer.displayName.slice(0, 1).toUpperCase()}
            </div>
            {peer.isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-heading text-sm text-slate-100 truncate">{peer.displayName}</h2>
              {peer.roomCode && (
                <button
                  type="button"
                  onClick={() => onOpenMapForCode?.(peer.roomCode!)}
                  title="Open Contact Room on Campus Map"
                  className="fluid-press px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30"
                >
                  {peer.roomCode}
                </button>
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

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {/* Client-Side Message Search Toggle */}
          <button
            type="button"
            onClick={() => setIsSearchOpen((s) => !s)}
            className={`fluid-press p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 ${
              isSearchOpen ? 'bg-sky-500/20 text-sky-300' : ''
            }`}
            aria-label="Search messages in this conversation"
            title="Search local messages"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Per-Chat Mute Toggle */}
          <button
            type="button"
            onClick={() => void handleToggleMute()}
            className={`fluid-press p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 ${
              isMuted ? 'text-amber-400' : ''
            }`}
            aria-label={isMuted ? 'Unmute chat' : 'Mute chat notifications'}
            title={isMuted ? 'Unmute chat' : 'Mute notifications'}
          >
            {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>

          {/* AI Toolkit */}
          <button
            type="button"
            onClick={() => setIsAiSheetOpen(true)}
            className="fluid-press px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-medium flex items-center gap-1"
            aria-label="Open AI Assistant"
            title="Opt-In AI Assistant (Summarize, Smart Replies, Translate)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI</span>
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
                <Video className="w-4 h-4 text-indigo-400" />
              </button>
            </>
          )}

          {/* Moderation Report Button */}
          <button
            type="button"
            onClick={() => setIsReportSheetOpen(true)}
            className="fluid-press p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
            aria-label="Report conversation to moderation"
            title="Report to Moderation Queue"
          >
            <Flag className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Client-Side Search Bar */}
      {isSearchOpen && (
        <div className="px-4 py-2 bg-slate-900/90 border-b border-white/10 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decrypted messages…"
            aria-label="Search conversation messages"
            autoFocus
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <span className="text-[10px] text-sky-300 font-mono">
              {displayedMessages.length} match{displayedMessages.length === 1 ? '' : 'es'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(false);
              setSearchQuery('');
            }}
            className="text-slate-400 hover:text-white"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scrollable Message Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 scroll-edge-mask"
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${peer.displayName}`}
      >
        {pagination?.hasMore && !searchQuery.trim() && (
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

        {displayedMessages.map((msg, idx) => {
          const prev = displayedMessages[idx - 1];
          const next = displayedMessages[idx + 1];
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
              onTapRoomChip={onOpenMapForCode}
              onReact={(messageId, emoji) => void reactToMessage(conversation.id, messageId, emoji)}
              onEdit={(m) => {
                setEditingMessage(m);
                setEditBody(m.body);
              }}
              onDelete={(messageId, mode) => void deleteMessage(conversation.id, messageId, mode)}
              onPinStar={(messageId, action) =>
                void pinStarMessage(conversation.id, messageId, action)
              }
              onImageClick={(url, caption) => setLightboxImage({ url, caption })}
            />
          );
        })}

        <TypingIndicator names={typingNames} />
      </div>

      {/* Editing Message Banner */}
      {editingMessage && (
        <div className="px-4 py-2 bg-slate-900 border-t border-sky-400/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Edit2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold text-sky-300">Editing Message:</span>
            <input
              type="text"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="bg-slate-950 px-2.5 py-1 rounded-lg border border-white/15 text-white flex-1"
            />
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              type="button"
              onClick={() => void handleSaveEdit()}
              className="px-2.5 py-1 rounded-lg bg-sky-500 text-white font-medium"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingMessage(null)}
              className="px-2 py-1 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,application/pdf"
                onChange={handleFileUpload}
              />

              {/* Attachment Picker Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="fluid-press min-h-[44px] min-w-[44px] rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center"
                aria-label="Attach file or photo"
                title="Send Photo or File (up to 5MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Voice Note Button */}
              <button
                type="button"
                onClick={isRecordingVoice ? handleStopVoiceRecording : handleStartVoiceRecording}
                className={`fluid-press min-h-[44px] min-w-[44px] rounded-2xl border flex items-center justify-center ${
                  isRecordingVoice
                    ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                    : 'bg-slate-900 hover:bg-slate-800 border-white/10 text-slate-300 hover:text-white'
                }`}
                aria-label={isRecordingVoice ? 'Stop recording voice note' : 'Record voice note'}
                title={isRecordingVoice ? 'Stop recording & send' : 'Record Voice Note'}
              >
                {isRecordingVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

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

      {/* Moderation Report Sheet (§5 & §14) */}
      <FluidSheet
        isOpen={isReportSheetOpen}
        onClose={() => setIsReportSheetOpen(false)}
        title={`Report to Moderation · @${peer.username}`}
      >
        <form onSubmit={handleSubmitReport} className="space-y-4">
          <p className="text-xs text-slate-300">
            Submit an abuse report to campus moderators. Because Kamand Chat uses Zero-Knowledge
            E2EE, admins cannot view messages unless you voluntarily attach snapshots of them as
            evidence below.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Reason for report:
            </label>
            <textarea
              required
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue (harassment, spam, impersonation, violation of IIT Mandi guidelines)…"
              className="w-full rounded-xl bg-slate-900 border border-white/15 p-3 text-xs text-white"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-slate-400">
            Attaching {Math.min(messages.length, 10)} recent decrypted messages from this
            conversation as evidence for moderator review.
          </div>

          {reportSuccess ? (
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-semibold text-center">
              ✓ Report successfully submitted to the moderation queue!
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsReportSheetOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reportReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 disabled:opacity-40"
              >
                Submit Report
              </button>
            </div>
          )}
        </form>
      </FluidSheet>

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
