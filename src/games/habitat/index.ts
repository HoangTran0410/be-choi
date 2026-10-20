import type { GameContext, GameModule } from '../../core/types';
import { createGame } from './game';
import { meta } from './meta';
import './style.css';

/**
 * Thế giới nhỏ của bé: Bể cá, Bể cạn and Câu cá folded into one game with one
 * book of friends. See game.ts for how the pieces fit.
 */
function start(ctx: GameContext): void {
  createGame(ctx);
}

const game: GameModule = { ...meta, start };
export default game;
