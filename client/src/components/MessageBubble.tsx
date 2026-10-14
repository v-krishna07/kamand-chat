import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RotateCcw, Reply, MapPin, SmilePlus } from 'lucide-react';
import type { MessageDTO } from '@kamand/shared';
import { rubberband } from '../lib/physics.js';
import {
  SPRING_CRITICALLY_DAMPED,
  SPRING_MOMENTUM,
  shouldAnimateMessageEntrance,
} from '../motion/presets.js';
import { DeliveryTickMorph } from '../motion/MicroInteractions.js';
import { triggerEmojiBurst } from '../lib/particleBurst.js';
import { socketManager } from '../lib/socket.js';

interface MessageBubbleProps {
  message: MessageDTO;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  staggerIndex?: number;
  onReply: (message: MessageDTO) => void;
  onRetry: (messageId: string) => void;
  onTapRoomChip?: (roomCode: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (message: MessageDTO) => void;
  onDelete?: (messageId: string, mode: 'for_everyone' | 'for_me') => void;
  onPinStar?: (messageId: string, action: 'pin' | 'unpin' | 'star' | 'unstar') => void;
  onImageClick?: (url: string, caption?: string) => void;
}

const ROOM_CODE_REGEX = /\b([A-D][-\s]?\d{1,3})\b/gi;
const QUICK_EMOJIS = ['❤️', '🔥', '🚀', '👏'] as const;

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  staggerIndex = 0,
  onReply,
  onRetry,
  onTapRoomChip,
  onReact,
  onEdit: _onEdit,
  onDelete: _onDelete,
  onPinStar: _onPinStar,
  onImageClick: _onImageClick,
}) => {
  const [swipeX, setSwipeX] = useState(0);
  const [showReactionBar, setShowReactionBar] = useState(false);
  const startXRef = useRef<number | null>(null);
  const committedReplyRef = useRef(false);

  // Deliverable 4: Check once on mount whether this message ID has already animated.
  // Virtualized rows scrolling back into the viewport return `false` and skip entrance animation!
  const shouldAnimateIn = useMemo(
    () => shouldAnimateMessageEntrance(message.id),
    [message.id]
  );

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

  const handleReactionTap = (e: React.MouseEvent<HTMLButtonElement>, emoji: string) => {
    e.stopPropagation();
    triggerEmojiBurst(e.clientX, e.clientY, emoji);
    onReact?.(message.id, emoji);
    (socketManager as any).emitReaction?.(message.conversationId, message.id, emoji);
    setShowReactionBar(false);
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

  return (
    <motion.div
      initial={
        shouldAnimateIn
          ? { opacity: 0, y: 12, scale: 0.92 }
          : false
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        ...(message.status === 'sending' ? SPRING_MOMENTUM : SPRING_CRITICALLY_DAMPED),
        delay: shouldAnimateIn ? Math.min(staggerIndex * 0.02, 0.16) : 0,
      }}
      style={{
        transformOrigin: isOwn ? '100% 100%' : '0% 100%',
      }}
      className={`group relative flex items-end gap-2 ${
        isOwn ? 'justify-end' : 'justify-start'
      } ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}
    >
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
        transition={startXRef.current !== null ? { duration: 0 } : SPRING_CRITICALLY_DAMPED}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowReactionBar((v) => !v);
        }}
        className={`relative max-w-[82%] sm:max-w-[68%] px-3.5 py-2 text-body text-sm shadow-xs select-text ${
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
        {/* Quick Emoji Reaction Bar scaling from the bubble (Deliverable 4 & 7) */}
        {showReactionBar && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={SPRING_CRITICALLY_DAMPED}
            style={{ transformOrigin: isOwn ? '100% 100%' : '0% 100%' }}
            className={`absolute -top-10 ${
              isOwn ? 'right-0' : 'left-0'
            } z-30 flex items-center gap-1 px-2 py-1 rounded-full glass-chrome border border-white/20 shadow-xl`}
          >
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={(e) => handleReactionTap(e, em)}
                className="fluid-press px-1.5 py-0.5 text-sm hover:scale-125 transition-transform"
              >
                {em}
              </button>
            ))}
          </motion.div>
        )}

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

        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {renderBodyWithRoomChips(message.body)}
        </div>

        {/* Reaction Pills */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((r, i) => (
              <button
                key={`${r.emoji}-${i}`}
                type="button"
                onClick={(e) => handleReactionTap(e, r.emoji)}
                className="fluid-press px-1.5 py-0.5 rounded-full bg-black/25 border border-white/15 text-[11px]"
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${
            isOwn ? 'text-sky-100/80' : 'text-slate-400'
          }`}
        >
          <span>{formattedTime}</span>
          {isOwn && <DeliveryTickMorph status={message.status} />}
        </div>

        {/* Desktop Hover Reply + Reaction Triggers */}
        <div
          className={`opacity-0 group-hover:opacity-100 focus-within:opacity-100 absolute top-1/2 -translate-y-1/2 ${
            isOwn ? '-left-16' : '-right-16'
          } flex items-center gap-1`}
        >
          <button
            type="button"
            onClick={() => setShowReactionBar((v) => !v)}
            className="fluid-press p-1.5 rounded-full bg-slate-800/90 border border-white/10 text-slate-300 hover:text-white"
            aria-label="React to message"
            title="React"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            className="fluid-press p-1.5 rounded-full bg-slate-800/90 border border-white/10 text-slate-300 hover:text-white"
            aria-label="Reply to message"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>

      {isOwn && message.status === 'failed' && (
        <button
          type="button"
          onClick={() => onRetry(message.id)}
          className="fluid-press inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs"
        >
          <RotateCcw className="w-3 h-3" />
          Retry
        </button>
      )}
    </motion.div>
  );
};
