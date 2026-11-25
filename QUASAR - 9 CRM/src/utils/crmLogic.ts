import type {
  AiMemoryItem,
  AiSkillItem,
  AuditCategory,
  AuditLogEntry,
  Contact,
  Deal,
  DealStage,
  FeedPost,
  TaskItem,
} from '../types/crm';

export const DEAL_STAGES: Array<{ id: DealStage; label: string; defaultProbability: number }> = [
  { id: 'lead', label: 'Lead', defaultProbability: 15 },
  { id: 'qualified', label: 'Qualified', defaultProbability: 35 },
  { id: 'proposal', label: 'Proposal', defaultProbability: 60 },
  { id: 'negotiation', label: 'Negotiation', defaultProbability: 80 },
  { id: 'closed_won', label: 'Closed Won', defaultProbability: 100 },
  { id: 'closed_lost', label: 'Closed Lost', defaultProbability: 0 },
];

export interface PipelineMetrics {
  totalDeals: number;
  openDeals: number;
  totalPipelineValue: number;
  weightedPipelineValue: number;
  closedWonValue: number;
  winRatePercent: number;
  staleDealsCount: number;
  byStage: Array<{ stage: DealStage; label: string; count: number; value: number }>;
}

/**
 * Computes live CRM pipeline KPIs, weighted forecasts, and stale-deal rot detection (>7 days).
 */
export function calculatePipelineMetrics(
  deals: Deal[],
  nowMs: number = Date.now()
): PipelineMetrics {
  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
  let totalPipelineValue = 0;
  let weightedPipelineValue = 0;
  let closedWonValue = 0;
  let closedWonCount = 0;
  let closedLostCount = 0;
  let openDeals = 0;
  let staleDealsCount = 0;

  const stageMap = new Map<DealStage, { count: number; value: number }>();
  for (const s of DEAL_STAGES) {
    stageMap.set(s.id, { count: 0, value: 0 });
  }

  for (const deal of deals) {
    const bucket = stageMap.get(deal.stage);
    if (bucket) {
      bucket.count += 1;
      bucket.value += deal.value;
    }

    if (deal.stage === 'closed_won') {
      closedWonValue += deal.value;
      closedWonCount += 1;
    } else if (deal.stage === 'closed_lost') {
      closedLostCount += 1;
    } else {
      openDeals += 1;
      totalPipelineValue += deal.value;
      weightedPipelineValue += deal.value * (Math.min(100, Math.max(0, deal.probability)) / 100);
      const updatedMs = Date.parse(deal.updatedAt);
      if (!Number.isNaN(updatedMs) && nowMs - updatedMs > STALE_THRESHOLD_MS) {
        staleDealsCount += 1;
      }
    }
  }

  const decided = closedWonCount + closedLostCount;
  const winRatePercent = decided > 0 ? Math.round((closedWonCount / decided) * 100) : 0;

  return {
    totalDeals: deals.length,
    openDeals,
    totalPipelineValue: Math.round(totalPipelineValue),
    weightedPipelineValue: Math.round(weightedPipelineValue),
    closedWonValue: Math.round(closedWonValue),
    winRatePercent,
    staleDealsCount,
    byStage: DEAL_STAGES.map((s) => ({
      stage: s.id,
      label: s.label,
      count: stageMap.get(s.id)?.count ?? 0,
      value: Math.round(stageMap.get(s.id)?.value ?? 0),
    })),
  };
}

/**
 * Solves one of the top enterprise CRM issues: duplicate contact creation.
 * Detects duplicates by normalized email or exact normalized name + company match.
 */
export function detectDuplicateContact(
  contacts: Contact[],
  candidate: { name: string; company: string; contactEmail: string }
): Contact | null {
  const normEmail = candidate.contactEmail.trim().toLowerCase();
  const normName = candidate.name.trim().toLowerCase();
  const normCompany = candidate.company.trim().toLowerCase();

  for (const c of contacts) {
    if (normEmail && c.contactEmail.trim().toLowerCase() === normEmail) {
      return c;
    }
    if (
      normName &&
      normCompany &&
      c.name.trim().toLowerCase() === normName &&
      c.company.trim().toLowerCase() === normCompany
    ) {
      return c;
    }
  }
  return null;
}

/**
 * Normalizes a company name by stripping legal suffixes (Inc, LLC, Corp, Ltd, Pvt, Co)
 * and punctuation for accurate corporate account deduplication.
 */
