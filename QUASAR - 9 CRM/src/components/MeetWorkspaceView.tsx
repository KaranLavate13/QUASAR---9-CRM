import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  AiMemoryItem,
  AiSkillItem,
  Contact,
  Deal,
  GoogleCalendarEvent,
  GoogleDriveFile,
  GoogleMeetSpace,
  LinkedDriveDoc,
  MeetingCrmExtraction,
  TaskItem,
  TaskPriority,
} from '../types/crm';
import {
  createCalendarEventWithMeet,
  createGoogleMeetSpace,
  listGoogleDriveFiles,
  listUpcomingCalendarEvents,
  WorkspaceAuthError,
} from '../lib/googleWorkspace';
import { formatTimestamp, normalizeGoogleMeetUrl, summarizeWorkspaceForAi } from '../utils/crmLogic';
import { GoogleSignInButton } from './GoogleSignInButton';

interface MeetWorkspaceViewProps {
  accessToken: string | null;
  userEmail: string;
  actorName: string;
  meetingRooms: GoogleMeetSpace[];
  deals: Deal[];
  contacts: Contact[];
  tasks: TaskItem[];
  memories: AiMemoryItem[];
  skills: AiSkillItem[];
  systemInstructions: string;
  onConnectGoogle: () => Promise<void>;
  onSaveMeetingRoom: (payload: {
    title: string;
    relatedDealTitle: string;
    meetingUri: string;
    meetingCode: string;
  }) => Promise<void>;
  onDeleteMeetingRoom: (room: GoogleMeetSpace) => Promise<void>;
  onShareMeetToTeam: (room: GoogleMeetSpace) => Promise<void>;
  onLinkDriveDocToDeal: (deal: Deal, doc: LinkedDriveDoc) => Promise<void>;
  onApplyMeetingExtraction: (extraction: MeetingCrmExtraction) => Promise<void>;
  onDraftEmailFromMeeting: (to: string, subject: string, body: string) => void;
  onLogAction: (
    category: 'meet' | 'calendar' | 'drive' | 'ai',
    action: string,
    target: string,
    details: string
  ) => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const MeetWorkspaceView: React.FC<MeetWorkspaceViewProps> = ({
  accessToken,
  userEmail,
  meetingRooms,
  deals,
  contacts,
  tasks,
  memories,
  skills,
  systemInstructions,
  onConnectGoogle,
  onSaveMeetingRoom,
  onDeleteMeetingRoom,
  onShareMeetToTeam,
  onLinkDriveDocToDeal,
  onApplyMeetingExtraction,
  onDraftEmailFromMeeting,
  onLogAction,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'meet' | 'calendar' | 'drive' | 'notes'>('meet');
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Instant Google Meet Creator + Paste Link & Join
  const [roomTitle, setRoomTitle] = useState('');
  const [roomDeal, setRoomDeal] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pasteMeetInput, setPasteMeetInput] = useState('');
  const [pasteMeetLabel, setPasteMeetLabel] = useState('');
  const [savingPastedRoom, setSavingPastedRoom] = useState(false);
  const parsedPastedMeet = normalizeGoogleMeetUrl(pasteMeetInput);

  // Google Calendar Events + Scheduler + AI Prep
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [evSummary, setEvSummary] = useState('');
  const [evDate, setEvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evStartTime, setEvStartTime] = useState('10:00');
  const [evDurationMin, setEvDurationMin] = useState(30);
  const [evAttendees, setEvAttendees] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [pendingScheduleConfirm, setPendingScheduleConfirm] = useState<{
    summary: string;
    description: string;
    startIso: string;
    endIso: string;
    attendeeEmails: string[];
  } | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const [prepLoadingId, setPrepLoadingId] = useState<string | null>(null);
  const [prepBriefs, setPrepBriefs] = useState<
    Record<
      string,
      {
        objective: string;
        talkingPoints: string[];
        discoveryQuestions: string[];
        watchouts: string[];
      }
    >
  >({});

  // Google Drive Files & Deal Linker
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [selectedDealForDoc, setSelectedDealForDoc] = useState<string>(deals[0]?.id || '');

  // Meeting Transcript / Live Voice-to-CRM Updater
  const [meetingNotes, setMeetingNotes] = useState('');
  const [linkedDealId, setLinkedDealId] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [extractingNotes, setExtractingNotes] = useState(false);
  const [extraction, setExtraction] = useState<MeetingCrmExtraction | null>(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const loadCalendar = async () => {
    if (!accessToken) return;
    setLoadingCal(true);
    setErrorMsg('');
    try {
      const evs = await listUpcomingCalendarEvents(accessToken, 15);
      setCalendarEvents(evs);
      onLogAction('calendar', 'Synced Google Calendar', 'Primary Calendar', `Loaded ${evs.length} upcoming events`);
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        setNeedsReconnect(true);
        setErrorMsg('Google Workspace session expired or missing Calendar permission. Sign in with Google to reconnect.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load Google Calendar events.');
      }
    } finally {
      setLoadingCal(false);
    }
  };

  const loadDrive = async (q = driveSearch) => {
    if (!accessToken) return;
    setLoadingDrive(true);
    setErrorMsg('');
    try {
      const files = await listGoogleDriveFiles(accessToken, q, 20);
      setDriveFiles(files);
      onLogAction('drive', 'Browsed Google Drive', q || 'Recent Files', `Found ${files.length} documents`);
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        setNeedsReconnect(true);
        setErrorMsg('Google Workspace session expired or missing Drive permission. Sign in with Google to reconnect.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load Google Drive files.');
      }
    } finally {
      setLoadingDrive(false);
    }
  };

