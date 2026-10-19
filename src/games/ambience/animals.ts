/** Animals and plants: birds, night critters, frog, chickens, seagulls, bees, cat, farm, rainforest. */
import { pick, rand } from './scene-data';
import type { Ctx } from './context';

// ---------- animals ----------
export function notes(c: Ctx, id: string, x: number, y: number, dt: number, rate: number, glyphs = ['♪', '♫']): void {
  const { g, sky, L, U, pool, step, spawn, level } = c;
  if (!g) return;
  spawn(`${id}-note`, rate, dt, () => ({
    x,
    y,
    vx: rand(-15, 15),
    vy: -rand(25, 45),
    life: 0,
    max: 2,
    size: U() * 0.035,
    emoji: pick(glyphs),
  }));
  level.set(`${id}-note`, L(id));
  const ps = pool(`${id}-note`);
  step(ps, dt);
  g.fillStyle = sky.night > 0.5 ? '#fde68a' : '#7c3aed';
  for (const p of ps) {
    g.globalAlpha = (1 - p.life / p.max) * L(id);
    g.font = `bold ${p.size}px sans-serif`;
    g.fillText(p.emoji ?? '♪', p.x + Math.sin(p.life * 4) * 6, p.y);
  }
  g.globalAlpha = 1;
}

export function drawBirds(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, drawEmoji, traveller, level } = c;
  if (!g) return;
  for (const [id, emoji, y, v] of [
    ['bird', '🐦', 0.22, 0.07],
    ['morning-bird', '🐤', 0.32, 0.05],
  ] as const) {
    const k = L(id);
    if (k < 0.01) continue;
    const b = traveller(id, dt, v, y * H);
    g.globalAlpha = k;
    // A little flock, each one flapping on its own beat.
    for (let i = 0; i < 3; i++) {
      const bx = b.x - b.dir * i * U() * 0.09;
      const by = b.y + i * U() * 0.04 + Math.sin(time * 3 + i) * U() * 0.02;
      drawEmoji(emoji, bx, by, U() * (0.075 - i * 0.012), { flip: b.dir > 0, sy: 0.85 + 0.15 * Math.abs(Math.sin(time * 10 + i)) });
    }
    g.globalAlpha = 1;
  }
  // One sits in the tree and sings.
  const k = Math.max(L('bird'), L('morning-bird'));
  if (k > 0.01) {
    const hop = Math.abs(Math.sin(time * 4)) * 4;
    const x = W * 0.1;
    const y = groundY() - U() * 0.16 - hop;
    g.globalAlpha = k;
    drawEmoji('🐦', x, y, U() * 0.06);
    g.globalAlpha = 1;
    level.set('perch', k);
    notes(c, 'perch', x + U() * 0.03, y - U() * 0.03, dt, 1.5);
  }
}

