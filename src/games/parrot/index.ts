import { h, replay } from '../../core/dom';
import { createMic } from '../../core/mic';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { BARS, CRITTERS, findCritter, MAX_RECORD_MS, pushBar, shouldStar, type Critter } from './logic';
import './style.css';

/** How long the animal keeps bouncing after a playback that reports no end. */
const JUMP_MS = 600;

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
  function after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
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
    micBtn.classList.remove('parrot-recording');
    root.classList.remove('parrot-listening');
    const taken = mic.stopRecord();
    bars = [];
    drawBars();
    if (!taken) {
      say('Chưa nghe thấy gì, hát to hơn nhé!');
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
    after(MAX_RECORD_MS, finishRecording);
  }

  async function askForMic(): Promise<void> {
    micBtn.classList.add('parrot-waiting');
    const ok = await mic.start();
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
  }

  function onMicDown(e: PointerEvent): void {
    e.preventDefault();
    ctx.hint.touch();
    ctx.audio.tick();
    beginRecording();
  }

  function onMicUp(): void {
    if (!mic.listening) {
      void askForMic();
      return;
    }
    finishRecording();
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
  micBtn.addEventListener('pointerdown', onMicDown);
  micBtn.addEventListener('pointerup', onMicUp);
  micBtn.addEventListener('pointercancel', finishRecording);

  ctx.hint.arm(() => {
    replay(micOff ? row : micBtn, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    alive = false;
    recording = false;
    mic.stop();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
