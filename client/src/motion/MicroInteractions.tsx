import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, type HTMLMotionProps } from 'motion/react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { SPRING_CRITICALLY_DAMPED, SPRING_SNAPPY } from './presets.js';
import { useMotionPreferences } from './MotionProvider.js';

/**
 * 1. Magnetic Button with Instant Pointer-Down Scale (0.97) & Spring Pull (Deliverable 7)
 */
export const MagneticButton: React.FC<
  HTMLMotionProps<'button'> & { strength?: number }
> = ({ children, className = '', strength = 0.22, onPointerMove, onPointerLeave, ...rest }) => {
  const { prefersReducedMotion } = useMotionPreferences();
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  return (
    <motion.button
      animate={{ x: offset.x, y: offset.y }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      transition={SPRING_SNAPPY}
      onPointerMove={(e) => {
        if (!prefersReducedMotion && !rest.disabled) {
          const rect = e.currentTarget.getBoundingClientRect();
          const dx = e.clientX - (rect.left + rect.width / 2);
          const dy = e.clientY - (rect.top + rect.height / 2);
          setOffset({ x: dx * strength, y: dy * strength });
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        setOffset({ x: 0, y: 0 });
        onPointerLeave?.(e);
      }}
      className={`fluid-press ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
};

/**
 * 2. Spring-Animated Toggle Switch (Deliverable 7)
 */
export const AnimatedSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}> = ({ checked, onChange, label }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`fluid-press relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border transition-colors ${
        checked
          ? 'bg-sky-500 border-sky-400'
          : 'bg-slate-800 border-white/15'
      }`}
    >
      <motion.span
        layout
        transition={SPRING_SNAPPY}
        animate={{ x: checked ? 20 : 2 }}
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs my-auto"
      />
    </button>
  );
};

/**
 * 3. Animated Number / Counter Tick Component (Deliverable 7)
 */
export const AnimatedCounter: React.FC<{ value: number; className?: string }> = ({
  value,
  className = '',
}) => {
  return (
    <span className={`inline-flex overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={SPRING_SNAPPY}
          className="inline-block tabular-nums"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

/**
 * 4. Delivery-Tick Morph Animation (`sending` -> `sent` -> `delivered` -> `read`) (Deliverable 4)
 */
export const DeliveryTickMorph: React.FC<{
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}> = ({ status }) => {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4" aria-label={`Status: ${status}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={SPRING_SNAPPY}
          className="inline-flex items-center"
        >
          {status === 'sending' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
          {status === 'sent' && <Check className="w-3.5 h-3.5" />}
          {status === 'delivered' && <CheckCheck className="w-3.5 h-3.5" />}
          {status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />}
          {status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-rose-300" />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

/**
 * 5. Concentric Scanning-Ring Animation for On-Device Face Login (Deliverable 8)
 */
export const FaceScannerRings: React.FC<{ active: boolean; label?: string }> = ({
  active,
  label = 'Scanning on-device facial landmarks…',
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 100 ? 100 : p + 20));
    }, 120);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={SPRING_CRITICALLY_DAMPED}
      className="my-3 p-4 rounded-2xl bg-slate-900/90 border border-emerald-400/30 flex flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative w-16 h-16 flex items-center justify-center mb-2">
        <motion.span
          animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0.15, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="absolute inset-0 rounded-full border-2 border-emerald-400"
        />
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-1 rounded-full border-2 border-dashed border-sky-400"
        />
        <span className="text-xs font-mono font-bold text-emerald-300">{progress}%</span>
      </div>
      <span className="text-xs text-emerald-200 font-medium">{label}</span>
    </motion.div>
  );
};
