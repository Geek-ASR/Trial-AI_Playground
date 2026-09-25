import { CODE_CHALLENGES, CODE_TOLERANCE, type CodeChallenge } from '../../challenges/code';
import { isCorrect, mathQuestion, type MathQuestion } from '../../challenges/math';
import { QUIZ, type QuizQuestion } from '../../challenges/quiz';
import type { Lang } from '../../curriculum/types';
import { answer, creditState, onCredits, streakMultiplier } from '../../progress/credits';
import { progress } from '../../progress/store';
import { formatValue, matches } from '../../runtime/harness';
import { run } from '../../runtime/sandbox';
import { h } from '../dom';
import { createEditor, type CodeEditor } from './editor';

type Tab = 'quiz' | 'math' | 'code';
const QUIZ_REWARD = 5;

export interface ChallengeHooks {
  /** Fired with the credits won so the world can celebrate. */
  onReward?: (credits: number) => void;
}

/** “Earn blocks”: answer questions and solve code tasks to get block credits for building. */
export function challengeView(hooks: ChallengeHooks = {}, start: Tab = 'quiz'): { el: HTMLElement; destroy(): void } {
  let tab: Tab = start;
  let editor: CodeEditor | null = null;
  const seenQuiz = new Set<string>();

  const balance = h('div', { class: 'cred-balance' });
  const renderBalance = () => {
    const s = creditState();
    balance.replaceChildren(
      h('span', { class: 'cred-big' }, `🧱 ${s.credits.toLocaleString()}`),
      h('span', { class: 'muted small' }, `block credits · streak ${s.streak}${s.streak ? ` (+${Math.round((streakMultiplier() - 1) * 100)}% bonus)` : ''} · best ${s.best}`),
    );
  };
  renderBalance();
  const unsub = onCredits(renderBalance);

  const body = h('div', { class: 'cred-body' });
  const tabs = (['quiz', 'math', 'code'] as Tab[]).map((t) =>
    h('button', { class: `seg${t === tab ? ' active' : ''}`, onclick: () => show(t) }, t === 'quiz' ? `🧠 Quiz · ${QUIZ_REWARD}` : t === 'math' ? '➗ Maths · 4–8' : '💻 Code · 12–35'),
  );

  const el = h('div', { class: 'credits-panel' },
    h('header', { class: 'panel-title' },
      h('h2', null, '⚡ Earn blocks'),
      h('p', { class: 'muted' }, 'Every block you place costs a credit (glowing blocks cost 3). Earn credits by answering questions and writing code — keep a streak going for up to double rewards. Spend them anywhere, especially in your Playground.'),
    ),
    balance,
    h('div', { class: 'segmented' }, tabs),
    body,
  );

  const reward = (n: number) => {
    if (n > 0) hooks.onReward?.(n);
  };
  const feedback = (ok: boolean, text: string, won = 0) =>
    h('div', { class: `cred-feedback ${ok ? 'ok' : 'bad'}` },
      h('strong', null, ok ? `✓ Correct! +${won} 🧱` : '✗ Not quite — streak reset'),
      h('p', null, text));

  function show(t: Tab) {
    tab = t;
    tabs.forEach((b, i) => b.classList.toggle('active', (['quiz', 'math', 'code'] as Tab[])[i] === t));
    editor?.destroy();
    editor = null;
    if (t === 'quiz') showQuiz();
    else if (t === 'math') showMath();
    else showCodeList();
  }

  // ------------------------------------------------------------ quiz
  function nextQuiz(): QuizQuestion {
    let pool = QUIZ.filter((q) => !seenQuiz.has(q.id));
    if (!pool.length) { seenQuiz.clear(); pool = QUIZ; }
    const q = pool[Math.floor(Math.random() * pool.length)];
    seenQuiz.add(q.id);
    return q;
  }
  function showQuiz() {
    const q = nextQuiz();
    const out = h('div');
    const buttons = q.options.map((o, i) => h('button', { class: 'quiz-opt', onclick: () => pick(i) }, o));
    const pick = (i: number) => {
      buttons.forEach((b, k) => {
        b.disabled = true;
        b.classList.toggle('right', k === q.answer);
        b.classList.toggle('wrong', k === i && i !== q.answer);
      });
      const ok = i === q.answer;
      const won = answer(ok, QUIZ_REWARD);
      reward(won);
      out.replaceChildren(feedback(ok, q.explain, won), h('button', { class: 'btn btn-primary', onclick: showQuiz }, 'Next question →'));
      (out.querySelector('button') as HTMLButtonElement | null)?.focus();
    };
    body.replaceChildren(
      h('p', { class: 'cred-topic' }, q.topic),
      h('h3', { class: 'cred-q' }, q.q),
      h('div', { class: 'quiz-opts' }, buttons),
      out,
    );
  }

  // ------------------------------------------------------------ maths
  function showMath() {
    const q: MathQuestion = mathQuestion();
    const input = h('input', { class: 'fn-input cred-input', inputmode: 'decimal', placeholder: 'Your answer (e.g. 0.75, 3/4, 75%)', 'aria-label': 'Your answer' });
    const out = h('div');
    let done = false;
    const check = () => {
      if (done || !input.value.trim()) return;
      done = true;
      input.disabled = true;
      const ok = isCorrect(q, input.value);
      const won = answer(ok, q.reward);
      reward(won);
      out.replaceChildren(
        feedback(ok, `${ok ? '' : `The answer is ${+q.answer.toFixed(4)}. `}${q.explain}`, won),
        h('button', { class: 'btn btn-primary', onclick: showMath }, 'Next question →'),
      );
      (out.querySelector('button') as HTMLButtonElement | null)?.focus();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); e.stopPropagation(); });
    body.replaceChildren(
      h('p', { class: 'cred-topic' }, `${q.kind} · up to ${Math.round(q.reward * streakMultiplier())} 🧱`),
      h('h3', { class: 'cred-q' }, q.prompt),
      h('div', { class: 'fn-bar' }, input, h('button', { class: 'btn btn-primary', onclick: check }, 'Check')),
      out,
    );
    requestAnimationFrame(() => input.focus());
  }

  // ------------------------------------------------------------ code
  function showCodeList() {
    const solved = creditState().codeSolved;
    body.replaceChildren(
      h('p', { class: 'muted small' }, 'Write a small function; the tests run in your browser. The first solve pays the full reward, repeats pay 30%.'),
      h('div', { class: 'code-list' }, CODE_CHALLENGES.map((c) =>
        h('button', { class: `code-card ${solved[c.id] ? 'done' : ''}`, onclick: () => showCode(c) },
          h('strong', null, `${solved[c.id] ? '✓ ' : ''}${c.title}`),
          h('span', { class: `lvl-${c.level} small` }, c.level),
          h('span', { class: 'small' }, `${c.reward} 🧱`),
        ),
      )),
    );
  }

  function showCode(c: CodeChallenge) {
    let lang: Lang = progress().lang;
    const host = h('div', { class: 'editor-host' });
    const results = h('div', { class: 'cred-results' });
    const langBtns = (['py', 'js'] as Lang[]).map((l) =>
      h('button', { class: `seg${l === lang ? ' active' : ''}`, onclick: () => {
        lang = l;
        langBtns.forEach((b, i) => b.classList.toggle('active', (['py', 'js'] as Lang[])[i] === l));
        editor?.set(c.starter[l], l);
      } }, l === 'py' ? '🐍 Python' : '⚡ JavaScript'));
    const runBtn = h('button', { class: 'btn btn-primary', onclick: () => check() }, '▶ Run & check');
    body.replaceChildren(
      h('button', { class: 'linklike', onclick: showCodeList }, '← All code challenges'),
      h('h3', { class: 'cred-q' }, `${c.title} · ${c.reward} 🧱`),
      h('p', null, c.prompt),
      h('div', { class: 'editor-toolbar' }, h('div', { class: 'segmented' }, langBtns)),
      host,
      h('div', { class: 'lesson-actions' }, runBtn, h('span', { class: 'kbd-hint' }, 'Ctrl/⌘ + Enter runs')),
      results,
    );
    editor?.destroy();
    editor = createEditor(host, c.starter[lang], lang, { onRun: () => check() });

    async function check() {
      if (!editor) return;
      runBtn.disabled = true;
      results.replaceChildren(h('p', { class: 'muted' }, lang === 'py' ? 'Running (the first Python run downloads Python — a few seconds)…' : 'Running…'));
      const res = await run(lang, editor.get(), c.tests.map((t) => t.call), false);
      runBtn.disabled = false;
      if (!res.ok) {
        results.replaceChildren(h('div', { class: 'cred-feedback bad' }, h('strong', null, '✖ Error'), h('pre', null, res.error ?? '')));
        return;
      }
      const rows = c.tests.map((t, i) => {
        const r = res.results[i];
        const ok = !!r?.ok && matches(r.value, t.expect, CODE_TOLERANCE);
        return { t, ok, got: r?.ok ? formatValue(r.value) : `error: ${r?.error}` };
      });
      const all = rows.every((r) => r.ok);
      const won = all ? answer(true, c.reward, c.id) : 0;
      if (!all) answer(false, 0);
      reward(won);
      results.replaceChildren(
        h('ul', { class: 'test-list' }, rows.map((r) => h('li', { class: r.ok ? 'pass' : 'fail' }, `${r.ok ? '✓' : '✗'} ${r.t.call} → ${r.got}${r.ok ? '' : ` (expected ${formatValue(r.t.expect)})`}`))),
        all ? feedback(true, 'All tests pass. Spend your credits on something amazing!', won) : h('p', { class: 'muted' }, 'Some tests fail — fix them and run again.'),
      );
      if (res.stdout) results.append(h('pre', { class: 'stdout' }, res.stdout));
    }
  }

  show(tab);

  return {
    el,
    destroy() {
      unsub();
      editor?.destroy();
    },
  };
}
