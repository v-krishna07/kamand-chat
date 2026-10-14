# Kamand Chat — Fluid Motion & Micro-Interactions Architecture

This document defines the physics rules, spring presets, accessibility signals, and 8-step commit structure for `/client/src/motion/`.

## 1. Non-Negotiable Motion Rules
1. **Springs over Fixed Keyframes**: All interactive transitions use `motion/react` springs so gestures are 100% interruptible and inherit current velocity.
   - `SPRING_CRITICALLY_DAMPED` (`damping: 1.0`, `bounce: 0`, `duration: 0.38s`): Default for page transitions, shared layout (`layoutId`) morphs, and modals.
   - `SPRING_MOMENTUM` (`damping: ~0.8`, `bounce: 0.2`, `duration: 0.4s`): Used **only** when a user gesture (flick, throw, sheet release, message send) carries physical velocity.
   - `SPRING_SHEET` (`damping: ~0.8`, `bounce: 0.18`, `duration: 0.3s`): Bottom sheets and drawers.
2. **GPU Compositor Discipline**: Only `transform`, `opacity`, and isolated `filter` properties are animated. Layout-thrashing properties (`width`, `height`, `top`, `left`, `margin`) are never animated during active scrolling or dragging.
3. **10,000-Message Virtualizer Guard**: `seenMessageIds` tracks messages that have already mounted so scrolling back and forth through a virtualized 10,000-message stream never re-triggers entrance animations.
4. **Accessibility Signals (`MotionProvider.tsx`)**:
   - `prefers-reduced-motion: reduce`: Global `<MotionConfig reducedMotion="user">` collapses springs into instant opacity cross-fades and pauses 3D/particle loops.
   - `prefers-reduced-transparency: reduce`: Replaces `backdrop-filter` glass layers with solid high-legibility slate surfaces.
   - `prefers-contrast: more`: Enforces 1.5px high-contrast borders across all cards and bubbles.

## 2. 8-Step Commit Sequence
1. `feat(motion): boot SVG stroke draw-in, shared layoutId morph & skeleton shimmers`
2. `feat(motion): code-split Three.js / R3F mountain valley & orbiting bubble hero with WebGL fallback`
3. `feat(motion): shared layoutId chat transitions & 1:1 rubber-band edge swipe-back`
4. `feat(motion): virtualizer-safe message entrance springs, delivery-tick morph & emoji burst`
5. `feat(motion): glassmorphism depth, 3D tilt cards & cursor-follow spotlight glow`
6. `feat(motion): velocity-projected gesture sheets with isolated close-button pointer events`
7. `feat(motion): magnetic buttons, animated switch, counter ticks & zero-flash theme toggle`
8. `feat(motion): SVG stroke-dashoffset map route draw, live GPS beacon & face-login scanner rings`
