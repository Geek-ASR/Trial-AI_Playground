---
title: Attention, explained with blocks
date: 2026-09-18
summary: The formula at the heart of every transformer is three lines of code. Here's the intuition, and how to build it yourself.
tags: deep learning, transformers, explainer
cover: 🔦
---

In 2017 a paper titled *"Attention Is All You Need"* introduced the transformer. Nearly every major language model since — GPT, Claude, Gemini, Llama and the rest — is built on its core operation: **scaled dot-product attention**. It sounds intimidating. It isn't.

## The question attention answers

Take the sentence *"The animal didn't cross the street because it was too tired."* What does **it** refer to? You know instantly: the animal. A model needs a mechanism for each word to **look at the other words** and pull in the ones that matter. That mechanism is attention.

## Queries, keys and values

Every token produces three vectors:

- a **query** — "what am I looking for?"
- a **key** — "what do I contain?"
- a **value** — "what will I contribute if you pick me?"

To update one token, compare its query with every key using a **dot product** (a similarity score), scale by `√d` so the numbers don't explode as vectors get longer, and **softmax** the scores into weights that sum to 1:

```python
weights = softmax([dot(query, k) / sqrt(d) for k in keys])
```

Then blend the values with those weights:

```python
output = sum(w * v for w, v in zip(weights, values))
```

That's it. That's attention. The token's new representation is a context-aware mixture of the tokens it found relevant.

## Why the √d?

Dot products of long random vectors get large, and softmax of large numbers becomes nearly one-hot — all the weight on one token, with vanishing gradients everywhere else. Dividing by `√d` keeps the scores in a range where softmax stays soft and learning stays healthy.

## From one head to a transformer

Real transformers run many attention **heads** in parallel (each learns to look for different relationships — syntax, coreference, position), concatenate the results, pass them through a small feed-forward network, and stack dozens of these layers. The trick that made it all practical: attention for every token can be computed at once as matrix multiplications — exactly what GPUs are built for.

## Build it yourself

In NeuralCraft, head to **Token Tides**. Lesson *Attention scores* has you write `attention_weights(query, keys)`; your result rises out of the display pad as purple towers — taller means "attend more". The next lesson, *Self-attention output*, completes the mechanism. It takes about ten minutes, and afterwards transformer diagrams will read like plain English.

— Aditya Rekhe
