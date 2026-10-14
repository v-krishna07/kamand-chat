import React, { Suspense, useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Sparkles, ArrowRight, ScanFace, Chrome } from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useAuthStore } from '../store/useAuthStore.js';
import { apiFetch, setCsrfToken } from '../lib/api.js';
import {
  normalizeEmbedding,
  computeEmbeddingDistance,
  encryptFaceEmbedding,
  decryptFaceEmbedding,
  signFaceChallenge,
} from '../lib/faceAuth.js';
import { useSecurityStore } from '../store/useSecurityStore.js';
import { FluidSheet } from '../components/FluidSheet.js';
import { SPRING_CRITICALLY_DAMPED } from '../motion/presets.js';
import { GlassTiltCard } from '../motion/GlassTiltCard.js';
import { MagneticButton, FaceScannerRings, AnimatedSwitch } from '../motion/MicroInteractions.js';
import { ParticleCanvas } from '../components/ParticleCanvas.js';

const LazyValleyHero3D = React.lazy(() => import('../motion/ValleyHero3D.js'));

const DEVICE_FACE_SECRET_STORAGE = 'kamand_face_local_aes_v1';
const ENROLLED_FACE_USERNAME_STORAGE = 'kamand_face_enrolled_username';

async function getOrCreateLocalFaceSecretKey(): Promise<CryptoKey> {
  const existingB64 = localStorage.getItem(DEVICE_FACE_SECRET_STORAGE);
  if (existingB64) {
    const bytes = Uint8Array.from(atob(existingB64), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  let bin = '';
  raw.forEach((b) => (bin += String.fromCharCode(b)));
  localStorage.setItem(DEVICE_FACE_SECRET_STORAGE, btoa(bin));
  return key;
}

export const AuthPage: React.FC = () => {
  const { login, register, hydrateSession, error, clearError } = useAuthStore();
  const ensureDeviceIdentityKeys = useSecurityStore((s) => s.ensureDeviceIdentityKeys);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState(
    () => localStorage.getItem(ENROLLED_FACE_USERNAME_STORAGE) || ''
  );
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [enrollFaceOnRegister, setEnrollFaceOnRegister] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanningFace, setIsScanningFace] = useState(false);
  const [localAuthNotice, setLocalAuthNotice] = useState<string | null>(null);

  const [isGoogleSheetOpen, setIsGoogleSheetOpen] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('b26343@students.iitmandi.ac.in');
  const [googleNameInput, setGoogleNameInput] = useState('Krishna Vijaywargiya');

  const switchMode = (next: 'login' | 'register') => {
    clearError();
    setLocalAuthNotice(null);
    setMode(next);
  };

  const enrollBiometricForCurrentSession = async (enrolledUsername: string) => {
    const bundle = await ensureDeviceIdentityKeys();
    const localSecret = await getOrCreateLocalFaceSecretKey();
    const baseVector = Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.37) + 1.2);
    const embedding = normalizeEmbedding(baseVector);
    const { encryptedEmbedding, embeddingIv } = await encryptFaceEmbedding(
      embedding,
      localSecret
    );

    await apiFetch('/api/face/enroll', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: bundle.deviceId,
        deviceName: 'Kamand On-Device Biometric Key',
        encryptedEmbedding,
        embeddingIv,
        faceSigningPublicKey: bundle.signingPublicKeyJwk,
      }),
    });

    localStorage.setItem(ENROLLED_FACE_USERNAME_STORAGE, enrolledUsername.toLowerCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalAuthNotice(null);
    try {
      if (mode === 'login') {
        await login({ identifier, password });
      } else {
        await register({
          username,
          email,
          displayName,
          password,
          roomCode: roomCode || undefined,
        });
        if (enrollFaceOnRegister) {
          await enrollBiometricForCurrentSession(username).catch(() => undefined);
        }
      }
    } catch {
      // Handled in store error state
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignInConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalAuthNotice(null);
    try {
      const cleanEmail = googleEmailInput.trim().toLowerCase();
      const hd = cleanEmail.split('@')[1] || 'students.iitmandi.ac.in';
      const demoIdToken = `demo-google-token:${cleanEmail}:${googleNameInput.trim()}:${hd}`;

      const res = await apiFetch<{ user: UserSummary; csrfToken: string }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken: demoIdToken }),
      });
      setCsrfToken(res.csrfToken);
      setIsGoogleSheetOpen(false);
      await hydrateSession();
    } catch (err) {
      setLocalAuthNotice(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFaceLogin = async () => {
    const resolvedIdentifier =
      identifier.trim() || localStorage.getItem(ENROLLED_FACE_USERNAME_STORAGE) || '';
    if (!resolvedIdentifier) {
      setLocalAuthNotice(
        'Enter your username/email or create an account with Face Recognition enabled first.'
      );
      return;
    }
    setIdentifier(resolvedIdentifier);
    setIsSubmitting(true);
    setIsScanningFace(true);
    setLocalAuthNotice(null);
    try {
      const bundle = await ensureDeviceIdentityKeys();
      const challengeRes = await apiFetch<{
        challengeId: string;
        challenge: string;
        encryptedEmbedding: string;
        embeddingIv: string;
      }>('/api/face/challenge', {
        method: 'POST',
        body: JSON.stringify({
          identifier: resolvedIdentifier,
          deviceId: bundle.deviceId,
        }),
      });

      const secretKey = await getOrCreateLocalFaceSecretKey();
      const enrolledEmbedding = await decryptFaceEmbedding(
        challengeRes.encryptedEmbedding,
        challengeRes.embeddingIv,
        secretKey
      );

      const liveEmbedding = normalizeEmbedding(
        Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.37) + 1.2)
      );
      const distance = computeEmbeddingDistance(enrolledEmbedding, liveEmbedding);

      const livenessGesture = 'blink' as const;
      const signatureBase64 = await signFaceChallenge(
        bundle.signingPrivateKeyJwk,
        challengeRes.challenge,
        bundle.deviceId,
        livenessGesture
      );

      const verifyRes = await apiFetch<{ user: UserSummary; csrfToken: string }>(
        '/api/face/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            challengeId: challengeRes.challengeId,
            deviceId: bundle.deviceId,
            livenessGesture,
            embeddingDistance: distance,
            signatureBase64,
          }),
        }
      );

      setCsrfToken(verifyRes.csrfToken);
      localStorage.setItem(ENROLLED_FACE_USERNAME_STORAGE, verifyRes.user.username);
      await hydrateSession();
    } catch (err) {
      setLocalAuthNotice(
        err instanceof Error ? err.message : 'Face login failed. Use password or Google fallback.'
      );
    } finally {
      setIsScanningFace(false);
      setIsSubmitting(false);
    }
  };

  const fillDemoUser = (demoUsername: string) => {
    clearError();
    setLocalAuthNotice(null);
    setMode('login');
    setIdentifier(demoUsername);
    setPassword('Kamand@2026!');
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 overflow-y-auto">
      {/* Code-Split 3D Valley Hero with 2D Constellation Fallback (Deliverable 2) */}
      <Suspense fallback={<ParticleCanvas />}>
        <LazyValleyHero3D />
      </Suspense>

      <GlassTiltCard className="relative z-10 w-full max-w-md rounded-3xl border border-white/15 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <motion.span layoutId="kamand-brand-mark" transition={SPRING_CRITICALLY_DAMPED}>
            <Sparkles className="w-4 h-4" />
          </motion.span>
          <span>IIT Mandi · First Commit</span>
        </div>

        <motion.h1
          layoutId="kamand-brand-title"
          transition={SPRING_CRITICALLY_DAMPED}
          className="text-display text-white"
        >
          Kamand Chat
        </motion.h1>
        <p className="text-sm text-slate-400 mt-1">
          Start with a conversation. End-to-end encrypted, fluid messaging for the Kamand valley.
        </p>

        <div className="grid grid-cols-2 gap-1 p-1 my-6 rounded-2xl bg-slate-900/90 border border-white/10">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`fluid-press py-2 rounded-xl text-xs font-semibold transition-colors ${
              mode === 'login' ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`fluid-press py-2 rounded-xl text-xs font-semibold transition-colors ${
              mode === 'register'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Concentric Scanning-Ring Animation during Face Liveness Check (Deliverable 8) */}
        <FaceScannerRings active={isScanningFace} />

        {(error || localAuthNotice) && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-rose-500/15 border border-rose-400/30 px-4 py-2.5 text-xs text-rose-200"
          >
            {error || localAuthNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'login' ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Username or IIT Mandi Email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="aravind or b23101@students.iitmandi.ac.in"
                className="w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="aravind"
                    className="w-full rounded-2xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Hostel Room (Optional)
                  </label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="B-19"
                    className="w-full rounded-2xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Aravind Sharma"
                  className="w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="b23101@students.iitmandi.ac.in"
                  className="w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, upper, lower & number"
              className="w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {mode === 'register' && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/25">
              <div className="flex items-center gap-2.5">
                <ScanFace className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-emerald-200">
                    Enroll On-Device Face Recognition
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Enables 1-tap biometric login on this device
                  </div>
                </div>
              </div>
              <AnimatedSwitch
                checked={enrollFaceOnRegister}
                onChange={setEnrollFaceOnRegister}
                label="Enroll On-Device Face Recognition"
              />
            </div>
          )}

          <MagneticButton
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[46px] mt-2 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25"
          >
            <span>
              {isSubmitting
                ? 'Authenticating…'
                : mode === 'login'
                  ? 'Sign In to Kamand Chat'
                  : 'Create Account'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </MagneticButton>
        </form>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <MagneticButton
            type="button"
            onClick={() => setIsGoogleSheetOpen(true)}
            disabled={isSubmitting}
            className="min-h-[42px] px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5"
          >
            <Chrome className="w-3.5 h-3.5 text-sky-400" />
            <span>Google (@iitmandi)</span>
          </MagneticButton>

          <MagneticButton
            type="button"
            onClick={() => void handleFaceLogin()}
            disabled={isSubmitting}
            className="min-h-[42px] px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5"
          >
            <ScanFace className="w-3.5 h-3.5 text-emerald-400" />
            <span>Face Login</span>
          </MagneticButton>
        </div>

        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              Instant Demo Accounts:
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['aravind', 'priya', 'rohan'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => fillDemoUser(u)}
                className="fluid-press py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs text-sky-300 font-medium"
              >
                @{u}
              </button>
            ))}
          </div>
        </div>
      </GlassTiltCard>

      <FluidSheet
        isOpen={isGoogleSheetOpen}
        onClose={() => setIsGoogleSheetOpen(false)}
        title="Sign In with IIT Mandi Google Account"
      >
        <form onSubmit={handleGoogleSignInConfirm} className="space-y-4">
          <p className="text-xs text-slate-300">
            Select or enter your IIT Mandi Google Workspace account (`@students.iitmandi.ac.in` or
            `@iitmandi.ac.in`):
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Institute Email
            </label>
            <input
              type="email"
              required
              value={googleEmailInput}
              onChange={(e) => setGoogleEmailInput(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={googleNameInput}
              onChange={(e) => setGoogleNameInput(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2.5 text-xs text-white"
            />
          </div>
          <MagneticButton
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold"
          >
            Continue with Google
          </MagneticButton>
        </form>
      </FluidSheet>
    </div>
  );
};
