import type { AudioEngine } from './audio';
import { PRAISES } from './content';

const DURATION = 1600;
const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
}

export interface CelebrateOptions {
  praises?: readonly string[];
  /**
   * Draw the paper. Off (the parent's switch) keeps the jingle and the praise
   * and keeps the same length, so a game that waits on this before its next
   * round is paced exactly as it was — the child just is not interrupted by a
   * screenful of confetti every third minute.
   */
  confetti?: boolean;
}

/**
 * Confetti over the stage, a jingle, and a spoken praise. Resolves when the
 * confetti has finished so the game can move to the next round.
 */
export function celebrate(stage: HTMLElement, audio: AudioEngine, speak: (t: string) => void, opts: CelebrateOptions = {}): Promise<void> {
  const { praises = PRAISES, confetti = true } = opts;
  audio.jingle();
  const praise = praises[Math.floor(Math.random() * praises.length)];
  if (praise) speak(praise);

  if (!confetti) return new Promise((resolve) => setTimeout(resolve, DURATION));

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = stage.clientWidth || 1;
  const hgt = stage.clientHeight || 1;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;

  return new Promise((resolve) => {
    if (!ctx) {
      setTimeout(() => {
        canvas.remove();
        resolve();
      }, DURATION);
      return;
    }
    ctx.scale(dpr, dpr);
    const parts: Particle[] = Array.from({ length: 120 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: hgt * 0.4,
      vx: (Math.random() - 0.5) * 900,
      vy: -Math.random() * 700 - 200,
      w: 8 + Math.random() * 8,
      h: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#fff',
    }));
    const t0 = performance.now();
    let last = t0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, hgt);
      const fade = Math.max(0, 1 - (now - t0 - DURATION * 0.6) / (DURATION * 0.4));
      for (const p of parts) {
        p.vy += 1400 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (now - t0 < DURATION) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
