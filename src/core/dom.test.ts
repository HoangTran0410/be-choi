import { describe, it, expect } from 'vitest';
import { h, shuffle, pick, randInt, mulberry32, svgEl, replay } from './dom';

describe('h', () => {
  it('builds element with class, attrs, listeners, children', () => {
    let clicked = 0;
    const el = h(
      'button',
      { class: 'x', 'data-id': 'a', disabled: false, onClick: () => clicked++ },
      'hi',
      h('span', null, '!'),
      null,
      false,
    );
    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toBe('x');
    expect(el.dataset.id).toBe('a');
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.textContent).toBe('hi!');
    el.click();
    expect(clicked).toBe(1);
  });
  it('applies style strings and boolean true attrs', () => {
    const el = h('div', { style: 'color: red', hidden: true });
    expect(el.style.color).toBe('red');
    expect(el.hasAttribute('hidden')).toBe(true);
  });
});

describe('random helpers', () => {
  const rng = mulberry32(42);
  it('shuffle keeps elements and is deterministic', () => {
    const a = shuffle([1, 2, 3, 4, 5], mulberry32(1));
    const b = shuffle([1, 2, 3, 4, 5], mulberry32(1));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('pick returns n distinct', () => {
    const p = pick(['a', 'b', 'c', 'd'], 3, rng);
    expect(new Set(p).size).toBe(3);
  });
  it('pick throws when n too large', () => {
    expect(() => pick([1], 2)).toThrow();
  });
  it('randInt inclusive', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const v = randInt(2, 4, rng);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect(seen.size).toBe(3);
  });
});

describe('svgEl', () => {
  it('parses svg markup', () => {
    const el = svgEl('<svg viewBox="0 0 10 10"><circle r="1"/></svg>');
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.querySelector('circle')).not.toBeNull();
  });
});

describe('replay', () => {
  it('re-adds the class', () => {
    const el = document.createElement('div');
    el.classList.add('anim-pop');
    replay(el, 'anim-pop');
    expect(el.classList.contains('anim-pop')).toBe(true);
  });
});
