import React, { useState } from 'react';
import {
  Brain,
  Check,
  Plus,
  Save,
  Sliders,
  Trash2,
} from 'lucide-react';
import type { AiMemoryItem, AiSkillItem } from '../types/crm';
import { composeAiSystemContext, formatTimestamp } from '../utils/crmLogic';

interface AiBrainViewProps {
  systemInstructions: string;
  memories: AiMemoryItem[];
  skills: AiSkillItem[];
  onSaveSystemInstructions: (instructions: string) => Promise<void>;
  onAddMemory: (content: string) => Promise<void>;
  onToggleMemory: (memory: AiMemoryItem) => Promise<void>;
  onDeleteMemory: (memory: AiMemoryItem) => Promise<void>;
  onAddSkill: (payload: { name: string; domain: string; instructions: string }) => Promise<void>;
  onToggleSkill: (skill: AiSkillItem) => Promise<void>;
  onDeleteSkill: (skill: AiSkillItem) => Promise<void>;
}

export const AiBrainView: React.FC<AiBrainViewProps> = ({
  systemInstructions,
  memories,
  skills,
  onSaveSystemInstructions,
  onAddMemory,
  onToggleMemory,
  onDeleteMemory,
  onAddSkill,
  onToggleSkill,
  onDeleteSkill,
}) => {
  const [sysDraft, setSysDraft] = useState(systemInstructions);
  const [savedNotice, setSavedNotice] = useState(false);

  const [newMemoryText, setNewMemoryText] = useState('');
  const [skillName, setSkillName] = useState('');
  const [skillDomain, setSkillDomain] = useState('');
  const [skillInstructions, setSkillInstructions] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const summary = composeAiSystemContext(sysDraft, skills, memories);

  const handleSaveInstructions = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSystemInstructions(sysDraft.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  const handleMemorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    setErrorMsg('');
    try {
      await onAddMemory(newMemoryText.trim());
      setNewMemoryText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save memory.');
    }
  };

  const handleSkillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim() || !skillInstructions.trim()) {
      setErrorMsg('Provide both a skill name and clear instructions.');
      return;
    }
    setErrorMsg('');
    try {
      await onAddSkill({
        name: skillName.trim(),
        domain: skillDomain.trim() || 'General CRM',
        instructions: skillInstructions.trim(),
      });
      setSkillName('');
      setSkillDomain('');
      setSkillInstructions('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create skill.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Relay’s AI learns continuously as you prompt reports, Meet briefs, and Gmail replies. Inspect, tune, or extend its memory and skills here.
        </p>
        <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
          {summary.activeMemoriesCount} active memories · {summary.enabledSkillsCount} enabled skills
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Global System Instructions */}
      <form onSubmit={handleSaveInstructions} className="liquid-surface rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-base font-semibold">Global AI Instructions</h2>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
          >
            {savedNotice ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {savedNotice ? 'Saved' : 'Save Instructions'}
          </button>
        </div>
        <label htmlFor="ai-system-instructions" className="sr-only">Global AI System Instructions</label>
        <textarea
          id="ai-system-instructions"
          rows={4}
          value={sysDraft}
          onChange={(e) => setSysDraft(e.target.value)}
          placeholder="Define tone, KPI definitions, currency format, or executive reporting style injected into every Gemini 4 Flash prompt..."
          className="w-full rounded-xl p-4 text-sm outline-none focus-visible:ring-2"
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
        />
      </form>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Adaptive Memory Bank */}
        <section className="liquid-surface rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-base font-semibold">Adaptive Memory Bank</h2>
            </div>
            <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
              {memories.length} items
            </span>
          </div>

          <form onSubmit={handleMemorySubmit} className="flex gap-2">
            <label htmlFor="add-memory-input" className="sr-only">Add manual memory entry</label>
            <input
              id="add-memory-input"
              type="text"
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              placeholder="Teach the AI a durable preference or business fact..."
              className="flex-1 rounded-xl px-3.5 py-2.5 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>

          {memories.length === 0 ? (
            <div className="rounded-xl p-6 text-center text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              No memories stored yet. Use AI Dashboards, Meet Briefs, or Gmail Smart Reply—or add a preference above—and QUASAR-9 CRM will retain it automatically.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {memories.map((mem) => (
                <div
                  key={mem.id}
                  className="flex items-start justify-between gap-3 rounded-xl p-3.5"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs leading-relaxed ${mem.active ? '' : 'line-through opacity-60'}`}>
                      {mem.content}
                    </p>
                    <div className="mt-1 text-[11px] font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      {mem.source === 'auto' ? 'Auto-learned' : 'Manual'} · {formatTimestamp(mem.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleMemory(mem)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                        mem.active ? 'liquid-glass-active' : 'liquid-surface'
                      }`}
                    >
                      {mem.active ? 'Active' : 'Muted'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(mem)}
                      aria-label={`Delete memory ${mem.content.slice(0, 24)}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Modular AI Skills */}
        <section className="liquid-surface rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Custom AI Skills</h2>
            <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
              {skills.length} skills
            </span>
          </div>

          <form onSubmit={handleSkillSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="Skill name (e.g., Enterprise Deal Audit)"
                className="rounded-xl px-3.5 py-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <input
                type="text"
                value={skillDomain}
                onChange={(e) => setSkillDomain(e.target.value)}
                placeholder="Domain (e.g., Sales, Finance, Gmail)"
                className="rounded-xl px-3.5 py-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
            <textarea
              rows={2}
              value={skillInstructions}
              onChange={(e) => setSkillInstructions(e.target.value)}
              placeholder="Instruction rules for this skill..."
              className="w-full rounded-xl p-3 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Skill
              </button>
            </div>
          </form>

          {skills.length === 0 ? (
            <div className="rounded-xl p-6 text-center text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              Create modular skills (like CFO Forecast Lens, Cold Email Tightener, or Renewal Risk Playbook) to steer Gemini across every workspace tab.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="rounded-xl p-3.5 space-y-2"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold">{skill.name}</span>
                      <span className="ml-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        · {skill.domain}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleSkill(skill)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                          skill.enabled ? 'liquid-glass-active' : 'liquid-surface'
                        }`}
                      >
                        {skill.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSkill(skill)}
                        aria-label={`Delete skill ${skill.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {skill.instructions}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
