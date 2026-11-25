import type { GmailMessage } from '../types/crm';
import { buildRawMimeEmail, decodeBase64Url } from '../utils/crmLogic';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailPayloadPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
}

function extractBodyText(payload?: GmailPayloadPart): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function getHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  if (!headers) return '';
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? '';
}

export async function listGmailMessages(
  accessToken: string,
  query = '',
  maxResults = 15
): Promise<GmailMessage[]> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query.trim()) {
    params.set('q', query.trim());
  }

  const listRes = await fetch(`${GMAIL_API_BASE}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.status === 401 || listRes.status === 403) {
    throw new Error('GMAIL_AUTH_REQUIRED');
  }
  if (!listRes.ok) {
    throw new Error(`Gmail list failed (${listRes.status})`);
  }

  const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };
  const ids = listData.messages ?? [];
  if (ids.length === 0) return [];

  const details = await Promise.all(
    ids.map(async (item) => {
      const msgRes = await fetch(`${GMAIL_API_BASE}/messages/${item.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!msgRes.ok) return null;
      const msg = (await msgRes.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: GmailPayloadPart & { headers?: Array<{ name: string; value: string }> };
      };
      const headers = msg.payload?.headers;
      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet ?? '',
        subject: getHeader(headers, 'Subject') || '(No subject)',
        from: getHeader(headers, 'From') || 'Unknown sender',
        to: getHeader(headers, 'To'),
        date: getHeader(headers, 'Date'),
        body: extractBodyText(msg.payload) || msg.snippet || '',
        unread: (msg.labelIds ?? []).includes('UNREAD'),
      } satisfies GmailMessage;
    })
  );

  return details.filter((m): m is GmailMessage => m !== null);
}

export async function sendGmailMessage(
  accessToken: string,
  params: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }
): Promise<{ id: string; threadId: string }> {
  const raw = buildRawMimeEmail({
    to: params.to,
    subject: params.subject,
    body: params.body,
    inReplyTo: params.inReplyTo,
  });

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw,
      ...(params.threadId ? { threadId: params.threadId } : {}),
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('GMAIL_AUTH_REQUIRED');
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as { id: string; threadId: string };
}
