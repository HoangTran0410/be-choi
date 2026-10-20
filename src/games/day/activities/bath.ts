import { h, mulberry32 } from '../../../core/dom';
import { perf } from '../../../core/frame';
import { CLEAN_DONE, DIRT_COLOR, blobPixels, cleanRatio, makeWashRound, type DirtBlob } from '../../wash/logic';
import { createFinisher } from '../done';
import type { Activity } from '../env';

const BRUSH_R = 0.09;
/** Pointer moves that count as "enough rubbing" when there is no canvas to measure (tests, odd browsers). */
const FALLBACK_RUBS = 40;
const BUBBLES = ['🫧', '✨', '💦'];

/**
 * Tắm: the little friend is covered in mud. Rub with a finger — soap bubbles appear and the mud
 * wipes away. Done once nearly all of it is gone (measured on the canvas), then a splash.
 */
export const bath: Activity = (env) => {
  const { ctx, scope, plan } = env;
  const round = makeWashRound(mulberry32(plan.seed + 51));
  const me = env.kidView('big');
  const canvas = h('canvas', { class: 'bath-dirt' });
  const wrap = h('div', { class: 'bath-kid' }, me, canvas);
  const root = h('div', { class: 'bath' }, wrap);
  env.host.append(root);
  const fin = createFinisher(env);

  const c2 = canvas.getContext('2d', { willReadFrequently: true });
  let finished = false;
  let rubs = 0;
  let lastCheck = 0;
  let blobs: DirtBlob[] = round.blobs;

  function paintDirt(): void {
    if (!c2) return;
    const w = canvas.width;
    const hh = canvas.height;
    c2.clearRect(0, 0, w, hh);
    c2.globalCompositeOperation = 'source-over';
    c2.fillStyle = DIRT_COLOR;
    for (const b of blobs) {
      const { cx, cy, r } = blobPixels(b, w, hh);
      c2.globalAlpha = 0.85;
      c2.beginPath();
      c2.arc(cx, cy, r, 0, Math.PI * 2);
      c2.fill();
    }
    c2.globalAlpha = 1;
  }
  function size(): void {
    const r = wrap.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const k = perf.low ? 0.6 : 1;
    canvas.width = Math.round(r.width * k);
    canvas.height = Math.round(r.height * k);
    paintDirt();
  }
  scope.later(size, 60);
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      // Redraw the same mud at the new size (rubbing starts again; it is quick).
      size();
    });
    ro.observe(wrap);
    scope.own(() => ro?.disconnect());
  }

  function bubble(x: number, y: number): void {
    if (perf.low && Math.random() < 0.5) return;
    const r = wrap.getBoundingClientRect();
    const el = h('span', { class: 'bath-bubble', style: `left:${x - r.left}px;top:${y - r.top}px` }, BUBBLES[Math.floor(Math.random() * BUBBLES.length)]);
    wrap.append(el);
    scope.later(() => el.remove(), 900);
  }

  function rubAt(e: PointerEvent): void {
    ctx.hint.touch();
    fin.touch();
    const r = canvas.getBoundingClientRect();
    bubble(e.clientX, e.clientY);
    // Squeaky clean already: more bubbles are still welcome, there is just no more mud.
    if (finished) {
      if (++rubs % 7 === 0) ctx.audio.tick();
      return;
    }
    rubs++;
    if (c2 && canvas.width > 0 && r.width > 0) {
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      c2.globalCompositeOperation = 'destination-out';
      c2.beginPath();
      c2.arc((e.clientX - r.left) * sx, (e.clientY - r.top) * sy, BRUSH_R * Math.min(canvas.width, canvas.height), 0, Math.PI * 2);
      c2.fill();
      c2.globalCompositeOperation = 'source-over';
    }
    if (rubs % 7 === 0) ctx.audio.tick();
    const now = Date.now();
    if (now - lastCheck > 250) {
      lastCheck = now;
      check();
    }
  }

  function check(): void {
    let clean = false;
    if (c2 && canvas.width > 0) {
      try {
        clean = cleanRatio(c2.getImageData(0, 0, canvas.width, canvas.height).data, 8) >= CLEAN_DONE;
      } catch {
        clean = rubs >= FALLBACK_RUBS;
      }
    } else clean = rubs >= FALLBACK_RUBS;
    if (clean) done();
  }

  function done(): void {
    if (finished) return;
    finished = true;
    ctx.hint.clear();
    if (c2) c2.clearRect(0, 0, canvas.width, canvas.height);
    blobs = [];
    wrap.classList.add('clean');
    ctx.audio.fx('sparkle');
    env.say('Sạch bong rồi!… Thơm quá!');
    fin.ready();
  }

  let down = false;
  wrap.addEventListener('pointerdown', (e) => {
    down = true;
    rubAt(e);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (down) rubAt(e);
  });
  const up = (): void => {
    down = false;
    if (!finished) check();
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);

  env.say('Bẩn quá!… Chà chà cho sạch nào!');
  ctx.hint.arm(() => wrap.classList.toggle('nudge'));
};
