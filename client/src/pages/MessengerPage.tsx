import React, { useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useChatStore } from '../store/useChatStore.js';
import { Sidebar } from '../components/Sidebar.js';
import { ChatView } from '../components/ChatView.js';

interface MessengerPageProps {
  currentUser: UserSummary;
  onLogout: () => void;
}

export const MessengerPage: React.FC<MessengerPageProps> = ({ currentUser, onLogout }) => {
  const {
    conversations,
    activeConversationId,
    initRealtime,
    loadConversations,
    selectConversation,
  } = useChatStore();

  useEffect(() => {
    void loadConversations();
    const cleanup = initRealtime(currentUser);
    return cleanup;
  }, [currentUser, initRealtime, loadConversations]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">
      {/* Left Pane: Conversation List (Hidden on mobile when a chat is open) */}
      <div
        className={`${
          activeConversation ? 'hidden md:flex' : 'flex'
        } h-full w-full md:w-auto flex-shrink-0`}
      >
        <Sidebar currentUser={currentUser} onLogout={onLogout} />
      </div>

      {/* Center Pane: Active Conversation or Empty State */}
      <main
        className={`${
          activeConversation ? 'flex' : 'hidden md:flex'
        } flex-1 h-full min-w-0 bg-slate-950`}
      >
        {activeConversation ? (
          <ChatView
            conversation={activeConversation}
            currentUser={currentUser}
            onBackMobile={() => void selectConversation(null, currentUser.id)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
            <div className="w-16 h-16 rounded-3xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 mb-4">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h2 className="text-heading text-xl text-slate-100">
              Select a conversation or start a new chat
            </h2>
            <p className="text-sm text-slate-400 max-w-sm mt-1">
              Real-time 1:1 messaging with sequence-verified ordering, swipe-to-reply physics, and
              offline catch-up.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
