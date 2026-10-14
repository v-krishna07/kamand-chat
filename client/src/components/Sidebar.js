import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { MessageSquarePlus, Search, LogOut, Radio } from 'lucide-react';
import { useChatStore } from '../store/useChatStore.js';
import { apiFetch } from '../lib/api.js';
import { FluidSheet } from './FluidSheet.js';
export const Sidebar = ({ currentUser, onLogout }) => {
    const { conversations, activeConversationId, connectionState, selectConversation, startDirectConversation, } = useChatStore();
    const [filterQuery, setFilterQuery] = useState('');
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    useEffect(() => {
        if (!isNewChatOpen)
            return;
        let cancelled = false;
        setIsSearching(true);
        apiFetch(`/api/users/search?q=${encodeURIComponent(userSearchQuery)}`)
            .then((res) => {
            if (!cancelled) {
                setSearchResults(res.users);
                setIsSearching(false);
            }
        })
            .catch(() => {
            if (!cancelled)
                setIsSearching(false);
        });
        return () => {
            cancelled = true;
        };
    }, [isNewChatOpen, userSearchQuery]);
    const filteredConversations = conversations.filter((conv) => {
        if (!filterQuery.trim())
            return true;
        const q = filterQuery.toLowerCase();
        const peer = conv.participants.find((p) => p.id !== currentUser.id);
        return (peer?.displayName.toLowerCase().includes(q) ||
            peer?.username.toLowerCase().includes(q) ||
            conv.lastMessage?.body.toLowerCase().includes(q));
    });
    return (_jsxs("aside", { className: "flex flex-col h-full w-full md:w-80 lg:w-96 border-r border-white/10 bg-slate-950 select-none", children: [_jsxs("div", { className: "px-4 pt-4 pb-3 glass-chrome border-b border-white/10", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-2.5 h-2.5 rounded-full bg-sky-400" }), _jsx("h1", { className: "text-heading text-lg text-white tracking-tight", children: "Kamand Chat" })] }), _jsxs("button", { type: "button", onClick: () => setIsNewChatOpen(true), className: "fluid-press min-h-[44px] px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-medium flex items-center gap-1.5", "aria-label": "Start new conversation", children: [_jsx(MessageSquarePlus, { className: "w-4 h-4" }), _jsx("span", { children: "New Chat" })] })] }), _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" }), _jsx("input", { type: "search", value: filterQuery, onChange: (e) => setFilterQuery(e.target.value), placeholder: "Filter conversations\u2026", "aria-label": "Filter conversations", className: "w-full rounded-xl bg-slate-900/90 border border-white/10 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto divide-y divide-white/5", role: "navigation", "aria-label": "Conversations", children: filteredConversations.length === 0 ? (_jsxs("div", { className: "p-8 text-center", children: [_jsx("p", { className: "text-sm text-slate-300 font-medium", children: "No conversations yet" }), _jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Tap \u201CNew Chat\u201D to connect with anyone on IIT Mandi campus." })] })) : (filteredConversations.map((conv) => {
                    const peer = conv.participants.find((p) => p.id !== currentUser.id) ?? conv.participants[0];
                    const isSelected = conv.id === activeConversationId;
                    return (_jsxs("button", { type: "button", onClick: () => void selectConversation(conv.id, currentUser.id), className: `fluid-press w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors ${isSelected ? 'bg-sky-500/15' : 'hover:bg-white/5'}`, children: [_jsxs("div", { className: "relative flex-shrink-0", children: [_jsx("div", { className: "w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-semibold", children: peer.displayName.slice(0, 1).toUpperCase() }), peer.isOnline && (_jsx("span", { className: "absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950" }))] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-semibold text-sm text-slate-100 truncate", children: peer.displayName }), conv.lastMessage && (_jsx("span", { className: "text-[11px] text-slate-400 flex-shrink-0", children: new Date(conv.lastMessage.createdAt).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }) }))] }), _jsxs("div", { className: "flex items-center justify-between gap-2 mt-0.5", children: [_jsx("p", { className: "text-xs text-slate-400 truncate", children: conv.lastMessage
                                                    ? conv.lastMessage.body
                                                    : `Start chatting with @${peer.username}` }), conv.unreadCount > 0 && (_jsx("span", { className: "px-2 py-0.5 rounded-full bg-sky-500 text-white text-[11px] font-semibold", children: conv.unreadCount }))] })] })] }, conv.id));
                })) }), _jsxs("div", { className: "p-3 glass-chrome glass-top-highlight border-t border-white/10 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2.5 min-w-0", children: [_jsx("div", { className: "w-9 h-9 rounded-full bg-slate-800 border border-white/15 flex items-center justify-center font-semibold text-sm text-sky-300", children: currentUser.displayName.slice(0, 1).toUpperCase() }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-xs font-semibold text-slate-100 truncate", children: currentUser.displayName }), currentUser.roomCode && (_jsx("span", { className: "text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300", children: currentUser.roomCode }))] }), _jsxs("div", { className: "flex items-center gap-1 text-[11px] text-slate-400", children: [_jsx(Radio, { className: `w-3 h-3 ${connectionState === 'connected' ? 'text-emerald-400' : 'text-amber-400'}` }), _jsxs("span", { children: ["@", currentUser.username] })] })] })] }), _jsx("button", { type: "button", onClick: onLogout, className: "fluid-press min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10", "aria-label": "Sign out", title: "Sign out", children: _jsx(LogOut, { className: "w-4 h-4" }) })] }), _jsx(FluidSheet, { isOpen: isNewChatOpen, onClose: () => setIsNewChatOpen(false), title: "New 1:1 Conversation", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" }), _jsx("input", { type: "search", value: userSearchQuery, onChange: (e) => setUserSearchQuery(e.target.value), placeholder: "Search by name, @username, or IIT Mandi email\u2026", "aria-label": "Search campus users", autoFocus: true, className: "w-full rounded-2xl bg-slate-900 border border-white/15 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] }), _jsx("div", { className: "space-y-1.5 max-h-72 overflow-y-auto", children: isSearching ? (_jsx("p", { className: "text-xs text-slate-400 py-4 text-center", children: "Searching directory\u2026" })) : searchResults.length === 0 ? (_jsx("p", { className: "text-xs text-slate-400 py-4 text-center", children: "No matching users found." })) : (searchResults.map((u) => (_jsxs("button", { type: "button", onClick: async () => {
                                    await startDirectConversation(u.id, currentUser.id);
                                    setIsNewChatOpen(false);
                                }, className: "fluid-press w-full p-3 rounded-2xl bg-slate-900/70 hover:bg-slate-800/90 border border-white/10 flex items-center justify-between text-left", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400/30 flex items-center justify-center font-semibold text-sky-300", children: u.displayName.slice(0, 1).toUpperCase() }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-sm font-medium text-white truncate", children: u.displayName }), _jsxs("div", { className: "text-xs text-slate-400 truncate", children: ["@", u.username, " ", u.roomCode ? `· Hostel ${u.roomCode}` : ''] })] })] }), _jsx("span", { className: "text-xs font-medium text-sky-400 px-2.5 py-1 rounded-lg bg-sky-500/10", children: "Message" })] }, u.id)))) })] }) })] }));
};
