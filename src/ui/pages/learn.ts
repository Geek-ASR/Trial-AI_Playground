import type { Page } from '../../main';
import { LESSONS, LESSON_BY_ID, REALMS, REALM_BY_ID, TOTAL_XP, lessonsIn } from '../../curriculum';
import {
  BADGES, exportProgress, importProgress, isDone, levelInfo, progress, resetProgress, subscribe,
} from '../../progress/store';
import { lessonView } from '../components/lessonView';
import { toast } from '../components/toast';
import { h } from '../dom';
import { navigate } from '../router';

export function learnPage(): Page {
  const summary = h('section', { class: 'progress-card' });

  const renderSummary = () => {
    const p = progress();
    const info = levelInfo();
    const done = LESSONS.filter((l) => isDone(l.id)).length;
    summary.replaceChildren(
      h('div', { class: 'pc-level' },
        h('div', { class: 'pc-badge' }, String(info.level)),
        h('div', null,
          h('div', { class: 'pc-title' }, info.title),
          h('div', { class: 'xpbar big' }, h('span', { style: { width: `${Math.round(info.frac * 100)}%` } })),
          h('div', { class: 'muted small' }, info.next ? `${p.xp} XP · ${info.next - p.xp} XP to level ${info.level + 1}` : `${p.xp} XP · max level!`),
        ),
      ),
      h('div', { class: 'pc-stats' },
        stat(`${done}/${LESSONS.length}`, 'lessons'),
        stat(`${p.xp}/${TOTAL_XP}`, 'lesson XP'),
        stat(`${p.streak.count}🔥`, 'day streak'),
        stat(String(Object.keys(p.badges).filter((b) => BADGES.some((d) => d.id === b)).length), 'badges'),
      ),
      h('div', { class: 'badges' },
        BADGES.map((b) => h('span', { class: `badge ${p.badges[b.id] ? 'earned' : ''}`, title: `${b.name} — ${b.description}` }, b.icon)),
      ),
      h('div', { class: 'pc-actions' },
        h('button', { class: 'btn small', onclick: () => {
          const blob = new Blob([exportProgress()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'neuralcraft-progress.json' });
          a.click();
          URL.revokeObjectURL(a.href);
        } }, '⬇ Export progress'),
        h('label', { class: 'btn small' }, '⬆ Import',
          (() => {
            const input = h('input', { type: 'file', accept: 'application/json', hidden: true });
            input.addEventListener('change', async () => {
              const f = input.files?.[0];
              if (!f) return;
              const ok = importProgress(await f.text());
              toast(ok ? 'Progress imported' : 'That file is not a NeuralCraft save', '', ok ? 'success' : 'error');
            });
            return input;
          })(),
        ),
        h('button', { class: 'btn btn-ghost small', onclick: () => {
          if (confirm('Reset all XP, badges and saved code? This cannot be undone.')) resetProgress();
        } }, 'Reset'),
      ),
    );
  };
  renderSummary();
  const unsub = subscribe(renderSummary);

  const el = h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', null, 'Learn'),
      h('p', { class: 'lead' }, 'Every lesson is a station in the 3D world — or do them right here. Pick up anywhere; beginners should start at the top.'),
    ),
    summary,
    REALMS.map((r) =>
      h('section', { class: 'realm-section', id: `realm-${r.id}`, style: { '--realm': r.color } as Partial<CSSStyleDeclaration> },
        h('div', { class: 'realm-head' },
          h('div', null, h('h2', null, r.name), h('p', { class: 'muted' }, r.tagline)),
          h('a', { class: 'btn small', href: `#/play/${r.id}` }, '🧊 Go there in 3D'),
        ),
        h('ol', { class: 'lesson-list' },
          lessonsIn(r.id).map((l) =>
            h('li', { class: isDone(l.id) ? 'done' : '' },
              h('a', { href: `#/learn/${l.id}` },
                h('span', { class: 'check' }, isDone(l.id) ? '✓' : ''),
                h('span', { class: 'l-title' }, l.title),
                h('span', { class: 'l-summary muted' }, l.summary),
                h('span', { class: `lvl-tag ${l.level}` }, l.level),
                h('span', { class: 'xp muted small' }, `+${l.xp} XP`),
              ),
            )),
          r.id === 'neural' ? h('li', null, h('a', { href: '#/forge' }, h('span', { class: 'check' }, '⚒'), h('span', { class: 'l-title' }, 'Neural Forge'), h('span', { class: 'l-summary muted' }, 'Train a neural network live — no code needed.'))) : null,
        ),
      )),
  );

  const realm = new URLSearchParams(location.hash.split('?')[1] ?? '').get('realm');
  if (realm) requestAnimationFrame(() => document.getElementById(`realm-${realm}`)?.scrollIntoView({ behavior: 'smooth' }));

  return { el, title: 'Learn', destroy: unsub };
}

function stat(value: string, label: string) {
  return h('div', { class: 'stat' }, h('strong', null, value), h('span', null, label));
}

export function lessonPage(id: string): Page {
  const lesson = LESSON_BY_ID.get(id);
  if (!lesson) return { el: h('div', { class: 'page narrow' }, h('h1', null, 'Lesson not found'), h('a', { href: '#/learn' }, '← All lessons')), title: 'Not found' };
  const realm = REALM_BY_ID.get(lesson.realm)!;
  const idx = LESSONS.indexOf(lesson);
  const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
  const view = lessonView(lesson, { mode: 'page', onNext: (n) => navigate(`learn/${n.id}`) });
  const el = h('div', { class: 'page lesson-page' },
    h('nav', { class: 'crumbs' },
      h('a', { href: '#/learn' }, 'Learn'), ' / ', h('a', { href: `#/learn?realm=${realm.id}` }, realm.name), ' / ', h('span', null, lesson.title),
      h('a', { class: 'btn small', href: `#/play/${lesson.id}` }, '🧊 Do it in the 3D world'),
    ),
    view.el,
    h('nav', { class: 'post-nav' },
      prev ? h('a', { href: `#/learn/${prev.id}` }, `← ${prev.title}`) : h('span'),
      next ? h('a', { href: `#/learn/${next.id}` }, `${next.title} →`) : h('span'),
    ),
  );
  return { el, title: lesson.title, destroy: view.destroy };
}
