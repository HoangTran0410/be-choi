import { describe, it, expect, vi } from 'vitest';
import { hitTest, makeDraggable } from './drag';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

const r = (left: number, top: number, w = 100, h = 100) => ({ left, top, width: w, height: h });

describe('hitTest', () => {
  it('finds rect containing point, honours tolerance, returns null otherwise', () => {
    const t = [
      { id: 'a', rect: r(0, 0) },
      { id: 'b', rect: r(200, 0) },
    ];
    expect(hitTest({ x: 50, y: 50 }, t)).toBe('a');
    expect(hitTest({ x: 250, y: 20 }, t)).toBe('b');
    expect(hitTest({ x: 150, y: 50 }, t)).toBeNull();
    expect(hitTest({ x: 110, y: 50 }, t, 20)).toBe('a');
    expect(hitTest({ x: 50, y: 50 }, [])).toBeNull();
  });
});

describe('makeDraggable', () => {
  function ptr(type: string, x: number, y: number) {
    return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true });
  }
  it('moves with pointer, calls onDrop, springs back on false', () => {
    const el = document.createElement('div');
    document.body.append(el);
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
    const onDrop = vi.fn(() => false);
    const dispose = makeDraggable(el, { onDrop });
    el.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(el.classList.contains('dragging')).toBe(true);
    el.dispatchEvent(ptr('pointermove', 40, 60));
    expect(el.style.transform).toBe('translate(30px, 50px)');
    el.dispatchEvent(ptr('pointerup', 40, 60));
    expect(onDrop).toHaveBeenCalledWith(el, { x: 40, y: 60 });
    expect(el.classList.contains('dragging')).toBe(false);
    expect(el.classList.contains('spring-back')).toBe(true);
    expect(el.style.transform).toBe('translate(0px, 0px)');
    dispose();
    el.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(el.classList.contains('dragging')).toBe(false);
  });
  it('keeps the offset when onDrop accepts', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
    makeDraggable(el, { onDrop: () => true });
    el.dispatchEvent(ptr('pointerdown', 0, 0));
    el.dispatchEvent(ptr('pointermove', 5, 5));
    el.dispatchEvent(ptr('pointerup', 5, 5));
    await Promise.resolve();
    expect(el.style.transform).toBe('translate(5px, 5px)');
    expect(el.classList.contains('spring-back')).toBe(false);
  });
});
