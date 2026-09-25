import { B } from '../../world/blocks';
import type { VoxelOp } from '../../world/ops';
import { bars } from '../viz';
import type { Lesson } from '../types';

const CORRIDOR_REWARDS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 10];

/** Nest value_iteration_step calls so the viz shows values after n sweeps. */
function sweeps(n: number): string {
  let expr = JSON.stringify(CORRIDOR_REWARDS.map(() => 0));
  for (let i = 0; i < n; i++) expr = `value_iteration_step(${expr}, ${JSON.stringify(CORRIDOR_REWARDS)}, 0.9)`;
  return expr;
}

export const agents: Lesson[] = [
  {
    id: 'r1-return',
    realm: 'agents',
    title: 'Discounted return',
    summary: 'A reward now is worth more than a reward later.',
    level: 'beginner',
    xp: 30,
    theory: `In **reinforcement learning** an agent acts, the world hands back rewards, and the
agent tries to maximise the **return**: the sum of future rewards, each discounted by
\`γ\` (gamma) per step:

\`G = r₀ + γ·r₁ + γ²·r₂ + …\`

γ close to 1 → patient, far-sighted agent. γ close to 0 → greedy, short-sighted agent.`,
    task: 'Write `discounted_return(rewards, gamma)`.',
    fn: 'discounted_return',
    starter: {
      js: `function discounted_return(rewards, gamma) {\n  // sum of rewards[t] * gamma^t\n}\n`,
      py: `def discounted_return(rewards, gamma):\n    # sum of rewards[t] * gamma**t\n    pass\n`,
    },
    solution: {
      js: `function discounted_return(rewards, gamma) {\n  return rewards.reduce((g, r, t) => g + r * gamma ** t, 0);\n}\n`,
      py: `def discounted_return(rewards, gamma):\n    return sum(r * gamma ** t for t, r in enumerate(rewards))\n`,
    },
    hints: ['Step t is multiplied by γ to the power t.'],
    tests: [
      { call: 'discounted_return([1, 1, 1], 1)', expect: 3 },
      { call: 'discounted_return([1, 1, 1], 0.5)', expect: 1.75 },
      { call: 'discounted_return([0, 0, 10], 0.9)', expect: 8.1 },
    ],
  },
  {
    id: 'r2-bandit',
    realm: 'agents',
    title: 'Explore vs exploit (UCB)',
    summary: 'Try the new restaurant, or go back to your favourite?',
    level: 'intermediate',
    xp: 40,
    theory: `A **multi-armed bandit** is a row of slot machines with unknown payouts. Pull only the
best-looking one and you might miss a better one; explore forever and you waste pulls.

**UCB1** scores each arm by its average reward plus an **uncertainty bonus**:

\`score = mean + c · √(ln(total_pulls) / pulls_of_this_arm)\`

Rarely-tried arms get a big bonus, so they get explored — then the bonus fades.`,
    task: 'Write `ucb_pick(means, counts, c)` returning the index of the arm with the highest UCB score. `total_pulls` is the sum of `counts`. If any arm has 0 pulls, return the first such arm.',
    fn: 'ucb_pick',
    starter: {
      js: `function ucb_pick(means, counts, c) {\n  const total = counts.reduce((a, b) => a + b, 0);\n  // untried arm first; otherwise argmax of mean + c*sqrt(ln(total)/count)\n}\n`,
      py: `import math\n\ndef ucb_pick(means, counts, c):\n    total = sum(counts)\n    # untried arm first; otherwise argmax of mean + c*sqrt(ln(total)/count)\n    pass\n`,
    },
    solution: {
      js: `function ucb_pick(means, counts, c) {\n  const zero = counts.indexOf(0);\n  if (zero !== -1) return zero;\n  const total = counts.reduce((a, b) => a + b, 0);\n  const scores = means.map((m, i) => m + c * Math.sqrt(Math.log(total) / counts[i]));\n  return scores.indexOf(Math.max(...scores));\n}\n`,
      py: `import math\n\ndef ucb_pick(means, counts, c):\n    if 0 in counts:\n        return counts.index(0)\n    total = sum(counts)\n    scores = [m + c * math.sqrt(math.log(total) / n) for m, n in zip(means, counts)]\n    return scores.index(max(scores))\n`,
    },
    hints: ['Check for untried arms before dividing by a count.'],
    tests: [
      { call: 'ucb_pick([0.9, 0.1], [5, 0], 1)', expect: 1 },
      { call: 'ucb_pick([0.5, 0.6], [10, 10], 1)', expect: 1 },
      { call: 'ucb_pick([0.6, 0.5], [100, 2], 1)', expect: 1 },
      { call: 'ucb_pick([0.6, 0.5], [100, 2], 0)', expect: 0 },
    ],
  },
  {
    id: 'r3-q-update',
    realm: 'agents',
    title: 'Q-learning',
    summary: 'Learn the value of every action by trial and error.',
    level: 'intermediate',
    xp: 45,
    theory: `**Q-learning** keeps a table \`Q(state, action)\` estimating future return. After taking
an action and seeing reward \`r\` and next state \`s'\`, nudge the estimate towards the
**TD target**:

\`target = r + γ · max Q(s', ·)\`
\`Q ← Q + α · (target − Q)\`

α is the learning rate. DeepMind's Atari-playing DQN is this rule with a neural network
standing in for the table.`,
    task: 'Write `q_update(q, reward, next_qs, alpha, gamma)` returning the new Q value. `next_qs` lists the Q values of every action in the next state (empty if the episode ended).',
    fn: 'q_update',
    starter: {
      js: `function q_update(q, reward, next_qs, alpha, gamma) {\n  const best_next = next_qs.length ? Math.max(...next_qs) : 0;\n  // move q towards reward + gamma * best_next\n}\n`,
      py: `def q_update(q, reward, next_qs, alpha, gamma):\n    best_next = max(next_qs) if next_qs else 0\n    # move q towards reward + gamma * best_next\n    pass\n`,
    },
    solution: {
      js: `function q_update(q, reward, next_qs, alpha, gamma) {\n  const best_next = next_qs.length ? Math.max(...next_qs) : 0;\n  return q + alpha * (reward + gamma * best_next - q);\n}\n`,
      py: `def q_update(q, reward, next_qs, alpha, gamma):\n    best_next = max(next_qs) if next_qs else 0\n    return q + alpha * (reward + gamma * best_next - q)\n`,
    },
    hints: ['The TD error is target − q.'],
    tests: [
      { call: 'q_update(0, 1, [], 0.5, 0.9)', expect: 0.5 },
      { call: 'q_update(2, 0, [1, 5, 3], 0.1, 0.9)', expect: 2.25 },
      { call: 'q_update(10, 10, [0], 1, 0.99)', expect: 10 },
    ],
  },
  {
    id: 'r4-value-iteration',
    realm: 'agents',
    title: 'Value iteration',
    summary: 'Watch value flow backwards from the goal.',
    level: 'advanced',
    xp: 60,
    theory: `Picture a corridor of cells. From any cell you may step **left** or **right** (not off
the ends). Entering cell \`n\` earns \`rewards[n]\`. The value of a cell is the best you can do:

\`V'(s) = max over neighbours n of ( rewards[n] + γ · V(n) )\`

Apply this to every cell at once (using the *old* values) and repeat: value spreads outward
from the goal like heat — this is **dynamic programming**, the backbone of planning.`,
    task: 'Write `value_iteration_step(values, rewards, gamma)` returning the new list of values after one sweep.',
    fn: 'value_iteration_step',
    starter: {
      js: `function value_iteration_step(values, rewards, gamma) {\n  return values.map((_, s) => {\n    // neighbours are s-1 and s+1 when inside the corridor\n  });\n}\n`,
      py: `def value_iteration_step(values, rewards, gamma):\n    new = []\n    for s in range(len(values)):\n        # neighbours are s-1 and s+1 when inside the corridor\n        pass\n    return new\n`,
    },
    solution: {
      js: `function value_iteration_step(values, rewards, gamma) {\n  return values.map((_, s) => {\n    const opts = [s - 1, s + 1].filter((n) => n >= 0 && n < values.length);\n    return Math.max(...opts.map((n) => rewards[n] + gamma * values[n]));\n  });\n}\n`,
      py: `def value_iteration_step(values, rewards, gamma):\n    new = []\n    for s in range(len(values)):\n        opts = [n for n in (s - 1, s + 1) if 0 <= n < len(values)]\n        new.append(max(rewards[n] + gamma * values[n] for n in opts))\n    return new\n`,
    },
    hints: ['Cell 0 only has a right neighbour; the last cell only has a left one.', 'Read from the old `values`, never from the list you are building.'],
    tests: [
      { call: 'value_iteration_step([0, 0, 0], [0, 0, 1], 0.9)', expect: [0, 1, 0] },
      { call: 'value_iteration_step([0, 1, 0], [0, 0, 1], 0.9)', expect: [0.9, 1, 0.9] },
      { call: 'value_iteration_step([5, 0], [1, 2], 0.5)', expect: [2, 3.5] },
    ],
    viz: {
      calls: [sweeps(12)],
      render: ([v]) => {
        const ops: VoxelOp[] = bars(v);
        ops.push({ x: 9, y: 0, z: 2, b: B.GOLD }, { x: 9, y: 1, z: 2, b: B.GOLD });
        return ops;
      },
      caption: 'Values of a 10-cell corridor after 12 sweeps. The goal (gold marker) is at the right end.',
    },
  },
  {
    id: 'r5-policy',
    realm: 'agents',
    title: 'Greedy policy',
    summary: 'From values to actions.',
    level: 'intermediate',
    xp: 35,
    theory: `Once you know values, acting is easy: in each cell pick the move whose
\`rewards[n] + γ·V(n)\` is largest. That mapping from state to action is a **policy**.

Return \`-1\` for "go left" and \`1\` for "go right". On a tie, prefer right.`,
    task: 'Write `greedy_policy(values, rewards, gamma)` returning one action (−1 or 1) per cell.',
    fn: 'greedy_policy',
    starter: {
      js: `function greedy_policy(values, rewards, gamma) {\n  // for each cell compare the left and right options\n}\n`,
      py: `def greedy_policy(values, rewards, gamma):\n    # for each cell compare the left and right options\n    pass\n`,
    },
    solution: {
      js: `function greedy_policy(values, rewards, gamma) {\n  const q = (n) => (n < 0 || n >= values.length ? -Infinity : rewards[n] + gamma * values[n]);\n  return values.map((_, s) => (q(s + 1) >= q(s - 1) ? 1 : -1));\n}\n`,
      py: `def greedy_policy(values, rewards, gamma):\n    def q(n):\n        return float('-inf') if n < 0 or n >= len(values) else rewards[n] + gamma * values[n]\n    return [1 if q(s + 1) >= q(s - 1) else -1 for s in range(len(values))]\n`,
    },
    hints: ['Treat moving off the corridor as −∞ so it is never chosen.'],
    tests: [
      { call: 'greedy_policy([0, 1, 0], [0, 0, 1], 0.9)', expect: [1, 1, -1] },
      { call: 'greedy_policy([3, 0, 0, 0], [0, 0, 0, 0], 0.9)', expect: [1, -1, 1, -1] },
    ],
  },
];
