import React, { useMemo, useState } from 'react';
import { Hash, MessageSquare, Send, Users } from 'lucide-react';
import type { TeamMessage, UserPublicProfile } from '../types/crm';
import { formatTimestamp } from '../utils/crmLogic';
import { GoogleSignInButton } from './GoogleSignInButton';

interface TeamMessagesViewProps {
  currentUserId: string | null;
  currentUserName: string;
  employees: UserPublicProfile[];
  messages: TeamMessage[];
  onSendMessage: (recipientId: string, text: string) => Promise<void>;
  onSignIn: () => Promise<void>;
}

export const TeamMessagesView: React.FC<TeamMessagesViewProps> = ({
  currentUserId,
  currentUserName,
  employees,
  messages,
  onSendMessage,
  onSignIn,
}) => {
  const [activeRecipientId, setActiveRecipientId] = useState<string>('org');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const otherEmployees = useMemo(
    () => employees.filter((e) => e.uid !== currentUserId),
    [employees, currentUserId]
  );

  const activeThread = useMemo(() => {
    const filtered = messages.filter((m) => {
      if (activeRecipientId === 'org') {
        return m.recipientId === 'org';
      }
      if (!currentUserId) return false;
      return (
        (m.senderId === currentUserId && m.recipientId === activeRecipientId) ||
        (m.senderId === activeRecipientId && m.recipientId === currentUserId)
      );
    });
    return filtered.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [messages, activeRecipientId, currentUserId]);

  const activeTitle = useMemo(() => {
    if (activeRecipientId === 'org') return 'Organization Channel';
    const target = otherEmployees.find((e) => e.uid === activeRecipientId);
    return target ? target.displayName : 'Direct Message';
  }, [activeRecipientId, otherEmployees]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onSendMessage(activeRecipientId, draft.trim());
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Real-time organization text messaging for connected employees and shared Google Meet rooms.
        </p>
        <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
          {employees.length} connected {employees.length === 1 ? 'employee' : 'employees'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Channels & Connected Employees Sidebar */}
        <aside className="liquid-surface rounded-2xl p-4 lg:col-span-4 space-y-5">
          <div>
            <div className="mb-2 px-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Workspace Channels
            </div>
            <button
              type="button"
              onClick={() => setActiveRecipientId('org')}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all ${
                activeRecipientId === 'org' ? 'liquid-glass-active' : 'hover:bg-white/5'
              }`}
            >
              <Hash className="h-4 w-4 shrink-0" />
              <span>Organization Channel</span>
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              <span>Connected Employees</span>
              <span className="font-mono-tabular">{otherEmployees.length}</span>
            </div>

            {otherEmployees.length === 0 ? (
              <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                <Users className="mb-2 h-4 w-4" />
                No other employees have signed in yet. Share your CRM link—connected teammates appear here automatically with zero fictional accounts.
              </div>
            ) : (
              <div className="space-y-1.5">
                {otherEmployees.map((emp) => {
                  const isActive = activeRecipientId === emp.uid;
                  return (
                    <button
                      key={emp.uid}
                      type="button"
                      onClick={() => setActiveRecipientId(emp.uid)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                        isActive ? 'liquid-glass-active' : 'hover:bg-white/5'
                      }`}
                    >
                      {emp.photoUrl ? (
                        <img
                          src={emp.photoUrl}
                          alt={emp.displayName}
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                        >
                          {emp.displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{emp.displayName}</div>
                        <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {emp.roleTitle || emp.department || 'Connected'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Active Conversation Canvas */}
        <section className="liquid-surface flex min-h-[540px] flex-col rounded-2xl lg:col-span-8">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <h2 className="text-base font-semibold">{activeTitle}</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {activeRecipientId === 'org'
                  ? 'Shared channel visible to verified organization accounts'
                  : 'Private direct message thread'}
              </p>
            </div>
            {!currentUserId && (
              <GoogleSignInButton onClick={onSignIn} label="Sign in to sync" />
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[420px]">
            {activeThread.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="mb-2 h-8 w-8" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium">No messages in {activeTitle} yet</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Send the first message below to start the thread.
                </p>
              </div>
            ) : (
              activeThread.map((msg) => {
                const isMine = msg.senderId === (currentUserId || 'local-session');
                return (
                  <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className="mb-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-medium">{isMine ? currentUserName : msg.senderName}</span>
                      <span className="font-mono-tabular">{formatTimestamp(msg.createdAt)}</span>
                    </div>
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isMine ? 'liquid-glass-active' : ''
                      }`}
                      style={
                        isMine
                          ? undefined
                          : { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }
                      }
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="flex items-center gap-2.5 p-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <label htmlFor="team-msg-input" className="sr-only">Write a message</label>
            <input
              id="team-msg-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${activeTitle}...`}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none focus-visible:ring-2"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
