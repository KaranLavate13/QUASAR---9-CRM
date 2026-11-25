import React, { useMemo, useState } from 'react';
import { Download, History, Search } from 'lucide-react';
import type { AuditCategory, AuditLogEntry } from '../types/crm';
import { exportAuditLogsToCsv, filterAuditLogs, formatTimestamp } from '../utils/crmLogic';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

const CATEGORIES: Array<{ id: AuditCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All Events' },
  { id: 'crm', label: 'CRM' },
  { id: 'meet', label: 'Meet' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'drive', label: 'Drive' },
  { id: 'task', label: 'Tasks' },
  { id: 'feed', label: 'Feed' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'ai', label: 'AI Studio' },
  { id: 'command', label: 'Command' },
  { id: 'message', label: 'Messages' },
  { id: 'profile', label: 'Profile' },
  { id: 'game', label: 'Mind Lab' },
  { id: 'theme', label: 'Appearance' },
  { id: 'auth', label: 'Auth' },
];

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [category, setCategory] = useState<AuditCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => filterAuditLogs(logs, category, query),
    [logs, category, query]
  );

  const handleExportCsv = () => {
    const csv = exportAuditLogsToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relay-crm-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Every user action across CRM deals, Google Meet, Calendar, Drive, tasks, Gmail, AI dashboards, and commands is recorded with exact timestamps.
        </p>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap liquid-surface hover:opacity-90 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV ({filtered.length})
        </button>
      </div>

      {/* Category Filter Buttons (80% transparent liquid glass when active) + Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Audit category filter">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                  active ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <label htmlFor="audit-search" className="sr-only">Search audit trail</label>
          <input
            id="audit-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by actor, action, target..."
            className="w-full rounded-xl py-2 pr-3 pl-9 text-xs outline-none"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
          />
        </div>
      </div>

      {/* High-density Tabular Audit Table */}
      <div className="liquid-surface overflow-x-auto rounded-2xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Timestamp</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <History className="mx-auto mb-2 h-7 w-7" style={{ color: 'var(--text-muted)' }} />
                  <div className="text-sm font-medium">No matching audit entries</div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Actions appear here automatically with timestamps as you interact with the CRM.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className="transition-colors hover:bg-white/5"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <td className="px-4 py-3 font-mono-tabular text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    {formatTimestamp(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{entry.actorName}</td>
                  <td className="px-4 py-3 text-xs capitalize whitespace-nowrap" style={{ color: 'var(--accent)' }}>
                    {entry.category}
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.action}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {entry.target || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {entry.details || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
