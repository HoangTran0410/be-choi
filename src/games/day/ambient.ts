import { h } from '../../core/dom';
import { onFrame, perf } from '../../core/frame';
import type { Scope } from './scope';

interface Drop {
  el: HTMLElement;
  y: number;
  v: number;
}

/**
 * Falling things (rain, leaves, snow) over `host`, on the shared frame loop. Fewer on a device
 * that is struggling, and still when the tab is hidden. Stops with the scope.
 */
export function fall(host: HTMLElement, scope: Scope, glyph: string, count = 14): void {
  const n = perf.low ? Math.ceil(count / 2) : count;
  const layer = h('div', { class: 'day-fall', 'aria-hidden': 'true' });
  const drops: Drop[] = [];
  for (let i = 0; i < n; i++) {
    const el = h('span', { class: 'day-drop', style: `left:${((i + 0.5) / n) * 100}%` }, glyph);
    layer.append(el);
    drops.push({ el, y: (i * 0.37) % 1, v: 0.35 + ((i * 7) % 5) * 0.07 });
  }
  host.append(layer);
  const stop = onFrame(
    (_now, dt) => {
      const height = layer.clientHeight || 400;
      for (const d of drops) {
        d.y += (d.v * dt) / 1000;
        if (d.y > 1.05) d.y -= 1.2;
        d.el.style.transform = `translateY(${Math.round(d.y * height)}px)`;
      }
    },
    { maxFps: 30 },
  );
  scope.own(() => {
    stop();
    layer.remove();
  });
}
