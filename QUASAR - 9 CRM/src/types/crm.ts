export type ThemeId =
  | 'ios27'
  | 'studio'
  | 'horizon'
  | 'prism'
  | 'google'
  | 'graphite'
  | 'emerald'
  | 'titanium';
export type ColorMode = 'dark' | 'light';

export type NavTab =
  | 'feed'
  | 'dashboard'
  | 'crm'
  | 'meet'
  | 'tasks'
  | 'gmail'
  | 'messages'
  | 'ai-brain'
  | 'profile'
  | 'audit'
  | 'games';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  subtitle: string;
  swatchLight: string;
  swatchDark: string;
  accentSwatch: string;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'ios27',
    name: 'Liquid Glass',
    subtitle: '92% transparent polychromatic glass & electric azure ambient glow',
    swatchLight: '#e5eef9',
    swatchDark: '#050a14',
    accentSwatch: '#3898ff',
  },
  {
    id: 'studio',
    name: 'Studio Slate',
    subtitle: 'Deep ink developer console, crisp hairlines & cobalt focus',
    swatchLight: '#f4f6fa',
    swatchDark: '#131314',
    accentSwatch: '#669df6',
  },
  {
    id: 'horizon',
    name: 'Curved Horizon',
    subtitle: 'Ultra-rounded sculpted squircles, airy contrast & royal blue halo',
    swatchLight: '#eff3fb',
    swatchDark: '#080b14',
    accentSwatch: '#3d7eff',
  },
  {
    id: 'prism',
    name: 'Aura Prism',
    subtitle: 'Iridescent pearlescent refraction & cyan-violet aurora glow',
    swatchLight: '#f1effa',
    swatchDark: '#0d091a',
    accentSwatch: '#7c5cff',
  },
  {
    id: 'google',
    name: 'Chroma Canvas',
    subtitle: 'Clean daylight workspace optics with multi-spectrum telemetry',
    swatchLight: '#f1f6fd',
    swatchDark: '#0e131b',
    accentSwatch: '#1a73e8',
  },
  {
    id: 'graphite',
    name: 'Obsidian HUD',
    subtitle: 'Sharp precision-machined corners & teal aerospace telemetry',
    swatchLight: '#e8eef2',
    swatchDark: '#070b0f',
    accentSwatch: '#2dd4bf',
  },
  {
    id: 'emerald',
    name: 'Emerald Bio-Lab',
    subtitle: 'Scientific jade optics & deep forest bioluminescent glow',
    swatchLight: '#e6f2ec',
    swatchDark: '#04100a',
    accentSwatch: '#4ade80',
  },
  {
    id: 'titanium',
    name: 'Solar Titanium',
    subtitle: 'Anodized aerospace alloy & warm amber orbital glow',
    swatchLight: '#efeae4',
    swatchDark: '#0e0c0b',
    accentSwatch: '#f59e0b',
  },
];

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  roleTitle: string;
  department: string;
  bio: string;
  photoUrl: string;
  visibility: 'org';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPrivateProfile {
  uid: string;
  email: string;
  phone: string;
  theme: ThemeId;
  colorMode: ColorMode;
  systemInstructions: string;
  createdAt: string;
  updatedAt: string;
}

export type LifecycleStage = 'lead' | 'mql' | 'sql' | 'customer' | 'churn_risk';

export type BuyingRole =
  | 'unspecified'
  | 'champion'
  | 'economic_buyer'
  | 'technical_evaluator'
  | 'influencer'
  | 'blocker';

export interface LinkedDriveDoc {
  id: string;
  name: string;
  webViewLink: string;
  mimeType: string;
}

export interface Contact {
  id: string;
  ownerId: string;
  name: string;
  company: string;
  contactEmail: string;
  phone: string;
  lifecycleStage: LifecycleStage;
  buyingRole?: BuyingRole;
  notes: string;
  visibility: 'org' | 'private';
  createdAt: string;
  updatedAt: string;
}

