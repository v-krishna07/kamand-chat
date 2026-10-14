import React, { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore.js';
import { useChatStore } from './store/useChatStore.js';
import { AuthPage } from './pages/AuthPage.js';
import { MessengerPage } from './pages/MessengerPage.js';

export const App: React.FC = () => {
  const { user, isLoading, hydrateSession, logout } = useAuthStore();
  const resetChat = useChatStore((s) => s.reset);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
          <span>Restoring session…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <MessengerPage
      currentUser={user}
      onLogout={async () => {
        resetChat();
        await logout();
      }}
    />
  );
};
