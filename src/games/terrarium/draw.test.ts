import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { bellyEdge, bellySign, tangentOf } from './draw';
import { Creature, SPECIES, footDir, makeVivarium, speciesById, type Surface } from './logic';

const viv = makeVivarium(520, 820);

/**
 * An animal posed exactly where the test says, with no frame of simulation to
 * move it off that pose again — `replant` is what lays the spine out straight
 * along a heading.
 */
function make(id: string, heading: number, surface: Surface = 'ground'): Creature {
  const species = speciesById(id);
  if (!species) throw new Error(`no species ${id}`);
  const cr = new Creature(species, viv, mulberry32(4));
  cr.surface = surface;
  cr.heading = heading;
  const n = footDir(surface);
  cr.spine.replant(cr.x - n.x * cr.stand, cr.y - n.y * cr.stand, heading);
  return cr;
}

describe('which way up an animal is drawn', () => {
  /**
   * The bug this pins down: the belly used to be chosen by measuring each flank
   * from the animal's *feet*. Every animal here is narrower than its legs are
   * long, so both flanks came out on the same side of the ground line and the
   * answer fell to whichever flank happened to be computed first — which flips
   * with the facing. A chameleon walking right was drawn belly-up.
   */
  it('puts the belly on the ground side whichever way the animal faces', () => {
    for (const species of SPECIES) {
      if (species.kind === 'flyer') continue;
      for (const [facing, heading] of [
        ['right', 0],
        ['left', Math.PI],
      ] as const) {
        const cr = make(species.id, heading);
        for (const joint of [0, 2, 4]) {
          const spine = cr.spine.joints[joint]!;
          const belly = bellyEdge(cr, joint);
          expect(belly.y, `${species.id} facing ${facing}, vertebra ${joint}`).toBeGreaterThan(spine.y);
        }
      }
    }
  });

  it('turns the belly with the surface, so a climber hangs the right way up', () => {
    for (const [surface, heading] of [
      ['ceiling', 0],
      ['ceiling', Math.PI],
      ['left', -Math.PI / 2],
      ['left', Math.PI / 2],
      ['right', -Math.PI / 2],
      ['right', Math.PI / 2],
    ] as const) {
      const cr = make('gecko', heading, surface);
      const spine = cr.spine.joints[2]!;
      const belly = bellyEdge(cr, 2);
      const n = footDir(surface);
      // The belly is on the side of the spine the feet are on, whatever that is:
      // under the lid that is upwards, and against a pane it is sideways.
      const towards = (belly.x - spine.x) * n.x + (belly.y - spine.y) * n.y;
      expect(towards, `${surface} facing ${heading}`).toBeGreaterThan(0);
    }
  });

  it('agrees with itself: the sign and the point it picks are the same flank', () => {
    const cr = make('lizard', 0);
    const sign = bellySign(cr, 2);
    const angle = cr.spine.angles[2]! + Math.PI / 2;
    const w = cr.spine.widthAt(2);
    const spine = cr.spine.joints[2]!;
    const belly = bellyEdge(cr, 2);
    expect(belly.x).toBeCloseTo(spine.x + Math.cos(angle) * w * sign, 6);
    expect(belly.y).toBeCloseTo(spine.y + Math.sin(angle) * w * sign, 6);
  });

  it('runs along the ground and the lid, and up the panes', () => {
    expect(tangentOf('ground')).toEqual({ x: 1, y: 0 });
    expect(tangentOf('ceiling')).toEqual({ x: 1, y: 0 });
    expect(tangentOf('left')).toEqual({ x: 0, y: 1 });
    expect(tangentOf('right')).toEqual({ x: 0, y: 1 });
  });
});
