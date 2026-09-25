/** Blog posts are markdown files with a small YAML-like frontmatter block. */

export interface Post {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  cover: string;
  body: string;
  author: string;
  readingMinutes: number;
}

export const AUTHOR = 'Aditya Rekhe';

const files = import.meta.glob('./posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function parsePost(path: string, raw: string): Post {
  const slug = path.replace(/^.*\/\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (m) {
    body = m[2];
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    }
  }
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: meta.title ?? slug,
    date: meta.date ?? '',
    summary: meta.summary ?? '',
    tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    cover: meta.cover ?? '📝',
    body,
    author: AUTHOR,
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

export const POSTS: Post[] = Object.entries(files)
  .map(([path, raw]) => parsePost(path, raw))
  .sort((a, b) => b.date.localeCompare(a.date));

export const POST_BY_SLUG = new Map(POSTS.map((p) => [p.slug, p]));
