import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Sparkles, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { SPRING_DEFAULT } from '../lib/physics.js';
export const AuthPage = () => {
    const { login, register, error, clearError } = useAuthStore();
    const [mode, setMode] = useState('login');
    const [identifier, setIdentifier] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const switchMode = (next) => {
        clearError();
        setMode(next);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (mode === 'login') {
                await login({ identifier, password });
            }
            else {
                await register({
                    username,
                    email,
                    displayName,
                    password,
                    roomCode: roomCode || undefined,
                });
            }
        }
        catch {
            // Handled in store error state
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const fillDemoUser = (demoUsername) => {
        clearError();
        setMode('login');
        setIdentifier(demoUsername);
        setPassword('Kamand@2026!');
    };
    return (_jsx("div", { className: "min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 overflow-y-auto", children: _jsxs(motion.div, { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: SPRING_DEFAULT, className: "w-full max-w-md rounded-3xl glass-chrome glass-top-highlight border border-white/15 p-6 sm:p-8 shadow-2xl", children: [_jsxs("div", { className: "flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2", children: [_jsx(Sparkles, { className: "w-4 h-4" }), _jsx("span", { children: "IIT Mandi \u00B7 First Commit" })] }), _jsx("h1", { className: "text-display text-white", children: "Kamand Chat" }), _jsx("p", { className: "text-sm text-slate-400 mt-1", children: "Start with a conversation. Fluid, real-time messaging built for the Kamand valley." }), _jsxs("div", { className: "grid grid-cols-2 gap-1 p-1 my-6 rounded-2xl bg-slate-900/90 border border-white/10", children: [_jsx("button", { type: "button", onClick: () => switchMode('login'), className: `fluid-press py-2 rounded-xl text-xs font-semibold transition-colors ${mode === 'login' ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`, children: "Sign In" }), _jsx("button", { type: "button", onClick: () => switchMode('register'), className: `fluid-press py-2 rounded-xl text-xs font-semibold transition-colors ${mode === 'register'
                                ? 'bg-sky-500 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'}`, children: "Create Account" })] }), error && (_jsx("div", { role: "alert", className: "mb-4 rounded-2xl bg-rose-500/15 border border-rose-400/30 px-4 py-2.5 text-xs text-rose-200", children: error })), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-3.5", children: [mode === 'login' ? (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-slate-300 mb-1", children: "Username or IIT Mandi Email" }), _jsx("input", { type: "text", required: true, value: identifier, onChange: (e) => setIdentifier(e.target.value), placeholder: "aravind or b23101@students.iitmandi.ac.in", className: "w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-slate-300 mb-1", children: "Username" }), _jsx("input", { type: "text", required: true, value: username, onChange: (e) => setUsername(e.target.value), placeholder: "aravind", className: "w-full rounded-2xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-slate-300 mb-1", children: "Hostel Room (Optional)" }), _jsx("input", { type: "text", value: roomCode, onChange: (e) => setRoomCode(e.target.value), placeholder: "B-19", className: "w-full rounded-2xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-slate-300 mb-1", children: "Display Name" }), _jsx("input", { type: "text", required: true, value: displayName, onChange: (e) => setDisplayName(e.target.value), placeholder: "Aravind Sharma", className: "w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-slate-300 mb-1", children: "Email" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), placeholder: "b23101@students.iitmandi.ac.in", className: "w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] })] })), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-slate-300 mb-1", children: "Password" }), _jsx("input", { type: "password", required: true, value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Min 8 chars, upper, lower & number", className: "w-full rounded-2xl bg-slate-900/90 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500" })] }), _jsxs("button", { type: "submit", disabled: isSubmitting, className: "fluid-press w-full min-h-[46px] mt-2 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25", children: [_jsx("span", { children: isSubmitting
                                        ? 'Authenticating…'
                                        : mode === 'login'
                                            ? 'Sign In to Kamand Chat'
                                            : 'Create Account' }), _jsx(ArrowRight, { className: "w-4 h-4" })] })] }), _jsxs("div", { className: "mt-6 pt-5 border-t border-white/10", children: [_jsx("div", { className: "flex items-center justify-between text-xs text-slate-400 mb-2", children: _jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Shield, { className: "w-3.5 h-3.5 text-sky-400" }), "Instant Demo Accounts:"] }) }), _jsx("div", { className: "grid grid-cols-3 gap-2", children: ['aravind', 'priya', 'rohan'].map((u) => (_jsxs("button", { type: "button", onClick: () => fillDemoUser(u), className: "fluid-press py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs text-sky-300 font-medium", children: ["@", u] }, u))) })] })] }) }));
};
