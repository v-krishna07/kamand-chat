import React, { useState } from 'react';
import { motion } from 'motion/react';
import { SPRING_CRITICALLY_DAMPED } from './presets.js';
import { useMotionPreferences } from './MotionProvider.js';

interface GlassTiltCardProps {
  children: React.ReactNode;
  className?: string;
  maxTiltDeg?: number;
}

/**
 * Translucent glass card with subtle 3D tilt and cursor-follow radial spotlight glow (Deliverable 5).
 * Only animates GPU-composited `transform` and `opacity`.
 */
export const GlassTiltCard: React.FC<GlassTiltCardProps> = ({
  children,
  className = '',
  maxTiltDeg = 4,
}) => {
  const { prefersReducedMotion } = useMotionPreferences();
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, spotX: 50, spotY: 50, hovered: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
    const dx = (relX - 0.5) * 2;
    const dy = (relY - 0.5) * 2;

    setTilt({
      rotateX: -dy * maxTiltDeg,
      rotateY: dx * maxTiltDeg,
      spotX: Math.round(relX * 100),
      spotY: Math.round(relY * 100),
      hovered: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt((prev) => ({ ...prev, rotateX: 0, rotateY: 0, hovered: false }));
  };

  return (
    <motion.div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      animate={{
        rotateX: tilt.rotateX,
        rotateY: tilt.rotateY,
      }}
      transition={SPRING_CRITICALLY_DAMPED}
      style={{ transformPerspective: 1000 }}
      className={`relative overflow-hidden glass-chrome glass-top-highlight ${className}`}
    >
      {/* Cursor-Follow Radial Spotlight Glow */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: tilt.hovered && !prefersReducedMotion ? 1 : 0,
          background: `radial-gradient(360px circle at ${tilt.spotX}% ${tilt.spotY}%, rgba(56, 189, 248, 0.13), transparent 70%)`,
        }}
        aria-hidden="true"
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};
