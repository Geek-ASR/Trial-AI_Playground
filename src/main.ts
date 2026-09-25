import './styles/main.css';
import { levelInfo, subscribe } from './progress/store';
import { h } from './ui/dom';
import { aboutPage } from './ui/pages/about';
import { blogListPage, blogPostPage } from './ui/pages/blog';
import { homePage } from './ui/pages/home';
import { newsPage } from './ui/pages/news';
import { startRouter, type Route } from './ui/router';

export interface Page {
  el: HTMLElement;
  title?: string;
  destroy?: () => void;
}

const levelChip = h('a', { class: 'level-chip', href: '#/learn', title: 'Your progress (saved in this browser)' });
function renderLevel() {
  const info = levelInfo();
  levelChip.replaceChildren(
    h('span', { class: 'lvl' }, `Lv ${info.level}`),
    h('span', { class: 'lvl-title' }, info.title),
    h('span', { class: 'xpbar' }, h('span', { style: { width: `${Math.round(info.frac * 100)}%` } })),
  );
}
renderLevel();
subscribe(renderLevel);

const NAV: [string, string][] = [
  ['play', 'Play'],
  ['learn', 'Learn'],
  ['forge', 'Neural Forge'],
  ['functions', 'Function Lab'],
  ['blog', 'Blog'],
  ['news', 'AI News'],
  ['about', 'About'],
];

const navLinks = NAV.map(([id, label]) => h('a', { href: `#/${id}`, 'data-route': id }, label));
const menuBtn = h('button', { class: 'menu-btn', 'aria-label': 'Menu', onclick: () => header.classList.toggle('menu-open') }, '☰');
const header = h('header', { class: 'site-header' },
  h('a', { class: 'brand', href: '#/' }, h('img', { src: './favicon.svg', alt: '', width: 28, height: 28 }), h('span', null, 'Neural', h('b', null, 'Craft'))),
  h('nav', { class: 'site-nav', 'aria-label': 'Main' }, navLinks),
  levelChip,
  menuBtn,
);
const main = h('main', { id: 'view', tabindex: '-1' });
const footer = h('footer', { class: 'site-footer' },
  h('div', null,
    h('strong', null, 'NeuralCraft'), ' — free, open, no sign-in. Built by ',
    h('a', { href: 'https://github.com/Geek-ASR', target: '_blank', rel: 'noopener' }, 'Aditya Rekhe'), '.',
  ),
  h('div', { class: 'muted' }, 'Your progress is stored only in this browser. © 2026 Aditya Rekhe · MIT License'),
);

document.getElementById('app')!.append(header, main, footer);

let current: Page | null = null;
let renderId = 0;
let playLoaded = false;

// Heavy routes (3D engine, code editor, Blockly) are split into their own chunks.
const loadPlay = () => import('./ui/pages/play');
const loadLearn = () => import('./ui/pages/learn');
const loadForge = () => import('./ui/pages/forge');
const loadFunctions = () => import('./ui/pages/functions');

async function render(route: Route) {
  const id = ++renderId;
  header.classList.remove('menu-open');
  navLinks.forEach((a) => a.classList.toggle('active', a.dataset.route === route.name));
  current?.destroy?.();
  current = null;
  main.replaceChildren();

  if (route.name === 'play') {
    playLoaded = true;
    document.body.classList.add('playing');
    document.title = 'Play · NeuralCraft';
    (await loadPlay()).showPlay(route.params[0]);
    return;
  }
  document.body.classList.remove('playing');
  if (playLoaded) (await loadPlay()).hidePlay();

  let page: Page;
  switch (route.name) {
    case 'learn': {
      const m = await loadLearn();
      page = route.params[0] ? m.lessonPage(route.params[0]) : m.learnPage();
      break;
    }
    case 'forge':
      page = (await loadForge()).forgePage();
      break;
    case 'functions':
      page = (await loadFunctions()).functionsPage();
      break;
    case 'blog':
      page = route.params[0] ? blogPostPage(route.params[0]) : blogListPage();
      break;
    case 'news':
      page = newsPage();
      break;
    case 'about':
      page = aboutPage();
      break;
    default:
      page = homePage();
  }
  if (id !== renderId) {
    page.destroy?.();
    return;
  }
  current = page;
  main.append(page.el);
  document.title = page.title ? `${page.title} · NeuralCraft` : 'NeuralCraft — learn AI by building worlds';
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

startRouter(render);
