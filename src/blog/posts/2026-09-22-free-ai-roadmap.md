---
title: A free roadmap from zero to advanced AI in 2026
date: 2026-09-22
summary: The order I'd learn AI, ML and data science in if I were starting today — and how each step maps to a NeuralCraft realm.
tags: roadmap, learning
cover: 🗺️
---

There's no shortage of AI courses. The hard part is **order**: what to learn first so that each new idea has something to stand on. Here's the sequence NeuralCraft follows, and why.

## 1. Foundations: vectors before models

Everything in ML is arrays of numbers being multiplied and added. If `dot`, matrix-vector products and matrix multiplication feel natural, 80% of deep-learning code stops being scary. Add one more idea — **gradient descent**, walking downhill on a loss — and you have the engine behind every model you'll ever train.

*In NeuralCraft:* **Foundations Meadow** — functions, vectors, dot products, matrix maths, gradient steps.

## 2. Data: look before you model

Most real-world ML failures are data failures. Learn to summarise (mean, median, standard deviation), to scale features, to draw a histogram, and to measure correlation. These take minutes to learn and save weeks of debugging.

*In NeuralCraft:* **Data Dunes** — statistics you implement yourself, visualised as block towers.

## 3. Classical ML: the models that still run the world

Linear and logistic regression, k-nearest neighbours, k-means clustering and decision trees are still the workhorses of industry — they're fast, interpretable and hard to beat on tabular data. Just as important are **metrics**: accuracy lies when classes are imbalanced; precision and recall don't.

*In NeuralCraft:* **Model Woods** — MSE, least squares, sigmoid, k-NN, k-means, precision/recall, Gini impurity.

## 4. Neural networks: stack, squash, backprop

A neural network is layers of dot products with non-linear activations in between, trained by backpropagation — the chain rule applied layer by layer. Implement ReLU, softmax, cross-entropy and a dense layer by hand once, and PyTorch will feel like a convenience rather than magic.

*In NeuralCraft:* **Neural Peaks** — plus the **Neural Forge**, where you can train a network live and see what depth, width, activation and learning rate actually do.

## 5. Language and attention: how LLMs think

Tokenisation, embeddings, cosine similarity, scaled dot-product attention and sampling temperature are the conceptual core of every large language model. You don't need a GPU cluster to understand them — you need about 30 lines of code.

*In NeuralCraft:* **Token Tides** — from `tokenize()` to a full attention step.

## 6. Agents and reinforcement learning

Rewards, discounting, exploration vs exploitation, Q-learning and value iteration. RL is where "the model predicts" becomes "the agent acts" — and a lot of today's work on AI agents borrows its vocabulary.

*In NeuralCraft:* **Agent Arena**.

## After NeuralCraft

Once you've built the pieces yourself, graduate to the real tools: **NumPy and pandas** for data, **scikit-learn** for classical ML, **PyTorch** for deep learning and the **Hugging Face** ecosystem for pretrained models. Then pick a project you care about and ship it — that's where the real learning compounds.

Everything above is free. Go build.

— Aditya Rekhe
