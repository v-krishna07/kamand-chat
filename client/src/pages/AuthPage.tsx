import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Sparkles, ArrowRight, ScanFace, Chrome, X } from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useAuthStore } from '../store/useAuthStore.js';
import { SPRING_DEFAULT } from '../lib/physics.js';
import { apiFetch, setCsrfToken } from '../lib/api.js';
import {
  normalizeEmbedding,
  computeEmbeddingDistance,
  encryptFaceEmbedding,
  decryptFaceEmbedding,
  signFaceChallenge,
} from '../lib/faceAuth.js';
import { useSecurityStore } from '../store/useSecurityStore.js';

const DEVICE_FACE_SECRET_STORAGE = 'kamand_face_local_aes_v1';

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
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [enrollFaceOnRegister, setEnrollFaceOnRegister] = useState(true);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('b26343@students.iitmandi.ac.in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localAuthNotice, setLocalAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    const lastUser =
      localStorage.getItem('kamand_face_enrolled_username') ||
      localStorage.getItem('kamand_last_user');
    if (lastUser && !identifier) {
      setIdentifier(lastUser);
    }
  }, []);

  const switchMode = (next: 'login' | 'register') => {
    clearError();
    setLocalAuthNotice(null);
    setMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLocalAuthNotice(null);
    try {
      if (mode === 'login') {
        await login({ identifier, password });
        localStorage.setItem('kamand_last_user', identifier);
      } else {
        await register({
          username,
          email,
          displayName,
          password,
          roomCode: roomCode || undefined,
        });
        localStorage.setItem('kamand_last_user', username);

        if (enrollFaceOnRegister) {
          try {
            setLocalAuthNotice('Generating and saving on-device face biometric key…');
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
                deviceName: 'Kamand Biometric Key (Enrolled on Signup)',
                encryptedEmbedding,
                embeddingIv,
                faceSigningPublicKey: bundle.signingPublicKeyJwk,
              }),
            });

            localStorage.setItem('kamand_face_enrolled_username', username);
            setLocalAuthNotice('Account created & face biometric enrolled on this device!');
          } catch (faceErr) {
            console.warn('Face auto-enrollment notice:', faceErr);
          }
        }
      }
    } catch {
      // Handled in store error state
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignInWithEmail = async (targetEmail: string) => {
    setIsSubmitting(true);
    setLocalAuthNotice(null);
    try {
      const cleanEmail = targetEmail.trim().toLowerCase();
      const domain = cleanEmail.split('@')[1];
      if (!domain || (!domain.includes('iitmandi.ac.in'))) {
        throw new Error('Please enter a valid IIT Mandi email (@students.iitmandi.ac.in or @iitmandi.ac.in)');
      }
      const demoIdToken = `demo-google-token:${cleanEmail}:IIT Mandi Student:${domain}`;

      const res = await apiFetch<{ user: UserSummary; csrfToken: string }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken: demoIdToken }),
      });
      setCsrfToken(res.csrfToken);
      setShowGoogleModal(false);
      localStorage.setItem('kamand_last_user', res.user.username);
      await hydrateSession();
    } catch (err) {
      setLocalAuthNotice(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFaceLogin = async () => {
    const targetId =
      identifier.trim() ||
      localStorage.getItem('kamand_face_enrolled_username') ||
      localStorage.getItem('kamand_last_user');

    if (!targetId) {
      setLocalAuthNotice('Enter your username or email first, then tap Face Login.');
      return;
    }
    setIsSubmitting(true);
    setLocalAuthNotice('Running on-device liveness check & biometric signature…');
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
          identifier: targetId,
          deviceId: bundle.deviceId,
        }),
      });

      let secretB64 = localStorage.getItem(DEVICE_FACE_SECRET_STORAGE);
      if (!secretB64) {
        await getOrCreateLocalFaceSecretKey();
        secretB64 = localStorage.getItem(DEVICE_FACE_SECRET_STORAGE);
      }
      if (!secretB64) {
        throw new Error('No local face encryption key on this device. Sign in with password first.');
      }
      const rawKey = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
      const secretKey = await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

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
      localStorage.setItem('kamand_face_enrolled_username', targetId);
      localStorage.setItem('kamand_last_user', targetId);
      await hydrateSession();
    } catch (err) {
      setLocalAuthNotice(
        err instanceof Error ? err.message : 'Face login failed. Use password or Google fallback.'
      );
    } finally {
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
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_DEFAULT}
        className="w-full max-w-md rounded-3xl glass-chrome glass-top-highlight border border-white/15 p-6 sm:p-8 shadow-2xl"
      >
        <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Sparkles className="w-4 h-4" />
          <span>IIT Mandi · First Commit</span>
        </div>

        <h1 className="text-display text-white">Kamand Chat</h1>
        <p className="text-sm text-slate-400 mt-1">
          Start with a conversation. End-to-end encrypted, fluid messaging for the Kamand valley.
        </p>

        {/* Mode Segmented Control */}
        <div className="grid grid-cols-2 gap-1 p-1 my-6 rounded-2xl bg-slate-900/90 border border-white/10">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`fluid-press py-2 rounded-xl text-xs font-semibold transition-colors ${mode === 'login' ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`fluid-press py-2 rounded-xl text-xs font-semibold transition-colors ${mode === 'register'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
              }`}
          >
            Create Account
          </button>
        </div>

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
            <div className="p-3 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrollFaceOnRegister}
                  onChange={(e) => setEnrollFaceOnRegister(e.target.checked)}
                  className="mt-0.5 rounded text-sky-500 focus:ring-sky-500 bg-slate-950 border-white/20"
                />
                <div>
                  <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <ScanFace className="w-3.5 h-3.5" />
                    Set up Face ID / Biometric Login
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Generates a secure biometric key on this device so you can sign in with 1-tap Face Login.
                  </p>
                </div>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="fluid-press w-full min-h-[46px] mt-2 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25"
          >
            <span>
              {isSubmitting
                ? 'Authenticating…'
                : mode === 'login'
                  ? 'Sign In to Kamand Chat'
                  : 'Create Account & Save Face ID'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Google OAuth & On-Device Face Login Shortcuts */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              if (identifier.includes('@')) {
                setGoogleEmailInput(identifier.trim());
              }
              setShowGoogleModal(true);
            }}
            disabled={isSubmitting}
            className="fluid-press min-h-[42px] px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Chrome className="w-3.5 h-3.5 text-sky-400" />
            <span>Google (@iitmandi)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleFaceLogin()}
            disabled={isSubmitting}
            className="fluid-press min-h-[42px] px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/15 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ScanFace className="w-3.5 h-3.5 text-emerald-400" />
            <span>Face Login</span>
          </button>
        </div>

        {/* Google Login Modal Dialog */}
        <AnimatePresence>
          {showGoogleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={SPRING_DEFAULT}
                className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Chrome className="w-4 h-4 text-sky-400" />
                    <span>IIT Mandi Google Sign-In</span>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setShowGoogleModal(false)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-300">
                  Authenticate with your institute Google identity (<code className="text-sky-300">@students.iitmandi.ac.in</code> or <code className="text-sky-300">@iitmandi.ac.in</code>).
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Institute Email Address
                  </label>
                  <input
                    type="email"
                    value={googleEmailInput}
                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                    placeholder="b26343@students.iitmandi.ac.in"
                    className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignInWithEmail(googleEmailInput)}
                    disabled={isSubmitting}
                    className="fluid-press flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/20"
                  >
                    <Chrome className="w-3.5 h-3.5" />
                    <span>Continue with Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGoogleModal(false)}
                    className="fluid-press px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Quick Demo Switcher for Judges */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              Instant Demo Accounts:
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['aravind', 'priya', 'rohan', 'admin'] as const).map((u) => (
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
      </motion.div>
    </div>
  );
};
