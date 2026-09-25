/// <reference lib="webworker" />
import { buildJsBody, toPlain, type RunRequest, type RunResponse } from './harness';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<RunRequest>) => {
  const req = ev.data;
  const lines: string[] = [];
  const fmt = (a: unknown) => (typeof a === 'string' ? a : JSON.stringify(toPlain(a)));
  const fakeConsole = {
    log: (...a: unknown[]) => lines.push(a.map(fmt).join(' ')),
    info: (...a: unknown[]) => lines.push(a.map(fmt).join(' ')),
    warn: (...a: unknown[]) => lines.push('⚠ ' + a.map(fmt).join(' ')),
    error: (...a: unknown[]) => lines.push('✖ ' + a.map(fmt).join(' ')),
  };
  const res: RunResponse = { id: req.id, ok: true, stdout: '', results: [], ops: [] };
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('console', buildJsBody(req.code, req.calls, req.build));
    const out = fn(fakeConsole) as { results: { ok: boolean; value?: unknown; error?: string }[]; ops: unknown[] };
    res.results = out.results.map((r) => ({ ...r, value: toPlain(r.value) }));
    res.ops = out.ops;
  } catch (e) {
    res.ok = false;
    res.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  res.stdout = lines.join('\n');
  self.postMessage(res);
};
