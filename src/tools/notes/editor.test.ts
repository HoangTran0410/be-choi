import { describe, it, expect, afterEach } from 'vitest';
import { SONGS } from '../../core/music';
import { fakeAudio } from '../../core/testing';
import { draftKey } from './logic';
import { mountEditor } from './editor';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
    }
  };
}

const first = SONGS[0];
if (!first) throw new Error('SONGS is empty');

function mount(): { root: HTMLElement; unmount: () => void } {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, unmount: mountEditor(root, fakeAudio()) };
}

function press(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

/** Tap a note block, the way a pointer does: down on it, then up anywhere. */
function tapNote(root: HTMLElement, index: number): void {
  const el = root.querySelector(`.ne-note[data-i="${index}"]`);
  if (!el) throw new Error(`no note ${index}`);
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}

function selectedName(root: HTMLElement): string {
  return root.querySelector('.ne-note.sel .ne-note-name')?.textContent ?? '';
}

function btn(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

describe('notes editor', () => {
  afterEach(() => {
    for (const song of SONGS) localStorage.removeItem(draftKey(song.id));
    document.body.replaceChildren();
  });

  it('draws the songbook, the melody and the lyric lines of the first song', () => {
    const { root, unmount } = mount();
    expect(root.querySelectorAll('.ne-song')).toHaveLength(SONGS.length);
    expect(root.querySelector('.ne-song.on')?.getAttribute('data-id')).toBe(first.id);
    expect(root.querySelectorAll('.ne-note')).toHaveLength(first.notes.length);
    expect(root.querySelectorAll('.ne-band')).toHaveLength(first.lyrics?.length ?? 0);
    expect(root.querySelector('.ne-title')?.textContent).toContain(first.title);
    unmount();
    expect(root.children).toHaveLength(0);
  });

  it('puts each note on the row of its letter, at its place in the bar', () => {
    const { root, unmount } = mount();
    const el = root.querySelector<HTMLElement>('.ne-note[data-i="1"]');
    const row = el?.parentElement;
    const name = first.notes[1]?.n ?? '';
    expect(el?.querySelector('.ne-note-name')?.textContent).toBe(name);
    // The second note starts one beat in, so 46px along, and its row is the one under its letter.
    expect(el?.style.left).toBe('46px');
    expect(row?.className).toContain('ne-row');
    unmount();
  });

  it('selects a note when it is tapped, and walks the melody with the arrow keys', () => {
    const { root, unmount } = mount();
    tapNote(root, 2);
    expect(selectedName(root)).toBe(first.notes[2]?.n);
    press('ArrowRight');
    expect(selectedName(root)).toBe(first.notes[3]?.n);
    press('ArrowLeft');
    expect(selectedName(root)).toBe(first.notes[2]?.n);
    unmount();
  });

  it('moves a note up the scale, saves the draft, and takes it back on undo', () => {
    const { root, unmount } = mount();
    tapNote(root, 0);
    expect(selectedName(root)).toBe('C4');
    press('ArrowUp');
    expect(selectedName(root)).toBe('D4');
    expect(localStorage.getItem(draftKey(first.id))).toContain('D4');
    press('z', { metaKey: true });
    expect(selectedName(root)).toBe('C4');
    press('z', { metaKey: true, shiftKey: true });
    expect(selectedName(root)).toBe('D4');
    unmount();
  });

  it('stretches a note with ] and shows the lyric line it now spills over', () => {
    const { root, unmount } = mount();
    tapNote(root, 0);
    const before = root.querySelector<HTMLElement>('.ne-note[data-i="0"]')?.style.width;
    // 1 → 1.5 beats, which pushes every note after it half a beat off the lyric lines.
    press(']');
    const after = root.querySelector<HTMLElement>('.ne-note[data-i="0"]')?.style.width;
    expect(parseFloat(after ?? '0')).toBeGreaterThan(parseFloat(before ?? '0'));
    expect(root.querySelectorAll('.ne-band.bad').length).toBeGreaterThan(0);
    expect(root.querySelector('.ne-check')?.className).toContain('warn');
    unmount();
  });

  it('plays from the selected note, and ⏮ takes it back to the top', () => {
    const { root, unmount } = mount();
    const play = root.querySelector<HTMLButtonElement>('.ne-play');
    if (!play) throw new Error('no play button');

    tapNote(root, 4);
    play.click();
    expect(root.querySelector('.ne-note.now')?.getAttribute('data-i')).toBe('4');
    expect(play.textContent).toBe('⏸');
    play.click();
    expect(root.querySelector('.ne-note.now')).toBeNull();
    expect(play.textContent).toBe('▶');

    btn(root, '⏮').click();
    play.click();
    expect(root.querySelector('.ne-note.now')?.getAttribute('data-i')).toBe('0');
    play.click();
    unmount();
  });

  it('adds and removes notes', () => {
    const { root, unmount } = mount();
    const start = first.notes.length;
    tapNote(root, 0);
    press('a');
    expect(root.querySelectorAll('.ne-note')).toHaveLength(start + 1);
    expect(selectedName(root)).toBe('C4');
    press('Backspace');
    expect(root.querySelectorAll('.ne-note')).toHaveLength(start);
    unmount();
  });

  it('turns a note into a rest and back', () => {
    const { root, unmount } = mount();
    tapNote(root, 0);
    press('r');
    expect(root.querySelector('.ne-note.is-rest')?.parentElement?.className).toContain('rest');
    press('r');
    expect(root.querySelector('.ne-note.is-rest')).toBeNull();
    unmount();
  });

  it('reopens a song on the saved draft, and ↺ throws the draft away', () => {
    const one = mount();
    tapNote(one.root, 0);
    press('ArrowUp');
    one.unmount();

    const two = mount();
    expect(selectedName(two.root)).toBe('D4');
    btn(two.root, '↺').click();
    expect(localStorage.getItem(draftKey(first.id))).toBeNull();
    expect(two.root.querySelector('.ne-note[data-i="0"] .ne-note-name')?.textContent).toBe(first.notes[0]?.n);
    two.unmount();
  });

  it('switches songs', () => {
    const { root, unmount } = mount();
    const other = SONGS[7];
    if (!other) throw new Error('need a second song');
    root.querySelector<HTMLElement>(`.ne-song[data-id="${other.id}"]`)?.click();
    expect(root.querySelector('.ne-title')?.textContent).toContain(other.title);
    expect(root.querySelectorAll('.ne-note')).toHaveLength(other.notes.length);
    unmount();
  });

  it('copies the seq() source, in the quote style asked for', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
    });
    const { root, unmount } = mount();
    // Both buttons rewrite their own label, so hold on to the elements.
    const copyBtn = btn(root, '📋');
    const quoteBtn = btn(root, '" "');
    copyBtn.click();
    await Promise.resolve();
    expect(written[0]).toContain('notes: seq(');
    expect(written[0]).toContain('"');

    quoteBtn.click();
    copyBtn.click();
    await Promise.resolve();
    expect(written[1]).toContain("'");
    expect(written[1]).not.toContain('"');
    unmount();
    delete (navigator as { clipboard?: unknown }).clipboard;
  });
});
