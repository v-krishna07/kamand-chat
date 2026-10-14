import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useChatStore } from '../store/useChatStore.js';
import { Sidebar, type PrimarySection } from '../components/Sidebar.js';
import { ChatView } from '../components/ChatView.js';
import { CommunityWorkspace } from '../components/CommunityWorkspace.js';
import { CallOverlay } from '../components/CallOverlay.js';
import { CampusHub } from '../components/CampusHub.js';

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
      <CallOverlay />

      <div
        className={`${
          (activeConversation && activeSection === 'chats') ||
          activeSection === 'communities' ||
          activeSection === 'campus'
            ? 'hidden md:flex'
            : 'flex'
        } h-full w-full md:w-auto flex-shrink-0`}
      >
        <Sidebar
          currentUser={currentUser}
          activeSection={activeSection}
          onChangeSection={setActiveSection}
          onLogout={onLogout}
        />
      </div>

      <main
        className={`${
          activeSection === 'communities' ||
          activeSection === 'campus' ||
          activeConversation
            ? 'flex'
            : 'hidden md:flex'
        } flex-1 h-full min-w-0 bg-slate-950`}
      >
        {activeSection === 'communities' ? (
          <CommunityWorkspace currentUser={currentUser} />
        ) : activeSection === 'campus' ? (
          <CampusHub />
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
              Select a conversation, open Groups, or explore Campus
            </h2>
            <p className="text-sm text-slate-400 max-w-sm mt-1">
              Real-time E2EE messaging, voice/video calls, structured IIT Mandi channels, and
              degrade-gracefully campus connectors.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
