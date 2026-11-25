import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Aperture,
  BarChart3,
  Brain,
  Briefcase,
  CheckSquare,
  Gamepad2,
  History,
  Home,
  LogOut,
  Mail,
  MessageSquare,
  Sparkles,
  UserCircle,
  Video,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  db,
  handleFirestoreError,
  logoutWorkspace,
  OperationType,
  signInWithGoogleWorkspace,
  subscribeAuth,
} from './lib/firebase';
import {
  THEMES,
  type AiDashboardReport,
  type AiMemoryItem,
  type AiSkillItem,
  type AuditCategory,
  type AuditLogEntry,
  type BuyingRole,
  type ColorMode,
  type Contact,
  type Deal,
  type DealStage,
  type EmailCrmExtraction,
  type FeedPost,
  type GameProgressRecord,
  type GoogleMeetSpace,
  type HandoffDossier,
  type LifecycleStage,
  type LinkedDriveDoc,
  type MeetingCrmExtraction,
  type NavTab,
  type TaskItem,
  type TaskPriority,
  type TaskStatus,
  type TeamMessage,
  type ThemeId,
  type UserPublicProfile,
  type WorkflowRule,
} from './types/crm';
import { DEAL_STAGES, detectDuplicateContact, sanitizeBounded } from './utils/crmLogic';
import {
  buildOrgNewsShareText,
  type GoogleNewsArticle,
  type NewsCommentRecord,
  type NewsLikeRecord,
} from './utils/newsUtils';
import type { SmartGame } from './games/engines';
import { LiquidVectorBackground } from './components/LiquidVectorBackground';
import { AppearanceDrawer } from './components/AppearanceDrawer';
import { AiCommandBar, type ParsedAiCommand } from './components/AiCommandBar';
import { FoldablePageTransition } from './components/FoldablePageTransition';
import { TechnicalMenuIcon } from './components/TechnicalMenuIcon';
import { HomeFeedView } from './components/HomeFeedView';
import { AiDashboardView } from './components/AiDashboardView';
import { CrmPipelineView } from './components/CrmPipelineView';
import { MeetWorkspaceView } from './components/MeetWorkspaceView';
import { TasksWorkspaceView } from './components/TasksWorkspaceView';
import { GmailWorkspaceView } from './components/GmailWorkspaceView';
import { AiBrainView } from './components/AiBrainView';
import { TeamMessagesView } from './components/TeamMessagesView';
import { ProfileView } from './components/ProfileView';
import { AuditLogView } from './components/AuditLogView';
import { SmartGamesView } from './components/SmartGamesView';

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

