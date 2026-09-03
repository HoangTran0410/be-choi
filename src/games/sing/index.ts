import { createCamera } from '../../core/camera';
import { h, randInt, replay } from '../../core/dom';
import { createMic } from '../../core/mic';
import { hasLyrics, noteFreq, phraseAt, schedule, SONGS, type Phrase, type SongNote, type SungSong } from '../../core/music';
import { MAX_PHOTOS } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { AUDIENCE, NOTE_EMOJI, pitchBand } from './logic';

/** Only songs with Vietnamese words: the rest of the songbook is for playing, not singing. */
const SONGBOOK: readonly SungSong[] = SONGS.filter(hasLyrics);
import './style.css';

/**
 * Wait after the spoken title before the music starts: long enough for the child
 * to take a breath and for iOS to finish speaking (it ducks Web Audio while it does).
 */
const INTRO_MS = 3000;
/** The numbers counted in before the first note. */
const COUNT_IN = ['3', '2', '1'];
/** A count-in never starts before this, so it does not talk over the spoken title. */
const COUNT_IN_FROM_MS = 1100;
/** The child is singing loudly enough for the stage to react. */
const LOUD = 0.28;
/** …and has gone quiet again (hysteresis, so the lights do not flicker). */
const QUIET = 0.16;
/** Gap between two notes floating up out of the microphone. */
const NOTE_GAP_MS = 220;
const NOTE_LIFE_MS = 1600;
const FLASH_MS = 400;

/**
 * A stage to sing on: pick one of the nursery songs, the backing melody plays on
 * bells while the words scroll one big line at a time, and the microphone turns
 * the child's voice into stage lights, a cheering front row and notes floating
 * up. The front camera can stand in as the backdrop so the child sees the singer,
 * and 📷 keeps a picture. Everything still works with no microphone and no camera.
 */
