import { arc, circle, discFill, line, p, type Picture } from './shapes';

/**
 * The pictures a child can draw, in the order they come round. Strokes are what the finger
 * follows, fills are the colour that appears when the picture is done. Unit square, y down.
 */
export const PICTURES: readonly Picture[] = [
  {
    id: 'sun',
    name: 'ông mặt trời',
    icon: '☀️',
    bg: '#e0f2fe',
    strokes: [
      { segs: circle(0.5, 0.5, 0.2), color: '#f59e0b' },
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return {
          segs: line(p(0.5 + 0.28 * Math.cos(a), 0.5 + 0.28 * Math.sin(a)), p(0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a))),
          color: '#f59e0b',
        };
      }),
      { segs: arc(0.5, 0.52, 0.1, Math.PI * 0.2, Math.PI * 0.8), color: '#b45309' },
    ],
    fills: [discFill(0.5, 0.5, 0.2, '#fde047')],
  },
];
