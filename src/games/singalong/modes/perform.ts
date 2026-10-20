import { h, replay } from '../../../core/dom';
import { noteFreq, schedule, type Song, type SongNote } from '../../../core/music';
import { makeTappable } from '../../../core/tap';
import { REPERTOIRE } from '../catalog';
import { createTracker, type ShowTracker } from '../show';
import type { BurstKind, LightStyle } from '../stage';
import { FRAME_MS } from '../voice';
import { fillSongCards } from './songCards';
import type { Env, Mode } from './types';

interface Effect {
  id: BurstKind;
  icon: string;
  name: string;
  lights: LightStyle;
}
export const EFFECTS: readonly Effect[] = [
  { id: 'sparkle', icon: '✨', name: 'Lấp lánh', lights: 'gold' },
  { id: 'rainbow', icon: '🌈', name: 'Cầu vồng', lights: 'rainbow' },
  { id: 'fire', icon: '🎆', name: 'Pháo hoa', lights: 'pink' },
  { id: 'bubbles', icon: '🫧', name: 'Bong bóng', lights: 'blue' },
];

const INTRO_MS = 2800;
/** Different effects tried in one show that earn a bonus ticket. */
const EFFECTS_FOR_BONUS = 3;

/** Integer beats that start inside a note that begins at beat `from` and lasts `d`, as ms offsets from the note's start. */
export function beatOffsets(from: number, d: number, beatMs: number): Array<{ beat: number; atMs: number }> {
  const out: Array<{ beat: number; atMs: number }> = [];
  for (let k = Math.ceil(from - 1e-6) || 0; k < from + d - 1e-6; k++) out.push({ beat: k, atMs: Math.max(0, (k - from) * beatMs) });
  return out;
}

/**
 * "Biểu diễn": the child chooses a song and a style of lights, then the whole band
 * of animals plays — drums, bass, the tune, and a high voice joining in on every
 * other note — while the child sings or claps and sets off lights and fireworks.
 */
export function createPerformMode(env: Env, panel: HTMLElement): Mode {
  const timers = env.timers();
  let effect: Effect = EFFECTS[0] as Effect;
  const used = new Set<string>();
  // One big button changes the lights: a tap goes on to the next style, so there is never a row of four to choose from.
  const fxBtn = h('button', { class: 'sa-fx-btn', type: 'button', 'aria-label': 'Đổi ánh sáng' }, effect.icon);
  makeTappable(fxBtn, () => choose(EFFECTS[(EFFECTS.indexOf(effect) + 1) % EFFECTS.length] as Effect, true), { ctx: env.ctx });
  const grid = h('div', { class: 'sa-songs' });
  const nowIcon = h('span', { class: 'sa-now-icon' }, '🎶');
  const nowTitle = h('span', { class: 'sa-now-title' });
  const now = h('div', { class: 'sa-now', hidden: true }, h('div', { class: 'sa-now-song' }, nowIcon, nowTitle), fxBtn);
  panel.append(grid, now);

  let phase: 'pick' | 'play' = 'pick';
  let cancelSong: (() => void) | null = null;
  let tracker: ShowTracker | null = null;
  let playing = false;
  let beat = 0;
  let noteNo = 0;
  let beatMs = 500;

  function choose(e: Effect, burst: boolean): void {
    effect = e;
    used.add(e.id);
    fxBtn.textContent = e.icon;
    fxBtn.dataset.fx = e.id;
    replay(fxBtn, 'sa-fx-pop');
    env.stage.setLights(e.lights);
    if (burst) {
      env.touch();
      env.stage.burst(e.id);
      env.audience.cheer(900);
      env.ctx.audio.fx('sparkle');
    }
  }

  function showPicker(): void {
    phase = 'pick';
    tracker = null;
    playing = false;
    now.hidden = true;
    grid.hidden = false;
    fillSongCards(env, grid, REPERTOIRE, play);
  }

  function onNote(_i: number, note: SongNote, ms: number): void {
    const from = beat;
    beat += note.d;
    noteNo++;
    // Drums: a kick on the even beats, a hat on the odd ones.
    for (const b of beatOffsets(from, note.d, beatMs)) {
      timers.after(b.atMs, () => env.ctx.audio.drum(b.beat % 2 === 0 ? 'kick' : 'hat'));
    }
    if (note.n === 'R') return;
    const f = noteFreq(note.n);
    env.ctx.audio.note(f, Math.min(0.9, ms / 1000), 'piano');
    // The bass walks along with the tune, an octave down, on the strong beats.
    if (Math.floor(from) % 2 === 0 && Math.abs(from - Math.round(from)) < 0.05)
      env.ctx.audio.note(f / 2, Math.min(1.2, (ms * 2) / 1000), 'bass');
    // The animals' high voice joins in on every other note.
    if (noteNo % 2 === 0) {
      env.ctx.audio.note(f * 2, Math.min(0.6, ms / 1000), 'bell');
      env.audience.jump(noteNo);
    }
    env.stage.wave();
  }

  function abort(): void {
    cancelSong?.();
    cancelSong = null;
    timers.clear();
    playing = false;
  }

  async function done(): Promise<void> {
    cancelSong = null;
    playing = false;
    const stats = tracker?.stats();
    if (tracker && used.size >= EFFECTS_FOR_BONUS) tracker.addBonus();
    const final = tracker?.stats() ?? stats;
    tracker = null;
    if (!final || !env.alive()) return;
    await env.finish(final);
    if (env.alive() && phase === 'play') {
      used.clear();
      showPicker();
      env.say('Chọn bài khác nhé!');
    }
  }

  function play(song: Song): void {
    abort();
    phase = 'play';
    beat = 0;
    noteNo = 0;
    beatMs = 60000 / song.bpm;
    tracker = createTracker();
    used.clear();
    used.add(effect.id);
    grid.hidden = true;
    now.hidden = false;
    nowIcon.textContent = song.icon;
    nowTitle.textContent = song.title;
    env.say(`${song.title}. Cả dàn nhạc cùng chơi nào!`, { speak: true });
    [3, 2, 1].forEach((n) => {
      const at = INTRO_MS - n * beatMs;
      if (at > 800) timers.after(at, () => env.ctx.audio.tick());
    });
    timers.after(INTRO_MS, () => {
      playing = true;
      cancelSong = schedule(song.notes, song.bpm, onNote, () => void done());
    });
  }

  return {
    enter() {
      choose(effect, false);
      showPicker();
      env.say('Chọn một bài hát. Cả dàn thú sẽ chơi nhạc cho bé biểu diễn.', { speak: true });
    },
    leave() {
      abort();
      tracker = null;
      env.stage.setLights('gold');
    },
    frame(f) {
      if (playing && tracker) tracker.feed({ active: f.active, onset: f.onset, band: f.band }, FRAME_MS);
    },
    back() {
      if (phase !== 'play') return false;
      env.ctx.audio.tick();
      abort();
      showPicker();
      env.say('Chọn bài khác nhé!');
      return true;
    },
    nudge() {
      if (phase === 'pick') {
        for (const c of grid.children) replay(c, 'anim-wiggle');
        env.say('Bé chọn một bài hát nhé.', { speak: true });
      } else replay(fxBtn, 'anim-wiggle');
    },
  };
}
