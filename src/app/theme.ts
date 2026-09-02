import type { Theme } from './storage';

const LIGHT = '#fb923c';
const DARK = '#1c1917';

/** Apply the parent's theme choice: explicit light/dark, or follow the system. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? DARK : LIGHT);
}

/** Keep the browser chrome colour in sync when the system theme flips while on auto. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => undefined;
  const onChange = () => applyTheme(getTheme());
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
