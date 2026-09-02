import type { GameModule } from '../../core/types';
import { meta } from './meta';

const game: GameModule = {
  ...meta,
  start(ctx) {
    const el = document.createElement('div');
    el.className = 'emoji';
    el.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center';
    el.textContent = meta.icon;
    ctx.stage.append(el);
  },
};

export default game;
