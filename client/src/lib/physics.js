/**
 * Apple WWDC 2018 "Designing Fluid Interfaces" Physics Primitives
 * Translated for Web Pointer Events & Motion Springs
 */
export const SPRING_DEFAULT = {
    type: 'spring',
    bounce: 0, // Damping ratio 1.0 (critically damped, zero overshoot)
    duration: 0.38,
};
export const SPRING_MOMENTUM = {
    type: 'spring',
    bounce: 0.2, // Damping ratio ~0.8 (only when gesture carried momentum)
    duration: 0.4,
};
export const SPRING_SHEET = {
    type: 'spring',
    bounce: 0.18, // Damping ratio ~0.8, response 0.3s
    duration: 0.3,
};
/**
 * Projects a gesture's resting position from release velocity (px/s)
 * using Apple's exponential decay formula (§6).
 */
export function projectMomentum(initialVelocityPxPerSec, decelerationRate = 0.998) {
    return ((initialVelocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}
/**
 * Progressive resistance at boundaries (§9 Rubber-banding).
 */
export function rubberband(overshoot, dimension, constant = 0.55) {
    if (dimension <= 0 || overshoot === 0)
        return 0;
    const sign = overshoot < 0 ? -1 : 1;
    const abs = Math.abs(overshoot);
    return sign * ((abs * dimension * constant) / (dimension + constant * abs));
}
/**
 * Normalizes gesture velocity (px/s) by remaining distance when an API requires relative velocity (§5).
 */
export function computeRelativeVelocity(gestureVelocityPxPerSec, currentValue, targetValue) {
    const remaining = targetValue - currentValue;
    if (Math.abs(remaining) < 1e-3)
        return 0;
    return gestureVelocityPxPerSec / remaining;
}
/**
 * Tracks the last ~100ms of pointermove samples to compute accurate release velocity (px/s).
 */
export class PointerVelocityTracker {
    samples = [];
    addSample(x, y, t = performance.now()) {
        this.samples.push({ x, y, t });
        const cutoff = t - 120;
        while (this.samples.length > 2 && this.samples[0].t < cutoff) {
            this.samples.shift();
        }
    }
    getVelocity() {
        if (this.samples.length < 2)
            return { vx: 0, vy: 0 };
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        const dtSec = (last.t - first.t) / 1000;
        if (dtSec <= 0.001)
            return { vx: 0, vy: 0 };
        return {
            vx: (last.x - first.x) / dtSec,
            vy: (last.y - first.y) / dtSec,
        };
    }
    reset() {
        this.samples = [];
    }
}
