/** Indoor and cosy things: campfire, the house, music box, heartbeat, bath, typing, coffee. */
import { mix, rand, rgb } from './scene-data';
import type { Ctx } from './context';
import { notes } from './animals';

export function drawCampfire(c: Ctx, dt: number): void {
  const { g, W, H, time, sky, L, U, groundY, drawEmoji, pool, step, spawn, level } = c;
  if (!g) return;
  const k = L('campfire');
  if (k < 0.01) return;
  const x = W * 0.2;
  const y = groundY() + H * 0.14;
  const s = U() * 0.06;
  // Warm glow on the ground, stronger in the dark.
  const warm = g.createRadialGradient(x, y, 0, x, y, s * (5 + sky.night * 4));
  warm.addColorStop(0, `rgba(251,146,60,${k * (0.35 + sky.night * 0.35)})`);
  warm.addColorStop(1, 'rgba(251,146,60,0)');
  g.fillStyle = warm;
  g.fillRect(x - s * 10, y - s * 10, s * 20, s * 20);
  g.globalAlpha = k;
  drawEmoji('🪵', x, y + s * 0.3, s * 1.4);
  spawn('campfire', 40, dt, () => ({
    x: x + rand(-0.4, 0.4) * s,
    y,
    vx: rand(-10, 10),
    vy: -rand(40, 80),
    life: 0,
    max: rand(0.5, 0.9),
    size: s * rand(0.35, 0.6),
  }));
  const ps = pool('campfire');
  step(ps, dt);
  g.globalCompositeOperation = 'lighter';
  for (const p of ps) {
    const t = p.life / p.max;
    const c = mix([253, 224, 71], [239, 68, 68], t);
    g.fillStyle = rgb(c, (1 - t) * 0.8 * k);
    g.beginPath();
    g.arc(p.x + Math.sin(time * 9 + p.y) * 3, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // Sparks.
  spawn('spark', 6, dt, () => ({ x, y: y - s, vx: rand(-20, 20), vy: -rand(60, 120), life: 0, max: 1.5, size: 2 }));
  level.set('spark', k);
  const sp = pool('spark');
  step(sp, dt);
  g.fillStyle = '#fde68a';
  for (const p of sp) g.fillRect(p.x + Math.sin(p.life * 8) * 4, p.y, 2.5, 2.5);
  g.globalAlpha = 1;
}

// ---------- home ----------
export function drawHome(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step, spawn, level } = c;
  if (!g) return;
  // Wind chime hanging from the top, swinging and twinkling.
  const ch = L('chime');
  if (ch > 0.01) {
    const x = W * 0.3;
    const swing = Math.sin(time * 1.6) * 0.25;
    g.globalAlpha = ch;
    g.strokeStyle = 'rgba(120,53,15,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + Math.sin(swing) * H * 0.12, Math.cos(swing) * H * 0.12);
    g.stroke();
    drawEmoji('🎐', x + Math.sin(swing) * H * 0.17, Math.cos(swing) * H * 0.17, U() * 0.1, { rot: -swing });
    g.globalAlpha = 1;
    notes(c, 'chime', x + Math.sin(swing) * H * 0.17, H * 0.22, dt, 1.4, ['✦', '♪']);
  }
  // Grandfather clock, pendulum swinging in time.
  const cl = L('clock');
  if (cl > 0.01) {
    const x = W * 0.92;
    const y = H * 0.55;
    const s = U() * 0.14;
    g.globalAlpha = cl;
    g.fillStyle = '#92400e';
    g.fillRect(x - s * 0.3, y, s * 0.6, s * 1.1);
    const a = Math.sin(time * Math.PI) * 0.4;
    g.strokeStyle = '#fbbf24';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y + s * 0.1);
    g.lineTo(x + Math.sin(a) * s * 0.7, y + s * 0.1 + Math.cos(a) * s * 0.7);
    g.stroke();
    g.fillStyle = '#fbbf24';
    g.beginPath();
    g.arc(x + Math.sin(a) * s * 0.7, y + s * 0.1 + Math.cos(a) * s * 0.7, s * 0.1, 0, Math.PI * 2);
    g.fill();
    drawEmoji('🕰️', x, y - s * 0.2, s);
    g.globalAlpha = 1;
    notes(c, 'clock', x - s * 0.5, y - s * 0.6, dt, 1, ['tích', 'tắc']);
  }
  // A fan turning, stirring swirls of air.
  const fa = L('fan');
  if (fa > 0.01) {
    const x = W * 0.5;
    const y = H * 0.1;
    g.globalAlpha = fa;
    g.save();
    g.translate(x, y);
    g.rotate(time * 6);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.ellipse(U() * 0.06, 0, U() * 0.06, U() * 0.018, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#64748b';
    g.beginPath();
    g.arc(0, 0, U() * 0.015, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const r = ((time * 40 + i * 30) % 90) / 90;
      g.globalAlpha = fa * (1 - r);
      g.beginPath();
      g.arc(x, y, U() * (0.1 + r * 0.2), Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  // A book whose pages float away like butterflies.
  const bk = L('book');
  if (bk > 0.01) {
    const x = W * 0.5;
    const y = H * 0.55;
    g.globalAlpha = bk;
    drawEmoji('📖', x, y + Math.sin(time) * 5, U() * 0.12);
    spawn('book', 0.8, dt, () => ({
      x,
      y: y - U() * 0.03,
      vx: rand(-40, 40),
      vy: -rand(20, 40),
      life: 0,
      max: 4,
      size: U() * 0.04,
      spin: rand(-2, 2),
    }));
    const ps = pool('book');
    step(ps, dt);
    for (const p of ps) {
      g.globalAlpha = bk * (1 - p.life / p.max);
      g.save();
      g.translate(p.x + Math.sin(p.life * 3) * 15, p.y);
      g.rotate(p.a ?? 0);
      g.scale(1, Math.abs(Math.sin(p.life * 5)) * 0.6 + 0.4);
      g.fillStyle = '#fffbeb';
      g.strokeStyle = '#d6d3d1';
      g.fillRect(-p.size / 2, -p.size * 0.65, p.size, p.size * 1.3);
      g.strokeRect(-p.size / 2, -p.size * 0.65, p.size, p.size * 1.3);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  // Kitchen and street food: something steaming.
  for (const [id, emoji, fx] of [
    ['kitchen', '🍳', 0.4],
    ['restaurant', '🍜', 0.78],
  ] as const) {
    const k = L(id);
    if (k < 0.01) continue;
    const x = W * fx;
    const y = H * 0.9;
    g.globalAlpha = k;
    drawEmoji(emoji, x, y, U() * 0.11);
    spawn(`${id}-steam`, 5, dt, () => ({
      x: x + rand(-10, 10),
      y: y - U() * 0.04,
      vx: rand(-5, 5),
      vy: -rand(25, 45),
      life: 0,
      max: 2.2,
      size: U() * 0.02,
    }));
    level.set(`${id}-steam`, k);
    const ps = pool(`${id}-steam`);
    step(ps, dt);
    for (const p of ps) {
      const t = p.life / p.max;
      g.fillStyle = `rgba(255,255,255,${(1 - t) * 0.55 * k})`;
      g.beginPath();
      g.arc(p.x + Math.sin(p.life * 3) * 10, p.y, p.size * (1 + t * 1.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // Lanterns strung over the street food.
  const rs = L('restaurant');
  if (rs > 0.01) {
    g.globalAlpha = rs;
    g.strokeStyle = 'rgba(120,53,15,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(W * 0.55, H * 0.05);
    g.quadraticCurveTo(W * 0.77, H * 0.16, W * 1, H * 0.05);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      const lx = W * (0.55 + t * 0.45);
      const ly = H * 0.05 + Math.sin(t * Math.PI) * H * 0.055 + U() * 0.03;
      drawEmoji('🏮', lx, ly, U() * 0.06, { rot: Math.sin(time * 1.5 + i) * 0.15 });
    }
    g.globalAlpha = 1;
  }
  // Lullaby: Zs drifting up, the whole picture dimmed.
  const sl = L('sleep');
  if (sl > 0.01) {
    g.fillStyle = `rgba(15,23,42,${sl * 0.25})`;
    g.fillRect(0, 0, W, H);
    notes(c, 'sleep', W * 0.82, H * 0.22, dt, 0.8, ['z', 'Z', '💤']);
  }
}

/** A carousel music box turning, its notes spiralling up. */
export function drawMusicBox(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji } = c;
  if (!g) return;
  const k = L('musicbox');
  if (k < 0.01) return;
  const x = W * 0.55;
  const y = H * 0.66;
  g.globalAlpha = k;
  drawEmoji('🎠', x, y + Math.sin(time * 2) * 4, U() * 0.16, { flip: Math.sin(time * 0.8) < 0 });
  g.globalAlpha = 1;
  notes(c, 'musicbox', x + Math.sin(time * 3) * U() * 0.06, y - U() * 0.08, dt, 2.2, ['♪', '♫', '♬']);
}

export function drawHeartbeat(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step } = c;
  if (!g) return;
  const k = L('heartbeat');
  if (k < 0.01) return;
  const x = W * 0.5;
  const y = H * 0.36;
  const period = 60 / 70;
  const t = (time % period) / period;
  // Two quick thumps, then rest.
  const pulse = Math.exp(-(((t - 0.05) / 0.05) ** 2)) + 0.6 * Math.exp(-(((t - 0.22) / 0.05) ** 2));
  const beat = Math.floor(time / period);
  if (beat !== c.lastBeat) {
    c.lastBeat = beat;
    pool('heart-ring').push({ x, y, vx: 0, vy: 0, life: 0, max: 1.4, size: U() * 0.08 });
  }
  const rings = pool('heart-ring');
  step(rings, dt);
  g.lineWidth = 3;
  for (const r of rings) {
    const p = r.life / r.max;
    g.strokeStyle = `rgba(244,63,94,${(1 - p) * 0.6 * k})`;
    g.beginPath();
    g.arc(r.x, r.y, r.size * (1 + p * 2.5), 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = k;
  drawEmoji('❤️', x, y, U() * 0.16 * (1 + pulse * 0.18));
  g.globalAlpha = 1;
}

/** A bathtub full of foam, with a rubber duck bobbing on it. */
export function drawBath(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step, spawn } = c;
  if (!g) return;
  const k = L('bath');
  if (k < 0.01) return;
  const x = W * 0.2;
  const y = H * 0.88;
  g.globalAlpha = k;
  drawEmoji('🛁', x, y, U() * 0.18);
  drawEmoji('🦆', x + U() * 0.02 + Math.sin(time) * U() * 0.02, y - U() * 0.06 + Math.sin(time * 2.2) * 3, U() * 0.06, {
    rot: Math.sin(time * 2.2) * 0.15,
  });
  g.globalAlpha = 1;
  spawn('foam', 5, dt, () => ({
    x: x + rand(-0.06, 0.06) * U(),
    y: y - U() * 0.05,
    vx: rand(-8, 8),
    vy: -rand(20, 40),
    life: 0,
    max: 3,
    size: rand(0.006, 0.018) * U(),
    hue: Math.random() * 6,
  }));
  const ps = pool('foam');
  step(ps, dt);
  g.lineWidth = 1.5;
  for (const p of ps) {
    const bx = p.x + Math.sin(p.life * 3 + (p.hue ?? 0)) * 6;
    g.strokeStyle = `rgba(255,255,255,${(1 - p.life / p.max) * k})`;
    g.fillStyle = `rgba(224,242,254,${(1 - p.life / p.max) * 0.35 * k})`;
    g.beginPath();
    g.arc(bx, p.y, p.size, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

/** A keyboard, and the letters it types flying up in colours. */
export function drawTyping(c: Ctx, dt: number): void {
  const { g, W, H, time, L, U, drawEmoji, pool, step, spawn } = c;
  if (!g) return;
  const k = L('typing');
  if (k < 0.01) return;
  const x = W * 0.45;
  const y = H * 0.9;
  g.globalAlpha = k;
  drawEmoji('⌨️', x, y + (Math.sin(time * 20) > 0.5 ? 1.5 : 0), U() * 0.14);
  g.globalAlpha = 1;
  spawn('typing-letter', 5, dt, () => ({
    x: x + rand(-0.05, 0.05) * U(),
    y: y - U() * 0.05,
    vx: rand(-40, 40),
    vy: -rand(50, 90),
    life: 0,
    max: 2,
    size: U() * rand(0.04, 0.06),
    hue: rand(0, 360),
    emoji: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  }));
  const ps = pool('typing-letter');
  step(ps, dt);
  g.textAlign = 'center';
  for (const p of ps) {
    g.fillStyle = `hsla(${p.hue},85%,55%,${(1 - p.life / p.max) * k})`;
    g.font = `900 ${p.size}px ui-rounded, system-ui, sans-serif`;
    g.fillText(p.emoji ?? 'A', p.x, p.y);
  }
  g.textAlign = 'start';
}

/** A café table: a steaming cup and a croissant. */
export function drawCoffee(c: Ctx, dt: number): void {
  const { g, W, H, L, U, drawEmoji, pool, step, spawn } = c;
  if (!g) return;
  const k = L('coffee');
  if (k < 0.01) return;
  const x = W * 0.62;
  const y = H * 0.9;
  g.globalAlpha = k;
  drawEmoji('☕', x, y, U() * 0.1);
  drawEmoji('🥐', x + U() * 0.09, y + U() * 0.01, U() * 0.07);
  g.globalAlpha = 1;
  spawn('coffee-steam', 4, dt, () => ({
    x: x + rand(-6, 6),
    y: y - U() * 0.04,
    vx: rand(-4, 4),
    vy: -rand(20, 35),
    life: 0,
    max: 2.2,
    size: U() * 0.015,
  }));
  const ps = pool('coffee-steam');
  step(ps, dt);
  for (const p of ps) {
    const t = p.life / p.max;
    g.fillStyle = `rgba(255,255,255,${(1 - t) * 0.5 * k})`;
    g.beginPath();
    g.arc(p.x + Math.sin(p.life * 3) * 8, p.y, p.size * (1 + t * 1.5), 0, Math.PI * 2);
    g.fill();
  }
}
