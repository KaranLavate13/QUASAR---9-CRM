export type NewsTopicId = 'top' | 'business' | 'technology' | 'world' | 'science';

export interface NewsRelatedCoverage {
  title: string;
  source: string;
  url: string;
}

export interface GoogleNewsArticle {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  sourceDomain: string;
  link: string;
  publishedAt: string; // ISO-8601 UTC timestamp
  topic: NewsTopicId;
  imageUrl: string;
  relatedCoverage: NewsRelatedCoverage[];
}

export interface NewsLikeRecord {
  id: string;
  articleId: string;
  ownerId: string;
  authorName: string;
  createdAt: string;
}

export interface NewsCommentRecord {
  id: string;
  articleId: string;
  ownerId: string;
  authorName: string;
  authorPhotoUrl: string;
  text: string;
  createdAt: string;
}

export interface NewsTopicMeta {
  id: NewsTopicId;
  label: string;
  rssUrl: string;
}

export const GOOGLE_NEWS_TOPICS: NewsTopicMeta[] = [
  {
    id: 'top',
    label: 'Top Stories',
    rssUrl: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'business',
    label: 'Business',
    rssUrl: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'technology',
    label: 'Technology',
    rssUrl: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'world',
    label: 'World',
    rssUrl: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'science',
    label: 'Science',
    rssUrl: 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en',
  },
];

export function isValidNewsTopic(val: string): val is NewsTopicId {
  return GOOGLE_NEWS_TOPICS.some((t) => t.id === val);
}

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic Firestore-safe ID matching ^[a-zA-Z0-9_-]+$ (max ~24 chars).
 */
export function hashArticleId(rawKey: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < rawKey.length; i++) {
    const ch = rawKey.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(36);
  const p2 = (h2 >>> 0).toString(36);
  return `gn_${p1}_${p2}`;
}

export function extractDomainFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return 'news.google.com';
  }
}

function extractTag(block: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(regex);
  return match ? match[1] : '';
}

function extractAttr(block: string, tagName: string, attrName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  const match = block.match(regex);
  return match ? match[1] : '';
}

function stripTrailingSource(title: string, source: string): string {
  const cleanTitle = title.trim();
  const cleanSource = source.trim();
  if (!cleanSource) return cleanTitle;
  const suffix = ` - ${cleanSource}`;
  if (cleanTitle.toLowerCase().endsWith(suffix.toLowerCase())) {
    return cleanTitle.slice(0, cleanTitle.length - suffix.length).trim();
  }
  return cleanTitle;
}

function extractRelatedCoverage(decodedDescription: string, primaryTitle: string): NewsRelatedCoverage[] {
  const results: NewsRelatedCoverage[] = [];
  const liMatches = decodedDescription.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
  const normalizedPrimary = primaryTitle.toLowerCase().trim();

  for (const li of liMatches) {
    const urlMatch = li.match(/href=["']([^"']+)["']/i);
    const titleMatch = li.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const sourceMatch = li.match(/<font[^>]*>([\s\S]*?)<\/font>/i);
    const title = decodeHtmlEntities((titleMatch?.[1] || '').replace(/<[^>]+>/g, ''));
    const source = decodeHtmlEntities((sourceMatch?.[1] || '').replace(/<[^>]+>/g, ''));
    const url = decodeHtmlEntities(urlMatch?.[1] || '');
    if (!title || !url || !url.startsWith('https://')) continue;
    if (title.toLowerCase().trim() === normalizedPrimary) continue;
    if (results.some((r) => r.title.toLowerCase() === title.toLowerCase())) continue;
    results.push({ title, source: source || 'Google News', url });
    if (results.length >= 3) break;
  }
  return results;
}

/**
 * Parses Google News RSS 2.0 XML into normalized articles sorted in strict
 * reverse-chronological order (newest publishedAt first).
 */
