import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
  Reply,
  MapPin,
  Smile,
  MoreVertical,
  Edit2,
  Trash2,
  Pin,
  Star,
  Download,
  Music,
} from 'lucide-react';
import type { MessageDTO } from '@kamand/shared';
import { SPRING_DEFAULT, rubberband } from '../lib/physics.js';

interface MessageBubbleProps {
  message: MessageDTO;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onReply: (message: MessageDTO) => void;
  onRetry: (messageId: string) => void;
  onTapRoomChip?: (roomCode: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (message: MessageDTO) => void;
  onDelete?: (messageId: string, mode: 'for_me' | 'for_everyone') => void;
  onPinStar?: (messageId: string, action: 'pin' | 'unpin' | 'star' | 'unstar') => void;
  onImageClick?: (url: string, caption?: string) => void;
}

const ROOM_CODE_REGEX = /\b([A-D][-\s]?\d{1,3})\b/gi;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  onReply,
  onRetry,
  onTapRoomChip,
  onReact,
  onEdit,
  onDelete,
  onPinStar,
  onImageClick,
}) => {
  const [swipeX, setSwipeX] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const startXRef = useRef<number | null>(null);
  const committedReplyRef = useRef(false);

  const canEdit =
    isOwn &&
    !message.deletedAt &&
    Date.now() - new Date(message.createdAt).getTime() < FIFTEEN_MINUTES_MS;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startXRef.current = e.clientX;
    committedReplyRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const deltaX = e.clientX - startXRef.current;
    if (deltaX > 8) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const damped = rubberband(deltaX - 8, 110, 0.55);
      setSwipeX(damped);
      if (damped >= 44 && !committedReplyRef.current) {
        committedReplyRef.current = true;
        if ('vibrate' in navigator) {
          navigator.vibrate(8);
        }
      }
    } else {
      setSwipeX(0);
    }
  };

  const handlePointerUp = () => {
    if (startXRef.current === null) return;
    startXRef.current = null;
    if (committedReplyRef.current) {
      onReply(message);
    }
    setSwipeX(0);
    committedReplyRef.current = false;
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const renderBodyWithRoomChips = (text: string) => {
    const parts = text.split(ROOM_CODE_REGEX);
    return parts.map((part, idx) => {
      if (ROOM_CODE_REGEX.test(part)) {
        ROOM_CODE_REGEX.lastIndex = 0;
        const normalized = part.toUpperCase().replace(/\s+/g, '-');
        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTapRoomChip?.(normalized);
            }}
            title={`Open ${normalized} on Campus Map`}
            className="fluid-press inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-white/20 hover:bg-white/30 text-sky-100 font-semibold text-xs border border-white/25 cursor-pointer"
          >
            <MapPin className="w-3 h-3 text-sky-300" />
            <span>{normalized}</span>
          </button>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  // Group reactions by emoji
  const reactionCounts = (message.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_DEFAULT}
      className={`group relative flex flex-col ${
        isOwn ? 'items-end' : 'items-start'
      } ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}
    >
      <div className={`relative flex items-end gap-1.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Swipe-to-Reply Indicator Icon */}
        <div
          className="pointer-events-none absolute left-2 flex items-center justify-center text-sky-400 transition-opacity"
          style={{
            opacity: Math.min(1, swipeX / 40),
            transform: `scale(${Math.min(1.1, 0.6 + swipeX / 80)})`,
          }}
          aria-hidden="true"
        >
          <Reply className="w-4 h-4" />
        </div>

        <motion.div
          animate={{ x: swipeX }}
          transition={startXRef.current !== null ? { duration: 0 } : SPRING_DEFAULT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative max-w-[85%] sm:max-w-[70%] px-3.5 py-2 text-body text-sm shadow-xs select-text ${
            isOwn
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800/95 text-slate-100 border border-white/10'
          } ${
            isOwn
              ? isLastInGroup
                ? 'rounded-2xl rounded-br-xs'
                : 'rounded-2xl'
              : isLastInGroup
                ? 'rounded-2xl rounded-bl-xs'
                : 'rounded-2xl'
          }`}
        >
          {/* Badges: Pin, Star, Forwarded */}
          <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-80">
            {message.isPinned && (
              <span className="inline-flex items-center gap-0.5 text-amber-300">
                <Pin className="w-3 h-3 fill-amber-300" />
                <span>Pinned</span>
              </span>
            )}
            {message.isStarred && (
              <span className="inline-flex items-center gap-0.5 text-yellow-300">
                <Star className="w-3 h-3 fill-yellow-300" />
                <span>Starred</span>
              </span>
            )}
            {message.forwardedFromName && (
              <span className="italic text-slate-300">
                Forwarded from {message.forwardedFromName}
              </span>
            )}
          </div>

          {/* Quoted Reply Preview */}
          {message.replyToPreview && (
            <div
              className={`mb-1.5 rounded-lg px-2.5 py-1 text-xs border-l-2 ${
                isOwn
                  ? 'bg-sky-700/70 border-sky-200 text-sky-100'
                  : 'bg-slate-900/70 border-sky-400 text-slate-300'
              }`}
            >
              <div className="font-semibold truncate">{message.replyToPreview.senderName}</div>
              <div className="truncate opacity-85">{message.replyToPreview.body}</div>
            </div>
          )}

          {/* Attachment Preview */}
          {message.attachment && (
            <div className="mb-2">
              {message.attachment.mimeType.startsWith('image/') ? (
                <button
                  type="button"
                  onClick={() =>
                    onImageClick?.(message.attachment!.url, message.attachment!.fileName)
                  }
                  className="rounded-xl overflow-hidden block border border-white/10 hover:opacity-95 transition-opacity"
                >
                  <img
                    src={message.attachment.url}
                    alt={message.attachment.fileName}
                    className="max-h-60 max-w-full object-cover rounded-xl"
                  />
                </button>
              ) : message.attachment.mimeType.startsWith('audio/') ? (
                <div className="p-2 rounded-xl bg-black/20 border border-white/10 flex items-center gap-2">
                  <Music className="w-4 h-4 text-sky-300 flex-shrink-0" />
                  <audio
                    src={message.attachment.url}
                    controls
                    className="h-8 max-w-[200px] sm:max-w-[240px]"
                  />
                  {message.attachment.durationSec && (
                    <span className="text-[10px] text-slate-300 whitespace-nowrap">
                      {Math.round(message.attachment.durationSec)}s
                    </span>
                  )}
                </div>
              ) : (
                <a
                  href={message.attachment.url}
                  download={message.attachment.fileName}
                  className="p-2.5 rounded-xl bg-black/20 border border-white/10 flex items-center gap-2 text-xs hover:bg-black/30"
                >
                  <Download className="w-4 h-4 text-sky-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{message.attachment.fileName}</div>
                    <div className="text-[10px] opacity-70">
                      {Math.round(message.attachment.sizeBytes / 1024)} KB
                    </div>
                  </div>
                </a>
              )}
            </div>
          )}

          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {renderBodyWithRoomChips(message.body)}
          </div>

          <div
            className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${
              isOwn ? 'text-sky-100/80' : 'text-slate-400'
            }`}
          >
            {message.editedAt && <span className="italic text-[10px]">(edited)</span>}
            <span>{formattedTime}</span>

            {isOwn && (
              <span className="inline-flex items-center" aria-label={`Status: ${message.status}`}>
                {message.status === 'sending' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                {message.status === 'sent' && <Check className="w-3.5 h-3.5" />}
                {message.status === 'delivered' && <CheckCheck className="w-3.5 h-3.5" />}
                {message.status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />}
                {message.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-rose-300" />}
              </span>
            )}
          </div>
        </motion.div>

        {/* Hover/Touch Action Buttons */}
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="p-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
            aria-label="React"
            title="Add reaction"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            className="p-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
            aria-label="Reply"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="p-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
            aria-label="More options"
            title="More actions"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Emoji Bar */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`my-1 p-1 bg-slate-900 border border-white/15 rounded-full shadow-lg flex items-center gap-1 z-20 ${
              isOwn ? 'self-end' : 'self-start'
            }`}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact?.(message.id, emoji);
                  setShowEmojiPicker(false);
                }}
                className="hover:scale-125 px-1 py-0.5 text-sm transition-transform"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Menu Popover */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`my-1 p-1.5 bg-slate-900 border border-white/15 rounded-xl shadow-xl flex flex-col gap-1 z-30 text-xs min-w-[140px] ${
              isOwn ? 'self-end' : 'self-start'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                onPinStar?.(message.id, message.isPinned ? 'unpin' : 'pin');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-left text-slate-200"
            >
              <Pin className="w-3.5 h-3.5 text-amber-400" />
              <span>{message.isPinned ? 'Unpin message' : 'Pin message'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onPinStar?.(message.id, message.isStarred ? 'unstar' : 'star');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-left text-slate-200"
            >
              <Star className="w-3.5 h-3.5 text-yellow-400" />
              <span>{message.isStarred ? 'Unstar message' : 'Star message'}</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  onEdit?.(message);
                  setShowMenu(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-left text-slate-200"
              >
                <Edit2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Edit (15 min)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onDelete?.(message.id, 'for_me');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-left text-rose-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete for me</span>
            </button>

            {isOwn && (
              <button
                type="button"
                onClick={() => {
                  onDelete?.(message.id, 'for_everyone');
                  setShowMenu(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-left text-rose-300"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete for everyone</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Render Reaction Counters */}
      {Object.keys(reactionCounts).length > 0 && (
        <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          {Object.entries(reactionCounts).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact?.(message.id, emoji)}
              className="px-2 py-0.5 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-white/15 text-xs flex items-center gap-1 shadow-xs"
            >
              <span>{emoji}</span>
              <span className="text-[10px] text-slate-300 font-semibold">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Retry button if message failed */}
      {isOwn && message.status === 'failed' && (
        <button
          type="button"
          onClick={() => onRetry(message.id)}
          className="fluid-press mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs"
        >
          <RotateCcw className="w-3 h-3" />
          Retry
        </button>
      )}
    </motion.div>
  );
};
