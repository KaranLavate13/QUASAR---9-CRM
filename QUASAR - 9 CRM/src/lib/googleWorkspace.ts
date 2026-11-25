import type { GoogleCalendarEvent, GoogleDriveFile } from '../types/crm';

export class WorkspaceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceAuthError';
  }
}

async function workspaceFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new WorkspaceAuthError(
      'Google Workspace permission expired or missing required scope. Please reconnect your Google account.'
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Workspace API error (${res.status}): ${text.slice(0, 220)}`);
  }

  return (await res.json()) as T;
}

/**
 * Creates a real live Google Meet space via the Google Meet REST API v2.
 * Scope required: https://www.googleapis.com/auth/meetings.space.created
 */
export async function createGoogleMeetSpace(accessToken: string): Promise<{
  name: string;
  meetingUri: string;
  meetingCode: string;
}> {
  const data = await workspaceFetch<{
    name?: string;
    meetingUri?: string;
    meetingCode?: string;
  }>('https://meet.googleapis.com/v2/spaces', accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  return {
    name: data.name || '',
    meetingUri: data.meetingUri || '',
    meetingCode: data.meetingCode || '',
  };
}

/**
 * Lists upcoming events from the user's primary Google Calendar.
 * Scope required: https://www.googleapis.com/auth/calendar.events
 */
export async function listUpcomingCalendarEvents(
  accessToken: string,
  maxResults = 15
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const data = await workspaceFetch<{
    items?: Array<{
      id?: string;
      summary?: string;
      description?: string;
      htmlLink?: string;
      hangoutLink?: string;
      conferenceData?: {
        entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
      };
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string }>;
    }>;
  }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, accessToken);

  return (data.items || []).map((ev) => {
    const videoEntry = ev.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video' && ep.uri
    );
    return {
      id: ev.id || `cal_${Math.random().toString(36).slice(2, 10)}`,
      summary: ev.summary || '(Untitled Meeting)',
      description: ev.description || '',
      start: ev.start?.dateTime || ev.start?.date || new Date().toISOString(),
      end: ev.end?.dateTime || ev.end?.date || new Date().toISOString(),
      meetLink: videoEntry?.uri || ev.hangoutLink || '',
      htmlLink: ev.htmlLink || '',
      attendees: (ev.attendees || []).map((a) => a.email || '').filter(Boolean),
    };
  });
}

/**
 * Schedules a Google Calendar event and automatically attaches a Google Meet link.
 * Must only be called after explicit user confirmation in the UI.
 */
export async function createCalendarEventWithMeet(
  accessToken: string,
  payload: {
    summary: string;
    description: string;
    startIso: string;
    endIso: string;
    attendeeEmails: string[];
  }
): Promise<GoogleCalendarEvent> {
  const requestId = `relay-meet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const ev = await workspaceFetch<{
    id?: string;
    summary?: string;
    description?: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    };
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: Array<{ email?: string }>;
  }>(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: payload.summary,
        description: payload.description,
        start: { dateTime: payload.startIso },
        end: { dateTime: payload.endIso },
        attendees: payload.attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  );

  const videoEntry = ev.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video' && ep.uri
  );

  return {
    id: ev.id || requestId,
    summary: ev.summary || payload.summary,
    description: ev.description || payload.description,
    start: ev.start?.dateTime || payload.startIso,
    end: ev.end?.dateTime || payload.endIso,
    meetLink: videoEntry?.uri || ev.hangoutLink || '',
    htmlLink: ev.htmlLink || '',
    attendees: (ev.attendees || []).map((a) => a.email || '').filter(Boolean),
  };
}

/**
 * Lists or searches files in the user's Google Drive (read-only).
 * Scope required: https://www.googleapis.com/auth/drive.readonly
 */
export async function listGoogleDriveFiles(
  accessToken: string,
  searchQuery = '',
  pageSize = 20
): Promise<GoogleDriveFile[]> {
  const safeQ = searchQuery.trim().replace(/'/g, "\\'");
  const q = safeQ ? `trashed = false and name contains '${safeQ}'` : 'trashed = false';
  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
  });

  const data = await workspaceFetch<{
    files?: Array<{
      id?: string;
      name?: string;
      mimeType?: string;
      webViewLink?: string;
      modifiedTime?: string;
    }>;
  }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);

  return (data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || 'Untitled File',
    mimeType: f.mimeType || 'application/octet-stream',
    webViewLink: f.webViewLink || '',
    modifiedTime: f.modifiedTime || new Date().toISOString(),
  }));
}
