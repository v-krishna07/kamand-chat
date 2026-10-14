import React, { useEffect } from 'react';
import { LayoutGroup } from 'motion/react';
import { useAuthStore } from './store/useAuthStore.js';
import { useChatStore } from './store/useChatStore.js';
import { AuthPage } from './pages/AuthPage.js';
import { MessengerPage } from './pages/MessengerPage.js';
import { MotionProvider } from './motion/MotionProvider.js';
import { BootScreen } from './motion/BootScreen.js';

export const App: React.FC = () => {
  const { user, isLoading, hydrateSession, logout } = useAuthStore();
  const resetChat = useChatStore((s) => s.reset);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  return (
    <MotionProvider>
      <LayoutGroup>
        {isLoading ? (
          <BootScreen subtitle="Restoring encrypted Kamand session…" />
        ) : !user ? (
          <AuthPage />
        ) : (
          <MessengerPage
            currentUser={user}
            onLogout={async () => {
              resetChat();
              await logout();
            }}
          />
        )}
      </LayoutGroup>
    </MotionProvider>
  );
};
