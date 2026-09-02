import type { GameMeta, GameModule } from '../core/types';
import { meta as bubbles } from '../games/bubbles/meta';
import { meta as aquarium } from '../games/aquarium/meta';
import { meta as shapes } from '../games/shapes/meta';
import { meta as colors } from '../games/colors/meta';
import { meta as sizes } from '../games/sizes/meta';
import { meta as shadows } from '../games/shadows/meta';
import { meta as piano } from '../games/piano/meta';
import { meta as jam } from '../games/jam/meta';
import { meta as paint } from '../games/paint/meta';
import { meta as peekaboo } from '../games/peekaboo/meta';
import { meta as feed } from '../games/feed/meta';
import { meta as wash } from '../games/wash/meta';
import { meta as count } from '../games/count/meta';
import { meta as memory } from '../games/memory/meta';
import { meta as xylo } from '../games/xylo/meta';
import { meta as drums } from '../games/drums/meta';
import { meta as band } from '../games/band/meta';
import { meta as simon } from '../games/simon/meta';
import { meta as jigsaw } from '../games/jigsaw/meta';
import { meta as blocks } from '../games/blocks/meta';
import { meta as pattern } from '../games/pattern/meta';
import { meta as orchestra } from '../games/orchestra/meta';
import { meta as bricks } from '../games/bricks/meta';
import { meta as birthday } from '../games/birthday/meta';
import { meta as cooking } from '../games/cooking/meta';
import { meta as teeth } from '../games/teeth/meta';

export interface GameEntry extends GameMeta {
  /** Lazy-load the game module so the home screen stays light. */
  load: () => Promise<{ default: GameModule }>;
}

/** Every game, in home-screen order. Add a new game here after creating its folder. */
export const GAMES: readonly GameEntry[] = [
  { ...bubbles, load: () => import('../games/bubbles/index') },
  { ...aquarium, load: () => import('../games/aquarium/index') },
  { ...shapes, load: () => import('../games/shapes/index') },
  { ...colors, load: () => import('../games/colors/index') },
  { ...sizes, load: () => import('../games/sizes/index') },
  { ...shadows, load: () => import('../games/shadows/index') },
  { ...jam, load: () => import('../games/jam/index') },
  { ...piano, load: () => import('../games/piano/index') },
  { ...paint, load: () => import('../games/paint/index') },
  { ...peekaboo, load: () => import('../games/peekaboo/index') },
  { ...feed, load: () => import('../games/feed/index') },
  { ...wash, load: () => import('../games/wash/index') },
  { ...count, load: () => import('../games/count/index') },
  { ...memory, load: () => import('../games/memory/index') },
  { ...xylo, load: () => import('../games/xylo/index') },
  { ...drums, load: () => import('../games/drums/index') },
  { ...band, load: () => import('../games/band/index') },
  { ...simon, load: () => import('../games/simon/index') },
  { ...jigsaw, load: () => import('../games/jigsaw/index') },
  { ...blocks, load: () => import('../games/blocks/index') },
  { ...pattern, load: () => import('../games/pattern/index') },
  { ...orchestra, load: () => import('../games/orchestra/index') },
  { ...bricks, load: () => import('../games/bricks/index') },
  { ...birthday, load: () => import('../games/birthday/index') },
  { ...cooking, load: () => import('../games/cooking/index') },
  { ...teeth, load: () => import('../games/teeth/index') },
];

export function findGame(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
