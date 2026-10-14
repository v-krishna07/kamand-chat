import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { ArrowLeft, Send, Reply, ShieldCheck, WifiOff } from 'lucide-react';
import { useChatStore } from '../store/useChatStore.js';
import { MessageBubble } from './MessageBubble.js';
export const ChatView = ({ conversation, currentUser, onBackMobile, }) => {
    const { messagesByConv, paginationByConv, draftsByConv, replyTargetByConv, connectionState, sendMessage, retryMessage, loadOlderMessages, setDraft, setReplyTarget, } = useChatStore();
    const messages = messagesByConv[conversation.id] ?? [];
    const pagination = paginationByConv[conversation.id];
    const draft = draftsByConv[conversation.id] ?? '';
    const replyTarget = replyTargetByConv[conversation.id] ?? null;
    const scrollContainerRef = useRef(null);
    const textareaRef = useRef(null);
    const peer = conversation.participants.find((p) => p.id !== currentUser.id) ??
        conversation.participants[0];
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [conversation.id, messages.length]);
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!draft.trim())
            return;
        void sendMessage(conversation.id, draft, currentUser);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };
    const handleTextareaChange = (e) => {
        setDraft(conversation.id, e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`;
    };
    return (_jsxs("div", { className: "relative flex flex-col h-full w-full bg-slate-950", children: [_jsxs("header", { className: "sticky top-0 z-20 flex items-center justify-between px-4 py-3 glass-chrome glass-top-highlight border-b border-white/10", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("button", { type: "button", onClick: onBackMobile, className: "fluid-press md:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-full text-slate-300 hover:text-white hover:bg-white/10", "aria-label": "Back to conversations", children: _jsx(ArrowLeft, { className: "w-5 h-5" }) }), _jsxs("div", { className: "relative flex-shrink-0", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center font-semibold text-white", children: peer.displayName.slice(0, 1).toUpperCase() }), peer.isOnline && (_jsx("span", { className: "absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950", title: "Online" }))] }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h2", { className: "text-heading text-base text-slate-100 truncate", children: peer.displayName }), peer.roomCode && (_jsx("span", { className: "px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30", children: peer.roomCode }))] }), _jsxs("p", { className: "text-caption text-slate-400 truncate", children: ["@", peer.username, " \u00B7 ", peer.isOnline ? 'Online now' : 'IIT Mandi'] })] })] }), _jsx("div", { className: "flex items-center gap-2", children: connectionState !== 'connected' && (_jsxs("span", { className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs", children: [_jsx(WifiOff, { className: "w-3.5 h-3.5" }), connectionState === 'connecting' ? 'Syncing…' : 'Offline · Queued'] })) })] }), _jsxs("div", { ref: scrollContainerRef, className: "flex-1 overflow-y-auto px-4 py-4 scroll-edge-mask", role: "log", "aria-live": "polite", "aria-label": `Conversation with ${peer.displayName}`, children: [pagination?.hasMore && (_jsx("div", { className: "flex justify-center my-2", children: _jsx("button", { type: "button", disabled: pagination.isLoadingOlder, onClick: () => void loadOlderMessages(conversation.id), className: "fluid-press px-3.5 py-1.5 rounded-full bg-slate-900 border border-white/10 text-xs text-slate-300 hover:text-white", children: pagination.isLoadingOlder ? 'Loading history…' : 'Load earlier messages' }) })), _jsxs("div", { className: "mx-auto max-w-md my-3 px-3.5 py-2 rounded-2xl bg-slate-900/70 border border-white/5 text-center text-caption text-slate-400 flex items-center justify-center gap-1.5", children: [_jsx(ShieldCheck, { className: "w-3.5 h-3.5 text-sky-400 flex-shrink-0" }), _jsx("span", { children: "Messages are synced with verified sequence numbers & session protection." })] }), messages.length === 0 ? (_jsxs("div", { className: "h-48 flex flex-col items-center justify-center text-center text-slate-400", children: [_jsxs("p", { className: "text-sm font-medium text-slate-300", children: ["Start your conversation with ", peer.displayName] }), _jsx("p", { className: "text-xs text-slate-500 mt-1", children: "Say hello or share a room code like B-19." })] })) : (messages.map((msg, idx) => {
                        const prev = messages[idx - 1];
                        const next = messages[idx + 1];
                        const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
                        const isLastInGroup = !next || next.senderId !== msg.senderId;
                        return (_jsx(MessageBubble, { message: msg, isOwn: msg.senderId === currentUser.id, isFirstInGroup: isFirstInGroup, isLastInGroup: isLastInGroup, onReply: (target) => {
                                setReplyTarget(conversation.id, target);
                                textareaRef.current?.focus();
                            }, onRetry: (messageId) => void retryMessage(conversation.id, messageId, currentUser) }, msg.id));
                    }))] }), _jsxs("div", { className: "sticky bottom-0 z-20 px-4 py-3 glass-chrome glass-top-highlight border-t border-white/10", children: [replyTarget && (_jsxs("div", { className: "mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 border-l-2 border-sky-400 text-xs", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("span", { className: "font-semibold text-sky-400 flex items-center gap-1", children: [_jsx(Reply, { className: "w-3 h-3" }), "Replying to ", replyTarget.sender.displayName] }), _jsx("p", { className: "text-slate-300 truncate", children: replyTarget.body })] }), _jsx("button", { type: "button", onClick: () => setReplyTarget(conversation.id, null), className: "fluid-press p-1 text-slate-400 hover:text-white", "aria-label": "Cancel reply", children: "\u2715" })] })), _jsxs("form", { onSubmit: handleSubmit, className: "flex items-end gap-2", children: [_jsx("textarea", { ref: textareaRef, rows: 1, value: draft, onChange: handleTextareaChange, onKeyDown: handleKeyDown, placeholder: `Message ${peer.displayName}…`, "aria-label": `Message ${peer.displayName}`, className: "flex-1 max-h-32 resize-none rounded-2xl bg-slate-900/90 border border-white/10 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors" }), _jsx("button", { type: "submit", disabled: !draft.trim(), "aria-label": "Send message", className: "fluid-press min-h-[44px] min-w-[44px] rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white flex items-center justify-center shadow-lg shadow-sky-500/20", children: _jsx(Send, { className: "w-4 h-4" }) })] })] })] }));
};
