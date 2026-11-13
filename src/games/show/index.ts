import type { SoundGroup } from '../../core/audio';
import { h, replay, svgEl } from '../../core/dom';
import { sayText } from '../../core/say';
import type { GameContext, GameModule } from '../../core/types';
import { BEAR_LOOKS, bearInner, VIEW } from './art';
import { armsBack, armsInner, instTransform, poseOf, type Pose } from './arms';
import { showSvg } from './artExtra';
import { nextStep, phraseMs, playPad, sampleKeysOf, SHOW_INSTRUMENTS, showInst, timeline, type InstDef, type ShowId } from './logic';
import { meta } from './meta';
import './style.css';

const STAR_MS = 800;
/** A phrase or a note being cut off fades over this long, so it never clicks. */
const FADE_MS = 70;
/** How many of the child's own notes are kept as groups, to be cut when another instrument is picked. */
const KEEP_TAPS = 8;
/** Left alone, the bear plays again after this pause… */
const AUTO_GAP_MS = 2500;
/** …and after this many tunes on one instrument it picks up the next one off the shelf. */
const AUTO_REPEATS = 2;
/** A child who touched anything this recently is playing: the bear waits. */
const AUTO_QUIET_MS = 5000;
let uid = 0;

/** Restart a CSS animation on an SVG element (which has no offsetWidth to force the reflow with). */
function replaySvg(el: Element, cls: string): void {
  el.classList.remove(cls);
  void el.getBoundingClientRect();
  el.classList.add(cls);
}

/**
 * Instrument show: the interactive version of watching a musician on video. Tap an instrument on
 * the shelf and a bear plays a short tune on it (real instrument sound, matching motion). Then it is
 * the child's turn: each tap on the big instrument the bear holds plays the next note of the tune
 * (always pleasant: the notes are pentatonic), so even a very small child plays the whole tune with
 * one finger. Nothing is ever wrong.
 */
