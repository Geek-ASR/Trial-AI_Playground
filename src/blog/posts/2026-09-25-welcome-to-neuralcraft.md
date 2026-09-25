---
title: Why I'm building NeuralCraft
date: 2026-09-25
summary: A free, no-sign-in, Minecraft-style world where you learn AI by building it — here's the idea, and why I think it works.
tags: announcement, learning
cover: 🧊
---

Most people who try to learn machine learning quit somewhere between *"install CUDA"* and *"read chapter 3 of a 900-page textbook"*. I've watched friends bounce off both. The problem isn't that the ideas are hard — a neuron is a dot product and a squash — it's that the path to *feeling* those ideas is long, lonely and full of setup.

**NeuralCraft** is my attempt to fix that. It's a 3D voxel world that runs entirely in your browser. You walk between realms — *Foundations Meadow*, *Data Dunes*, *Model Woods*, *Neural Peaks*, *Token Tides* and the *Agent Arena* — and every glowing beacon is a lesson. You open it, read one idea, write a few lines of **Python or JavaScript**, and your answer is **built out of blocks** on the realm's display pad. A histogram rises out of the sand. A decision boundary spreads across the floor. Attention weights stand up as towers.

## The rules I set for myself

1. **Free, forever.** No paywall, no "pro" tier for the good lessons.
2. **No sign-in.** Your progress, XP and badges live in your browser. You can export them to a file if you switch devices. Nothing about you is sent anywhere.
3. **Real code.** Blocks are great for the first ten minutes, but the goal is Python — the language of modern ML — so every lesson accepts real Python (running locally via WebAssembly) or JavaScript.
4. **From scratch.** You implement `mean`, `softmax`, `k-means`, `attention` and `Q-learning` yourself before you ever import a library. Libraries are much easier to trust once you know what's inside them.
5. **Fun first.** If a lesson doesn't make you want to do the next one, it's a bad lesson.

## Why a voxel world?

Games are very good at a few things education struggles with: a clear next step, instant feedback, visible progress, and freedom to mess around. Research on gamified learning keeps finding the same pattern — progress tracking, feedback and rewards measurably improve engagement and retention. But points bolted onto a quiz only go so far. What I wanted was a place where the *learning itself* is the game: your code changes the world.

That's also why there's a **Code Builder**. Press **B** anywhere and write a program — with drag-and-drop blocks, Python or JavaScript — that builds structures in front of you. Plot `sin(x)·cos(y)` as a landscape, scatter three Gaussian clusters in the air, or build a neural-network sculpture. It's the Minecraft instinct — "what if I built…" — pointed at maths and data.

## What's inside today

- **36 hands-on lessons** across six realms, beginner → advanced, each with tests, hints and a 3D visualisation.
- **The Neural Forge**: design a small neural network, pick a dataset (circle, XOR, moons, spiral…), press Train and watch the decision boundary paint itself onto the world in real time.
- **The Code Builder** with Blocks, Python and JavaScript.
- **XP, levels, streaks and badges**, all stored locally.
- **This blog**, plus an **AI News** page that pulls fresh headlines from the major AI labs and research blogs every day.

## What's next

The roadmap is public in the repository. Next up: more lessons (decision trees end-to-end, CNNs on tiny images, a mini GPT you train in the browser), multiplayer "study rooms", and community-made realms.

If you're a beginner: walk to a portal and start with *Your first function*. If you're experienced: go straight to the Agent Arena and see if you can make value flow backwards from the goal.

See you in the world.

— Aditya
