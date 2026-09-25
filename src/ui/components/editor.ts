import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { basicSetup, EditorView } from 'codemirror';
import type { Lang } from '../../curriculum/types';

export interface CodeEditor {
  view: EditorView;
  get(): string;
  set(code: string, lang?: Lang): void;
  setLang(lang: Lang): void;
  destroy(): void;
}

const langExt = (l: Lang) => (l === 'py' ? python() : javascript());

export function createEditor(parent: HTMLElement, code: string, lang: Lang, opts: { onRun?: () => void; onChange?: (code: string) => void } = {}): CodeEditor {
  const language = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        language.of(langExt(lang)),
        oneDark,
        keymap.of([
          { key: 'Mod-Enter', run: () => (opts.onRun?.(), true) },
          { key: 'Shift-Enter', run: () => (opts.onRun?.(), true) },
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opts.onChange?.(u.state.doc.toString());
        }),
        EditorView.theme({
          '&': { fontSize: '13.5px', height: '100%' },
          '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, monospace' },
        }),
      ],
    }),
  });
  return {
    view,
    get: () => view.state.doc.toString(),
    set(next, l) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      if (l) view.dispatch({ effects: language.reconfigure(langExt(l)) });
    },
    setLang(l) {
      view.dispatch({ effects: language.reconfigure(langExt(l)) });
    },
    destroy: () => view.destroy(),
  };
}
