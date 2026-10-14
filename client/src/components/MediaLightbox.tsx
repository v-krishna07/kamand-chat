import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { SPRING_SHEET, PointerVelocityTracker, projectMomentum } from '../lib/physics.js';

interface MediaLightboxProps {
  imageUrl: string | null;
  caption?: string;
  onClose: () => void;
}

/**
 * Pinch / Drag-to-Dismiss Image Lightbox with Momentum Projection (§15 Chat UI).
 */
export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  imageUrl,
  caption,
  onClose,
}) => {
  const [dragY, setDragY] = useState(0);
  const [scale, setScale] = useState(1);
  const startYRef = useRef<number | null>(null);
  const trackerRef = useRef(new PointerVelocityTracker());

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY - dragY;
    trackerRef.current.reset();
    trackerRef.current.addSample(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    trackerRef.current.addSample(e.clientX, e.clientY);
    setDragY(e.clientY - startYRef.current);
  };

  const handlePointerUp = () => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    const { vy } = trackerRef.current.getVelocity();
    const projected = dragY + projectMomentum(vy, 0.995);
    setDragY(0);
    if (Math.abs(projected) > 150 || Math.abs(vy) > 550) {
      setScale(1);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {imageUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SPRING_SHEET}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between p-4 bg-slate-950/90 backdrop-blur-lg select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
        >
          <div className="w-full flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.5, s + 0.5))}
              className="fluid-press p-2.5 rounded-full bg-white/10 text-white"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale(1)}
              className="fluid-press p-2.5 rounded-full bg-white/10 text-white"
              aria-label="Reset zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="fluid-press p-2.5 rounded-full bg-white/10 text-white"
              aria-label="Close image viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <motion.div
            animate={{ y: dragY, scale }}
            transition={startYRef.current !== null ? { duration: 0 } : SPRING_SHEET}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="max-w-4xl max-h-[78vh] cursor-grab active:cursor-grabbing touch-none"
          >
            <img
              src={imageUrl}
              alt={caption || 'Shared attachment'}
              className="max-w-full max-h-[75vh] rounded-2xl object-contain shadow-2xl border border-white/15"
              draggable={false}
            />
          </motion.div>

          <p className="text-xs text-slate-300 pb-2">
            {caption || 'Drag up or down with momentum to dismiss'}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
