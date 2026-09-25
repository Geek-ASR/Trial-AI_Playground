import { LESSONS, REALM_BY_ID, nextLesson } from '../../curriculum';
import type { Lang, Lesson } from '../../curriculum/types';
import {
  BADGE_BY_ID, completeLesson, isDone, levelInfo, progress, recordRun, saveCode, setLang, type Reward,
} from '../../progress/store';
import { formatValue, matches } from '../../runtime/harness';
import { onPyStatus, run, warmPython, type PyStatus } from '../../runtime/sandbox';
import type { VoxelOp } from '../../world/ops';
import { clear, h } from '../dom';
import { md } from '../markdown';
import { createEditor, type CodeEditor } from './editor';
import { toast } from './toast';
import { VoxelPreview } from './voxelPreview';

export interface LessonViewOptions {
  mode: 'world' | 'page';
  onVisualize?: (lesson: Lesson, ops: VoxelOp[]) => void;
  onSeeInWorld?: (lesson: Lesson) => void;
  onNext?: (lesson: Lesson) => void;
  onPassed?: (lesson: Lesson, reward: Reward) => void;
}

const LANG_LABEL: Record<Lang, string> = { py: 'Python', js: 'JavaScript' };

export function celebrate(reward: Reward) {
  if (reward.xp) toast(`+${reward.xp} XP`, reward.firstTime ? 'Lesson complete!' : 'Bonus for solving it in another language.', 'reward');
  if (reward.levelUp) {
    const info = levelInfo();
    toast(`Level ${info.level}!`, `You are now a ${info.title}.`, 'reward', 6000);
  }
  for (const id of reward.badges) {
    const b = BADGE_BY_ID.get(id);
    if (b) toast(`${b.icon} Badge unlocked: ${b.name}`, b.description, 'reward', 6000);
  }
}

