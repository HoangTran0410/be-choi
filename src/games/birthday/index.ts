import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable, type Pt, type Target } from '../../core/drag';
import { noteFreq, schedule } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BLOW_THRESHOLD,
  FLAVORS,
  HAPPY_BIRTHDAY,
  HAPPY_BIRTHDAY_BPM,
  MAX_CANDLES,
  TOPPINGS,
  blowStrength,
  candleWord,
  nextPhase,
  type Flavor,
  type Phase,
} from './logic';
import './style.css';

/** Toppings kept on the cake; the oldest falls off after that. */
const MAX_PLACED = 30;
/** The blown-out flame finishes its shrink animation, then the element goes. */
const FLAME_OUT_MS = 450;
const PUFF_MS = 900;
const NOTE_MS = 1400;
/** How often the microphone is sampled. */
const MIC_POLL_MS = 100;
/** Loud polls in a row before the candles go out. */
const MIC_HOT_POLLS = 2;
/** Gap between candles when the microphone blows them all out. */
const MIC_BLOW_GAP_MS = 150;
/** Keep toppings inside the cake box (percent of its size). */
const EDGE_PCT = 6;
const ANIM_CLASSES = ['anim-bounce', 'anim-wiggle', 'anim-pulse', 'anim-pop', 'anim-shake'];

type AudioCtor = new () => AudioContext;

