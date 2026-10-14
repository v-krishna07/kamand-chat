import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SPRING_SHEET, PointerVelocityTracker, projectMomentum, rubberband, } from '../lib/physics.js';
/**
 * Interruptible, velocity-aware modal sheet with 1:1 pointer tracking,
 * upward rubber-banding, and momentum projection (§2, §3, §6, §9).
 */
export const FluidSheet = ({ isOpen, onClose, title, children }) => {
    const [dragY, setDragY] = useState(0);
    const grabOffsetRef = useRef(null);
    const trackerRef = useRef(new PointerVelocityTracker());
    const handlePointerDown = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        grabOffsetRef.current = e.clientY - dragY;
        trackerRef.current.reset();
        trackerRef.current.addSample(e.clientX, e.clientY);
    };
    const handlePointerMove = (e) => {
        if (grabOffsetRef.current === null)
            return;
        trackerRef.current.addSample(e.clientX, e.clientY);
        const rawDelta = e.clientY - grabOffsetRef.current;
        if (rawDelta < 0) {
            // Upward drag past top boundary -> progressive rubber-banding
            setDragY(rubberband(rawDelta, 240));
        }
        else {
            setDragY(rawDelta);
        }
    };
    const handlePointerUp = () => {
        if (grabOffsetRef.current === null)
            return;
        grabOffsetRef.current = null;
        const { vy } = trackerRef.current.getVelocity();
        const projectedY = dragY + projectMomentum(vy, 0.995);
        setDragY(0);
        // Decide commit vs reverse by projected resting point & velocity sign (§6)
        if (vy > 450 || (vy >= 0 && projectedY > 140)) {
            onClose();
        }
    };
    return (_jsx(AnimatePresence, { children: isOpen && (_jsxs("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4", role: "dialog", "aria-modal": "true", "aria-label": title, children: [_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: SPRING_SHEET, className: "fixed inset-0 bg-slate-950/65 backdrop-blur-xs", onClick: onClose }), _jsxs(motion.div, { initial: { opacity: 0, scale: 0.95, y: 40 }, animate: { opacity: 1, scale: 1, y: dragY }, exit: { opacity: 0, scale: 0.95, y: 40 }, transition: grabOffsetRef.current !== null ? { duration: 0 } : SPRING_SHEET, className: "relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl glass-chrome glass-top-highlight border border-white/15 shadow-2xl overflow-hidden", children: [_jsxs("div", { onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerUp, className: "pt-3 pb-2 px-6 cursor-grab active:cursor-grabbing select-none touch-none", children: [_jsx("div", { className: "mx-auto h-1.5 w-11 rounded-full bg-slate-400/40 mb-3" }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-heading text-lg text-slate-100", children: title }), _jsx("button", { type: "button", onClick: onClose, className: "fluid-press min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-white/10", "aria-label": "Close modal", children: "\u2715" })] })] }), _jsx("div", { className: "px-6 pb-6 max-h-[75vh] overflow-y-auto", children: children })] })] })) }));
};
