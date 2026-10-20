import { h, replay } from '../../core/dom';
import type { AudioEngine } from '../../core/audio';
import { openPanel, onTile, type Panel } from './panel';
import type { HabitatSave } from './save';
import { WORLDS, type WorldId } from './worlds';

export interface WorldPickerDeps {
  host: HTMLElement;
  save: HabitatSave;
  current: WorldId;
  audio: AudioEngine;
  speak(text: string, opts?: { rate?: number }): void;
  onPick(id: WorldId): void;
}

/** One big picture per world; the ones still waiting for stars are dark with the stars they need. */
export function openWorlds(deps: WorldPickerDeps): Panel {
  const { save, audio, speak } = deps;
  const opened = Date.now();
  let panel: Panel | null = null;
  const grid = h('div', { class: 'hb-world-grid' });
  for (const world of WORLDS) {
    const open = save.worlds.includes(world.id);
    const need = Math.max(0, world.stars - save.stars);
    const tile = h(
      'button',
      {
        class: `hb-world${open ? '' : ' hb-locked'}${world.id === deps.current ? ' hb-here' : ''}`,
        type: 'button',
        'aria-label': open ? world.name : `${world.name}, còn ${need} sao`,
        'data-world': world.id,
        style: `--world:${world.color}`,
      },
      h('span', { class: 'hb-world-icon', 'aria-hidden': 'true' }, world.icon),
      open ? null : h('span', { class: 'hb-world-need', 'aria-hidden': 'true' }, '⭐'.repeat(Math.min(5, need))),
    );
    onTile(tile, opened, () => {
      if (!open) {
        audio.boing();
        replay(tile, 'anim-wiggle');
        speak('Làm nhiệm vụ để có sao, rồi mình sang đó chơi nhé!', { rate: 0.7 });
        return;
      }
      panel?.close();
      deps.onPick(world.id);
    });
    grid.append(tile);
  }
  panel = openPanel(deps.host, 'hb-world-overlay', grid);
  audio.tick();
  return panel;
}