export function normalizeCompanyName(company: string): string {
  return String(company || '')
    .toLowerCase()
    .replace(/[.,&/-]/g, ' ')
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|pvt|gmbh|plc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DuplicateContactCluster {
  key: string;
  reason: string;
  contacts: Contact[];
}

/**
 * Finds fuzzy duplicate contact clusters by:
 * 1. Matching normalized email address, OR
 * 2. Matching normalized name + normalized company (ignoring Inc/LLC/Ltd suffixes).
 */
export function findFuzzyDuplicateClusters(contacts: Contact[]): DuplicateContactCluster[] {
  const emailGroups = new Map<string, Contact[]>();
  const nameCoGroups = new Map<string, Contact[]>();

  for (const c of contacts) {
    const email = c.contactEmail.trim().toLowerCase();
    if (email) {
      const list = emailGroups.get(email) || [];
      list.push(c);
      emailGroups.set(email, list);
    }
    const normName = c.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const normCo = normalizeCompanyName(c.company);
    if (normName && normCo) {
      const k = `${normName}::${normCo}`;
      const list = nameCoGroups.get(k) || [];
      list.push(c);
      nameCoGroups.set(k, list);
    }
  }

  const seenIds = new Set<string>();
  const clusters: DuplicateContactCluster[] = [];

  for (const [email, list] of emailGroups.entries()) {
    if (list.length > 1) {
      clusters.push({
        key: `email:${email}`,
        reason: `Identical email (${email})`,
        contacts: list,
      });
      list.forEach((c) => seenIds.add(c.id));
    }
  }

  for (const [k, list] of nameCoGroups.entries()) {
    const remaining = list.filter((c) => !seenIds.has(c.id));
    if (remaining.length > 1) {
      clusters.push({
        key: `nameco:${k}`,
        reason: `Matching contact & normalized company`,
        contacts: remaining,
      });
      remaining.forEach((c) => seenIds.add(c.id));
    }
  }

  return clusters;
}

export interface ForecastRealityResult {
  repWeightedForecast: number;
  aiAdjustedForecast: number;
  simulatedForecast: number;
  sandbagOrOptimismGap: number;
  staleExposureValue: number;
}

/**
 * Compares Rep-Submitted Weighted Forecast vs. AI-Adjusted Reality Forecast
 * (discounting stale deals >7d and supporting interactive What-If win-rate simulations).
 */
export function calculateForecastReality(
  deals: Deal[],
  options: {
    winRateLiftPct?: number;
    stalePenaltyPct?: number;
    nowMs?: number;
  } = {}
): ForecastRealityResult {
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = options.nowMs ?? Date.now();
  const winRateLiftPct = options.winRateLiftPct ?? 0;
  const stalePenaltyPct = options.stalePenaltyPct ?? 35;

  let repWeighted = 0;
  let aiAdjusted = 0;
  let simulated = 0;
  let staleExposure = 0;

  for (const d of deals) {
    if (d.stage === 'closed_won' || d.stage === 'closed_lost') continue;
    const baseProb = Math.min(100, Math.max(0, d.probability)) / 100;
    const updatedMs = Date.parse(d.updatedAt);
    const isStale = !Number.isNaN(updatedMs) && nowMs - updatedMs > STALE_MS;

    repWeighted += d.value * baseProb;

    const penaltyFactor = isStale ? 1 - Math.min(90, Math.max(0, stalePenaltyPct)) / 100 : 1;
    if (isStale) {
      staleExposure += d.value;
    }

    const aiProb = Math.min(1, Math.max(0, baseProb * penaltyFactor));
    aiAdjusted += d.value * aiProb;

    const liftedProb = Math.min(1, Math.max(0, aiProb * (1 + winRateLiftPct / 100)));
    simulated += d.value * liftedProb;
  }

  const repRounded = Math.round(repWeighted);
  const aiRounded = Math.round(aiAdjusted);
  const simRounded = Math.round(simulated);

  return {
    repWeightedForecast: repRounded,
    aiAdjustedForecast: aiRounded,
    simulatedForecast: simRounded,
    sandbagOrOptimismGap: repRounded - aiRounded,
    staleExposureValue: Math.round(staleExposure),
  };
}

/**
 * Lightweight RFC-4180 compliant CSV parser for zero-cost bulk contact/deal import.
 */
export function parseCsvRows(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const input = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!input) return { headers: [], rows: [] };

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((v) => v !== '')) matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((v) => v !== '')) matrix.push(row);

  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0].map((h, idx) => h || `Column_${idx + 1}`);
  const rows = matrix.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

/**
 * Sorts Instagram-style feed posts strictly chronologically (newest first).
 */