/**
 * Birthday: decorate a cake with toppings, add candles (counted like the child's
 * age), light them one by one, hear "Happy Birthday", then blow them out by
 * blowing into the microphone or by touching the flames.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let phase: Phase = 'decorate';
  let flavor = 0;
  /** The melody is playing: candles are all lit but not yet blowable. */
  let singing = false;
  /** Microphone was refused or is unavailable: keep the 🎤 button away. */
  let micGone = false;
  let micBusy = false;
  let candles: HTMLElement[] = [];
  let placed: HTMLElement[] = [];
  let cancelSong: (() => void) | null = null;
  let micStream: MediaStream | null = null;
  let micCtx: AudioContext | null = null;
  let micTimer: ReturnType<typeof setInterval> | null = null;
  const pressed = new Set<number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const disposers: Array<() => void> = [];

  // ---- DOM ----
  const wrap = h('div', { class: 'birthday' });
  const main = h('div', { class: 'birthday-main' });
  const cake = h('div', { class: 'birthday-cake' });
  const top = h('div', { class: 'birthday-top' });
  const topper = h('div', { class: 'birthday-topper', hidden: true });
  const decor = h('div', { class: 'birthday-decor' });
  const tierTop = h('div', { class: 'birthday-tier birthday-tier-top' });
  const tierBottom = h('div', { class: 'birthday-tier birthday-tier-bottom' });
  const plate = h('div', { class: 'birthday-plate' });
  cake.append(plate, tierBottom, tierTop, topper, decor, top);
  main.append(
    h('div', { class: 'birthday-balloon birthday-balloon-left' }, '🎈'),
    h('div', { class: 'birthday-balloon birthday-balloon-right' }, '🎉'),
    cake,
  );

  const flavorBtn = h('button', { class: 'btn-round birthday-flavor', 'aria-label': 'Đổi vị bánh', onpointerdown: onFlavor }, '🎂');
  const candleBtn = h('button', { class: 'btn-round birthday-add-candle', 'aria-label': 'Thêm nến', onpointerdown: onAddCandle }, '🕯️');
  const lightBtn = h('button', { class: 'btn-round birthday-light birthday-dim', 'aria-label': 'Thắp nến', onpointerdown: onLightAll }, '🔥');
  // getUserMedia needs a user activation; on touch screens pointerup grants one, pointerdown may not.
  const micBtn = h('button', { class: 'btn-round birthday-mic', 'aria-label': 'Thổi vào micro', hidden: true, onpointerup: onMic }, '🎤');
  const againBtn = h('button', { class: 'btn-round birthday-again', 'aria-label': 'Làm bánh mới', hidden: true, onpointerdown: onAgain }, '🔁');
  const buttons = h('div', { class: 'birthday-buttons' }, flavorBtn, candleBtn, lightBtn, micBtn, againBtn);

  const tray = h('div', { class: 'g-tray birthday-tray' });
  for (const item of TOPPINGS) {
    const el = h('div', { class: 'g-item birthday-topping', 'data-emoji': item.emoji }, item.emoji);
    disposers.push(
      makeDraggable(el, {
        onStart() {
          ctx.hint.touch();
        },
        onDrop(_el, p) {
          // The tray piece always floats home; a copy stays where it was dropped.
          if (phase === 'decorate' && overCake(p)) place(item.emoji, p);
          return false;
        },
      }),
    );
    tray.append(el);
  }

  wrap.append(main, buttons, tray);
  ctx.stage.append(wrap);

  // ---- helpers ----
  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  /** Restart a shared animation class, dropping any other one still on the element. */
  function anim(el: Element, cls: string): void {
    for (const c of ANIM_CLASSES) if (c !== cls) el.classList.remove(c);
    replay(el, cls);
  }

  function isLit(c: HTMLElement): boolean {
    return c.classList.contains('birthday-lit');
  }

  function overCake(p: Pt): boolean {
    const tolerance = cake.getBoundingClientRect().width * 0.06;
    const targets: Target[] = [tierTop, tierBottom, plate].map((el, i) => ({ id: String(i), rect: el.getBoundingClientRect() }));
    return hitTest(p, targets, tolerance) !== null;
  }

  /** The lit candle under the pointer (geometric, so a swipe finds them too). */
  function litCandleAt(p: Pt): HTMLElement | null {
    const lit = candles.filter(isLit);
    const id = hitTest(
      p,
      lit.map((c, i) => ({ id: String(i), rect: c.getBoundingClientRect() })),
    );
    return id === null ? null : (lit[Number(id)] ?? null);
  }

  function syncUi(): void {
    const decorate = phase === 'decorate';
    wrap.dataset.phase = phase;
    flavorBtn.hidden = !decorate;
    candleBtn.hidden = !decorate;
    lightBtn.hidden = !decorate;
    lightBtn.classList.toggle('birthday-dim', candles.length === 0);
    micBtn.hidden = phase !== 'blow' || micGone;
    if (phase !== 'done') againBtn.hidden = true;
    tray.classList.toggle('birthday-inert', !decorate);
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      if (!alive || singing) return;
      switch (phase) {
        case 'decorate':
          anim(candles.length === 0 ? candleBtn : lightBtn, 'anim-wiggle');
          return;
        case 'light': {
          const c = candles.find((x) => !isLit(x));
          if (c) anim(c, 'anim-wiggle');
          return;
        }
        case 'blow': {
          if (pressed.size > 0) return;
          const c = candles.find(isLit);
          if (c) anim(c, 'anim-wiggle');
          anim(micBtn, 'anim-wiggle');
          return;
        }
        case 'done':
          anim(againBtn, 'anim-wiggle');
          return;
      }
    });
  }

  // ---- decorate ----
  function setFlavor(index: number): Flavor {
    flavor = ((index % FLAVORS.length) + FLAVORS.length) % FLAVORS.length;
    const f = FLAVORS[flavor] as Flavor;
    cake.style.setProperty('--birthday-cake', f.cake);
    cake.style.setProperty('--birthday-icing', f.icing);
    cake.dataset.flavor = f.id;
    return f;
  }

  function onFlavor(): void {
    if (phase !== 'decorate') return;
    ctx.hint.touch();
    const f = setFlavor(flavor + 1);
    ctx.audio.tick();
    anim(cake, 'anim-bounce');
    ctx.speak(`Bánh ${f.name}`);
  }

  function place(emoji: string, p: Pt): void {
    const r = cake.getBoundingClientRect();
    const pct = (v: number, from: number, size: number) => (size > 0 ? ((v - from) / size) * 100 : 50);
    const x = Math.min(100 - EDGE_PCT, Math.max(EDGE_PCT, pct(p.x, r.left, r.width)));
    const y = Math.min(100 - EDGE_PCT, Math.max(EDGE_PCT, pct(p.y, r.top, r.height)));
    const el = h('div', { class: 'birthday-topping placed anim-bounce', style: `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%` }, emoji);
    decor.append(el);
    placed.push(el);
    if (placed.length > MAX_PLACED) placed.shift()?.remove();
    ctx.audio.pop();
    ctx.hint.touch();
  }

  function onAddCandle(): void {
    if (phase !== 'decorate') return;
    ctx.hint.touch();
    if (candles.length >= MAX_CANDLES) {
      anim(candleBtn, 'anim-shake');
      ctx.audio.boing();
      return;
    }
    const i = candles.length;
    const stick = h('div', { class: 'birthday-stick', style: `--birthday-hue:${(i * 57 + 330) % 360}` });
    const candle = h('div', { class: 'birthday-candle', 'data-index': i }, stick);
    top.append(candle);
    candles.push(candle);
    anim(candle, 'anim-bounce');
    ctx.audio.pop(1 + i * 0.12);
    ctx.speak(candleWord(candles.length));
    syncUi();
    armHint();
  }

  function onLightAll(): void {
    if (phase !== 'decorate') return;
    ctx.hint.touch();
    if (candles.length === 0) {
      anim(candleBtn, 'anim-wiggle');
      ctx.audio.boing();
      ctx.speak('Thêm nến trước nhé!');
      return;
    }
    phase = nextPhase(phase, 'lightAll');
    syncUi();
    ctx.speak('Thắp nến nào!');
    armHint();
  }

  // ---- light ----
  function light(candle: HTMLElement): void {
    if (isLit(candle) || candle.classList.contains('birthday-out')) return;
    candle.classList.add('birthday-lit');
    const i = candles.indexOf(candle);
    const flame = h('div', { class: 'birthday-flame', style: `--birthday-delay:-${(Math.max(0, i) * 0.13).toFixed(2)}s` }, '🔥');
    candle.append(flame);
    ctx.audio.pop(1.5);
    navigator.vibrate?.(10);
    if (candles.every(isLit)) sing();
    else armHint();
  }

  function floatNote(i: number): void {
    const el = h(
      'div',
      { class: 'birthday-note', style: `left:${22 + ((i * 37) % 56)}%;top:${28 + ((i * 23) % 34)}%` },
      i % 2 ? '🎶' : '🎵',
    );
    main.append(el);
    later(() => el.remove(), NOTE_MS);
  }

  function sing(): void {
    singing = true;
    ctx.hint.clear();
    ctx.speak('Chúc mừng sinh nhật!');
    cancelSong = schedule(
      HAPPY_BIRTHDAY,
      HAPPY_BIRTHDAY_BPM,
      (i, note, ms) => {
        ctx.audio.note(noteFreq(note.n), (ms / 1000) * 0.9, 'piano');
        floatNote(i);
      },
      () => {
        cancelSong = null;
        if (!alive) return;
        singing = false;
        phase = nextPhase(phase, 'allLit');
        syncUi();
        ctx.speak('Thổi nến nào!');
        armHint();
      },
    );
  }

  // ---- blow ----
  function blowOut(candle: HTMLElement): void {
    if (!isLit(candle)) return;
    candle.classList.remove('birthday-lit');
    candle.classList.add('birthday-out');
    const flame = candle.querySelector('.birthday-flame');
    if (flame) {
      flame.classList.add('birthday-flame-out');
      later(() => flame.remove(), FLAME_OUT_MS);
    }
    const puff = h('div', { class: 'birthday-puff' }, '💨');
    candle.append(puff);
    later(() => puff.remove(), PUFF_MS);
    ctx.audio.puff();
    navigator.vibrate?.(10);
    if (candles.every((c) => c.classList.contains('birthday-out'))) void allOut();
    else armHint();
  }

  async function allOut(): Promise<void> {
    phase = nextPhase(phase, 'allOut');
    stopMic();
    pressed.clear();
    syncUi();
    ctx.hint.clear();
    ctx.speak('Chúc mừng sinh nhật bé!');
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    againBtn.hidden = false;
    anim(againBtn, 'anim-bounce');
    armHint();
  }

  function onAgain(): void {
    if (phase !== 'done') return;
    phase = nextPhase(phase, 'again');
    for (const c of candles) c.remove();
    candles = [];
    for (const p of placed) p.remove();
    placed = [];
    setFlavor(flavor + 1);
    syncUi();
    anim(cake, 'anim-bounce');
    ctx.audio.ding();
    ctx.speak('Làm bánh mới nào!');
    armHint();
  }

  // ---- microphone ----
  function stopTracks(stream: MediaStream): void {
    try {
      for (const t of stream.getTracks()) t.stop();
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
    micBtn.classList.remove('birthday-listening');
    micBtn.style.removeProperty('--birthday-level');
  }

  function micFail(): void {
    micGone = true;
    micBtn.hidden = true;
    ctx.speak('Chạm vào nến để thổi nhé');
  }

  /** Every lit candle goes out, one after another. */
  function blowAll(): void {
    candles.filter(isLit).forEach((c, i) => {
      if (i === 0) blowOut(c);
      else later(() => blowOut(c), i * MIC_BLOW_GAP_MS);
    });
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
    if (!alive || phase !== 'blow') {
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
    micBtn.classList.add('birthday-listening');
    ctx.speak('Thổi mạnh vào micro nào!');
    micTimer = setInterval(() => {
      if (!alive || phase !== 'blow') {
        stopMic();
        return;
      }
      analyser.getByteTimeDomainData(buf);
      const s = blowStrength(buf);
      micBtn.style.setProperty('--birthday-level', Math.min(1, s / (BLOW_THRESHOLD * 2)).toFixed(2));
      if (s > BLOW_THRESHOLD) {
        hot++;
        if (hot >= MIC_HOT_POLLS) {
          stopMic();
          ctx.hint.touch();
          blowAll();
        }
      } else {
        hot = 0;
      }
    }, MIC_POLL_MS);
  }

  function onMic(): void {
    if (phase !== 'blow') return;
    ctx.hint.touch();
    ctx.audio.tick();
    void startMic();
  }

  // ---- pointer input on the cake ----
  function candleFromEvent(e: Event): HTMLElement | null {
    const t = e.target;
    if (!(t instanceof Element)) return null;
    const c = t.closest('.birthday-candle');
    return c instanceof HTMLElement && candles.includes(c) ? c : null;
  }

  cake.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ctx.hint.touch();
    if (phase === 'light') {
      if (singing) return;
      const c = candleFromEvent(e);
      if (c) light(c);
      return;
    }
    if (phase !== 'blow') return;
    e.preventDefault();
    pressed.add(e.pointerId);
    try {
      cake.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom */
    }
    const c = candleFromEvent(e) ?? litCandleAt({ x: e.clientX, y: e.clientY });
    if (c) blowOut(c);
  });
  cake.addEventListener('pointermove', (e) => {
    if (phase !== 'blow' || !pressed.has(e.pointerId)) return;
    const c = litCandleAt({ x: e.clientX, y: e.clientY });
    if (c) blowOut(c);
  });
  const release = (e: PointerEvent): void => {
    pressed.delete(e.pointerId);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---- photo topper ----
  void ctx.photos
    .list()
    .then((photos) => {
      const first = photos[0];
      if (!alive || !first) return;
      topper.style.backgroundImage = `url("${first.url}")`;
      topper.hidden = false;
    })
    .catch(() => undefined);

  ctx.onCleanup(() => {
    alive = false;
    cancelSong?.();
    cancelSong = null;
    stopMic();
    for (const d of disposers) d();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
  });

  setFlavor(0);
  syncUi();
  armHint();
}

const game: GameModule = { ...meta, start };
export default game;