export function drawNightCritters(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, drawEmoji, glow, pool, step, spawn, level } = c;
  if (!g) return;
  // Fireflies for the crickets and the jungle.
  const k = Math.max(L('cricket'), L('jungle'));
  level.set('fly', k);
  spawn('fly', 4, dt, () => ({
    x: rand(0, W),
    y: rand(groundY() - H * 0.2, H * 0.95),
    vx: rand(-15, 15),
    vy: rand(-10, 10),
    life: 0,
    max: rand(4, 8),
    size: rand(2, 3.5),
    hue: Math.random() * 6,
  }));
  const ps = pool('fly');
  step(ps, dt);
  g.globalCompositeOperation = 'lighter';
  for (const p of ps) {
    const lit = Math.max(0, Math.sin(time * 3 + (p.hue ?? 0))) * Math.sin((p.life / p.max) * Math.PI);
    const spot = glow('217,249,157');
    if (!spot || lit < 0.02) continue;
    const r = p.size * 4;
    g.globalAlpha = lit;
    g.drawImage(spot, p.x - r, p.y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // The cricket itself, chirping with a shiver.
  const cr = L('cricket');
  if (cr > 0.01) {
    const x = W * 0.62;
    const y = H * 0.9;
    g.globalAlpha = cr;
    drawEmoji('🦗', x + Math.sin(time * 40) * (Math.sin(time * 2) > 0 ? 1.5 : 0), y, U() * 0.08);
    g.globalAlpha = 1;
    notes(c, 'cricket', x, y - U() * 0.04, dt, 1.2, ['♪']);
  }
  // The owl on its branch, blinking and turning its head.
  const o = L('owl');
  if (o > 0.01) {
    const x = W * 0.86;
    const y = H * 0.36;
    g.globalAlpha = o;
    g.strokeStyle = '#78350f';
    g.lineWidth = U() * 0.025;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(W * 1.02, y + U() * 0.05);
    g.lineTo(W * 0.74, y + U() * 0.06);
    g.stroke();
    const blink = Math.sin(time * 0.7) > 0.95 ? 0.3 : 1;
    drawEmoji('🦉', x, y, U() * 0.12, { rot: Math.sin(time * 0.5) * 0.18, sy: blink });
    g.globalAlpha = 1;
    notes(c, 'owl', x - U() * 0.05, y - U() * 0.05, dt, 0.6, ['ú', 'u']);
  }
}

export function drawFrog(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step } = c;
  if (!g) return;
  const k = L('frog');
  if (k < 0.01) return;
  // Hop, sit, hop: one arc every couple of seconds, along a lily pad pond.
  const cycle = 2.2;
  const t = (time % cycle) / cycle;
  const n = Math.floor(time / cycle);
  const x0 = W * (0.35 + ((n * 0.17) % 0.4));
  const x1 = W * (0.35 + (((n + 1) * 0.17) % 0.4));
  const hop = t < 0.35 ? t / 0.35 : 1;
  const x = x0 + (x1 - x0) * hop;
  const base = H * 0.88;
  const y = base - Math.sin(hop * Math.PI) * H * 0.1 * (t < 0.35 ? 1 : 0);
  g.globalAlpha = k;
  g.fillStyle = 'rgba(56,189,248,0.5)';
  g.beginPath();
  g.ellipse(W * 0.55, base + U() * 0.03, W * 0.28, H * 0.04, 0, 0, Math.PI * 2);
  g.fill();
  drawEmoji('🪷', W * 0.4, base + U() * 0.02, U() * 0.06);
  drawEmoji('🐸', x, y, U() * 0.09, { flip: x1 > x0 });
  if (t > 0.35 && t < 0.4) pool('ripple').push({ x, y: base + U() * 0.03, vx: 0, vy: 0, life: 0, max: 0.8, size: U() * 0.03 });
  const rp = pool('ripple');
  step(rp, dt);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  for (const p of rp) {
    const s = p.life / p.max;
    g.globalAlpha = k * (1 - s);
    g.beginPath();
    g.ellipse(p.x, p.y, p.size * (1 + s * 2), p.size * 0.35 * (1 + s * 2), 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
  // Its throat puffs out as it sings.
  if (t > 0.5 && Math.sin(time * 12) > 0) notes(c, 'frog', x, y - U() * 0.05, dt, 1, ['ộp']);
}

export function drawChickens(c: Ctx, dt: number): void {
  const { g, H, time, L, U, drawEmoji, traveller } = c;
  if (!g) return;
  const k = L('chicken');
  if (k < 0.01) return;
  const h = traveller('chicken', dt, 0.03, H * 0.86);
  g.globalAlpha = k;
  const peck = Math.sin(time * 5) > 0.7 ? 0.35 : 0;
  drawEmoji('🐔', h.x, h.y, U() * 0.1, { flip: h.dir > 0, rot: peck * h.dir });
  for (let i = 1; i <= 3; i++) {
    const cx = h.x - h.dir * i * U() * 0.07;
    drawEmoji('🐤', cx, h.y + U() * 0.02 - Math.abs(Math.sin(time * 8 + i)) * 5, U() * 0.05, { flip: h.dir > 0 });
  }
  g.globalAlpha = 1;
}

/** Seagulls wheeling over the water, and a lighthouse whose beam sweeps at night. */
export function drawSeagulls(c: Ctx): void {
  const { g, W, H, time, sky, L, U, groundY } = c;
  if (!g) return;
  const k = L('seagull');
  if (k < 0.01) return;
  g.globalAlpha = k;
  // The lighthouse, standing on the right.
  const lx = W * 0.93;
  const base = groundY() + H * 0.04;
  const lh = H * 0.3;
  const lw = U() * 0.05;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#ef4444' : '#f8fafc';
    const y0 = base - (lh * i) / 4;
    const w0 = lw * (1 - (0.25 * i) / 4);
    g.fillRect(lx - w0 / 2, y0 - lh / 4, w0, lh / 4 + 1);
  }
  g.fillStyle = '#334155';
  g.fillRect(lx - lw * 0.45, base - lh - lw * 0.7, lw * 0.9, lw * 0.7);
  const lampY = base - lh - lw * 0.35;
  const night = Math.max(sky.night, sky.storm * 0.6);
  g.fillStyle = `rgba(253,224,71,${0.6 + 0.4 * night})`;
  g.beginPath();
  g.arc(lx, lampY, lw * 0.25, 0, Math.PI * 2);
  g.fill();
  if (night > 0.05) {
    const a = Math.sin(time * 0.9) * 0.9 + Math.PI;
    const beam = g.createLinearGradient(lx, lampY, lx + Math.cos(a) * W * 0.6, lampY + Math.sin(a) * W * 0.1);
    beam.addColorStop(0, `rgba(254,240,138,${0.45 * night * k})`);
    beam.addColorStop(1, 'rgba(254,240,138,0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(lx, lampY);
    g.lineTo(lx + Math.cos(a - 0.08) * W * 0.7, lampY + Math.sin(a - 0.08) * W * 0.7);
    g.lineTo(lx + Math.cos(a + 0.08) * W * 0.7, lampY + Math.sin(a + 0.08) * W * 0.7);
    g.fill();
  }
  // Gulls: a pair of arcs each, flapping, gliding in circles.
  g.strokeStyle = sky.night > 0.5 ? '#e2e8f0' : '#475569';
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const t = time * (0.25 + i * 0.05) + i * 1.7;
    const x = W * (0.25 + i * 0.16) + Math.cos(t) * W * 0.12;
    const y = H * (0.18 + (i % 2) * 0.1) + Math.sin(t * 1.3) * H * 0.05;
    const s = U() * (0.035 - i * 0.004);
    const flap = Math.sin(time * 6 + i) * 0.5 + 0.5;
    g.beginPath();
    g.moveTo(x - s, y - s * 0.2 - flap * s * 0.4);
    g.quadraticCurveTo(x - s * 0.5, y - s * 0.6 * flap, x, y);
    g.quadraticCurveTo(x + s * 0.5, y - s * 0.6 * flap, x + s, y - s * 0.2 - flap * s * 0.4);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** Flowers along the ground, and bees zigzagging from one to the next. */
const blooms = ['🌼', '🌸', '🌻', '🌷', '🌼', '🌺'];

export function drawBees(c: Ctx): void {
  const { g, W, H, time, L, U, drawEmoji } = c;
  if (!g) return;
  const k = L('bees');
  if (k < 0.01) return;
  g.globalAlpha = k;
  const y = H * 0.86;
  blooms.forEach((f, i) => {
    const x = W * (0.28 + i * 0.09);
    drawEmoji(f, x, y + (i % 2) * H * 0.03, U() * 0.07, { rot: Math.sin(time * 1.5 + i) * 0.1 });
  });
  for (let i = 0; i < 3; i++) {
    const t = time * (0.6 + i * 0.15) + i * 2;
    const x = W * (0.28 + ((Math.sin(t * 0.7) + 1) / 2) * 0.45);
    const yy = y - H * 0.08 - Math.abs(Math.sin(t * 2.3)) * H * 0.12 + Math.sin(time * 25 + i) * 2;
    drawEmoji('🐝', x, yy, U() * 0.05, { flip: Math.cos(t * 0.7) > 0 });
  }
  g.globalAlpha = 1;
}

/** A cat curled up asleep, breathing slowly, its purr drifting up. */
export function drawCat(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji } = c;
  if (!g) return;
  const k = L('cat');
  if (k < 0.01) return;
  const x = W * 0.8;
  const y = H * 0.9;
  const breathe = 1 + Math.sin(time * 1.6) * 0.04;
  g.globalAlpha = k;
  g.fillStyle = 'rgba(244,114,182,0.35)';
  g.beginPath();
  g.ellipse(x, y + U() * 0.03, U() * 0.1, U() * 0.025, 0, 0, Math.PI * 2);
  g.fill();
  drawEmoji('🐈', x, y, U() * 0.12, { sy: breathe });
  g.globalAlpha = 1;
  notes(c, 'cat', x + U() * 0.03, y - U() * 0.06, dt, 1.2, ['r', 'rr', 'ừ']);
}

/** A red barn on the horizon and the animals grazing in front of it. */
export function drawFarm(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, groundY, drawEmoji, traveller, level } = c;
  if (!g) return;
  const k = L('farm');
  if (k < 0.01) return;
  const bx = W * 0.72;
  const gy = groundY();
  const bw = U() * 0.16;
  const bh = U() * 0.12;
  g.globalAlpha = k;
  g.fillStyle = '#b91c1c';
  g.fillRect(bx - bw / 2, gy - bh, bw, bh);
  g.beginPath();
  g.moveTo(bx - bw * 0.6, gy - bh);
  g.lineTo(bx, gy - bh * 1.7);
  g.lineTo(bx + bw * 0.6, gy - bh);
  g.fill();
  g.fillStyle = '#f8fafc';
  g.fillRect(bx - bw * 0.15, gy - bh * 0.6, bw * 0.3, bh * 0.6);
  g.strokeStyle = '#f8fafc';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(bx - bw * 0.15, gy - bh * 0.6);
  g.lineTo(bx + bw * 0.15, gy);
  g.moveTo(bx + bw * 0.15, gy - bh * 0.6);
  g.lineTo(bx - bw * 0.15, gy);
  g.stroke();
  for (const [id, emoji, v, y] of [
    ['farm-cow', '🐄', 0.012, 0.08],
    ['farm-sheep', '🐑', 0.018, 0.12],
    ['farm-pig', '🐖', 0.015, 0.16],
  ] as const) {
    level.set(id, k);
    const a = traveller(id, dt, v, gy + H * y);
    const graze = Math.sin(time * 2 + v * 400) > 0.6 ? 0.2 : 0;
    drawEmoji(emoji, a.x, a.y, U() * 0.09, { flip: a.dir > 0, rot: graze * a.dir });
  }
  g.globalAlpha = 1;
}

/** Rainforest: big leaves framing the picture, a parrot flying, a monkey bounding from perch to perch. */
export function drawRainforest(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, traveller } = c;
  if (!g) return;
  const k = L('rainforest');
  if (k < 0.01) return;
  g.globalAlpha = k;
  const sway = Math.sin(time * 0.9) * 0.08;
  for (const [x, y, s, r, f] of [
    [0.02, 0.05, 0.3, 0.5, false],
    [0.98, 0.05, 0.3, -0.5, true],
    [0.0, 0.6, 0.26, 0.2, false],
    [1.0, 0.6, 0.26, -0.2, true],
  ] as const) {
    drawEmoji('🌿', x * W, y * H, U() * s, { rot: r + sway, flip: f });
  }
  // A monkey bounding from one leafy perch to the next: an arc through the air
  // with a little tumble, a squash on landing, a moment's rest. (It used to swing
  // on a vine hanging from the top edge, which looked like something else entirely.)
  const perches = [0.3, 0.5, 0.7, 0.5];
  const hopS = 1.6;
  const n = Math.floor(time / hopS);
  const t = (time % hopS) / hopS;
  const from = perches[n % perches.length]!;
  const to = perches[(n + 1) % perches.length]!;
  const perchY = H * 0.52;
  const air = Math.min(1, t / 0.55);
  const mx = W * (from + (to - from) * air);
  const my = perchY - Math.sin(air * Math.PI) * H * 0.2;
  const landed = t >= 0.55;
  const squash = landed && t < 0.68 ? 0.8 : 1;
  for (const px of [0.3, 0.5, 0.7]) drawEmoji('🌿', W * px, perchY + U() * 0.06, U() * 0.12, { rot: sway });
  drawEmoji('🐒', mx, my - (1 - squash) * U() * 0.02, U() * 0.1, {
    flip: to > from,
    rot: landed ? 0 : Math.sin(air * Math.PI) * 0.6 * (to > from ? 1 : -1),
    sy: squash,
  });
  const p = traveller('rainforest-parrot', dt, 0.08, H * 0.22);
  drawEmoji('🦜', p.x, p.y + Math.sin(time * 3) * 10, U() * 0.08, { flip: p.dir > 0, sy: 0.85 + 0.15 * Math.abs(Math.sin(time * 9)) });
  g.globalAlpha = 1;
}
