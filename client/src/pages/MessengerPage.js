import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useChatStore } from '../store/useChatStore.js';
import { Sidebar } from '../components/Sidebar.js';
import { ChatView } from '../components/ChatView.js';
export const MessengerPage = ({ currentUser, onLogout }) => {
    const { conversations, activeConversationId, initRealtime, loadConversations, selectConversation, } = useChatStore();
    useEffect(() => {
        void loadConversations();
        const cleanup = initRealtime(currentUser);
        return cleanup;
    }, [currentUser, initRealtime, loadConversations]);
    const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;
    return (_jsxs("div", { className: "flex h-screen w-screen overflow-hidden bg-slate-950", children: [_jsx("div", { className: `${activeConversation ? 'hidden md:flex' : 'flex'} h-full w-full md:w-auto flex-shrink-0`, children: _jsx(Sidebar, { currentUser: currentUser, onLogout: onLogout }) }), _jsx("main", { className: `${activeConversation ? 'flex' : 'hidden md:flex'} flex-1 h-full min-w-0 bg-slate-950`, children: activeConversation ? (_jsx(ChatView, { conversation: activeConversation, currentUser: currentUser, onBackMobile: () => void selectConversation(null, currentUser.id) })) : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center p-8 text-center select-none", children: [_jsx("div", { className: "w-16 h-16 rounded-3xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center text-sky-400 mb-4", children: _jsx(MessageSquare, { className: "w-8 h-8" }) }), _jsx("h2", { className: "text-heading text-xl text-slate-100", children: "Select a conversation or start a new chat" }), _jsx("p", { className: "text-sm text-slate-400 max-w-sm mt-1", children: "Real-time 1:1 messaging with sequence-verified ordering, swipe-to-reply physics, and offline catch-up." })] })) })] }));
};
