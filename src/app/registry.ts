import type { GameMeta, GameModule } from '../core/types';
import { meta as bubbles } from '../games/bubbles/meta';
import { meta as shapes } from '../games/shapes/meta';
import { meta as colors } from '../games/colors/meta';
import { meta as sizes } from '../games/sizes/meta';
import { meta as shadows } from '../games/shadows/meta';
import { meta as piano } from '../games/piano/meta';
import { meta as paint } from '../games/paint/meta';
import { meta as peekaboo } from '../games/peekaboo/meta';
import { meta as feed } from '../games/feed/meta';
import { meta as wash } from '../games/wash/meta';
import { meta as count } from '../games/count/meta';
import { meta as memory } from '../games/memory/meta';

export interface GameEntry extends GameMeta {
  /** Lazy-load the game module so the home screen stays light. */
  load: () => Promise<{ default: GameModule }>;
}

/** Every game, in home-screen order. Add a new game here after creating its folder. */
export const GAMES: readonly GameEntry[] = [
  { ...bubbles, load: () => import('../games/bubbles/index') },
  { ...shapes, load: () => import('../games/shapes/index') },
  { ...colors, load: () => import('../games/colors/index') },
  { ...sizes, load: () => import('../games/sizes/index') },
  { ...shadows, load: () => import('../games/shadows/index') },
  { ...piano, load: () => import('../games/piano/index') },
  { ...paint, load: () => import('../games/paint/index') },
  { ...peekaboo, load: () => import('../games/peekaboo/index') },
  { ...feed, load: () => import('../games/feed/index') },
  { ...wash, load: () => import('../games/wash/index') },
  { ...count, load: () => import('../games/count/index') },
  { ...memory, load: () => import('../games/memory/index') },
];

export function findGame(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
