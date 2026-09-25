import type { Page } from '../../main';
import { h, timeAgo } from '../dom';

export interface NewsItem {
  title: string;
  url: string;
  date: string | null;
  summary: string;
  source: string;
  kind: string;
}

export interface NewsFeed {
  updated: string | null;
  sources: { name: string; kind: string; ok: boolean }[];
  items: NewsItem[];
}

let cache: Promise<NewsFeed> | null = null;

export function loadNews(): Promise<NewsFeed> {
  cache ??= fetch('./news.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch(() => ({ updated: null, sources: [], items: [] }));
  return cache;
}

export function newsPage(): Page {
  const list = h('div', { class: 'news-list' }, h('p', { class: 'muted' }, 'Loading…'));
  const chips = h('div', { class: 'chips' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search headlines…', 'aria-label': 'Search headlines' });
  const updated = h('p', { class: 'muted small' });
  let source = 'All';
  let feed: NewsFeed = { updated: null, sources: [], items: [] };

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const items = feed.items.filter((i) => (source === 'All' || i.source === source) && (!q || `${i.title} ${i.summary}`.toLowerCase().includes(q)));
    list.replaceChildren(
      ...(items.length
        ? items.map((i) =>
            h('article', { class: 'news-item' },
              h('div', { class: 'news-meta' }, h('span', { class: `tag tag-${i.kind}` }, i.source), i.date ? h('time', { datetime: i.date }, timeAgo(i.date)) : null),
              h('h3', null, h('a', { href: i.url, target: '_blank', rel: 'noopener noreferrer' }, i.title)),
              i.summary ? h('p', null, i.summary) : null,
            ))
        : [h('div', { class: 'empty' },
            h('p', null, feed.items.length ? 'Nothing matches that filter.' : 'The news feed is refreshed automatically every day when the site is built.'),
            feed.items.length ? null : h('p', { class: 'muted small' }, 'Running locally? Use ', h('code', null, 'npm run news'), ' to fetch the latest headlines.'),
          )]),
    );
  };

  search.addEventListener('input', render);

  loadNews().then((f) => {
    feed = f;
    updated.textContent = f.updated ? `Updated ${timeAgo(f.updated)} from ${f.sources.filter((s) => s.ok).length} sources.` : '';
    const names = ['All', ...new Set(f.items.map((i) => i.source))];
    chips.replaceChildren(...names.map((n) =>
      h('button', { class: `chip-btn${n === source ? ' active' : ''}`, onclick: (e: Event) => {
        source = n;
        chips.querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
        render();
      } }, n)));
    render();
  });

  const el = h('div', { class: 'page narrow' },
    h('header', { class: 'page-head' },
      h('h1', null, 'AI News'),
      h('p', { class: 'lead' }, 'Fresh headlines from AI labs, research groups and engineering blogs — curated by Aditya Rekhe and refreshed daily. Every link goes to the original source.'),
      updated,
    ),
    h('div', { class: 'news-tools' }, search, chips),
    list,
  );
  return { el, title: 'AI News' };
}
