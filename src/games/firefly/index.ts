import { h, randInt, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { BLOW_THRESHOLD, blowStrength } from '../birthday/logic';
import { meta } from './meta';
import {
  BLADES,
  BLOW_GAP_MS,
  BURSTS,
  BUSY_SKY,
  CANDLES,
  FLASH_LIFE,
  MAX_SPARKS,
  FIREFLIES,
  SKY_STARS,
  STAR_EVERY,
  glow,
  leanDeg,
  makeBlade,
  makeBurst,
  makeCandle,
  makeFirefly,
  makeRocket,
  makeSkyStar,
  nextChirpMs,
  nextShootMs,
  flashAt,
  makeEmber,
  advanceSpark,
  sparkFade,
  SPARK_TAIL,
  stepFlash,
  stepFirefly,
  stepRocket,
  warmth,
  windFrom,
  type Burst,
  type Firefly,
  type Flash,
  type Rocket,
  type Spark,
} from './logic';
import './style.css';

/** Microphone poll, and how many loud ones in a row put the candle out — as on the cake. */
const MIC_POLL_MS = 100;
const MIC_HOT_POLLS = 2;
/** The microphone lets go after this long with nothing blown into it. */
const MIC_IDLE_MS = 12000;
/** The blown-out flame finishes its shrink, then goes. */
const FLAME_OUT_MS = 400;
const PUFF_MS = 700;
const SHOOT_MS = 1100;
/** Smallest a firefly is ever drawn: under this a two-year-old cannot land a finger on one. */
const MIN_BUG_PX = 56;
/** Longest step the drift takes in one frame, so a backgrounded tab does not teleport the field. */
const MAX_STEP = 0.05;
/**
 * Pixels per CSS pixel for the fireworks canvas. Sparks are glows rather than
 * edges, so drawing them at the screen's full 2× buys nothing anybody can see and
 * costs four times the fill rate — which is exactly what a tablet runs out of.
 */
const FW_SCALE = 1;

/**
 * Colours by hue, built once and kept. Hundreds of sparks are drawn every frame,
 * and a template string per spark per layer is hundreds of throwaway strings a
 * frame — the kind of litter that shows up as stutter on a tablet, not on a Mac.
 */
const HALO: string[] = [];
const CORE: string[] = [];
function haloOf(hue: number): string {
  const i = ((Math.round(hue) % 360) + 360) % 360;
  return (HALO[i] ??= `hsl(${i} 100% 56%)`);
}
function coreOf(hue: number): string {
  const i = ((Math.round(hue) % 360) + 360) % 360;
  return (CORE[i] ??= `hsl(${i} 100% 82%)`);
}

type AudioCtor = new () => AudioContext;

interface Bug {
  el: HTMLElement;
  spec: Firefly;
  /** Drawn diameter, recomputed only when the stage changes size. */
  px: number;
}

/**
 * Đêm hè: a meadow after dark that runs on its own and is nice to just watch.
 *
 * There is nothing to finish here. Stars twinkle, fireflies wander, the grass
 * sways, the moon sits over the hills, and a row of candles waits in the grass.
 * Everything answers a touch at once, in any order, for as long as the child
 * cares to keep going — and one breath into the microphone moves the whole
 * field: the grass lays over, the fireflies scatter, and the candles go out one
 * after another, the way a cake does.
 *
 * Every candle lit warms the meadow a little, which is the only thing here that
 * keeps any kind of score — and it undoes itself the moment they are blown out.
 */
function start(ctx: GameContext): void {
  let alive = true;
  /** Happy touches so far. Every STAR_EVERY of them is worth a star. */
  let touches = 0;
  /** Wind being drawn right now, easing towards what the microphone hears. */
  let wind = 0;
  let windTarget = 0;
  /** One entry per candle in the grass; `flame` is null while it is out. */
  const candles: Array<{ el: HTMLElement; flame: HTMLElement | null }> = [];
  /** Fireworks: rockets still climbing, and the sparks of the ones that have opened. */
  let rockets: Rocket[] = [];
  let sparks: Spark[] = [];
  let flashes: Flash[] = [];
  /** Backing store the sparks were last drawn into, so it is only resized when it must be. */
  let fwW = 0;
  let fwH = 0;
  let fwCtx: CanvasRenderingContext2D | null = null;
  let fwAsked = false;
  /** Something was drawn last frame, so the canvas still has to be cleared once. */
  let fwUsed = false;
  let raf = 0;
  let last = performance.now();
  let lastShort = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Words already said out loud, so the field does not narrate every single touch. */
  const named = new Set<string>();

  let micCtx: AudioContext | null = null;
  let micStream: MediaStream | null = null;
  let micTimer: ReturnType<typeof setInterval> | null = null;
  let micBusy = false;
  let micGone = false;
  /**
   * True from the press that asks for the microphone until the press that hands it
   * back. A press while the permission prompt is still open has to be remembered:
   * the answer arrives afterwards, and by then nobody wants it any more.
   */
  let micWanted = false;

  // ---- DOM ----
  const sky = h('div', { class: 'fly-sky' });
  for (let i = 0; i < SKY_STARS; i++) {
    const s = makeSkyStar();
    const star = h('div', {
      class: 'fly-star',
      style:
        `left:${(s.x * 100).toFixed(2)}%;top:${(s.y * 100).toFixed(2)}%;` +
        `--fly-size:${s.size.toFixed(2)}vmin;--fly-dur:${s.dur.toFixed(2)}s;--fly-delay:${s.delay.toFixed(2)}s`,
    });
    star.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tapStar(star);
    });
    sky.append(star);
  }

  // Hills first, so the middle of the field has a horizon instead of a void.
  const tree = (cls: string): HTMLElement =>
    h('div', { class: `fly-tree ${cls}` }, h('div', { class: 'fly-canopy' }), h('div', { class: 'fly-trunk' }));
  const hills = h(
    'div',
    { class: 'fly-hills' },
    h('div', { class: 'fly-hill fly-hill-l' }),
    h('div', { class: 'fly-hill fly-hill-r' }),
    tree('fly-tree-a'),
    tree('fly-tree-b'),
    tree('fly-tree-c'),
  );
  const grass = h('div', { class: 'fly-grass' });
  /** Blades painted before the candles stand behind them; the rest stand in front. */
  const BEHIND = Math.round(BLADES * 0.6);
  const addBlade = (i: number): void => {
    const b = makeBlade(i, BLADES);
    // Outer blade takes the wind, inner one keeps its idle sway: two transforms
    // on one element would mean the animation stamping over the lean every frame.
    const blade = h(
      'div',
      {
        class: 'fly-blade',
        style:
          `left:${(b.x * 100).toFixed(2)}%;--fly-h:${(b.height * 100).toFixed(1)}%;` +
          `--fly-w:${b.width.toFixed(2)}vmin;--fly-dur:${b.dur.toFixed(2)}s;--fly-delay:${b.delay.toFixed(2)}s`,
      },
      h('div', { class: 'fly-blade-body' }),
    );
    grass.append(blade);
  };
  for (let i = 0; i < BEHIND; i++) addBlade(i);

  for (let i = 0; i < CANDLES; i++) {
    const spec = makeCandle(i, CANDLES);
    const el = h(
      'div',
      {
        class: 'fly-candle',
        style: `left:${(spec.x * 100).toFixed(2)}%;--fly-tall:${spec.height.toFixed(2)};--fly-hue:${spec.hue}`,
      },
      h('div', { class: 'fly-stick' }),
    );
    const candle = { el, flame: null as HTMLElement | null };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (candle.flame) blowOut(candle);
      else light(candle);
    });
    grass.append(el);
    candles.push(candle);
  }
  // The rest of the grass goes in after, so blades cross in front of the candles.
  // Drawn over every blade they read as stuck onto the meadow rather than standing in it.
  for (let i = BEHIND; i < BLADES; i++) addBlade(i);

  // getUserMedia needs a user activation; on touch screens pointerup grants one, pointerdown may not.
  const micBtn = h('button', { class: 'btn-round fly-mic', type: 'button', 'aria-label': 'Thổi vào micro', onpointerup: onMic }, '🎤');

  // The moon is the one thing in the sky that is not a dot, and it is what makes
  // the field read as a night rather than as a dark screen.
  const moon = h('div', { class: 'fly-moon' });
  moon.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    replay(moon, 'fly-moon-hit');
    ctx.audio.fx('sparkle');
    nameOnce('moon', 'Ông trăng!');
    happy();
  });
  sky.append(h('div', { class: 'fly-way' }), moon);

  /** Candle light lying over the meadow. Its strength is `--fly-warm`, set as they are lit. */
  const warmGlow = h('div', { class: 'fly-glow' });

  /*
   * The whole sky taking the colour of whatever just went off. One element whose
   * opacity is animated and nothing else, so the tablet hands it to the compositor
   * and the frame loop never touches it — a wash this size drawn onto the canvas
   * every frame would cost more than all the sparks put together.
   */
  const skyFlash = h('div', { class: 'fly-sky-flash' });

  /*
   * Fireworks go on a canvas rather than into the DOM: a single burst is forty
   * sparks, several at once are hundreds, and hundreds of elements moving every
   * frame is more than a tablet will do smoothly. One canvas, cleared and redrawn,
   * costs the same whatever is on it.
   */
  const fw = h('canvas', { class: 'fly-fw' }) as HTMLCanvasElement;
  const fwBtn = h(
    'button',
    { class: 'btn-round fly-fw-btn', type: 'button', 'aria-label': 'Bắn pháo hoa', onpointerdown: onFirework },
    '🎆',
  );

  const field = h('div', { class: 'fly' }, sky, hills, grass, warmGlow, skyFlash, fw, fwBtn, micBtn);
  ctx.stage.append(field);

  const bugs: Bug[] = [];
  for (let i = 0; i < FIREFLIES; i++) {
    const el = h('div', { class: 'fly-bug' });
    const bug: Bug = { el, spec: makeFirefly(), px: MIN_BUG_PX };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tapBug(bug);
    });
    // Above the grass, under the microphone button.
    field.insertBefore(el, micBtn);
    bugs.push(bug);
  }

  // ---- helpers ----
  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  /** One more thing the child enjoyed. Stars come round on their own, never asked for. */
  function happy(): void {
    ctx.hint.touch();
    touches++;
    if (touches % STAR_EVERY === 0) {
      ctx.addStar();
      ctx.audio.jingle();
    }
  }

  /** Said once, the first time it happens: a word to learn, not a running commentary. */
  function nameOnce(key: string, text: string): void {
    if (named.has(key)) return;
    named.add(key);
    ctx.speak(text);
  }

  // ---- what a touch does ----
  function tapStar(star: HTMLElement): void {
    replay(star, 'fly-star-hit');
    ctx.audio.fx('sparkle');
    navigator.vibrate?.(8);
    nameOnce('star', 'Ngôi sao lấp lánh!');
    if (Math.random() < 0.34) shoot();
    happy();
  }

  /** A star comes loose and slides across the sky. Nothing to catch, just nice to see. */
  function shoot(): void {
    const streak = h('div', {
      class: 'fly-shoot',
      style: `left:${randInt(5, 55)}%;top:${randInt(4, 34)}%`,
    });
    sky.append(streak);
    later(() => streak.remove(), SHOOT_MS);
  }

  function tapBug(bug: Bug): void {
    replay(bug.el, 'fly-bug-hit');
    ctx.audio.ding();
    navigator.vibrate?.(8);
    nameOnce('bug', 'Con đom đóm!');
    // Startled: it darts off, then settles back into its own slow wander.
    bug.spec = { ...bug.spec, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.22 };
    happy();
  }

  /** Warm light over the whole meadow, one step brighter per candle alight. */
  function syncWarmth(): void {
    const alight = candles.filter((c) => c.flame !== null).length;
    field.style.setProperty('--fly-warm', warmth(alight).toFixed(2));
  }

  function light(candle: { el: HTMLElement; flame: HTMLElement | null }): void {
    if (candle.flame) return;
    candle.el.classList.remove('fly-out');
    candle.el.classList.add('fly-lit');
    const flame = h('div', { class: 'fly-flame' }, '🔥');
    candle.flame = flame;
    candle.el.append(flame);
    syncWarmth();
    ctx.audio.pop(1.5);
    navigator.vibrate?.(10);
    happy();
  }

  function blowOut(candle: { el: HTMLElement; flame: HTMLElement | null }): void {
    const going = candle.flame;
    if (!going) return;
    candle.flame = null;
    candle.el.classList.remove('fly-lit');
    candle.el.classList.add('fly-out');
    going.classList.add('fly-flame-out');
    later(() => going.remove(), FLAME_OUT_MS);
    const puff = h('div', { class: 'fly-puff' }, '💨');
    candle.el.append(puff);
    later(() => puff.remove(), PUFF_MS);
    syncWarmth();
    ctx.audio.puff();
    navigator.vibrate?.(10);
    happy();
  }

  // ---- fireworks ----
  /** Send one up. The shape it opens into is whatever the sky feels like. */
  function launch(shape?: Burst): void {
    const rocket = makeRocket();
    rockets.push(shape ? { ...rocket, shape } : rocket);
    ctx.audio.fx('whistle');
  }

  function onFirework(e: Event): void {
    e.preventDefault();
    launch();
    replay(fwBtn, 'anim-bounce');
    nameOnce('firework', 'Pháo hoa!');
    happy();
  }

  /** The rocket opens: a shape's worth of sparks, a thump, and a shower of sound. */
  function openRocket(r: Rocket): void {
    const made = makeBurst(r.shape, r.x, r.y, r.hue);
    // Oldest sparks go first when the sky is full, so a new firework always shows.
    sparks = [...sparks, ...made].slice(-MAX_SPARKS);
    flashes.push({ x: r.x, y: r.y, hue: r.hue, life: FLASH_LIFE });
    // The sky takes its colour for a moment, brightest around where it went off.
    skyFlash.style.setProperty('--fly-fx-h', String(Math.round(r.hue)));
    skyFlash.style.setProperty('--fly-fx-x', `${(r.x * 100).toFixed(1)}%`);
    skyFlash.style.setProperty('--fly-fx-y', `${(r.y * 100).toFixed(1)}%`);
    replay(skyFlash, 'fly-sky-lit');
    ctx.audio.drum('kick');
    ctx.audio.fx('sparkle');
    navigator.vibrate?.(18);
  }

  /** Every spark drawn as the streak it travelled since the last frame. */
  function drawFireworks(w: number, hgt: number, short: number): void {
    const busy = rockets.length > 0 || sparks.length > 0 || flashes.length > 0;
    // An empty sky costs nothing: no context, no clear, no frame spent on a
    // canvas that has had nothing on it since the last firework faded.
    if (!busy && !fwUsed) return;
    if (!fwAsked) {
      fwAsked = true;
      fwCtx = fw.getContext('2d');
    }
    const c = fwCtx;
    if (!c) return;
    fwUsed = busy;
    // Backing store follows both the stage and the screen: a canvas built for one
    // and drawn on another puts the sparks somewhere other than the sky.
    const dpr = Math.min(window.devicePixelRatio || 1, FW_SCALE);
    const px = Math.round(w * dpr);
    const py = Math.round(hgt * dpr);
    if (px !== fwW || py !== fwH) {
      fwW = px;
      fwH = py;
      fw.width = px;
      fw.height = py;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, hgt);
    if (!busy) return;

    c.lineCap = 'round';
    /*
     * Added on top of each other rather than painted over: where two sparks cross
     * the sky goes white, which is what a firework does and what a flat paint of
     * coloured dots never looks like.
     */
    c.globalCompositeOperation = 'lighter';

    /**
     * A streak from where the spark was `SPARK_TAIL * tail` ago to where it is now.
     * Colour comes from the table and the fade from `globalAlpha`, so a frame full
     * of sparks builds no strings at all.
     */
    const streak = (x: number, y: number, vx: number, vy: number, colour: string, width: number, alpha: number, tail: number): void => {
      if (alpha <= 0.02) return;
      c.globalAlpha = alpha;
      c.strokeStyle = colour;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo((x - vx * SPARK_TAIL * tail) * w, (y - vy * SPARK_TAIL * tail) * hgt);
      c.lineTo(x * w, y * hgt);
      c.stroke();
    };

    // The blink of the opening, before anything else is drawn over it.
    for (const f of flashes) {
      const { alpha, spread } = flashAt(f.life);
      const r = short * 0.22 * spread;
      const g = c.createRadialGradient(f.x * w, f.y * hgt, 0, f.x * w, f.y * hgt, r);
      g.addColorStop(0, `hsla(${f.hue} 100% 98% / ${(0.85 * alpha).toFixed(2)})`);
      g.addColorStop(0.35, `hsla(${f.hue} 100% 72% / ${(0.45 * alpha).toFixed(2)})`);
      g.addColorStop(1, `hsla(${f.hue} 100% 60% / 0)`);
      c.fillStyle = g;
      c.globalAlpha = 1;
      c.beginPath();
      c.arc(f.x * w, f.y * hgt, r, 0, Math.PI * 2);
      c.fill();
      // The shell going off: one ring, thrown outwards and thinning as it goes.
      // Kept close in — a ring the size of the sky reads as a ripple in water.
      c.globalAlpha = 0.5 * alpha;
      c.strokeStyle = coreOf(f.hue);
      c.lineWidth = Math.max(1.5, short * 0.014 * alpha);
      c.beginPath();
      c.arc(f.x * w, f.y * hgt, short * 0.13 * spread, 0, Math.PI * 2);
      c.stroke();
    }

    for (const r of rockets) {
      const width = Math.max(2, short * 0.006);
      streak(r.x, r.y, 0, r.vy, haloOf(r.hue), width * 3.4, 0.16, 2.4);
      streak(r.x, r.y, 0, r.vy, coreOf(r.hue), width * 0.9, 1, 0.9);
    }
    /*
     * Three passes down each spark's path — halo, comet tail, white-hot core — is
     * what makes it read as burning rather than as a coloured dash. The halo is
     * the widest and so the most expensive, and it is the one the eye misses
     * least: past a skyful of sparks it is dropped and the tail widened instead.
     */
    const wide = sparks.length <= BUSY_SKY;
    for (const s of sparks) {
      const fade = sparkFade(s.life);
      const width = Math.max(1.5, short * s.size * (0.5 + 0.5 * fade));
      const halo = haloOf(s.hue);
      if (wide) streak(s.x, s.y, s.vx, s.vy, halo, width * 4, 0.13 * fade, 3.2 * s.tail);
      streak(s.x, s.y, s.vx, s.vy, halo, width * (wide ? 1.9 : 2.6), 0.42 * fade, 2 * s.tail);
      streak(s.x, s.y, s.vx, s.vy, coreOf(s.hue), width * 0.8, 0.98 * fade, 0.85 * s.tail);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /**
   * A hard blow: every firefly is knocked off course, and the candles go out one
   * after another rather than all at once — a row that dies together looks
   * switched off, a row that dies in order looks blown out.
   */
  function gust(): void {
    for (const bug of bugs) {
      bug.spec = {
        ...bug.spec,
        vx: bug.spec.vx + (Math.random() - 0.3) * 0.3,
        vy: bug.spec.vy + (Math.random() - 0.5) * 0.25,
      };
    }
    const alight = candles.filter((c) => c.flame !== null);
    if (alight.length === 0) {
      happy();
      return;
    }
    alight.forEach((candle, i) => {
      if (i === 0) blowOut(candle);
      else later(() => blowOut(candle), i * BLOW_GAP_MS);
    });
  }

  // ---- the field, frame by frame ----
  function frame(now: number): void {
    // Clamped at both ends: a backgrounded tab hands back a huge gap, and a frame
    // stamp from a different clock than `performance.now()` can hand back a negative one.
    const dt = Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
    last = now;
    const t = now / 1000;
    // The wind eases in and out. Snapping straight to the microphone's reading
    // reads as a glitch; a breath that arrives and dies away reads as weather.
    wind += (windTarget - wind) * Math.min(1, dt * 5);
    const w = field.clientWidth || 800;
    const hgt = field.clientHeight || 600;
    const short = Math.min(w, hgt);
    // Sizes only change when the stage does, so the frame stays a transform each.
    if (short !== lastShort) {
      lastShort = short;
      for (const bug of bugs) {
        bug.px = Math.max(MIN_BUG_PX, Math.round(bug.spec.size * short));
        bug.el.style.width = `${bug.px}px`;
        bug.el.style.height = `${bug.px}px`;
      }
    }
    for (const bug of bugs) {
      bug.spec = stepFirefly(bug.spec, dt, t, wind);
      const g = glow(bug.spec, t);
      const x = bug.spec.x * w - bug.px / 2;
      const y = bug.spec.y * hgt - bug.px / 2;
      bug.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(0.85 + g * 0.3).toFixed(2)})`;
      bug.el.style.opacity = (0.45 + g * 0.55).toFixed(2);
    }
    grass.style.setProperty('--fly-lean', `${leanDeg(wind).toFixed(1)}deg`);

    if (rockets.length > 0) {
      const flying: Rocket[] = [];
      for (const r of rockets) {
        const next = stepRocket(r, dt);
        // Opens at its height, or the moment it runs out of climb.
        if (next.y <= next.top || next.vy >= 0) openRocket(next);
        else {
          flying.push(next);
          // Cinders off the climb, so the way up is a trail and not a line.
          if (Math.random() < 0.55) sparks.push(makeEmber(next.x, next.y, next.hue));
        }
      }
      rockets = flying;
    }
    if (flashes.length > 0) flashes = flashes.map((f) => stepFlash(f, dt)).filter((f) => f.life > 0);
    if (sparks.length > 0) {
      // Stepped and compacted in place: a new array and a new object per spark,
      // every frame, is work a tablet pays for twice — once to make, once to collect.
      let kept = 0;
      for (const spark of sparks) {
        advanceSpark(spark, dt);
        if (spark.life > 0 && spark.y < 1.1) sparks[kept++] = spark;
      }
      sparks.length = kept;
    }
    drawFireworks(w, hgt, short);

    raf = requestAnimationFrame(frame);
  }

  // ---- microphone ----
  function stopTracks(stream: MediaStream): void {
    try {
      for (const track of stream.getTracks()) track.stop();
    } catch {
      /* ignore */
    }
  }

  function stopMic(): void {
    if (micTimer !== null) {
      clearInterval(micTimer);
      micTimer = null;
    }
    if (micStream) {
      stopTracks(micStream);
      micStream = null;
    }
    if (micCtx) {
      try {
        void micCtx.close().catch(() => undefined);
      } catch {
        /* already closed */
      }
      micCtx = null;
    }
    micWanted = false;
    windTarget = 0;
    micBtn.classList.remove('fly-listening');
    micBtn.style.removeProperty('--fly-level');
  }

  function micFail(): void {
    micGone = true;
    micWanted = false;
    micBtn.hidden = true;
    ctx.speak('Chạm vào nến để thổi nhé');
  }

  async function startMic(): Promise<void> {
    if (micBusy || micTimer !== null) return;
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') {
      micFail();
      return;
    }
    micBusy = true;
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: true });
    } catch {
      micBusy = false;
      if (alive) micFail();
      return;
    }
    micBusy = false;
    if (!alive || !micWanted) {
      stopTracks(stream);
      return;
    }
    const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) {
      stopTracks(stream);
      micFail();
      return;
    }
    let analyser: AnalyserNode;
    try {
      micCtx = new Ctor();
      micStream = stream;
      analyser = micCtx.createAnalyser();
      analyser.fftSize = 512;
      micCtx.createMediaStreamSource(stream).connect(analyser);
      if (micCtx.state === 'suspended') void micCtx.resume().catch(() => undefined);
    } catch {
      stopMic();
      stopTracks(stream);
      micFail();
      return;
    }
    const buf = new Uint8Array(analyser.fftSize);
    let hot = 0;
    let quiet = 0;
    micBtn.classList.add('fly-listening');
    ctx.speak('Thổi vào micro cho cỏ lay nhé!');
    micTimer = setInterval(() => {
      if (!alive) {
        stopMic();
        return;
      }
      analyser.getByteTimeDomainData(buf);
      const level = blowStrength(buf);
      // Every breath moves the grass; only a real blow puts the candle out.
      windTarget = windFrom(level);
      micBtn.style.setProperty('--fly-level', Math.min(1, level / (BLOW_THRESHOLD * 2)).toFixed(2));
      if (level > BLOW_THRESHOLD) {
        quiet = 0;
        hot++;
        if (hot >= MIC_HOT_POLLS) {
          hot = 0;
          ctx.hint.touch();
          gust();
        }
      } else {
        hot = 0;
        quiet += MIC_POLL_MS;
        // Nothing blown for a while: hand the microphone back rather than sit on it.
        if (quiet >= MIC_IDLE_MS) stopMic();
      }
    }, MIC_POLL_MS);
  }

  function onMic(): void {
    ctx.hint.touch();
    ctx.audio.tick();
    // A second press gives the microphone back. A button with only an on is a
    // button a child cannot undo, and the light on the tablet stays lit.
    if (micWanted) {
      stopMic();
      return;
    }
    micWanted = true;
    void startMic();
  }

  // ---- the field's own night noises ----
  function chirp(): void {
    // Not every voice out there is a cricket; the owl is rarer, the way it is outside.
    ctx.audio.fx(Math.random() < 0.15 ? 'owl' : 'cricket');
    later(chirp, nextChirpMs());
  }
  later(chirp, nextChirpMs());

  /** The sky does something of its own accord, so watching it is worth doing. */
  function ownShoot(): void {
    shoot();
    later(ownShoot, nextShootMs());
  }
  later(ownShoot, nextShootMs());
  // One on the way in: the button is worth finding, and the sky says so first.
  later(() => launch(BURSTS[0]), 900);

  raf = requestAnimationFrame(frame);

  /** Nudge whatever is nearest to hand, without asking for anything in particular. */
  ctx.hint.arm(() => {
    if (!alive) return;
    const dark = candles.find((c) => c.flame === null);
    if (dark) {
      replay(dark.el, 'anim-wiggle');
      ctx.speak('Chạm vào nến cho sáng nhé!');
      return;
    }
    if (!micGone && micTimer === null) {
      replay(micBtn, 'anim-bounce');
      ctx.speak('Thổi vào micro xem nến có tắt không nhé!');
      return;
    }
    if (rockets.length === 0 && sparks.length === 0) {
      replay(fwBtn, 'anim-bounce');
      ctx.speak('Bấm 🎆 bắn pháo hoa nhé!');
      return;
    }
    const bug = bugs[randInt(0, bugs.length - 1)];
    if (bug) replay(bug.el, 'fly-bug-hit');
  });

  ctx.onCleanup(() => {
    alive = false;
    rockets = [];
    sparks = [];
    flashes = [];
    cancelAnimationFrame(raf);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    stopMic();
  });
}

const game: GameModule = { ...meta, start };
export default game;
