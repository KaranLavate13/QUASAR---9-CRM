import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRawMimeEmail,
  calculateForecastReality,
  calculatePipelineMetrics,
  composeAiSystemContext,
  decodeBase64Url,
  detectDuplicateContact,
  exportAuditLogsToCsv,
  filterAuditLogs,
  findFuzzyDuplicateClusters,
  groupFeedByDay,
  normalizeCompanyName,
  normalizeGoogleMeetUrl,
  parseCsvRows,
  sanitizeBounded,
  sortFeedChronologically,
} from './crmLogic';
import type { AuditLogEntry, Contact, Deal, FeedPost } from '../types/crm';

test('calculatePipelineMetrics computes weighted value, win rate, and stale deals accurately', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const deals: Deal[] = [
    {
      id: 'd1',
      ownerId: 'u1',
      title: 'Enterprise Suite',
      company: 'Acme',
      contactName: 'Pat',
      value: 100000,
      probability: 50,
      stage: 'proposal',
      expectedCloseDate: '2026-12-15',
      visibility: 'org',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z', // 10 days old -> stale
    },
    {
      id: 'd2',
      ownerId: 'u1',
      title: 'Expansion Pack',
      company: 'Beta',
      contactName: 'Sam',
      value: 40000,
      probability: 100,
      stage: 'closed_won',
      expectedCloseDate: '2026-11-18',
      visibility: 'org',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-18T00:00:00Z',
    },
    {
      id: 'd3',
      ownerId: 'u1',
      title: 'Pilot',
      company: 'Gamma',
      contactName: 'Lee',
      value: 20000,
      probability: 0,
      stage: 'closed_lost',
      expectedCloseDate: '2026-11-12',
      visibility: 'org',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-12T00:00:00Z',
    },
  ];

  const metrics = calculatePipelineMetrics(deals, now);
  assert.equal(metrics.totalDeals, 3);
  assert.equal(metrics.openDeals, 1);
  assert.equal(metrics.totalPipelineValue, 100000);
  assert.equal(metrics.weightedPipelineValue, 50000);
  assert.equal(metrics.closedWonValue, 40000);
  assert.equal(metrics.winRatePercent, 50);
  assert.equal(metrics.staleDealsCount, 1);
});

test('detectDuplicateContact catches matching email or name+company', () => {
  const existing: Contact[] = [
    {
      id: 'c1',
      ownerId: 'u1',
      name: 'Karan Lavate',
      company: 'Vetra Labs',
      contactEmail: 'karan@vetra.io',
      phone: '',
      lifecycleStage: 'sql',
      notes: '',
      visibility: 'org',
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
  ];

  assert.ok(
    detectDuplicateContact(existing, {
      name: 'Other Name',
      company: 'Other Co',
      contactEmail: ' KARAN@VETRA.IO ',
    })
  );
  assert.ok(
    detectDuplicateContact(existing, {
      name: 'karan lavate',
      company: 'vetra labs',
      contactEmail: '',
    })
  );
  assert.equal(
    detectDuplicateContact(existing, {
      name: 'Unique Person',
      company: 'Unique Co',
      contactEmail: 'unique@example.com',
    }),
    null
  );
});

test('sortFeedChronologically and groupFeedByDay preserve strict reverse-chronological order', () => {
  const posts: FeedPost[] = [
    {
      id: 'p1',
      ownerId: 'u1',
      authorName: 'User',
      authorPhotoUrl: '',
      postType: 'task_completion',
      caption: 'Earlier task',
      imageUrl: '',
      taskTitle: 'Task 1',
      likesCount: 0,
      visibility: 'org',
      createdAt: '2026-11-19T09:00:00Z',
      updatedAt: '2026-11-19T09:00:00Z',
    },
    {
      id: 'p2',
      ownerId: 'u1',
      authorName: 'User',
      authorPhotoUrl: '',
      postType: 'task_completion',
      caption: 'Latest task',
      imageUrl: '',
      taskTitle: 'Task 2',
      likesCount: 2,
      visibility: 'org',
      createdAt: '2026-11-20T15:00:00Z',
      updatedAt: '2026-11-20T15:00:00Z',
    },
  ];

  const sorted = sortFeedChronologically(posts);
  assert.equal(sorted[0].id, 'p2');
  assert.equal(sorted[1].id, 'p1');

  const grouped = groupFeedByDay(posts, new Date('2026-11-20T18:00:00Z'));
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].label, 'Today');
  assert.equal(grouped[1].label, 'Yesterday');
});

test('filterAuditLogs and exportAuditLogsToCsv filter and escape commas cleanly', () => {
  const logs: AuditLogEntry[] = [
    {
      id: 'a1',
      ownerId: 'u1',
      actorName: 'Alice',
      category: 'crm',
      action: 'Created Deal',
      target: 'Acme, Inc.',
      details: 'Value $50,000',
      visibility: 'org',
      createdAt: '2026-11-20T10:00:00Z',
    },
    {
      id: 'a2',
      ownerId: 'u1',
      actorName: 'Alice',
      category: 'gmail',
      action: 'Sent Reply',
      target: 'Re: Contract',
      details: 'Confirmed terms',
      visibility: 'org',
      createdAt: '2026-11-20T11:00:00Z',
    },
  ];

  const filtered = filterAuditLogs(logs, 'crm', 'acme');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'a1');

  const csv = exportAuditLogsToCsv(filtered);
  assert.ok(csv.includes('"Acme, Inc."'));
  assert.ok(csv.includes('"Value $50,000"'));
});

