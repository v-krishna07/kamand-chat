import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore.js';
import { useChatStore } from './store/useChatStore.js';
import { AuthPage } from './pages/AuthPage.js';
import { MessengerPage } from './pages/MessengerPage.js';
export const App = () => {
    const { user, isLoading, hydrateSession, logout } = useAuthStore();
    const resetChat = useChatStore((s) => s.reset);
    useEffect(() => {
        void hydrateSession();
    }, [hydrateSession]);
    if (isLoading) {
        return (_jsx("div", { className: "min-h-screen w-full bg-slate-950 flex items-center justify-center text-slate-400 text-sm", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" }), _jsx("span", { children: "Restoring session\u2026" })] }) }));
    }
    if (!user) {
        return _jsx(AuthPage, {});
    }
    return (_jsx(MessengerPage, { currentUser: user, onLogout: async () => {
            resetChat();
            await logout();
        } }));
};
