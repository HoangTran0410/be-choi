import { h, replay } from '../../../core/dom';
import { hasLyrics, noteFreq, phraseAt, schedule, type Phrase, type SongNote, type SungSong } from '../../../core/music';
import { makeTappable } from '../../../core/tap';
import { REPERTOIRE } from '../catalog';
import { createTracker, type ShowTracker } from '../show';
import { FRAME_MS } from '../voice';
import { beatMsOf, wordTiming } from './lyrics';
import { fillSongCards } from './songCards';
import type { Env, Mode } from './types';

/** Count-in before the music starts. The title is only shown, not spoken, so there is no voice to wait for. */
const INTRO_MS = 3200;
const COUNT_IN = ['3', '2', '1'];
const COUNT_IN_FROM_MS = 1500;

/** Songs with words, in the order of the repertoire. */
export const SINGABLE: readonly SungSong[] = REPERTOIRE.filter(hasLyrics);

/**
 * "Hát theo bài": the karaoke. The melody plays on bells at a gentler tempo than
 * written, one line of words at a time, and the words light up one by one as the
 * song reaches them. The brighter the child sings, the more the line glows.
 */
export function createSongMode(env: Env, panel: HTMLElement): Mode {
  const timers = env.timers();
  const grid = h('div', { class: 'sa-songs' });
  const emoji = h('span', { class: 'sa-lyric-emoji' }, '🎵');
  const words = h('div', { class: 'sa-words' });
  const count = h('div', { class: 'sa-count', hidden: true, 'aria-hidden': 'true' });
  const stop = h('button', { class: 'btn-round sa-stop', type: 'button', 'aria-label': 'Chọn bài khác' }, '⏹');
  const sing = h('div', { class: 'sa-sing', hidden: true }, h('div', { class: 'sa-lyric' }, emoji, words), count, stop);
  panel.append(grid, sing);

  let phase: 'pick' | 'play' = 'pick';
  let cancelSong: (() => void) | null = null;
  let tracker: ShowTracker | null = null;
  let counting = false;
  let phrases: readonly Phrase[] = [];
  let beat = 0;
  let shown = -1;
  let beatMs = 600;

  function showPicker(): void {
    phase = 'pick';
    tracker = null;
    sing.hidden = true;
    grid.hidden = false;
    panel.classList.remove('sa-voice');
    fillSongCards(env, grid, SINGABLE, playSong);
  }

  function showPhrase(index: number): void {
    const phrase = phrases[index];
    if (!phrase) return;
    shown = index;
    emoji.textContent = phrase.emoji;
    const timing = wordTiming(phrase.text, phrase.beats, beatMs);
    words.style.setProperty('--per', `${timing.perMs}ms`);
    words.replaceChildren(...timing.words.map((w, i) => h('span', { class: 'sa-word', style: `--w:${i}` }, w)));
    replay(sing, 'sa-line-in');
  }

  function onNote(_i: number, note: SongNote, ms: number): void {
    if (note.n !== 'R') env.ctx.audio.note(noteFreq(note.n), Math.min(0.9, ms / 1000), 'bell');
    const index = phraseAt(phrases, beat);
    beat += note.d;
    if (index !== shown) showPhrase(index);
    env.stage.wave();
    env.audience.jump(Math.floor(beat));
  }

  function abort(): void {
    cancelSong?.();
    cancelSong = null;
    timers.clear();
    counting = false;
  }

  async function done(): Promise<void> {
    cancelSong = null;
    const stats = tracker?.stats();
    tracker = null;
    if (!env.alive() || !stats) return;
    await env.finish(stats);
    if (env.alive() && phase === 'play') {
      showPicker();
      env.say('Chọn một bài nữa nào!');
    }
  }

  function playSong(song: SungSong): void {
    abort();
    phase = 'play';
    phrases = song.lyrics;
    beat = 0;
    shown = -1;
    beatMs = beatMsOf(song.bpm);
    tracker = createTracker();
    grid.hidden = true;
    sing.hidden = false;
    showPhrase(0);
    env.say(`${song.title}. Mình cùng hát nhé!`, { speak: true });
    count.hidden = true;
    COUNT_IN.forEach((text, i) => {
      const at = Math.max(COUNT_IN_FROM_MS, INTRO_MS - (COUNT_IN.length - i) * beatMs);
      timers.after(at, () => {
        count.hidden = false;
        count.textContent = text;
        replay(count, 'sa-count-in');
        env.ctx.audio.tick();
      });
    });
    timers.after(INTRO_MS, () => {
      count.hidden = true;
      counting = true;
      cancelSong = schedule(song.notes, 60000 / beatMs, onNote, () => void done());
    });
  }

  makeTappable(
    stop,
    () => {
      env.ctx.audio.tick();
      abort();
      showPicker();
      env.say('Chọn bài khác nhé!');
    },
    { ctx: env.ctx },
  );

  return {
    enter() {
      showPicker();
      env.say('Chọn một bài hát nhé. Bé hát theo lời, lời sẽ sáng lên.', { speak: true });
    },
    leave() {
      abort();
      tracker = null;
    },
    frame(f) {
      panel.classList.toggle('sa-voice', f.active && phase === 'play');
      if (tracker && counting) tracker.feed({ active: f.active, onset: f.onset, band: f.band }, FRAME_MS);
    },
    nudge() {
      if (phase === 'pick') {
        for (const c of grid.children) replay(c, 'anim-wiggle');
        env.say('Bé chạm vào một bài hát nhé.', { speak: true });
      }
    },
  };
}