export function parseGoogleNewsRss(xml: string, topic: NewsTopicId = 'top', maxItems = 24): GoogleNewsArticle[] {
  if (!xml || typeof xml !== 'string') return [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  const articles: GoogleNewsArticle[] = [];
  const seenIds = new Set<string>();

  for (const block of itemBlocks) {
    const rawTitle = decodeHtmlEntities(extractTag(block, 'title'));
    const rawLink = decodeHtmlEntities(extractTag(block, 'link'));
    const rawGuid = decodeHtmlEntities(extractTag(block, 'guid'));
    const rawPubDate = decodeHtmlEntities(extractTag(block, 'pubDate'));
    const rawSource = decodeHtmlEntities(extractTag(block, 'source')) || 'Google News';
    const rawSourceUrl = decodeHtmlEntities(extractAttr(block, 'source', 'url'));
    const rawDesc = decodeHtmlEntities(extractTag(block, 'description'));

    if (!rawTitle || !rawLink || !rawLink.startsWith('https://')) continue;

    const cleanTitle = stripTrailingSource(rawTitle, rawSource);
    const parsedDate = Date.parse(rawPubDate);
    const publishedAt = Number.isFinite(parsedDate)
      ? new Date(parsedDate).toISOString()
      : new Date().toISOString();

    const mediaUrl =
      decodeHtmlEntities(extractAttr(block, 'media:content', 'url')) ||
      decodeHtmlEntities(extractAttr(block, 'enclosure', 'url')) ||
      decodeHtmlEntities((rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''));

    const safeImageUrl = mediaUrl.startsWith('https://') ? mediaUrl : '';
    const id = hashArticleId(rawGuid || rawLink || cleanTitle);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const relatedCoverage = extractRelatedCoverage(rawDesc, cleanTitle);

    articles.push({
      id,
      title: cleanTitle,
      source: rawSource,
      sourceUrl: rawSourceUrl.startsWith('https://') ? rawSourceUrl : 'https://news.google.com',
      sourceDomain: extractDomainFromUrl(rawSourceUrl || rawLink),
      link: rawLink,
      publishedAt,
      topic,
      imageUrl: safeImageUrl,
      relatedCoverage,
    });
  }

  // Strictly reverse-chronological (newest first)
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return articles.slice(0, maxItems);
}

export function formatRelativeNewsTime(iso: string, nowMs = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'Just now';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function buildOrgNewsShareText(article: GoogleNewsArticle, note: string): string {
  const cleanNote = note.trim();
  const header = `[Google News · ${article.source}] ${article.title}`;
  return cleanNote
    ? `${cleanNote}\n\n${header}\n${article.link}`
    : `${header}\n${article.link}`;
}

/**
 * Extracts a high-resolution HTTPS press banner image URL from a news search RSS response.
 */
export function extractBannerImageFromSearchXml(xml: string): string {
  if (!xml || typeof xml !== 'string') return '';
  const rawMatch =
    xml.match(/<News:Image>([^<]+)<\/News:Image>/i)?.[1] ||
    xml.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ||
    xml.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] ||
    '';

  const decoded = decodeHtmlEntities(rawMatch).replace(/^http:\/\//i, 'https://');
  if (!decoded.startsWith('https://')) return '';

  if (decoded.includes('bing.com/th?') && decoded.includes('pid=News') && !decoded.includes('w=')) {
    return decoded.replace(/pid=News/i, 'w=960&h=540&c=7&rs=1&p=0&pid=News');
  }
  return decoded;
}

/**
 * Generates ordered search queries (exact headline first, then concise keywords / related headline)
 * to locate the matching press banner image for a Google News story.
 */
export function buildNewsImageQueries(
  article: Pick<GoogleNewsArticle, 'title' | 'source' | 'relatedCoverage'>
): string[] {
  const queries: string[] = [];
  const cleanTitle = article.title.replace(/[“”"'‘’]/g, '').trim();
  if (cleanTitle) {
    queries.push(cleanTitle);
  }
  const words = cleanTitle.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 6) {
    const shortQuery = words.slice(0, 6).join(' ');
    if (shortQuery && shortQuery !== cleanTitle) {
      queries.push(shortQuery);
    }
  }
  const relTitle = article.relatedCoverage?.[0]?.title?.replace(/[“”"'‘’]/g, '').trim();
  if (relTitle && !queries.includes(relTitle)) {
    queries.push(relTitle);
  }
  return queries.slice(0, 2);
}

