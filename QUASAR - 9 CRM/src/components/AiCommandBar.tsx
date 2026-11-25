import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AiMemoryItem,
  AiSkillItem,
  Contact,
  Deal,
  NavTab,
  TaskItem,
  TaskPriority,
} from '../types/crm';
import { summarizeWorkspaceForAi } from '../utils/crmLogic';

export interface ParsedAiCommand {
  actionType: 'navigate' | 'create_task' | 'create_deal' | 'draft_email' | 'open_meet' | 'run_report' | 'answer';
  summary: string;
  answerText: string;
  targetTab?: NavTab;
  taskTitle?: string;
  taskPriority?: TaskPriority;
  dealTitle?: string;
  company?: string;
  dealValue?: number;
  emailTo?: string;
  emailSubject?: string;
  reportPrompt?: string;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  command?: ParsedAiCommand;
  executed?: boolean;
}

interface AiCommandBarProps {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  deals: Deal[];
  tasks: TaskItem[];
  memories: AiMemoryItem[];
  skills: AiSkillItem[];
  systemInstructions: string;
  onNavigate: (tab: NavTab) => void;
  onExecuteCommand: (cmd: ParsedAiCommand) => Promise<void>;
}

const STARTER_PROMPTS = [
  'Summarize my open pipeline and biggest risks',
  'Create a high-priority task to follow up with top prospects',
  'Open Google Meet & Workspace to schedule a call',
  'Which tasks are currently pending or blocked?',
];

export const AiCommandBar: React.FC<AiCommandBarProps> = ({
  open,
  onClose,
  contacts,
  deals,
  tasks,
  memories,
  skills,
  systemInstructions,
  onNavigate,
  onExecuteCommand,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submitPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setTurns((prev) => [...prev, userTurn]);
    setQuery('');
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          crmSnapshot: summarizeWorkspaceForAi(contacts, deals, tasks),
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
      if (!res.ok) throw new Error(data.error || 'QUASAR-9 AI could not process your request.');

      const cmd: ParsedAiCommand = data.command;
      const aiTurn: ChatTurn = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: cmd.answerText || cmd.summary,
        command: cmd,
      };
      setTurns((prev) => [...prev, aiTurn]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach QUASAR-9 AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPrompt(query);
  };

  const handleConfirmAction = async (turn: ChatTurn) => {
    if (!turn.command) return;
    setExecutingId(turn.id);
    try {
      await onExecuteCommand(turn.command);
      setTurns((prev) =>
        prev.map((t) => (t.id === turn.id ? { ...t, executed: true } : t))
      );
      if (turn.command.actionType === 'navigate' || turn.command.actionType === 'open_meet') {
        onClose();
      }
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/25 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="QUASAR-9 AI Chat"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-elevated flex h-[82vh] max-h-[680px] w-full max-w-md flex-col overflow-hidden rounded-3xl">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl liquid-glass-active"
              aria-hidden="true"
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold tracking-tight">QUASAR-9 AI Chat</div>
              <div className="text-[11px] font-mono-tabular truncate" style={{ color: 'var(--text-muted)' }}>
                {memories.filter((m) => m.active).length} memories · {skills.filter((s) => s.enabled).length} skills active
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => setTurns([])}
                aria-label="Clear AI chat history"
                title="Clear chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {turns.length === 0 ? (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-1.5 px-2">
                <div className="text-sm font-semibold">Ask or command QUASAR-9 CRM</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Query live deals, create tasks, draft Gmail follow-ups, launch Google Meet, or navigate anywhere using natural language.
                </p>
              </div>
              <div className="space-y-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void submitPrompt(p)}
                    className="liquid-surface flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs transition-opacity hover:opacity-90"
                  >
                    <span>{p}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  </button>
                ))}
              </div>
              <div className="pt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    { label: 'AI Reports', tab: 'dashboard' },
                    { label: 'CRM Pipeline', tab: 'crm' },
                    { label: 'Meet & Workspace', tab: 'meet' },
                    { label: 'Gmail Inbox', tab: 'gmail' },
                  ] as const
                ).map((q) => (
                  <button
                    key={q.tab}
                    type="button"
                    onClick={() => {
                      onNavigate(q.tab);
                      onClose();
                    }}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium liquid-surface hover:opacity-90"
                  >
                    Jump to {q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed space-y-2 ${
                    turn.role === 'user' ? 'liquid-glass-active' : 'liquid-surface'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{turn.text}</div>
                  {turn.command && turn.command.actionType !== 'answer' && (
                    <div
                      className="rounded-xl p-2.5 space-y-2"
                      style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                    >
                      <div className="text-[10px] font-mono-tabular uppercase" style={{ color: 'var(--accent)' }}>
                        Action · {turn.command.actionType.replace('_', ' ')}
                      </div>
                      <div className="text-xs font-semibold">{turn.command.summary}</div>
                      {turn.executed ? (
                        <div className="text-[11px] font-medium text-emerald-500">
                          Executed cleanly.
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={executingId === turn.id}
                          onClick={() => void handleConfirmAction(turn)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                        >
                          {executingId === turn.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          Confirm & Execute
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="liquid-surface inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
                Thinking with QUASAR-9 AI...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {errorMsg}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 p-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Message QUASAR-9 AI (⌘K)..."
            className="flex-1 rounded-xl px-3.5 py-2.5 text-xs outline-none"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            aria-label="Send message to QUASAR-9 AI"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
