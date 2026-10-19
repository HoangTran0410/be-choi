/** Fireworks: rockets climbing, shells bursting into streaks of light. */
import { pick, rand } from './scene-data';
import type { Ctx } from './context';

/**
 * Fireworks the way they go up: a rocket climbs on a trail of sparks, slows, and
 * bursts at the top. Every star of the burst remembers where it has just been and
 * is drawn as a streak fading back along that path, so the burst reads as lines
 * of light arcing out and drooping, not as a ring of dots. Three kinds take turns:
 * a many-coloured peony, a golden willow whose long trails hang and fall, and a
 * ring.
 */
export type Shell = 'peony' | 'willow' | 'ring';

export interface Rocket {
  x: number;
  y: number;
  vy: number;
  top: number;
  hue: number;
  shell: Shell;
}

export interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  sat: number;
  /** Where it has been, newest last: the trail. */
  trail: number[];
  trailLen: number;
  drag: number;
}

const SHELLS: readonly Shell[] = ['peony', 'peony', 'willow', 'ring'];

export function burst(c: Ctx, r: Rocket): void {
  const { U, burstStars, flashes } = c;
  const willow = r.shell === 'willow';
  const n = r.shell === 'ring' ? 36 : willow ? 46 : 60;
  const speed = U() * (willow ? 0.42 : 0.55);
  for (let i = 0; i < n; i++) {
    const a = r.shell === 'ring' ? (i / n) * Math.PI * 2 : Math.random() * Math.PI * 2;
    // A peony fills a sphere, so its burstStars fly at every speed; a ring all at one.
    const v = speed * (r.shell === 'ring' ? 1 : Math.sqrt(Math.random()) * rand(0.85, 1.1));
    burstStars.push({
      x: r.x,
      y: r.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0,
      max: willow ? rand(2.2, 2.9) : rand(1.2, 1.7),
      hue: willow ? rand(38, 48) : r.shell === 'peony' && Math.random() < 0.3 ? r.hue + 150 : r.hue + rand(-15, 15),
      sat: willow ? 85 : 100,
      trail: [],
      trailLen: willow ? 55 : 24,
      drag: willow ? 1.9 : 1.3,
    });
  }
  flashes.push({ x: r.x, y: r.y, life: 0, hue: r.hue });
}

export function drawFirework(c: Ctx, dt: number): void {
  const { g, W, H, L, U, groundY, pool, step, every, rockets, burstStars, flashes } = c;
  if (!g) return;
  const k = L('firework');
  if (every('firework', dt, 0.6, 1.4) && rockets.length < 3) {
    rockets.push({
      x: rand(0.15, 0.85) * W,
      y: groundY(),
      vy: -H * rand(0.95, 1.2),
      top: rand(0.12, 0.38) * H,
      hue: rand(0, 360),
      shell: pick(SHELLS),
    });
  }
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';

  // The rockets going up, each dropping sparks behind it.
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i] as Rocket;
    r.y += r.vy * dt;
    r.vy *= 1 - dt * 0.9;
    pool('rocket-spark').push({
      x: r.x + rand(-1.5, 1.5),
      y: r.y,
      vx: rand(-12, 12),
      vy: rand(10, 40),
      life: 0,
      max: rand(0.35, 0.6),
      size: rand(1, 2),
    });
    g.fillStyle = `hsla(40,100%,85%,${k})`;
    g.beginPath();
    g.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
    g.fill();
    if (r.y <= r.top || r.vy > -H * 0.12) {
      burst(c, r);
      rockets.splice(i, 1);
    }
  }
  const sparks = pool('rocket-spark');
  step(sparks, dt, U() * 0.3);
  for (const p of sparks) {
    g.fillStyle = `hsla(35,100%,70%,${(1 - p.life / p.max) * k})`;
    g.fillRect(p.x, p.y, p.size, p.size);
  }

  // The moment of the burst: a soft c.flash of its colour.
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]!;
    f.life += dt;
    const t = f.life / 0.35;
    if (t >= 1) {
      flashes.splice(i, 1);
      continue;
    }
    const r = U() * (0.08 + t * 0.12);
    const glow = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    glow.addColorStop(0, `hsla(${f.hue},100%,90%,${(1 - t) * 0.8 * k})`);
    glow.addColorStop(1, `hsla(${f.hue},100%,60%,0)`);
    g.fillStyle = glow;
    g.fillRect(f.x - r, f.y - r, r * 2, r * 2);
  }

  // The burstStars: each a streak along the path it has just flown.
  const gravity = U() * 0.28;
  for (let i = burstStars.length - 1; i >= 0; i--) {
    const s = burstStars[i]!;
    s.life += dt;
    if (s.life >= s.max) {
      burstStars.splice(i, 1);
      continue;
    }
    const drag = Math.exp(-s.drag * dt);
    s.vx *= drag;
    s.vy = s.vy * drag + gravity * dt;
    s.trail.push(s.x, s.y);
    if (s.trail.length > s.trailLen * 2) s.trail.splice(0, 2);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const t = s.life / s.max;
    // Bright to the end, then gone quickly — with a flicker as it burns out.
    const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const flicker = t > 0.6 && Math.random() < 0.35 ? 0.3 : 1;
    const a = fade * flicker * Math.max(k, 0.3);
    // Kept well below white: under 'lighter' overlapping stars add up, and a burst
    // that starts near white turns into one white blob.
    const light = 48 + (1 - t) * 14;
    // Trail: segments fading and thinning towards the tail.
    // In four pieces, each a little brighter and wider than the one behind it:
    // as good as a stroke per segment to the eye, and a tenth of the draw calls.
    const pts = s.trail;
    const count = pts.length / 2;
    const PIECES = 4;
    for (let q = 0; q < PIECES; q++) {
      const from = Math.floor((q * count) / PIECES);
      const to = q === PIECES - 1 ? count : Math.floor(((q + 1) * count) / PIECES) + 1;
      if (to - from < 1) continue;
      const w = (q + 1) / PIECES;
      g.strokeStyle = `hsla(${s.hue},${s.sat}%,${light}%,${a * w * w * 0.85})`;
      g.lineWidth = 0.5 + w * 2.2;
      g.beginPath();
      g.moveTo(pts[from * 2]!, pts[from * 2 + 1]!);
      for (let j = from + 1; j < to && j < count; j++) g.lineTo(pts[j * 2]!, pts[j * 2 + 1]!);
      if (q === PIECES - 1) g.lineTo(s.x, s.y);
      g.stroke();
    }
    // The star itself, white-hot at the head.
    g.fillStyle = `hsla(${s.hue},100%,${light + 22}%,${a})`;
    g.beginPath();
    g.arc(s.x, s.y, 1.8 + (1 - t) * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}
