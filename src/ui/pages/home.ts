import type { Page } from '../../main';
import { LESSONS, REALMS, lessonsIn } from '../../curriculum';
import { POSTS } from '../../blog';
import { isDone } from '../../progress/store';
import { formatDate, h, timeAgo } from '../dom';
import { heroCubes, isoScene } from './iso';
import { loadNews } from './news';

export function homePage(): Page {
  const newsList = h('ul', { class: 'news-mini' }, h('li', { class: 'muted' }, 'Loading the latest AI news…'));
  loadNews().then((n) => {
    const items = n.items.slice(0, 5);
    newsList.replaceChildren(
      ...(items.length
        ? items.map((it) => h('li', null,
            h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, it.title),
            h('span', { class: 'muted small' }, ` · ${it.source}${it.date ? ' · ' + timeAgo(it.date) : ''}`)))
        : [h('li', { class: 'muted' }, 'Fresh headlines from AI labs appear here after each daily build.')]),
    );
  });

  const el = h('div', { class: 'home' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero-copy' },
        h('span', { class: 'eyebrow' }, 'Free · No sign-in · Runs in your browser'),
        h('h1', null, 'Learn AI by ', h('span', { class: 'grad' }, 'building worlds'), '.'),
        h('p', { class: 'lead' },
          'NeuralCraft is a Minecraft-style 3D playground where you learn AI, machine learning and data science from scratch to advanced. Walk between realms, write real ', h('b', null, 'Python'), ' or ', h('b', null, 'JavaScript'), ' (or snap blocks together), and watch your code get built out of voxels.'),
        h('div', { class: 'cta-row' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#/play' }, '▶ Enter the world'),
          h('a', { class: 'btn btn-lg', href: '#/learn' }, 'Browse the lessons'),
        ),
        h('ul', { class: 'hero-stats' },
          h('li', null, h('b', null, String(LESSONS.length)), ' hands-on lessons'),
          h('li', null, h('b', null, String(REALMS.length)), ' realms'),
          h('li', null, h('b', null, '2'), ' languages'),
          h('li', null, h('b', null, '0'), ' accounts needed'),
        ),
      ),
      h('div', { class: 'hero-art', html: isoScene(heroCubes()) }),
    ),

    h('section', { class: 'section' },
      h('h2', null, 'How it works'),
      h('div', { class: 'steps' },
        step('1', 'Explore', 'Walk (or fly) through six realms. Every glowing beacon is a bite-sized lesson — one idea at a time.'),
        step('2', 'Code', 'Read the idea, then implement it yourself in Python or JavaScript. Tests tell you instantly if you nailed it.'),
        step('3', 'See it built', 'Your result is built from blocks on the realm’s display pad: histograms rise, boundaries spread, attention stands tall.'),
      ),
    ),

    h('section', { class: 'section' },
      h('h2', null, 'Six realms, scratch to advanced'),
      h('div', { class: 'realm-grid' },
        REALMS.map((r) => {
          const ls = lessonsIn(r.id);
          const done = ls.filter((l) => isDone(l.id)).length;
          return h('a', { class: 'realm-card', href: `#/learn?realm=${r.id}`, style: { '--realm': r.color } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'realm-dot' }),
            h('h3', null, r.name),
            h('p', null, r.tagline),
            h('div', { class: 'realm-foot' }, h('span', null, `${ls.length} lessons`), h('span', null, done ? `${done}/${ls.length} done` : '')),
          );
        }),
      ),
    ),

    h('section', { class: 'section features' },
      feature('⚒', 'The Neural Forge', 'Design a neural network, press Train, and watch the decision boundary paint itself across the world in real time.', '#/forge'),
      feature('🧱', 'Code Builder', 'Press B anywhere to build with Blockly blocks, Python or JavaScript. Plot functions, sculpt data, grow fractals.', '#/play'),
      feature('🧩→🐍', 'Blocks to real code', 'Start with drag-and-drop. One click turns your blocks into JavaScript — then graduate to Python, the language of ML.', '#/play'),
      feature('📰', 'Daily AI news', 'Headlines from the AI labs and research blogs, refreshed every day — plus explainers on the blog.', '#/news'),
      feature('🔒', 'Private by design', 'No accounts, no tracking, no server. Progress lives in your browser — export it whenever you like.', '#/about'),
      feature('🏆', 'XP, levels & badges', 'Streaks, realm badges and titles from Novice to Legend keep you coming back tomorrow.', '#/learn'),
    ),

    h('section', { class: 'section two-col' },
      h('div', null,
        h('div', { class: 'section-head' }, h('h2', null, 'From the blog'), h('a', { href: '#/blog' }, 'All posts →')),
        h('div', { class: 'post-list' }, POSTS.slice(0, 3).map((p) =>
          h('a', { class: 'post-card', href: `#/blog/${p.slug}` },
            h('span', { class: 'post-cover' }, p.cover),
            h('div', null, h('h3', null, p.title), h('p', { class: 'muted small' }, `${formatDate(p.date)} · ${p.readingMinutes} min read · ${p.author}`)),
          ))),
      ),
      h('div', null,
        h('div', { class: 'section-head' }, h('h2', null, 'Latest in AI'), h('a', { href: '#/news' }, 'All news →')),
        newsList,
      ),
    ),

    h('section', { class: 'final-cta' },
      h('h2', null, 'Your first lesson takes 2 minutes.'),
      h('p', null, 'No download, no account, no credit card. Just a world waiting to be built.'),
      h('a', { class: 'btn btn-primary btn-lg', href: '#/play' }, '▶ Start playing'),
    ),
  );
  return { el };
}

function step(n: string, title: string, body: string) {
  return h('div', { class: 'step' }, h('span', { class: 'step-n' }, n), h('h3', null, title), h('p', null, body));
}

function feature(icon: string, title: string, body: string, href: string) {
  return h('a', { class: 'feature', href }, h('span', { class: 'feature-icon' }, icon), h('h3', null, title), h('p', null, body));
}
