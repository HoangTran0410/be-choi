import { describe, expect, it } from 'vitest';
import { skillId } from './skillId';
import { planStation } from './questions';
import { recordAnswer } from './picker';
import { mulberry32 } from '../../core/dom';

describe('skillId', () => {
  it('maps learn concepts to shared ids', () => {
    expect(skillId('N:15')).toBe('num:15');
    expect(skillId('C:red')).toBe('color:red');
    expect(skillId('S:circle')).toBe('shape:circle');
    expect(skillId('S:danger')).toBe('safety:danger');
    expect(skillId('M:add')).toBe('math:add');
    expect(skillId('odd')).toBe('learn:odd');
  });
});

describe('day-based review', () => {
  it('puts due concepts into a station first', () => {
    let m = {};
    m = recordAnswer(m, 'C:red', true, 1);
    m = recordAnswer(m, 'C:blue', true, 2);
    const env = { people: [] } as never;
    const plan = planStation('colors' as never, m, 3, env, mulberry32(1), (id) => id === 'C:blue');
    const firstChoose = plan.find((s) => s.kind !== 'drag');
    expect(firstChoose?.concepts).toEqual(['C:blue']);
  });
});
