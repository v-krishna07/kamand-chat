import React, { useState, useEffect } from 'react';
import { Sparkles, Send, Square, Sliders } from 'lucide-react';
import { useAiStore } from '../store/useAiStore.js';

/**
 * Private "Ask AI" Chat & Local Encrypted User Preferences Panel (§11).
 */
export const AskAiPanel: React.FC = () => {
  const {
    preferences,
    provider,
    remainingBudget,
    isStreaming,
    privateHistory,
    loadBudget,
    updatePreferences,
    sendPrivateAskAi,
    cancelActiveStream,
  } = useAiStore();

  const [question, setQuestion] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    void loadBudget();
  }, [loadBudget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isStreaming) return;
    const q = question;
    setQuestion('');
    await sendPrivateAskAi(q);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 glass-chrome border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Private Ask AI</span>
          </div>
          <p className="text-[10px] text-slate-400">
            {provider} · {remainingBudget} tokens remaining
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPrefs((v) => !v)}
          className="fluid-press p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white"
          aria-label="AI Preferences"
          title="AI Preferences"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Collapsible Local AI Preferences */}
      {showPrefs && (
        <div className="p-3 bg-slate-900/90 border-b border-white/10 space-y-2.5 text-xs">
          <div className="font-semibold text-slate-200">Local AI Preferences</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Default Tone</label>
              <select
                value={preferences.defaultTone}
                onChange={(e) =>
                  updatePreferences({
                    defaultTone: e.target.value as typeof preferences.defaultTone,
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-2.5 py-1.5 text-white"
              >
                <option value="concise">Concise</option>
                <option value="friendly">Friendly</option>
                <option value="academic">Academic</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Language</label>
              <input
                type="text"
                value={preferences.preferredLanguage}
                onChange={(e) => updatePreferences({ preferredLanguage: e.target.value })}
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-2.5 py-1.5 text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conversation History */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {privateHistory.map((turn) => (
          <div
            key={turn.id}
            className={`p-3 rounded-2xl text-xs leading-relaxed ${
              turn.role === 'user'
                ? 'bg-sky-600 text-white ml-6'
                : 'bg-slate-900 border border-white/10 text-slate-200 mr-4'
            }`}
          >
            <div className="font-semibold text-[10px] opacity-75 mb-1">
              {turn.role === 'user' ? 'You' : 'Kamand AI'}
            </div>
            <div className="whitespace-pre-wrap">{turn.text}</div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 glass-chrome border-t border-white/10 flex items-center gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Kamand AI anything…"
          aria-label="Ask Kamand AI"
          className="flex-1 rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={cancelActiveStream}
            className="fluid-press p-2 rounded-xl bg-rose-500 text-white"
            aria-label="Cancel AI stream"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!question.trim()}
            className="fluid-press p-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white"
            aria-label="Send to Ask AI"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
};
