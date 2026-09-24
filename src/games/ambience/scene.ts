/**
 * The picture behind the mixer. Every background that is switched on paints
 * something: rain falls, the sea rolls in along the bottom, wind blows leaves
 * across, the sky goes dark for the crickets and the owl. Effects fade in and
 * out with their sound, so switching one off never makes the picture jump.
 *
 * One canvas, one frame loop. Everything is placed in fractions of the canvas
 * so it holds up from a phone on its side to a tablet standing up.
 */
import { skyOf, type Sky } from './logic';

export interface Scene {
  /** What is playing now. Effects ease towards it. */
  setOn(ids: readonly string[]): void;
  /** A big picture of what was just switched on, blooming in the middle. */
  announce(emoji: string): void;
  /** A little burst of sparkles where the child touched the sky. */
  sparkle(x: number, y: number): void;
  /** A photograph to play over instead of the drawn landscape; null for the drawing. */
  setBackdrop(img: HTMLImageElement | null): void;
  destroy(): void;
}

type RGB = [number, number, number];
interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue?: number;
  spin?: number;
  a?: number;
  emoji?: string;
}

const SKIES: Record<Sky | 'day', [RGB, RGB]> = {
  day: [
    [125, 211, 252],
    [224, 242, 254],
  ],
  dawn: [
    [244, 114, 182],
    [253, 230, 138],
  ],
  storm: [
    [71, 85, 105],
    [148, 163, 184],
  ],
  night: [
    [11, 16, 38],
    [49, 46, 129],
  ],
  deep: [
    [14, 116, 144],
    [8, 51, 68],
  ],
};

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;

