import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  buildNewsImageQueries,
  extractBannerImageFromSearchXml,
  GOOGLE_NEWS_TOPICS,
  isValidNewsTopic,
  parseGoogleNewsRss,
  type GoogleNewsArticle,
  type NewsTopicId,
} from './src/utils/newsUtils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_ID = 'gemini-4-hydrogen';
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const BANNER_CACHE_TTL_MS = 60 * 60 * 1000;
const newsCache = new Map<NewsTopicId, { articles: GoogleNewsArticle[]; fetchedAt: string; expiresAt: number }>();
const bannerCache = new Map<string, { url: string; expiresAt: number }>();

async function resolveNewsBannerImage(article: GoogleNewsArticle): Promise<string> {
  if (article.imageUrl) return article.imageUrl;
  const cached = bannerCache.get(article.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const queries = buildNewsImageQueries(article);
  for (const query of queries) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3200);
      const searchUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const xml = await res.text();
      const bannerUrl = extractBannerImageFromSearchXml(xml);
      if (bannerUrl) {
        bannerCache.set(article.id, { url: bannerUrl, expiresAt: Date.now() + BANNER_CACHE_TTL_MS });
        return bannerUrl;
      }
    } catch {
      // try next fallback query
    }
  }

  bannerCache.set(article.id, { url: '', expiresAt: Date.now() + 10 * 60 * 1000 });
  return '';
}

async function enrichArticlesWithBanners(articles: GoogleNewsArticle[]): Promise<GoogleNewsArticle[]> {
  const BATCH_SIZE = 6;
  const enriched = [...articles];
  for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
    const slice = enriched.slice(i, i + BATCH_SIZE);
    const urls = await Promise.all(slice.map((item) => resolveNewsBannerImage(item)));
    for (let j = 0; j < slice.length; j++) {
      if (urls[j]) {
        enriched[i + j] = { ...enriched[i + j], imageUrl: urls[j] };
      }
    }
  }
  return enriched;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check the API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatErrorResponse(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API access was rejected. Please verify your API key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 503, message: raw };
  }
  return { status: 500, message: raw || 'Unexpected AI generation error.' };
}