function start(ctx: GameContext): void {
  const root = h('div', { class: 'show' });
  const bearLook = BEAR_LOOKS[0]!;
  const bear = svgEl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" class="show-bear" aria-hidden="true">${bearInner(bearLook, false, false)}</svg>`,
  );
  const instBox = h('button', { class: 'show-inst', type: 'button', 'aria-label': 'Nhạc cụ' });
  const arms = svgEl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" class="show-arms" aria-hidden="true"></svg>`);
  const armsUnder = svgEl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" class="show-arms show-arms-under" aria-hidden="true"></svg>`);
  const floats = h('div', { class: 'show-floats' });
  const performer = h('div', { class: 'show-performer' }, bear as unknown as Node, armsUnder as unknown as Node, instBox, arms as unknown as Node, floats);

  const shelf = h('div', { class: 'show-shelf' });
  const shelfBtns = new Map<string, HTMLButtonElement>();
  for (const d of SHOW_INSTRUMENTS) {
    const b = h(
      'button',
      { class: 'show-pick', type: 'button', 'data-inst': d.id, 'aria-label': d.name },
      svgEl(showSvg(d.id, `s${++uid}`, 'show-pick-art')) as unknown as Node,
    );
    shelfBtns.set(d.id, b);
    shelf.append(b);
  }
  root.append(h('div', { class: 'show-cell' }, performer), shelf);
  ctx.stage.append(root);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  let def: InstDef<ShowId> = SHOW_INSTRUMENTS[0]!;
  let pose: Pose = poseOf(def.id);
  let step = 0;
  /** Bumped whenever the show is restarted or interrupted, so stale timers do nothing. */
  let run = 0;
  let showing = false;
  let flip = false;
  let named = '';
  let lastTouch = 0;
  let autoPlays = 0;
  /** The sounds of the phrase the bear is playing, and the child's latest notes: all cut when something new starts. */
  let showSound: SoundGroup | null = null;
  const tapSounds: SoundGroup[] = [];

  /** Run `fn`, which starts sounds, as one group that can be faded out as a whole. */
  function grouped(fn: () => void): SoundGroup | null {
    if (ctx.audio.group) return ctx.audio.group(fn);
    fn();
    return null;
  }

  /** Silence the bear's phrase (the notes still waiting and the ones ringing) and the child's last notes. */
  function cutSound(): void {
    showSound?.stop(FADE_MS);
    showSound = null;
    for (const g of tapSounds.splice(0)) g.stop(FADE_MS);
  }

  function drawInstrument(): void {
    pose = poseOf(def.id);
    instBox.replaceChildren(svgEl(showSvg(def.id, `p${++uid}`, 'show-inst-art')) as unknown as Node);
    instBox.dataset.action = def.action;
    instBox.dataset.inst = def.id;
    instBox.style.transform = instTransform(pose);
    arms.innerHTML = armsInner(pose, bearLook);
    armsUnder.innerHTML = armsBack(pose, bearLook);
    armsUnder.dataset.mode = pose.mode ?? 'down';
    arms.dataset.mode = pose.mode ?? 'down';
    for (const [id, b] of shelfBtns) b.classList.toggle('is-on', id === def.id);
  }

  function float(text: string, cls = 'show-note'): void {
    const el = h('span', { class: cls, style: `left:${20 + Math.random() * 60}%` }, text);
    floats.append(el);
    after(STAR_MS + 200, () => el.remove());
  }

  /** The bear reacts to a note: the instrument moves its own way, the playing arm moves, a note flies up. */
  function react(idx: number): void {
    replay(instBox, 'is-hit');
    replay(performer, 'is-bob');
    const side = pose.tap === 'alt' ? (flip ? 'l' : 'r') : pose.tap;
    flip = !flip;
    if (pose.mode === 'shake') {
      // A shaken instrument moves with both hands.
      for (const el of performer.querySelectorAll('.show-arm')) replaySvg(el, 'is-tap');
    } else {
      for (const arm of performer.querySelectorAll(`.show-arm-${side}`)) replaySvg(arm, 'is-tap');
    }
    float(['♪', '♫', '♩'][idx % 3] as string);
  }

  function perform(): void {
    const my = ++run;
    showing = true;
    step = 0;
    performer.classList.add('is-playing');
    const line = timeline(def.phrase, def.bpm);
    const d = def;
    showSound = grouped(() => {
      for (const t of line) playPad(ctx.audio, d, t.p, { delay: t.atMs / 1000, dur: Math.max(0.3, (t.durMs / 1000) * 1.1), vel: 0.85 });
    });
    for (const t of line) {
      after(t.atMs, () => {
        if (run === my) react(t.p);
      });
    }
    after(phraseMs(def) + 200, () => {
      if (run !== my) return;
      showing = false;
      performer.classList.remove('is-playing');
      if (named !== def.id) {
        named = def.id;
        void sayText(ctx, `${def.name[0]!.toUpperCase()}${def.name.slice(1)}. Bé chơi nhé!`);
      }
      after(AUTO_GAP_MS, () => autoPlay(my));
    });
  }

  /** Nobody is playing: the bear plays on by itself, the tune again and then the next instrument. */
  function autoPlay(my: number): void {
    if (run !== my || showing) return;
    const quiet = Date.now() - lastTouch;
    if (quiet < AUTO_QUIET_MS) {
      after(AUTO_QUIET_MS - quiet + 200, () => autoPlay(my));
      return;
    }
    if (++autoPlays < AUTO_REPEATS) {
      perform();
      return;
    }
    autoPlays = 0;
    const i = SHOW_INSTRUMENTS.findIndex((d) => d.id === def.id);
    const next = SHOW_INSTRUMENTS[(i + 1) % SHOW_INSTRUMENTS.length]!;
    shelfBtns.get(next.id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    choose(next.id, true);
  }

  function choose(id: string, auto = false): void {
    const next = showInst(id);
    if (!next) return;
    if (!auto) {
      lastTouch = Date.now();
      autoPlays = 0;
    }
    ctx.stopSpeech();
    ctx.audio.preloadInstruments?.(sampleKeysOf(next));
    cutSound(); // the previous phrase must not play on under the new one
    def = next;
    drawInstrument();
    perform();
  }

  /** The child taps the instrument: the next note of the tune sounds and the bear plays it. */
  function playNext(): void {
    lastTouch = Date.now();
    autoPlays = 0;
    if (showing) {
      // Taking over from the performer: cut the show, the child plays now.
      run++;
      showing = false;
      performer.classList.remove('is-playing');
      showSound?.stop(FADE_MS);
      showSound = null;
    }
    const note = def.phrase[step];
    if (!note) return;
    const beat = 60 / def.bpm;
    const d = def;
    const g = grouped(() => playPad(ctx.audio, d, note.p, { dur: Math.min(1.4, Math.max(0.5, note.d * beat * 1.1)) }));
    if (g) {
      tapSounds.push(g);
      if (tapSounds.length > KEEP_TAPS) tapSounds.shift();
    }
    react(note.p);
    navigator.vibrate?.(8);
    step = nextStep(step, def.phrase.length);
    if (step === 0) {
      ctx.addStar();
      ctx.audio.jingle();
      float('⭐', 'show-star');
    }
  }

  instBox.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    playNext();
  });
  // The shelf scrolls, so a pick counts on the tap's release (a swipe is a scroll, not a pick).
  // A mouse wheel only scrolls down: on the sideways strip, turn it into sideways scrolling.
  const wheel = (e: WheelEvent): void => {
    if (shelf.scrollWidth <= shelf.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    shelf.scrollLeft += e.deltaY;
    e.preventDefault();
  };
  shelf.addEventListener('wheel', wheel, { passive: false });
  ctx.onCleanup(() => shelf.removeEventListener('wheel', wheel));
  shelf.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('.show-pick');
    if (!el) return;
    ctx.hint.touch();
    choose(el.dataset.inst ?? '');
  });

  drawInstrument();
  // The child came in with a tap, so sound may start: the bear plays straight away.
  after(600, () => {
    if (!showing && lastTouch === 0) perform();
  });
  // The first screenful of the shelf is ready before it is tapped; the rest loads on selection.
  ctx.audio.preloadInstruments?.(SHOW_INSTRUMENTS.slice(0, 8).flatMap((d) => sampleKeysOf(d)));

  let nudged = -1;
  ctx.hint.arm(() => {
    if (!showing && Math.random() < 0.5) replay(instBox, 'anim-wiggle');
    else {
      const b = shelf.children[Math.floor(Math.random() * shelf.children.length)];
      if (b) replay(b, 'anim-wiggle');
    }
    if (nudged === (ctx.hint.epoch ?? 0)) return;
    nudged = ctx.hint.epoch ?? 0;
    void sayText(ctx, 'Chạm vào một nhạc cụ nào!');
  });

  ctx.onCleanup(() => {
    run++;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    cutSound();
  });
}

const game: GameModule = { ...meta, start };
export default game;
