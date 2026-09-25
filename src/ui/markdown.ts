import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

/** Render trusted, first-party markdown (lessons and blog posts shipped with the site). */
export function md(src: string): string {
  return marked.parse(src, { async: false }) as string;
}