export type DealStage =
  | 'lead'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface Deal {
  id: string;
  ownerId: string;
  title: string;
  company: string;
  contactName: string;
  value: number;
  probability: number;
  stage: DealStage;
  expectedCloseDate: string;
  linkedDocs?: LinkedDriveDoc[];
  visibility: 'org' | 'private';
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'pending' | 'working' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskItem {
  id: string;
  ownerId: string;
  assigneeName: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  relatedDealTitle: string;
  visibility: 'org' | 'private';
  createdAt: string;
  updatedAt: string;
}

export type FeedPostType = 'task_completion' | 'photo_post' | 'milestone';

export interface FeedPost {
  id: string;
  ownerId: string;
  authorName: string;
  authorPhotoUrl: string;
  postType: FeedPostType;
  caption: string;
  imageUrl: string;
  taskTitle: string;
  likesCount: number;
  visibility: 'org';
  createdAt: string;
  updatedAt: string;
}

export interface TeamMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string; // 'org' for org channel or target user uid
  text: string;
  createdAt: string;
}

export type AuditCategory =
  | 'auth'
  | 'crm'
  | 'meet'
  | 'calendar'
  | 'drive'
  | 'task'
  | 'feed'
  | 'gmail'
  | 'message'
  | 'ai'
  | 'command'
  | 'profile'
  | 'game'
  | 'theme';

export interface AuditLogEntry {
  id: string;
  ownerId: string;
  actorName: string;
  category: AuditCategory;
  action: string;
  target: string;
  details: string;
  visibility: 'org';
  createdAt: string;
}

export interface AiMemoryItem {
  id: string;
  ownerId: string;
  content: string;
  source: 'auto' | 'manual';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiSkillItem {
  id: string;
  ownerId: string;
  name: string;
  domain: string;
  instructions: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'neutral';
}

export interface DashboardChart {
  title: string;
  subtitle: string;
  type: 'bar' | 'line' | 'area' | 'pie';
  data: Array<{ name: string; value: number; secondary?: number }>;
}

export interface AiDashboardReport {
  id: string;
  ownerId: string;
  title: string;
  prompt: string;
  summary: string;
  kpis: DashboardKpi[];
  charts: DashboardChart[];
  recommendations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GameProgressRecord {
  id: string;
  ownerId: string;
  gameId: number;
  completed: boolean;
  bestScore: number;
  attempts: number;
  updatedAt: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  unread: boolean;
}

export interface WorkflowRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

export interface GoogleMeetSpace {
  id: string;
  ownerId: string;
  hostName: string;
  title: string;
  relatedDealTitle: string;
  meetingUri: string;
  meetingCode: string;
  visibility: 'org';
  createdAt: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  meetLink: string;
  htmlLink: string;
  attendees: string[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  modifiedTime: string;
}

export interface DealAiAudit {
  healthScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  aiAdjustedProbability: number;
  singleThreadedRisk: boolean;
  meddpicc: {
    metrics: string;
    economicBuyer: string;
    decisionCriteria: string;
    decisionProcess: string;
    identifyPain: string;
    champion: string;
    competition: string;
  };
  gaps: string[];
  nextBestActions: string[];
}

export interface HandoffDossier {
  id: string;
  ownerId: string;
  dealId: string;
  dealTitle: string;
  company: string;
  dealValue: number;
  executiveSummary: string;
  stakeholders: string[];
  promisedDeliverables: string[];
  implementationRisks: string[];
  onboardingTasks: Array<{
    title: string;
    priority: TaskPriority;
    ownerRole: string;
  }>;
  visibility: 'org';
  createdAt: string;
}

export interface EmailCrmExtraction {
  contactName: string;
  company: string;
  contactEmail: string;
  phone: string;
  buyingRole: BuyingRole;
  dealTitle: string;
  dealValue: number;
  dealStage: DealStage;
  followUpTaskTitle: string;
  followUpPriority: TaskPriority;
  summary: string;
}

export interface MeetingCrmExtraction {
  summary: string;
  dealTitle: string;
  company: string;
  suggestedStage: DealStage;
  estimatedValue: number;
  objections: string[];
  competitors: string[];
  tasks: Array<{ title: string; priority: TaskPriority }>;
  followUpEmailSubject: string;
  followUpEmailBody: string;
}

export interface ManagerDigestReport {
  headline: string;
  overallHealth: 'on_track' | 'watch' | 'at_risk';
  highlights: string[];
  blockersAndRisks: string[];
  workloadNotes: string[];
  executiveActions: string[];
  generatedAt: string;
}
