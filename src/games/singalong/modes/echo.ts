import { h, replay } from '../../../core/dom';
import { noteFreq } from '../../../core/music';
import { makeTappable } from '../../../core/tap';
import { BARS, pushBar } from '../../parrot/logic';
import { CHOIR, choirSize } from '../catalog';
import { createTracker, type ShowTracker } from '../show';
import { createAutoStop, type AutoStop } from '../signal';
import { FRAME_MS } from '../voice';
import { answerLength, planEntries, relativeRhythm, rhythmLength } from './choir';
import type { Env, Mode } from './types';

/** Answers the animals sing back before the show is over. */
const ROUNDS = 3;
const MAX_RECORD_MS = 9000;
/** Taps that make a full rhythm; and the pause after which a rhythm is finished. */
const MAX_HITS = 8;
const HIT_PAUSE_MS = 1400;
const LONE_HIT_PAUSE_MS = 2500;
const NO_HIT_MS = 5000;

type State = 'ready' | 'listening' | 'choir';

/**
 * "Vẹt nhại": the child sings (or says) one line and a choir of animals sings it
 * back, each in its own voice — a mouse high, an elephant low — coming in one after
 * another like a round. With no microphone the child taps a rhythm instead and the
 * animals play it back on their own notes. Every few answers is a show.
 */
