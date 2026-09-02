import { describe, it, expect } from 'vitest';
import { applyTheme } from './theme';

describe('applyTheme', () => {
  it('sets and clears data-theme', () => {
    document.head.append(Object.assign(document.createElement('meta'), { name: 'theme-color', content: 'x' }));
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#1c1917');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
