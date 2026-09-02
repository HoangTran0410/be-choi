export type Route = { name: 'home' } | { name: 'game'; id: string } | { name: 'album' };

export function parseHash(hash: string): Route {
  const m = /^#?\/g\/([a-z0-9-]+)\/?$/.exec(hash);
  if (m && m[1]) return { name: 'game', id: m[1] };
  if (/^#?\/album\/?$/.test(hash)) return { name: 'album' };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  if (route.name === 'home') return '#/';
  if (route.name === 'album') return '#/album';
  return `#/g/${route.id}`;
}

export function navigate(route: Route): void {
  location.hash = hrefFor(route);
}

/** Calls `onRoute` now and on every hash change. Returns a stop function. */
export function startRouter(onRoute: (r: Route) => void): () => void {
  const handler = () => onRoute(parseHash(location.hash));
  window.addEventListener('hashchange', handler);
  handler();
  return () => window.removeEventListener('hashchange', handler);
}
