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
