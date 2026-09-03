import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable, type Pt, type Target } from '../../core/drag';
import { noteFreq, schedule } from '../../core/music';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import type { Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BLOW_THRESHOLD,
  FLAVORS,
  HAPPY_BIRTHDAY,
  HAPPY_BIRTHDAY_BPM,
  MAX_CANDLES,
  TOPPINGS,
  JOBS,
  JOB_ICON,
  blowStrength,
  candleWord,
  type Flavor,
  type Job,
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
/** localStorage key: id of the photo on the cake, or NO_PHOTO. */
const PHOTO_KEY = 'be-choi:birthday-photo';
const NO_PHOTO = 'none';

type AudioCtor = new () => AudioContext;

/**
 * Birthday: decorate a cake with toppings, add candles (counted like the child's
 * age), light them one by one, hear "Happy Birthday", then blow them out by
 * blowing into the microphone or by touching the flames.
 *
 * None of it is a running order. Every button and every topping works at every
 * moment: a candle lights when it is tapped, goes out when it is tapped again,
 * and lights once more after that; toppings go on a cake that is already blazing;
 * a fresh candle can join a cake that has just been blown out. "Happy Birthday"
 * plays whenever the whole cake is alight, and a star lands whenever a lit cake
 * is blown out — as often as the child cares to do it.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let flavor = 0;
  /** The melody is playing. Everything still responds; the song just carries on. */
  let singing = false;
  /** Sung for this set of flames already: relighting or adding a candle earns a new one. */
  let sung = false;
  /** A candle has been lit since the last celebration, so blowing out is worth a star. */
  let blownRound = false;
  /** Microphone was refused or is unavailable: keep the 🎤 button away. */
  let micGone = false;
  let micBusy = false;
  let candles: HTMLElement[] = [];
  let placed: HTMLElement[] = [];
  let photos: Photo[] = [];
  let closePicker: (() => void) | null = null;
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
  const topper = h('div', { class: 'birthday-topper', hidden: true, onpointerdown: onTopper });
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
  const lightBtn = h(
    'button',
    { class: 'btn-round birthday-light birthday-dim', 'aria-label': 'Thắp nến', onpointerdown: onLightAll },
    '🔥',
  );
  const photoBtn = h(
    'button',
    { class: 'btn-round birthday-photo', 'aria-label': 'Chọn ảnh', hidden: true, onpointerdown: onPhotoBtn },
    '🖼️',
  );
  // getUserMedia needs a user activation; on touch screens pointerup grants one, pointerdown may not.
  const micBtn = h('button', { class: 'btn-round birthday-mic', 'aria-label': 'Thổi vào micro', hidden: true, onpointerup: onMic }, '🎤');
  const againBtn = h('button', { class: 'btn-round birthday-again', 'aria-label': 'Làm bánh mới', onpointerdown: onAgain }, '🔁');
  const buttons = h('div', { class: 'birthday-buttons' }, flavorBtn, candleBtn, lightBtn, photoBtn, micBtn, againBtn);

  /** One tick per job, so the child can see where the cake has got to. */
  const ticks = new Map<Job, HTMLElement>();
  for (const job of JOBS) {
    ticks.set(job, h('div', { class: 'birthday-tick', 'data-job': job }, JOB_ICON[job]));
  }
  const todo = h('div', { class: 'birthday-todo' }, ...ticks.values());

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
          // A cake in full blaze is still worth decorating.
          if (overCake(p)) place(item.emoji, p);
          return false;
        },
      }),
    );
    tray.append(el);
  }

  wrap.append(todo, main, buttons, tray);
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

  const isOut = (c: HTMLElement): boolean => c.classList.contains('birthday-out');
  const anyLit = (): boolean => candles.some(isLit);
  const allLit = (): boolean => candles.length > 0 && candles.every(isLit);

  /**
   * Every control stays where it is; only the ticks and the two conditional
   * buttons change. Nothing is ever taken away mid-play.
   */
  function syncUi(): void {
    lightBtn.classList.toggle('birthday-dim', candles.length === 0 || allLit());
    photoBtn.hidden = photos.length === 0;
    micBtn.hidden = micGone || !anyLit();
    ticks.get('candles')?.classList.toggle('done', candles.length > 0);
    ticks.get('lit')?.classList.toggle('done', allLit());
    ticks.get('out')?.classList.toggle('done', candles.length > 0 && candles.every(isOut));
  }

  /** Wiggle whatever would move the cake along, without insisting on it. */
  function armHint(): void {
    ctx.hint.arm(() => {
      if (!alive || singing || pressed.size > 0) return;
      if (candles.length === 0) {
        anim(candleBtn, 'anim-wiggle');
        return;
      }
      const unlit = candles.find((c) => !isLit(c));
      if (unlit) {
        anim(unlit, 'anim-wiggle');
        anim(lightBtn, 'anim-wiggle');
        return;
      }
      const lit = candles.find(isLit);
      if (lit) {
        anim(lit, 'anim-wiggle');
        if (!micBtn.hidden) anim(micBtn, 'anim-wiggle');
        return;
      }
      anim(againBtn, 'anim-wiggle');
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
    // A new candle is a new cake to sing to.
    sung = false;
    syncUi();
    armHint();
  }

  /** 🔥 lights everything still dark, whenever it is pressed. */
  function onLightAll(): void {
    ctx.hint.touch();
    if (candles.length === 0) {
      anim(candleBtn, 'anim-wiggle');
      ctx.audio.boing();
      ctx.speak('Thêm nến trước nhé!');
      return;
    }
    const dark = candles.filter((c) => !isLit(c));
    if (dark.length === 0) {
      anim(lightBtn, 'anim-shake');
      return;
    }
    ctx.speak('Thắp nến nào!');
    for (const c of dark) light(c);
  }

  // ---- light ----
  /** A candle is its own little switch: dark → lit → out → lit again. */
  function light(candle: HTMLElement): void {
    if (isLit(candle)) return;
    candle.classList.remove('birthday-out');
    candle.querySelector('.birthday-flame')?.remove();
    candle.classList.add('birthday-lit');
    const i = candles.indexOf(candle);
    const flame = h('div', { class: 'birthday-flame', style: `--birthday-delay:-${(Math.max(0, i) * 0.13).toFixed(2)}s` }, '🔥');
    candle.append(flame);
    ctx.audio.pop(1.5);
    navigator.vibrate?.(10);
    // Something is alight, so blowing the cake out is worth a star again.
    blownRound = true;
    syncUi();
    if (allLit() && !sung && !singing) sing();
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

  /** The whole cake is alight: play the song. Everything stays live while it does. */
  function sing(): void {
    singing = true;
    sung = true;
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
        syncUi();
        if (anyLit()) ctx.speak('Thổi nến nào!');
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
    // Relighting a candle earns the song again, and the cake another blow-out.
    sung = false;
    syncUi();
    if (blownRound && candles.length > 0 && candles.every(isOut)) void allOut();
    else armHint();
  }

  /** Every flame is out: a star, and the cake is ready to be lit all over again. */
  async function allOut(): Promise<void> {
    blownRound = false;
    stopMic();
    pressed.clear();
    syncUi();
    ctx.hint.clear();
    ctx.speak('Chúc mừng sinh nhật bé!');
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    anim(againBtn, 'anim-bounce');
    armHint();
  }

  function onAgain(): void {
    ctx.hint.touch();
    sung = false;
    blownRound = false;
    stopMic();
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
    if (!alive || !anyLit()) {
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
      if (!alive || !anyLit()) {
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
    if (!anyLit()) return;
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
    e.preventDefault();
    pressed.add(e.pointerId);
    try {
      cake.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom */
    }
    // One gesture for the whole candle: dark lights, lit goes out, out lights again.
    const c = candleFromEvent(e) ?? litCandleAt({ x: e.clientX, y: e.clientY });
    if (!c) return;
    if (isLit(c)) blowOut(c);
    else light(c);
  });
  cake.addEventListener('pointermove', (e) => {
    if (!pressed.has(e.pointerId)) return;
    // A swipe only ever puts flames out; it never lights a whole cake by accident.
    const c = litCandleAt({ x: e.clientX, y: e.clientY });
    if (c) blowOut(c);
  });
  const release = (e: PointerEvent): void => {
    pressed.delete(e.pointerId);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---- photo topper ----
  function readChoice(): string | null {
    try {
      return localStorage.getItem(PHOTO_KEY);
    } catch {
      return null;
    }
  }

  function saveChoice(id: string): void {
    try {
      localStorage.setItem(PHOTO_KEY, id);
    } catch {
      /* private mode: simply not remembered */
    }
  }

  /** The saved photo if it still exists, else the first one; NO_PHOTO or no photos → no topper. */
  function showTopper(): void {
    const saved = readChoice();
    const photo = saved === NO_PHOTO ? undefined : (photos.find((p) => p.id === saved) ?? photos[0]);
    if (photo) {
      topper.style.backgroundImage = `url("${photo.url}")`;
      topper.dataset.photo = photo.id;
      topper.hidden = false;
    } else {
      topper.style.removeProperty('background-image');
      delete topper.dataset.photo;
      topper.hidden = true;
    }
  }

  function applyPhotos(list: Photo[]): void {
    if (!alive) return;
    photos = list;
    showTopper();
    syncUi();
  }

  /** Keep the rest of this gesture on `el`, so the pointerup does not land on a picker tile. */
  function capture(el: Element, e: Event): void {
    const id = (e as PointerEvent).pointerId;
    if (typeof id !== 'number') return;
    try {
      el.setPointerCapture(id);
    } catch {
      /* jsdom */
    }
  }

  function openPicker(): void {
    if (closePicker || photos.length === 0) return;
    ctx.hint.touch();
    ctx.audio.tick();
    const choices: PickerChoice[] = photos.map((p, i) => ({ id: p.id, url: p.url, label: `Ảnh ${i + 1}` }));
    choices.push({ id: NO_PHOTO, emoji: '🎂', label: 'Không ảnh' });
    closePicker = showPhotoPicker(ctx.stage, choices, (choice) => {
      closePicker = null;
      if (!alive || !choice) return;
      saveChoice(choice.id);
      showTopper();
      ctx.audio.pop();
      if (!topper.hidden) anim(topper, 'anim-bounce');
    });
  }

  function onTopper(e: Event): void {
    e.stopPropagation();
    capture(topper, e);
    openPicker();
  }

  function onPhotoBtn(e: Event): void {
    capture(photoBtn, e);
    openPicker();
  }

  void ctx.photos
    .list()
    .then(applyPhotos)
    .catch(() => undefined);
  const offPhotos = ctx.photos.onChange(applyPhotos);

  ctx.onCleanup(() => {
    alive = false;
    offPhotos();
    closePicker?.();
    closePicker = null;
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
