import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import './style.css';
import { createWorkshop } from './workshop';

/**
 * Xưởng vẽ của bé: one workshop, four ways to draw (Tập vẽ, Tô tranh, Vẽ tự do, Vẽ theo mẫu),
 * a notebook that keeps every finished picture and a sticker collection. See workshop.ts.
 */
function start(ctx: GameContext): void {
  createWorkshop(ctx);
}

const game: GameModule = { ...meta, start };
export default game;
