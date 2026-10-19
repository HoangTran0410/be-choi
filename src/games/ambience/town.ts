/** The town: skyline and the street. */
import { mix, rand, rgb } from './scene-data';
import type { Ctx } from './context';

/** The skyline, behind the hills. */
export function drawTown(c: Ctx): void {
  const { g, W, H, sky, L, groundY, buildings } = c;
  if (!g) return;
  const gy = groundY();
  const ci = L('city');
  if (ci > 0.01) {
    g.globalAlpha = ci;
    for (const b of buildings) {
      const x = b.x * W;
      const w = b.w * W;
      const h = b.h * H;
      g.fillStyle = rgb(mix([148, 163, 184], [30, 41, 59], sky.night));
      g.fillRect(x, gy - h + H * 0.02, w, h);
      g.fillStyle = sky.night > 0.3 ? 'rgba(253,224,71,0.9)' : 'rgba(224,242,254,0.8)';
      b.lit.forEach((on, i) => {
        if (!on && sky.night > 0.3) return;
        const col = i % 3;
        const row = Math.floor(i / 3);
        if (gy - h + H * 0.03 + row * H * 0.04 > gy) return;
        g.fillRect(x + w * (0.15 + col * 0.28), gy - h + H * 0.035 + row * H * 0.045, w * 0.16, H * 0.022);
      });
    }
    g.globalAlpha = 1;
  }
}

/** Everything on the ground in town, in front of the hills. */
export function drawStreet(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, drawEmoji, pool, step, spawn, traveller, level } = c;
  if (!g) return;
  const gy = groundY();
  const ci = L('city');
  if (ci > 0.01) {
    g.globalAlpha = ci;
    // The road, with traffic both ways.
    const ry = gy + H * 0.16;
    g.fillStyle = '#475569';
    g.fillRect(0, ry - H * 0.04, W, H * 0.09);
    g.strokeStyle = '#fde047';
    g.setLineDash([W * 0.04, W * 0.03]);
    g.lineWidth = 2;
    g.lineDashOffset = 0;
    g.beginPath();
    g.moveTo(0, ry + H * 0.005);
    g.lineTo(W, ry + H * 0.005);
    g.stroke();
    g.setLineDash([]);
    for (const [id, emoji, v, lane] of [
      ['car1', '🚕', 0.12, -1],
      ['car2', '🚌', 0.07, 1],
      ['car3', '🚗', 0.15, 1],
    ] as const) {
      level.set(id, ci);
      const c = traveller(id, dt, v, ry + (lane > 0 ? H * 0.025 : -H * 0.012), lane);
      c.dir = lane;
      drawEmoji(emoji, c.x, c.y, U() * 0.08, { flip: c.dir > 0 });
    }
    g.globalAlpha = 1;
  }
  // The train, with its rails and a trail of smoke.
  const tr = L('train');
  if (tr > 0.01) {
    const ty = gy + H * 0.05;
    g.globalAlpha = tr;
    g.strokeStyle = '#78716c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, ty + U() * 0.035);
    g.lineTo(W, ty + U() * 0.035);
    g.stroke();
    const t = traveller('train', dt, 0.12, ty, 1);
    t.dir = 1;
    const s = U() * 0.09;
    drawEmoji('🚂', t.x, ty - Math.abs(Math.sin(time * 12)) * 1.5, s, { flip: true });
    for (let i = 1; i <= 3; i++) drawEmoji('🚃', t.x - i * s * 0.95, ty, s);
    spawn('smoke', 6, dt, () => ({
      x: t.x + s * 0.2,
      y: ty - s * 0.5,
      vx: -rand(20, 40),
      vy: -rand(20, 40),
      life: 0,
      max: 2,
      size: s * 0.15,
    }));
    level.set('smoke', tr);
    const ps = pool('smoke');
    step(ps, dt);
    for (const p of ps) {
      const k = p.life / p.max;
      g.fillStyle = `rgba(241,245,249,${(1 - k) * 0.8 * tr})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (1 + k * 2), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // The tractor chugging along with a puff of dust.
  const tc = L('tractor');
  if (tc > 0.01) {
    const t = traveller('tractor', dt, 0.025, gy + H * 0.12);
    g.globalAlpha = tc;
    drawEmoji('🚜', t.x, t.y + Math.sin(time * 14) * 1.5, U() * 0.12, { flip: t.dir > 0 });
    spawn('dust', 5, dt, () => ({
      x: t.x - t.dir * U() * 0.06,
      y: t.y + U() * 0.04,
      vx: -t.dir * rand(10, 30),
      vy: -rand(5, 15),
      life: 0,
      max: 1.2,
      size: U() * 0.015,
    }));
    level.set('dust', tc);
    const ps = pool('dust');
    step(ps, dt);
    for (const p of ps) {
      const k = p.life / p.max;
      g.fillStyle = `rgba(180,140,90,${(1 - k) * 0.5 * tc})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (1 + k), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // The aeroplane, high up, drawing its trail.
  const ap = L('airplane');
  if (ap > 0.01) {
    const p = traveller('airplane', dt, 0.07, H * 0.14);
    g.globalAlpha = ap;
    const grad = g.createLinearGradient(p.x, 0, p.x - p.dir * W * 0.4, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(p.x - p.dir * U() * 0.04, p.y + U() * 0.01);
    g.lineTo(p.x - p.dir * W * 0.4, p.y + U() * 0.01);
    g.stroke();
    drawEmoji('✈️', p.x, p.y, U() * 0.1, { flip: p.dir < 0, rot: p.dir > 0 ? 0.35 : -0.35 });
    g.globalAlpha = 1;
  }
}
