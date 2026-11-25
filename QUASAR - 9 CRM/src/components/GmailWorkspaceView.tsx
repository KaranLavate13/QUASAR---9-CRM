import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Mail,
  PenSquare,
  RefreshCw,
  Reply,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { AiMemoryItem, AiSkillItem, EmailCrmExtraction, GmailMessage } from '../types/crm';
import { listGmailMessages, sendGmailMessage } from '../lib/gmail';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GmailWorkspaceViewProps {
  accessToken: string | null;
  userEmail: string;
  initialComposeTo?: { email: string; name: string; subject?: string; body?: string } | null;
  onClearInitialCompose: () => void;
  onConnectGoogle: () => Promise<void>;
  memories: AiMemoryItem[];
  skills: AiSkillItem[];
  systemInstructions: string;
  onAutoLearnMemories: (items: string[]) => Promise<void>;
  onSyncEmailExtractionToCrm: (extraction: EmailCrmExtraction) => Promise<void>;
  onLogAction: (action: string, target: string, details: string) => void;
}

export const GmailWorkspaceView: React.FC<GmailWorkspaceViewProps> = ({
  accessToken,
  userEmail,
  initialComposeTo,
  onClearInitialCompose,
  onConnectGoogle,
  memories,
  skills,
  systemInstructions,
  onAutoLearnMemories,
  onSyncEmailExtractionToCrm,
  onLogAction,
}) => {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Reply / Compose state
  const [composingNew, setComposingNew] = useState(false);
  const [toField, setToField] = useState('');
  const [subjectField, setSubjectField] = useState('');
  const [bodyField, setBodyField] = useState('');
  const [draftingAi, setDraftingAi] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');

  // Zero-Entry Gmail-to-CRM AI Auto-Capture
  const [extractingCrm, setExtractingCrm] = useState(false);
  const [crmExtraction, setCrmExtraction] = useState<EmailCrmExtraction | null>(null);
  const [syncingCrm, setSyncingCrm] = useState(false);

  // Mandatory explicit Confirmation Modal before sending any email
  const [pendingSendConfirm, setPendingSendConfirm] = useState<{
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  } | null>(null);

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null;

  const fetchInbox = async (q = searchQuery) => {
    if (!accessToken) return;
    setLoading(true);
    setErrorMsg('');
    setNeedsReconnect(false);
    try {
      const list = await listGmailMessages(accessToken, q, 15);
      setMessages(list);
      if (list.length > 0 && !list.some((m) => m.id === selectedId)) {
        setSelectedId(list[0].id);
      }
      onLogAction('Synced Gmail Inbox', q ? `Query: ${q}` : 'Inbox', `Loaded ${list.length} messages`);
    } catch (err) {
      if (err instanceof Error && err.message === 'GMAIL_AUTH_REQUIRED') {
        setNeedsReconnect(true);
        setErrorMsg('Your Gmail session expired or permissions need renewal. Sign in with Google to reconnect.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load Gmail messages.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      void fetchInbox('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (initialComposeTo) {
      setComposingNew(true);
      setToField(initialComposeTo.email);
      setSubjectField(initialComposeTo.subject || `Following up — ${initialComposeTo.name}`);
      setBodyField(initialComposeTo.body || '');
      onClearInitialCompose();
    }
  }, [initialComposeTo, onClearInitialCompose]);

  const handleExtractToCrm = async () => {
    if (!selectedMessage) return;
    setExtractingCrm(true);
    setErrorMsg('');
    setCrmExtraction(null);
    try {
      const res = await fetch('/api/ai/extract-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedMessage,
          memories: memories.map((m) => ({ content: m.content, active: m.active })),
          skills: skills.map((s) => ({
            name: s.name,
            domain: s.domain,
            instructions: s.instructions,
            enabled: s.enabled,
          })),
          systemInstructions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Email CRM extraction failed.');
      setCrmExtraction(data.extraction);
      onLogAction('Extracted Gmail Thread to CRM Preview', selectedMessage.subject, 'AI Auto-Capture');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to extract CRM details from email.');
    } finally {
      setExtractingCrm(false);
    }
  };

  const handleDraftWithAi = async () => {
    setDraftingAi(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextType: 'gmail_reply',
          prompt: composingNew
            ? `Write a concise, warm CRM outreach email to ${toField || 'the recipient'} regarding "${subjectField || 'our collaboration'}".`
            : `Draft a crisp, professional reply to this email from ${selectedMessage?.from || 'the sender'}.`,
          emailContext:
            !composingNew && selectedMessage
              ? {
                  from: selectedMessage.from,
                  subject: selectedMessage.subject,
                  body: selectedMessage.body,
                }
              : undefined,
          memories: memories.map((m) => ({ content: m.content, active: m.active })),
          skills: skills.map((s) => ({
            name: s.name,
            domain: s.domain,
            instructions: s.instructions,
            enabled: s.enabled,
          })),
          systemInstructions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI draft failed.');
      setBodyField(data.reply || '');
      onLogAction('Drafted AI Email Reply', subjectField || selectedMessage?.subject || 'New Email', 'Generated via Gemini 4 Flash');
      if (Array.isArray(data.learnedMemories) && data.learnedMemories.length > 0) {
        await onAutoLearnMemories(data.learnedMemories);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to draft reply.');
    } finally {
      setDraftingAi(false);
    }
  };

  const requestSendConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTo = composingNew
      ? toField.trim()
      : selectedMessage?.from.match(/<([^>]+)>/)?.[1] || selectedMessage?.from || '';
    const targetSubject = composingNew
      ? subjectField.trim()
      : selectedMessage?.subject.startsWith('Re:')
        ? selectedMessage.subject
        : `Re: ${selectedMessage?.subject || ''}`;

    if (!targetTo || !bodyField.trim()) {
      setErrorMsg('Recipient email and message body are required before sending.');
      return;
    }

    setPendingSendConfirm({
      to: targetTo,
      subject: targetSubject || '(No subject)',
      body: bodyField.trim(),
      threadId: composingNew ? undefined : selectedMessage?.threadId,
    });
  };

  const executeConfirmedSend = async () => {
    if (!pendingSendConfirm || !accessToken) return;
    setSending(true);
    setErrorMsg('');
    try {
      await sendGmailMessage(accessToken, pendingSendConfirm);
      onLogAction('Sent Gmail Message', pendingSendConfirm.to, `Subject: ${pendingSendConfirm.subject}`);
      setStatusNotice(`Email sent to ${pendingSendConfirm.to}`);
      setBodyField('');
      if (composingNew) {
        setToField('');
        setSubjectField('');
        setComposingNew(false);
      }
      setPendingSendConfirm(null);
      void fetchInbox();
    } catch (err) {
      if (err instanceof Error && err.message === 'GMAIL_AUTH_REQUIRED') {
        setNeedsReconnect(true);
        setErrorMsg('Gmail permission expired. Sign in with Google to reconnect.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to send email.');
      }
      setPendingSendConfirm(null);
    } finally {
      setSending(false);
    }
  };

  if (!accessToken || needsReconnect) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="liquid-surface rounded-2xl p-10 text-center space-y-5">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Mail className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Connect Your Gmail Account</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Read incoming Gmail threads, run Zero-Entry AI Auto-Capture into Contacts & Deals, draft AI smart replies, and send responses directly inside QUASAR-9 CRM.
            </p>
          </div>
          {errorMsg && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-500">
              {errorMsg}
            </p>
          )}
          <div className="flex justify-center pt-1">
            <GoogleSignInButton onClick={onConnectGoogle} label="Connect Gmail with Google" />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Gmail only · In-memory session token · Explicit confirmation required before sending any message
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
          Connected as {userEmail} · Gmail Only · Zero-Entry AI Auto-Capture Enabled
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setComposingNew(true);
              setToField('');
              setSubjectField('');
              setBodyField('');
            }}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
          >
            <PenSquare className="h-3.5 w-3.5" />
            Compose
          </button>
          <button
            type="button"
            onClick={() => void fetchInbox()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface hover:opacity-90"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fetchInbox(searchQuery);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <label htmlFor="gmail-search" className="sr-only">Search Gmail messages</label>
          <input
            id="gmail-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Gmail (e.g., from:client, invoice, is:unread)..."
            className="w-full rounded-xl py-2.5 pr-4 pl-10 text-sm outline-none"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
          />
        </div>
        <button type="submit" className="rounded-xl px-4 py-2.5 text-xs font-medium liquid-surface hover:opacity-90">
          Search
        </button>
      </form>

      {statusNotice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-500">
          {statusNotice}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Split Mail Client: Thread List + Reader & Reply */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="liquid-surface rounded-2xl p-3 lg:col-span-5 space-y-1.5 max-h-[660px] overflow-y-auto">
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Gmail messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              No Gmail messages matched your query.
            </div>
          ) : (
            messages.map((msg) => {
              const isActive = !composingNew && selectedId === msg.id;
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => {
                    setComposingNew(false);
                    setSelectedId(msg.id);
                    setBodyField('');
                    setCrmExtraction(null);
                  }}
                  className={`w-full rounded-xl p-3.5 text-left transition-all ${
                    isActive ? 'liquid-glass-active' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${msg.unread ? 'font-bold' : 'font-medium'}`}>
                      {msg.from}
                    </span>
                    <span className="shrink-0 text-[11px] font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      {msg.date.slice(0, 16)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold">{msg.subject}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {msg.snippet}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="liquid-surface rounded-2xl p-5 lg:col-span-7 flex flex-col justify-between space-y-5">
          {composingNew ? (
            <form onSubmit={requestSendConfirmation} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">New Gmail Message</h2>
                <button
                  type="button"
                  onClick={() => setComposingNew(false)}
                  aria-label="Cancel compose"
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="email"
                value={toField}
                onChange={(e) => setToField(e.target.value)}
                placeholder="To: recipient@company.com"
                required
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <input
                type="text"
                value={subjectField}
                onChange={(e) => setSubjectField(e.target.value)}
                placeholder="Subject"
                required
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <textarea
                rows={9}
                value={bodyField}
                onChange={(e) => setBodyField(e.target.value)}
                placeholder="Write your email or click AI Draft..."
                required
                className="w-full rounded-xl p-4 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleDraftWithAi}
                  disabled={draftingAi}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface hover:opacity-90"
                >
                  {draftingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Draft with AI Memory
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Review & Send
                </button>
              </div>
            </form>
          ) : selectedMessage ? (
            <>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{selectedMessage.subject}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>From: {selectedMessage.from}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{selectedMessage.date}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExtractToCrm}
                    disabled={extractingCrm}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap liquid-glass-active"
                  >
                    {extractingCrm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                    {extractingCrm ? 'Extracting...' : 'Extract to CRM (AI)'}
                  </button>
                </div>

                {/* Zero-Entry Gmail-to-CRM Approval Preview Card */}
                {crmExtraction && (
                  <div
                    className="rounded-xl p-4 space-y-3 text-xs"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--accent)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                        Zero-Entry AI CRM Extraction Preview
                      </span>
                      <button type="button" onClick={() => setCrmExtraction(null)} aria-label="Close extraction preview">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>{crmExtraction.summary}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Contact</div>
                        <div className="font-semibold">{crmExtraction.contactName || '—'}</div>
                        <div>{crmExtraction.company} · {crmExtraction.buyingRole.replace('_', ' ')}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Opportunity</div>
                        <div className="font-semibold">{crmExtraction.dealTitle || '—'}</div>
                        <div className="font-mono-tabular">${crmExtraction.dealValue.toLocaleString()} · {crmExtraction.dealStage}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Next Task</div>
                        <div className="font-semibold">{crmExtraction.followUpTaskTitle || '—'}</div>
                        <div className="uppercase">{crmExtraction.followUpPriority}</div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={syncingCrm}
                        onClick={async () => {
                          setSyncingCrm(true);
                          try {
                            await onSyncEmailExtractionToCrm(crmExtraction);
                            setStatusNotice(`Synced "${crmExtraction.contactName || crmExtraction.dealTitle}" to QUASAR-9 CRM.`);
                            setCrmExtraction(null);
                          } finally {
                            setSyncingCrm(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                      >
                        {syncingCrm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve & Sync to Pipeline
                      </button>
                    </div>
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {selectedMessage.body}
                </div>
              </div>

              {/* Inline Reply Composer */}
              <form
                onSubmit={requestSendConfirmation}
                className="space-y-3 pt-4"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    <Reply className="h-3.5 w-3.5" />
                    Reply directly via Gmail
                  </span>
                  <button
                    type="button"
                    onClick={handleDraftWithAi}
                    disabled={draftingAi}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium liquid-surface hover:opacity-90"
                  >
                    {draftingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    AI Smart Reply
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={bodyField}
                  onChange={(e) => setBodyField(e.target.value)}
                  placeholder="Write your reply..."
                  className="w-full rounded-xl p-3.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Review & Send Reply
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Select a message from your Gmail inbox to read, extract to CRM, or reply.
            </div>
          )}
        </div>
      </div>

      {/* Mandatory Confirmation Dialog before sending any email through Gmail API */}
      {pendingSendConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sending Gmail message"
        >
          <div className="liquid-elevated w-full max-w-lg rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <h3 className="text-base font-semibold">Confirm Send via Gmail</h3>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              You are about to send a live email from your Gmail account ({userEmail}). Please confirm the details below:
            </p>
            <div className="rounded-xl p-4 space-y-2 text-xs" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
              <div><strong>To:</strong> {pendingSendConfirm.to}</div>
              <div><strong>Subject:</strong> {pendingSendConfirm.subject}</div>
              <div className="pt-2 whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                {pendingSendConfirm.body.slice(0, 400)}
                {pendingSendConfirm.body.length > 400 ? '...' : ''}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingSendConfirm(null)}
                disabled={sending}
                className="rounded-xl px-4 py-2 text-xs font-medium liquid-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedSend}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sending ? 'Sending...' : 'Confirm & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
