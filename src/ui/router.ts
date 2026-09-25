export interface Route {
  name: string;
  params: string[];
}

type Handler = (route: Route) => void;

/** Hash-based routing: works on GitHub Pages with no server rewrites. */
export function parseHash(hash = location.hash): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [name = '', ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: name || 'home', params };
}

export function startRouter(handler: Handler) {
  const go = () => handler(parseHash());
  window.addEventListener('hashchange', go);
  go();
}

export function navigate(path: string) {
  location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}