test('buildRawMimeEmail and decodeBase64Url round-trip Gmail RFC 2822 payloads', () => {
  const encoded = buildRawMimeEmail({
    to: 'client@example.com',
    subject: 'Q4 Renewal',
    body: 'Hello team — ready to finalize.',
    inReplyTo: '<msg-123@mail.gmail.com>',
  });
  const decoded = decodeBase64Url(encoded);
  assert.ok(decoded.includes('To: client@example.com'));
  assert.ok(decoded.includes('Subject: Q4 Renewal'));
  assert.ok(decoded.includes('In-Reply-To: <msg-123@mail.gmail.com>'));
  assert.ok(decoded.includes('Hello team — ready to finalize.'));
});

test('composeAiSystemContext counts only active memories and enabled skills', () => {
  const ctx = composeAiSystemContext(
    'Be concise',
    [
      { id: 's1', ownerId: 'u1', name: 'CFO Lens', domain: 'Finance', instructions: 'Focus on margin', enabled: true, createdAt: '', updatedAt: '' },
      { id: 's2', ownerId: 'u1', name: 'Disabled', domain: 'Ops', instructions: 'Skip', enabled: false, createdAt: '', updatedAt: '' },
    ],
    [
      { id: 'm1', ownerId: 'u1', content: 'Prefers quarterly cohorts', source: 'auto', active: true, createdAt: '', updatedAt: '' },
      { id: 'm2', ownerId: 'u1', content: 'Old preference', source: 'manual', active: false, createdAt: '', updatedAt: '' },
    ]
  );
  assert.equal(ctx.enabledSkillsCount, 1);
  assert.equal(ctx.activeMemoriesCount, 1);
  assert.ok(ctx.preview.includes('CFO Lens'));
  assert.ok(!ctx.preview.includes('Old preference'));
  assert.equal(sanitizeBounded('  hello world  ', 5), 'hello');
});

test('normalizeCompanyName and findFuzzyDuplicateClusters catch legal-suffix and email duplicates', () => {
  assert.equal(normalizeCompanyName('Acme Corp., Inc.'), 'acme');
  assert.equal(normalizeCompanyName('Northwind Holdings LLC'), 'northwind holdings');

  const contacts: Contact[] = [
    {
      id: 'c1',
      ownerId: 'u1',
      name: 'Priya Sharma',
      company: 'Acme Inc.',
      contactEmail: 'priya@acme.io',
      phone: '',
      lifecycleStage: 'sql',
      notes: '',
      visibility: 'org',
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
    {
      id: 'c2',
      ownerId: 'u1',
      name: 'Priya Sharma',
      company: 'Acme Corp',
      contactEmail: '',
      phone: '555-0199',
      lifecycleStage: 'lead',
      notes: '',
      visibility: 'org',
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
    },
  ];

  const clusters = findFuzzyDuplicateClusters(contacts);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].contacts.length, 2);
});

test('calculateForecastReality applies stale-deal discount and what-if win-rate lift', () => {
  const now = Date.parse('2026-11-22T00:00:00Z');
  const deals: Deal[] = [
    {
      id: 'd1',
      ownerId: 'u1',
      title: 'Stale Deal',
      company: 'OldCo',
      contactName: 'Alex',
      value: 100000,
      probability: 50,
      stage: 'proposal',
      expectedCloseDate: '2026-12-01',
      visibility: 'org',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'd2',
      ownerId: 'u1',
      title: 'Fresh Deal',
      company: 'NewCo',
      contactName: 'Jordan',
      value: 50000,
      probability: 80,
      stage: 'negotiation',
      expectedCloseDate: '2026-12-05',
      visibility: 'org',
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
    },
  ];

  const res = calculateForecastReality(deals, { stalePenaltyPct: 40, winRateLiftPct: 10, nowMs: now });
  assert.equal(res.repWeightedForecast, 90000);
  assert.equal(res.aiAdjustedForecast, 70000);
  assert.equal(res.simulatedForecast, 77000);
  assert.equal(res.staleExposureValue, 100000);
});

test('parseCsvRows parses quoted commas and headers accurately', () => {
  const csv = 'Name,Company,Value\n"Doe, Jane","Acme, Inc.",45000\nSam Patel,Northwind,12000';
  const parsed = parseCsvRows(csv);
  assert.deepEqual(parsed.headers, ['Name', 'Company', 'Value']);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].Name, 'Doe, Jane');
  assert.equal(parsed.rows[0].Company, 'Acme, Inc.');
  assert.equal(parsed.rows[1].Value, '12000');
});

test('normalizeGoogleMeetUrl parses full URLs, bare codes, and rejects unsafe domains', () => {
  assert.deepEqual(normalizeGoogleMeetUrl('abc-defg-hij'), {
    uri: 'https://meet.google.com/abc-defg-hij',
    code: 'abc-defg-hij',
  });
  assert.deepEqual(normalizeGoogleMeetUrl('https://meet.google.com/xyz-uvwx-rst?authuser=0'), {
    uri: 'https://meet.google.com/xyz-uvwx-rst',
    code: 'xyz-uvwx-rst',
  });
  assert.deepEqual(normalizeGoogleMeetUrl('meet.google.com/lookup/team-sync'), null);
  assert.equal(normalizeGoogleMeetUrl('javascript:alert(1)'), null);
  assert.equal(normalizeGoogleMeetUrl('https://evil.example.com/abc-defg-hij'), null);
});

