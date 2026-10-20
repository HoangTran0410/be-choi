import type { GameModule } from '../../core/types';
import { meta } from './meta';
import { runDay } from './scene';
import './style.css';

const game: GameModule = { ...meta, start: runDay };
export default game;