function start(ctx: GameContext): void {
  const mic = createMic({ pitch: true });
  const cam = createCamera();
  let alive = true;
  /** The microphone was refused. The button stays put and asks again. */
  let micOff = false;

  const root = h('div', { class: 'sing', 'data-phase': 'pick' });
  const mirror = h('div', { class: 'sing-mirror' });
  const lights = h('div', { class: 'sing-lights' }, ...Array.from({ length: 5 }, () => h('span', { class: 'sing-light' })));
  const lyricEmoji = h('span', { class: 'sing-lyric-emoji' }, '🎵');
  const lyricText = h('span', { class: 'sing-lyric-text' }, '');
  const lyric = h('div', { class: 'sing-lyric', hidden: true }, lyricEmoji, lyricText);
  const count = h('div', { class: 'sing-count', hidden: true, 'aria-hidden': 'true' });
  const audience = h(
    'div',
    { class: 'sing-audience' },
    ...AUDIENCE.map((a, i) => h('span', { class: 'sing-fan', style: `--sing-fan:${i}` }, a)),
  );
  const picker = h('div', { class: 'sing-songs' });
  const micBtn = h('button', { class: 'btn-round sing-mic', type: 'button', 'aria-label': 'Bật micro' }, '🎤');
  const camBtn = h('button', { class: 'btn-round sing-cam', type: 'button', 'aria-label': 'Bật máy ảnh' }, '🪞');
  const shotBtn = h('button', { class: 'btn-round sing-shot', type: 'button', 'aria-label': 'Chụp ảnh', hidden: true }, '📷');
  const backBtn = h('button', { class: 'btn-round sing-back', type: 'button', 'aria-label': 'Chọn bài khác', hidden: true }, '⏹');
  const buttons = h('div', { class: 'sing-buttons' }, micBtn, camBtn, shotBtn, backBtn);
  root.append(mirror, lights, h('div', { class: 'sing-curtain sing-left' }), h('div', { class: 'sing-curtain sing-right' }), lyric, count, picker, audience, buttons);
  ctx.stage.append(root);

  for (const song of SONGBOOK) {
    const card = h(
      'button',
      { class: 'sing-song', type: 'button', 'data-song': song.id, 'aria-label': song.title },
      h('span', { class: 'sing-song-icon' }, song.icon),
      h('span', { class: 'sing-song-title' }, song.title),
    );
    card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ctx.hint.touch();
      ctx.audio.pop();
      playSong(song);
    });
    picker.append(card);
  }

  const timers = new Set<ReturnType<typeof setTimeout>>();
  let cancelSong: (() => void) | null = null;
  let phrases: readonly Phrase[] = [];
  let beat = 0;
  let shown = -1;
  let loud = false;
  let lastNoteAt = 0;

  function after(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  }

  // ---- singing ----
  function showPhrase(index: number): void {
    const phrase = phrases[index];
    if (!phrase) return;
    shown = index;
    lyricEmoji.textContent = phrase.emoji;
    lyricText.textContent = phrase.text;
    replay(lyric, 'sing-line-in');
  }

  function onNote(_index: number, note: SongNote, ms: number): void {
    if (note.n !== 'R') ctx.audio.note(noteFreq(note.n), Math.min(0.9, ms / 1000), 'bell');
    const index = phraseAt(phrases, beat);
    beat += note.d;
    if (index !== shown) showPhrase(index);
    replay(lyricEmoji, 'anim-bounce');
  }

  function toPicker(): void {
    root.dataset.phase = 'pick';
    count.hidden = true;
    picker.hidden = false;
    lyric.hidden = true;
    backBtn.hidden = true;
    shown = -1;
  }

  async function onSongDone(): Promise<void> {
    cancelSong = null;
    if (!alive) return;
    ctx.audio.fx('cheer');
    audience.classList.add('sing-clap');
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    audience.classList.remove('sing-clap');
    toPicker();
    armHint();
  }

  function stopSong(): void {
    if (cancelSong) cancelSong();
    cancelSong = null;
  }

  function playSong(song: SungSong): void {
    stopSong();
    phrases = song.lyrics;
    beat = 0;
    shown = -1;
    root.dataset.phase = 'sing';
    picker.hidden = true;
    lyric.hidden = false;
    backBtn.hidden = false;
    showPhrase(0);
    ctx.speak(song.title);
    // One number per beat of this song, landing on the first note: the child hears
    // the tempo before having to sing in it.
    const beatMs = 60000 / song.bpm;
    count.hidden = true;
    COUNT_IN.forEach((text, i) => {
      const at = Math.max(COUNT_IN_FROM_MS, INTRO_MS - (COUNT_IN.length - i) * beatMs);
      after(at, () => {
        if (!alive) return;
        count.hidden = false;
        count.textContent = text;
        replay(count, 'sing-count-in');
        ctx.audio.tick();
      });
    });
    after(INTRO_MS, () => {
      if (!alive) return;
      count.hidden = true;
      cancelSong = schedule(song.notes, song.bpm, onNote, () => void onSongDone());
    });
  }

  // ---- microphone ----
  function floatNote(band: number): void {
    const now = Date.now();
    if (now - lastNoteAt < NOTE_GAP_MS) return;
    lastNoteAt = now;
    const el = h('span', { class: 'sing-note', style: `left:${randInt(20, 80)}%;--sing-band:${band}` }, NOTE_EMOJI[band] ?? '🎵');
    root.append(el);
    after(NOTE_LIFE_MS, () => el.remove());
  }

  function onFrame(frame: { level: number; pitch: number | null }): void {
    root.style.setProperty('--sing-level', frame.level.toFixed(2));
    if (frame.level > LOUD) {
      if (!loud) {
        loud = true;
        root.classList.add('sing-loud');
        ctx.hint.touch();
      }
      floatNote(pitchBand(frame.pitch));
    } else if (loud && frame.level < QUIET) {
      loud = false;
      root.classList.remove('sing-loud');
    }
  }

  async function onMic(): Promise<void> {
    ctx.hint.touch();
    ctx.audio.tick();
    if (mic.listening) return;
    micBtn.classList.add('sing-waiting');
    const ok = await mic.start();
    micBtn.classList.remove('sing-waiting');
    if (!alive) {
      mic.stop();
      return;
    }
    micOff = !ok;
    micBtn.classList.toggle('sing-mic-off', micOff);
    if (!ok) {
      // Not hidden: a refused button that can be pressed again is a way back,
      // and a button that is gone is not.
      ctx.speak('Chưa nghe được micro. Chạm 🎤 thử lại, bé cứ hát thật to nhé!');
      return;
    }
    micBtn.classList.add('sing-on');
    mic.onFrame(onFrame);
    ctx.speak('Hát to lên nào!');
  }

  // ---- camera ----
  /** A pink stage frame with a star in each corner, drawn on top of the snapshot. */
  function drawFrame(c: CanvasRenderingContext2D, w: number, h2: number): void {
    const pad = Math.round(Math.min(w, h2) * 0.03);
    c.strokeStyle = '#ec4899';
    c.lineWidth = pad;
    c.strokeRect(pad / 2, pad / 2, w - pad, h2 - pad);
    c.font = `${pad * 3}px serif`;
    c.textBaseline = 'top';
    c.fillText('⭐', pad, pad);
    c.textAlign = 'right';
    c.fillText('🎤', w - pad, pad);
  }

  async function onCam(): Promise<void> {
    ctx.hint.touch();
    ctx.audio.tick();
    camBtn.classList.add('sing-waiting');
    const video = await cam.start();
    camBtn.classList.remove('sing-waiting');
    if (!alive) {
      cam.stop();
      return;
    }
    camBtn.classList.toggle('sing-cam-off', !video);
    if (!video) {
      // Same as the microphone: pressing again is the only way back in.
      ctx.speak('Chưa mở được máy ảnh. Chạm 🪞 thử lại, mình cứ hát nhé!');
      return;
    }
    video.className = 'sing-video';
    mirror.append(video);
    root.classList.add('sing-mirror-on');
    camBtn.hidden = true;
    shotBtn.hidden = false;
    ctx.speak('Bé nhìn thấy mình chưa?');
  }

  async function onShot(): Promise<void> {
    ctx.hint.touch();
    const photos = await ctx.photos.list();
    if (!alive) return;
    if (photos.length >= MAX_PHOTOS) {
      ctx.audio.boing();
      ctx.speak('Hết chỗ ảnh rồi, nhờ bố mẹ xoá bớt nhé');
      return;
    }
    ctx.audio.fx('sparkle');
    const flash = h('div', { class: 'sing-flash' });
    root.append(flash);
    after(FLASH_MS, () => flash.remove());
    const blob = await cam.snapshot(drawFrame);
    if (!alive || !blob) return;
    await ctx.photos.add([blob]);
    if (alive) ctx.speak('Ảnh ca sĩ nhí!');
  }

  // ---- idle nudge ----
  function armHint(): void {
    ctx.hint.arm(() => {
      if (root.dataset.phase === 'pick') {
        for (const card of picker.children) replay(card, 'anim-wiggle');
      } else if (!mic.listening && !micOff) {
        replay(micBtn, 'anim-wiggle');
      }
    });
  }

  micBtn.addEventListener('pointerup', () => void onMic());
  camBtn.addEventListener('pointerup', () => void onCam());
  shotBtn.addEventListener('pointerup', () => void onShot());
  backBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.audio.tick();
    stopSong();
    toPicker();
    armHint();
  });

  ctx.onCleanup(() => {
    alive = false;
    stopSong();
    mic.stop();
    cam.stop();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  armHint();
}

const game: GameModule = { ...meta, start };
export default game;
