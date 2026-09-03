import { h, replay } from '../../core/dom';
import { createMic } from '../../core/mic';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { BARS, CRITTERS, findCritter, MAX_RECORD_MS, pushBar, shouldStar, type Critter } from './logic';
import './style.css';

/** How long the animal keeps bouncing after a playback that reports no end. */
const JUMP_MS = 600;
/**
 * A press let go sooner than this was a tap, not a hold. Nothing is recorded either
 * way, but a child who tapped needs telling to hold on, not to sing louder.
 */
const TAP_MS = 500;

/**
 * Hold the microphone, sing, let go — and the chosen animal sings it back in its
 * own voice: the recording is simply played faster (mouse, parrot) or slower
 * (elephant, dinosaur). Tapping another animal replays the same clip in its
 * voice. With no microphone every animal still has a synthesized cry of its own.
 */
function start(ctx: GameContext): void {
  const mic = createMic();
  let alive = true;
  let chosen: Critter = CRITTERS[0] as Critter;
  let voice: AudioBuffer | null = null;
  let recording = false;
  let plays = 0;
  /** The microphone was refused. The button stays put and asks again. */
  let micOff = false;
  let bars: number[] = [];
  /**
   * The pointer holding the microphone down, if any. A second finger landing on
   * the button must not end someone else's recording, and a release has to be
   * matched to its own press — on a tablet the two often land on different elements.
   */
  let holdId: number | null = null;
  let heldAt = 0;
  /** Set while a permission prompt is open, so a press is not asked for twice. */
  let asking = false;
  /** The recording's own time limit, cleared when it ends early: a stale one left
      running would cut the *next* recording short. */
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  const root = h('div', { class: 'parrot' });
  const stageCritter = h('span', { class: 'parrot-big' }, chosen.emoji);
  const bubble = h('div', { class: 'parrot-bubble' }, 'Giữ 🎤 rồi hát nhé!');
  const wave = h('div', { class: 'parrot-wave' }, ...Array.from({ length: BARS }, () => h('span', { class: 'parrot-bar' })));
  const row = h('div', { class: 'parrot-row' });
  const micBtn = h('button', { class: 'btn-round parrot-mic', type: 'button', 'aria-label': 'Giữ để thu giọng' }, '🎤');
  root.append(bubble, stageCritter, wave, row, micBtn);
  ctx.stage.append(root);

  const barEls = [...wave.querySelectorAll<HTMLElement>('.parrot-bar')];
  const critterEls = new Map<string, HTMLButtonElement>();
  for (const critter of CRITTERS) {
    const el = h(
      'button',
      { class: 'parrot-critter', type: 'button', 'data-critter': critter.id, 'aria-label': critter.name },
      critter.emoji,
    );
    critterEls.set(critter.id, el);
    row.append(el);
  }
  critterEls.get(chosen.id)?.classList.add('parrot-chosen');

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function after(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  }

  function drawBars(): void {
    for (let i = 0; i < barEls.length; i++) {
      const level = bars[bars.length - barEls.length + i] ?? 0;
      barEls[i]?.style.setProperty('--parrot-bar', level.toFixed(2));
    }
  }

  function say(text: string): void {
    bubble.textContent = text;
    replay(bubble, 'anim-bounce');
  }

  // ---- playing a voice back ----
  function jump(): void {
    stageCritter.classList.add('parrot-jump');
    after(JUMP_MS, () => stageCritter.classList.remove('parrot-jump'));
  }

  async function reward(): Promise<void> {
    await ctx.celebrate();
    if (alive) ctx.addStar();
  }

  function playVoice(): void {
    if (!voice) return;
    jump();
    mic.play(voice, { rate: chosen.rate });
    plays++;
    if (shouldStar(plays)) void reward();
  }

  function choose(critter: Critter): void {
    if (chosen.id !== critter.id) {
      critterEls.get(chosen.id)?.classList.remove('parrot-chosen');
      chosen = critter;
      critterEls.get(critter.id)?.classList.add('parrot-chosen');
      stageCritter.textContent = critter.emoji;
    }
    ctx.hint.touch();
    if (voice) {
      say(`${critter.name} hát này!`);
      playVoice();
    } else {
      ctx.audio.fx(critter.fx);
      ctx.speak(critter.name);
      jump();
    }
  }

  // ---- recording ----
  function finishRecording(): void {
    if (!recording) return;
    recording = false;
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      timers.delete(maxTimer);
      maxTimer = null;
    }
    micBtn.classList.remove('parrot-recording');
    root.classList.remove('parrot-listening');
    const taken = mic.stopRecord();
    bars = [];
    drawBars();
    if (!taken) {
      say(Date.now() - heldAt < TAP_MS ? 'Giữ 🎤 lâu hơn rồi hát nhé!' : 'Chưa nghe thấy gì, hát to hơn nhé!');
      ctx.audio.boing();
      return;
    }
    voice = taken;
    // Both of the things they can do next, because neither is obvious: the row
    // of animals sings this clip again, and the microphone takes a new one.
    say(`${chosen.name} hát lại nào! Chạm bạn khác, hoặc giữ 🎤 hát bài mới.`);
    playVoice();
  }

  function beginRecording(): void {
    if (recording || !mic.listening) return;
    recording = true;
    bars = [];
    drawBars();
    micBtn.classList.add('parrot-recording');
    root.classList.add('parrot-listening');
    say('Đang nghe… 🎵');
    mic.record(MAX_RECORD_MS);
    maxTimer = after(MAX_RECORD_MS, finishRecording);
  }

  async function askForMic(): Promise<void> {
    if (asking) return;
    asking = true;
    micBtn.classList.add('parrot-waiting');
    const ok = await mic.start();
    asking = false;
    micBtn.classList.remove('parrot-waiting');
    if (!alive) {
      mic.stop();
      return;
    }
    micOff = !ok;
    micBtn.classList.toggle('parrot-mic-off', micOff);
    if (!ok) {
      // The button used to be taken away here, which left the child nothing to
      // press and no way back: a parent who allowed the microphone afterwards
      // could not tell the game to look again. It stays, and asks again.
      say('Chưa nghe được micro. Chạm 🎤 thử lại, hoặc chạm vào các bạn nhé!');
      ctx.speak('Chạm vào các bạn để nghe tiếng nhé');
      return;
    }
    mic.onFrame((frame) => {
      if (!recording) return;
      bars = pushBar(bars, frame.level);
      drawBars();
    });
    say('Giữ 🎤 rồi hát nhé!');
    ctx.speak('Giữ nút micro rồi hát nhé');
    // Granted while a finger is still on the button: start now rather than make
    // the child let go and press again, which is a whole held breath wasted.
    if (holdId !== null) beginRecording();
  }

  function onMicDown(e: PointerEvent): void {
    // A second finger on the button belongs to nobody: it must not take the hold over.
    if (holdId !== null) return;
    e.preventDefault();
    holdId = e.pointerId;
    heldAt = Date.now();
    // With the pointer captured, a finger that slides off the button still sends
    // its move, up and cancel here. Without it the release lands on whatever is
    // underneath instead, and the recording runs until it times out.
    try {
      micBtn.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom, and browsers that refuse a capture we can live without */
    }
    ctx.hint.touch();
    ctx.audio.tick();
    if (mic.listening) beginRecording();
    else void askForMic();
  }

  /**
   * The end of a hold, wherever the finger happened to be. `pointercancel` counts:
   * the browser taking the gesture away is not a reason to throw the singing away.
   */
  function onMicRelease(e: PointerEvent): void {
    if (holdId === null) {
      // A release with no press of ours behind it: the press was swallowed, or the
      // finger came down elsewhere and slid onto the button. Still worth reading as
      // "I want the microphone", which is the only thing a press here ever means.
      if (e.target === micBtn && !mic.listening) void askForMic();
      return;
    }
    if (e.pointerId !== holdId) return;
    holdId = null;
    try {
      if (micBtn.hasPointerCapture?.(e.pointerId)) micBtn.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (recording) finishRecording();
    else if (!mic.listening) void askForMic();
  }

  row.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>('.parrot-critter');
    const critter = el && findCritter(el.dataset.critter ?? '');
    if (!critter) return;
    e.preventDefault();
    ctx.audio.pop();
    choose(critter);
  });
  // The animal on stage is the biggest thing on screen: worth a press of its own,
  // and a much easier target than the row for a child who keeps missing.
  stageCritter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    choose(chosen);
  });
  micBtn.addEventListener('pointerdown', onMicDown);
  micBtn.addEventListener('pointerup', onMicRelease);
  micBtn.addEventListener('pointercancel', onMicRelease);
  // Backstop for a release the button never sees at all — a capture the browser
  // refused, or a pointer torn away by the shell.
  window.addEventListener('pointerup', onMicRelease);
  window.addEventListener('pointercancel', onMicRelease);
  /**
   * The microphone is asked for on the first touch anywhere, not only on the
   * button. A child's first act is nearly always poking an animal, and by the
   * time they get round to holding 🎤 the permission is long since settled —
   * where before, the first hold was spent on the prompt and recorded nothing.
   */
  const firstTouch = (): void => {
    root.removeEventListener('pointerup', firstTouch);
    if (!mic.listening) void askForMic();
  };
  root.addEventListener('pointerup', firstTouch);

  ctx.hint.arm(() => {
    replay(micOff ? row : micBtn, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    alive = false;
    recording = false;
    holdId = null;
    root.removeEventListener('pointerup', firstTouch);
    window.removeEventListener('pointerup', onMicRelease);
    window.removeEventListener('pointercancel', onMicRelease);
    mic.stop();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
