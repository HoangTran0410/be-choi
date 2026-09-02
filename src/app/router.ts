export type Route = { name: 'home' } | { name: 'game'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#?\/g\/([a-z0-9-]+)\/?$/.exec(hash);
  if (m && m[1]) return { name: 'game', id: m[1] };
  return { name: 'home' };
}

export function hrefFor(route: Route): string {
  return route.name === 'home' ? '#/' : `#/g/${route.id}`;
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
