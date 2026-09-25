import { B } from '../../world/blocks';
import { bars, heatmap } from '../viz';
import type { Lesson } from '../types';

const WORD_VECS: Record<string, number[]> = {
  king: [0.9, 0.8, 0.1, 0.3],
  queen: [0.88, 0.82, 0.9, 0.3],
  apple: [0.1, 0.2, 0.3, 0.95],
  mango: [0.12, 0.15, 0.35, 0.9],
  prince: [0.8, 0.7, 0.15, 0.25],
};
const WORDS = Object.keys(WORD_VECS);

export const tokens: Lesson[] = [
  {
    id: 't1-tokenize',
    realm: 'tokens',
    title: 'Tokenisation',
    summary: 'Models don\'t read text. They read tokens.',
    level: 'beginner',
    xp: 25,
    theory: `Before a language model sees text, it's chopped into **tokens**. Real LLMs use
sub-word tokenisers (BPE, SentencePiece), but the idea starts simple:

1. lowercase everything,
2. split on anything that isn't a letter or digit,
3. drop empty pieces.`,
    task: 'Write `tokenize(text)` returning a list of lowercase word tokens.',
    fn: 'tokenize',
    starter: {
      js: `function tokenize(text) {\n  // lowercase, split on non-alphanumerics, remove empty strings\n}\n`,
      py: `import re\n\ndef tokenize(text):\n    # lowercase, split on non-alphanumerics, remove empty strings\n    pass\n`,
    },
    solution: {
      js: `function tokenize(text) {\n  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);\n}\n`,
      py: `import re\n\ndef tokenize(text):\n    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if t]\n`,
    },
    hints: ['A regular expression like `[^a-z0-9]+` matches runs of separators.'],
    tests: [
      { call: 'tokenize("Hello, World! AI is fun")', expect: ['hello', 'world', 'ai', 'is', 'fun'] },
      { call: 'tokenize("  GPT-5 beats   GPT-4?  ")', expect: ['gpt', '5', 'beats', 'gpt', '4'] },
      { call: 'tokenize("")', expect: [] },
    ],
  },
  {
    id: 't2-bag-of-words',
    realm: 'tokens',
    title: 'Bag of words',
    summary: 'Turn a sentence into a vector.',
    level: 'beginner',
    xp: 30,
    theory: `Models need numbers. The oldest trick: count how often each vocabulary word appears.
Word order is thrown away (it's a "bag"), but it's still a strong baseline for spam filters
and sentiment analysis.`,
    task: 'Write `bag_of_words(tokens, vocab)` returning one count per vocab word, in vocab order.',
    fn: 'bag_of_words',
    starter: {
      js: `function bag_of_words(tokens, vocab) {\n  // count occurrences of each vocab word in tokens\n}\n`,
      py: `def bag_of_words(tokens, vocab):\n    # count occurrences of each vocab word in tokens\n    pass\n`,
    },
    solution: {
      js: `function bag_of_words(tokens, vocab) {\n  return vocab.map((w) => tokens.filter((t) => t === w).length);\n}\n`,
      py: `def bag_of_words(tokens, vocab):\n    return [tokens.count(w) for w in vocab]\n`,
    },
    hints: ['One number per vocab word, in the same order as vocab.'],
    tests: [
      { call: 'bag_of_words(["the", "cat", "sat", "on", "the", "mat"], ["the", "cat", "dog"])', expect: [2, 1, 0] },
      { call: 'bag_of_words([], ["a"])', expect: [0] },
    ],
  },
  {
    id: 't3-cosine',
    realm: 'tokens',
    title: 'Embeddings & cosine similarity',
    summary: 'Meaning as direction in space.',
    level: 'intermediate',
    xp: 40,
    theory: `Modern models map words, sentences and images to **embeddings** — vectors where
similar meanings point in similar directions. **Cosine similarity** compares directions:

\`cos(a, b) = (a · b) / (‖a‖ · ‖b‖)\`

1 = same direction, 0 = unrelated, −1 = opposite. This powers semantic search and RAG.`,
    task: 'Write `cosine_similarity(a, b)`.',
    fn: 'cosine_similarity',
    starter: {
      js: `function cosine_similarity(a, b) {\n  // dot(a, b) / (norm(a) * norm(b))\n}\n`,
      py: `import math\n\ndef cosine_similarity(a, b):\n    # dot(a, b) / (norm(a) * norm(b))\n    pass\n`,
    },
    solution: {
      js: `function cosine_similarity(a, b) {\n  const dot = a.reduce((s, x, i) => s + x * b[i], 0);\n  const na = Math.hypot(...a), nb = Math.hypot(...b);\n  return dot / (na * nb);\n}\n`,
      py: `import math\n\ndef cosine_similarity(a, b):\n    dot = sum(x * y for x, y in zip(a, b))\n    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))\n`,
    },
    hints: ['‖a‖ = √(Σ aᵢ²).'],
    tests: [
      { call: 'cosine_similarity([1, 0], [0, 1])', expect: 0 },
      { call: 'cosine_similarity([1, 2], [2, 4])', expect: 1 },
      { call: 'cosine_similarity([1, 1], [-1, -1])', expect: -1 },
      { call: 'cosine_similarity([3, 4], [4, 3])', expect: 0.96 },
    ],
    viz: {
      calls: WORDS.flatMap((a) => WORDS.map((b) => `cosine_similarity(${JSON.stringify(WORD_VECS[a])}, ${JSON.stringify(WORD_VECS[b])})`)),
      render: (v) => heatmap(Array.from({ length: WORDS.length }, (_, r) => v.slice(r * WORDS.length, (r + 1) * WORDS.length))),
      caption: `Similarity grid for ${WORDS.join(', ')}. Royals cluster together; fruit clusters together.`,
    },
  },
  {
    id: 't4-attention-weights',
    realm: 'tokens',
    title: 'Attention scores',
    summary: 'Which words should this word look at?',
    level: 'advanced',
    xp: 55,
    theory: `**Attention** lets each token decide which other tokens matter. A token's **query**
is compared to every token's **key** with a scaled dot product, then softmaxed:

\`weights = softmax( q·kᵢ / √d )\` where \`d\` is the vector length.

This single formula, from *"Attention Is All You Need"* (2017), is the heart of every
transformer — GPT, Claude, Gemini, Llama and friends.`,
    task: 'Write `attention_weights(query, keys)` returning the softmaxed, scaled scores.',
    fn: 'attention_weights',
    starter: {
      js: `function attention_weights(query, keys) {\n  const d = query.length;\n  // scores = dot(query, k) / sqrt(d) for each key, then softmax\n}\n`,
      py: `import math\n\ndef attention_weights(query, keys):\n    d = len(query)\n    # scores = dot(query, k) / sqrt(d) for each key, then softmax\n    pass\n`,
    },
    solution: {
      js: `function attention_weights(query, keys) {\n  const d = query.length;\n  const s = keys.map((k) => k.reduce((acc, x, i) => acc + x * query[i], 0) / Math.sqrt(d));\n  const m = Math.max(...s);\n  const e = s.map((x) => Math.exp(x - m));\n  const z = e.reduce((a, b) => a + b, 0);\n  return e.map((x) => x / z);\n}\n`,
      py: `import math\n\ndef attention_weights(query, keys):\n    d = len(query)\n    s = [sum(q * k for q, k in zip(query, key)) / math.sqrt(d) for key in keys]\n    m = max(s)\n    e = [math.exp(x - m) for x in s]\n    z = sum(e)\n    return [x / z for x in e]\n`,
    },
    hints: ['Reuse your softmax from Neural Peaks.', 'Divide each score by √d before the softmax.'],
    tests: [
      { call: 'attention_weights([1, 0], [[1, 0], [1, 0]])', expect: [0.5, 0.5] },
      { call: 'attention_weights([2, 0], [[2, 0], [0, 2]])', expect: [0.9441927807928303, 0.055807219207169745] },
    ],
    viz: {
      calls: ['attention_weights([1, 0.5, -0.5, 2], [[1, 0, 0, 1], [0, 1, 1, 0], [1, 1, 0, 2], [-1, 0, 1, 0], [0.5, 0.5, 0, 1.5], [0, 0, 0, 0]])'],
      render: ([v]) => bars(v, { colors: [B.PURPLE] }),
      caption: 'How much one query token attends to six key tokens. Taller = more attention.',
    },
  },
  {
    id: 't5-attention',
    realm: 'tokens',
    title: 'Self-attention output',
    summary: 'Mix the values by how much you attend to them.',
    level: 'advanced',
    xp: 60,
    theory: `The attention weights decide how much of each token's **value** vector to blend in:

\`output = Σᵢ weightᵢ · vᵢ\`

So a token's new representation is a context-aware mixture of the tokens it cares about.
Do this for every token, with many heads in parallel, stack dozens of layers — that's a
transformer.`,
    task: 'Write `attention(query, keys, values)` returning the weighted sum of the value vectors.',
    fn: 'attention',
    starter: {
      js: `function attention(query, keys, values) {\n  // 1. weights = softmax(q·k / sqrt(d))\n  // 2. output = sum of weights[i] * values[i]\n}\n`,
      py: `import math\n\ndef attention(query, keys, values):\n    # 1. weights = softmax(q·k / sqrt(d))\n    # 2. output = sum of weights[i] * values[i]\n    pass\n`,
    },
    solution: {
      js: `function attention(query, keys, values) {\n  const d = query.length;\n  const s = keys.map((k) => k.reduce((acc, x, i) => acc + x * query[i], 0) / Math.sqrt(d));\n  const m = Math.max(...s);\n  const e = s.map((x) => Math.exp(x - m));\n  const z = e.reduce((a, b) => a + b, 0);\n  const w = e.map((x) => x / z);\n  return values[0].map((_, j) => values.reduce((acc, v, i) => acc + w[i] * v[j], 0));\n}\n`,
      py: `import math\n\ndef attention(query, keys, values):\n    d = len(query)\n    s = [sum(q * k for q, k in zip(query, key)) / math.sqrt(d) for key in keys]\n    m = max(s)\n    e = [math.exp(x - m) for x in s]\n    z = sum(e)\n    w = [x / z for x in e]\n    return [sum(w[i] * values[i][j] for i in range(len(values))) for j in range(len(values[0]))]\n`,
    },
    hints: ['Start from attention_weights.', 'The output has the same length as one value vector.'],
    tests: [
      { call: 'attention([1, 0], [[1, 0], [1, 0]], [[2, 0], [0, 2]])', expect: [1, 1] },
      { call: 'attention([0, 0], [[5, 5], [1, 1], [0, 3]], [[3], [6], [9]])', expect: [6] },
    ],
  },
  {
    id: 't6-temperature',
    realm: 'tokens',
    title: 'Sampling temperature',
    summary: 'The creativity dial on every chatbot.',
    level: 'intermediate',
    xp: 40,
    theory: `When an LLM picks the next token it divides its logits by a **temperature** \`T\`
before the softmax:

\`probs = softmax(logits / T)\`

Low T (0.2) → sharp, predictable, "safe". High T (1.5) → flatter, more surprising.
T → 0 approaches always taking the single most likely token (greedy decoding).`,
    task: 'Write `apply_temperature(logits, t)` returning the probabilities.',
    fn: 'apply_temperature',
    starter: {
      js: `function apply_temperature(logits, t) {\n  // softmax(logits / t)\n}\n`,
      py: `import math\n\ndef apply_temperature(logits, t):\n    # softmax(logits / t)\n    pass\n`,
    },
    solution: {
      js: `function apply_temperature(logits, t) {\n  const s = logits.map((x) => x / t);\n  const m = Math.max(...s);\n  const e = s.map((x) => Math.exp(x - m));\n  const z = e.reduce((a, b) => a + b, 0);\n  return e.map((x) => x / z);\n}\n`,
      py: `import math\n\ndef apply_temperature(logits, t):\n    s = [x / t for x in logits]\n    m = max(s)\n    e = [math.exp(x - m) for x in s]\n    z = sum(e)\n    return [x / z for x in e]\n`,
    },
    hints: ['Divide first, then apply your stable softmax.'],
    tests: [
      { call: 'apply_temperature([1, 1], 0.5)', expect: [0.5, 0.5] },
      { call: 'apply_temperature([2, 4], 2)', expect: [0.2689414213699951, 0.7310585786300049] },
      { call: 'apply_temperature([0, 10], 0.1)', expect: [0, 1], tol: 1e-9 },
    ],
    viz: {
      calls: ['apply_temperature([1, 2, 3, 2.5, 0.5], 0.4)', 'apply_temperature([1, 2, 3, 2.5, 0.5], 2.5)'],
      render: ([cold, hot]) => [...bars(cold, { z: -3, colors: [B.CYAN] }), ...bars(hot, { z: 3, colors: [B.ORANGE] })],
      caption: 'Cyan row: T = 0.4 (sharp). Orange row: T = 2.5 (flat). Same logits!',
    },
  },
];
