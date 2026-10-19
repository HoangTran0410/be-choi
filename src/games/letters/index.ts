import { h, replay, wait } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { captionFor, isDigit, pageDone, pages, sayFor } from './logic';
import './style.css';

/**
 * Letters & numbers: a big grid of ten tiles. Touching a tile reads it aloud with a
 * picture word. Nothing is ever wrong; a page is done when every tile was touched,
 * in any order, then the next page (letters, letters, letters, digits) comes up.
 */
function start(ctx: GameContext): void {
  const all = pages();
  let page = 0;
  let alive = true;
  let busy = false;

  const grid = h('div', { class: 'letters-grid' });
  const dots = h('div', { class: 'letters-dots' });
  ctx.stage.append(h('div', { class: 'letters' }, grid, dots));

  ctx.onCleanup(() => {
    alive = false;
  });

  function renderDots(n: number, total: number): void {
    dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('span', { class: `letters-dot${i < n ? ' on' : ''}` })));
  }

  function show(): void {
    const glyphs = all[page % all.length]!;
    const touched = new Set<number>();
    busy = false;
    const digits = isDigit(glyphs[0]!);
    grid.className = `letters-grid${digits ? ' digits' : ''}`;
    const tiles = glyphs.map((glyph, i) => {
      const tile = h(
        'button',
        { class: 'letter-tile', type: 'button', 'aria-label': glyph.label },
        h('span', { class: 'letter-char' }, digits ? glyph.label : `${glyph.label}${glyph.label.toLowerCase()}`),
        h('span', { class: 'letter-pic' }, digits ? glyph.word : glyph.emoji),
        h('span', { class: 'letter-word' }, captionFor(glyph)),
      );
      tile.style.setProperty('--hue', String(((page * 7 + i) * 37) % 360));
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ctx.hint.touch();
        replay(tile, 'anim-bounce');
        ctx.audio.pop(1 + (i % 5) * 0.1);
        navigator.vibrate?.(10);
        ctx.speak(sayFor(glyph));
        if (touched.has(i)) return;
        touched.add(i);
        tile.classList.add('seen');
        renderDots(touched.size, glyphs.length);
        if (pageDone(touched, glyphs.length) && !busy) void finish();
      });
      return tile;
    });
    grid.replaceChildren(...tiles);
    renderDots(0, glyphs.length);
    ctx.hint.arm(() => {
      const next = tiles.find((_, i) => !touched.has(i));
      if (next) replay(next, 'anim-wiggle');
    });
  }

  async function finish(): Promise<void> {
    busy = true;
    ctx.hint.clear();
    await wait(900);
    if (!alive) return;
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    page++;
    show();
  }

  show();
}

const game: GameModule = { ...meta, start };
export default game;
