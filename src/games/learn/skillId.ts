import { SAFETY_IDS } from './packs';

const DOMAIN: Record<string, string> = {
  L: 'letter',
  N: 'num',
  C: 'color',
  S: 'shape',
  Z: 'size',
  A: 'animal',
  H: 'shadow',
  P: 'pattern',
  K: 'sort',
  F: 'family',
  T: 'tone',
  O: 'opposite',
  D: 'time',
  R: 'side',
  M: 'math',
};

/** This game's concept id (`N:5`) → the shared skill store's id (`num:5`). Same-named games share ids. */
export function skillId(concept: string): string {
  const i = concept.indexOf(':');
  if (i < 0) return `learn:${concept}`;
  const prefix = concept.slice(0, i);
  const rest = concept.slice(i + 1);
  if (prefix === 'S' && SAFETY_IDS.includes(concept)) return `safety:${rest}`;
  return `${DOMAIN[prefix] ?? 'learn'}:${rest}`;
}
