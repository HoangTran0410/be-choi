import type { GameContext, GameModule } from '../../core/types';
import { mountBand } from './band';
import { meta } from './meta';
import './style.css';

/**
 * Ban nhạc robot: drag robots onto the stage, one instrument each, and they all play together in
 * the same key and tempo. The pieces are in groove.ts (music), robots.ts (who plays what),
 * stage.ts / shelf.ts / art.ts (what you see), quests.ts (what unlocks) and band.ts (the wiring).
 */
function start(ctx: GameContext): void {
  mountBand(ctx);
}

const game: GameModule = { ...meta, start };
export default game;
