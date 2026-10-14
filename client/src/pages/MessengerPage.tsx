import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useChatStore } from '../store/useChatStore.js';
import { Sidebar, type PrimarySection } from '../components/Sidebar.js';
import { ChatView } from '../components/ChatView.js';
import { CommunityWorkspace } from '../components/CommunityWorkspace.js';

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

  const [activeSection, setActiveSection] = useState<PrimarySection>('chats');

  useEffect(() => {
    void loadConversations();
    const cleanup = initRealtime(currentUser);
    return cleanup;
  }, [currentUser, initRealtime, loadConversations]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">
      {/* Left Pane: Navigation & Direct Chats / Contacts / Status */}
      <div
        className={`${
          activeConversation && activeSection === 'chats' ? 'hidden md:flex' : 'flex'
        } h-full w-full md:w-auto flex-shrink-0`}
      >
        <Sidebar
          currentUser={currentUser}
          activeSection={activeSection}
          onChangeSection={setActiveSection}
          onLogout={onLogout}
        />
      </div>

      {/* Main Content Area: Either Structured Community Workspace or 1:1 ChatView */}
      <main
        className={`${
          activeSection === 'communities' || activeConversation ? 'flex' : 'hidden md:flex'
        } flex-1 h-full min-w-0 bg-slate-950`}
      >
        {activeSection === 'communities' ? (
          <CommunityWorkspace currentUser={currentUser} />
        ) : activeConversation ? (
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
              Select a conversation or open Groups
            </h2>
            <p className="text-sm text-slate-400 max-w-sm mt-1">
              Real-time 1:1 messaging and structured IIT Mandi community channels with threaded
              replies.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
