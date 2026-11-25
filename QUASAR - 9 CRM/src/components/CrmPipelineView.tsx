import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  GitMerge,
  Kanban,
  Loader2,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type {
  AiMemoryItem,
  AiSkillItem,
  BuyingRole,
  Contact,
  Deal,
  DealAiAudit,
  DealStage,
  HandoffDossier,
  LifecycleStage,
  TaskItem,
  TaskPriority,
  WorkflowRule,
} from '../types/crm';
import {
  calculatePipelineMetrics,
  DEAL_STAGES,
  detectDuplicateContact,
  findFuzzyDuplicateClusters,
  formatCurrency,
  formatTimestamp,
  parseCsvRows,
} from '../utils/crmLogic';

interface CrmPipelineViewProps {
  contacts: Contact[];
  deals: Deal[];
  tasks: TaskItem[];
  handoffDossiers: HandoffDossier[];
  workflows: WorkflowRule[];
  memories: AiMemoryItem[];
  skills: AiSkillItem[];
  systemInstructions: string;
  onQuickCapture: (payload: {
    contactName: string;
    company: string;
    contactEmail: string;
    phone: string;
    lifecycleStage: LifecycleStage;
    buyingRole?: BuyingRole;
    dealTitle: string;
    dealValue: number;
    dealStage: DealStage;
    expectedCloseDate: string;
    followUpTaskTitle: string;
  }) => Promise<void>;
  onUpdateDealStage: (deal: Deal, stage: DealStage) => Promise<void>;
  onDeleteDeal: (deal: Deal) => Promise<void>;
  onDeleteContact: (contact: Contact) => Promise<void>;
  onMergeDuplicateContacts: (keep: Contact, duplicates: Contact[]) => Promise<void>;
  onSaveHandoffDossier: (dossier: Omit<HandoffDossier, 'id' | 'ownerId' | 'visibility' | 'createdAt'>) => Promise<HandoffDossier>;
  onSpawnOnboardingTasks: (
    dealTitle: string,
    tasksToCreate: Array<{ title: string; priority: TaskPriority; ownerRole: string }>
  ) => Promise<void>;
  onToggleWorkflow: (id: string) => void;
  onEmailContact: (email: string, name: string) => void;
  onLogAction: (action: string, target: string, details: string) => void;
}

const BUYING_ROLES: Array<{ id: BuyingRole; label: string }> = [
  { id: 'unspecified', label: 'Role Unspecified' },
  { id: 'champion', label: 'Champion' },
  { id: 'economic_buyer', label: 'Economic Buyer' },
  { id: 'technical_evaluator', label: 'Technical Evaluator' },
  { id: 'influencer', label: 'Influencer' },
  { id: 'blocker', label: 'Blocker' },
];

