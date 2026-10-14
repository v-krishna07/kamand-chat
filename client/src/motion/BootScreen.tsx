import React from 'react';
import { motion } from 'motion/react';
import { SPRING_CRITICALLY_DAMPED } from './presets.js';

/**
 * Boot Screen: Draws the Kamand Valley + Chat Emblem via SVG stroke (`pathLength: 0 -> 1`),
 * then morphs into the app shell header via `layoutId="kamand-brand-mark"` (Deliverable 1).
 */
export const BootScreen: React.FC<{ subtitle?: string }> = ({
  subtitle = 'Restoring encrypted session…',
}) => {
  return (
    <div
      className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 select-none"
      role="status"
      aria-label={subtitle}
    >
      <motion.div
        layoutId="kamand-brand-mark"
        transition={SPRING_CRITICALLY_DAMPED}
        className="w-20 h-20 rounded-3xl glass-chrome glass-top-highlight border border-sky-400/30 flex items-center justify-center shadow-2xl shadow-sky-500/20 mb-5"
      >
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          {/* Kamand Mountain Peaks + Chat Bubble Contour */}
          <motion.path
            d="M8 34 L18 16 L25 27 L31 19 L40 34 Z"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0.3 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.75, ease: 'easeInOut' }}
          />
          <motion.path
            d="M10 10 H38 A4 4 0 0 1 42 14 V34 A4 4 0 0 1 38 38 H18 L10 43 V38 A4 4 0 0 1 6 34 V14 A4 4 0 0 1 10 10 Z"
            stroke="#818cf8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.85, ease: 'easeInOut' }}
          />
        </svg>
      </motion.div>

      <motion.h1
        layoutId="kamand-brand-title"
        transition={SPRING_CRITICALLY_DAMPED}
        className="text-heading text-lg text-white tracking-tight"
      >
        Kamand Chat
      </motion.h1>
      <p className="text-caption text-slate-400 mt-1">{subtitle}</p>

      <div className="w-64 mt-6">
        <ChatListSkeleton rows={3} />
      </div>
    </div>
  );
};

/**
 * Non-blocking Skeleton Shimmer for Conversation Lists (Deliverable 1 & Section 15).
 */
export const ChatListSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="space-y-3 p-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-900/60 border border-white/5 overflow-hidden relative"
        >
          <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded-full bg-slate-800 animate-pulse" />
            <div className="h-2.5 w-4/5 rounded-full bg-slate-800/70 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Non-blocking Skeleton Shimmer for Message Streams (Deliverable 1 & Section 15).
 */
export const MessageStreamSkeleton: React.FC = () => {
  return (
    <div className="space-y-3 py-4 px-2" aria-hidden="true">
      {[false, true, false, true].map((isOwn, idx) => (
        <div
          key={idx}
          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`h-12 w-56 rounded-2xl animate-pulse ${
              isOwn ? 'bg-sky-500/20 rounded-br-xs' : 'bg-slate-800/70 rounded-bl-xs'
            }`}
          />
        </div>
      ))}
    </div>
  );
};
