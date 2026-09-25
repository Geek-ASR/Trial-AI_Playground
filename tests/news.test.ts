import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM helper shared with the Node build script
import { clean, mergeItems, parseFeed } from '../scripts/news-lib.mjs';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Lab</title>
<item><title>New model &amp; eval</title><link>https://example.com/a?utm=1</link><pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>We release <b>things</b>.</p>]]></description></item>
<item><title>Older</title><link>https://example.com/b</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
<entry><title type="html">Atom post</title><link rel="alternate" href="https://example.org/post"/><updated>2026-09-24T08:00:00Z</updated><summary>Short &lt;i&gt;summary&lt;/i&gt;</summary></entry>
</feed>`;

describe('news feed parsing', () => {
  it('parses RSS 2.0', () => {
    const items = parseFeed(RSS, { name: 'Lab', kind: 'lab' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'New model & eval', url: 'https://example.com/a?utm=1', summary: 'We release things .', source: 'Lab' });
    expect(items[0].date).toBe('2026-09-22T10:00:00.000Z');
  });

  it('parses Atom', () => {
    const [item] = parseFeed(ATOM, { name: 'Blog', kind: 'research' });
    expect(item).toMatchObject({ title: 'Atom post', url: 'https://example.org/post', summary: 'Short summary' });
  });

  it('merges newest first, de-duplicates and caps per source', () => {
    const a = parseFeed(RSS, { name: 'Lab', kind: 'lab' });
    const b = parseFeed(ATOM, { name: 'Blog', kind: 'research' });
    const merged = mergeItems([a, b, a], { perSource: 1, now: Date.parse('2026-09-25') });
    expect(merged.map((i: { title: string }) => i.title)).toEqual(['Atom post', 'New model & eval']);
  });

  it('cleans html and truncates', () => {
    expect(clean('<p>a &amp; b</p>')).toBe('a & b');
    expect(clean('word '.repeat(100), 20).endsWith('…')).toBe(true);
  });
});
