import React from 'react';
import { motion } from 'motion/react';
import { SPRING_DEFAULT } from '../lib/physics.js';

interface TypingIndicatorProps {
  names: string[];
}

/**
 * 3-dot spring typing indicator (§15 Chat UI).
 */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ names }) => {
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : `${names.slice(0, 2).join(', ')} are typing…`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={SPRING_DEFAULT}
      className="flex items-center gap-2.5 mt-2 px-3.5 py-2 rounded-2xl rounded-bl-xs bg-slate-800/90 border border-white/10 w-fit"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.16,
              ease: 'easeInOut',
            }}
            className="w-1.5 h-1.5 rounded-full bg-sky-400"
          />
        ))}
      </div>
      <span className="text-caption text-slate-300">{label}</span>
    </motion.div>
  );
};
