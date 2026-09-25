# NeuralCraft 🧊

**Learn AI by building worlds.** NeuralCraft is a free, no-sign-in, Minecraft-style 3D playground where developers learn AI, machine learning and data science from scratch to advanced — with drag-and-drop blocks, real **Python** and **JavaScript**, and results you can walk around in.

- 🌍 **A voxel world in your browser.** Walk or fly between six realms. Every glowing beacon is a lesson.
- 🧑‍💻 **Real code.** Implement `mean`, `softmax`, `k-means`, `attention`, `Q-learning`… in Python (via Pyodide/WebAssembly) or JavaScript. Tests tell you instantly if you nailed it.
- 🧊 **Your output gets built.** Histograms rise out of the sand, decision boundaries spread across the floor, attention weights stand up as towers.
- ⚒ **Neural Forge.** Design a neural network, press Train, watch it learn — live in 2D and painted onto the world in 3D.
- 🧱 **Code Builder.** Press **B** and build with Blockly blocks, Python or JavaScript: plot 3D functions, sculpt data clusters, grow fractals.
- 🏆 **XP, levels, streaks, badges** — saved only in your browser. Export/import any time.
- 📰 **Blog + daily AI news** from the major AI labs and research blogs.
- 🔒 **No accounts, no tracking, no server.**

## Curriculum

| Realm | Topics |
|---|---|
| 🌱 Foundations Meadow | functions, vectors, dot product, matrix × vector, matrix multiplication, gradient descent |
| 🏜️ Data Dunes | mean, standard deviation, median, min-max scaling, histograms, correlation |
| 🌲 Model Woods | MSE, linear regression, logistic regression, k-NN, k-means, precision/recall, Gini impurity |
| 🏔️ Neural Peaks | ReLU, neurons, softmax, cross-entropy, dense layers, backprop — plus the Neural Forge |
| 🌊 Token Tides | tokenisation, bag of words, embeddings & cosine similarity, attention, sampling temperature |
| 🏟️ Agent Arena | discounted return, UCB bandits, Q-learning, value iteration, greedy policies |

36 lessons, every one verified by the test suite in **both** languages.

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (curriculum in JS **and** Python, MLP gradients, world gen, mesher, news parser) |
| `npm run news` | Fetch the latest AI headlines into `public/news.json` |
| `npm run smoke` | Browser smoke test against `npx vite preview` (needs Chromium; set `CHROMIUM_PATH`) |

## Controls

`WASD` move · mouse look · `Space` jump (double-tap to fly) · `Shift` sprint/descend · `F` fly · `E` open lesson · left/right click break/place · `1–9` blocks · `B` Code Builder · `M` map · `H` hub · `Esc` release mouse. Touch controls appear automatically on phones and tablets.

## Deploying

The site is fully static and deploys to **GitHub Pages** via `.github/workflows/deploy.yml` on every push to `main` and once a day (to refresh the AI news). One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — vision, research, product design, architecture and roadmap
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — adding lessons, blog posts, news sources and builder examples

## Tech

TypeScript · Vite · three.js · CodeMirror 6 · Blockly · Pyodide · marked · Vitest. No framework, no backend.

## Author

Created and maintained by **[Aditya Rekhe](https://github.com/Geek-ASR)**.

## License

[MIT](LICENSE) © 2026 Aditya Rekhe
