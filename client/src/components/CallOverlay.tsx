import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  Minimize2,
  Maximize2,
  ShieldCheck,
  Signal,
  LayoutGrid,
} from 'lucide-react';
import { useCallStore } from '../store/useCallStore.js';
import { SPRING_DEFAULT, SPRING_SHEET, PointerVelocityTracker } from '../lib/physics.js';
import { computeNearestPipCorner } from '../lib/callEngine.js';

/**
 * Full-Screen Incoming Call Sheet, Pre-Call Device Check, Ongoing E2EE Call Stage,
 * and Draggable Picture-in-Picture (PiP) with Momentum Projection + Corner Snap (§10, §15).
 */
export const CallOverlay: React.FC = () => {
  const {
    phase,
    peerTitle,
    isGroup,
    incomingCall,
    localStream,
    peers,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isPipMode,
    viewLayout,
    networkQuality,
    keyGeneration,
    startedAtMs,
    startOutgoingCall,
    acceptIncomingCall,
    declineIncomingCall,
    hangup,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    togglePipMode,
    setViewLayout,
    cleanupAllMediaAndConnections,
  } = useCallStore();

  const [elapsedSec, setElapsedSec] = useState(0);
  const [pipPos, setPipPos] = useState({ x: 24, y: 80 });
  const isDraggingPipRef = useRef(false);
  const grabOffsetRef = useRef({ dx: 0, dy: 0 });
  const trackerRef = useRef(new PointerVelocityTracker());
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, phase, isPipMode]);

  useEffect(() => {
    if (phase !== 'ongoing' || !startedAtMs) {
      setElapsedSec(0);
      return;
    }
    const interval = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, startedAtMs]);

  useEffect(() => {
    // Initialize PiP in bottom-right corner
    const snapped = computeNearestPipCorner(
      window.innerWidth - 280,
      window.innerHeight - 220,
      0,
      0,
      {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pipWidth: 256,
        pipHeight: 168,
      }
    );
    setPipPos({ x: snapped.x, y: snapped.y });
  }, []);

  if (phase === 'idle') return null;

  const formattedTimer = `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(
    elapsedSec % 60
  ).padStart(2, '0')}`;

  // 1. Full-Screen Incoming Call Sheet (§10)
  if (phase === 'ringing-in' && incomingCall) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={SPRING_SHEET}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between p-8 glass-chrome bg-slate-950/90 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Incoming call"
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>End-to-End Encrypted {incomingCall.mediaType === 'video' ? 'Video' : 'Voice'} Call</span>
          </div>

          <div className="flex flex-col items-center text-center space-y-4">
            <motion.div
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-3xl font-bold shadow-2xl"
            >
              {incomingCall.initiatorName.slice(0, 1).toUpperCase()}
            </motion.div>
            <div>
              <h2 className="text-display text-2xl">{incomingCall.initiatorName}</h2>
              <p className="text-sm text-slate-400 mt-1">
                {incomingCall.isGroup ? 'Incoming Group Mesh Call…' : 'Incoming 1:1 Call…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-8 pb-6">
            <button
              type="button"
              onClick={declineIncomingCall}
              className="fluid-press w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center shadow-lg shadow-rose-500/30"
              aria-label="Decline call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => void acceptIncomingCall()}
              className="fluid-press w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30"
              aria-label="Accept call"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // 2. Pre-Call Device Check Sheet (§10)
  if (phase === 'precheck') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label="Pre-call device check"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING_SHEET}
          className="w-full max-w-md rounded-3xl glass-chrome glass-top-highlight border border-white/15 p-6 space-y-5 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-heading text-lg text-white">Ready to Call {peerTitle}?</h2>
              <p className="text-xs text-slate-400">
                Check your camera and microphone before starting the E2EE call.
              </p>
            </div>
            <button
              type="button"
              onClick={cleanupAllMediaAndConnections}
              className="fluid-press p-2 rounded-full text-slate-400 hover:text-white"
              aria-label="Cancel call"
            >
              ✕
            </button>
          </div>

          <div className="relative h-48 rounded-2xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center">
            {!isCameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center space-y-1">
                <VideoOff className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-400">Camera is off (Voice mode)</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              className={`fluid-press px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                  : 'bg-slate-900 border-white/15 text-slate-200'
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isMuted ? 'Mic Muted' : 'Mic On'}</span>
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              className={`fluid-press px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                isCameraOff
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                  : 'bg-slate-900 border-white/15 text-slate-200'
              }`}
            >
              {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              <span>{isCameraOff ? 'Camera Off' : 'Camera On'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void startOutgoingCall()}
            className="fluid-press w-full min-h-[46px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Phone className="w-4 h-4" />
            <span>Start E2EE Call</span>
          </button>
        </motion.div>
      </div>
    );
  }

  // 3. Draggable Picture-in-Picture (PiP) Mode with Momentum + Corner Snap (§4, §6, §10)
  if (isPipMode) {
    const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingPipRef.current = true;
      grabOffsetRef.current = {
        dx: e.clientX - pipPos.x,
        dy: e.clientY - pipPos.y,
      };
      trackerRef.current.reset();
      trackerRef.current.addSample(e.clientX, e.clientY);
    };

    const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingPipRef.current) return;
      trackerRef.current.addSample(e.clientX, e.clientY);
      setPipPos({
        x: e.clientX - grabOffsetRef.current.dx,
        y: e.clientY - grabOffsetRef.current.dy,
      });
    };

    const handlePipPointerUp = () => {
      if (!isDraggingPipRef.current) return;
      isDraggingPipRef.current = false;
      const { vx, vy } = trackerRef.current.getVelocity();
      const snapped = computeNearestPipCorner(pipPos.x, pipPos.y, vx, vy, {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pipWidth: 256,
        pipHeight: 168,
      });
      setPipPos({ x: snapped.x, y: snapped.y });
    };

    return (
      <motion.div
        animate={{ x: pipPos.x, y: pipPos.y }}
        transition={isDraggingPipRef.current ? { duration: 0 } : SPRING_DEFAULT}
        onPointerDown={handlePipPointerDown}
        onPointerMove={handlePipPointerMove}
        onPointerUp={handlePipPointerUp}
        onPointerCancel={handlePipPointerUp}
        className="fixed top-0 left-0 z-50 w-64 h-42 rounded-3xl glass-chrome glass-top-highlight border border-white/20 shadow-2xl p-3 flex flex-col justify-between cursor-grab active:cursor-grabbing select-none touch-none"
        role="region"
        aria-label="Picture in Picture Call"
      >
        <div className="flex items-center justify-between text-xs text-white">
          <span className="font-semibold truncate">{peerTitle}</span>
          <span className="font-mono text-emerald-300">{formattedTimer}</span>
        </div>

        <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>E2EE Gen #{keyGeneration}</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={toggleMute}
            className="fluid-press p-2 rounded-xl bg-white/10 text-white"
            aria-label="Toggle Mute"
          >
            {isMuted ? <MicOff className="w-4 h-4 text-rose-300" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={togglePipMode}
            className="fluid-press p-2 rounded-xl bg-white/10 text-white"
            aria-label="Expand call"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={hangup}
            className="fluid-press p-2 rounded-xl bg-rose-500 text-white"
            aria-label="End call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  // 4. Full Ongoing / Ringing-Out / Reconnecting Call Stage
  const peerList = Object.values(peers);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 text-white p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Active call"
    >
      {/* Top Call Bar */}
      <header className="flex items-center justify-between px-4 py-3 rounded-2xl glass-chrome border border-white/10">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Insertable Streams E2EE · Key Gen #{keyGeneration}</span>
          </span>
          <span className="text-xs text-slate-300 font-mono">
            {phase === 'ringing-out'
              ? 'Ringing…'
              : phase === 'reconnecting'
                ? 'Reconnecting…'
                : formattedTimer}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/5 text-xs text-slate-300"
            title={`Network quality: ${networkQuality}`}
          >
            <Signal
              className={`w-3.5 h-3.5 ${
                networkQuality === 'excellent'
                  ? 'text-emerald-400'
                  : networkQuality === 'good'
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }`}
            />
            <span className="hidden sm:inline capitalize">{networkQuality}</span>
          </span>

          {isGroup && (
            <button
              type="button"
              onClick={() => setViewLayout(viewLayout === 'grid' ? 'speaker' : 'grid')}
              className="fluid-press px-3 py-1.5 rounded-xl bg-white/10 text-xs font-medium flex items-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="capitalize">{viewLayout} View</span>
            </button>
          )}

          <button
            type="button"
            onClick={togglePipMode}
            className="fluid-press p-2 rounded-xl bg-white/10 hover:bg-white/15"
            aria-label="Minimize to Picture-in-Picture"
            title="Picture-in-Picture"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Center Video / Avatar Grid */}
      <div
        className={`flex-1 my-4 grid gap-4 ${
          peerList.length <= 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'
        }`}
      >
        {/* Local Participant Tile */}
        <div className="relative rounded-3xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center">
          {!isCameraOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-2xl font-bold text-sky-300">
                You
              </div>
              <span className="text-xs text-slate-400">
                {isScreenSharing ? 'Sharing Screen' : 'Voice Only'}
              </span>
            </div>
          )}
          <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 text-xs">
            You {isMuted ? '(Muted)' : ''}
          </div>
        </div>

        {/* Remote Participant Tiles */}
        {peerList.length === 0 ? (
          <div className="rounded-3xl bg-slate-900/60 border border-white/10 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-2xl font-bold text-indigo-300 mb-3">
              {peerTitle.slice(0, 1).toUpperCase()}
            </div>
            <p className="text-base font-semibold">{peerTitle}</p>
            <p className="text-xs text-slate-400 mt-1">
              {phase === 'ringing-out' ? 'Calling…' : 'Connected · E2EE Media Active'}
            </p>
          </div>
        ) : (
          peerList.map((peer) => (
            <div
              key={peer.userId}
              className="relative rounded-3xl bg-slate-900 border border-white/10 overflow-hidden flex flex-col items-center justify-center"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-2xl font-bold">
                {peer.displayName.slice(0, 1).toUpperCase()}
              </div>
              <p className="mt-2 text-sm font-semibold">{peer.displayName}</p>
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 text-xs">
                {peer.displayName} {peer.isMuted ? '· Muted' : ''}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Floating Call Controls */}
      <footer className="mx-auto flex items-center gap-3 px-6 py-3 rounded-3xl glass-chrome glass-top-highlight border border-white/15">
        <button
          type="button"
          onClick={toggleMute}
          className={`fluid-press min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center ${
            isMuted ? 'bg-rose-500/25 text-rose-200' : 'bg-white/10 text-white'
          }`}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          className={`fluid-press min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center ${
            isCameraOff ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white'
          }`}
          aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
        >
          {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={() => void toggleScreenShare()}
          className={`fluid-press min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center ${
            isScreenSharing ? 'bg-sky-500 text-white' : 'bg-white/10 text-white'
          }`}
          aria-label="Toggle screen share"
        >
          <MonitorUp className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={hangup}
          className="fluid-press min-h-[48px] px-5 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-500/25"
          aria-label="End call"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Call</span>
        </button>
      </footer>
    </div>
  );
};
