import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck, Clock, AlertCircle, RotateCcw, Reply, MapPin } from 'lucide-react';
import type { MessageDTO } from '@kamand/shared';
import { SPRING_DEFAULT, rubberband } from '../lib/physics.js';

interface MessageBubbleProps {
  message: MessageDTO;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onReply: (message: MessageDTO) => void;
  onRetry: (messageId: string) => void;
}

const ROOM_CODE_REGEX = /\b([A-D][-\s]?\d{1,3})\b/gi;

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  onReply,
  onRetry,
}) => {
  const [swipeX, setSwipeX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const committedReplyRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startXRef.current = e.clientX;
    committedReplyRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const deltaX = e.clientX - startXRef.current;
    // Swipe right to reply with progressive rubber-banding (§9, §15)
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

  // Render campus room codes (e.g., B-19, A-12, C-10) as interactive chips (§13)
  const renderBodyWithRoomChips = (text: string) => {
    const parts = text.split(ROOM_CODE_REGEX);
    return parts.map((part, idx) => {
      if (ROOM_CODE_REGEX.test(part)) {
        ROOM_CODE_REGEX.lastIndex = 0;
        const normalized = part.toUpperCase().replace(/\s+/g, '-');
        return (
          <span
            key={idx}
            title={`Campus Location: ${normalized}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-white/15 text-sky-200 font-medium text-xs border border-white/20"
          >
            <MapPin className="w-3 h-3" />
            {normalized}
          </span>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_DEFAULT}
      className={`group relative flex items-end gap-2 ${
        isOwn ? 'justify-end' : 'justify-start'
      } ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}
    >
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

        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {renderBodyWithRoomChips(message.body)}
        </div>

        <div
          className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${
            isOwn ? 'text-sky-100/80' : 'text-slate-400'
          }`}
        >
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

        {/* Desktop quick reply button */}
        <button
          type="button"
          onClick={() => onReply(message)}
          className={`fluid-press opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1/2 -translate-y-1/2 ${
            isOwn ? '-left-9' : '-right-9'
          } p-1.5 rounded-full bg-slate-800/90 border border-white/10 text-slate-300 hover:text-white`}
          aria-label="Reply to message"
          title="Reply"
        >
          <Reply className="w-3.5 h-3.5" />
        </button>
      </motion.div>

      {/* Retry button if message failed */}
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