  useEffect(() => {
    if (accessToken && activeSubTab === 'calendar' && calendarEvents.length === 0) {
      void loadCalendar();
    }
    if (accessToken && activeSubTab === 'drive' && driveFiles.length === 0) {
      void loadDrive('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeSubTab]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleCreateMeetSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) {
      setNeedsReconnect(true);
      return;
    }
    setCreatingRoom(true);
    setErrorMsg('');
    setNotice('');
    try {
      const created = await createGoogleMeetSpace(accessToken);
      const title = roomTitle.trim() || 'Instant Relay Meet Room';
      await onSaveMeetingRoom({
        title,
        relatedDealTitle: roomDeal,
        meetingUri: created.meetingUri,
        meetingCode: created.meetingCode,
      });
      setRoomTitle('');
      setRoomDeal('');
      setNotice(`Live Google Meet space created: ${created.meetingCode || created.meetingUri}`);
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        setNeedsReconnect(true);
        setErrorMsg('Google Meet permission needs renewal. Click Connect Google Workspace below.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to create Google Meet room.');
      }
    } finally {
      setCreatingRoom(false);
    }
  };

  const requestScheduleConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evSummary.trim() || !evDate || !evStartTime) {
      setErrorMsg('Meeting title, date, and start time are required.');
      return;
    }
    const startDate = new Date(`${evDate}T${evStartTime}:00`);
    const endDate = new Date(startDate.getTime() + evDurationMin * 60000);
    setPendingScheduleConfirm({
      summary: evSummary.trim(),
      description: evDesc.trim(),
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      attendeeEmails: evAttendees
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  const executeConfirmedSchedule = async () => {
    if (!pendingScheduleConfirm || !accessToken) return;
    setScheduling(true);
    setErrorMsg('');
    try {
      const ev = await createCalendarEventWithMeet(accessToken, pendingScheduleConfirm);
      setCalendarEvents((prev) => [ev, ...prev]);
      if (ev.meetLink) {
        await onSaveMeetingRoom({
          title: ev.summary,
          relatedDealTitle: '',
          meetingUri: ev.meetLink,
          meetingCode: ev.meetLink.split('/').pop() || '',
        });
      }
      onLogAction(
        'calendar',
        'Scheduled Calendar + Meet Event',
        ev.summary,
        `${pendingScheduleConfirm.attendeeEmails.length} attendee(s)`
      );
      setNotice(`Scheduled "${ev.summary}" on Google Calendar with Google Meet link.`);
      setEvSummary('');
      setEvAttendees('');
      setEvDesc('');
      setShowScheduleForm(false);
      setPendingScheduleConfirm(null);
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        setNeedsReconnect(true);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to schedule calendar event.');
      }
      setPendingScheduleConfirm(null);
    } finally {
      setScheduling(false);
    }
  };

  const handleGeneratePrep = async (ev: GoogleCalendarEvent) => {
    setPrepLoadingId(ev.id);
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: ev,
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
      if (!res.ok) throw new Error(data.error || 'AI prep failed.');
      setPrepBriefs((prev) => ({ ...prev, [ev.id]: data.prep }));
      onLogAction('ai', 'Generated Pre-Meeting AI Brief', ev.summary, 'Cross-referenced live CRM records');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate AI prep brief.');
    } finally {
      setPrepLoadingId(null);
    }
  };