const DEFAULT_WORKFLOWS: WorkflowRule[] = [
  {
    id: 'wf_task_to_feed',
    name: 'Auto-Post Completed Tasks to Chronological Feed',
    trigger: 'Task status transitions to Completed',
    action: 'Publish task completion post to Home Feed + timestamp Audit Trail',
    enabled: true,
  },
  {
    id: 'wf_deal_won_milestone',
    name: 'Closed-Won Milestone Broadcast',
    trigger: 'CRM Deal stage moves to Closed Won',
    action: 'Publish deal victory milestone to Home Feed + record Audit Entry',
    enabled: true,
  },
  {
    id: 'wf_dedupe_contacts',
    name: 'Automated Contact Deduplication Guard',
    trigger: 'Quick Capture contact submission',
    action: 'Prevent duplicate records by normalized email or name + company match',
    enabled: true,
  },
];

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'feed', label: 'Home Feed', icon: Home },
  { id: 'dashboard', label: 'AI Reports', icon: BarChart3 },
  { id: 'crm', label: 'CRM Pipeline', icon: Briefcase },
  { id: 'meet', label: 'Meet & Workspace', icon: Video },
  { id: 'tasks', label: 'Tasks & Team', icon: CheckSquare },
  { id: 'gmail', label: 'Gmail Inbox', icon: Mail },
  { id: 'messages', label: 'Team Messages', icon: MessageSquare },
  { id: 'ai-brain', label: 'AI Memory & Skills', icon: Brain },
  { id: 'profile', label: 'Profile', icon: UserCircle },
  { id: 'audit', label: 'Audit Trail', icon: History },
  { id: 'games', label: '100 Smart Games', icon: Gamepad2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('feed');
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);

  // Theme & Color Mode (iOS 27 Technical Liquid Glass throughout by default)
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem('relay_theme_ios27_v3') as ThemeId | null;
    return saved && THEMES.some((t) => t.id === saved) ? saved : 'ios27';
  });
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const saved = (localStorage.getItem('relay_color_mode') || localStorage.getItem('vetra_color_mode')) as ColorMode | null;
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  // Auth & Google Workspace in-memory OAuth token state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  const [gmailComposePrefill, setGmailComposePrefill] = useState<{
    email: string;
    name: string;
    subject?: string;
    body?: string;
  } | null>(null);

  // Workspace Data States (Zero Fictional Employee Data!)
  const [employees, setEmployees] = useState<UserPublicProfile[]>([]);
  const [localProfile, setLocalProfile] = useState<UserPublicProfile | null>(null);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [meetingRooms, setMeetingRooms] = useState<GoogleMeetSpace[]>([]);
  const [handoffDossiers, setHandoffDossiers] = useState<HandoffDossier[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [aiMemories, setAiMemories] = useState<AiMemoryItem[]>([]);
  const [aiSkills, setAiSkills] = useState<AiSkillItem[]>([]);
  const [aiDashboards, setAiDashboards] = useState<AiDashboardReport[]>([]);
  const [gameProgress, setGameProgress] = useState<Record<number, GameProgressRecord>>({});
  const [workflows, setWorkflows] = useState<WorkflowRule[]>(DEFAULT_WORKFLOWS);
  const [newsLikes, setNewsLikes] = useState<NewsLikeRecord[]>(() => {
    try {
      const raw = localStorage.getItem('quasar9_news_likes_v1') || localStorage.getItem('ton618_news_likes_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newsComments, setNewsComments] = useState<NewsCommentRecord[]>(() => {
    try {
      const raw = localStorage.getItem('quasar9_news_comments_v1') || localStorage.getItem('ton618_news_comments_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newsShareCounts, setNewsShareCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('quasar9_news_shares_v1') || localStorage.getItem('ton618_news_shares_v1');
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  // Global Cmd/Ctrl + K shortcut for AI Chat & Escape to close workspace menu drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandBarOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setNavMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Sync Theme + Dark/Light class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (colorMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('relay_theme_ios27_v3', theme);
    localStorage.setItem('relay_color_mode', colorMode);
  }, [theme, colorMode]);

  // Derived active user profile
  const currentProfile = useMemo(() => {
    if (user) {
      return employees.find((e) => e.uid === user.uid) ?? localProfile;
    }
    return localProfile;
  }, [user, employees, localProfile]);

  const actorName = currentProfile?.displayName || user?.displayName || 'Workspace User';
  const actorId = user?.uid || 'local-session';

  // Universal Timestamped Audit Logger (persists to Firestore when authenticated, otherwise local session)
  const recordAudit = useCallback(
    async (category: AuditCategory, action: string, target: string, details: string) => {
      const nowIso = new Date().toISOString();
      const id = makeId('log');
      const entry: AuditLogEntry = {
        id,
        ownerId: actorId,
        actorName: sanitizeBounded(actorName, 120) || 'Workspace User',
        category,
        action: sanitizeBounded(action, 120),
        target: sanitizeBounded(target, 200),
        details: sanitizeBounded(details, 600),
        visibility: 'org',
        createdAt: nowIso,
      };

      if (!user) {
        setAuditLogs((prev) => [entry, ...prev]);
        return;
      }

      try {
        await setDoc(doc(db, 'audit_logs', id), {
          ownerId: user.uid,
          actorName: entry.actorName,
          category: entry.category,
          action: entry.action,
          target: entry.target,
          details: entry.details,
          visibility: 'org',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `audit_logs/${id}`);
      }
    },
    [actorId, actorName, user]
  );

  // Provision real user public + private profile documents on Google Sign-In
  const ensureUserProfiles = useCallback(async (signedUser: User) => {
    const pubRef = doc(db, 'users_public', signedUser.uid);
    const privRef = doc(db, 'users_private', signedUser.uid);

    try {
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists()) {
        await setDoc(pubRef, {
          uid: signedUser.uid,
          displayName: sanitizeBounded(signedUser.displayName || 'Team Member', 120),
          roleTitle: '',
          department: '',
          bio: '',
          photoUrl: sanitizeBounded(signedUser.photoURL || '', 200000),
          visibility: 'org',
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users_public/${signedUser.uid}`);
    }

    try {
      const privSnap = await getDoc(privRef);
      if (!privSnap.exists()) {
        await setDoc(privRef, {
          uid: signedUser.uid,
          email: sanitizeBounded(signedUser.email || 'user@gmail.com', 254),
          phone: '',
          theme,
          colorMode,
          systemInstructions: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = privSnap.data();
        if (data.colorMode === 'dark' || data.colorMode === 'light') {
          setColorMode(data.colorMode as ColorMode);
        }
        if (typeof data.systemInstructions === 'string') {
          setSystemInstructions(data.systemInstructions);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users_private/${signedUser.uid}`);
    }
  }, [colorMode, theme]);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsub = subscribeAuth((u, token) => {
      setUser(u);
      setGmailToken(token);
      setAuthReady(true);
      if (u) {
        void ensureUserProfiles(u);
      }
    });
    return unsub;
  }, [ensureUserProfiles]);

  // Attach Firestore real-time listeners strictly when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubs: Array<() => void> = [];

    // 1. Public Employee Directory
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users_public'), where('visibility', '==', 'org'), where('isActive', '==', true)),
        (snap) => {
          setEmployees(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                uid: d.id,
                displayName: x.displayName || '',
                roleTitle: x.roleTitle || '',
                department: x.department || '',
                bio: x.bio || '',
                photoUrl: x.photoUrl || '',
                visibility: 'org',
                isActive: Boolean(x.isActive),
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users_public')
      )
    );

    // 2. Contacts
    unsubs.push(
      onSnapshot(
        query(collection(db, 'contacts'), where('visibility', '==', 'org')),
        (snap) => {
          setContacts(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                name: x.name,
                company: x.company || '',
                contactEmail: x.contactEmail || '',
                phone: x.phone || '',
                lifecycleStage: x.lifecycleStage || 'lead',
                buyingRole: (x.buyingRole as BuyingRole) || 'unspecified',
                notes: x.notes || '',
                visibility: x.visibility || 'org',
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'contacts')
      )
    );

    // 3. Deals
    unsubs.push(
      onSnapshot(
        query(collection(db, 'deals'), where('visibility', '==', 'org')),
        (snap) => {
          setDeals(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                title: x.title,
                company: x.company,
                contactName: x.contactName || '',
                value: Number(x.value) || 0,
                probability: Number(x.probability) || 0,
                stage: x.stage || 'lead',
                expectedCloseDate: x.expectedCloseDate || '',
                linkedDocs: Array.isArray(x.linkedDocs) ? (x.linkedDocs as LinkedDriveDoc[]) : [],
                visibility: x.visibility || 'org',
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'deals')
      )
    );

    // 4. Tasks
    unsubs.push(
      onSnapshot(
        query(collection(db, 'tasks'), where('visibility', '==', 'org')),
        (snap) => {
          setTasks(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                assigneeName: x.assigneeName || '',
                title: x.title,
                description: x.description || '',
                status: x.status || 'pending',
                priority: x.priority || 'medium',
                dueDate: x.dueDate || '',
                relatedDealTitle: x.relatedDealTitle || '',
                visibility: x.visibility || 'org',
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
      )
    );

    // 5. Feed Posts
    unsubs.push(
      onSnapshot(
        query(collection(db, 'feed_posts'), where('visibility', '==', 'org')),
        (snap) => {
          setFeedPosts(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                authorName: x.authorName || '',
                authorPhotoUrl: x.authorPhotoUrl || '',
                postType: x.postType || 'photo_post',
                caption: x.caption || '',
                imageUrl: x.imageUrl || '',
                taskTitle: x.taskTitle || '',
                likesCount: Number(x.likesCount) || 0,
                visibility: 'org',
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'feed_posts')
      )
    );

    // 6. Messages (org channel + sent + received DMs merged cleanly)
    const msgBuckets: Record<string, TeamMessage[]> = { org: [], sent: [], recv: [] };
    const syncMessages = () => {
      const merged = new Map<string, TeamMessage>();
      for (const list of Object.values(msgBuckets)) {
        for (const m of list) merged.set(m.id, m);
      }
      setMessages(Array.from(merged.values()));
    };
    const mapMsg = (d: { id: string; data: () => Record<string, unknown> }): TeamMessage => {
      const x = d.data();
      return {
        id: d.id,
        senderId: String(x.senderId || ''),
        senderName: String(x.senderName || ''),
        recipientId: String(x.recipientId || 'org'),
        text: String(x.text || ''),
        createdAt: tsToIso(x.createdAt),
      };
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'messages'), where('recipientId', '==', 'org')),
        (snap) => {
          msgBuckets.org = snap.docs.map(mapMsg);
          syncMessages();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'messages/org')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'messages'), where('senderId', '==', user.uid)),
        (snap) => {
          msgBuckets.sent = snap.docs.map(mapMsg);
          syncMessages();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'messages/sent')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'messages'), where('recipientId', '==', user.uid)),
        (snap) => {
          msgBuckets.recv = snap.docs.map(mapMsg);
          syncMessages();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'messages/recv')
      )
    );

    // 7. Audit Logs
    unsubs.push(
      onSnapshot(
        query(collection(db, 'audit_logs'), where('visibility', '==', 'org')),
        (snap) => {
          setAuditLogs(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                actorName: x.actorName || '',
                category: x.category || 'crm',
                action: x.action || '',
                target: x.target || '',
                details: x.details || '',
                visibility: 'org',
                createdAt: tsToIso(x.createdAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
      )
    );

    // 8. Owner-Scoped AI Memory
    unsubs.push(
      onSnapshot(
        query(collection(db, 'ai_memory'), where('ownerId', '==', user.uid)),
        (snap) => {
          setAiMemories(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                content: x.content || '',
                source: x.source || 'manual',
                active: Boolean(x.active),
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ai_memory')
      )
    );

    // 9. Owner-Scoped AI Skills
    unsubs.push(
      onSnapshot(
        query(collection(db, 'ai_skills'), where('ownerId', '==', user.uid)),
        (snap) => {
          setAiSkills(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                ownerId: x.ownerId,
                name: x.name || '',
                domain: x.domain || '',
                instructions: x.instructions || '',
                enabled: Boolean(x.enabled),
                createdAt: tsToIso(x.createdAt),
                updatedAt: tsToIso(x.updatedAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ai_skills')
      )
    );

    // 10. Owner-Scoped AI Dashboards
    unsubs.push(
      onSnapshot(
        query(collection(db, 'ai_dashboards'), where('ownerId', '==', user.uid)),
        (snap) => {
          setAiDashboards(
            snap.docs
              .map((d) => {
                const x = d.data();
                return {
                  id: d.id,
                  ownerId: x.ownerId,
                  title: x.title || '',
                  prompt: x.prompt || '',
                  summary: x.summary || '',
                  kpis: Array.isArray(x.kpis) ? x.kpis : [],
                  charts: Array.isArray(x.charts) ? x.charts : [],
                  recommendations: Array.isArray(x.recommendations) ? x.recommendations : [],
                  createdAt: tsToIso(x.createdAt),
                  updatedAt: tsToIso(x.updatedAt),
                };
              })
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ai_dashboards')
      )
    );

    // 11. Owner-Scoped Game Progress
    unsubs.push(
      onSnapshot(
        query(collection(db, 'game_progress'), where('ownerId', '==', user.uid)),
        (snap) => {
          const map: Record<number, GameProgressRecord> = {};
          for (const d of snap.docs) {
            const x = d.data();
            const gid = Number(x.gameId);
            map[gid] = {
              id: d.id,
              ownerId: x.ownerId,
              gameId: gid,
              completed: Boolean(x.completed),
              bestScore: Number(x.bestScore) || 0,
              attempts: Number(x.attempts) || 1,
              updatedAt: tsToIso(x.updatedAt),
            };
          }
          setGameProgress(map);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'game_progress')
      )
    );

    // 12. Org-Visible Google Meet Spaces
    unsubs.push(
      onSnapshot(
        query(collection(db, 'meeting_rooms'), where('visibility', '==', 'org')),
        (snap) => {
          setMeetingRooms(
            snap.docs
              .map((d) => {
                const x = d.data();
                return {
                  id: d.id,
                  ownerId: x.ownerId,
                  hostName: x.hostName || '',
                  title: x.title || 'Google Meet Room',
                  relatedDealTitle: x.relatedDealTitle || '',
                  meetingUri: x.meetingUri || '',
                  meetingCode: x.meetingCode || '',
                  visibility: 'org' as const,
                  createdAt: tsToIso(x.createdAt),
                };
              })
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'meeting_rooms')
      )
    );

    // 13. Org-Visible Sales-to-Onboarding Handoff Dossiers
    unsubs.push(
      onSnapshot(
        query(collection(db, 'handoff_dossiers'), where('visibility', '==', 'org')),
        (snap) => {
          setHandoffDossiers(
            snap.docs
              .map((d) => {
                const x = d.data();
                return {
                  id: d.id,
                  ownerId: x.ownerId,
                  dealId: x.dealId || '',
                  dealTitle: x.dealTitle || '',
                  company: x.company || '',
                  dealValue: Number(x.dealValue) || 0,
                  executiveSummary: x.executiveSummary || '',
                  stakeholders: Array.isArray(x.stakeholders) ? x.stakeholders : [],
                  promisedDeliverables: Array.isArray(x.promisedDeliverables) ? x.promisedDeliverables : [],
                  implementationRisks: Array.isArray(x.implementationRisks) ? x.implementationRisks : [],
                  onboardingTasks: Array.isArray(x.onboardingTasks) ? x.onboardingTasks : [],
                  visibility: 'org' as const,
                  createdAt: tsToIso(x.createdAt),
                };
              })
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'handoff_dossiers')
      )
    );

    // 14. Org-Visible Google News Likes
    unsubs.push(
      onSnapshot(
        query(collection(db, 'news_likes'), where('visibility', '==', 'org')),
        (snap) => {
          setNewsLikes(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                articleId: String(x.articleId || ''),
                ownerId: String(x.ownerId || ''),
                authorName: String(x.authorName || ''),
                createdAt: tsToIso(x.createdAt),
              };
            })
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'news_likes')
      )
    );

    // 15. Org-Visible Google News Comments
    unsubs.push(
      onSnapshot(
        query(collection(db, 'news_comments'), where('visibility', '==', 'org')),
        (snap) => {
          setNewsComments(
            snap.docs
              .map((d) => {
                const x = d.data();
                return {
                  id: d.id,
                  articleId: String(x.articleId || ''),
                  ownerId: String(x.ownerId || ''),
                  authorName: String(x.authorName || ''),
                  authorPhotoUrl: String(x.authorPhotoUrl || ''),
                  text: String(x.text || ''),
                  createdAt: tsToIso(x.createdAt),
                };
              })
              .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'news_comments')
      )
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [authReady, user]);

  // =========================================================================
  // Workspace Action Handlers (Dual-mode: Firestore when signed in, local otherwise)
  // =========================================================================

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      const { user: signedUser, accessToken } = await signInWithGoogleWorkspace();
      setUser(signedUser);
      setGmailToken(accessToken);
      await ensureUserProfiles(signedUser);
      await setDoc(doc(db, 'audit_logs', makeId('log')), {
        ownerId: signedUser.uid,
        actorName: sanitizeBounded(signedUser.displayName || 'Team Member', 120),
        category: 'auth',
        action: 'Signed In with Google',
        target: 'QUASAR-9 CRM & Google Workspace',
        details: accessToken
          ? 'Authenticated with Gmail, Google Meet, Calendar & Drive permissions'
          : 'Authenticated with Google account',
        visibility: 'org',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  };

  const handleSignOut = async () => {
    await recordAudit('auth', 'Signed Out', 'Session', 'Cleared active workspace session');
    await logoutWorkspace();
    setUser(null);
    setGmailToken(null);
    setEmployees([]);
    setContacts([]);
    setDeals([]);
    setTasks([]);
    setFeedPosts([]);
    setMessages([]);
    setMeetingRooms([]);
    setHandoffDossiers([]);
    setAuditLogs([]);
    setAiMemories([]);
    setAiSkills([]);
    setAiDashboards([]);
    setGameProgress({});
  };

  const handleThemeChange = async (nextTheme: ThemeId) => {
    setTheme(nextTheme);
    void recordAudit('theme', 'Changed Theme', nextTheme, `Switched workspace theme to ${nextTheme}`);
    if (user) {
      try {
        await updateDoc(doc(db, 'users_private', user.uid), {
          theme: nextTheme,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${user.uid}`);
      }
    }
  };

  const handleColorModeChange = async (nextMode: ColorMode) => {
    setColorMode(nextMode);
    void recordAudit('theme', 'Switched Color Mode', nextMode, `Switched to ${nextMode} mode`);
    if (user) {
      try {
        await updateDoc(doc(db, 'users_private', user.uid), {
          colorMode: nextMode,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${user.uid}`);
      }
    }
  };

  const handleCreatePost = async (
    caption: string,
    imageUrl: string,
    postType: FeedPost['postType'] = 'photo_post',
    taskTitle = ''
  ) => {
    const id = makeId('post');
    const nowIso = new Date().toISOString();
    const post: FeedPost = {
      id,
      ownerId: actorId,
      authorName: sanitizeBounded(actorName, 120),
      authorPhotoUrl: sanitizeBounded(currentProfile?.photoUrl || user?.photoURL || '', 200000),
      postType,
      caption: sanitizeBounded(caption, 1500),
      imageUrl: sanitizeBounded(imageUrl, 250000),
      taskTitle: sanitizeBounded(taskTitle, 200),
      likesCount: 0,
      visibility: 'org',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!user) {
      setFeedPosts((prev) => [post, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'feed_posts', id), {
          ownerId: user.uid,
          authorName: post.authorName,
          authorPhotoUrl: post.authorPhotoUrl,
          postType: post.postType,
          caption: post.caption,
          imageUrl: post.imageUrl,
          taskTitle: post.taskTitle,
          likesCount: 0,
          visibility: 'org',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `feed_posts/${id}`);
      }
    }
    void recordAudit('feed', 'Published Feed Post', post.taskTitle || 'Team Update', post.caption.slice(0, 120));
  };

  const handleLikePost = async (post: FeedPost) => {
    if (!user) {
      setFeedPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likesCount: p.likesCount + 1 } : p))
      );
    } else {
      try {
        await updateDoc(doc(db, 'feed_posts', post.id), {
          likesCount: post.likesCount + 1,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `feed_posts/${post.id}`);
      }
    }
    void recordAudit('feed', 'Appreciated Post', post.authorName, post.caption.slice(0, 80));
  };

  const handleDeletePost = async (post: FeedPost) => {
    if (!user) {
      setFeedPosts((prev) => prev.filter((p) => p.id !== post.id));
    } else {
      try {
        await deleteDoc(doc(db, 'feed_posts', post.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `feed_posts/${post.id}`);
      }
    }
    void recordAudit('feed', 'Deleted Post', post.id, post.caption.slice(0, 80));
  };

  // Persist unsigned visitor news interactions cleanly in localStorage
  useEffect(() => {
    if (user) return;
    try {
      localStorage.setItem('quasar9_news_likes_v1', JSON.stringify(newsLikes));
    } catch {
      // ignore storage quota
    }
  }, [newsLikes, user]);

  useEffect(() => {
    if (user) return;
    try {
      localStorage.setItem('quasar9_news_comments_v1', JSON.stringify(newsComments));
    } catch {
      // ignore storage quota
    }
  }, [newsComments, user]);

  useEffect(() => {
    try {
      localStorage.setItem('quasar9_news_shares_v1', JSON.stringify(newsShareCounts));
    } catch {
      // ignore storage quota
    }
  }, [newsShareCounts]);

  const handleToggleNewsLike = async (article: GoogleNewsArticle) => {
    const existing = newsLikes.find(
      (l) => l.articleId === article.id && l.ownerId === actorId
    );
    const likeId = `${article.id}_${actorId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);

    if (existing) {
      if (!user) {
        setNewsLikes((prev) => prev.filter((l) => l.id !== existing.id));
      } else {
        try {
          await deleteDoc(doc(db, 'news_likes', existing.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `news_likes/${existing.id}`);
        }
      }
      return;
    }

    const record: NewsLikeRecord = {
      id: likeId,
      articleId: article.id,
      ownerId: actorId,
      authorName: sanitizeBounded(actorName, 120),
      createdAt: new Date().toISOString(),
    };

    if (!user) {
      setNewsLikes((prev) => [record, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'news_likes', likeId), {
          ownerId: user.uid,
          articleId: article.id.slice(0, 64),
          authorName: record.authorName,
          visibility: 'org',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `news_likes/${likeId}`);
      }
    }
    void recordAudit('feed', 'Liked Google News', article.source, article.title.slice(0, 120));
  };

  const handleAddNewsComment = async (article: GoogleNewsArticle, text: string) => {
    const cleanText = sanitizeBounded(text, 1000);
    if (!cleanText) return;
    const id = makeId('nc');
    const record: NewsCommentRecord = {
      id,
      articleId: article.id,
      ownerId: actorId,
      authorName: sanitizeBounded(actorName, 120),
      authorPhotoUrl: sanitizeBounded(currentProfile?.photoUrl || user?.photoURL || '', 200000),
      text: cleanText,
      createdAt: new Date().toISOString(),
    };

    if (!user) {
      setNewsComments((prev) => [...prev, record]);
    } else {
      try {
        await setDoc(doc(db, 'news_comments', id), {
          ownerId: user.uid,
          articleId: article.id.slice(0, 64),
          authorName: record.authorName,
          authorPhotoUrl: record.authorPhotoUrl,
          text: cleanText,
          visibility: 'org',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `news_comments/${id}`);
      }
    }
    void recordAudit('feed', 'Commented on Google News', article.source, cleanText.slice(0, 120));
  };

  const handleDeleteNewsComment = async (comment: NewsCommentRecord) => {
    if (!user) {
      setNewsComments((prev) => prev.filter((c) => c.id !== comment.id));
    } else {
      try {
        await deleteDoc(doc(db, 'news_comments', comment.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `news_comments/${comment.id}`);
      }
    }
  };

  const handleShareNewsWithinOrg = async (
    article: GoogleNewsArticle,
    options: {
      note: string;
      shareToFeed: boolean;
      shareToMessages: boolean;
      recipientId: string;
    }
  ) => {
    const formattedText = buildOrgNewsShareText(article, options.note);
    if (options.shareToFeed) {
      await handleCreatePost(
        formattedText,
        article.imageUrl || '',
        'photo_post',
        `Shared Google News · ${article.source}`
      );
    }
    if (options.shareToMessages) {
      await handleSendTeamMessage(options.recipientId || 'org', formattedText);
    }
    setNewsShareCounts((prev) => ({
      ...prev,
      [article.id]: (prev[article.id] || 0) + 1,
    }));
    void recordAudit(
      'feed',
      'Shared Google News Within Org',
      article.source,
      `${options.shareToFeed ? 'Home Feed' : ''}${options.shareToFeed && options.shareToMessages ? ' + ' : ''}${options.shareToMessages ? (options.recipientId === 'org' ? '#org-general' : options.recipientId) : ''}: ${article.title.slice(0, 90)}`
    );
  };

  const handleCreateTask = async (payload: {
    title: string;
    description: string;
    priority: TaskPriority;
    dueDate: string;
    relatedDealTitle: string;
  }) => {
    const id = makeId('task');
    const nowIso = new Date().toISOString();
    const task: TaskItem = {
      id,
      ownerId: actorId,
      assigneeName: sanitizeBounded(actorName, 120),
      title: sanitizeBounded(payload.title, 200),
      description: sanitizeBounded(payload.description, 1500),
      status: 'pending',
      priority: payload.priority,
      dueDate: sanitizeBounded(payload.dueDate, 32),
      relatedDealTitle: sanitizeBounded(payload.relatedDealTitle, 160),
      visibility: 'org',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!user) {
      setTasks((prev) => [task, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'tasks', id), {
          ownerId: user.uid,
          assigneeName: task.assigneeName,
          title: task.title,
          description: task.description,
          status: 'pending',
          priority: task.priority,
          dueDate: task.dueDate,
          relatedDealTitle: task.relatedDealTitle,
          visibility: 'org',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `tasks/${id}`);
      }
    }
    void recordAudit('task', 'Created Task', task.title, `Priority: ${task.priority}`);
  };

  const handleUpdateTaskStatus = async (task: TaskItem, nextStatus: TaskStatus) => {
    const nowIso = new Date().toISOString();
    if (!user) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, updatedAt: nowIso } : t))
      );
    } else {
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
      }
    }
    void recordAudit('task', `Moved Task to ${nextStatus}`, task.title, `From ${task.status} → ${nextStatus}`);

    // Workflow automation: auto-post completed tasks chronologically to the Home Feed!
    const autoPostEnabled = workflows.find((w) => w.id === 'wf_task_to_feed')?.enabled ?? true;
    if (nextStatus === 'completed' && autoPostEnabled) {
      const captionText = task.description
        ? `Completed "${task.title}" — ${task.description}`
        : `Completed task: ${task.title}${task.relatedDealTitle ? ` (${task.relatedDealTitle})` : ''}`;
      await handleCreatePost(captionText, '', 'task_completion', task.title);
    }
  };

  const handleDeleteTask = async (task: TaskItem) => {
    if (!user) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } else {
      try {
        await deleteDoc(doc(db, 'tasks', task.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tasks/${task.id}`);
      }
    }
    void recordAudit('task', 'Deleted Task', task.title, `Was ${task.status}`);
  };

  const handleQuickCapture = async (payload: {
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
  }) => {
    const nowIso = new Date().toISOString();

    // 1. Contact (with automatic duplicate guard)
    const dedupeOn = workflows.find((w) => w.id === 'wf_dedupe_contacts')?.enabled ?? true;
    const duplicate = dedupeOn
      ? detectDuplicateContact(contacts, {
          name: payload.contactName,
          company: payload.company,
          contactEmail: payload.contactEmail,
        })
      : null;

    if (payload.contactName && !duplicate) {
      const cid = makeId('cnt');
      const contact: Contact = {
        id: cid,
        ownerId: actorId,
        name: sanitizeBounded(payload.contactName, 120),
        company: sanitizeBounded(payload.company, 120),
        contactEmail: sanitizeBounded(payload.contactEmail, 254),
        phone: sanitizeBounded(payload.phone, 40),
        lifecycleStage: payload.lifecycleStage,
        buyingRole: payload.buyingRole || 'unspecified',
        notes: '',
        visibility: 'org',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      if (!user) {
        setContacts((prev) => [contact, ...prev]);
      } else {
        try {
          await setDoc(doc(db, 'contacts', cid), {
            ownerId: user.uid,
            name: contact.name,
            company: contact.company,
            contactEmail: contact.contactEmail,
            phone: contact.phone,
            lifecycleStage: contact.lifecycleStage,
            buyingRole: contact.buyingRole,
            notes: '',
            visibility: 'org',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `contacts/${cid}`);
        }
      }
      void recordAudit('crm', 'Created Contact', contact.name, contact.company || contact.contactEmail);
    }

    // 2. Deal
    if (payload.dealTitle) {
      const did = makeId('deal');
      const stageInfo = DEAL_STAGES.find((s) => s.id === payload.dealStage);
      const deal: Deal = {
        id: did,
        ownerId: actorId,
        title: sanitizeBounded(payload.dealTitle, 160),
        company: sanitizeBounded(payload.company, 120),
        contactName: sanitizeBounded(payload.contactName, 120),
        value: Math.max(0, Number(payload.dealValue) || 0),
        probability: stageInfo?.defaultProbability ?? 35,
        stage: payload.dealStage,
        expectedCloseDate: sanitizeBounded(payload.expectedCloseDate, 32),
        visibility: 'org',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      if (!user) {
        setDeals((prev) => [deal, ...prev]);
      } else {
        try {
          await setDoc(doc(db, 'deals', did), {
            ownerId: user.uid,
            title: deal.title,
            company: deal.company,
            contactName: deal.contactName,
            value: deal.value,
            probability: deal.probability,
            stage: deal.stage,
            expectedCloseDate: deal.expectedCloseDate,
            visibility: 'org',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `deals/${did}`);
        }
      }
      void recordAudit('crm', 'Created Deal', deal.title, `${deal.company} · $${deal.value.toLocaleString()}`);
    }

    // 3. Follow-Up Task
    if (payload.followUpTaskTitle) {
      await handleCreateTask({
        title: payload.followUpTaskTitle,
        description: payload.company ? `Linked account: ${payload.company}` : '',
        priority: 'high',
        dueDate: payload.expectedCloseDate,
        relatedDealTitle: payload.dealTitle || payload.company,
      });
    }
  };

  const handleUpdateDealStage = async (deal: Deal, stage: DealStage) => {
    const stageInfo = DEAL_STAGES.find((s) => s.id === stage);
    const nextProb = stageInfo?.defaultProbability ?? deal.probability;
    const nowIso = new Date().toISOString();

    if (!user) {
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id ? { ...d, stage, probability: nextProb, updatedAt: nowIso } : d
        )
      );
    } else {
      try {
        await updateDoc(doc(db, 'deals', deal.id), {
          stage,
          probability: nextProb,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `deals/${deal.id}`);
      }
    }

    void recordAudit('crm', 'Updated Deal Stage', deal.title, `${deal.stage} → ${stage}`);

    const wonRuleOn = workflows.find((w) => w.id === 'wf_deal_won_milestone')?.enabled ?? true;
    if (stage === 'closed_won' && wonRuleOn) {
      await handleCreatePost(
        `Closed Won: ${deal.title} (${deal.company}) — $${deal.value.toLocaleString()}`,
        '',
        'milestone',
        `${deal.title} · Closed Won`
      );
    }
  };

  const handleDeleteDeal = async (deal: Deal) => {
    if (!user) {
      setDeals((prev) => prev.filter((d) => d.id !== deal.id));
    } else {
      try {
        await deleteDoc(doc(db, 'deals', deal.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `deals/${deal.id}`);
      }
    }
    void recordAudit('crm', 'Deleted Deal', deal.title, deal.company);
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!user) {
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    } else {
      try {
        await deleteDoc(doc(db, 'contacts', contact.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `contacts/${contact.id}`);
      }
    }
    void recordAudit('crm', 'Deleted Contact', contact.name, contact.company);
  };

  const handleSendTeamMessage = async (recipientId: string, text: string) => {
    const id = makeId('msg');
    const nowIso = new Date().toISOString();
    const cleanText = sanitizeBounded(text, 2000);
    const msg: TeamMessage = {
      id,
      senderId: actorId,
      senderName: sanitizeBounded(actorName, 120),
      recipientId,
      text: cleanText,
      createdAt: nowIso,
    };

    if (!user) {
      setMessages((prev) => [...prev, msg]);
    } else {
      try {
        await setDoc(doc(db, 'messages', id), {
          senderId: user.uid,
          senderName: msg.senderName,
          recipientId,
          text: cleanText,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `messages/${id}`);
      }
    }
    void recordAudit('message', 'Sent Team Message', recipientId === 'org' ? 'Org Channel' : recipientId, cleanText.slice(0, 100));
  };

  const handleSaveSystemInstructions = async (instructions: string) => {
    const clean = sanitizeBounded(instructions, 4000);
    setSystemInstructions(clean);
    if (user) {
      try {
        await updateDoc(doc(db, 'users_private', user.uid), {
          systemInstructions: clean,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${user.uid}`);
      }
    }
    void recordAudit('ai', 'Updated AI System Instructions', 'Global Prompt', `${clean.length} characters`);
  };

  const handleAddMemory = async (content: string, source: 'auto' | 'manual' = 'manual') => {
    const clean = sanitizeBounded(content, 1000);
    if (!clean) return;
    // Deduplicate near-identical memories
    if (aiMemories.some((m) => m.content.toLowerCase() === clean.toLowerCase())) return;

    const id = makeId('mem');
    const nowIso = new Date().toISOString();
    const item: AiMemoryItem = {
      id,
      ownerId: actorId,
      content: clean,
      source,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    if (!user) {
      setAiMemories((prev) => [item, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'ai_memory', id), {
          ownerId: user.uid,
          content: clean,
          source,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `ai_memory/${id}`);
      }
    }
    void recordAudit('ai', source === 'auto' ? 'Auto-Learned AI Memory' : 'Added AI Memory', source, clean.slice(0, 120));
  };

  const handleAutoLearnMemories = async (items: string[]) => {
    for (const item of items.slice(0, 2)) {
      await handleAddMemory(item, 'auto');
    }
  };

  const handleToggleMemory = async (mem: AiMemoryItem) => {
    if (!user) {
      setAiMemories((prev) => prev.map((m) => (m.id === mem.id ? { ...m, active: !m.active } : m)));
    } else {
      try {
        await updateDoc(doc(db, 'ai_memory', mem.id), {
          active: !mem.active,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `ai_memory/${mem.id}`);
      }
    }
    void recordAudit('ai', 'Toggled AI Memory', mem.active ? 'Muted' : 'Activated', mem.content.slice(0, 80));
  };

  const handleDeleteMemory = async (mem: AiMemoryItem) => {
    if (!user) {
      setAiMemories((prev) => prev.filter((m) => m.id !== mem.id));
    } else {
      try {
        await deleteDoc(doc(db, 'ai_memory', mem.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `ai_memory/${mem.id}`);
      }
    }
    void recordAudit('ai', 'Deleted AI Memory', mem.id, mem.content.slice(0, 80));
  };

  const handleAddSkill = async (payload: { name: string; domain: string; instructions: string }) => {
    const id = makeId('skill');
    const nowIso = new Date().toISOString();
    const skill: AiSkillItem = {
      id,
      ownerId: actorId,
      name: sanitizeBounded(payload.name, 120),
      domain: sanitizeBounded(payload.domain, 80),
      instructions: sanitizeBounded(payload.instructions, 2500),
      enabled: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    if (!user) {
      setAiSkills((prev) => [skill, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'ai_skills', id), {
          ownerId: user.uid,
          name: skill.name,
          domain: skill.domain,
          instructions: skill.instructions,
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `ai_skills/${id}`);
      }
    }
    void recordAudit('ai', 'Added AI Skill', skill.name, skill.domain);
  };

  const handleToggleSkill = async (skill: AiSkillItem) => {
    if (!user) {
      setAiSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s)));
    } else {
      try {
        await updateDoc(doc(db, 'ai_skills', skill.id), {
          enabled: !skill.enabled,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `ai_skills/${skill.id}`);
      }
    }
    void recordAudit('ai', 'Toggled AI Skill', skill.name, skill.enabled ? 'Disabled' : 'Enabled');
  };

  const handleDeleteSkill = async (skill: AiSkillItem) => {
    if (!user) {
      setAiSkills((prev) => prev.filter((s) => s.id !== skill.id));
    } else {
      try {
        await deleteDoc(doc(db, 'ai_skills', skill.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `ai_skills/${skill.id}`);
      }
    }
    void recordAudit('ai', 'Deleted AI Skill', skill.name, skill.domain);
  };

  const handleSaveDashboard = async (
    report: Omit<AiDashboardReport, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ): Promise<AiDashboardReport> => {
    const id = makeId('dash');
    const nowIso = new Date().toISOString();
    const full: AiDashboardReport = {
      ...report,
      id,
      ownerId: actorId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!user) {
      setAiDashboards((prev) => [full, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'ai_dashboards', id), {
          ownerId: user.uid,
          title: sanitizeBounded(report.title, 160),
          prompt: sanitizeBounded(report.prompt, 1500),
          summary: sanitizeBounded(report.summary, 2000),
          kpis: report.kpis.slice(0, 12),
          charts: report.charts.slice(0, 8),
          recommendations: report.recommendations.slice(0, 12),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `ai_dashboards/${id}`);
      }
    }
    return full;
  };

  const handleDeleteDashboard = async (report: AiDashboardReport) => {
    if (!user) {
      setAiDashboards((prev) => prev.filter((d) => d.id !== report.id));
    } else {
      try {
        await deleteDoc(doc(db, 'ai_dashboards', report.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `ai_dashboards/${report.id}`);
      }
    }
    void recordAudit('ai', 'Deleted AI Dashboard', report.title, report.id);
  };

  const handleUpdateProfile = async (updates: {
    displayName: string;
    roleTitle: string;
    department: string;
    bio: string;
    photoUrl: string;
  }) => {
    const nowIso = new Date().toISOString();
    const cleanProfile: UserPublicProfile = {
      uid: actorId,
      displayName: sanitizeBounded(updates.displayName, 120),
      roleTitle: sanitizeBounded(updates.roleTitle, 100),
      department: sanitizeBounded(updates.department, 80),
      bio: sanitizeBounded(updates.bio, 500),
      photoUrl: sanitizeBounded(updates.photoUrl, 200000),
      visibility: 'org',
      isActive: true,
      createdAt: currentProfile?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (!user) {
      setLocalProfile(cleanProfile);
    } else {
      try {
        await updateDoc(doc(db, 'users_public', user.uid), {
          displayName: cleanProfile.displayName,
          roleTitle: cleanProfile.roleTitle,
          department: cleanProfile.department,
          bio: cleanProfile.bio,
          photoUrl: cleanProfile.photoUrl,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_public/${user.uid}`);
      }
    }
    void recordAudit('profile', 'Updated Profile', cleanProfile.displayName, cleanProfile.roleTitle || 'Profile details saved');
  };

  const handleCompleteGame = async (game: SmartGame, score: number) => {
    const existingRec = gameProgress[game.id];
    const bestScore = Math.max(existingRec?.bestScore || 0, score);
    const attempts = (existingRec?.attempts || 0) + 1;
    const nowIso = new Date().toISOString();
    const docId = `${actorId}_g${game.id}`;

    if (!user) {
      setGameProgress((prev) => ({
        ...prev,
        [game.id]: {
          id: docId,
          ownerId: actorId,
          gameId: game.id,
          completed: true,
          bestScore,
          attempts,
          updatedAt: nowIso,
        },
      }));
    } else {
      try {
        await setDoc(doc(db, 'game_progress', docId), {
          ownerId: user.uid,
          gameId: game.id,
          completed: true,
          bestScore,
          attempts,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `game_progress/${docId}`);
      }
    }
    void recordAudit('game', 'Solved Smart Game', `#${game.id} ${game.title}`, `Score: ${score} pts`);
  };

  // =========================================================================
  // $0-Cost Google Meet, Drive, Hygiene, Handoff & AI Command Handlers
  // =========================================================================

  const handleSaveMeetingRoom = async (payload: {
    title: string;
    relatedDealTitle: string;
    meetingUri: string;
    meetingCode: string;
  }) => {
    const id = makeId('meet');
    const nowIso = new Date().toISOString();
    const room: GoogleMeetSpace = {
      id,
      ownerId: actorId,
      hostName: sanitizeBounded(actorName, 120),
      title: sanitizeBounded(payload.title, 160),
      relatedDealTitle: sanitizeBounded(payload.relatedDealTitle, 160),
      meetingUri: sanitizeBounded(payload.meetingUri, 500),
      meetingCode: sanitizeBounded(payload.meetingCode, 60),
      visibility: 'org',
      createdAt: nowIso,
    };

    if (!user) {
      setMeetingRooms((prev) => [room, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'meeting_rooms', id), {
          ownerId: user.uid,
          hostName: room.hostName,
          title: room.title,
          relatedDealTitle: room.relatedDealTitle,
          meetingUri: room.meetingUri,
          meetingCode: room.meetingCode,
          visibility: 'org',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `meeting_rooms/${id}`);
      }
    }
    void recordAudit('meet', 'Created Google Meet Space', room.title, room.meetingUri);
  };

  const handleDeleteMeetingRoom = async (room: GoogleMeetSpace) => {
    if (!user) {
      setMeetingRooms((prev) => prev.filter((r) => r.id !== room.id));
    } else {
      try {
        await deleteDoc(doc(db, 'meeting_rooms', room.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `meeting_rooms/${room.id}`);
      }
    }
    void recordAudit('meet', 'Deleted Meeting Room', room.title, room.meetingCode);
  };

  const handleShareMeetToTeam = async (room: GoogleMeetSpace) => {
    const shareText = `Google Meet Room live: ${room.title}${room.relatedDealTitle ? ` (${room.relatedDealTitle})` : ''} — Join: ${room.meetingUri}`;
    await handleSendTeamMessage('org', shareText);
    void recordAudit('meet', 'Shared Meet Room to Team Chat', room.title, room.meetingUri);
  };

  const handleLinkDriveDocToDeal = async (deal: Deal, docItem: LinkedDriveDoc) => {
    const existing = deal.linkedDocs || [];
    if (existing.some((d) => d.id === docItem.id)) return;
    const nextDocs = [...existing, docItem].slice(0, 12);
    const nowIso = new Date().toISOString();

    if (!user) {
      setDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, linkedDocs: nextDocs, updatedAt: nowIso } : d))
      );
    } else {
      try {
        await updateDoc(doc(db, 'deals', deal.id), {
          linkedDocs: nextDocs,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `deals/${deal.id}`);
      }
    }
    void recordAudit('drive', 'Linked Google Drive File to Deal', deal.title, docItem.name);
  };

  const handleApplyMeetingExtraction = async (extraction: MeetingCrmExtraction) => {
    if (extraction.dealTitle) {
      const existingDeal = deals.find(
        (d) => d.title.toLowerCase() === extraction.dealTitle.toLowerCase()
      );
      if (existingDeal && extraction.suggestedStage && extraction.suggestedStage !== existingDeal.stage) {
        await handleUpdateDealStage(existingDeal, extraction.suggestedStage);
      } else if (!existingDeal && extraction.dealTitle.trim()) {
        await handleQuickCapture({
          contactName: '',
          company: extraction.company || extraction.dealTitle.split('—')[0]?.trim() || 'Meeting Account',
          contactEmail: '',
          phone: '',
          lifecycleStage: 'sql',
          dealTitle: extraction.dealTitle.trim(),
          dealValue: Math.max(0, Number(extraction.estimatedValue) || 0),
          dealStage: extraction.suggestedStage || 'qualified',
          expectedCloseDate: '',
          followUpTaskTitle: '',
        });
      }
    }

    for (const t of extraction.tasks.slice(0, 6)) {
      await handleCreateTask({
        title: t.title,
        description: extraction.summary,
        priority: t.priority || 'high',
        dueDate: '',
        relatedDealTitle: extraction.dealTitle || 'Google Meet Follow-up',
      });
    }

    void recordAudit(
      'meet',
      'Applied AI Meeting Notes to CRM',
      extraction.dealTitle || 'Meeting Sync',
      `Created ${extraction.tasks.length} action item(s)`
    );
  };

  const handleSyncEmailExtractionToCrm = async (extraction: EmailCrmExtraction) => {
    await handleQuickCapture({
      contactName: extraction.contactName,
      company: extraction.company,
      contactEmail: extraction.contactEmail,
      phone: extraction.phone,
      lifecycleStage: 'sql',
      buyingRole: extraction.buyingRole,
      dealTitle: extraction.dealTitle,
      dealValue: extraction.dealValue,
      dealStage: extraction.dealStage,
      expectedCloseDate: '',
      followUpTaskTitle: extraction.followUpTaskTitle,
    });
    void recordAudit(
      'gmail',
      'AI Auto-Captured CRM Record from Gmail',
      extraction.contactName || extraction.dealTitle,
      extraction.company || extraction.contactEmail
    );
  };

  const handleMergeDuplicateContacts = async (keep: Contact, duplicates: Contact[]) => {
    const mergedCompany = keep.company || duplicates.find((d) => d.company)?.company || '';
    const mergedEmail = keep.contactEmail || duplicates.find((d) => d.contactEmail)?.contactEmail || '';
    const mergedPhone = keep.phone || duplicates.find((d) => d.phone)?.phone || '';
    const mergedRole =
      keep.buyingRole && keep.buyingRole !== 'unspecified'
        ? keep.buyingRole
        : duplicates.find((d) => d.buyingRole && d.buyingRole !== 'unspecified')?.buyingRole || 'unspecified';
    const dupIds = new Set(duplicates.map((d) => d.id));
    const nowIso = new Date().toISOString();

    if (!user) {
      setContacts((prev) =>
        prev
          .filter((c) => !dupIds.has(c.id))
          .map((c) =>
            c.id === keep.id
              ? {
                  ...c,
                  company: mergedCompany,
                  contactEmail: mergedEmail,
                  phone: mergedPhone,
                  buyingRole: mergedRole,
                  updatedAt: nowIso,
                }
              : c
          )
      );
    } else {
      try {
        await updateDoc(doc(db, 'contacts', keep.id), {
          company: mergedCompany,
          contactEmail: mergedEmail,
          phone: mergedPhone,
          buyingRole: mergedRole,
          updatedAt: serverTimestamp(),
        });
        for (const dup of duplicates) {
          await deleteDoc(doc(db, 'contacts', dup.id));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `contacts/merge/${keep.id}`);
      }
    }
    void recordAudit(
      'crm',
      'Merged Duplicate Contacts',
      keep.name,
      `Merged ${duplicates.length} duplicate record(s) into ${keep.name}`
    );
  };

  const handleSaveHandoffDossier = async (
    dossier: Omit<HandoffDossier, 'id' | 'ownerId' | 'visibility' | 'createdAt'>
  ): Promise<HandoffDossier> => {
    const id = makeId('hoff');
    const nowIso = new Date().toISOString();
    const full: HandoffDossier = {
      ...dossier,
      id,
      ownerId: actorId,
      visibility: 'org',
      createdAt: nowIso,
    };

    if (!user) {
      setHandoffDossiers((prev) => [full, ...prev]);
    } else {
      try {
        await setDoc(doc(db, 'handoff_dossiers', id), {
          ownerId: user.uid,
          dealId: full.dealId,
          dealTitle: sanitizeBounded(full.dealTitle, 160),
          company: sanitizeBounded(full.company, 120),
          dealValue: Math.max(0, Number(full.dealValue) || 0),
          executiveSummary: sanitizeBounded(full.executiveSummary, 2000),
          stakeholders: full.stakeholders.slice(0, 10),
          promisedDeliverables: full.promisedDeliverables.slice(0, 10),
          implementationRisks: full.implementationRisks.slice(0, 10),
          onboardingTasks: full.onboardingTasks.slice(0, 12),
          visibility: 'org',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `handoff_dossiers/${id}`);
      }
    }
    void recordAudit('crm', 'Generated Sales-to-Onboarding Handoff', full.dealTitle, full.company);
    return full;
  };

  const handleSpawnOnboardingTasks = async (
    dealTitle: string,
    tasksToCreate: Array<{ title: string; priority: TaskPriority; ownerRole: string }>
  ) => {
    for (const item of tasksToCreate.slice(0, 10)) {
      await handleCreateTask({
        title: item.title,
        description: `Onboarding handoff role: ${item.ownerRole}`,
        priority: item.priority || 'high',
        dueDate: '',
        relatedDealTitle: dealTitle,
      });
    }
    void recordAudit(
      'task',
      'Spawned Onboarding Handoff Tasks',
      dealTitle,
      `Created ${tasksToCreate.length} onboarding task(s)`
    );
  };

  const handleExecuteAiCommand = async (cmd: ParsedAiCommand) => {
    switch (cmd.actionType) {
      case 'navigate':
        if (cmd.targetTab) setActiveTab(cmd.targetTab);
        break;
      case 'open_meet':
        setActiveTab('meet');
        break;
      case 'run_report':
        setActiveTab('dashboard');
        break;
      case 'create_task':
        if (cmd.taskTitle) {
          await handleCreateTask({
            title: cmd.taskTitle,
            description: cmd.summary,
            priority: cmd.taskPriority || 'medium',
            dueDate: '',
            relatedDealTitle: cmd.dealTitle || cmd.company || '',
          });
          setActiveTab('tasks');
        }
        break;
      case 'create_deal':
        if (cmd.dealTitle) {
          await handleQuickCapture({
            contactName: '',
            company: cmd.company || 'New Account',
            contactEmail: '',
            phone: '',
            lifecycleStage: 'sql',
            dealTitle: cmd.dealTitle,
            dealValue: Math.max(0, Number(cmd.dealValue) || 0),
            dealStage: 'qualified',
            expectedCloseDate: '',
            followUpTaskTitle: '',
          });
          setActiveTab('crm');
        }
        break;
      case 'draft_email':
        setGmailComposePrefill({
          email: cmd.emailTo || '',
          name: '',
          subject: cmd.emailSubject || '',
          body: cmd.answerText || '',
        });
        setActiveTab('gmail');
        break;
      default:
        break;
    }
    void recordAudit('command', `AI Command: ${cmd.actionType}`, cmd.summary, cmd.answerText.slice(0, 120));
  };

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab);

  return (
    <div className="relative isolate min-h-screen flex flex-col">
      <LiquidVectorBackground theme={theme} />

      {/* Grounded Single-Row Header Ribbon:
          Technical Vector Menu Button + QUASAR-9 CRM + Aperture Appearance Button + Sign in / Sign up LAST */}
      <header className="header-ribbon sticky top-0 z-30 flex flex-col">
        {/* Top Brand & Utility Bar */}
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setNavMenuOpen((prev) => !prev)}
              aria-label={navMenuOpen ? 'Close workspace navigation matrix' : 'Open workspace navigation matrix'}
              aria-expanded={navMenuOpen}
              title="Workspace Navigation Matrix"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all cursor-pointer ${
                navMenuOpen ? 'liquid-glass-active' : 'hover:opacity-90'
              }`}
              style={
                navMenuOpen
                  ? undefined
                  : {
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }
              }
            >
              <TechnicalMenuIcon open={navMenuOpen} className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className="flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--glass-edge-warm) 100%)',
                  color: 'var(--accent-foreground)',
                  boxShadow: '0 0 14px -2px var(--glass-ambient-glow)',
                }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
                  <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-28 12 12)" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="2.6" fill="currentColor" />
                  <circle cx="18.6" cy="8.5" r="1.4" fill="currentColor" />
                </svg>
              </span>
              <span className="font-display text-base sm:text-lg font-extrabold tracking-tight whitespace-nowrap">
                QUASAR-9 CRM
              </span>
            </button>
          </div>

          {/* Right Controls: New Optical Aperture Appearance Button, then Sign in / Sign up LAST */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              aria-label="Appearance & Theme Matrix"
              title="Appearance & Themes"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs font-medium transition-opacity hover:opacity-90 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Aperture className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              <span className="hidden sm:inline">Appearance</span>
            </button>

            {user ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {currentProfile?.photoUrl || user.photoURL ? (
                    <img
                      src={currentProfile?.photoUrl || user.photoURL || ''}
                      alt={actorName}
                      referrerPolicy="no-referrer"
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {actorName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline max-w-[130px] truncate">{actorName}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-red-500/15 hover:text-red-500"
                  style={{ border: '1px solid var(--border-subtle)' }}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="inline-flex h-9 items-center gap-2 rounded-xl px-3 sm:px-3.5 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1H12v2.92h5.35c-.23 1.48-1.74 4.35-5.35 4.35-3.22 0-5.85-2.67-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.92 14.54 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.59-.06-1.05-.15-1.1Z"
                  />
                </svg>
                <span>
                  Sign in<span className="hidden sm:inline"> / Sign up</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {authError && (
        <div className="relative z-10 mx-auto mt-4 w-full max-w-[1440px] px-4 sm:px-6">
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {authError}
          </div>
        </div>
      )}

      {/* Active Module Viewport with Frosted-Glass Blur-to-Crisp Page Transition */}
      <main className="relative z-10 mx-auto w-full max-w-[1360px] flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8">
        <FoldablePageTransition
          activeTab={activeTab}
          tabLabel={activeNavMeta?.label || 'Home Feed'}
          TabIcon={activeNavMeta?.icon}
        >
          <div className="mb-6">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight leading-none">
              {activeNavMeta?.label || 'Home Feed'}
            </h1>
          </div>

            {activeTab === 'feed' && (
              <HomeFeedView
                posts={feedPosts}
                tasks={tasks}
                employees={employees}
                currentUserId={actorId}
                currentUserName={actorName}
                currentUserPhoto={currentProfile?.photoUrl || user?.photoURL || ''}
                newsLikes={newsLikes}
                newsComments={newsComments}
                newsShareCounts={newsShareCounts}
                onCreatePost={(cap, img) => handleCreatePost(cap, img, 'photo_post')}
                onLikePost={handleLikePost}
                onDeletePost={handleDeletePost}
                onToggleNewsLike={handleToggleNewsLike}
                onAddNewsComment={handleAddNewsComment}
                onDeleteNewsComment={handleDeleteNewsComment}
                onShareNewsWithinOrg={handleShareNewsWithinOrg}
                onGoToTasks={() => setActiveTab('tasks')}
              />
            )}

            {activeTab === 'dashboard' && (
              <AiDashboardView
                dashboards={aiDashboards}
                contacts={contacts}
                deals={deals}
                tasks={tasks}
                employeesCount={employees.length}
                auditLogs={auditLogs}
                memories={aiMemories}
                skills={aiSkills}
                systemInstructions={systemInstructions}
                onSaveDashboard={handleSaveDashboard}
                onDeleteDashboard={handleDeleteDashboard}
                onAutoLearnMemories={handleAutoLearnMemories}
                onLogAction={(action, target, details) => void recordAudit('ai', action, target, details)}
              />
            )}

            {activeTab === 'crm' && (
              <CrmPipelineView
                contacts={contacts}
                deals={deals}
                tasks={tasks}
                handoffDossiers={handoffDossiers}
                workflows={workflows}
                memories={aiMemories}
                skills={aiSkills}
                systemInstructions={systemInstructions}
                onQuickCapture={handleQuickCapture}
                onUpdateDealStage={handleUpdateDealStage}
                onDeleteDeal={handleDeleteDeal}
                onDeleteContact={handleDeleteContact}
                onMergeDuplicateContacts={handleMergeDuplicateContacts}
                onSaveHandoffDossier={handleSaveHandoffDossier}
                onSpawnOnboardingTasks={handleSpawnOnboardingTasks}
                onToggleWorkflow={(id) => {
                  setWorkflows((prev) =>
                    prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
                  );
                  void recordAudit('crm', 'Toggled Workflow Rule', id, 'Updated automation state');
                }}
                onEmailContact={(email, name) => {
                  setGmailComposePrefill({ email, name });
                  setActiveTab('gmail');
                }}
                onLogAction={(action, target, details) => void recordAudit('crm', action, target, details)}
              />
            )}

            {activeTab === 'meet' && (
              <MeetWorkspaceView
                accessToken={gmailToken}
                userEmail={user?.email || ''}
                actorName={actorName}
                meetingRooms={meetingRooms}
                deals={deals}
                contacts={contacts}
                tasks={tasks}
                memories={aiMemories}
                skills={aiSkills}
                systemInstructions={systemInstructions}
                onConnectGoogle={handleGoogleSignIn}
                onSaveMeetingRoom={handleSaveMeetingRoom}
                onDeleteMeetingRoom={handleDeleteMeetingRoom}
                onShareMeetToTeam={handleShareMeetToTeam}
                onLinkDriveDocToDeal={handleLinkDriveDocToDeal}
                onApplyMeetingExtraction={handleApplyMeetingExtraction}
                onDraftEmailFromMeeting={(to, subject, body) => {
                  setGmailComposePrefill({ email: to, name: '', subject, body });
                  setActiveTab('gmail');
                }}
                onLogAction={(cat, action, target, details) => void recordAudit(cat, action, target, details)}
              />
            )}

            {activeTab === 'tasks' && (
              <TasksWorkspaceView
                tasks={tasks}
                employees={employees}
                currentProfile={currentProfile}
                currentEmail={user?.email || ''}
                onCreateTask={handleCreateTask}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onDeleteTask={handleDeleteTask}
                onOpenProfile={() => setActiveTab('profile')}
              />
            )}

            {activeTab === 'gmail' && (
              <GmailWorkspaceView
                accessToken={gmailToken}
                userEmail={user?.email || ''}
                initialComposeTo={gmailComposePrefill}
                onClearInitialCompose={() => setGmailComposePrefill(null)}
                onConnectGoogle={handleGoogleSignIn}
                memories={aiMemories}
                skills={aiSkills}
                systemInstructions={systemInstructions}
                onAutoLearnMemories={handleAutoLearnMemories}
                onSyncEmailExtractionToCrm={handleSyncEmailExtractionToCrm}
                onLogAction={(action, target, details) => void recordAudit('gmail', action, target, details)}
              />
            )}

            {activeTab === 'messages' && (
              <TeamMessagesView
                currentUserId={user?.uid || null}
                currentUserName={actorName}
                employees={employees}
                messages={messages}
                onSendMessage={handleSendTeamMessage}
                onSignIn={handleGoogleSignIn}
              />
            )}

            {activeTab === 'ai-brain' && (
              <AiBrainView
                systemInstructions={systemInstructions}
                memories={aiMemories}
                skills={aiSkills}
                onSaveSystemInstructions={handleSaveSystemInstructions}
                onAddMemory={(content) => handleAddMemory(content, 'manual')}
                onToggleMemory={handleToggleMemory}
                onDeleteMemory={handleDeleteMemory}
                onAddSkill={handleAddSkill}
                onToggleSkill={handleToggleSkill}
                onDeleteSkill={handleDeleteSkill}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                currentUserId={user?.uid || null}
                profile={currentProfile}
                userEmail={user?.email || ''}
                posts={feedPosts}
                tasks={tasks}
                dashboards={aiDashboards}
                onUpdateProfile={handleUpdateProfile}
                onCreatePost={(cap, img) => handleCreatePost(cap, img, 'photo_post')}
                onSignIn={handleGoogleSignIn}
              />
            )}

            {activeTab === 'audit' && <AuditLogView logs={auditLogs} />}

            {activeTab === 'games' && (
              <SmartGamesView
                progressMap={gameProgress}
                onCompleteGame={handleCompleteGame}
              />
            )}
          </FoldablePageTransition>
      </main>

      {/* Single Floating Bottom-Right QUASAR-9 AI Chat Button */}
      {!commandBarOpen && (
        <button
          type="button"
          onClick={() => setCommandBarOpen(true)}
          aria-label="Open QUASAR-9 AI Chat"
          title="QUASAR-9 AI Chat (⌘K)"
          className="ai-chat-fab fixed right-5 bottom-5 z-40 inline-flex h-12 items-center gap-2 rounded-full px-4 text-xs font-semibold cursor-pointer"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">QUASAR-9 AI</span>
        </button>
      )}

      {/* Technical Polychromatic Liquid Glass Workspace Navigation Drawer (60% Transparent · 10% Blur) */}
      {navMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/25"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace Navigation Matrix"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNavMenuOpen(false);
          }}
        >
          <div className="liquid-elevated flex h-full w-full max-w-xs flex-col p-5 shadow-2xl">
            <div
              className="flex items-center justify-between pb-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2.5">
                <TechnicalMenuIcon open className="h-5 w-5" />
                <div>
                  <div className="font-display text-sm font-extrabold tracking-tight">QUASAR-9 CRM</div>
                  <div className="font-mono-tabular text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                    Workspace Matrix · 11 Modules
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNavMenuOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav aria-label="Workspace Drawer Navigation" className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const badgeCount =
                  item.id === 'feed'
                    ? feedPosts.length
                    : item.id === 'crm'
                    ? deals.length
                    : item.id === 'meet'
                    ? meetingRooms.length
                    : item.id === 'tasks'
                    ? tasks.filter((t) => t.status !== 'completed').length
                    : item.id === 'audit'
                    ? auditLogs.length
                    : null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setNavMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition-all ${
                      isActive ? 'liquid-glass-active font-semibold' : 'liquid-surface hover:opacity-90'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {badgeCount !== null && badgeCount > 0 && (
                      <span
                        className="font-mono-tabular rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div
              className="mt-4 pt-3 flex items-center justify-between gap-2 text-[11px]"
              style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              <span>Zero-Cost Cloud CRM</span>
              <button
                type="button"
                onClick={() => {
                  setNavMenuOpen(false);
                  setAppearanceOpen(true);
                }}
                className="font-semibold hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Themes ({THEMES.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Theme & Light/Dark Drawer */}
      <AppearanceDrawer
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        theme={theme}
        colorMode={colorMode}
        onChangeTheme={handleThemeChange}
        onChangeColorMode={handleColorModeChange}
      />

      {/* QUASAR-9 AI Chat & Command Drawer */}
      <AiCommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        contacts={contacts}
        deals={deals}
        tasks={tasks}
        memories={aiMemories}
        skills={aiSkills}
        systemInstructions={systemInstructions}
        onNavigate={(tab) => setActiveTab(tab)}
        onExecuteCommand={handleExecuteAiCommand}
      />
    </div>
  );
}
