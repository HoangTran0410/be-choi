/** Water: river, ocean, underwater, bubbles, the whale, the waterfall. */
import { rand, type P } from './scene-data';
import type { Ctx } from './context';

// ---------- water ----------
export function drawRiver(c: Ctx): void {
  const { g, W, H, time, L, U, groundY, drawEmoji } = c;
  if (!g) return;
  const k = L('river');
  if (k < 0.01) return;
  const y0 = groundY() + H * 0.1;
  g.globalAlpha = k;
  const path = (off: number) => {
    g.beginPath();
    for (let x = -10; x <= W + 10; x += 10) {
      const y = y0 + Math.sin((x / W) * Math.PI * 2) * H * 0.05 + off;
      if (x < 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };
  g.strokeStyle = '#38bdf8';
  g.lineWidth = H * 0.07;
  path(0);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.setLineDash([W * 0.03, W * 0.05]);
  g.lineDashOffset = -time * 60;
  for (const off of [-H * 0.015, H * 0.012]) {
    path(off);
    g.stroke();
  }
  g.setLineDash([]);
  const t = (time * 0.05) % 1.2;
  const lx = (t - 0.1) * W;
  drawEmoji('🍃', lx, y0 + Math.sin((lx / W) * Math.PI * 2) * H * 0.05, U() * 0.04, { rot: Math.sin(time) * 0.5 });
  g.globalAlpha = 1;
}

export function drawOcean(c: Ctx): void {
  const { g, W, H, time, L, U, drawEmoji, across } = c;
  if (!g) return;
  const k = L('ocean');
  if (k < 0.01) return;
  const base = H - H * 0.22 * k;
  const layers: [number, string, number, number][] = [
    [0, 'rgba(56,189,248,0.75)', 0.9, 1],
    [H * 0.05, 'rgba(14,165,233,0.85)', 1.3, -1],
    [H * 0.1, 'rgba(2,132,199,0.95)', 1.7, 1],
  ];
  // A little sailing boat riding the swell.
  const bx = (((time * 0.03) % 1.3) - 0.15) * W;
  const by = base + Math.sin((bx / W) * 8 + time * 0.9) * H * 0.02;
  drawEmoji('⛵', bx, by - U() * 0.035, U() * 0.08, { rot: Math.cos((bx / W) * 8 + time * 0.9) * 0.15, alpha: k });
  for (const [off, color, speed, dir] of layers) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (const x of across(8)) {
      const y = base + off + Math.sin((x / W) * 8 + time * speed * dir) * H * 0.02 + Math.sin((x / W) * 17 - time * speed) * H * 0.008;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.fill();
    // Foam along the crest.
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    for (const x of across(8)) {
      const y = base + off + Math.sin((x / W) * 8 + time * speed * dir) * H * 0.02 + Math.sin((x / W) * 17 - time * speed) * H * 0.008;
      if (x) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
}

export function drawUnderwater(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, traveller, level, weeds } = c;
  if (!g) return;
  const k = L('underwater');
  if (k < 0.01) return;
  g.globalAlpha = k;
  // Light from the surface.
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = ((i + 0.5) / 5) * W + Math.sin(time * 0.4 + i) * W * 0.05;
    const grad = g.createLinearGradient(x, 0, x, H * 0.8);
    grad.addColorStop(0, 'rgba(186,230,253,0.18)');
    grad.addColorStop(1, 'rgba(186,230,253,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - W * 0.03, 0);
    g.lineTo(x + W * 0.03, 0);
    g.lineTo(x + W * 0.1, H * 0.8);
    g.lineTo(x - W * 0.02, H * 0.8);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // Sand and swaying weed.
  g.fillStyle = '#fde68a';
  g.fillRect(0, H * 0.92, W, H * 0.08);
  g.lineCap = 'round';
  for (const w of weeds) {
    g.strokeStyle = w.c;
    g.lineWidth = U() * 0.018;
    g.beginPath();
    const x0 = w.x * W;
    g.moveTo(x0, H * 0.93);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      g.lineTo(x0 + Math.sin(time * 1.5 + t * 3 + w.x * 10) * t * U() * 0.04, H * 0.93 - t * w.h * H);
    }
    g.stroke();
  }
  // Fish going about their business.
  for (const [id, emoji, y, v] of [
    ['fish1', '🐠', 0.45, 0.06],
    ['fish2', '🐟', 0.62, 0.09],
    ['fish3', '🐡', 0.3, 0.04],
  ] as const) {
    level.set(id, k);
    const f = traveller(id, dt, v, y * H);
    drawEmoji(emoji, f.x, f.y + Math.sin(time * 2 + v * 50) * 8, U() * 0.08, { flip: f.dir > 0 });
  }
  g.globalAlpha = 1;
}

export function drawBubbles(c: Ctx, dt: number): void {
  const { g, W, H, L, U, pool, step, spawn, level } = c;
  if (!g) return;
  const k = Math.max(L('bubble'), L('underwater') * 0.3);
  level.set('bub', k);
  spawn('bub', 10, dt, () => ({
    x: rand(0.05, 0.95) * W,
    y: H + 10,
    vx: 0,
    vy: -rand(40, 90),
    life: 0,
    max: 12,
    size: rand(0.008, 0.03) * U(),
    hue: Math.random() * 6,
  }));
  const ps = pool('bub');
  step(ps, dt);
  // All the bubbles in one path, then all the shines in another: three draw calls
  // for the lot rather than three for every bubble.
  const body = new Path2D();
  const shine = new Path2D();
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i] as P;
    if (p.y < H * 0.05) {
      ps.splice(i, 1);
      continue;
    }
    const x = p.x + Math.sin(p.life * 2 + (p.hue ?? 0)) * 10;
    body.moveTo(x + p.size, p.y);
    body.arc(x, p.y, p.size, 0, Math.PI * 2);
    const sx = x - p.size * 0.35;
    const sy = p.y - p.size * 0.35;
    shine.moveTo(sx + p.size * 0.22, sy);
    shine.arc(sx, sy, p.size * 0.22, 0, Math.PI * 2);
  }
  g.lineWidth = 1.5;
  g.fillStyle = 'rgba(186,230,253,0.25)';
  g.fill(body);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.stroke(body);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fill(shine);
}

export function drawWhale(c: Ctx, dt: number): void {
  const { g, H, time, L, U, drawEmoji, pool, step, every, traveller } = c;
  if (!g) return;
  const k = L('whale');
  if (k < 0.01) return;
  const w = traveller('whale', dt, 0.035, H * 0.55);
  const y = w.y + Math.sin(time * 0.8) * H * 0.03;
  g.globalAlpha = k;
  drawEmoji('🐋', w.x, y, U() * 0.22, { flip: w.dir > 0, rot: Math.sin(time * 0.8) * 0.06 });
  // Now and then it blows.
  if (every('whale', dt, 3, 6)) {
    for (let i = 0; i < 24; i++)
      pool('spout').push({
        x: w.x - w.dir * U() * 0.04,
        y: y - U() * 0.08,
        vx: rand(-40, 40),
        vy: -rand(120, 200),
        life: 0,
        max: 1.1,
        size: rand(2, 4),
      });
  }
  const sp = pool('spout');
  step(sp, dt, 300);
  g.fillStyle = 'rgba(224,242,254,0.9)';
  for (const p of sp) {
    g.beginPath();
    g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** A waterfall off a rocky cliff, streaming into a pool with spray. */
export function drawWaterfall(c: Ctx, dt: number): void {
  const { g, W, H, time, L, groundY, pool, step, spawn } = c;
  if (!g) return;
  const k = L('waterfall');
  if (k < 0.01) return;
  const x0 = W * 0.62;
  const w = W * 0.1;
  const top = H * 0.3;
  const bottom = groundY() + H * 0.12;
  g.globalAlpha = k;
  g.fillStyle = '#78716c';
  g.beginPath();
  g.moveTo(x0 - w * 0.6, bottom);
  g.lineTo(x0 - w * 0.5, top - H * 0.04);
  g.lineTo(x0 + w * 0.5, top - H * 0.06);
  g.lineTo(x0 + w * 1.6, top);
  g.lineTo(x0 + w * 1.7, bottom);
  g.fill();
  g.fillStyle = '#38bdf8';
  g.fillRect(x0, top - H * 0.02, w, bottom - top);
  // Streaks running down.
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const x = x0 + ((i + 0.5) / 7) * w;
    g.setLineDash([18, 22]);
    g.lineDashOffset = -time * 220 - i * 13;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + Math.sin(i) * 2, bottom);
    g.stroke();
  }
  g.setLineDash([]);
  g.fillStyle = '#0ea5e9';
  g.beginPath();
  g.ellipse(x0 + w / 2, bottom, w * 1.4, H * 0.035, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  spawn('mist', 18, dt, () => ({
    x: x0 + rand(0, w),
    y: bottom,
    vx: rand(-40, 40),
    vy: -rand(20, 60),
    life: 0,
    max: 1.2,
    size: rand(4, 9),
  }));
  const ps = pool('mist');
  step(ps, dt);
  for (const p of ps) {
    g.fillStyle = `rgba(255,255,255,${(1 - p.life / p.max) * 0.5 * k})`;
    g.beginPath();
    g.arc(p.x, p.y, p.size * (1 + p.life), 0, Math.PI * 2);
    g.fill();
  }
}
