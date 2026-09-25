/// <reference lib="webworker" />
import { PY_PRELUDE, pyCallExpr, type RunRequest, type RunResponse } from './harness';

declare const self: DedicatedWorkerGlobalScope;

export const PYODIDE_VERSION = '314.0.7';
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface PyProxyLike {
  destroy(): void;
}
interface PyodideLike {
  globals: { get(name: string): () => PyProxyLike };
  runPython(code: string, opts?: { globals?: PyProxyLike }): unknown;
  runPythonAsync(code: string, opts?: { globals?: PyProxyLike }): Promise<unknown>;
  loadPackagesFromImports(code: string, opts?: { messageCallback?: (m: string) => void }): Promise<unknown>;
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
}

let pyodide: Promise<PyodideLike> | null = null;

function load(): Promise<PyodideLike> {
  if (!pyodide) {
    pyodide = (async () => {
      const mod = (await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)) as {
        loadPyodide: (o: { indexURL: string }) => Promise<PyodideLike>;
      };
      return mod.loadPyodide({ indexURL: INDEX_URL });
    })();
    pyodide.catch(() => (pyodide = null));
  }
  return pyodide;
}

self.onmessage = async (ev: MessageEvent<RunRequest | { warmup: true }>) => {
  if ('warmup' in ev.data) {
    load().then(
      () => self.postMessage({ ready: true }),
      (e) => self.postMessage({ ready: false, error: String(e) }),
    );
    return;
  }
  const req = ev.data;
  const res: RunResponse = { id: req.id, ok: true, stdout: '', results: [], ops: [] };
  const lines: string[] = [];
  let ns: PyProxyLike | null = null;
  try {
    const py = await load();
    py.setStdout({ batched: (s) => lines.push(s) });
    py.setStderr({ batched: (s) => lines.push('✖ ' + s) });
    await py.loadPackagesFromImports(req.code, { messageCallback: () => {} });
    ns = py.globals.get('dict')();
    py.runPython(PY_PRELUDE, { globals: ns });
    await py.runPythonAsync(req.code, { globals: ns });
    for (const call of req.calls) {
      try {
        const json = py.runPython(pyCallExpr(call), { globals: ns }) as string;
        res.results.push({ ok: true, value: JSON.parse(json) });
      } catch (e) {
        res.results.push({ ok: false, error: lastLine(String(e)) });
      }
    }
    if (req.build) res.ops = JSON.parse(py.runPython('__nc_json(__nc_ops)', { globals: ns }) as string);
  } catch (e) {
    res.ok = false;
    res.error = lastLine(String(e));
  } finally {
    ns?.destroy();
  }
  res.stdout = lines.join('\n');
  self.postMessage(res);
};

/** Python tracebacks are long; the last line carries the actual error. */
function lastLine(s: string): string {
  const parts = s.trim().split('\n').filter(Boolean);
  const tail = parts.slice(-1)[0] ?? s;
  const where = parts.reverse().find((l) => l.includes('line ') && l.includes('<exec>'));
  return where ? `${tail}  (${where.trim()})` : tail;
}
