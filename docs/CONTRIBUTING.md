# Contributing to NeuralCraft

Thanks for helping people learn AI! NeuralCraft is maintained by Aditya Rekhe.

## Setup

```sh
npm install
npm run dev
npm test        # run before every PR
```

## Add a lesson

1. Open `src/curriculum/lessons/<realm>.ts` and add a `Lesson` object (see `src/curriculum/types.ts`).
2. Rules:
   - One idea per lesson; theory under ~120 words.
   - Use the same **snake_case function name** in both languages.
   - Write tests as calls using only syntax valid in **both** JavaScript and Python: identifiers, numbers, `"double-quoted strings"`, and list literals. Avoid `true/false/None`.
   - The starter code must *not* pass the tests; the solutions must.
   - Add a `viz` whenever the output has a shape. Ops are relative to the pad centre, must stay within ±12 on x/z and 0–19 on y.
3. `npm test` verifies both solutions (Python via Pyodide in Node), the starters and the visualisation bounds. A beacon for the new lesson appears in the world automatically.

## Add a blog post

Create `src/blog/posts/YYYY-MM-DD-your-slug.md`:

```md
---
title: Your title
date: 2026-10-01
summary: One-sentence summary.
tags: tag one, tag two
cover: 🧠
---

Markdown body…
```

## Add a news source

Append `{ "name", "url", "kind" }` to `scripts/feeds.json` (`kind` is one of `lab`, `research`, `open-source`, `engineering`, `news`, `newsletter`), then run `npm run news` to check it parses.

## Add a Code Builder example

Add an entry to `src/ui/components/builderExamples.ts` with both `js` and `py` versions.

## Style

- TypeScript strict mode, no framework; small DOM helper in `src/ui/dom.ts`.
- Keep the initial bundle small: heavy modules (three.js, CodeMirror, Blockly, Pyodide) are loaded on demand.
- Commit messages: imperative mood, e.g. "Add PCA lesson to Model Woods".