export function lessonView(lesson: Lesson, opts: LessonViewOptions): { el: HTMLElement; destroy(): void } {
  const realm = REALM_BY_ID.get(lesson.realm)!;
  let lang: Lang = progress().lang;
  let failures = 0;
  let hintIndex = 0;
  let editor: CodeEditor | null = null;
  let preview: VoxelPreview | null = null;
  let running = false;

  const savedFor = (l: Lang) => progress().code[lesson.id]?.[l] ?? lesson.starter[l];

  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const hints = h('div', { class: 'hints' });
  const pyBadge = h('span', { class: 'py-status' });
  const runBtn = h('button', { class: 'btn btn-primary', onclick: () => doRun() }, '▶ Run & check');
  const editorHost = h('div', { class: 'editor-host' });
  const vizHost = h('div', { class: 'viz-host' });

  const langBtns = (['py', 'js'] as Lang[]).map((l) =>
    h('button', {
      class: `seg${l === lang ? ' active' : ''}`,
      'aria-pressed': String(l === lang),
      onclick: () => switchLang(l),
    }, LANG_LABEL[l]),
  );

  function switchLang(l: Lang) {
    if (l === lang) return;
    if (editor) saveCode(lesson.id, lang, editor.get());
    lang = l;
    setLang(l);
    langBtns.forEach((b, i) => {
      const on = (['py', 'js'] as Lang[])[i] === l;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    editor?.set(savedFor(l), l);
    if (l === 'py') warmPython();
  }

  const unsubPy = onPyStatus((s: PyStatus) => {
    pyBadge.textContent =
      s === 'loading' ? '⏳ Loading Python (first run ~10 MB, cached after)…' :
      s === 'ready' ? '🐍 Python ready' :
      s === 'error' ? '⚠ Python failed to load — check your connection, or switch to JavaScript' : '';
    pyBadge.dataset.state = s;
  });

  const done = () => isDone(lesson.id);
  const status = h('span', { class: `chip ${done() ? 'chip-done' : ''}` }, done() ? '✓ Completed' : `+${lesson.xp} XP`);

  const el = h('article', { class: 'lesson' },
    h('header', { class: 'lesson-head' },
      h('div', { class: 'lesson-meta' },
        h('span', { class: 'chip', style: { background: realm.color } }, realm.name),
        h('span', { class: 'chip chip-ghost' }, lesson.level),
        status,
      ),
      h('h2', null, lesson.title),
      h('p', { class: 'lesson-summary' }, lesson.summary),
    ),
    h('section', { class: 'prose', html: md(lesson.theory) }),
    h('section', { class: 'task' }, h('h3', null, '🎯 Your mission'), h('div', { class: 'prose', html: md(lesson.task) })),
    h('div', { class: 'editor-toolbar' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Language' }, langBtns),
      pyBadge,
    ),
    editorHost,
    h('div', { class: 'lesson-actions' },
      runBtn,
      h('button', { class: 'btn', onclick: () => showHint() }, '💡 Hint'),
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => {
          if (confirm('Reset your code to the starter?')) editor?.set(lesson.starter[lang]);
        },
      }, '↺ Reset'),
      h('button', { class: 'btn btn-ghost', onclick: () => showSolution() }, '👀 Solution'),
      h('span', { class: 'kbd-hint' }, 'Ctrl/⌘ + Enter to run'),
    ),
    hints,
    results,
    lesson.viz ? h('section', { class: 'viz' }, h('h3', null, '🧊 In 3D'), h('p', { class: 'muted' }, lesson.viz.caption), vizHost) : null,
  );

  // Mount the editor once the element is in the DOM so CodeMirror can measure it.
  queueMicrotask(() => {
    editor = createEditor(editorHost, savedFor(lang), lang, {
      onRun: () => doRun(),
      onChange: debounce((code: string) => saveCode(lesson.id, lang, code), 500),
    });
    if (lang === 'py') warmPython();
  });

  if (lesson.viz && opts.mode === 'page') {
    preview = new VoxelPreview();
    vizHost.append(preview.el);
    vizHost.append(h('p', { class: 'muted small' }, 'Run your code to build this. Solve it in the world to see it on the realm\'s display pad.'));
  } else if (lesson.viz) {
    vizHost.append(h('p', { class: 'muted small' }, 'Run your code and your result is built on the display pad in the middle of this realm.'));
  }

  function showHint() {
    if (hintIndex >= lesson.hints.length) {
      hints.append(h('p', { class: 'hint muted' }, 'No more hints — try “Solution” if you are stuck. Reading a solution is also learning!'));
      return;
    }
    hints.append(h('p', { class: 'hint' }, h('strong', null, `Hint ${hintIndex + 1}: `), h('span', { html: md(lesson.hints[hintIndex]).replace(/^<p>|<\/p>\s*$/g, '') })));
    hintIndex++;
  }

  function showSolution() {
    if (failures < 1 && !done() && !confirm('Peek at the solution? Try running your own attempt first — mistakes are how models (and people) learn.')) return;
    editor?.set(lesson.solution[lang]);
  }

  async function doRun() {
    if (running || !editor) return;
    running = true;
    runBtn.disabled = true;
    runBtn.textContent = lang === 'py' ? '⏳ Running Python…' : '⏳ Running…';
    const code = editor.get();
    saveCode(lesson.id, lang, code);
    const vizCalls = lesson.viz?.calls ?? [];
    const calls = [...lesson.tests.map((t) => t.call), ...vizCalls];
    const res = await run(lang, code, calls);
    recordRun();
    running = false;
    runBtn.disabled = false;
    runBtn.textContent = '▶ Run & check';
    renderResults(res.ok, res.error, res.stdout, res.results.slice(0, lesson.tests.length), res.ms);

    // Visualise whatever the learner's code produced — even wrong answers teach something.
    if (lesson.viz && res.ok) {
      const vals = res.results.slice(lesson.tests.length).map((r) => (r.ok ? r.value : null));
      if (vals.some((v) => v !== null)) {
        try {
          const ops = lesson.viz.render(vals);
          preview?.show(ops);
          opts.onVisualize?.(lesson, ops);
        } catch {
          /* a malformed result simply isn't drawn */
        }
      }
    }
  }

  function renderResults(ok: boolean, error: string | undefined, stdout: string, rs: { ok: boolean; value?: unknown; error?: string }[], ms: number) {
    clear(results);
    if (!ok) {
      failures++;
      results.append(h('div', { class: 'result-error' }, h('strong', null, 'Your code crashed: '), h('code', null, error ?? 'unknown error')));
      if (stdout) results.append(h('pre', { class: 'stdout' }, stdout));
      return;
    }
    let passed = 0;
    const rows = lesson.tests.map((t, i) => {
      const r = rs[i];
      const good = !!r?.ok && matches(r.value, t.expect, t.tol);
      if (good) passed++;
      return h('li', { class: good ? 'pass' : 'fail' },
        h('span', { class: 'mark' }, good ? '✓' : '✗'),
        h('code', null, t.call.length > 80 ? t.call.slice(0, 77) + '…' : t.call),
        good ? null : h('div', { class: 'detail' },
          r?.ok ? ['got ', h('code', null, formatValue(r.value)), ', expected ', h('code', null, formatValue(t.expect))] : ['error: ', h('code', null, r?.error ?? '—')],
        ),
      );
    });
    const all = passed === lesson.tests.length;
    results.append(
      h('div', { class: `result-summary ${all ? 'ok' : ''}` }, `${passed}/${lesson.tests.length} tests passed · ${Math.round(ms)} ms`),
      h('ul', { class: 'tests' }, rows),
    );
    if (stdout) results.append(h('details', { open: true }, h('summary', null, 'Output'), h('pre', { class: 'stdout' }, stdout)));

    if (!all) {
      failures++;
      if (failures === 2 && hintIndex === 0) showHint();
      return;
    }

    const reward = completeLesson(lesson.id, lang);
    status.textContent = '✓ Completed';
    status.classList.add('chip-done');
    celebrate(reward);
    opts.onPassed?.(lesson, reward);
    const next = nextLesson(lesson.id);
    results.append(
      h('div', { class: 'success' },
        h('div', { class: 'success-title' }, '🎉 Nailed it!'),
        h('p', null, reward.firstTime ? `You earned ${reward.xp} XP.` : 'Already completed — nice refresher.',
          lang === 'js' ? ' Try it in Python too for a bonus.' : ' Try it in JavaScript too for a bonus.'),
        h('div', { class: 'success-actions' },
          opts.mode === 'world' && lesson.viz ? h('button', { class: 'btn btn-primary', onclick: () => opts.onSeeInWorld?.(lesson) }, '🧊 See it in the world') : null,
          next ? h('button', { class: 'btn', onclick: () => opts.onNext?.(next) }, `Next: ${next.title} →`) : h('span', null, 'That was the last lesson. You are a NeuralCrafter! 🎓'),
        ),
      ),
    );
  }

  return {
    el,
    destroy() {
      if (editor) saveCode(lesson.id, lang, editor.get());
      editor?.destroy();
      preview?.destroy();
      unsubPy();
    },
  };
}

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const lessonCount = LESSONS.length;