  const toggleVoiceDictation = () => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setErrorMsg('Live browser voice dictation is not supported in this browser. Paste your Google Meet transcript instead.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      let chunk = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          chunk += `${event.results[i][0].transcript} `;
        }
      }
      if (chunk.trim()) {
        setMeetingNotes((prev) => `${prev ? `${prev}\n` : ''}${chunk.trim()}`);
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
    setErrorMsg('');
  };

  const handleExtractMeetingNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingNotes.trim()) {
      setErrorMsg('Paste call notes, a Google Meet transcript, or dictate via microphone first.');
      return;
    }
    setExtractingNotes(true);
    setErrorMsg('');
    try {
      const dealContext = deals.find((d) => d.id === linkedDealId) ?? null;
      const res = await fetch('/api/ai/meeting-to-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: meetingNotes,
          dealContext,
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
      if (!res.ok) throw new Error(data.error || 'Unable to parse meeting notes.');
      setExtraction(data.extraction);
      onLogAction('ai', 'Parsed Meeting Notes to CRM', dealContext?.title || 'Call Transcript', 'Extracted deal updates & tasks');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Meeting extraction failed.');
    } finally {
      setExtractingNotes(false);
    }
  };

  const handleCopyUri = (room: GoogleMeetSpace) => {
    void navigator.clipboard.writeText(room.meetingUri);
    setCopiedId(room.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Google Workspace tools">
          {(
            [
              { id: 'meet', label: `Google Meet Rooms (${meetingRooms.length})`, icon: Video },
              { id: 'calendar', label: 'Google Calendar & AI Prep', icon: Calendar },
              { id: 'drive', label: 'Google Drive Deal Docs', icon: FolderOpen },
              { id: 'notes', label: 'AI Call Notes & Voice-to-CRM', icon: Mic },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSubTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap transition-all ${
                  active ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        {userEmail && (
          <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
            {userEmail}
          </span>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-4 py-2.5 text-xs text-emerald-500">
          {notice}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/35 bg-red-500/12 px-4 py-2.5 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Connect Prompt Banner for live Google Meet / Calendar / Drive tabs */}
      {(!accessToken || needsReconnect) && activeSubTab !== 'notes' && (
        <div className="liquid-surface rounded-2xl p-8 text-center space-y-4">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Video className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Connect Google Meet, Calendar & Drive</h2>
            <p className="mx-auto mt-1.5 max-w-lg text-sm" style={{ color: 'var(--text-secondary)' }}>
              Sign in with your Google account to launch real Google Meet rooms, view and schedule Calendar meetings with AI Prep briefs, and attach Google Drive proposals directly to deals.
            </p>
          </div>
          <div className="flex justify-center">
            <GoogleSignInButton onClick={onConnectGoogle} label="Connect Google Workspace" />
          </div>
        </div>
      )}

      {/* SUBTAB 1: GOOGLE MEET SPACES */}
      {activeSubTab === 'meet' && (
        <div className="space-y-5">
          <form onSubmit={handleCreateMeetSpace} className="liquid-surface rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Launch a Live Google Meet Space</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Instantly generates a real Google Meet room URL via the Google Meet API and shares it with your team.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="text"
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="Room title (e.g., Q4 Enterprise Demo)"
                className="rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <select
                value={roomDeal}
                onChange={(e) => setRoomDeal(e.target.value)}
                aria-label="Link meeting to CRM deal"
                className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              >
                <option value="">Link to CRM Deal (Optional)</option>
                {deals.map((d) => (
                  <option key={d.id} value={`${d.title} (${d.company})`}>
                    {d.title} — {d.company}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={creatingRoom || !accessToken}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                {creatingRoom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                {creatingRoom ? 'Creating Google Meet...' : 'Create Instant Google Meet'}
              </button>
            </div>
          </form>

          {/* Paste Existing Google Meet Link & Join */}
          <div className="liquid-surface rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Join via Google Meet Link or Code</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Paste any Google Meet URL (e.g., https://meet.google.com/abc-defg-hij) or room code to join immediately or pin it for your team.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="text"
                value={pasteMeetInput}
                onChange={(e) => setPasteMeetInput(e.target.value)}
                placeholder="Paste meet.google.com/abc-defg-hij or code..."
                aria-label="Paste Google Meet link or room code"
                className="rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <input
                type="text"
                value={pasteMeetLabel}
                onChange={(e) => setPasteMeetLabel(e.target.value)}
                placeholder="Room label (Optional, e.g., Client Sync)"
                aria-label="Optional label for pasted Meet room"
                className="rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <div className="flex items-center gap-2">
                {parsedPastedMeet ? (
                  <a
                    href={parsedPastedMeet.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      onLogAction(
                        'meet',
                        'Joined Pasted Google Meet Link',
                        pasteMeetLabel.trim() || parsedPastedMeet.code,
                        parsedPastedMeet.uri
                      )
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Join Meet Now
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold opacity-50 whitespace-nowrap"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Join Meet Now
                  </button>
                )}
                <button
                  type="button"
                  disabled={!parsedPastedMeet || savingPastedRoom}
                  onClick={async () => {
                    if (!parsedPastedMeet) return;
                    setSavingPastedRoom(true);
                    setErrorMsg('');
                    try {
                      await onSaveMeetingRoom({
                        title: pasteMeetLabel.trim() || `Google Meet (${parsedPastedMeet.code})`,
                        relatedDealTitle: roomDeal,
                        meetingUri: parsedPastedMeet.uri,
                        meetingCode: parsedPastedMeet.code,
                      });
                      setNotice(`Pinned "${parsedPastedMeet.uri}" to Active Google Meet Rooms.`);
                      setPasteMeetInput('');
                      setPasteMeetLabel('');
                    } catch (err) {
                      setErrorMsg(err instanceof Error ? err.message : 'Unable to save Meet link.');
                    } finally {
                      setSavingPastedRoom(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium liquid-surface whitespace-nowrap hover:opacity-90 disabled:opacity-45"
                >
                  {savingPastedRoom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Pin Room
                </button>
              </div>
            </div>
            {pasteMeetInput.trim() && !parsedPastedMeet && (
              <p className="text-xs text-amber-500">
                Enter a valid Google Meet link (meet.google.com/xxx-xxxx-xxx) or 10-letter room code.
              </p>
            )}
          </div>

          {meetingRooms.length === 0 ? (
            <div className="liquid-surface rounded-2xl p-10 text-center">
              <Video className="mx-auto mb-3 h-8 w-8" style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-base font-semibold">No active Google Meet spaces yet</h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs" style={{ color: 'var(--text-secondary)' }}>
                Create an instant Google Meet room above or schedule one in the Calendar tab. Every room can be joined in one click or posted straight into Team Messages.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {meetingRooms.map((room) => (
                <div key={room.id} className="liquid-surface rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{room.title}</div>
                      <div className="mt-0.5 text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                        Host: {room.hostName} · {formatTimestamp(room.createdAt)}
                      </div>
                      {room.relatedDealTitle && (
                        <div className="mt-1 text-xs" style={{ color: 'var(--accent)' }}>
                          Deal: {room.relatedDealTitle}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteMeetingRoom(room)}
                      aria-label={`Remove meeting room ${room.title}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-mono-tabular"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                  >
                    <span className="truncate">{room.meetingUri}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyUri(room)}
                      aria-label="Copy Google Meet link"
                      className="shrink-0 hover:opacity-80"
                    >
                      {copiedId === room.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={room.meetingUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Join Google Meet
                    </a>
                    <button
                      type="button"
                      onClick={() => onShareMeetToTeam(room)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface hover:opacity-90"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Share in Team Chat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: GOOGLE CALENDAR + AI PRE-MEETING PREP */}
      {activeSubTab === 'calendar' && accessToken && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Upcoming Google Calendar Meetings</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowScheduleForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                {showScheduleForm ? 'Close Scheduler' : 'Schedule Meeting + Meet'}
              </button>
              <button
                type="button"
                onClick={() => void loadCalendar()}
                disabled={loadingCal}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingCal ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>
          </div>

          {showScheduleForm && (
            <form onSubmit={requestScheduleConfirmation} className="liquid-elevated rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold">Schedule Google Calendar Event (Auto-Creates Google Meet Link)</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={evSummary}
                  onChange={(e) => setEvSummary(e.target.value)}
                  placeholder="Meeting title (e.g., Security Review with Acme)"
                  required
                  className="rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                />
                <input
                  type="text"
                  value={evAttendees}
                  onChange={(e) => setEvAttendees(e.target.value)}
                  placeholder="Attendee emails (comma-separated)"
                  className="rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="date"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    required
                    className="rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                  />
                  <input
                    type="time"
                    value={evStartTime}
                    onChange={(e) => setEvStartTime(e.target.value)}
                    required
                    className="rounded-xl px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                  />
                  <select
                    value={evDurationMin}
                    onChange={(e) => setEvDurationMin(Number(e.target.value))}
                    className="rounded-xl px-2 py-2 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                  placeholder="Agenda / notes (optional)"
                  className="rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleForm(false)}
                  className="rounded-xl px-4 py-2 text-xs liquid-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-5 py-2 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  Review & Schedule
                </button>
              </div>
            </form>
          )}

          {loadingCal && calendarEvents.length === 0 ? (
            <div className="liquid-surface rounded-2xl p-12 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Loading your Google Calendar...
            </div>
          ) : calendarEvents.length === 0 ? (
            <div className="liquid-surface rounded-2xl p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No upcoming events found on your primary Google Calendar.
            </div>
          ) : (
            <div className="space-y-3">
              {calendarEvents.map((ev) => {
                const brief = prepBriefs[ev.id];
                return (
                  <div key={ev.id} className="liquid-surface rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold">{ev.summary}</div>
                        <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                          {formatTimestamp(ev.start)}
                          {ev.attendees.length > 0 ? ` · ${ev.attendees.length} attendees` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleGeneratePrep(ev)}
                          disabled={prepLoadingId === ev.id}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface hover:opacity-90"
                        >
                          {prepLoadingId === ev.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                          )}
                          AI Prep Brief
                        </button>
                        {ev.meetLink && (
                          <a
                            href={ev.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                          >
                            <Video className="h-3.5 w-3.5" />
                            Join Meet
                          </a>
                        )}
                      </div>
                    </div>

                    {brief && (
                      <div
                        className="rounded-xl p-4 space-y-3 text-xs"
                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div className="font-semibold" style={{ color: 'var(--accent)' }}>
                          AI Pre-Meeting Prep — {brief.objective}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <div className="font-semibold mb-1">Talking Points</div>
                            <ul className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
                              {brief.talkingPoints.map((pt, i) => (
                                <li key={i}>• {pt}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="font-semibold mb-1">Discovery Questions</div>
                            <ul className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
                              {brief.discoveryQuestions.map((q, i) => (
                                <li key={i}>• {q}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="font-semibold mb-1">Risk Watchouts</div>
                            <ul className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
                              {brief.watchouts.map((w, i) => (
                                <li key={i}>• {w}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: GOOGLE DRIVE DEAL DOCS */}
      {activeSubTab === 'drive' && accessToken && (
        <div className="space-y-4">
          <div className="liquid-surface rounded-2xl p-5 flex flex-wrap items-center gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadDrive(driveSearch);
              }}
              className="flex flex-1 min-w-[220px] gap-2"
            >
              <input
                type="search"
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                placeholder="Search Google Drive proposals, quotes, decks..."
                className="flex-1 rounded-xl px-4 py-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <button type="submit" className="rounded-xl px-4 py-2 text-xs font-medium liquid-surface">
                Search Drive
              </button>
            </form>

            <select
              value={selectedDealForDoc}
              onChange={(e) => setSelectedDealForDoc(e.target.value)}
              aria-label="Target deal for attaching Google Drive files"
              className="rounded-xl px-3.5 py-2 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            >
              <option value="">Select Deal to Link Files...</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.company})
                </option>
              ))}
            </select>
          </div>

          {loadingDrive ? (
            <div className="liquid-surface rounded-2xl p-12 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Scanning Google Drive...
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="liquid-surface rounded-2xl p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No Google Drive files matched your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {driveFiles.map((file) => {
                const targetDeal = deals.find((d) => d.id === selectedDealForDoc);
                return (
                  <div key={file.id} className="liquid-surface rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 shrink-0" style={{ color: 'var(--accent)' }} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{file.name}</div>
                        <div className="text-[11px] font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                          Updated {formatTimestamp(file.modifiedTime)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {targetDeal && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onLinkDriveDocToDeal(targetDeal, {
                              id: file.id,
                              name: file.name,
                              webViewLink: file.webViewLink,
                              mimeType: file.mimeType,
                            });
                            setNotice(`Linked "${file.name}" to deal "${targetDeal.title}".`);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Link to Deal
                        </button>
                      )}
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${file.name} in Google Drive`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg liquid-surface"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: MEETING TRANSCRIPT / LIVE VOICE-TO-CRM UPDATER ($0) */}
      {activeSubTab === 'notes' && (
        <div className="space-y-5">
          <form onSubmit={handleExtractMeetingNotes} className="liquid-surface rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Meeting Notes & Live Voice → CRM Updater</h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Paste a Google Meet transcript or dictate post-call notes hands-free. Gemini extracts deal updates, objections, tasks, and a follow-up Gmail draft.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleVoiceDictation}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold ${
                  isListening ? 'liquid-glass-active' : 'liquid-surface'
                }`}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5 text-red-500" /> : <Mic className="h-3.5 w-3.5" />}
                {isListening ? 'Stop Dictation' : 'Live Voice Dictation'}
              </button>
            </div>

            <select
              value={linkedDealId}
              onChange={(e) => setLinkedDealId(e.target.value)}
              aria-label="Select existing deal context"
              className="w-full rounded-xl px-3.5 py-2.5 text-xs outline-none sm:w-80"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            >
              <option value="">Auto-detect or create new deal</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  Context: {d.title} ({d.company})
                </option>
              ))}
            </select>

            <textarea
              rows={6}
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              placeholder="Paste Google Meet transcript or raw call notes here (e.g., 'Spoke with CFO at Apex Corp regarding $48k annual rollout. Main objection is SSO timeline; competing with LegacyCRM. Promised SOC2 report by Friday...')"
              className="w-full rounded-xl p-4 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={extractingNotes}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                {extractingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {extractingNotes ? 'Extracting CRM Updates...' : 'Extract Structured CRM Updates'}
              </button>
            </div>
          </form>

          {extraction && (
            <div className="liquid-elevated rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold">AI Extracted Call Intelligence</h3>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {extraction.summary}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExtraction(null)}
                  aria-label="Dismiss extraction"
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
                <div className="rounded-xl p-3.5 space-y-1" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Deal Update</div>
                  <div className="font-semibold text-sm">{extraction.dealTitle || 'Unnamed Deal'}</div>
                  <div>{extraction.company} · Stage: <strong className="uppercase">{extraction.suggestedStage}</strong></div>
                  <div className="font-mono-tabular">Est. Value: ${extraction.estimatedValue.toLocaleString()}</div>
                </div>
                <div className="rounded-xl p-3.5 space-y-1" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Objections & Competitors</div>
                  {extraction.objections.length === 0 ? (
                    <div>No objections flagged</div>
                  ) : (
                    extraction.objections.map((o, i) => <div key={i}>• {o}</div>)
                  )}
                  {extraction.competitors.length > 0 && (
                    <div className="pt-1 text-amber-500">Competitors: {extraction.competitors.join(', ')}</div>
                  )}
                </div>
                <div className="rounded-xl p-3.5 space-y-1" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Action Tasks ({extraction.tasks.length})</div>
                  {extraction.tasks.map((t, i) => (
                    <div key={i}>
                      • {t.title} <span className="uppercase font-mono-tabular opacity-75">[{t.priority as TaskPriority}]</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {extraction.followUpEmailBody && (
                  <button
                    type="button"
                    onClick={() =>
                      onDraftEmailFromMeeting(
                        '',
                        extraction.followUpEmailSubject || `Follow-up: ${extraction.dealTitle}`,
                        extraction.followUpEmailBody
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium liquid-surface"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Open Follow-up Draft in Gmail
                  </button>
                )}
                <button
                  type="button"
                  disabled={applyingExtraction}
                  onClick={async () => {
                    setApplyingExtraction(true);
                    try {
                      await onApplyMeetingExtraction(extraction);
                      setNotice('Applied extracted deal and follow-up tasks directly to CRM.');
                      setExtraction(null);
                      setMeetingNotes('');
                    } finally {
                      setApplyingExtraction(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
                >
                  {applyingExtraction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve & Apply to CRM
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mandatory Explicit Confirmation Dialog before creating a Google Calendar Event */}
      {pendingScheduleConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm scheduling Google Calendar event"
        >
          <div className="liquid-elevated w-full max-w-lg rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <h3 className="text-base font-semibold">Confirm Google Calendar Event</h3>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              You are about to add a live event with a Google Meet link to your Google Calendar ({userEmail}) and invite listed attendees:
            </p>
            <div className="rounded-xl p-4 space-y-1.5 text-xs" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
              <div><strong>Title:</strong> {pendingScheduleConfirm.summary}</div>
              <div className="font-mono-tabular"><strong>Start:</strong> {formatTimestamp(pendingScheduleConfirm.startIso)}</div>
              <div><strong>Attendees:</strong> {pendingScheduleConfirm.attendeeEmails.join(', ') || 'Only you'}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingScheduleConfirm(null)}
                disabled={scheduling}
                className="rounded-xl px-4 py-2 text-xs liquid-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedSchedule}
                disabled={scheduling}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                {scheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                {scheduling ? 'Scheduling...' : 'Confirm & Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
