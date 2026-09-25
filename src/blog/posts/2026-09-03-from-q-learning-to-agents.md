---
title: From Q-learning to AI agents — what reinforcement learning still teaches us
date: 2026-09-03
summary: "Agents" are everywhere in AI right now. The core ideas — rewards, value, exploration — come from decades of reinforcement learning. Here's the short version.
tags: reinforcement learning, agents
cover: 🤖
---

"Agent" has become one of the most-used words in AI: models that plan, call tools, browse, write code and take multi-step actions. Under the hype sits a set of ideas reinforcement learning (RL) has studied for decades. If you understand them, you'll read agent papers — and design agent systems — with much clearer eyes.

## The loop

An RL agent lives in a loop: observe the **state**, take an **action**, receive a **reward**, repeat. Its goal isn't to maximise the next reward but the **return** — the sum of future rewards, each discounted by a factor `γ` per step:

```
G = r₀ + γ·r₁ + γ²·r₂ + …
```

A low `γ` makes a short-sighted agent; a high `γ` makes a patient planner.

## Value: how good is it to be here?

The **value** of a state is the return you can expect from it. **Value iteration** computes it by repeatedly applying one rule — "a state is worth the best immediate reward plus the discounted value of where that takes you" — until nothing changes. In NeuralCraft's Agent Arena you run it on a corridor and watch value flow backwards from the goal like heat.

## Learning from experience: Q-learning

Often you don't know the rules of the world. **Q-learning** learns the value of each (state, action) pair purely from experience, nudging each estimate towards a target built from the reward it just saw and its own best guess about the next state. Replace the table with a neural network and you get the deep Q-networks that learned to play Atari games from pixels.

## Explore or exploit?

Should the agent keep doing what worked, or try something new that might be better? This **exploration–exploitation trade-off** appears everywhere — recommendation systems, A/B tests, and yes, agents deciding whether to try a new tool. Algorithms like **UCB** handle it elegantly by adding an "uncertainty bonus" to options you've rarely tried.

## Why this matters for today's agents

- **Reward design is everything.** Agents optimise what you measure, not what you meant. RL calls the failure mode *reward hacking*.
- **Credit assignment is hard.** When a 40-step task fails, which step was wrong? Discounting and value estimates are RL's answer.
- **Exploration has a cost.** An agent that "explores" with real tools can do real damage — which is why sandboxes and permissions matter.

Want to feel these ideas instead of just reading about them? The **Agent Arena** has five lessons — discounted return, UCB bandits, Q-learning, value iteration and greedy policies — each under 15 lines of code.

— Aditya Rekhe
