/** Places: temple, playground, carnival, space. */
import { rand } from './scene-data';
import type { Ctx } from './context';

/** A temple on the hill, bells swinging under the eaves, incense curling up. */
export function drawTemple(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, drawEmoji, pool, step, spawn } = c;
  if (!g) return;
  const k = L('temple');
  if (k < 0.01) return;
  const x = W * 0.12;
  const gy = groundY();
  g.globalAlpha = k;
  drawEmoji('🛕', x, gy - U() * 0.05, U() * 0.2);
  for (let i = 0; i < 3; i++) {
    const bx = W * (0.3 + i * 0.12);
    const sw = Math.sin(time * 1.4 + i * 1.1) * 0.35;
    g.strokeStyle = 'rgba(120,53,15,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(bx, 0);
    g.lineTo(bx + Math.sin(sw) * H * 0.08, Math.cos(sw) * H * 0.08);
    g.stroke();
    drawEmoji('🔔', bx + Math.sin(sw) * H * 0.11, Math.cos(sw) * H * 0.11, U() * 0.06, { rot: -sw });
  }
  g.globalAlpha = 1;
  spawn('incense', 3, dt, () => ({
    x: x + U() * 0.08,
    y: gy + H * 0.02,
    vx: rand(-3, 3),
    vy: -rand(12, 22),
    life: 0,
    max: 4,
    size: U() * 0.01,
    hue: Math.random() * 6,
  }));
  const ps = pool('incense');
  step(ps, dt);
  for (const p of ps) {
    const t = p.life / p.max;
    g.fillStyle = `rgba(226,232,240,${(1 - t) * 0.45 * k})`;
    g.beginPath();
    g.arc(p.x + Math.sin(p.life * 1.5 + (p.hue ?? 0)) * 12, p.y, p.size * (1 + t * 2), 0, Math.PI * 2);
    g.fill();
  }
}

/** The playground: a slide, a ball bouncing across, a kite on the wind. */
export function drawPlayground(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, wind, drawEmoji, traveller } = c;
  if (!g) return;
  const k = L('playground');
  if (k < 0.01) return;
  const gy = groundY();
  g.globalAlpha = k;
  drawEmoji('🛝', W * 0.36, gy + H * 0.06, U() * 0.16);
  const ball = traveller('playground-ball', dt, 0.1, gy + H * 0.2);
  const bounce = Math.abs(Math.sin(time * 4)) * H * 0.1;
  drawEmoji('⚽', ball.x, ball.y - bounce, U() * 0.06, { rot: ball.x / (U() * 0.03) });
  // The kite, tugging on its string.
  const kx = W * 0.62 + Math.sin(time * 0.7) * W * 0.05 + wind() * W * 0.08;
  const ky = H * 0.2 + Math.sin(time * 1.1) * H * 0.04;
  g.strokeStyle = 'rgba(71,85,105,0.7)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(W * 0.45, gy + H * 0.1);
  g.quadraticCurveTo(W * 0.52, H * 0.5, kx, ky + U() * 0.03);
  g.stroke();
  drawEmoji('🪁', kx, ky, U() * 0.09, { rot: Math.sin(time * 1.3) * 0.25 });
  g.globalAlpha = 1;
}

/** The fair: a Ferris wheel turning, strings of lights, balloons floating off. */
export function drawCarnival(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, drawEmoji, pool, step, spawn, level } = c;
  if (!g) return;
  const k = L('carnival');
  if (k < 0.01) return;
  const cx = W * 0.78;
  const cy = groundY() - U() * 0.14;
  const r = U() * 0.17;
  g.globalAlpha = k;
  g.strokeStyle = '#7c3aed';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - r * 0.5, groundY() + H * 0.04);
  g.lineTo(cx, cy);
  g.lineTo(cx + r * 0.5, groundY() + H * 0.04);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  const n = 8;
  const turn = time * 0.35;
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2;
    g.strokeStyle = 'rgba(124,58,237,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
    g.fillStyle = `hsl(${(i * 360) / n},85%,60%)`;
    g.fillRect(cx + Math.cos(a) * r - r * 0.09, cy + Math.sin(a) * r, r * 0.18, r * 0.16);
  }
  // Lights strung across the top, blinking in a chase.
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const lx = t * W;
    const ly = H * 0.04 + Math.sin(t * Math.PI) * H * 0.06;
    const on = (Math.floor(time * 4) + i) % 3 === 0;
    g.fillStyle = on ? `hsl(${i * 40},95%,70%)` : `hsla(${i * 40},60%,50%,0.5)`;
    g.beginPath();
    g.arc(lx, ly, on ? 5 : 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  spawn('balloon', 0.6, dt, () => ({
    x: rand(0.1, 0.9) * W,
    y: H + 20,
    vx: rand(-10, 10),
    vy: -rand(30, 55),
    life: 0,
    max: 14,
    size: U() * 0.07,
    emoji: '🎈',
  }));
  level.set('balloon', k);
  const ps = pool('balloon');
  step(ps, dt);
  for (const p of ps) drawEmoji('🎈', p.x + Math.sin(p.life) * 10, p.y, p.size, { alpha: k, rot: Math.sin(p.life * 1.3) * 0.15 });
}

/** Space: planets drifting, a rocket, a flying saucer, shooting stars. */
export function drawSpace(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step, every, traveller } = c;
  if (!g) return;
  const k = Math.max(L('space'), 0);
  if (k < 0.01) return;
  g.globalAlpha = k;
  drawEmoji('🪐', W * 0.2 + Math.sin(time * 0.1) * W * 0.03, H * 0.22, U() * 0.18, { rot: 0.2 });
  drawEmoji('🌍', W * 0.82, H * 0.2 + Math.sin(time * 0.2) * 6, U() * 0.12, { rot: time * 0.05 });
  const r = traveller('space-rocket', dt, 0.05, H * 0.45);
  drawEmoji('🚀', r.x, r.y + Math.sin(time * 1.5) * 12, U() * 0.1, { rot: r.dir > 0 ? Math.PI / 4 : -Math.PI / 4 - Math.PI / 2 });
  const u = traveller('space-ufo', dt, 0.03, H * 0.32, -1);
  drawEmoji('🛸', u.x, u.y + Math.sin(time * 2.5) * 8, U() * 0.08, { rot: Math.sin(time * 2) * 0.1 });
  g.globalAlpha = 1;
  if (every('space', dt, 1.5, 3.5)) {
    pool('comet').push({ x: rand(0.3, 1.1) * W, y: rand(0, 0.3) * H, vx: -U() * 1.2, vy: U() * 0.5, life: 0, max: 0.9, size: 2.5 });
  }
  const ps = pool('comet');
  step(ps, dt);
  g.lineCap = 'round';
  for (const p of ps) {
    const a = (1 - p.life / p.max) * k;
    const grad = g.createLinearGradient(p.x, p.y, p.x - p.vx * 0.25, p.y - p.vy * 0.25);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = p.size;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x - p.vx * 0.25, p.y - p.vy * 0.25);
    g.stroke();
  }
}
