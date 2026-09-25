# NeuralCraft 🧊

**Learn AI by building worlds.** NeuralCraft is a free, no-sign-in, Minecraft-style 3D playground where developers learn AI, machine learning and data science from scratch to advanced — with drag-and-drop blocks, real **Python** and **JavaScript**, and results you can walk around in.

- 🌍 **A living voxel world in your browser.** Real-time sun and moon shadows, coloured light from lamps and crystals, a day/night cycle with stars, drifting clouds, rain, thunderstorms and snow, animated water, fireflies and birdsong. Six biomes, one realm each. Every glowing beacon is a lesson.
- 🔬 **Six walk-in AI labs** you can play with:
  - **Gradient Descent Valley** — SGD, Momentum, RMSProp and Adam race as glowing balls down a loss landscape sunk into the ground. Click anywhere to start them there.
  - **The Galton Board** — a 46-block-tall board where hundreds of marbles pile into a bell curve (the central limit theorem, made of marbles).
  - **K-Means Nebula** — a floating 3D point cloud whose centroids hop, step by step, into place.
  - **The Neural Cathedral** — draw a digit on the wall and watch a real MNIST network (96% test accuracy) light up layer by layer as it guesses.
  - **Embedding Galaxy** — walk up a tower into a galaxy of words; *king − man + woman* draws itself as vectors.
  - **Q-Learning Maze** — robots learn a maze by trial and error; the floor glows with learned values and arrows show the policy. Rebuild the walls and they adapt.
- 🐦 **A boids flock** over the hub, and **Nova**, a robot guide who finds the way to your next lesson with A* search and shows you every tile it explored.
- 🧑‍💻 **Real code.** Implement `mean`, `softmax`, `k-means`, `attention`, `Q-learning`… in Python (via Pyodide/WebAssembly) or JavaScript. Tests tell you instantly if you nailed it.
- 🧊 **Your output gets built.** Histograms rise out of the sand, decision boundaries spread across the floor, attention weights stand up as towers.
- ⚒ **Neural Forge in 3D.** Design a neural network, press Train and orbit it while it learns: every neuron is a tile showing what it has learned to detect, weights are glowing rods (orange +, blue −), signals pulse through them, and the output rises as a 3D probability landscape cut by a glass sheet at p = 0.5 — the decision boundary. Hover the landscape to push any point through the network.
- 🧊 **3D Function Lab.** Type any function — `sigmoid(a*x + b*y + c)`, `x^2 - y^2`, `sin(x)*cos(y)` — and explore its surface in 3D with sliders for a, b, c, gradient arrows, a tangent plane under your cursor and balls that roll downhill by gradient descent. Presets cover activation functions (with their derivatives), single neurons, loss landscapes and more. Formulas are parsed by a small safe compiler, never `eval`.
- ⚡ **Earn your blocks.** Every block you place costs a credit (glowing ones 3). Earn credits by answering AI/ML quiz questions, solving generated maths problems (dot products, gradients, MSE, probabilities…) or writing small functions like `relu`, `softmax` and `nearest_label` — press **Q** anywhere or visit the kiosk. Streaks pay up to double, lessons pay 40, and breaking your own blocks refunds them.
- 🏗 **Your Playground.** A huge empty desert plot east of the hub (Map → *Your Playground*) with a faint 8-block grid, ready for whatever you want to build.
- 🧱 **Code Builder.** Press **B** and build with Blockly blocks, Python or JavaScript: `block`, `fill`, `sphere`, `line` for voxels, plus `shape()` for smooth objects of **any size, turn and colour** — boxes, spheres, cylinders, cones, pyramids, rings, capsules, domes and wedges, optionally glowing. Undo refunds the last build.
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
| `npm run smoke` | Browser smoke test against `npx vite preview`: every route, a lesson, a portal and all six labs (needs Chromium; set `CHROMIUM_PATH`) |

Graphics adapt to your device: pick Low, Medium, High or Ultra in the in-game ⚙ settings, or leave it on Auto and it steps down when the frame rate drops. All music and sound effects are synthesised live with Web Audio; there are no audio files.

### Retraining the digit model

The Neural Cathedral's network (256 → 32 → 16 → 10) is trained offline on MNIST (LeCun, Cortes & Burges) and shipped as `src/sims/data/digits-model.json`. To retrain it, download the MNIST files and run:

```sh
MNIST_DIR=/path/to/mnist node --experimental-strip-types scripts/train-digits.ts
```

## Controls

`WASD` move · mouse look · `Space` jump (double-tap to fly) · `Shift` sprint/descend · `F` fly · `E` open lesson or lab console · left/right click break/place · `1–9` blocks · `B` Code Builder · `M` map & labs · `G` Nova guide · `V` first/third person · `P` photo mode · `Q` earn block credits · `H` hub · `Shift+M` switch between mouse-look and a normal cursor (drag to look, click to break, right-click to place) · `Esc` release mouse. Touch controls appear automatically on phones and tablets.

## Deploying

The site is fully static and deploys to **GitHub Pages** via `.github/workflows/deploy.yml` on every push to `main` and once a day (to refresh the AI news). One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — vision, research, product design, architecture and roadmap
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — adding lessons, blog posts, news sources and builder examples

## Tech

TypeScript · Vite · three.js (custom voxel shaders, shadow maps, post-processing) · Web Audio · CodeMirror 6 · Blockly · Pyodide · marked · Vitest. No framework, no backend.

## Author

Created and maintained by **[Aditya Rekhe](https://github.com/Geek-ASR)**.

## License

[MIT](LICENSE) © 2026 Aditya Rekhe
