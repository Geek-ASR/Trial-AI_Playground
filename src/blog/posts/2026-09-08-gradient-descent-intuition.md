---
title: Gradient descent is just walking downhill in fog
date: 2026-09-08
summary: The one algorithm behind almost every trained model, explained with a hill, a foggy morning and four lines of code.
tags: fundamentals, explainer
cover: ⛰️
---

Imagine standing on a hillside in thick fog. You want to reach the bottom of the valley, but you can only see the ground at your feet. What do you do?

You feel which way the ground slopes, and take a small step **downhill**. Then you do it again. And again. Eventually you're at the bottom.

That's **gradient descent**, and it trains nearly every modern model — from a two-parameter line fit to networks with hundreds of billions of weights.

## The three ingredients

1. **A loss function** — the height of the hill. It measures how wrong the model is. Mean squared error for regression, cross-entropy for classification.
2. **The gradient** — the slope under your feet. For each parameter it says "increase me and the loss goes up by this much".
3. **A learning rate** — your step size.

The update is one line:

```python
w = w - learning_rate * gradient
```

## Try it on the simplest hill

Take the loss `L(w) = (w − 3)²`. The minimum is obviously at `w = 3`. Its gradient is `2(w − 3)`. Start at `w = 0` with a learning rate of `0.1`:

```python
w = 0
for step in range(10):
    w = w - 0.1 * 2 * (w - 3)
    print(round(w, 3))
```

You'll see `0.6, 1.08, 1.464, …` creeping towards 3. In NeuralCraft's **Foundations Meadow** the lesson *Walking downhill* turns each step into a tower, so you literally watch the staircase converge.

## Learning rate: the most important knob

- **Too small** and you'll be walking until next year.
- **Too large** and you overshoot the valley, bounce up the other side, and can even diverge to infinity.
- **Just right** and you converge quickly.

Open the **Neural Forge** and set the learning rate to 3 on the spiral dataset, then to 0.003. It's the fastest way to build intuition for a knob you'll tune for the rest of your career.

## Why "stochastic"?

Computing the exact gradient over millions of examples is expensive. So we estimate it from a small random **mini-batch** — a noisier compass, but a much faster one. That's stochastic gradient descent (SGD), and fancier optimisers like Adam are refinements of the same walk.

## Where backprop fits

Gradient descent needs gradients; **backpropagation** is how we compute them efficiently for a network, by applying the chain rule layer by layer from the loss back to every weight. You'll implement a tiny version yourself in Neural Peaks.

Fog, slope, step. Repeat. That's learning.

— Aditya Rekhe