function buildSystemInstruction(
  systemInstructions?: string,
  skills?: Array<{ name: string; domain: string; instructions: string; enabled: boolean }>,
  memories?: Array<{ content: string; active: boolean }>
): string {
  const blocks: string[] = [
    'You are the integrated AI Analyst and Copilot for QUASAR-9 CRM (Universal AI Workspace CRM).',
    'Always ground quantitative answers strictly in the provided workspace CRM snapshot. Never fabricate fictional employee names or fake historical revenue records. If the workspace has zero records, clearly note that and build a structured baseline or target projection template labeled as "Baseline Template".',
    'Keep language crisp, executive, and directly actionable.',
  ];

  if (systemInstructions && systemInstructions.trim()) {
    blocks.push(`USER GLOBAL INSTRUCTIONS:\n${systemInstructions.trim()}`);
  }

  const enabledSkills = (skills || []).filter((s) => s.enabled);
  if (enabledSkills.length > 0) {
    blocks.push(
      'ACTIVE USER AI SKILLS:\n' +
        enabledSkills
          .map((s) => `- [${s.name}${s.domain ? ` / ${s.domain}` : ''}]: ${s.instructions}`)
          .join('\n')
    );
  }

  const activeMemories = (memories || []).filter((m) => m.active);
  if (activeMemories.length > 0) {
    blocks.push(
      'PERSISTENT USER MEMORY (Learned from prior interactions):\n' +
        activeMemories.map((m) => `- ${m.content}`).join('\n')
    );
  }

  return blocks.join('\n\n');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: MODEL_ID, timestamp: new Date().toISOString() });
  });

  // Zero-Cost Public Live Google News RSS Proxy (available regardless of sign-in state)
  app.get('/api/news/google', async (req: Request, res: Response) => {
    const rawTopic = typeof req.query.topic === 'string' ? req.query.topic.toLowerCase() : 'top';
    const topic: NewsTopicId = isValidNewsTopic(rawTopic) ? rawTopic : 'top';
    const forceRefresh = req.query.refresh === '1';

    const cached = newsCache.get(topic);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      res.json({
        articles: cached.articles,
        topic,
        fetchedAt: cached.fetchedAt,
        cached: true,
      });
      return;
    }

    const topicMeta = GOOGLE_NEWS_TOPICS.find((t) => t.id === topic) ?? GOOGLE_NEWS_TOPICS[0];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const upstream = await fetch(topicMeta.rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; QUASAR9CRM/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        throw new Error(`Google News upstream responded with HTTP ${upstream.status}`);
      }

      const xml = await upstream.text();
      const parsedArticles = parseGoogleNewsRss(xml, topic, 24);
      const articles = await enrichArticlesWithBanners(parsedArticles);
      const fetchedAt = new Date().toISOString();
      newsCache.set(topic, {
        articles,
        fetchedAt,
        expiresAt: Date.now() + NEWS_CACHE_TTL_MS,
      });
      res.json({ articles, topic, fetchedAt, cached: false });
    } catch (error) {
      if (cached) {
        res.json({
          articles: cached.articles,
          topic,
          fetchedAt: cached.fetchedAt,
          cached: true,
          stale: true,
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to fetch Google News right now.';
      res.status(502).json({ error: message, articles: [], topic });
    }
  });

  // Custom AI Report & Dashboard Generator (Gemini 4 Hydrogen — Free Tier)
  app.post('/api/ai/generate-dashboard', async (req: Request, res: Response) => {
    try {
      const { prompt, crmSnapshot, memories, skills, systemInstructions } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'A prompt is required to generate a dashboard.' });
        return;
      }

      const ai = getAiClient();
      const fullSystemInstruction = buildSystemInstruction(systemInstructions, skills, memories);

      const userPayload = [
        `DASHBOARD REQUEST: ${prompt.trim()}`,
        `LIVE CRM WORKSPACE SNAPSHOT:\n${JSON.stringify(crmSnapshot ?? {}, null, 2)}`,
        'Return a complete, interactive dashboard JSON with KPIs, 1 to 3 charts (bar, line, area, or pie), concise executive summary, actionable recommendations, and 0 to 2 concise learnedMemories capturing durable user preferences or reporting focus inferred from this prompt (only if genuinely useful to remember).',
      ].join('\n\n');

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: userPayload,
        config: {
          systemInstruction: fullSystemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Clear title for the custom report or dashboard.' },
              summary: { type: Type.STRING, description: '2-3 sentence executive summary grounded in the workspace snapshot.' },
              kpis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.STRING },
                    delta: { type: Type.STRING },
                    trend: { type: Type.STRING, description: 'One of: up, down, neutral' },
                  },
                  required: ['label', 'value', 'delta', 'trend'],
                },
              },
              charts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    type: { type: Type.STRING, description: 'One of: bar, line, area, pie' },
                    data: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          value: { type: Type.NUMBER },
                          secondary: { type: Type.NUMBER },
                        },
                        required: ['name', 'value'],
                      },
                    },
                  },
                  required: ['title', 'subtitle', 'type', 'data'],
                },
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              learnedMemories: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '0 to 2 concise preferences or priorities learned from the user prompt.',
              },
            },
            required: ['title', 'summary', 'kpis', 'charts', 'recommendations', 'learnedMemories'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Model returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json({ dashboard: parsed, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // General AI CRM Assistant & Gmail Smart Reply Drafter
  app.post('/api/ai/assistant', async (req: Request, res: Response) => {
    try {
      const { prompt, contextType, emailContext, crmSnapshot, memories, skills, systemInstructions } =
        req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
      }

      const ai = getAiClient();
      const fullSystemInstruction = buildSystemInstruction(systemInstructions, skills, memories);

      const parts: string[] = [];
      if (contextType === 'gmail_reply' && emailContext) {
        parts.push(
          `TASK: Draft a polished, concise email reply in plain text (no markdown fences).`,
          `INCOMING EMAIL:\nFrom: ${emailContext.from || ''}\nSubject: ${emailContext.subject || ''}\nBody:\n${String(emailContext.body || '').slice(0, 3000)}`
        );
      } else {
        parts.push(`LIVE CRM SNAPSHOT:\n${JSON.stringify(crmSnapshot ?? {}, null, 2)}`);
      }
      parts.push(`USER PROMPT:\n${prompt.trim()}`);

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: parts.join('\n\n'),
        config: {
          systemInstruction: fullSystemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING, description: 'The complete assistant response or drafted email body.' },
              learnedMemories: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '0 to 2 concise durable user preferences or facts learned from this prompt.',
              },
            },
            required: ['reply', 'learnedMemories'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText || '{"reply":"","learnedMemories":[]}');
      res.json({ ...parsed, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 1. Zero-Entry Gmail-to-CRM Auto-Capture
  app.post('/api/ai/extract-email', async (req: Request, res: Response) => {
    try {
      const { email, memories, skills, systemInstructions } = req.body ?? {};
      if (!email) {
        res.status(400).json({ error: 'Email payload is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Extract structured CRM contact, opportunity, buying role, and next action task from this Gmail thread:\nFrom: ${email.from || ''}\nTo: ${email.to || ''}\nSubject: ${email.subject || ''}\nBody:\n${String(email.body || '').slice(0, 3500)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contactName: { type: Type.STRING },
              company: { type: Type.STRING },
              contactEmail: { type: Type.STRING },
              phone: { type: Type.STRING },
              buyingRole: { type: Type.STRING, description: 'One of: unspecified, champion, economic_buyer, technical_evaluator, influencer, blocker' },
              dealTitle: { type: Type.STRING },
              dealValue: { type: Type.NUMBER },
              dealStage: { type: Type.STRING, description: 'One of: lead, qualified, proposal, negotiation, closed_won, closed_lost' },
              followUpTaskTitle: { type: Type.STRING },
              followUpPriority: { type: Type.STRING, description: 'One of: low, medium, high, urgent' },
              summary: { type: Type.STRING },
            },
            required: ['contactName', 'company', 'contactEmail', 'phone', 'buyingRole', 'dealTitle', 'dealValue', 'dealStage', 'followUpTaskTitle', 'followUpPriority', 'summary'],
          },
        },
      });
      const extraction = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ extraction, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 2. AI MEDDPICC & Deal Risk Auditor
  app.post('/api/ai/audit-deal', async (req: Request, res: Response) => {
    try {
      const { deal, relatedContacts, relatedTasks, memories, skills, systemInstructions } = req.body ?? {};
      if (!deal) {
        res.status(400).json({ error: 'Deal payload is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Perform a rigorous enterprise MEDDPICC & deal-risk audit on this CRM deal.\nDEAL:\n${JSON.stringify(deal, null, 2)}\nRELATED CONTACTS:\n${JSON.stringify(relatedContacts ?? [], null, 2)}\nRELATED TASKS:\n${JSON.stringify(relatedTasks ?? [], null, 2)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              healthScore: { type: Type.NUMBER },
              riskLevel: { type: Type.STRING, description: 'One of: low, medium, high' },
              aiAdjustedProbability: { type: Type.NUMBER },
              singleThreadedRisk: { type: Type.BOOLEAN },
              meddpicc: {
                type: Type.OBJECT,
                properties: {
                  metrics: { type: Type.STRING },
                  economicBuyer: { type: Type.STRING },
                  decisionCriteria: { type: Type.STRING },
                  decisionProcess: { type: Type.STRING },
                  identifyPain: { type: Type.STRING },
                  champion: { type: Type.STRING },
                  competition: { type: Type.STRING },
                },
                required: ['metrics', 'economicBuyer', 'decisionCriteria', 'decisionProcess', 'identifyPain', 'champion', 'competition'],
              },
              gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
              nextBestActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['healthScore', 'riskLevel', 'aiAdjustedProbability', 'singleThreadedRisk', 'meddpicc', 'gaps', 'nextBestActions'],
          },
        },
      });
      const audit = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ audit, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 3. Automated Sales-to-Onboarding Handoff Dossier
  app.post('/api/ai/handoff-dossier', async (req: Request, res: Response) => {
    try {
      const { deal, relatedContacts, relatedTasks, memories, skills, systemInstructions } = req.body ?? {};
      if (!deal) {
        res.status(400).json({ error: 'Deal payload is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Compile a corporate Sales-to-Onboarding Handoff Dossier for Customer Success & Delivery.\nDEAL:\n${JSON.stringify(deal, null, 2)}\nCONTACTS:\n${JSON.stringify(relatedContacts ?? [], null, 2)}\nTASKS:\n${JSON.stringify(relatedTasks ?? [], null, 2)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              stakeholders: { type: Type.ARRAY, items: { type: Type.STRING } },
              promisedDeliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
              implementationRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
              onboardingTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING, description: 'One of: low, medium, high, urgent' },
                    ownerRole: { type: Type.STRING },
                  },
                  required: ['title', 'priority', 'ownerRole'],
                },
              },
            },
            required: ['executiveSummary', 'stakeholders', 'promisedDeliverables', 'implementationRisks', 'onboardingTasks'],
          },
        },
      });
      const dossier = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ dossier, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 4. Meeting Transcript / Live Voice-to-CRM Updater
  app.post('/api/ai/meeting-to-crm', async (req: Request, res: Response) => {
    try {
      const { notes, dealContext, memories, skills, systemInstructions } = req.body ?? {};
      if (!notes || typeof notes !== 'string' || !notes.trim()) {
        res.status(400).json({ error: 'Meeting notes or transcript text is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Parse these Google Meet notes / voice transcript into structured CRM updates, objections, competitors, action tasks, and a follow-up Gmail draft.\nEXISTING DEAL CONTEXT:\n${JSON.stringify(dealContext ?? null, null, 2)}\nMEETING NOTES:\n${notes.slice(0, 6000)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              dealTitle: { type: Type.STRING },
              company: { type: Type.STRING },
              suggestedStage: { type: Type.STRING, description: 'One of: lead, qualified, proposal, negotiation, closed_won, closed_lost' },
              estimatedValue: { type: Type.NUMBER },
              objections: { type: Type.ARRAY, items: { type: Type.STRING } },
              competitors: { type: Type.ARRAY, items: { type: Type.STRING } },
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING, description: 'One of: low, medium, high, urgent' },
                  },
                  required: ['title', 'priority'],
                },
              },
              followUpEmailSubject: { type: Type.STRING },
              followUpEmailBody: { type: Type.STRING },
            },
            required: ['summary', 'dealTitle', 'company', 'suggestedStage', 'estimatedValue', 'objections', 'competitors', 'tasks', 'followUpEmailSubject', 'followUpEmailBody'],
          },
        },
      });
      const extraction = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ extraction, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 5. AI Pre-Meeting Prep Brief for Google Calendar Events
  app.post('/api/ai/meeting-prep', async (req: Request, res: Response) => {
    try {
      const { event, crmSnapshot, memories, skills, systemInstructions } = req.body ?? {};
      if (!event) {
        res.status(400).json({ error: 'Calendar event payload is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Generate a crisp Pre-Meeting Prep Brief for this upcoming Google Calendar / Meet session cross-referenced with live CRM data.\nEVENT:\n${JSON.stringify(event, null, 2)}\nCRM SNAPSHOT:\n${JSON.stringify(crmSnapshot ?? {}, null, 2)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objective: { type: Type.STRING },
              talkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              discoveryQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              watchouts: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['objective', 'talkingPoints', 'discoveryQuestions', 'watchouts'],
          },
        },
      });
      const prep = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ prep, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 6. AI-Mapped Bulk CSV Importer
  app.post('/api/ai/map-csv', async (req: Request, res: Response) => {
    try {
      const { headers, sampleRows } = req.body ?? {};
      if (!Array.isArray(headers) || headers.length === 0) {
        res.status(400).json({ error: 'CSV headers are required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Map these CSV headers to standard CRM fields. Return the exact header string from the provided headers array or empty string "" if no column matches.\nHEADERS: ${JSON.stringify(headers)}\nSAMPLE ROWS: ${JSON.stringify((sampleRows || []).slice(0, 3))}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contactName: { type: Type.STRING },
              company: { type: Type.STRING },
              contactEmail: { type: Type.STRING },
              phone: { type: Type.STRING },
              dealTitle: { type: Type.STRING },
              dealValue: { type: Type.STRING },
              dealStage: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
            required: ['contactName', 'company', 'contactEmail', 'phone', 'dealTitle', 'dealValue', 'dealStage', 'notes'],
          },
        },
      });
      const mapping = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ mapping, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 7. Global Ctrl/Cmd+K Natural Language Command Interpreter
  app.post('/api/ai/command', async (req: Request, res: Response) => {
    try {
      const { query, crmSnapshot, memories, skills, systemInstructions } = req.body ?? {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Command query is required.' });
        return;
      }
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Interpret this natural-language QUASAR-9 CRM command into a single structured preview action. Valid tabs: feed, dashboard, crm, meet, tasks, gmail, messages, ai-brain, profile, audit, games.\nCOMMAND: ${query.trim()}\nCRM SNAPSHOT:\n${JSON.stringify(crmSnapshot ?? {}, null, 2)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              actionType: { type: Type.STRING, description: 'One of: navigate, create_task, create_deal, draft_email, open_meet, run_report, answer' },
              summary: { type: Type.STRING },
              answerText: { type: Type.STRING },
              targetTab: { type: Type.STRING },
              taskTitle: { type: Type.STRING },
              taskPriority: { type: Type.STRING },
              dealTitle: { type: Type.STRING },
              company: { type: Type.STRING },
              dealValue: { type: Type.NUMBER },
              emailTo: { type: Type.STRING },
              emailSubject: { type: Type.STRING },
              reportPrompt: { type: Type.STRING },
            },
            required: ['actionType', 'summary', 'answerText'],
          },
        },
      });
      const command = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({ command, model: MODEL_ID });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  // 8. On-Demand 1-Click AI Daily Manager Digest
  app.post('/api/ai/manager-digest', async (req: Request, res: Response) => {
    try {
      const { crmSnapshot, employeesCount, recentAudit, memories, skills, systemInstructions } = req.body ?? {};
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Compile a concise executive AI Daily Manager Digest from this live QUASAR-9 CRM snapshot.\nREGISTERED EMPLOYEES: ${Number(employeesCount) || 0}\nCRM SNAPSHOT:\n${JSON.stringify(crmSnapshot ?? {}, null, 2)}\nRECENT AUDIT LOGS:\n${JSON.stringify((recentAudit || []).slice(0, 15), null, 2)}`,
        config: {
          systemInstruction: buildSystemInstruction(systemInstructions, skills, memories),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              overallHealth: { type: Type.STRING, description: 'One of: on_track, watch, at_risk' },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              blockersAndRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
              workloadNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
              executiveActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['headline', 'overallHealth', 'highlights', 'blockersAndRisks', 'workloadNotes', 'executiveActions'],
          },
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({
        digest: { ...parsed, generatedAt: new Date().toISOString() },
        model: MODEL_ID,
      });
    } catch (error) {
      const { status, message } = formatErrorResponse(error);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QUASAR-9 CRM server running on http://localhost:${PORT}`);
  });
}

startServer();
