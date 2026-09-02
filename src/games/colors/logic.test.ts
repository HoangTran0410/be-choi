import { describe, it, expect } from 'vitest';
import { BALLS_PER_BASKET, ballSvg, basketCount, basketSvg, makeColorRound } from './logic';
import { mulberry32 } from '../../core/dom';

describe('colors logic', () => {
  it('basket count: 2 for rounds 0 and 1, then 3', () => {
    expect(basketCount(0)).toBe(2);
    expect(basketCount(1)).toBe(2);
    expect(basketCount(2)).toBe(3);
    expect(basketCount(9)).toBe(3);
  });

  it('round 2 has 3 distinct baskets and 6 balls, exactly 2 per colour, unique ids', () => {
    const r = makeColorRound(2, mulberry32(11));
    expect(r.baskets.length).toBe(3);
    expect(new Set(r.baskets.map((b) => b.id)).size).toBe(3);
    expect(r.balls.length).toBe(6);
    for (const basket of r.baskets) {
      expect(r.balls.filter((b) => b.color.id === basket.id).length).toBe(BALLS_PER_BASKET);
    }
    for (const ball of r.balls) expect(r.baskets).toContain(ball.color);
    expect(new Set(r.balls.map((b) => b.id)).size).toBe(6);
  });

  it('round 0 has 2 baskets and 4 balls', () => {
    const r = makeColorRound(0, mulberry32(5));
    expect(r.baskets.length).toBe(2);
    expect(r.balls.length).toBe(4);
    expect(new Set(r.balls.map((b) => b.id)).size).toBe(4);
  });

  it('shuffles the balls so same-coloured balls are not always adjacent', () => {
    let interleaved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = makeColorRound(2, mulberry32(seed));
      const ids = r.balls.map((b) => b.color.id);
      if (ids.some((id, i) => i % 2 === 0 && ids[i + 1] !== id)) interleaved++;
    }
    expect(interleaved).toBeGreaterThan(0);
  });

  it('renders svg for basket and ball', () => {
    const basket = basketSvg('#f00');
    expect(basket.classList.contains('colors-basket-svg')).toBe(true);
    expect(basket.querySelector('[fill="#f00"]')).not.toBeNull();

    const ball = ballSvg('#00f');
    expect(ball.classList.contains('colors-ball-svg')).toBe(true);
    expect(ball.querySelector('circle')?.getAttribute('fill')).toBe('#00f');
    const gradient = ball.querySelector('defs')?.firstElementChild;
    expect(gradient?.tagName).toBe('radialGradient');
    const other = ballSvg('#00f').querySelector('defs')?.firstElementChild;
    expect(other?.getAttribute('id')).not.toBe(gradient?.getAttribute('id'));
  });
});
