/**
 * What can be put in the world: furniture the child has opened (the rest shown
 * dark, waiting), and the three things to do with the family's photos — hang one
 * like a picture on the glass, put one behind the world, or invite the people in
 * a photo to come and look.
 */
import { h, replay } from '../../core/dom';
import type { AudioEngine } from '../../core/audio';
import { DECOR_BY_REALM, DECOR_EMOJI, type DecorId } from './decor';
import { openPanel, onTile, type Panel } from './panel';
import type { HabitatSave } from './save';
import type { Realm } from './worlds';

export type PhotoAction = 'frame' | 'backdrop' | 'visitors' | 'clear';

export interface DecorDeps {
  host: HTMLElement;
  save: HabitatSave;
  realm: Realm;
  audio: AudioEngine;
  speak(text: string, opts?: { rate?: number }): void;
  /** Are there family photos at all? */
  hasPhotos: boolean;
  onDecor(id: DecorId): void;
  onPhoto(action: PhotoAction): void;
}

const PHOTO_TOOLS: { action: PhotoAction; icon: string; label: string }[] = [
  { action: 'frame', icon: '🖼️', label: 'treo ảnh' },
  { action: 'backdrop', icon: '🏞️', label: 'ảnh nền' },
  { action: 'visitors', icon: '👨‍👩‍👧', label: 'khách đến xem' },
];

export function openDecor(deps: DecorDeps): Panel {
  const { save, realm, audio, speak } = deps;
  const opened = Date.now();
  let panel: Panel | null = null;
  const grid = h('div', { class: 'hb-decor-grid' });

  for (const id of DECOR_BY_REALM[realm]) {
    const open = save.decor.includes(id);
    const tile = h(
      'button',
      { class: `hb-tile hb-decor${open ? '' : ' hb-locked'}`, type: 'button', 'aria-label': open ? id : 'chưa mở', 'data-decor': id },
      h('span', { class: 'hb-emoji', 'aria-hidden': 'true' }, DECOR_EMOJI[id]),
      open ? null : h('span', { class: 'hb-q', 'aria-hidden': 'true' }, '🔒'),
    );
    onTile(tile, opened, () => {
      if (!open) {
        audio.boing();
        replay(tile, 'anim-wiggle');
        speak('Làm nhiệm vụ sao để mở món này nhé!', { rate: 0.7 });
        return;
      }
      panel?.close();
      deps.onDecor(id);
    });
    grid.append(tile);
  }

  for (const tool of PHOTO_TOOLS) {
    const tile = h(
      'button',
      { class: `hb-tile hb-decor hb-photo-tool${deps.hasPhotos ? '' : ' hb-locked'}`, type: 'button', 'aria-label': tool.label, 'data-photo': tool.action },
      h('span', { class: 'hb-emoji', 'aria-hidden': 'true' }, tool.icon),
      deps.hasPhotos ? null : h('span', { class: 'hb-q', 'aria-hidden': 'true' }, '📷'),
    );
    onTile(tile, opened, () => {
      if (!deps.hasPhotos) {
        audio.boing();
        replay(tile, 'anim-wiggle');
        speak('Nhờ ba mẹ thêm ảnh của nhà mình nhé!', { rate: 0.7 });
        return;
      }
      panel?.close();
      deps.onPhoto(tool.action);
    });
    grid.append(tile);
  }

  const sweep = h('button', { class: 'hb-tile hb-decor', type: 'button', 'aria-label': 'dọn sạch', 'data-photo': 'clear' }, h('span', { class: 'hb-emoji', 'aria-hidden': 'true' }, '🧹'));
  onTile(sweep, opened, () => {
    panel?.close();
    deps.onPhoto('clear');
  });
  grid.append(sweep);

  panel = openPanel(deps.host, 'hb-decor-overlay', grid);
  audio.tick();
  return panel;
}
