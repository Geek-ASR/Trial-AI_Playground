import { h } from '../dom';

let host: HTMLElement | null = null;

export function toast(title: string, body = '', kind: 'info' | 'success' | 'reward' | 'error' = 'info', ms = 4200) {
  if (!host) {
    host = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast toast-${kind}` }, h('strong', null, title), body ? h('span', null, body) : null);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, ms);
}
