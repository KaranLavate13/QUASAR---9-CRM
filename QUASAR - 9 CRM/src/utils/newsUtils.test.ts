import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewsImageQueries,
  buildOrgNewsShareText,
  decodeHtmlEntities,
  extractBannerImageFromSearchXml,
  formatRelativeNewsTime,
  hashArticleId,
  parseGoogleNewsRss,
} from './newsUtils';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Top stories - Google News</title>
    <item>
      <title>Older Headline &amp; Analysis - Reuters</title>
      <link>https://news.google.com/rss/articles/older123</link>
      <guid isPermaLink="false">guid-older-123</guid>
      <pubDate>Mon, 23 Nov 2026 04:10:00 GMT</pubDate>
      <description>&lt;ol&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/older123"&gt;Older Headline &amp; Analysis&lt;/a&gt;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Reuters&lt;/font&gt;&lt;/li&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/rel1"&gt;Related Perspective One&lt;/a&gt;&amp;nbsp;&lt;font color="#6f6f6f"&gt;BBC&lt;/font&gt;&lt;/li&gt;&lt;/ol&gt;</description>
      <source url="https://www.reuters.com">Reuters</source>
    </item>
    <item>
      <title>Newest Breaking Tech Launch - The Verge</title>
      <link>https://news.google.com/rss/articles/newest456</link>
      <guid isPermaLink="false">guid-newest-456</guid>
      <pubDate>Mon, 23 Nov 2026 10:30:00 GMT</pubDate>
      <media:content url="https://images.example.com/launch.jpg" medium="image" />
      <description>Short summary</description>
      <source url="https://www.theverge.com">The Verge</source>
    </item>
  </channel>
</rss>`;

test('parseGoogleNewsRss sorts articles in strict reverse-chronological order and strips source suffix', () => {
  const articles = parseGoogleNewsRss(SAMPLE_RSS, 'technology');
  assert.equal(articles.length, 2);
  // Newest must come first even though it appeared second in XML
  assert.equal(articles[0].title, 'Newest Breaking Tech Launch');
  assert.equal(articles[0].source, 'The Verge');
  assert.equal(articles[0].sourceDomain, 'theverge.com');
  assert.equal(articles[0].imageUrl, 'https://images.example.com/launch.jpg');
  assert.equal(articles[0].topic, 'technology');

  assert.equal(articles[1].title, 'Older Headline & Analysis');
  assert.equal(articles[1].source, 'Reuters');
  assert.equal(articles[1].relatedCoverage.length, 1);
  assert.equal(articles[1].relatedCoverage[0].source, 'BBC');
  assert.equal(articles[1].relatedCoverage[0].title, 'Related Perspective One');
});

test('hashArticleId produces deterministic Firestore-safe IDs', () => {
  const id1 = hashArticleId('CBMiW0FVX3lxTE4zazlrTTNEV2tGd0RQYWNBcEdIendZVHNy');
  const id2 = hashArticleId('CBMiW0FVX3lxTE4zazlrTTNEV2tGd0RQYWNBcEdIendZVHNy');
  assert.equal(id1, id2);
  assert.match(id1, /^[a-zA-Z0-9_-]+$/);
  assert.ok(id1.length <= 40);
});

test('decodeHtmlEntities decodes named and numeric entities cleanly', () => {
  assert.equal(decodeHtmlEntities('AI &amp; Cloud &#8212; Q4 &quot;Boom&quot;'), 'AI & Cloud — Q4 "Boom"');
});

test('formatRelativeNewsTime formats minutes, hours, and days accurately', () => {
  const now = Date.parse('2026-11-23T12:00:00.000Z');
  assert.equal(formatRelativeNewsTime('2026-11-23T11:59:30.000Z', now), 'Just now');
  assert.equal(formatRelativeNewsTime('2026-11-23T11:42:00.000Z', now), '18m ago');
  assert.equal(formatRelativeNewsTime('2026-11-23T09:00:00.000Z', now), '3h ago');
  assert.equal(formatRelativeNewsTime('2026-11-21T12:00:00.000Z', now), '2d ago');
});

test('buildOrgNewsShareText formats optional note with article source, title, and link', () => {
  const [first] = parseGoogleNewsRss(SAMPLE_RSS, 'top');
  const withNote = buildOrgNewsShareText(first, 'Important for enterprise buyers');
  assert.ok(withNote.includes('Important for enterprise buyers'));
  assert.ok(withNote.includes('[Google News · The Verge] Newest Breaking Tech Launch'));
  assert.ok(withNote.includes('https://news.google.com/rss/articles/newest456'));
});

test('extractBannerImageFromSearchXml upgrades News:Image thumbnails to 960x540 HTTPS and handles fallbacks', () => {
  const bingXml = `<?xml version="1.0"?><rss><channel><item><News:Image>http://www.bing.com/th?id=ONUT.abc123&amp;pid=News</News:Image></item></channel></rss>`;
  assert.equal(
    extractBannerImageFromSearchXml(bingXml),
    'https://www.bing.com/th?id=ONUT.abc123&w=960&h=540&c=7&rs=1&p=0&pid=News'
  );

  const mediaXml = `<rss><item><media:content url="https://cdn.press.example/photo.jpg" /></item></rss>`;
  assert.equal(extractBannerImageFromSearchXml(mediaXml), 'https://cdn.press.example/photo.jpg');

  assert.equal(extractBannerImageFromSearchXml('<rss><item><title>No image</title></item></rss>'), '');
  assert.equal(extractBannerImageFromSearchXml(''), '');
});

test('buildNewsImageQueries returns exact headline plus concise keyword or related fallback (max 2)', () => {
  const longQueries = buildNewsImageQueries({
    title: '“Global Cloud Infrastructure Demand Accelerates Across Enterprise Banking Markets Today”',
    source: 'Reuters',
    relatedCoverage: [{ title: 'Banks Ramp Up Cloud Spending', source: 'Bloomberg', url: 'https://example.com' }],
  });
  assert.equal(longQueries.length, 2);
  assert.equal(longQueries[0], 'Global Cloud Infrastructure Demand Accelerates Across Enterprise Banking Markets Today');
  assert.equal(longQueries[1], 'Global Cloud Infrastructure Demand Accelerates Across');

  const shortWithRelated = buildNewsImageQueries({
    title: 'Orbital Launch Succeeds',
    source: 'AP',
    relatedCoverage: [{ title: 'Rocket Reaches Orbit On Time', source: 'BBC', url: 'https://example.com' }],
  });
  assert.deepEqual(shortWithRelated, ['Orbital Launch Succeeds', 'Rocket Reaches Orbit On Time']);
});