export function createScene(canvas: HTMLCanvasElement): Scene {
  const g = canvas.getContext('2d');
  let W = 1;
  let H = 1;
  let alive = true;
  let raf = 0;
  let last = performance.now();
  let time = 0;

  /** Target (0/1) and eased level of every effect, and of every sky. */
  const want = new Map<string, number>();
  const level = new Map<string, number>();
  let skyWant: Record<Sky, number> = { night: 0, storm: 0, dawn: 0, deep: 0 };
  const sky: Record<Sky, number> = { night: 0, storm: 0, dawn: 0, deep: 0 };
  const L = (id: string) => level.get(id) ?? 0;

  // ---- emoji, drawn once per size and reused ----
  const sprites = new Map<string, HTMLCanvasElement>();
  function emo(ch: string, size: number): HTMLCanvasElement | null {
    const s = Math.max(8, Math.round(size / 4) * 4);
    const key = `${ch}@${s}`;
    let c = sprites.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(s * 1.3);
      const cg = c.getContext('2d');
      if (!cg) return null;
      cg.font = `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillText(ch, c.width / 2, c.height / 2 + s * 0.05);
      sprites.set(key, c);
    }
    return c;
  }
  function drawEmoji(
    ch: string,
    x: number,
    y: number,
    size: number,
    opts: { rot?: number; alpha?: number; flip?: boolean; sy?: number } = {},
  ): void {
    const c = emo(ch, size);
    if (!c || !g) return;
    g.save();
    g.globalAlpha *= opts.alpha ?? 1;
    g.translate(x, y);
    if (opts.rot) g.rotate(opts.rot);
    g.scale(opts.flip ? -1 : 1, opts.sy ?? 1);
    g.drawImage(c, -c.width / 2, -c.height / 2, c.width, c.height);
    g.restore();
  }

  // ---- particles, one pool per effect ----
  const pools = new Map<string, P[]>();
  const pool = (id: string) => {
    let p = pools.get(id);
    if (!p) pools.set(id, (p = []));
    return p;
  };
  function step(ps: P[], dt: number, gravity = 0): void {
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i] as P;
      p.life += dt;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.a = (p.a ?? 0) + p.spin * dt;
      if (p.life >= p.max) ps.splice(i, 1);
    }
  }
  /** Spawn at `rate` per second, scaled by how far faded in the effect is. */
  const spawnAcc = new Map<string, number>();
  function spawn(id: string, rate: number, dt: number, make: () => P): void {
    let acc = (spawnAcc.get(id) ?? 0) + rate * L(id) * dt;
    const ps = pool(id);
    while (acc >= 1) {
      acc -= 1;
      if (ps.length < 600) ps.push(make());
    }
    spawnAcc.set(id, acc);
  }

  /** The photograph behind everything, if one was chosen, and how far it has faded in. */
  let photo: HTMLImageElement | null = null;
  let photoIn = 0;

  // ---- one-off moments ----
  let flash = 0;
  let bolt: { pts: [number, number][]; life: number } | null = null;
  let nextBolt = 2;
  let hero: { emoji: string; life: number } | null = null;
  const timers = new Map<string, number>();
  /** True once every `every` seconds (jittered) while `id` is on. */
  function every(id: string, dt: number, lo: number, hi: number): boolean {
    if (L(id) < 0.5) return false;
    const t = (timers.get(id) ?? rand(0, lo)) - dt;
    if (t > 0) {
      timers.set(id, t);
      return false;
    }
    timers.set(id, rand(lo, hi));
    return true;
  }

  // ---- things that travel across, one per effect ----
  const travellers = new Map<string, { x: number; dir: number; speed: number; y: number }>();
  function traveller(id: string, dt: number, speed: number, y: number, dir = 1) {
    let t = travellers.get(id);
    const margin = W * 0.3;
    if (!t) {
      // The first pass starts on screen: switching the whale on and waiting ten
      // seconds for it to swim in feels like nothing happened.
      t = { x: rand(0.15, 0.85) * W, dir, speed, y };
      travellers.set(id, t);
    }
    t.x += t.dir * t.speed * W * dt;
    if ((t.dir > 0 && t.x > W + margin) || (t.dir < 0 && t.x < -margin)) {
      t.dir = Math.random() < 0.5 ? 1 : -1;
      t.x = t.dir > 0 ? -margin : W + margin;
      t.y = y;
    }
    return t;
  }

  function resize(): void {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  resize();

  /**
   * x positions every `step` px from the left edge to the right one — always ending
   * exactly on W. A plain `x <= W; x += step` stops short whenever the width is not a
   * multiple of the step, and a filled outline drawn from it drops straight down from
   * there, cutting a notch out of the right-hand corner.
   */
  function across(step: number): number[] {
    const xs: number[] = [];
    for (let x = 0; x < W; x += step) xs.push(x);
    xs.push(W);
    return xs;
  }

  // ---- layout ----
  const U = () => Math.min(W, H);
  const groundY = () => H * 0.68;
  const wind = () => L('wind') + L('fan') * 0.3;

  // =================== drawing ===================

  function drawSky(): void {
    if (!g) return;
    let top = SKIES.day[0];
    let bot = SKIES.day[1];
    for (const k of ['dawn', 'storm', 'night', 'deep'] as const) {
      top = mix(top, SKIES[k][0], sky[k]);
      bot = mix(bot, SKIES[k][1], sky[k]);
    }
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgb(top));
    grad.addColorStop(1, rgb(bot));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.6, t: Math.random() * 6 }));
  /**
   * The photograph, cropped to fill, and tinted by the sky the sounds ask for:
   * the owl still brings the night, even over a sunny beach.
   */
  function drawPhoto(dt: number): void {
    if (!g || !photo) return;
    photoIn = Math.min(1, photoIn + dt * 2);
    const k = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
    const w = photo.naturalWidth * k;
    const h = photo.naturalHeight * k;
    g.globalAlpha = photoIn;
    g.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
    g.globalAlpha = 1;
    for (const [s, color, a] of [
      ['dawn', '244,114,182', 0.22],
      ['storm', '51,65,85', 0.45],
      ['night', '11,16,38', 0.6],
      ['deep', '14,116,144', 0.5],
    ] as const) {
      if (sky[s] < 0.01) continue;
      g.fillStyle = `rgba(${color},${sky[s] * a})`;
      g.fillRect(0, 0, W, H);
    }
  }

  function drawHeavens(): void {
    if (!g) return;
    const dark = Math.max(sky.night, L('sleep'));
    const day = (1 - sky.night) * (1 - sky.storm) * (1 - sky.deep);
    // Stars twinkle in
    if (dark > 0.01) {
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.t);
        g.fillStyle = `rgba(255,255,240,${dark * (0.3 + 0.7 * tw) * (1 - sky.deep)})`;
        g.beginPath();
        g.arc(s.x * W, s.y * H, 0.7 + tw * 1.2, 0, Math.PI * 2);
        g.fill();
      }
      // Moon
      const mx = W * 0.82;
      const my = H * 0.16;
      const mr = U() * 0.07;
      g.fillStyle = `rgba(254,249,195,${dark * (1 - sky.deep)})`;
      g.shadowColor = 'rgba(254,249,195,0.8)';
      g.shadowBlur = 30 * dark;
      g.beginPath();
      g.arc(mx, my, mr, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
    // Sun: high at noon, low and huge with rays at dawn. A photograph has its own light.
    if (day > 0.01 && !photo) {
      const dawn = sky.dawn;
      const sx = W * (0.8 - dawn * 0.55);
      const sy = H * (0.15 + dawn * 0.45);
      const sr = U() * (0.07 + dawn * 0.05);
      g.save();
      g.globalAlpha = day * (1 - dark);
      g.translate(sx, sy);
      g.rotate(time * 0.15);
      g.fillStyle = dawn > 0.2 ? 'rgba(251,146,60,0.35)' : 'rgba(253,224,71,0.35)';
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.beginPath();
        g.moveTo(sr * 1.15, -sr * 0.12);
        g.lineTo(sr * (1.7 + dawn * 0.8), 0);
        g.lineTo(sr * 1.15, sr * 0.12);
        g.fill();
      }
      g.fillStyle = dawn > 0.2 ? '#fb923c' : '#fde047';
      g.beginPath();
      g.arc(0, 0, sr, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  const clouds = Array.from({ length: 7 }, (_, i) => ({
    x: Math.random(),
    y: 0.05 + (i % 4) * 0.07,
    s: rand(0.7, 1.3),
    v: rand(0.004, 0.012),
  }));
  function drawClouds(dt: number): void {
    if (!g) return;
    const rainy = Math.max(L('rain'), L('heavy-rain'), L('thunder'));
    const shown = 3 + Math.round(rainy * 4);
    const dark = mix([255, 255, 255], [100, 116, 139], Math.max(sky.storm, rainy * 0.5));
    // Over a photograph clouds only come with the rain; its own sky is sky enough.
    const alpha = (1 - sky.deep) * (0.85 - sky.night * 0.5) * (photo ? rainy : 1);
    clouds.forEach((c, i) => {
      c.x += (c.v + wind() * 0.05) * dt;
      if (c.x > 1.25) c.x = -0.25;
      if (i >= shown) return;
      const x = c.x * W;
      const y = c.y * H;
      const r = U() * 0.06 * c.s * (1 + rainy * 0.4);
      g.fillStyle = rgb(dark, alpha);
      for (const [dx, dy, k] of [
        [0, 0, 1],
        [r * 0.9, r * 0.15, 0.8],
        [-r * 0.9, r * 0.2, 0.75],
        [r * 0.35, -r * 0.45, 0.8],
      ] as const) {
        g.beginPath();
        g.arc(x + dx, y + dy, r * k, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  function drawHills(): void {
    if (!g) return;
    const gy = groundY();
    const night = Math.max(sky.night, L('sleep') * 0.6);
    const lush = L('countryside');
    const far = mix(mix([134, 239, 172], [74, 222, 128], lush), [20, 83, 45], night * 0.8);
    const near = mix(mix([74, 222, 128], [34, 197, 94], lush), [22, 101, 52], night * 0.8);
    g.fillStyle = rgb(far);
    g.beginPath();
    g.moveTo(0, gy);
    for (const x of across(20)) g.lineTo(x, gy - Math.sin((x / W) * Math.PI * 2 + 1) * H * 0.04 - H * 0.02);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
    g.fillStyle = rgb(near);
    g.beginPath();
    g.moveTo(0, gy + H * 0.06);
    for (const x of across(20)) g.lineTo(x, gy + H * 0.06 - Math.sin((x / W) * Math.PI * 3) * H * 0.025);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
    // The fields of the countryside: stripes and swaying wheat.
    if (lush > 0.01) {
      g.globalAlpha = lush;
      for (let i = 0; i < 16; i++) {
        const x = (i + 0.5) * (W / 16);
        const sway = Math.sin(time * 2 + i) * (4 + wind() * 10);
        drawEmoji('🌾', x + sway, gy + H * 0.09 + (i % 2) * H * 0.03, U() * 0.07, { rot: sway * 0.02 });
      }
      const cow = traveller('countryside', 1 / 60, 0.004, gy - H * 0.01);
      drawEmoji('🐄', cow.x, cow.y, U() * 0.07, { flip: cow.dir > 0 });
      g.globalAlpha = 1;
    }
  }

  function drawTree(): void {
    if (!g) return;
    const gy = groundY();
    const sway = Math.sin(time * 1.3) * (0.02 + wind() * 0.12);
    const jungle = L('jungle');
    const x = W * 0.08;
    drawEmoji(jungle > 0.5 ? '🌴' : '🌳', x, gy - U() * 0.08, U() * 0.22, { rot: sway });
    if (jungle > 0.01) {
      g.globalAlpha = jungle;
      drawEmoji('🌴', W * 0.95, gy - U() * 0.06, U() * 0.2, { rot: -sway });
      drawEmoji('🌿', W * 0.25, gy + H * 0.05, U() * 0.12, { rot: sway });
      drawEmoji('🌿', W * 0.7, gy + H * 0.07, U() * 0.14, { rot: -sway, flip: true });
      // Eyes in the dark, blinking.
      for (const [ex, ey, k] of [
        [0.3, 0.74, 0],
        [0.62, 0.78, 2],
        [0.86, 0.72, 4],
      ] as const) {
        const open = Math.sin(time * 0.8 + k) > -0.8 ? 1 : 0.15;
        g.fillStyle = `rgba(253,224,71,${jungle * sky.night})`;
        for (const d of [-1, 1]) {
          g.beginPath();
          g.ellipse(ex * W + d * U() * 0.012, ey * H, U() * 0.007, U() * 0.007 * open, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  // ---------- weather ----------
  function drawRain(dt: number): void {
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

  function drawThunder(dt: number): void {
    if (!g) return;
    nextBolt -= dt;
    if (L('thunder') > 0.5 && nextBolt <= 0) {
      nextBolt = rand(3.5, 8);
      flash = 1;
      const pts: [number, number][] = [];
      let x = rand(0.2, 0.8) * W;
      for (let y = H * 0.12; y < groundY(); y += H * rand(0.04, 0.08)) {
        pts.push([x, y]);
        x += rand(-0.05, 0.05) * W;
      }
      bolt = { pts, life: 0.35 };
    }
    if (bolt) {
      bolt.life -= dt;
      g.strokeStyle = `rgba(254,249,195,${Math.max(0, bolt.life / 0.35)})`;
      g.lineWidth = 4;
      g.shadowColor = '#fef08a';
      g.shadowBlur = 20;
      g.beginPath();
      bolt.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      g.shadowBlur = 0;
      if (bolt.life <= 0) bolt = null;
    }
  }

  function drawWind(dt: number): void {
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

  function drawCampfire(dt: number): void {
    if (!g) return;
    const k = L('campfire');
    if (k < 0.01) return;
    const x = W * 0.2;
    const y = groundY() + H * 0.14;
    const s = U() * 0.06;
    // Warm glow on the ground, stronger in the dark.
    const glow = g.createRadialGradient(x, y, 0, x, y, s * (5 + sky.night * 4));
    glow.addColorStop(0, `rgba(251,146,60,${k * (0.35 + sky.night * 0.35)})`);
    glow.addColorStop(1, 'rgba(251,146,60,0)');
    g.fillStyle = glow;
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

  function drawFirework(dt: number): void {
    if (!g) return;
    const k = L('firework');
    if (every('firework', dt, 0.7, 1.6)) {
      const x = rand(0.15, 0.85) * W;
      const y = rand(0.12, 0.4) * H;
      const hue = rand(0, 360);
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const v = rand(0.8, 1) * U() * 0.35;
        pool('firework').push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0,
          max: rand(1.1, 1.6),
          size: 2.5,
          hue: hue + rand(-20, 20),
        });
      }
    }
    const ps = pool('firework');
    step(ps, dt, U() * 0.25);
    g.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      p.vx *= 0.97;
      p.vy *= 0.97;
      const t = p.life / p.max;
      g.fillStyle = `hsla(${p.hue},95%,65%,${(1 - t) * Math.max(k, 0.3)})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (1.4 - t), 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- water ----------
  function drawRiver(): void {
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

  function drawOcean(): void {
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

  const weeds = Array.from({ length: 9 }, (_, i) => ({
    x: (i + 0.5) / 9 + rand(-0.03, 0.03),
    h: rand(0.15, 0.3),
    c: pick(['#16a34a', '#15803d', '#65a30d']),
  }));
  function drawUnderwater(dt: number): void {
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

  function drawBubbles(dt: number): void {
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
    g.lineWidth = 1.5;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i] as P;
      if (p.y < H * 0.05) {
        ps.splice(i, 1);
        continue;
      }
      const x = p.x + Math.sin(p.life * 2 + (p.hue ?? 0)) * 10;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.fillStyle = 'rgba(186,230,253,0.25)';
      g.beginPath();
      g.arc(x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.22, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawWhale(dt: number): void {
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

  // ---------- animals ----------
  function notes(id: string, x: number, y: number, dt: number, rate: number, glyphs = ['♪', '♫']): void {
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

  function drawBirds(dt: number): void {
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
      notes('perch', x + U() * 0.03, y - U() * 0.03, dt, 1.5);
    }
  }

  function drawNightCritters(dt: number): void {
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
      const glow = Math.max(0, Math.sin(time * 3 + (p.hue ?? 0))) * Math.sin((p.life / p.max) * Math.PI);
      const r = p.size * 4;
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, `rgba(217,249,157,${glow})`);
      grad.addColorStop(1, 'rgba(217,249,157,0)');
      g.fillStyle = grad;
      g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    // The cricket itself, chirping with a shiver.
    const c = L('cricket');
    if (c > 0.01) {
      const x = W * 0.62;
      const y = H * 0.9;
      g.globalAlpha = c;
      drawEmoji('🦗', x + Math.sin(time * 40) * (Math.sin(time * 2) > 0 ? 1.5 : 0), y, U() * 0.08);
      g.globalAlpha = 1;
      notes('cricket', x, y - U() * 0.04, dt, 1.2, ['♪']);
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
      notes('owl', x - U() * 0.05, y - U() * 0.05, dt, 0.6, ['ú', 'u']);
    }
  }

  function drawFrog(dt: number): void {
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
    if (t > 0.5 && Math.sin(time * 12) > 0) notes('frog', x, y - U() * 0.05, dt, 1, ['ộp']);
  }

  function drawChickens(dt: number): void {
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

  // ---------- home ----------
  function drawHome(dt: number): void {
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
      notes('chime', x + Math.sin(swing) * H * 0.17, H * 0.22, dt, 1.4, ['✦', '♪']);
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
      notes('clock', x - s * 0.5, y - s * 0.6, dt, 1, ['tích', 'tắc']);
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
      notes('sleep', W * 0.82, H * 0.22, dt, 0.8, ['z', 'Z', '💤']);
    }
  }

  // ---------- town ----------
  const buildings = Array.from({ length: 14 }, (_, i) => ({
    x: i / 14,
    w: rand(0.05, 0.08),
    h: rand(0.1, 0.28),
    lit: Array.from({ length: 12 }, () => Math.random() < 0.5),
  }));
  /** The skyline, behind the hills. */
  function drawTown(): void {
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
  function drawStreet(dt: number): void {
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

  // ---------- the moment something is switched on ----------
  function drawHero(dt: number): void {
    if (!hero) return;
    hero.life += dt;
    const t = hero.life / 1.2;
    if (t >= 1) {
      hero = null;
      return;
    }
    const grow = t < 0.3 ? 1 - (1 - t / 0.3) ** 3 : 1;
    drawEmoji(hero.emoji, W / 2, H * 0.42, U() * 0.35 * (0.4 + grow * 0.6), { alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4 });
  }

  function drawSparkles(dt: number): void {
    if (!g) return;
    const ps = pool('tap');
    step(ps, dt, 60);
    for (const p of ps) {
      g.globalAlpha = 1 - p.life / p.max;
      drawEmoji('✨', p.x, p.y, p.size, { rot: p.a });
    }
    g.globalAlpha = 1;
  }

  function frame(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    // Ease every effect and sky towards what is wanted: in over ~1 s, out over ~1.5 s.
    for (const [id, w] of want) {
      const cur = level.get(id) ?? 0;
      level.set(id, cur + (w - cur) * Math.min(1, dt * (w > cur ? 2.2 : 1.6)));
    }
    for (const k of Object.keys(sky) as Sky[]) sky[k] += (skyWant[k] - sky[k]) * Math.min(1, dt * 1.2);
    if (!g) return;
    g.clearRect(0, 0, W, H);
    if (photo) {
      drawPhoto(dt);
    } else {
      drawSky();
    }
    drawHeavens();
    drawFirework(dt);
    if (!photo || Math.max(L('rain'), L('heavy-rain'), L('thunder')) > 0.01) drawClouds(dt);
    drawTown();
    // Under the sea the land sinks away.
    if (!photo && sky.deep < 0.99) {
      g.globalAlpha = 1 - sky.deep;
      drawHills();
      drawTree();
      g.globalAlpha = 1;
    }
    drawStreet(dt);
    drawRiver();
    drawBirds(dt);
    drawNightCritters(dt);
    drawCampfire(dt);
    drawFrog(dt);
    drawChickens(dt);
    drawHome(dt);
    drawUnderwater(dt);
    drawWhale(dt);
    drawOcean();
    drawBubbles(dt);
    drawWind(dt);
    drawRain(dt);
    drawThunder(dt);
    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${flash * 0.7})`;
      g.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 3);
    }
    drawHero(dt);
    drawSparkles(dt);
  }
  raf = requestAnimationFrame(frame);

  return {
    setOn(ids) {
      for (const id of want.keys()) want.set(id, 0);
      for (const id of ids) want.set(id, 1);
      skyWant = skyOf(ids);
    },
    announce(emoji) {
      hero = { emoji, life: 0 };
    },
    sparkle(x, y) {
      for (let i = 0; i < 8; i++)
        pool('tap').push({
          x,
          y,
          vx: rand(-120, 120),
          vy: rand(-160, -40),
          life: 0,
          max: 0.9,
          size: U() * rand(0.03, 0.05),
          spin: rand(-6, 6),
        });
    },
    setBackdrop(img) {
      photo = img;
      photoIn = 0;
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    },
  };
}
