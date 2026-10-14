import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldAlert,
  FileText,
  MessageSquareReply,
  Languages,
  Wand2,
  CalendarCheck,
  Square,
  Send,
} from 'lucide-react';
import type { AiAction, MessageDTO } from '@kamand/shared';
import { useAiStore } from '../store/useAiStore.js';
import { FluidSheet } from './FluidSheet.js';

interface AiConsentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  conversationMessages: MessageDTO[];
  initialDraft: string;
  onApplyToDraft: (text: string) => void;
  onSendAiReplyToChat: (text: string) => void;
}

/**
 * Explicit Opt-In AI Consent & "What Will Be Shared" Preview Sheet (§11).
 * Because chats are E2EE, nothing is ever sent to the server AI endpoint until the user
 * inspects the exact messages in the preview box and clicks "Consent & Run AI".
 */
export const AiConsentSheet: React.FC<AiConsentSheetProps> = ({
  isOpen,
  onClose,
  conversationMessages,
  initialDraft,
  onApplyToDraft,
  onSendAiReplyToChat,
}) => {
  const {
    provider,
    remainingBudget,
    isRunning,
    isStreaming,
    streamedText,
    smartReplies,
    extractedTasks,
    aiError,
    loadBudget,
    runAssistWithConsent,
    streamAssistWithConsent,
    cancelActiveStream,
    clearAiOutput,
  } = useAiStore();

  const recentMessages = conversationMessages.slice(-8);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeAction, setActiveAction] = useState<AiAction>('summarize');
  const [customPrompt, setCustomPrompt] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('Hindi');
  const [rewriteTone, setRewriteTone] = useState<
    'concise' | 'friendly' | 'academic' | 'formal' | 'hinglish'
  >('concise');

  useEffect(() => {
    if (isOpen) {
      void loadBudget();
      clearAiOutput();
      setSelectedIds(recentMessages.map((m) => m.id));
      setCustomPrompt(initialDraft.replace(/^@ai\s*/i, ''));
    }
  }, [isOpen]);

  const toggleSelectMessage = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedContextPayload = recentMessages
    .filter((m) => selectedIds.includes(m.id))
    .map((m) => ({
      senderName: m.sender.displayName,
      body: m.body,
      createdAt: m.createdAt,
    }));

  const handleRunWithExplicitConsent = async () => {
    if (activeAction === 'reply' || activeAction === 'summarize') {
      await streamAssistWithConsent({
        action: activeAction,
        selectedMessages: selectedContextPayload,
        prompt: customPrompt,
      });
    } else {
      await runAssistWithConsent({
        action: activeAction,
        selectedMessages: selectedContextPayload,
        prompt: customPrompt,
        targetLanguage,
        rewriteTone,
      });
    }
  };

  return (
    <FluidSheet
      isOpen={isOpen}
      onClose={() => {
        if (isStreaming) cancelActiveStream();
        onClose();
      }}
      title="Kamand AI Assistant · Explicit Opt-In"
    >
      <div className="space-y-4">
        {/* Privacy & E2EE Consent Banner */}
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-start gap-2.5 text-xs text-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">What will be shared with AI</div>
            <p className="text-[11px] text-amber-200/80 mt-0.5">
              Because this chat is end-to-end encrypted, only the messages checked below will be
              shared for this single request. Uncheck any message to exclude it.
            </p>
          </div>
        </div>

        {/* Action Picker */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {[
            { id: 'summarize', label: 'Summarize', icon: FileText },
            { id: 'smart_replies', label: 'Smart Replies', icon: MessageSquareReply },
            { id: 'translate', label: 'Translate', icon: Languages },
            { id: 'rewrite', label: 'Rewrite', icon: Wand2 },
            { id: 'extract_tasks', label: 'Tasks/Dates', icon: CalendarCheck },
            { id: 'reply', label: '@ai Reply', icon: Sparkles },
          ].map((item) => {
            const Icon = item.icon;
            const selected = activeAction === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  clearAiOutput();
                  setActiveAction(item.id as AiAction);
                }}
                className={`fluid-press p-2 rounded-xl border text-[11px] font-semibold flex flex-col items-center gap-1 ${
                  selected
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action-Specific Controls */}
        {activeAction === 'translate' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Target Language:</span>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="rounded-xl bg-slate-900 border border-white/15 px-3 py-1.5 text-white"
            >
              <option value="Hindi">Hindi (हिन्दी)</option>
              <option value="English">English</option>
              <option value="Hinglish">Hinglish</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
            </select>
          </div>
        )}

        {activeAction === 'rewrite' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Tone:</span>
              {(['concise', 'friendly', 'academic', 'formal', 'hinglish'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRewriteTone(t)}
                  className={`px-2.5 py-1 rounded-lg capitalize border ${
                    rewriteTone === t
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-slate-900 border-white/10 text-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Enter draft text to rewrite…"
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
            />
          </div>
        )}

        {activeAction === 'reply' && (
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Ask @ai a question about the selected messages…"
            className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
          />
        )}

        {/* Visible "What Will Be Shared" Context Preview Checklist (§11) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Previewing {selectedContextPayload.length} of {recentMessages.length} recent message(s)
              to share:
            </span>
            <span>
              Provider: {provider} · Quota: {remainingBudget} tokens
            </span>
          </div>

          <div
            className="max-h-36 overflow-y-auto space-y-1 p-2.5 rounded-2xl bg-slate-950 border border-white/10"
            aria-label="What will be shared preview"
          >
            {recentMessages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-2">
                No conversation messages selected.
              </p>
            ) : (
              recentMessages.map((msg) => {
                const checked = selectedIds.includes(msg.id);
                return (
                  <label
                    key={msg.id}
                    className="flex items-start gap-2.5 p-1.5 rounded-xl hover:bg-white/5 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectMessage(msg.id)}
                      className="mt-0.5 accent-sky-500"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-sky-300">
                        {msg.sender.displayName}:{' '}
                      </span>
                      <span className="text-slate-300 break-words">{msg.body}</span>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Consent & Execute / Cancel Stream Button */}
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={cancelActiveStream}
              className="fluid-press w-full min-h-[42px] rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Cancel AI Stream</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isRunning || (selectedContextPayload.length === 0 && !customPrompt.trim())}
              onClick={() => void handleRunWithExplicitConsent()}
              className="fluid-press w-full min-h-[42px] rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isRunning
                  ? 'Running AI…'
                  : `Consent & Share (${selectedContextPayload.length} msg) with AI`}
              </span>
            </button>
          )}
        </div>

        {aiError && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-400/30 text-xs text-rose-200">
            {aiError}
          </div>
        )}

        {/* Output Result Area */}
        {streamedText && (
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-sky-500/30 space-y-3">
            <div className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
              {streamedText}
            </div>

            {smartReplies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {smartReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onApplyToDraft(reply);
                      onClose();
                    }}
                    className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-xs text-sky-200"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            {extractedTasks.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <div className="text-[11px] font-semibold text-sky-300">
                  Extracted Tasks & Dates:
                </div>
                {extractedTasks.map((t, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-xl bg-slate-950 border border-white/10 text-xs flex items-center justify-between"
                  >
                    <span className="font-medium text-white">{t.title}</span>
                    {t.dueOrTime && (
                      <span className="text-[11px] text-emerald-300">{t.dueOrTime}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  onApplyToDraft(streamedText);
                  onClose();
                }}
                className="fluid-press px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200"
              >
                Insert into Composer
              </button>
              <button
                type="button"
                onClick={() => {
                  onSendAiReplyToChat(`🤖 @ai: ${streamedText}`);
                  onClose();
                }}
                className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs text-white font-semibold flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Post to Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </FluidSheet>
  );
};
