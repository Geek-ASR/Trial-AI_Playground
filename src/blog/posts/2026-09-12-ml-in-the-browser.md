---
title: Machine learning without a server — the 2026 browser stack
date: 2026-09-12
summary: WebGPU in every major browser, Python via WebAssembly, and on-device model runtimes. Here's how NeuralCraft runs Python, trains networks and renders a 3D world with zero backend.
tags: engineering, webgpu, python
cover: 🌐
---

NeuralCraft has **no backend**. No accounts database, no code-execution servers, no GPU bills. Everything — the 3D world, your Python code, the neural networks you train — runs on your own device. A few years ago that would have been a toy. In 2026 it's a genuinely good architecture. Here's the stack and why.

## WebGPU is (finally) everywhere

With Safari shipping WebGPU support in September 2025, every major browser engine now exposes modern GPU access to the web. For 3D, that means far lower CPU overhead per draw call and access to compute shaders. NeuralCraft's voxel renderer currently uses three.js on WebGL for maximum compatibility (older laptops and school Chromebooks matter), with a WebGPU path on the roadmap for bigger worlds and GPU-side meshing.

## Python in the browser, for real

The lessons accept real Python thanks to **Pyodide** — CPython compiled to WebAssembly. It ships the scientific stack too: NumPy, pandas, SciPy, Matplotlib and scikit-learn all load in the browser. NeuralCraft loads Pyodide lazily in a **Web Worker** the first time you pick Python (it's cached after that), so the 3D world never stutters while your code runs, and an infinite loop can be killed without freezing the tab.

A neat trick makes one set of tests work for both languages: every test is a function call written in the tiny overlap of JavaScript and Python syntax — `softmax([1, 2, 3])` is valid in both. The same call is evaluated in whichever language you chose, and results are compared with a numeric tolerance.

## Training and inference on-device

For *training* small models in the browser, a few hundred lines of plain TypeScript go a long way — the **Neural Forge** is a hand-written multilayer perceptron with backpropagation, verified against numerical gradients in the test suite. For heavier work the ecosystem has matured: **TensorFlow.js** still covers custom architectures and in-browser training, **ONNX Runtime Web** runs exported PyTorch or scikit-learn models with WebGPU/WASM backends, and **Transformers.js** (now on its v4 line) offers a Python-like `pipeline()` API for embeddings, classification, speech and small text-generation models.

## Why no server?

- **Privacy:** there's nothing to leak. Your progress lives in `localStorage`; export it as JSON whenever you like.
- **Cost:** static hosting is free, so the platform can stay free.
- **Access:** no sign-up wall between a curious student and their first lesson.
- **Resilience:** once loaded, most of the site works offline.

The one thing that *does* happen at build time is the **AI News** page: a scheduled GitHub Action pulls public RSS feeds from AI labs and research blogs once a day and publishes them as a static JSON file.

If you're a web developer curious about ML, this is a great moment: the browser is now a serious machine-learning runtime. And if you're an ML person curious about the web — come see what a WebAssembly Python can do.

— Aditya Rekhe
