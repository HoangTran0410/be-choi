import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { noteFreq } from '../../core/music';
import { BEATS, COUNT_IN_BEATS, KITS, MAX_LAYERS, STEPS, TEMPO_FACTORS, stepMs } from './logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

type Ctx = ReturnType<typeof fakeContext>;

function ptr(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId, button: 0, isPrimary: true, bubbles: true });
}

function down(el: Element | null, pointerId = 1): void {
  if (!el) throw new Error('missing element');
  el.dispatchEvent(ptr('pointerdown', 10, 10, pointerId));
}

function up(pointerId = 1): void {
  window.dispatchEvent(ptr('pointerup', 10, 10, pointerId));
}

function q(ctx: Ctx, sel: string): HTMLElement {
  const el = ctx.stage.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

const pad = (ctx: Ctx, i: number) => q(ctx, `.jam-pad[data-index="${i}"]`);
const kitBtn = (ctx: Ctx, id: string) => q(ctx, `.jam-kit[data-id="${id}"]`);
const beatBtn = (ctx: Ctx, id: string) => q(ctx, `.jam-beat[data-id="${id}"]`);
const recBtn = (ctx: Ctx) => q(ctx, '.jam-rec');
const root = (ctx: Ctx) => q(ctx, '.jam');
const layerDots = (ctx: Ctx) => ctx.stage.querySelectorAll<HTMLElement>('.jam-layer');

const BPM = BEATS[0]!.bpm;
/** Fake time for `n` sixteenth steps (whole ms, so every step has fired). */
const steps = (n: number, bpm = BPM, factor = 1) => Math.ceil(stepMs(bpm, factor) * n);

/** Press ⏺ on a fresh (silent) game and run the count-in: returns once the bar is recording. */
function armAndCountIn(ctx: Ctx): void {
  down(recBtn(ctx));
  // Step 0 of the first bar counts 1; steps 4, 8, 12 count 2, 3, 4; the next step 0 records.
  vi.advanceTimersByTime(steps(STEPS + 1));
  if (!recBtn(ctx).classList.contains('jam-recording')) throw new Error('recording did not start');
}

/** Record one layer regardless of the clock phase: arm, wait for the bar, hit `index`, wait for the commit. */
function recordLayer(ctx: Ctx, index: number, bpm = BPM): void {
  const before = layerDots(ctx).length;
  down(recBtn(ctx));
  for (let i = 0; i < STEPS * 2 && !recBtn(ctx).classList.contains('jam-recording'); i++) vi.advanceTimersByTime(steps(1, bpm));
  if (!recBtn(ctx).classList.contains('jam-recording')) throw new Error('recording did not start');
  vi.advanceTimersByTime(steps(1, bpm));
  down(pad(ctx, index));
  for (let i = 0; i < STEPS + 2 && recBtn(ctx).classList.contains('jam-recording'); i++) vi.advanceTimersByTime(steps(1, bpm));
  if (layerDots(ctx).length !== before + 1) throw new Error('layer was not added');
}

describe('jam game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts 4 kits, 12 pads, 3 dancers and the bar controls; nothing plays or speaks until touched', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    const fx = vi.spyOn(ctx.audio, 'fx');
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.jam-kit').length).toBe(4);
    expect(ctx.stage.querySelectorAll('.jam-pad').length).toBe(12);
    expect(ctx.stage.querySelectorAll('.jam-pad-emoji').length).toBe(12);
    expect(ctx.stage.querySelectorAll('.jam-dancer').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.jam-beat').length).toBe(1 + BEATS.length);
    expect(ctx.stage.querySelectorAll('.jam-tempo').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.jam-rec').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.jam-layers').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.jam-clear').length).toBe(1);
    expect(layerDots(ctx).length).toBe(0);
    for (const k of KITS) expect(kitBtn(ctx, k.id).textContent).toBe(k.emoji);
    for (const b of BEATS) expect(beatBtn(ctx, b.id).textContent).toBe(b.emoji);
    expect(beatBtn(ctx, 'stop').textContent).toBe('⏹');
    expect(q(ctx, '.jam-tempo').textContent).toBe('🙂');
    expect(recBtn(ctx).textContent).toBe('⏺');
    // The drum kit is up first: every pad shows its emoji, label and colour.
    expect(kitBtn(ctx, 'drums').classList.contains('active')).toBe(true);
    expect(root(ctx).dataset.kit).toBe('drums');
    KITS[0]!.pads.forEach((p, i) => {
      expect(pad(ctx, i).textContent).toBe(p.emoji);
      expect(pad(ctx, i).getAttribute('aria-label')).toBe(p.label);
      expect(pad(ctx, i).style.getPropertyValue('--jam-color')).toBe(p.color);
    });
    // No voices for drums, so the voice button is hidden; ⏹ is the selected "beat".
    expect(q(ctx, '.jam-voice').hidden).toBe(true);
    expect(beatBtn(ctx, 'stop').classList.contains('active')).toBe(true);
    expect(q(ctx, '.jam-count').hidden).toBe(true);
    // Silent and still until the child touches something.
    vi.advanceTimersByTime(steps(STEPS * 2));
    expect(drum).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
    expect(fx).not.toHaveBeenCalled();
    expect(root(ctx).classList.contains('jam-playing')).toBe(false);
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('tapping a drum pad plays it and squashes it; several fingers play several pads at once', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const fx = vi.spyOn(ctx.audio, 'fx');
    game.start(ctx);
    down(pad(ctx, 0));
    expect(drum).toHaveBeenCalledTimes(1);
    expect(drum).toHaveBeenLastCalledWith('kick');
    expect(pad(ctx, 0).classList.contains('jam-hit')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(pad(ctx, 0).classList.contains('jam-hit')).toBe(false);
    // Tapping the emoji inside the pad, or with a bare Event, still hits it.
    down(pad(ctx, 1).querySelector('.jam-pad-emoji'), 2);
    pad(ctx, 5).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(drum).toHaveBeenNthCalledWith(2, 'snare');
    expect(drum).toHaveBeenNthCalledWith(3, 'cowbell');
    // Two pointers down at once: both pads sound and stay squashed together.
    down(pad(ctx, 2), 7);
    down(pad(ctx, 3), 8);
    expect(drum).toHaveBeenNthCalledWith(4, 'hat');
    expect(drum).toHaveBeenNthCalledWith(5, 'tom');
    expect(pad(ctx, 2).classList.contains('jam-hit')).toBe(true);
    expect(pad(ctx, 3).classList.contains('jam-hit')).toBe(true);
    // The 12th drum pad is the roll effect.
    down(pad(ctx, 11));
    expect(fx).toHaveBeenCalledWith('roll');
    expect(ctx.stars).toBe(0);
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('sliding a finger onto another pad plays it; lifting the finger ends the slide', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    const under = { el: null as Element | null };
    const orig = document.elementFromPoint;
    (document as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => under.el;
    try {
      under.el = pad(ctx, 0);
      down(pad(ctx, 0));
      expect(drum).toHaveBeenLastCalledWith('kick');
      // Still on the same pad: no repeat.
      window.dispatchEvent(ptr('pointermove', 12, 12));
      expect(drum).toHaveBeenCalledTimes(1);
      // Onto the snare pad's emoji: it plays.
      under.el = pad(ctx, 1).querySelector('.jam-pad-emoji');
      window.dispatchEvent(ptr('pointermove', 80, 12));
      expect(drum).toHaveBeenCalledTimes(2);
      expect(drum).toHaveBeenLastCalledWith('snare');
      // Off the pads and back on: plays again.
      under.el = document.body;
      window.dispatchEvent(ptr('pointermove', 300, 300));
      under.el = pad(ctx, 1);
      window.dispatchEvent(ptr('pointermove', 80, 12));
      expect(drum).toHaveBeenCalledTimes(3);
      // A finger that was never on a pad does nothing when it moves.
      window.dispatchEvent(ptr('pointermove', 80, 12, 9));
      expect(drum).toHaveBeenCalledTimes(3);
      up();
      under.el = pad(ctx, 2);
      window.dispatchEvent(ptr('pointermove', 150, 12));
      expect(drum).toHaveBeenCalledTimes(3);
    } finally {
      (document as { elementFromPoint: typeof orig }).elementFromPoint = orig;
    }
    ctx.cleanup();
  });

  it('kit buttons swap the pads: animals play effects, notes play the voice, and the voice button cycles', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const fx = vi.spyOn(ctx.audio, 'fx');
    const note = vi.spyOn(ctx.audio, 'note');
    const tick = vi.spyOn(ctx.audio, 'tick');
    game.start(ctx);

    down(kitBtn(ctx, 'animals'));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(kitBtn(ctx, 'animals').classList.contains('active')).toBe(true);
    expect(kitBtn(ctx, 'animals').getAttribute('aria-pressed')).toBe('true');
    expect(kitBtn(ctx, 'drums').classList.contains('active')).toBe(false);
    expect(root(ctx).dataset.kit).toBe('animals');
    expect(ctx.stage.querySelectorAll('.jam-pad').length).toBe(12);
    expect(pad(ctx, 0).textContent).toBe('🐱');
    expect(pad(ctx, 0).getAttribute('aria-label')).toBe('mèo');
    expect(q(ctx, '.jam-voice').hidden).toBe(true);
    down(pad(ctx, 0));
    expect(fx).toHaveBeenCalledWith('meow');
    down(pad(ctx, 9));
    expect(fx).toHaveBeenLastCalledWith('elephant');
    expect(drum).not.toHaveBeenCalled();
    // Tapping the kit that is already up is a no-op.
    down(kitBtn(ctx, 'animals'));
    expect(tick).toHaveBeenCalledTimes(1);

    down(kitBtn(ctx, 'notes'));
    expect(pad(ctx, 0).textContent).toBe('🔴');
    const voiceBtn = q(ctx, '.jam-voice');
    expect(voiceBtn.hidden).toBe(false);
    expect(voiceBtn.textContent).toBe('🎹');
    down(pad(ctx, 0));
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(noteFreq('C4'), 0.5, 'piano');
    down(pad(ctx, 11));
    expect(note).toHaveBeenLastCalledWith(noteFreq('D6'), 0.5, 'piano');
    // Voice button: next voice, a short demo note, and the pads follow.
    down(voiceBtn);
    expect(voiceBtn.textContent).toBe('🎼');
    expect(note).toHaveBeenLastCalledWith(noteFreq('C5'), 0.4, 'xylo');
    down(pad(ctx, 3));
    expect(note).toHaveBeenLastCalledWith(noteFreq('G4'), 0.5, 'xylo');
    down(voiceBtn);
    expect(voiceBtn.textContent).toBe('🔔');
    down(pad(ctx, 3));
    expect(note).toHaveBeenLastCalledWith(noteFreq('G4'), 0.5, 'bell');
    // Cycle all the way round.
    for (let i = 0; i < 4; i++) down(voiceBtn);
    expect(voiceBtn.textContent).toBe('🎹');

    down(kitBtn(ctx, 'fun'));
    expect(voiceBtn.hidden).toBe(true);
    down(pad(ctx, 0));
    expect(fx).toHaveBeenLastCalledWith('laser');
    down(pad(ctx, 9));
    expect(drum).toHaveBeenLastCalledWith('crash');
    // Back to the notes kit: it remembers its voice.
    down(kitBtn(ctx, 'notes'));
    expect(voiceBtn.textContent).toBe('🎹');
    ctx.cleanup();
  });

  it('selecting 😊 loops kick, snare, hats and a bass line; the dancers hop; ⏹ stops it', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    down(beatBtn(ctx, 'vui'));
    expect(beatBtn(ctx, 'vui').classList.contains('active')).toBe(true);
    expect(beatBtn(ctx, 'vui').getAttribute('aria-pressed')).toBe('true');
    expect(beatBtn(ctx, 'stop').classList.contains('active')).toBe(false);
    expect(root(ctx).classList.contains('jam-playing')).toBe(true);
    expect(root(ctx).style.getPropertyValue('--jam-beat')).toBe(`${stepMs(BPM) * 4}ms`);

    vi.advanceTimersByTime(steps(1));
    expect(drum).toHaveBeenCalledWith('kick');
    expect(drum).toHaveBeenCalledWith('hat');
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(noteFreq('C3'), expect.closeTo((stepMs(BPM) * 3) / 1000, 6), 'bass');
    expect(root(ctx).classList.contains('jam-onbeat')).toBe(true);
    vi.advanceTimersByTime(steps(4));
    expect(root(ctx).classList.contains('jam-onbeat')).toBe(false);
    vi.advanceTimersByTime(steps(STEPS) - steps(5));
    const count = (kind: string) => drum.mock.calls.filter((c) => c[0] === kind).length;
    expect(count('kick')).toBeGreaterThanOrEqual(2);
    expect(count('snare')).toBeGreaterThanOrEqual(2);
    expect(count('hat')).toBeGreaterThanOrEqual(8);
    expect(count('clap')).toBe(0);
    expect(note.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(note.mock.calls.every((c) => c[2] === 'bass')).toBe(true);
    expect(new Set(note.mock.calls.map((c) => c[0]))).toEqual(new Set(['C3', 'G2', 'A2', 'F2'].map(noteFreq)));
    expect(ctx.stars).toBe(0);

    // 🕺 takes over at once: claps arrive, four-on-the-floor.
    drum.mockClear();
    down(beatBtn(ctx, 'nhay'));
    expect(beatBtn(ctx, 'nhay').classList.contains('active')).toBe(true);
    expect(beatBtn(ctx, 'vui').classList.contains('active')).toBe(false);
    vi.advanceTimersByTime(steps(STEPS, 128));
    expect(count('clap')).toBeGreaterThanOrEqual(2);
    expect(count('kick')).toBeGreaterThanOrEqual(4);

    down(beatBtn(ctx, 'stop'));
    expect(beatBtn(ctx, 'stop').classList.contains('active')).toBe(true);
    expect(beatBtn(ctx, 'nhay').classList.contains('active')).toBe(false);
    expect(root(ctx).classList.contains('jam-playing')).toBe(false);
    expect(root(ctx).classList.contains('jam-onbeat')).toBe(false);
    const d = drum.mock.calls.length;
    const n = note.mock.calls.length;
    vi.advanceTimersByTime(steps(STEPS * 2));
    expect(drum.mock.calls.length).toBe(d);
    expect(note.mock.calls.length).toBe(n);
    ctx.cleanup();
  });

  it('⏺ counts in 1·2·3·4 on the wood block, records one bar, then loops it under the pads', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const jingle = vi.spyOn(ctx.audio, 'jingle');
    game.start(ctx);
    const rec = recBtn(ctx);
    const countEl = q(ctx, '.jam-count');
    down(rec);
    expect(rec.classList.contains('jam-armed')).toBe(true);
    expect(rec.getAttribute('aria-pressed')).toBe('true');
    expect(root(ctx).classList.contains('jam-playing')).toBe(true);
    expect(drum).not.toHaveBeenCalled();

    // Step 0: "1" and a wood block. Then 2, 3, 4 on each quarter note.
    vi.advanceTimersByTime(steps(1));
    expect(drum).toHaveBeenCalledTimes(1);
    expect(drum).toHaveBeenLastCalledWith('wood');
    expect(countEl.hidden).toBe(false);
    expect(countEl.textContent).toBe('1');
    vi.advanceTimersByTime(steps(4));
    expect(countEl.textContent).toBe('2');
    vi.advanceTimersByTime(steps(8));
    expect(countEl.textContent).toBe('4');
    expect(drum).toHaveBeenCalledTimes(COUNT_IN_BEATS);
    expect(drum.mock.calls.every((c) => c[0] === 'wood')).toBe(true);
    expect(rec.classList.contains('jam-recording')).toBe(false);

    // The next bar records: the overlay goes, ⏺ pulses red.
    vi.advanceTimersByTime(steps(4));
    expect(rec.classList.contains('jam-recording')).toBe(true);
    expect(rec.classList.contains('jam-armed')).toBe(false);
    expect(countEl.hidden).toBe(true);
    expect(drum).toHaveBeenCalledTimes(COUNT_IN_BEATS);

    // Kick on step 2, cowbell on step 7: both sound live while recording.
    vi.advanceTimersByTime(steps(2));
    down(pad(ctx, 0));
    expect(drum).toHaveBeenLastCalledWith('kick');
    vi.advanceTimersByTime(steps(5));
    down(pad(ctx, 5));
    expect(drum).toHaveBeenLastCalledWith('cowbell');
    expect(layerDots(ctx).length).toBe(0);
    expect(ctx.stars).toBe(0);

    // End of the bar: one layer, one star, the loop keeps the clock alive.
    vi.advanceTimersByTime(steps(9));
    expect(rec.classList.contains('jam-recording')).toBe(false);
    expect(rec.getAttribute('aria-pressed')).toBe('false');
    expect(layerDots(ctx).length).toBe(1);
    expect(layerDots(ctx)[0]!.textContent).toBe('🥁');
    expect(layerDots(ctx)[0]!.classList.contains('muted')).toBe(false);
    expect(ctx.stars).toBe(1);
    expect(jingle).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.jam-star').length).toBe(1);
    expect(root(ctx).classList.contains('jam-playing')).toBe(true);

    // Next bar: the two sounds come back at their steps, and the pads glow as they do.
    drum.mockClear();
    vi.advanceTimersByTime(steps(1)); // step 1
    expect(drum).not.toHaveBeenCalled();
    vi.advanceTimersByTime(steps(1)); // step 2
    expect(drum).toHaveBeenCalledTimes(1);
    expect(drum).toHaveBeenLastCalledWith('kick');
    expect(pad(ctx, 0).classList.contains('jam-echo')).toBe(true);
    vi.advanceTimersByTime(steps(4)); // step 6
    expect(drum).toHaveBeenCalledTimes(1);
    expect(pad(ctx, 0).classList.contains('jam-echo')).toBe(false);
    vi.advanceTimersByTime(steps(1)); // step 7
    expect(drum).toHaveBeenCalledTimes(2);
    expect(drum).toHaveBeenLastCalledWith('cowbell');
    expect(pad(ctx, 5).classList.contains('jam-echo')).toBe(true);
    vi.advanceTimersByTime(steps(STEPS)); // one more bar
    expect(drum).toHaveBeenCalledTimes(4);
    // One star for the first loop only.
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('a loop of notes keeps the voice it was recorded with, even after the voice changes', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    down(kitBtn(ctx, 'notes'));
    down(q(ctx, '.jam-voice')); // xylo
    armAndCountIn(ctx);
    vi.advanceTimersByTime(steps(4));
    down(pad(ctx, 2)); // E4 on step 4
    vi.advanceTimersByTime(steps(12));
    expect(layerDots(ctx).length).toBe(1);
    expect(layerDots(ctx)[0]!.textContent).toBe('🎹');
    // Switch the live voice to bell and the kit to drums: the loop still rings xylo.
    down(q(ctx, '.jam-voice'));
    down(kitBtn(ctx, 'drums'));
    note.mockClear();
    vi.advanceTimersByTime(steps(STEPS));
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(noteFreq('E4'), 0.5, 'xylo');
    ctx.cleanup();
  });

  it('a mute dot silences its layer and brings it back; an empty bar adds nothing', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    armAndCountIn(ctx);
    vi.advanceTimersByTime(steps(3));
    down(pad(ctx, 1)); // snare on step 3
    vi.advanceTimersByTime(steps(13));
    expect(layerDots(ctx).length).toBe(1);
    drum.mockClear();
    vi.advanceTimersByTime(steps(STEPS));
    expect(drum).toHaveBeenCalledTimes(1);
    expect(drum).toHaveBeenLastCalledWith('snare');

    down(layerDots(ctx)[0]!);
    expect(layerDots(ctx)[0]!.classList.contains('muted')).toBe(true);
    expect(layerDots(ctx)[0]!.getAttribute('aria-pressed')).toBe('false');
    drum.mockClear();
    vi.advanceTimersByTime(steps(STEPS * 2));
    expect(drum).not.toHaveBeenCalled();
    // The clock keeps running so un-muting lands back in time.
    expect(root(ctx).classList.contains('jam-playing')).toBe(true);
    down(layerDots(ctx)[0]!);
    expect(layerDots(ctx)[0]!.classList.contains('muted')).toBe(false);
    vi.advanceTimersByTime(steps(STEPS));
    expect(drum).toHaveBeenCalledTimes(1);

    // Recording a bar without touching anything adds no layer and makes no fuss.
    const stars = ctx.stars;
    down(recBtn(ctx));
    for (let i = 0; i < STEPS * 3; i++) vi.advanceTimersByTime(steps(1));
    expect(recBtn(ctx).classList.contains('jam-recording')).toBe(false);
    expect(recBtn(ctx).classList.contains('jam-armed')).toBe(false);
    expect(layerDots(ctx).length).toBe(1);
    expect(ctx.stars).toBe(stars);
    ctx.cleanup();
  });

  it('tapping ⏺ during the count-in or the bar cancels; the clock stops when nothing else plays', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    down(recBtn(ctx));
    vi.advanceTimersByTime(steps(5));
    expect(q(ctx, '.jam-count').hidden).toBe(false);
    down(recBtn(ctx));
    expect(recBtn(ctx).classList.contains('jam-armed')).toBe(false);
    expect(q(ctx, '.jam-count').hidden).toBe(true);
    expect(root(ctx).classList.contains('jam-playing')).toBe(false);
    const woods = drum.mock.calls.length;
    vi.advanceTimersByTime(steps(STEPS));
    expect(drum.mock.calls.length).toBe(woods);

    // Cancel mid-bar: the hits so far are thrown away.
    armAndCountIn(ctx);
    vi.advanceTimersByTime(steps(2));
    down(pad(ctx, 0));
    down(recBtn(ctx));
    expect(recBtn(ctx).classList.contains('jam-recording')).toBe(false);
    expect(root(ctx).classList.contains('jam-playing')).toBe(false);
    vi.advanceTimersByTime(steps(STEPS * 2));
    expect(layerDots(ctx).length).toBe(0);
    ctx.cleanup();
  });

  it('recording over a beat keeps the loop in time with it; four layers fill ⏺', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const fx = vi.spyOn(ctx.audio, 'fx');
    const boing = vi.spyOn(ctx.audio, 'boing');
    game.start(ctx);
    down(beatBtn(ctx, 'ru'));
    down(kitBtn(ctx, 'animals'));
    vi.advanceTimersByTime(steps(6, 88)); // somewhere inside the bar
    down(recBtn(ctx));
    // Count-in starts on the next quarter note and the bar on the one after "4".
    for (let i = 0; i < STEPS * 2 && !recBtn(ctx).classList.contains('jam-recording'); i++) vi.advanceTimersByTime(steps(1, 88));
    expect(recBtn(ctx).classList.contains('jam-recording')).toBe(true);
    vi.advanceTimersByTime(steps(2, 88));
    down(pad(ctx, 0)); // meow
    for (let i = 0; i < STEPS + 2 && recBtn(ctx).classList.contains('jam-recording'); i++) vi.advanceTimersByTime(steps(1, 88));
    expect(layerDots(ctx).length).toBe(1);
    expect(layerDots(ctx)[0]!.textContent).toBe('🐾');
    fx.mockClear();
    vi.advanceTimersByTime(steps(STEPS, 88));
    expect(fx).toHaveBeenCalledTimes(1);
    expect(fx).toHaveBeenLastCalledWith('meow');

    for (let i = 1; i < MAX_LAYERS; i++) recordLayer(ctx, i, 88);
    expect(layerDots(ctx).length).toBe(MAX_LAYERS);
    expect(recBtn(ctx).classList.contains('jam-full')).toBe(true);
    expect(recBtn(ctx).getAttribute('aria-disabled')).toBe('true');
    down(recBtn(ctx));
    expect(boing).toHaveBeenCalledTimes(1);
    expect(recBtn(ctx).classList.contains('jam-armed')).toBe(false);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('holding ✖ for 700 ms clears every layer; a short press does not', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    armAndCountIn(ctx);
    down(pad(ctx, 0));
    vi.advanceTimersByTime(steps(STEPS));
    recordLayer(ctx, 1);
    expect(layerDots(ctx).length).toBe(2);
    const clear = q(ctx, '.jam-clear');

    clear.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(300);
    clear.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(layerDots(ctx).length).toBe(2);

    clear.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(clear.querySelector('.hold-ring')).not.toBeNull();
    vi.advanceTimersByTime(650);
    expect(layerDots(ctx).length).toBe(2);
    vi.advanceTimersByTime(60);
    expect(layerDots(ctx).length).toBe(0);
    expect(clear.querySelector('.hold-ring')).toBeNull();
    expect(recBtn(ctx).classList.contains('jam-full')).toBe(false);
    expect(root(ctx).classList.contains('jam-playing')).toBe(false);
    drum.mockClear();
    vi.advanceTimersByTime(steps(STEPS * 2));
    expect(drum).not.toHaveBeenCalled();
    ctx.cleanup();
  });

  it('the tempo button cycles 🙂 → 🐇 → 🐢 and re-times the running clock', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    down(beatBtn(ctx, 'vui'));
    const tempo = q(ctx, '.jam-tempo');
    const WINDOW = 8000;
    const hitsIn = (ms: number) => {
      const before = drum.mock.calls.length;
      vi.advanceTimersByTime(ms);
      return drum.mock.calls.length - before;
    };
    const normal = hitsIn(WINDOW);

    down(tempo);
    expect(tempo.textContent).toBe('🐇');
    expect(root(ctx).style.getPropertyValue('--jam-beat')).toBe(`${stepMs(BPM, TEMPO_FACTORS[2]!) * 4}ms`);
    const fast = hitsIn(WINDOW);
    expect(fast).toBeGreaterThan(normal);

    down(tempo);
    expect(tempo.textContent).toBe('🐢');
    expect(root(ctx).style.getPropertyValue('--jam-beat')).toBe(`${stepMs(BPM, TEMPO_FACTORS[0]!) * 4}ms`);
    const slow = hitsIn(WINDOW);
    expect(slow).toBeLessThan(normal);

    down(tempo);
    expect(tempo.textContent).toBe('🙂');
    // Still the same beat, only its speed changed.
    expect(new Set(drum.mock.calls.map((c) => c[0]))).toEqual(new Set(['kick', 'snare', 'hat']));
    ctx.cleanup();
  });

  it('awards a star every 100 pad hits', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const jingle = vi.spyOn(ctx.audio, 'jingle');
    game.start(ctx);
    for (let i = 0; i < 99; i++) down(pad(ctx, i % 12));
    expect(ctx.stars).toBe(0);
    down(pad(ctx, 0));
    expect(ctx.stars).toBe(1);
    expect(jingle).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.jam-star').length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(ctx.stage.querySelectorAll('.jam-star').length).toBe(0);
    for (let i = 0; i < 100; i++) down(pad(ctx, 3));
    expect(ctx.stars).toBe(2);
    ctx.cleanup();
  });

  it('idle hint wiggles ⏺ before the first loop and a pad afterwards; nothing is spoken', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(6100);
    expect(recBtn(ctx).classList.contains('jam-nudge')).toBe(true);
    expect(ctx.stage.querySelectorAll('.jam-pad-emoji.jam-nudge').length).toBe(0);

    armAndCountIn(ctx);
    down(pad(ctx, 4));
    vi.advanceTimersByTime(steps(STEPS));
    expect(layerDots(ctx).length).toBe(1);
    ctx.hint.touch();
    vi.advanceTimersByTime(6100);
    expect(ctx.stage.querySelectorAll('.jam-pad-emoji.jam-nudge').length).toBe(1);
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('cleanup stops the clock and leaves no timers behind', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    down(beatBtn(ctx, 'nhay'));
    armAndCountIn(ctx);
    down(pad(ctx, 0));
    vi.advanceTimersByTime(steps(3, 128));
    const d = drum.mock.calls.length;
    const n = note.mock.calls.length;
    expect(d).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(0);
    expect(() => ctx.cleanup()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(steps(STEPS * 4));
    expect(drum.mock.calls.length).toBe(d);
    expect(note.mock.calls.length).toBe(n);
    expect(ctx.stars).toBe(0);
    // Pointer listeners are gone: moving a finger plays nothing.
    window.dispatchEvent(ptr('pointermove', 50, 50));
    expect(drum.mock.calls.length).toBe(d);
  });
});
