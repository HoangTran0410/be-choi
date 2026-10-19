/** Weather: rain, thunder and lightning, wind, snow. */
import { pick, rand, type P } from './scene-data';
import type { Ctx } from './context';

// ---------- weather ----------
export function drawRain(c: Ctx, dt: number): void {
  const { g, W, H, sky, U, groundY, wind, pool, step, spawn } = c;
  if (!g) return;
  const lean = 0.15 + wind() * 0.5;
  for (const [id, rate, len, speed] of [
    ['rain', 90, 0.035, 1.1],
    ['heavy-rain', 260, 0.06, 1.7],
  ] as const) {
    spawn(id, rate, dt, () => ({ x: rand(-0.2 * W, W), y: -20, vx: lean * H * speed, vy: H * speed, life: 0, max: 2, size: len * H }));
    const ps = pool(id);
    step(ps, dt);
    g.strokeStyle = sky.night > 0.5 ? 'rgba(191,219,254,0.5)' : 'rgba(255,255,255,0.7)';
    g.lineWidth = id === 'heavy-rain' ? 2 : 1.4;
    g.beginPath();
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i] as P;
      const floor = groundY() + H * 0.12 + (p.x % 37) * 0.004 * H;
      if (p.y > floor) {
        // A splash where it lands.
        pool('splash').push({ x: p.x, y: floor, vx: 0, vy: 0, life: 0, max: 0.35, size: U() * 0.015 });
        ps.splice(i, 1);
        continue;
      }
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - (p.vx / p.vy) * p.size, p.y - p.size);
    }
    g.stroke();
  }
  const sp = pool('splash');
  step(sp, dt);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 1;
  for (const p of sp) {
    const k = p.life / p.max;
    g.globalAlpha = 1 - k;
    g.beginPath();
    g.ellipse(p.x, p.y, p.size * (0.4 + k), p.size * 0.3 * (0.4 + k), 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

export function drawThunder(c: Ctx, dt: number): void {
  const { g, W, H, L, groundY } = c;
  if (!g) return;
  c.nextBolt -= dt;
  if (L('thunder') > 0.5 && c.nextBolt <= 0) {
    c.nextBolt = rand(3.5, 8);
    c.flash = 1;
    const pts: [number, number][] = [];
    let x = rand(0.2, 0.8) * W;
    for (let y = H * 0.12; y < groundY(); y += H * rand(0.04, 0.08)) {
      pts.push([x, y]);
      x += rand(-0.05, 0.05) * W;
    }
    c.bolt = { pts, life: 0.35 };
  }
  if (c.bolt) {
    c.bolt.life -= dt;
    g.strokeStyle = `rgba(254,249,195,${Math.max(0, c.bolt.life / 0.35)})`;
    g.lineWidth = 4;
    g.shadowColor = '#fef08a';
    g.shadowBlur = 20;
    g.beginPath();
    c.bolt.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.shadowBlur = 0;
    if (c.bolt.life <= 0) c.bolt = null;
  }
}

export function drawWind(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step, spawn, level } = c;
  if (!g) return;
  const k = L('wind');
  spawn('wind', 6, dt, () => ({
    x: -0.3 * W,
    y: rand(0.1, 0.75) * H,
    vx: rand(0.8, 1.3) * W,
    vy: 0,
    life: 0,
    max: 2.2,
    size: rand(0.15, 0.3) * W,
    hue: Math.random() * 6,
  }));
  const ps = pool('wind');
  step(ps, dt);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  for (const p of ps) {
    g.globalAlpha = k * Math.sin((p.life / p.max) * Math.PI);
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const x = p.x - (i / 12) * p.size;
      const y = p.y + Math.sin(x / 60 + (p.hue ?? 0) + time * 3) * 8;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  spawn('leaf', 3, dt, () => ({
    x: -30,
    y: rand(0.2, 0.8) * H,
    vx: rand(0.35, 0.6) * W,
    vy: rand(-20, 20),
    life: 0,
    max: 5,
    size: U() * rand(0.04, 0.06),
    spin: rand(-4, 4),
    emoji: pick(['🍃', '🍂', '🍁']),
  }));
  level.set('leaf', k);
  const leaves = pool('leaf');
  step(leaves, dt);
  for (const p of leaves) {
    p.vy = Math.sin(p.life * 3 + p.size) * 40;
    drawEmoji(p.emoji ?? '🍃', p.x, p.y, p.size, { rot: p.a });
  }
}

/** Snow: flakes drifting down and swaying, a snowman on the white hill. */
export function drawSnow(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, wind, drawEmoji, pool, step, spawn } = c;
  if (!g) return;
  const k = L('snow');
  spawn('snow', 45, dt, () => ({
    x: rand(-0.1, 1.1) * W,
    y: -10,
    vx: rand(-10, 10),
    vy: rand(25, 60),
    life: 0,
    max: 20,
    size: rand(1.5, 4.5),
    hue: Math.random() * 6,
  }));
  const ps = pool('snow');
  step(ps, dt);
  // Every flake in one path, filled once.
  g.fillStyle = `rgba(255,255,255,${0.9 * Math.min(1, k * 1.5)})`;
  g.beginPath();
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i] as P;
    if (p.y > H) {
      ps.splice(i, 1);
      continue;
    }
    const x = p.x + Math.sin(p.life * 1.5 + (p.hue ?? 0)) * 12 + wind() * p.life * 30;
    g.moveTo(x + p.size, p.y);
    g.arc(x, p.y, p.size, 0, Math.PI * 2);
  }
  g.fill();
  if (k > 0.01) drawEmoji('⛄', W * 0.3, groundY() + H * 0.08, U() * 0.14, { alpha: k, rot: Math.sin(time * 0.8) * 0.04 });
}
