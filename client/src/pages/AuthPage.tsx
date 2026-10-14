import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Sparkles, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { SPRING_DEFAULT } from '../lib/physics.js';

export const AuthPage: React.FC = () => {
  const { login, register, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: 'login' | 'register') => {
    clearError();
    setMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
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
      }
    } catch {
      // Handled in store error state
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoUser = (demoUsername: string) => {
    clearError();
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
          Start with a conversation. Fluid, real-time messaging built for the Kamand valley.
        </p>

        {/* Mode Segmented Control */}
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

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-rose-500/15 border border-rose-400/30 px-4 py-2.5 text-xs text-rose-200"
          >
            {error}
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
                  : 'Create Account'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Switcher for Judges */}
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
      </motion.div>
    </div>
  );
};
