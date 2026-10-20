import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { startWorkshop } from './workshop';
import './style.css';

function start(ctx: GameContext): void {
  startWorkshop(ctx);
}

const game: GameModule = { ...meta, start };
export default game;
