import type { CallResult, RunRequest, RunResponse } from './harness';

export interface RunResult {
  ok: boolean;
  error?: string;
  stdout: string;
  results: CallResult[];
  ops: unknown[];
  ms: number;
}

type Lang = 'js' | 'py';

const TIMEOUT: Record<Lang, number> = { js: 4000, py: 20000 };
const FIRST_PY_TIMEOUT = 90000;

let nextId = 1;
const workers: Partial<Record<Lang, Worker>> = {};
let pyReady = false;
const pyListeners = new Set<(s: PyStatus) => void>();

export type PyStatus = 'idle' | 'loading' | 'ready' | 'error';
let pyStatus: PyStatus = 'idle';

function setPyStatus(s: PyStatus) {
  pyStatus = s;
  pyListeners.forEach((l) => l(s));
}

export function onPyStatus(fn: (s: PyStatus) => void): () => void {
  pyListeners.add(fn);
  fn(pyStatus);
  return () => pyListeners.delete(fn);
}

function spawn(lang: Lang): Worker {
  const w =
    lang === 'js'
      ? new Worker(new URL('./jsWorker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./pyWorker.ts', import.meta.url), { type: 'module' });
  workers[lang] = w;
  return w;
}

function worker(lang: Lang): Worker {
  return workers[lang] ?? spawn(lang);
}

/** Start downloading Python in the background so the first run feels fast. */
export function warmPython(): void {
  if (pyStatus === 'loading' || pyStatus === 'ready') return;
  setPyStatus('loading');
  const w = worker('py');
  const onMsg = (ev: MessageEvent) => {
    if (!ev.data || !('ready' in ev.data)) return;
    w.removeEventListener('message', onMsg);
    pyReady = !!ev.data.ready;
    setPyStatus(pyReady ? 'ready' : 'error');
  };
  w.addEventListener('message', onMsg);
  w.postMessage({ warmup: true });
}

export function run(lang: Lang, code: string, calls: string[], build = false): Promise<RunResult> {
  const id = nextId++;
  const req: RunRequest = { id, lang, code, calls, build };
  const w = worker(lang);
  const started = performance.now();
  if (lang === 'py' && !pyReady) setPyStatus('loading');
  const limit = lang === 'py' && !pyReady ? FIRST_PY_TIMEOUT : TIMEOUT[lang];

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      w.removeEventListener('message', onMsg);
      w.terminate();
      delete workers[lang];
      if (lang === 'py') {
        pyReady = false;
        setPyStatus('idle');
      }
      resolve({
        ok: false,
        error: `Stopped after ${Math.round(limit / 1000)}s — is there an infinite loop?`,
        stdout: '',
        results: [],
        ops: [],
        ms: performance.now() - started,
      });
    }, limit);

    const onMsg = (ev: MessageEvent<RunResponse>) => {
      if (ev.data?.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      if (lang === 'py') {
        const loadFailed = !ev.data.ok && /pyodide|Failed to fetch|import/i.test(ev.data.error ?? '') && !pyReady;
        pyReady = !loadFailed;
        setPyStatus(loadFailed ? 'error' : 'ready');
      }
      resolve({ ...ev.data, ms: performance.now() - started });
    };
    w.addEventListener('message', onMsg);
    w.postMessage(req);
  });
}