export const CrmPipelineView: React.FC<CrmPipelineViewProps> = ({
  contacts,
  deals,
  tasks,
  handoffDossiers,
  workflows,
  memories,
  skills,
  systemInstructions,
  onQuickCapture,
  onUpdateDealStage,
  onDeleteDeal,
  onDeleteContact,
  onMergeDuplicateContacts,
  onSaveHandoffDossier,
  onSpawnOnboardingTasks,
  onToggleWorkflow,
  onEmailContact,
  onLogAction,
}) => {
  const [subView, setSubView] = useState<'kanban' | 'table' | 'contacts' | 'hygiene' | 'handoffs' | 'workflows'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCapture, setShowCapture] = useState(false);

  // Quick Capture fields
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [lifecycleStage, setLifecycleStage] = useState<LifecycleStage>('sql');
  const [buyingRole, setBuyingRole] = useState<BuyingRole>('champion');
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [dealStage, setDealStage] = useState<DealStage>('qualified');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [followUpTaskTitle, setFollowUpTaskTitle] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // AI Deal Risk & MEDDPICC Auditor
  const [auditingDealId, setAuditingDealId] = useState<string | null>(null);
  const [activeAudit, setActiveAudit] = useState<DealAiAudit | null>(null);
  const [auditError, setAuditError] = useState('');

  // Closed-Won Handoff Dossier generator
  const [generatingHandoffId, setGeneratingHandoffId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState('');

  // AI-Mapped Bulk CSV Import state
  const [csvRaw, setCsvRaw] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string> | null>(null);
  const [mappingCsv, setMappingCsv] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);

  const metrics = useMemo(() => calculatePipelineMetrics(deals), [deals]);
  const fuzzyClusters = useMemo(() => findFuzzyDuplicateClusters(contacts), [contacts]);

  const duplicateWarning = useMemo(() => {
    if (!contactName.trim() && !contactEmail.trim()) return null;
    return detectDuplicateContact(contacts, { name: contactName, company, contactEmail });
  }, [contacts, contactName, company, contactEmail]);

  const filteredDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        d.contactName.toLowerCase().includes(q)
    );
  }, [deals, searchQuery]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.contactEmail.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() && !dealTitle.trim()) {
      setFormError('Enter at least a Contact Name or a Deal Title.');
      return;
    }
    if (dealTitle.trim() && !company.trim()) {
      setFormError('Company name is required when creating a deal.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      await onQuickCapture({
        contactName: contactName.trim(),
        company: company.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim(),
        lifecycleStage,
        buyingRole,
        dealTitle: dealTitle.trim(),
        dealValue: Number(dealValue) || 0,
        dealStage,
        expectedCloseDate: expectedCloseDate.trim(),
        followUpTaskTitle: followUpTaskTitle.trim(),
      });
      setContactName('');
      setCompany('');
      setContactEmail('');
      setPhone('');
      setDealTitle('');
      setDealValue('');
      setExpectedCloseDate('');
      setFollowUpTaskTitle('');
      setShowCapture(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunDealAudit = async (deal: Deal) => {
    setAuditingDealId(deal.id);
    setAuditError('');
    try {
      const relatedContacts = contacts.filter(
        (c) => c.company.toLowerCase() === deal.company.toLowerCase()
      );
      const relatedTasks = tasks.filter(
        (t) => t.relatedDealTitle.toLowerCase() === deal.title.toLowerCase()
      );
      const res = await fetch('/api/ai/audit-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal,
          relatedContacts,
          relatedTasks,
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
      if (!res.ok) throw new Error(data.error || 'AI Deal Audit failed.');
      setActiveAudit(data.audit);
      onLogAction('Ran AI MEDDPICC Deal Audit', deal.title, `Health: ${data.audit.healthScore}/100 · Risk: ${data.audit.riskLevel}`);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Unable to audit deal.');
    } finally {
      setAuditingDealId(null);
    }
  };

  const handleGenerateHandoff = async (deal: Deal) => {
    setGeneratingHandoffId(deal.id);
    setAuditError('');
    try {
      const relatedContacts = contacts.filter(
        (c) => c.company.toLowerCase() === deal.company.toLowerCase()
      );
      const relatedTasks = tasks.filter(
        (t) => t.relatedDealTitle.toLowerCase() === deal.title.toLowerCase()
      );
      const res = await fetch('/api/ai/handoff-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal,
          relatedContacts,
          relatedTasks,
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
      if (!res.ok) throw new Error(data.error || 'Handoff dossier generation failed.');
      await onSaveHandoffDossier({
        dealId: deal.id,
        dealTitle: deal.title,
        company: deal.company,
        dealValue: deal.value,
        executiveSummary: data.dossier.executiveSummary,
        stakeholders: data.dossier.stakeholders || [],
        promisedDeliverables: data.dossier.promisedDeliverables || [],
        implementationRisks: data.dossier.implementationRisks || [],
        onboardingTasks: data.dossier.onboardingTasks || [],
      });
      setStatusBanner(`Compiled Sales-to-Onboarding Handoff Dossier for "${deal.title}".`);
      setSubView('handoffs');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Unable to generate Handoff Dossier.');
    } finally {
      setGeneratingHandoffId(null);
    }
  };

  const handleParseCsv = async (text: string) => {
    setCsvRaw(text);
    const parsed = parseCsvRows(text);
    setCsvHeaders(parsed.headers);
    setCsvRows(parsed.rows);
    setCsvMapping(null);
    if (parsed.headers.length === 0) return;

    setMappingCsv(true);
    setAuditError('');
    try {
      const res = await fetch('/api/ai/map-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: parsed.headers, sampleRows: parsed.rows.slice(0, 3) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI column mapping failed.');
      setCsvMapping(data.mapping);
    } catch {
      // Deterministic heuristic fallback if AI rate-limited
      const findCol = (patterns: RegExp) => parsed.headers.find((h) => patterns.test(h)) || '';
      setCsvMapping({
        contactName: findCol(/name|contact|person/i),
        company: findCol(/company|account|org/i),
        contactEmail: findCol(/email|mail/i),
        phone: findCol(/phone|tel|mobile/i),
        dealTitle: findCol(/deal|opp|title/i),
        dealValue: findCol(/value|amount|size|arr|revenue/i),
        dealStage: findCol(/stage|status/i),
        notes: findCol(/note|comment/i),
      });
    } finally {
      setMappingCsv(false);
    }
  };

  const handleImportMappedCsv = async () => {
    if (!csvMapping || csvRows.length === 0) return;
    setImportingCsv(true);
    let importedCount = 0;
    try {
      for (const row of csvRows.slice(0, 50)) {
        const get = (k: string) => {
          const colName = csvMapping[k] || '';
          return colName ? (row[colName] || '').trim() : '';
        };
        const name = get('contactName');
        const comp = get('company');
        const email = get('contactEmail');
        const title = get('dealTitle');
        const val = Number(get('dealValue').replace(/[^0-9.]/g, '')) || 0;
        if (!name && !title) continue;
        await onQuickCapture({
          contactName: name,
          company: comp || 'Imported Account',
          contactEmail: email,
          phone: get('phone'),
          lifecycleStage: 'lead',
          buyingRole: 'unspecified',
          dealTitle: title,
          dealValue: val,
          dealStage: 'qualified',
          expectedCloseDate: '',
          followUpTaskTitle: '',
        });
        importedCount++;
      }
      setStatusBanner(`Imported ${importedCount} clean CRM record(s) from CSV with automatic duplicate protection.`);
      setCsvRaw('');
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvMapping(null);
      onLogAction('Imported CSV Records', `${importedCount} rows`, 'AI-Mapped Bulk Import');
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Quick Capture, AI MEDDPICC Risk Auditor, Closed-Won Handoff Dossiers, Fuzzy Deduplication & AI CSV Import.
        </p>
        <button
          type="button"
          onClick={() => setShowCapture((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          <Plus className="h-4 w-4" />
          {showCapture ? 'Close Quick Capture' : 'Quick Capture Deal & Contact'}
        </button>
      </div>

      {statusBanner && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-4 py-2.5 text-xs text-emerald-500">
          {statusBanner}
        </div>
      )}
      {auditError && (
        <div className="rounded-xl border border-red-500/35 bg-red-500/12 px-4 py-2.5 text-xs text-red-400">
          {auditError}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="liquid-surface rounded-2xl p-4">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Open Pipeline</div>
          <div className="mt-1 text-2xl font-bold font-mono-tabular">{formatCurrency(metrics.totalPipelineValue)}</div>
          <div className="mt-1 text-xs font-mono-tabular" style={{ color: 'var(--text-secondary)' }}>{metrics.openDeals} active opportunities</div>
        </div>
        <div className="liquid-surface rounded-2xl p-4">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Weighted Forecast</div>
          <div className="mt-1 text-2xl font-bold font-mono-tabular">{formatCurrency(metrics.weightedPipelineValue)}</div>
          <div className="mt-1 text-xs font-mono-tabular" style={{ color: 'var(--text-secondary)' }}>{metrics.winRatePercent}% historical win rate</div>
        </div>
        <div className="liquid-surface rounded-2xl p-4">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Data Hygiene Radar</div>
          <div className="mt-1 text-2xl font-bold font-mono-tabular">{fuzzyClusters.length}</div>
          <div className="mt-1 text-xs" style={{ color: fuzzyClusters.length > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
            {fuzzyClusters.length > 0 ? 'Fuzzy duplicate cluster(s) found' : `${contacts.length} clean contacts`}
          </div>
        </div>
        <div className="liquid-surface rounded-2xl p-4">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Deal Rot Monitor</div>
          <div className="mt-1 text-2xl font-bold font-mono-tabular">{metrics.staleDealsCount}</div>
          <div className="mt-1 text-xs" style={{ color: metrics.staleDealsCount > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
            {metrics.staleDealsCount > 0 ? 'Inactive > 7 days — follow up' : 'All open deals active'}
          </div>
        </div>
      </div>

      {/* Unified Quick Capture Panel */}
      {showCapture && (
        <form onSubmit={handleCaptureSubmit} className="liquid-elevated rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold">Single-Pass Quick Capture</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Create a Contact (with Buying Committee Role), Deal, and Next Action Task simultaneously.
            </p>
          </div>

          {duplicateWarning && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Duplicate guard: “{duplicateWarning.name}” ({duplicateWarning.company || duplicateWarning.contactEmail}) already exists. Submitting will skip duplicate contact creation and link only your deal/task.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="qc-contact-name" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Contact Name
              </label>
              <input
                id="qc-contact-name"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g., Jordan Patel"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-company" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Company / Account
              </label>
              <input
                id="qc-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g., Northstar Logistics"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-email" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Contact Email
              </label>
              <input
                id="qc-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-deal-title" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Deal Title
              </label>
              <input
                id="qc-deal-title"
                type="text"
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
                placeholder="e.g., Annual Platform License"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-deal-value" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Deal Value (USD)
              </label>
              <input
                id="qc-deal-value"
                type="number"
                min={0}
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="25000"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-tabular outline-none focus-visible:ring-2"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-deal-stage" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Pipeline Stage
              </label>
              <select
                id="qc-deal-stage"
                value={dealStage}
                onChange={(e) => setDealStage(e.target.value as DealStage)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.defaultProbability}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-role" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Buying Committee Role
              </label>
              <select
                id="qc-role"
                value={buyingRole}
                onChange={(e) => setBuyingRole(e.target.value as BuyingRole)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              >
                {BUYING_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-close-date" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Expected Close Date
              </label>
              <input
                id="qc-close-date"
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qc-task" className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Auto-Create Next Task (Optional)
              </label>
              <input
                id="qc-task"
                type="text"
                value={followUpTaskTitle}
                onChange={(e) => setFollowUpTaskTitle(e.target.value)}
                placeholder="e.g., Send security questionnaire"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
          </div>

          {formError && <p className="text-xs text-red-500">{formError}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCapture(false)}
              className="rounded-xl px-4 py-2 text-xs font-medium liquid-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              {submitting ? 'Saving...' : 'Save CRM Record'}
            </button>
          </div>
        </form>
      )}

      {/* Sub-navigation + Live Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="CRM view selector">
          {(
            [
              { id: 'kanban', label: 'Pipeline Board', icon: Kanban },
              { id: 'table', label: 'Deals Table', icon: TableIcon },
              { id: 'contacts', label: `Contacts (${contacts.length})`, icon: Users },
              { id: 'hygiene', label: `Hygiene & CSV (${fuzzyClusters.length})`, icon: FileSpreadsheet },
              { id: 'handoffs', label: `Handoff Dossiers (${handoffDossiers.length})`, icon: FileCheck2 },
              { id: 'workflows', label: 'Automations', icon: Workflow },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubView(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-all ${
                  active ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <label htmlFor="crm-search" className="sr-only">Search deals or contacts</label>
          <input
            id="crm-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deals, companies..."
            className="w-full rounded-xl py-2 pr-3 pl-9 text-xs outline-none"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
          />
        </div>
      </div>

      {/* Subview 1: Kanban Board with AI Deal Risk Audit + Handoff Trigger + Linked Drive Docs */}
      {subView === 'kanban' && (
        filteredDeals.length === 0 ? (
          <div className="liquid-surface rounded-2xl p-12 text-center">
            <Building2 className="mx-auto mb-3 h-9 w-9" style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-lg font-semibold">No deals in pipeline yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
              Zero fictional CRM accounts are preloaded. Use Quick Capture or AI CSV Import to bring in live opportunities.
            </p>
            <button
              type="button"
              onClick={() => setShowCapture(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              <Plus className="h-4 w-4" />
              Create First Deal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {DEAL_STAGES.map((stage) => {
              const stageDeals = filteredDeals.filter((d) => d.stage === stage.id);
              const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);
              return (
                <div key={stage.id} className="liquid-surface flex flex-col rounded-2xl p-4">
                  <div className="mb-3 flex items-center justify-between pb-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="text-sm font-semibold">{stage.label}</span>
                    <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      {stageDeals.length} · {formatCurrency(stageTotal)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {stageDeals.length === 0 ? (
                      <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                        No deals in {stage.label}
                      </div>
                    ) : (
                      stageDeals.map((deal) => {
                        const isClosed = deal.stage === 'closed_won' || deal.stage === 'closed_lost';
                        return (
                          <div
                            key={deal.id}
                            className="rounded-xl p-3.5 space-y-2.5"
                            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{deal.title}</div>
                                <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {deal.company}{deal.contactName ? ` · ${deal.contactName}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => onDeleteDeal(deal)}
                                aria-label={`Delete deal ${deal.title}`}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between text-xs font-mono-tabular">
                              <span className="font-semibold">{formatCurrency(deal.value)}</span>
                              <span style={{ color: 'var(--text-muted)' }}>{deal.probability}% prob</span>
                            </div>

                            {deal.linkedDocs && deal.linkedDocs.length > 0 && (
                              <div className="space-y-1 pt-1">
                                {deal.linkedDocs.map((doc) => (
                                  <a
                                    key={doc.id}
                                    href={doc.webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 truncate text-[11px] hover:underline"
                                    style={{ color: 'var(--accent)' }}
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{doc.name}</span>
                                  </a>
                                ))}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {!isClosed && (
                                <button
                                  type="button"
                                  onClick={() => void handleRunDealAudit(deal)}
                                  disabled={auditingDealId === deal.id}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium liquid-surface hover:opacity-90"
                                >
                                  {auditingDealId === deal.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <ShieldAlert className="h-3 w-3" style={{ color: 'var(--accent)' }} />
                                  )}
                                  AI MEDDPICC Audit
                                </button>
                              )}
                              {deal.stage === 'closed_won' && (
                                <button
                                  type="button"
                                  onClick={() => void handleGenerateHandoff(deal)}
                                  disabled={generatingHandoffId === deal.id}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold liquid-glass-active"
                                >
                                  {generatingHandoffId === deal.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FileCheck2 className="h-3 w-3" />
                                  )}
                                  Compile Handoff Brief
                                </button>
                              )}
                            </div>

                            {!isClosed && (
                              <div className="pt-1">
                                <label htmlFor={`stage-${deal.id}`} className="sr-only">
                                  Move stage for {deal.title}
                                </label>
                                <select
                                  id={`stage-${deal.id}`}
                                  value={deal.stage}
                                  onChange={(e) => onUpdateDealStage(deal, e.target.value as DealStage)}
                                  className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                                >
                                  {DEAL_STAGES.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      Move to {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Subview 2: Deals Table */}
      {subView === 'table' && (
        <div className="liquid-surface overflow-x-auto rounded-2xl">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 text-right font-medium">Weighted</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    No deals recorded yet.
                  </td>
                </tr>
              ) : (
                filteredDeals.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-white/5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3 font-medium">{d.title}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{d.company}</td>
                    <td className="px-4 py-3 text-xs capitalize">{d.stage.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(d.value)}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {formatCurrency(Math.round((d.value * d.probability) / 100))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatTimestamp(d.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Subview 3: Contacts Directory with Buying Committee Roles */}
      {subView === 'contacts' && (
        <div className="liquid-surface overflow-x-auto rounded-2xl">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Buying Role</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    No contacts yet. Add your first contact via Quick Capture or CSV Import.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-white/5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.company || '—'}</td>
                    <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--accent)' }}>
                      {(c.buyingRole || 'unspecified').replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs">{c.contactEmail || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {c.contactEmail && (
                          <button
                            type="button"
                            onClick={() => onEmailContact(c.contactEmail, c.name)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium liquid-surface hover:opacity-90"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Gmail
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteContact(c)}
                          aria-label={`Delete contact ${c.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Subview 4: AI Fuzzy Deduplication & AI-Mapped Bulk CSV Import ($0) */}
      {subView === 'hygiene' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Fuzzy Duplicate Merger */}
          <div className="liquid-surface rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-base font-semibold">Fuzzy Duplicate Contact Guardian</h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Catches company suffix variations (“Acme Inc.” vs “Acme Corporation”), matching phones, and duplicate emails with 1-click safe merge.
            </p>
            {fuzzyClusters.length === 0 ? (
              <div className="rounded-xl p-6 text-center text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                Zero duplicate clusters detected across {contacts.length} contacts.
              </div>
            ) : (
              <div className="space-y-3">
                {fuzzyClusters.map((cluster) => (
                  <div
                    key={cluster.key}
                    className="rounded-xl p-4 space-y-2.5 text-xs"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="font-semibold text-amber-500">{cluster.reason}</div>
                    <div className="space-y-1">
                      {cluster.contacts.map((c, idx) => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <span>
                            {idx === 0 ? 'Keep: ' : 'Merge: '}
                            <strong>{c.name}</strong> ({c.company || 'No company'} · {c.contactEmail || 'No email'})
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onMergeDuplicateContacts(cluster.contacts[0], cluster.contacts.slice(1))}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Merge Into Primary Contact
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI-Mapped Bulk CSV Importer */}
          <div className="liquid-surface rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-semibold">AI-Mapped Bulk CSV Importer</h2>
              </div>
              <label className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium liquid-surface hover:opacity-90">
                Upload .CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => void handleParseCsv(String(reader.result || ''));
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Upload or paste any Salesforce, HubSpot, or Google Sheets CSV. Gemini maps mismatched columns automatically before import.
            </p>
            <textarea
              rows={4}
              value={csvRaw}
              onChange={(e) => setCsvRaw(e.target.value)}
              placeholder="Paste CSV rows here (e.g., Full Name,Organization,Work Email,Deal Name,Amount)..."
              className="w-full rounded-xl p-3 font-mono-tabular text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={mappingCsv || !csvRaw.trim()}
                onClick={() => void handleParseCsv(csvRaw)}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium liquid-surface"
              >
                {mappingCsv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Auto-Map Columns with AI
              </button>
            </div>

            {csvMapping && (
              <div className="rounded-xl p-4 space-y-3 text-xs" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                <div className="font-semibold">
                  Detected {csvRows.length} row(s) — AI Column Mapping:
                </div>
                <div className="grid grid-cols-2 gap-1.5 font-mono-tabular">
                  {Object.entries(csvMapping).map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v || '—'}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={importingCsv}
                  onClick={() => void handleImportMappedCsv()}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  {importingCsv ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Import {csvRows.length} Record(s)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subview 5: Automated Sales-to-Onboarding Handoff Dossiers */}
      {subView === 'handoffs' && (
        <div className="space-y-4">
          {handoffDossiers.length === 0 ? (
            <div className="liquid-surface rounded-2xl p-10 text-center space-y-2">
              <FileCheck2 className="mx-auto h-8 w-8" style={{ color: 'var(--text-muted)' }} />
              <h2 className="text-base font-semibold">No Sales-to-Onboarding Handoff Dossiers yet</h2>
              <p className="mx-auto max-w-md text-xs" style={{ color: 'var(--text-secondary)' }}>
                Move any deal to Closed Won and click “Compile Handoff Brief” to eliminate post-sale context loss and spawn onboarding tasks automatically.
              </p>
            </div>
          ) : (
            handoffDossiers.map((dossier) => (
              <div key={dossier.id} className="liquid-surface rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{dossier.dealTitle} — {dossier.company}</h3>
                    <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      {formatCurrency(dossier.dealValue)} · Compiled {formatTimestamp(dossier.createdAt)}
                    </div>
                  </div>
                  {dossier.onboardingTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onSpawnOnboardingTasks(dossier.dealTitle, dossier.onboardingTasks);
                        setStatusBanner(`Spawned ${dossier.onboardingTasks.length} onboarding task(s) into Tasks & Team.`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Spawn {dossier.onboardingTasks.length} Onboarding Tasks
                    </button>
                  )}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {dossier.executiveSummary}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--bg-input)' }}>
                    <div className="font-semibold mb-1.5">Stakeholders</div>
                    {dossier.stakeholders.map((s, i) => <div key={i}>• {s}</div>)}
                  </div>
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--bg-input)' }}>
                    <div className="font-semibold mb-1.5">Promised Deliverables</div>
                    {dossier.promisedDeliverables.map((d, i) => <div key={i}>• {d}</div>)}
                  </div>
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--bg-input)' }}>
                    <div className="font-semibold mb-1.5">Implementation Risks</div>
                    {dossier.implementationRisks.map((r, i) => <div key={i}>• {r}</div>)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Subview 6: Zero-Code CRM Workflow Automations */}
      {subView === 'workflows' && (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="liquid-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Zap className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  {wf.name}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>When: {wf.trigger}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>Then: {wf.action}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleWorkflow(wf.id)}
                className={`rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap ${
                  wf.enabled ? 'liquid-glass-active' : 'liquid-surface'
                }`}
              >
                {wf.enabled ? 'Active' : 'Paused'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* AI MEDDPICC & Deal Risk Audit Modal */}
      {activeAudit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="AI MEDDPICC Deal Risk Audit"
        >
          <div className="liquid-elevated w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-mono-tabular uppercase" style={{ color: 'var(--accent)' }}>
                  AI MEDDPICC & Deal Risk Audit
                </div>
                <h3 className="mt-1 text-lg font-bold">
                  Health Score: {activeAudit.healthScore}/100 · Risk: {activeAudit.riskLevel.toUpperCase()}
                </h3>
                <p className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                  AI-Adjusted Close Probability: {activeAudit.aiAdjustedProbability}% ·{' '}
                  {activeAudit.singleThreadedRisk ? 'Single-Threaded Risk Detected' : 'Multi-Threaded Coverage'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAudit(null)}
                aria-label="Close deal audit"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              {Object.entries(activeAudit.meddpicc).map(([k, v]) => (
                <div key={k} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <div className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {k.replace(/([A-Z])/g, ' $1')}
                  </div>
                  <div className="mt-1" style={{ color: 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div>
                <div className="font-semibold mb-1.5 text-amber-500">Qualification Gaps</div>
                <ul className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  {activeAudit.gaps.map((g, i) => <li key={i}>• {g}</li>)}
                </ul>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-emerald-500">Next Best Actions</div>
                <ul className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  {activeAudit.nextBestActions.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