export function createEchoMode(env: Env, panel: HTMLElement): Mode {
  const timers = env.timers();
  const partEls: HTMLElement[] = [];
  const choirRow = h('div', { class: 'sa-choir' });
  const go = h('button', { class: 'sa-echo-go', type: 'button', 'aria-label': 'Bắt đầu hát' }, '🎤');
  const bars = h('div', { class: 'sa-bars', 'aria-hidden': 'true' }, ...Array.from({ length: BARS }, () => h('span', { class: 'sa-bar' })));
  const pips = h(
    'div',
    { class: 'sa-pips', 'aria-hidden': 'true' },
    ...Array.from({ length: ROUNDS }, () => h('span', { class: 'sa-pip' }, '🎵')),
  );
  panel.append(choirRow, h('div', { class: 'sa-echo-main' }, go, bars), pips);

  let state: State = 'ready';
  let round = 0;
  let tracker: ShowTracker | null = null;
  let stopper: AutoStop | null = null;
  let kind: 'mic' | 'tap' = 'mic';
  let level: number[] = [];
  let clock = 0;
  let hits: number[] = [];
  let sinceHit = 0;
  const stops: Array<() => void> = [];
  const barEls = [...bars.children] as HTMLElement[];

  function buildChoir(): void {
    const size = choirSize(env.progress.get().tickets);
    choirRow.replaceChildren();
    partEls.length = 0;
    CHOIR.forEach((part, i) => {
      const locked = i >= size;
      // The choir is for looking at, not for pressing: the one button of this game is the microphone.
      const el = h(
        'span',
        { class: `sa-part${locked ? ' sa-locked' : ''}`, 'aria-label': locked ? 'Chưa mở' : part.name },
        h('span', { class: 'sa-part-e' }, locked ? '❔' : part.emoji),
      );
      partEls.push(el);
      choirRow.append(el);
    });
  }

  function refreshGo(): void {
    const mic = env.voice.micOn;
    const icon = mic ? '🎤' : '🥁';
    if (go.textContent !== icon) {
      go.textContent = icon;
      go.setAttribute('aria-label', mic ? 'Bắt đầu hát' : 'Bắt đầu gõ nhịp');
    }
  }

  function drawBars(): void {
    barEls.forEach((b, i) => b.style.setProperty('--b', (level[level.length - barEls.length + i] ?? 0).toFixed(2)));
  }

  function showPips(): void {
    [...pips.children].forEach((p, i) => p.classList.toggle('sa-pip-on', i < round));
  }

  function setState(next: State): void {
    state = next;
    panel.dataset.state = next;
  }

  function sayReady(): void {
    env.say(env.voice.micOn ? 'Bé hát một câu nhé. Chạm vào micro rồi hát.' : 'Chạm trống rồi gõ nhịp. Các bạn thú sẽ gõ theo.', {
      speak: true,
    });
  }

  // ---- listening ----
  function begin(): void {
    env.touch();
    if (state !== 'ready') return;
    refreshGo();
    kind = env.voice.micOn ? 'mic' : 'tap';
    tracker ??= createTracker();
    stopper = createAutoStop({ maxMs: MAX_RECORD_MS });
    level = [];
    clock = 0;
    sinceHit = 0;
    hits = [];
    setState('listening');
    if (kind === 'mic') {
      env.voice.mic.record(MAX_RECORD_MS);
      env.say('Đang nghe… hát đi nào!', { quiet: true });
    } else {
      env.voice.hit();
      env.say('Gõ, gõ, gõ… mình đang đếm.', { quiet: true });
    }
    env.ctx.audio.tick();
  }

  function giveUp(): void {
    if (kind === 'mic') env.voice.mic.stopRecord();
    setState('ready');
    drawBars();
    env.ctx.audio.boing();
    env.say(kind === 'mic' ? 'Chưa nghe thấy. Bé hát to hơn nhé!' : 'Bé gõ vài tiếng nhé!');
    level = [];
    drawBars();
  }

  function listen(f: { level: number; onset: boolean; active: boolean; band: 0 | 1 | 2 | null }): void {
    tracker?.feed({ active: f.active, onset: f.onset, band: f.band }, FRAME_MS);
    level = pushBar(level, f.level);
    drawBars();
    clock += FRAME_MS;
    if (kind === 'mic') {
      const s = stopper?.feed(f.level, FRAME_MS);
      if (s === 'done') {
        const clip = env.voice.mic.stopRecord();
        level = [];
        drawBars();
        if (clip) singBack(clip);
        else giveUp();
      } else if (s === 'gaveup') giveUp();
      return;
    }
    if (f.onset) {
      hits.push(clock);
      sinceHit = 0;
      env.stage.wave();
    } else sinceHit += FRAME_MS;
    const enough =
      hits.length >= MAX_HITS || (hits.length >= 2 && sinceHit >= HIT_PAUSE_MS) || (hits.length === 1 && sinceHit >= LONE_HIT_PAUSE_MS);
    if (enough) {
      level = [];
      drawBars();
      tapBack(relativeRhythm(hits));
    } else if (hits.length === 0 && clock >= NO_HIT_MS) giveUp();
  }

  // ---- the choir answers ----
  function sing(i: number, ms: number): void {
    const el = partEls[i];
    if (!el) return;
    el.classList.add('sa-singing-part');
    env.audience.jump(i);
    timers.after(ms, () => el.classList.remove('sa-singing-part'));
  }

  function singBack(clip: AudioBuffer): void {
    setState('choir');
    env.say('Các bạn hát lại nè!', { quiet: true });
    const entries = planEntries(choirSize(env.progress.get().tickets));
    for (const e of entries) {
      const part = CHOIR[e.part];
      if (!part) continue;
      timers.after(e.startMs, () => {
        stops.push(env.voice.mic.play(clip, { rate: part.rate, gain: 0.65 }));
        sing(e.part, (clip.duration * 1000) / part.rate);
      });
    }
    const total = answerLength(
      entries,
      clip.duration * 1000,
      CHOIR.map((c) => c.rate),
    );
    timers.after(total + 300, answered);
  }

  function tapBack(rhythm: number[]): void {
    setState('choir');
    env.say('Các bạn gõ lại nè!', { quiet: true });
    const entries = planEntries(choirSize(env.progress.get().tickets));
    for (const e of entries) {
      const part = CHOIR[e.part];
      if (!part) continue;
      timers.after(e.startMs, () => env.ctx.audio.fx(part.fx));
      for (const t of rhythm) {
        timers.after(e.startMs + t + 250, () => {
          env.ctx.audio.note(noteFreq(part.note), 0.45, part.timbre);
          sing(e.part, 200);
        });
      }
    }
    timers.after(rhythmLength(entries, rhythm, 900), answered);
  }

  async function answered(): Promise<void> {
    stops.length = 0;
    round++;
    showPips();
    env.audience.cheer(1400);
    env.ctx.audio.fx('cheer');
    if (round < ROUNDS) {
      setState('ready');
      env.say('Hay quá! Bé hát tiếp nhé.');
      return;
    }
    const stats = tracker?.stats();
    tracker = null;
    if (!stats) return;
    await env.finish(stats);
    if (!env.alive()) return;
    round = 0;
    showPips();
    buildChoir();
    setState('ready');
    sayReady();
  }

  makeTappable(go, () => {
    if (state === 'ready') begin();
    else if (state === 'listening' && kind === 'tap') env.voice.hit();
  });

  return {
    enter() {
      round = 0;
      tracker = null;
      showPips();
      buildChoir();
      refreshGo();
      setState('ready');
      sayReady();
    },
    leave() {
      timers.clear();
      for (const stop of stops.splice(0)) stop();
      if (state === 'listening' && kind === 'mic') env.voice.mic.stopRecord();
      setState('ready');
    },
    frame(f) {
      if (state === 'listening') listen(f);
      else if (state === 'ready') refreshGo();
    },
    hit() {
      // With no microphone the singer is the drum: the first tap starts the rhythm.
      if (state === 'ready' && !env.voice.micOn) begin();
    },
    nudge() {
      if (state === 'ready') {
        replay(go, 'anim-wiggle');
        sayReady();
      }
    },
  };
}
