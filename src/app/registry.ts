import type { GameMeta, GameModule } from '../core/types';
import { meta as bubbles } from '../games/bubbles/meta';
import { meta as aquarium } from '../games/aquarium/meta';
import { meta as terrarium } from '../games/terrarium/meta';
import { meta as fishing } from '../games/fishing/meta';
import { meta as garden } from '../games/garden/meta';
import { meta as farm } from '../games/farm/meta';
import { meta as drive } from '../games/drive/meta';
import { meta as shapes } from '../games/shapes/meta';
import { meta as colors } from '../games/colors/meta';
import { meta as tubes } from '../games/tubes/meta';
import { meta as sizes } from '../games/sizes/meta';
import { meta as shadows } from '../games/shadows/meta';
import { meta as sounds } from '../games/sounds/meta';
import { meta as soundbook } from '../games/soundbook/meta';
import { meta as ambience } from '../games/ambience/meta';
import { meta as videos } from '../games/videos/meta';
import { meta as piano } from '../games/piano/meta';
import { meta as jam } from '../games/jam/meta';
import { meta as sing } from '../games/sing/meta';
import { meta as parrot } from '../games/parrot/meta';
import { meta as birdsong } from '../games/birdsong/meta';
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
import { meta as bedtime } from '../games/bedtime/meta';
import { meta as firefly } from '../games/firefly/meta';
import { meta as letters } from '../games/letters/meta';
import { meta as trace } from '../games/trace/meta';
import { meta as sortout } from '../games/sortout/meta';
import { meta as feelings } from '../games/feelings/meta';
import { meta as dressup } from '../games/dressup/meta';
import { meta as mask } from '../games/mask/meta';
import { meta as robots } from '../games/robots/meta';
import { meta as habitat } from '../games/habitat/meta';
import { meta as catband } from '../games/catband/meta';
import { meta as museum } from '../games/museum/meta';
import { meta as learn } from '../games/learn/meta';
import { meta as build } from '../games/build/meta';
import { meta as brain } from '../games/brain/meta';
import { meta as harvest } from '../games/harvest/meta';
import { meta as singalong } from '../games/singalong/meta';

export interface GameEntry extends GameMeta {
  /** Lazy-load the game module so the home screen stays light. */
  load: () => Promise<{ default: GameModule }>;
}

/** Every game, in home-screen order. Add a new game here after creating its folder. */
export const GAMES: readonly GameEntry[] = [
  { ...bubbles, load: () => import('../games/bubbles/index') },
  { ...aquarium, load: () => import('../games/aquarium/index') },
  { ...terrarium, load: () => import('../games/terrarium/index') },
  { ...fishing, load: () => import('../games/fishing/index') },
  { ...garden, load: () => import('../games/garden/index') },
  { ...farm, load: () => import('../games/farm/index') },
  { ...drive, load: () => import('../games/drive/index') },
  { ...shapes, load: () => import('../games/shapes/index') },
  { ...colors, load: () => import('../games/colors/index') },
  { ...tubes, load: () => import('../games/tubes/index') },
  { ...sizes, load: () => import('../games/sizes/index') },
  { ...shadows, load: () => import('../games/shadows/index') },
  { ...sounds, load: () => import('../games/sounds/index') },
  { ...soundbook, load: () => import('../games/soundbook/index') },
  { ...ambience, load: () => import('../games/ambience/index') },
  { ...videos, load: () => import('../games/videos/index') },
  { ...jam, load: () => import('../games/jam/index') },
  { ...sing, load: () => import('../games/sing/index') },
  { ...parrot, load: () => import('../games/parrot/index') },
  { ...birdsong, load: () => import('../games/birdsong/index') },
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
  { ...bedtime, load: () => import('../games/bedtime/index') },
  { ...firefly, load: () => import('../games/firefly/index') },
  { ...letters, load: () => import('../games/letters/index') },
  { ...trace, load: () => import('../games/trace/index') },
  { ...sortout, load: () => import('../games/sortout/index') },
  { ...feelings, load: () => import('../games/feelings/index') },
  { ...dressup, load: () => import('../games/dressup/index') },
  { ...mask, load: () => import('../games/mask/index') },
  { ...robots, load: () => import('../games/robots/index') },
  { ...habitat, load: () => import('../games/habitat/index') },
  { ...catband, load: () => import('../games/catband/index') },
  { ...museum, load: () => import('../games/museum/index') },
  { ...learn, load: () => import('../games/learn/index') },
  { ...build, load: () => import('../games/build/index') },
  { ...brain, load: () => import('../games/brain/index') },
  { ...harvest, load: () => import('../games/harvest/index') },
  { ...singalong, load: () => import('../games/singalong/index') },
];

/**
 * Games folded into a newer all-in-one game. They stay playable, but the home screen lists
 * them last, so the newer games come first.
 */
export const LEGACY_IDS: ReadonlySet<string> = new Set([
  'piano',
  'xylo',
  'drums',
  'band',
  'orchestra',
  'jam',
  'simon',
  'sing',
  'parrot',
  'birdsong',
  'letters',
  'count',
  'sounds',
  'soundbook',
  'shadows',
  'colors',
  'sizes',
  'shapes',
  'sortout',
  'pattern',
  'memory',
  'tubes',
  'jigsaw',
  'blocks',
  'bricks',
  'feed',
  'wash',
  'teeth',
  'dressup',
  'bedtime',
  'feelings',
  'cooking',
  'birthday',
  'aquarium',
  'terrarium',
  'fishing',
  'farm',
  'garden',
  'paint',
  'trace',
  'bubbles',
  'peekaboo',
]);

export function isLegacy(id: string): boolean {
  return LEGACY_IDS.has(id);
}

export function findGame(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
