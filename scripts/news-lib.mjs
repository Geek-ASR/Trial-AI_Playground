import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', cdataPropName: '#cdata' });

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  return text(v['#cdata'] ?? v['#text'] ?? '');
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function clean(html, max = 260) {
  let s = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => {
      if (ENTITIES[e]) return ENTITIES[e];
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
      return m;
    })
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return s;
}

function link(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const alt = v.find((l) => l['@rel'] === 'alternate' || !l['@rel']) ?? v[0];
    return link(alt);
  }
  return v['@href'] ?? text(v);
}

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into normalised items. */
export function parseFeed(xml, source) {
  const doc = parser.parse(xml);
  const rss = doc.rss?.channel;
  const atom = doc.feed;
  const rdf = doc['rdf:RDF'];
  let raw = [];
  if (rss) raw = [].concat(rss.item ?? []);
  else if (atom) raw = [].concat(atom.entry ?? []);
  else if (rdf) raw = [].concat(rdf.item ?? []);

  return raw
    .map((it) => {
      const url = link(it.link) || text(it.guid);
      const date = text(it.pubDate ?? it.published ?? it.updated ?? it['dc:date']);
      const d = new Date(date);
      return {
        title: clean(text(it.title), 200),
        url: /^https?:\/\//.test(url) ? url : '',
        date: Number.isNaN(d.getTime()) ? null : d.toISOString(),
        summary: clean(text(it.description ?? it.summary ?? it['content:encoded'] ?? it.content)),
        source: source.name,
        kind: source.kind,
      };
    })
    .filter((it) => it.title && it.url);
}

/** Merge items from all feeds: newest first, de-duplicated, capped per source. */
export function mergeItems(lists, { perSource = 8, total = 90, now = Date.now() } = {}) {
  const seen = new Set();
  const out = [];
  const perCount = new Map();
  const all = lists.flat().filter((i) => !i.date || new Date(i.date).getTime() <= now + 86400000);
  all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  for (const item of all) {
    const key = item.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    const n = perCount.get(item.source) ?? 0;
    if (n >= perSource) continue;
    seen.add(key);
    perCount.set(item.source, n + 1);
    out.push(item);
    if (out.length >= total) break;
  }
  return out;
}
