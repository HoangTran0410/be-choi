import { describe, it, expect, vi } from 'vitest';
import { showPhotoPicker } from './photoPicker';

describe('showPhotoPicker', () => {
  it('renders tiles, picks one, and closes', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onPick = vi.fn();
    showPhotoPicker(
      host,
      [
        { id: 'p1', url: 'data:x', label: 'Ảnh 1' },
        { id: 'emoji', emoji: '🐣', label: 'Tranh emoji' },
      ],
      onPick,
    );
    expect(host.querySelectorAll('.pp-tile').length).toBe(2);
    expect(host.querySelector('.pp-photo')?.getAttribute('style')).toContain('data:x');
    host.querySelector<HTMLElement>('.pp-tile[data-id="emoji"]')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'emoji' }));
    expect(host.querySelector('.pp-overlay')).toBeNull();
  });
  it('reads a drag down the panel as a scroll, not as picking whatever it ended on', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onPick = vi.fn();
    showPhotoPicker(host, [{ id: 'a', emoji: '🐻', label: 'Gấu' }], onPick);
    const tile = host.querySelector<HTMLElement>('.pp-tile[data-id="a"]')!;
    const at = (type: string, y: number) =>
      tile.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { clientX: 40, clientY: y }));

    // A panel of stickers taller than the screen is scrolled by dragging it, and
    // the finger has to come off on some tile. That is not a choice.
    at('pointerdown', 300);
    at('pointerup', 60);
    expect(onPick).not.toHaveBeenCalled();
    expect(host.querySelector('.pp-overlay')).not.toBeNull();

    // A tap that stays put still picks.
    at('pointerdown', 300);
    at('pointerup', 302);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('dismisses with null on close and only fires once', () => {
    const host = document.createElement('div');
    const onPick = vi.fn();
    const close = showPhotoPicker(host, [{ id: 'a', emoji: '⬜', label: 'Không' }], onPick);
    host.querySelector<HTMLElement>('.pp-close')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
    close();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
