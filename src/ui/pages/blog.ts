import type { Page } from '../../main';
import { AUTHOR, POSTS, POST_BY_SLUG } from '../../blog';
import { formatDate, h } from '../dom';
import { md } from '../markdown';

export function blogListPage(): Page {
  const tags = [...new Set(POSTS.flatMap((p) => p.tags))];
  let active = '';
  const list = h('div', { class: 'blog-grid' });
  const render = () => {
    list.replaceChildren(...POSTS.filter((p) => !active || p.tags.includes(active)).map((p) =>
      h('a', { class: 'blog-card', href: `#/blog/${p.slug}` },
        h('div', { class: 'blog-cover' }, p.cover),
        h('div', { class: 'blog-body' },
          h('p', { class: 'muted small' }, `${formatDate(p.date)} · ${p.readingMinutes} min read`),
          h('h2', null, p.title),
          h('p', null, p.summary),
          h('p', { class: 'byline' }, `By ${p.author}`),
        ),
      )));
  };
  const chips = h('div', { class: 'chips' },
    ['', ...tags].map((t) => h('button', { class: `chip-btn${t === active ? ' active' : ''}`, onclick: (e: Event) => {
      active = t;
      chips.querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
      render();
    } }, t || 'All')),
  );
  render();
  const el = h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', null, 'The NeuralCraft Blog'),
      h('p', { class: 'lead' }, `Explainers, roadmaps and notes on what's happening in AI — written by ${AUTHOR}.`),
    ),
    chips,
    list,
  );
  return { el, title: 'Blog' };
}

export function blogPostPage(slug: string): Page {
  const post = POST_BY_SLUG.get(slug);
  if (!post) {
    return { el: h('div', { class: 'page narrow' }, h('h1', null, 'Post not found'), h('a', { href: '#/blog' }, '← Back to the blog')), title: 'Not found' };
  }
  const i = POSTS.indexOf(post);
  const newer = POSTS[i - 1], older = POSTS[i + 1];
  const copy = h('button', { class: 'btn btn-ghost small', onclick: async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = '✓ Link copied';
    } catch {
      copy.textContent = location.href;
    }
  } }, '🔗 Copy link');

  const el = h('article', { class: 'page narrow post' },
    h('a', { class: 'back', href: '#/blog' }, '← All posts'),
    h('header', { class: 'post-head' },
      h('div', { class: 'post-emoji' }, post.cover),
      h('h1', null, post.title),
      h('p', { class: 'lead' }, post.summary),
      h('div', { class: 'post-meta' },
        h('span', { class: 'avatar' }, 'AR'),
        h('div', null, h('strong', null, post.author), h('div', { class: 'muted small' }, `${formatDate(post.date)} · ${post.readingMinutes} min read`)),
        copy,
      ),
      h('div', { class: 'chips' }, post.tags.map((t) => h('span', { class: 'tag' }, t))),
    ),
    h('div', { class: 'prose post-body', html: md(post.body) }),
    h('aside', { class: 'post-cta' },
      h('p', null, 'Want to build these ideas yourself?'),
      h('a', { class: 'btn btn-primary', href: '#/play' }, '▶ Open NeuralCraft'),
    ),
    h('nav', { class: 'post-nav' },
      newer ? h('a', { href: `#/blog/${newer.slug}` }, `← ${newer.title}`) : h('span'),
      older ? h('a', { href: `#/blog/${older.slug}` }, `${older.title} →`) : h('span'),
    ),
  );
  return { el, title: post.title };
}
