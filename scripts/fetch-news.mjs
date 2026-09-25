#!/usr/bin/env node
/**
 * Fetch AI news from public RSS/Atom feeds and write public/news.json.
 * Runs in CI before every build (and daily on a schedule), so the site stays
 * current without any server. If every feed fails, the existing file is kept.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mergeItems, parseFeed } from './news-lib.mjs';

const root = new URL('..', import.meta.url);
const feeds = JSON.parse(await readFile(new URL('scripts/feeds.json', root), 'utf8'));
const outFile = fileURLToPath(new URL('public/news.json', root));

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'NeuralCraftNewsBot/1.0 (+https://github.com/Geek-ASR/Trial-AI_Playground)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text(), feed);
    console.log(`✓ ${feed.name}: ${items.length} items`);
    return { ok: true, items };
  } catch (e) {
    console.warn(`✗ ${feed.name}: ${e.message}`);
    return { ok: false, items: [] };
  } finally {
    clearTimeout(t);
  }
}

const results = await Promise.all(feeds.map(fetchFeed));
const okCount = results.filter((r) => r.ok).length;
if (okCount === 0) {
  console.warn('No feeds could be fetched; keeping the existing news.json.');
  process.exit(0);
}
const items = mergeItems(results.map((r) => r.items));
const payload = {
  updated: new Date().toISOString(),
  sources: feeds.map((f, i) => ({ name: f.name, kind: f.kind, ok: results[i].ok })),
  items,
};
await writeFile(outFile, JSON.stringify(payload, null, 1) + '\n');
console.log(`Wrote ${items.length} items from ${okCount}/${feeds.length} feeds to public/news.json`);
