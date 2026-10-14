import React, { useEffect, useState } from 'react';
import { Reorder, motion } from 'motion/react';
import {
  Hash,
  Megaphone,
  Volume2,
  Plus,
  Users,
  Link2,
  Pin,
  Archive,
  BellOff,
  MessageSquareText,
  Send,
  Shield,
  GripVertical,
  Lock,
} from 'lucide-react';
import type {
  ChannelDTO,
  CommunityRole,
  UserSummary,
} from '@kamand/shared';
import { useCommunityStore } from '../store/useCommunityStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { socketManager } from '../lib/socket.js';
import { SPRING_DEFAULT } from '../lib/physics.js';
import { FluidSheet } from './FluidSheet.js';
import { MessageBubble } from './MessageBubble.js';

interface CommunityWorkspaceProps {
  currentUser: UserSummary;
}

export const CommunityWorkspace: React.FC<CommunityWorkspaceProps> = ({ currentUser }) => {
  const {
    communities,
    activeCommunityId,
    activeChannelId,
    membersByComm,
    joinRequestsByComm,
    activeThread,
    lastCreatedInvite,
    loadCommunities,
    selectCommunity,
    selectChannel,
    createCategory,
    reorderCategories,
    createChannel,
    reorderChannels,
    updateChannel,
    setChannelOverride,
    loadMembers,
    updateMemberRole,
    updateMyPreferences,
    createInvite,
    joinByInviteCode,
    loadJoinRequests,
    respondJoinRequest,
    openThread,
    closeThread,
  } = useCommunityStore();

  const {
    messagesByConv,
    selectConversation,
    sendMessage,
    retryMessage,
  } = useChatStore();

  const [channelDraft, setChannelDraft] = useState('');
  const [threadDraft, setThreadDraft] = useState('');
  const [showMembersDrawer, setShowMembersDrawer] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelTopic, setNewChannelTopic] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'announcement' | 'voice'>('text');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [overrideRole, setOverrideRole] = useState<CommunityRole>('member');
  const [overrideCanView, setOverrideCanView] = useState(true);
  const [overrideCanSend, setOverrideCanSend] = useState(true);

  useEffect(() => {
    void loadCommunities();
  }, [loadCommunities]);

  const activeCommunity =
    communities.find((c) => c.id === activeCommunityId) ?? communities[0] ?? null;

  const allChannels: ChannelDTO[] = activeCommunity
    ? activeCommunity.categories.flatMap((cat) => cat.channels)
    : [];

  const activeChannel =
    allChannels.find((ch) => ch.id === activeChannelId) ?? allChannels[0] ?? null;

  useEffect(() => {
    if (activeChannel?.conversationId) {
      void selectConversation(activeChannel.conversationId, currentUser.id);
    }
  }, [activeChannel?.conversationId, currentUser.id, selectConversation]);

  useEffect(() => {
    if (activeCommunity?.id && showMembersDrawer) {
      void loadMembers(activeCommunity.id);
      if (
        activeCommunity.myRole === 'owner' ||
        activeCommunity.myRole === 'admin' ||
        activeCommunity.myRole === 'moderator'
      ) {
        void loadJoinRequests(activeCommunity.id);
      }
    }
  }, [activeCommunity?.id, activeCommunity?.myRole, showMembersDrawer, loadMembers, loadJoinRequests]);

  if (!activeCommunity) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
        <p className="text-sm text-slate-300 font-medium">Loading campus communities…</p>
      </div>
    );
  }

  const canManage =
    activeCommunity.myRole === 'owner' || activeCommunity.myRole === 'admin';

  const channelMessages = activeChannel
    ? (messagesByConv[activeChannel.conversationId] ?? []).filter((m) => !m.threadRootId)
    : [];

  const handleSendChannelMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel || !channelDraft.trim() || !activeChannel.canSend) return;
    const text = channelDraft;
    setChannelDraft('');
    await sendMessage(activeChannel.conversationId, text, currentUser);
  };

  const handleSendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel || !activeThread || !threadDraft.trim() || !activeChannel.canSend) return;
    const body = threadDraft.trim();
    setThreadDraft('');
    const ack = await socketManager.sendMessage({
      id: crypto.randomUUID(),
      conversationId: activeChannel.conversationId,
      body,
      type: 'text',
      threadRootId: activeThread.rootMessage.id,
    });
    if (ack.ok) {
      await openThread(activeThread.rootMessage.id);
    }
  };

  const renderChannelIcon = (type: ChannelDTO['type']) => {
    if (type === 'announcement') return <Megaphone className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    if (type === 'voice') return <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    return <Hash className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  };

  const members = membersByComm[activeCommunity.id] ?? [];
  const joinRequests = joinRequestsByComm[activeCommunity.id] ?? [];

  return (
    <div className="flex flex-1 h-full min-w-0 bg-slate-950 overflow-hidden">
      {/* Structured Community Sidebar: Workspace Header + Spring Reorderable Categories & Channels */}
      <div className="w-64 sm:w-72 border-r border-white/10 bg-slate-950/90 flex flex-col h-full select-none">
        {/* Community Switcher & Header */}
        <div className="p-3.5 glass-chrome border-b border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <select
              value={activeCommunity.id}
              onChange={(e) => selectCommunity(e.target.value)}
              aria-label="Select Community Workspace"
              className="flex-1 rounded-xl bg-slate-900 border border-white/15 px-2.5 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-sky-500"
            >
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.memberCount})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId(activeCommunity.categories[0]?.id ?? '');
                setIsManageOpen(true);
              }}
              className="fluid-press p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300"
              aria-label="Manage Community, Invites & Channels"
              title="Manage Community, Invites & Channels"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 line-clamp-2">{activeCommunity.description}</p>

          {/* Personal Community Mute / Pin / Archive Toggles */}
          {activeCommunity.myRole && (
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() =>
                  void updateMyPreferences(activeCommunity.id, {
                    isPinned: !activeCommunity.isPinned,
                  })
                }
                className={`fluid-press px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 border ${
                  activeCommunity.isPinned
                    ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                    : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
              >
                <Pin className="w-3 h-3" />
                <span>Pin</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void updateMyPreferences(activeCommunity.id, {
                    isMuted: !activeCommunity.isMuted,
                  })
                }
                className={`fluid-press px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 border ${
                  activeCommunity.isMuted
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                    : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
              >
                <BellOff className="w-3 h-3" />
                <span>Mute</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void updateMyPreferences(activeCommunity.id, {
                    isArchived: !activeCommunity.isArchived,
                  })
                }
                className={`fluid-press px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 border ${
                  activeCommunity.isArchived
                    ? 'bg-purple-500/20 border-purple-400/40 text-purple-200'
                    : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
              >
                <Archive className="w-3 h-3" />
                <span>Archive</span>
              </button>
            </div>
          )}
        </div>

        {/* Spring Physics Drag-to-Reorder Categories & Channels (§7, §15) */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
          <Reorder.Group
            axis="y"
            values={activeCommunity.categories.map((c) => c.id)}
            onReorder={(newOrder) => {
              if (canManage) {
                void reorderCategories(activeCommunity.id, newOrder);
              }
            }}
            className="space-y-4"
          >
            {activeCommunity.categories.map((cat) => (
              <Reorder.Item
                key={cat.id}
                value={cat.id}
                dragListener={canManage}
                transition={SPRING_DEFAULT}
                className="space-y-1"
              >
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1">
                    {canManage && <GripVertical className="w-3 h-3 text-slate-600 cursor-grab" />}
                    {cat.name}
                  </span>
                </div>

                <Reorder.Group
                  axis="y"
                  values={cat.channels.map((ch) => ch.id)}
                  onReorder={(newChOrder) => {
                    if (canManage) {
                      void reorderChannels(activeCommunity.id, cat.id, newChOrder);
                    }
                  }}
                  className="space-y-0.5"
                >
                  {cat.channels.map((ch) => {
                    const isSelected = activeChannel?.id === ch.id;
                    return (
                      <Reorder.Item
                        key={ch.id}
                        value={ch.id}
                        dragListener={canManage}
                        transition={SPRING_DEFAULT}
                      >
                        <button
                          type="button"
                          onClick={() => selectChannel(ch.id)}
                          className={`fluid-press w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-sky-500/20 text-white border border-sky-500/30'
                              : 'text-slate-300 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {renderChannelIcon(ch.type)}
                            <span className="truncate">{ch.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {ch.isPinned && <Pin className="w-3 h-3 text-sky-400" />}
                            {ch.isArchived && <Archive className="w-3 h-3 text-amber-400" />}
                            {!ch.canSend && <Lock className="w-3 h-3 text-slate-500" />}
                          </div>
                        </button>
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
      </div>

      {/* Center Pane: Active Channel Conversation */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-950">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <header className="sticky top-0 z-20 px-4 py-3 glass-chrome glass-top-highlight border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {renderChannelIcon(activeChannel.type)}
                  <h2 className="text-heading text-base text-white truncate">
                    {activeChannel.name}
                  </h2>
                  {activeChannel.type === 'announcement' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-semibold">
                      Announcement Only
                    </span>
                  )}
                  {activeChannel.isArchived && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-400/30 text-rose-300 text-[10px] font-semibold">
                      Archived
                    </span>
                  )}
                </div>
                {activeChannel.topic && (
                  <p className="text-caption text-slate-400 truncate mt-0.5">
                    {activeChannel.topic}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    type="button"
                    onClick={() =>
                      void updateChannel(activeChannel.id, {
                        isPinned: !activeChannel.isPinned,
                      })
                    }
                    className="fluid-press p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white"
                    title="Toggle Pin Channel"
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowMembersDrawer((v) => !v)}
                  className={`fluid-press px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 ${
                    showMembersDrawer
                      ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                      : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Members ({activeCommunity.memberCount})</span>
                </button>
              </div>
            </header>

            {/* Channel Message Stream */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-edge-mask">
              {channelMessages.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center text-slate-400">
                  <p className="text-sm font-semibold text-slate-200">
                    Welcome to #{activeChannel.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{activeChannel.topic}</p>
                </div>
              ) : (
                channelMessages.map((msg, idx) => {
                  const prev = channelMessages[idx - 1];
                  const next = channelMessages[idx + 1];
                  const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
                  const isLastInGroup = !next || next.senderId !== msg.senderId;
                  return (
                    <div key={msg.id} className="space-y-1">
                      <MessageBubble
                        message={msg}
                        isOwn={msg.senderId === currentUser.id}
                        isFirstInGroup={isFirstInGroup}
                        isLastInGroup={isLastInGroup}
                        onReply={() => void openThread(msg.id)}
                        onRetry={(messageId) =>
                          void retryMessage(activeChannel.conversationId, messageId, currentUser)
                        }
                      />
                      <div
                        className={`flex ${
                          msg.senderId === currentUser.id ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void openThread(msg.id)}
                          className="fluid-press inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-[11px] text-sky-300"
                        >
                          <MessageSquareText className="w-3 h-3" />
                          <span>
                            {msg.threadReplyCount && msg.threadReplyCount > 0
                              ? `${msg.threadReplyCount} thread ${
                                  msg.threadReplyCount === 1 ? 'reply' : 'replies'
                                }`
                              : 'Reply in thread'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Channel Composer */}
            <div className="sticky bottom-0 z-20 px-4 py-3 glass-chrome glass-top-highlight border-t border-white/10">
              {!activeChannel.canSend ? (
                <div className="py-2 text-center text-xs text-amber-300 flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    {activeChannel.type === 'announcement'
                      ? 'Only moderators, admins, and owners can post in this announcement channel.'
                      : 'You have read-only access in this channel.'}
                  </span>
                </div>
              ) : (
                <form onSubmit={handleSendChannelMessage} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={channelDraft}
                    onChange={(e) => setChannelDraft(e.target.value)}
                    placeholder={`Message #${activeChannel.name}…`}
                    aria-label={`Message #${activeChannel.name}`}
                    className="flex-1 rounded-2xl bg-slate-900/90 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={!channelDraft.trim()}
                    aria-label="Send channel message"
                    className="fluid-press min-h-[44px] min-w-[44px] rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Select a channel
          </div>
        )}
      </div>

      {/* Right Pane 1: Threaded Replies Drawer */}
      {activeThread && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING_DEFAULT}
          className="w-80 lg:w-96 border-l border-white/10 bg-slate-950 flex flex-col h-full"
          aria-label="Thread replies"
        >
          <div className="px-4 py-3 glass-chrome border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-sky-400" />
              <h3 className="text-heading text-sm text-white">Thread</h3>
            </div>
            <button
              type="button"
              onClick={closeThread}
              className="fluid-press p-1.5 rounded-lg text-slate-400 hover:text-white"
              aria-label="Close thread"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Root Message */}
            <div className="p-3 rounded-2xl bg-slate-900 border border-sky-500/30">
              <div className="text-xs font-semibold text-sky-300">
                {activeThread.rootMessage.sender.displayName}
              </div>
              <p className="text-sm text-slate-100 mt-1">{activeThread.rootMessage.body}</p>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Replies ({activeThread.replies.length})
            </div>

            {activeThread.replies.map((reply) => (
              <div
                key={reply.id}
                className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    {reply.sender.displayName}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(reply.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-slate-300">{reply.body}</p>
              </div>
            ))}
          </div>

          {activeChannel?.canSend && (
            <form
              onSubmit={handleSendThreadReply}
              className="p-3 glass-chrome border-t border-white/10 flex gap-2"
            >
              <input
                type="text"
                value={threadDraft}
                onChange={(e) => setThreadDraft(e.target.value)}
                placeholder="Reply to thread…"
                aria-label="Reply to thread"
                className="flex-1 rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!threadDraft.trim()}
                className="fluid-press px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold"
              >
                Reply
              </button>
            </form>
          )}
        </motion.aside>
      )}

      {/* Right Pane 2: Community Member List & Role Manager */}
      {showMembersDrawer && !activeThread && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING_DEFAULT}
          className="w-72 lg:w-80 border-l border-white/10 bg-slate-950 flex flex-col h-full overflow-y-auto p-3 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Members ({members.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowMembersDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {joinRequests.length > 0 && (
            <div className="space-y-2 p-2.5 rounded-2xl bg-sky-500/10 border border-sky-400/25">
              <div className="text-[11px] font-semibold text-sky-300">
                Pending Join Requests ({joinRequests.length})
              </div>
              {joinRequests.map((jr) => (
                <div key={jr.id} className="space-y-1 text-xs border-t border-white/10 pt-2">
                  <div className="font-medium text-white">{jr.user.displayName}</div>
                  {jr.note && <p className="text-[11px] text-slate-300">{jr.note}</p>}
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        void respondJoinRequest(activeCommunity.id, jr.id, 'approve')
                      }
                      className="px-2 py-1 rounded bg-emerald-500 text-white text-[11px]"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void respondJoinRequest(activeCommunity.id, jr.id, 'reject')
                      }
                      className="px-2 py-1 rounded bg-white/10 text-slate-300 text-[11px]"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="p-2.5 rounded-xl bg-slate-900/70 border border-white/10 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {m.user.displayName}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    @{m.user.username} · {m.role}
                  </div>
                </div>

                {canManage && m.userId !== currentUser.id && (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      void updateMemberRole(
                        activeCommunity.id,
                        m.userId,
                        e.target.value as CommunityRole
                      )
                    }
                    aria-label={`Role for ${m.user.displayName}`}
                    className="rounded-lg bg-slate-950 border border-white/15 px-2 py-1 text-[11px] text-sky-300"
                  >
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="member">member</option>
                    <option value="readonly">readonly</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </motion.aside>
      )}

      {/* Community Management, Invites, Categories, Channels & Overrides Sheet */}
      <FluidSheet
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        title={`Workspace Settings · ${activeCommunity.name}`}
      >
        <div className="space-y-6">
          {/* Join by Invite Code */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inviteCodeInput.trim()) return;
              await joinByInviteCode(inviteCodeInput);
              setInviteCodeInput('');
              setIsManageOpen(false);
            }}
            className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2"
          >
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-sky-400" />
              Join Community by Invite Code
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="Enter invite code (e.g. KAMAND26)"
                className="flex-1 rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="fluid-press px-3.5 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold"
              >
                Join
              </button>
            </div>
          </form>

          {/* Generate Invite Link */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Create Invite Code</span>
              <button
                type="button"
                onClick={() => void createInvite(activeCommunity.id, 50)}
                className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-medium"
              >
                Generate Code
              </button>
            </div>
            {lastCreatedInvite && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-sky-500/30 flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-sky-300">{lastCreatedInvite.code}</span>
                <span className="text-[11px] text-slate-400">
                  Max uses: {lastCreatedInvite.maxUses ?? 'Unlimited'}
                </span>
              </div>
            )}
          </div>

          {canManage && (
            <>
              {/* Create Category */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newCategoryName.trim()) return;
                  await createCategory(activeCommunity.id, newCategoryName.trim());
                  setNewCategoryName('');
                }}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2"
              >
                <div className="text-xs font-semibold text-slate-200">New Category</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Labs, Sports, Fest"
                    className="flex-1 rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="fluid-press px-3.5 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold"
                  >
                    Add Category
                  </button>
                </div>
              </form>

              {/* Create Channel */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newChannelName.trim() || !selectedCategoryId) return;
                  await createChannel(activeCommunity.id, {
                    categoryId: selectedCategoryId,
                    name: newChannelName,
                    topic: newChannelTopic,
                    type: newChannelType,
                  });
                  setNewChannelName('');
                  setNewChannelTopic('');
                  setIsManageOpen(false);
                }}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2.5"
              >
                <div className="text-xs font-semibold text-slate-200">New Channel</div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    {activeCommunity.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newChannelType}
                    onChange={(e) =>
                      setNewChannelType(e.target.value as 'text' | 'announcement' | 'voice')
                    }
                    className="rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    <option value="text">Text Channel</option>
                    <option value="announcement">Announcement Only</option>
                    <option value="voice">Voice / Call Room</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="channel-name"
                  className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={newChannelTopic}
                  onChange={(e) => setNewChannelTopic(e.target.value)}
                  placeholder="Channel topic / description"
                  className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="fluid-press w-full py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold"
                >
                  Create Channel
                </button>
              </form>

              {/* Channel Permission Override Editor */}
              {activeChannel && (
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-sky-400" />
                    Permission Override for #{activeChannel.name}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <select
                      value={overrideRole}
                      onChange={(e) => setOverrideRole(e.target.value as CommunityRole)}
                      className="rounded-xl bg-slate-950 border border-white/15 px-2.5 py-1.5 text-white"
                    >
                      <option value="moderator">moderator</option>
                      <option value="member">member</option>
                      <option value="readonly">readonly</option>
                    </select>
                    <label className="flex items-center gap-1 text-slate-300">
                      <input
                        type="checkbox"
                        checked={overrideCanView}
                        onChange={(e) => setOverrideCanView(e.target.checked)}
                      />
                      Can View
                    </label>
                    <label className="flex items-center gap-1 text-slate-300">
                      <input
                        type="checkbox"
                        checked={overrideCanSend}
                        onChange={(e) => setOverrideCanSend(e.target.checked)}
                      />
                      Can Send
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        void setChannelOverride(
                          activeChannel.id,
                          overrideRole,
                          overrideCanView,
                          overrideCanSend
                        )
                      }
                      className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500 text-white font-semibold"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </FluidSheet>
    </div>
  );
};
