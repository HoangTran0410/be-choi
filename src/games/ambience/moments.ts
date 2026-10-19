/** One-off moments: the big emoji when something is switched on, and sparkles where it was touched. */
import type { Ctx } from './context';

// ---------- the moment something is switched on ----------
export function drawHero(c: Ctx, dt: number): void {
  const { W, H, U, drawEmoji } = c;
  if (!c.hero) return;
  c.hero.life += dt;
  const t = c.hero.life / 1.2;
  if (t >= 1) {
    c.hero = null;
    return;
  }
  const grow = t < 0.3 ? 1 - (1 - t / 0.3) ** 3 : 1;
  drawEmoji(c.hero.emoji, W / 2, H * 0.42, U() * 0.35 * (0.4 + grow * 0.6), { alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4 });
}

export function drawSparkles(c: Ctx, dt: number): void {
  const { g, drawEmoji, pool, step } = c;
  if (!g) return;
  const ps = pool('tap');
  step(ps, dt, 60);
  for (const p of ps) {
    g.globalAlpha = 1 - p.life / p.max;
    drawEmoji('✨', p.x, p.y, p.size, { rot: p.a });
  }
  g.globalAlpha = 1;
}