export function sortFeedChronologically(posts: FeedPost[]): FeedPost[] {
  return [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export interface DayFeedGroup {
  dayKey: string;
  label: string;
  posts: FeedPost[];
}

export function groupFeedByDay(posts: FeedPost[], now: Date = new Date()): DayFeedGroup[] {
  const sorted = sortFeedChronologically(posts);
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const map = new Map<string, FeedPost[]>();
  for (const post of sorted) {
    const key = (post.createdAt || new Date().toISOString()).slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(post);
    map.set(key, list);
  }

  return Array.from(map.entries()).map(([dayKey, dayPosts]) => {
    let label = dayKey;
    if (dayKey === todayKey) {
      label = 'Today';
    } else if (dayKey === yesterday) {
      label = 'Yesterday';
    } else {
      const parsed = new Date(`${dayKey}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        label = parsed.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        });
      }
    }
    return { dayKey, label, posts: dayPosts };
  });
}

export function filterAuditLogs(
  logs: AuditLogEntry[],
  category: AuditCategory | 'all',
  query: string
): AuditLogEntry[] {
  const q = query.trim().toLowerCase();
  return [...logs]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false;
      if (!q) return true;
      return (
        entry.actorName.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.target.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q)
      );
    });
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportAuditLogsToCsv(logs: AuditLogEntry[]): string {
  const headers = ['Timestamp', 'Actor', 'Category', 'Action', 'Target', 'Details'];
  const rows = logs.map((l) => [
    l.createdAt,
    l.actorName,
    l.category,
    l.action,
    l.target,
    l.details,
  ]);
  return [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

export function composeAiSystemContext(
  systemInstructions: string,
  skills: AiSkillItem[],
  memories: AiMemoryItem[]
): {
  enabledSkillsCount: number;
  activeMemoriesCount: number;
  preview: string;
} {
  const enabledSkills = skills.filter((s) => s.enabled);
  const activeMemories = memories.filter((m) => m.active);
  const sections: string[] = [];

  if (systemInstructions.trim()) {
    sections.push(`Global Instructions: ${systemInstructions.trim()}`);
  }
  if (enabledSkills.length > 0) {
    sections.push(
      `Skills (${enabledSkills.length}): ${enabledSkills.map((s) => s.name).join(', ')}`
    );
  }
  if (activeMemories.length > 0) {
    sections.push(
      `Memories (${activeMemories.length}): ${activeMemories.map((m) => m.content).join(' | ')}`
    );
  }

  return {
    enabledSkillsCount: enabledSkills.length,
    activeMemoriesCount: activeMemories.length,
    preview: sections.join('\n'),
  };
}

/**
 * Defensive payload sanitization matching firebase-blueprint.json boundaries.
 */
export function sanitizeBounded(input: string, maxLength: number): string {
  return String(input ?? '').trim().slice(0, maxLength);
}

/**
 * Builds an RFC 2822 raw MIME message encoded in URL-safe Base64 for Gmail API users.messages.send.
 */
export function buildRawMimeEmail(params: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}): string {
  const lines = [
    `To: ${params.to.trim()}`,
    `Subject: ${params.subject.trim()}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`);
    lines.push(`References: ${params.inReplyTo}`);
  }
  lines.push('', params.body);
  const raw = lines.join('\r\n');

  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(raw, 'utf-8').toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes Gmail API Base64URL payloads into UTF-8 text safely.
 */
export function decodeBase64Url(data: string): string {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export function summarizeWorkspaceForAi(
  contacts: Contact[],
  deals: Deal[],
  tasks: TaskItem[]
) {
  const metrics = calculatePipelineMetrics(deals);
  const taskCounts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    working: tasks.filter((t) => t.status === 'working').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };
  return {
    contactsCount: contacts.length,
    dealsCount: deals.length,
    pipeline: metrics,
    tasks: taskCounts,
    recentDeals: deals.slice(0, 12).map((d) => ({
      title: d.title,
      company: d.company,
      value: d.value,
      probability: d.probability,
      stage: d.stage,
      linkedDocsCount: d.linkedDocs?.length || 0,
    })),
    recentContacts: contacts.slice(0, 12).map((c) => ({
      name: c.name,
      company: c.company,
      buyingRole: c.buyingRole || 'unspecified',
      lifecycleStage: c.lifecycleStage,
    })),
    recentTasks: tasks.slice(0, 12).map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Validates and normalizes a pasted Google Meet URL or raw room code (e.g., "abc-defg-hij")
 * into a safe https://meet.google.com/<code> URI.
 */
export function normalizeGoogleMeetUrl(raw: string): { uri: string; code: string } | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // Case 1: bare 3-4-3 meeting code like "abc-defg-hij"
  const rawCodeMatch = trimmed.match(/^([a-z]{3}-[a-z]{4}-[a-z]{3})$/i);
  if (rawCodeMatch) {
    const code = rawCodeMatch[1].toLowerCase();
    return { uri: `https://meet.google.com/${code}`, code };
  }

  // Case 2: URL with or without https:// protocol
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.hostname.toLowerCase() !== 'meet.google.com') return null;
    const pathSegment = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathSegment || pathSegment.length < 3 || /[^a-zA-Z0-9_-]/.test(pathSegment)) return null;
    return {
      uri: `https://meet.google.com/${pathSegment}`,
      code: pathSegment,
    };
  } catch {
    return null;
  }
}

