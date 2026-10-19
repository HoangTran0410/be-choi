/**
 * The picture behind the mixer. Every background that is switched on paints
 * something: rain falls, the sea rolls in along the bottom, wind blows leaves
 * across, the sky goes dark for the crickets and the owl. Effects fade in and
 * out with their sound, so switching one off never makes the picture jump.
 *
 * One canvas, one frame loop. Everything is placed in fractions of the canvas
 * so it holds up from a phone on its side to a tablet standing up.
 */
import { onFrame, onPerfChange, perf } from '../../core/frame';
import { pickDpr } from '../../core/quality';
import { createCtx } from './context';
import { skyOf, type Sky } from './logic';
import { rand } from './scene-data';
import { drawBees, drawBirds, drawCat, drawChickens, drawFarm, drawFrog, drawNightCritters, drawRainforest, drawSeagulls } from './animals';
import { drawBath, drawCampfire, drawCoffee, drawHeartbeat, drawHome, drawMusicBox, drawTyping } from './home';
import { drawDrawing } from './drawing';
import { drawFirework } from './fireworks';
import { drawHero, drawSparkles } from './moments';
import { drawCarnival, drawPlayground, drawSpace, drawTemple } from './places';
import { drawClouds, drawHeavens, drawHills, drawPhoto, drawSky, drawTree } from './sky';
import { drawStreet, drawTown } from './town';
import { drawRain, drawSnow, drawThunder, drawWind } from './weather';
import { drawBubbles, drawOcean, drawRiver, drawUnderwater, drawWaterfall, drawWhale } from './water';

export interface Scene {
  /** What is playing now. Effects ease towards it. */
  setOn(ids: readonly string[]): void;
  /** A big picture of what was just switched on, blooming in the middle. */
  announce(emoji: string): void;
  /** A little burst of sparkles where the child touched the sky. */
  sparkle(x: number, y: number): void;
  /** A photograph to play over instead of the drawn landscape; null for the drawing. */
  setBackdrop(img: HTMLImageElement | null): void;
  destroy(): void;
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const c = createCtx(canvas);
  const { g, sky, L, want, level } = c;
  let stopLoop: () => void = () => undefined;

  /**
   * Pixels per CSS pixel. Soft shapes and glows gain nothing from a full retina
   * canvas, and every extra pixel is filled again each frame, so it starts at 1.5
   * at most — and steps down on its own when the device cannot keep up (see
   * `frame`), because a smooth picture reads better than a sharp stuttering one.
   */
  const MIN_DPR = 0.75;
  function resize(): void {
    const r = canvas.getBoundingClientRect();
    c.W = Math.max(1, r.width);
    c.H = Math.max(1, r.height);
    canvas.width = Math.round(c.W * c.dpr);
    canvas.height = Math.round(c.H * c.dpr);
    g?.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    c.sprites.clear();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  resize();
  // The device started (or stopped) struggling: sharpness follows. Going back up is
  // safe here because `perf` only flips back after seconds of steady frames.
  const offPerf = onPerfChange(() => {
    const next = pickDpr(window.devicePixelRatio || 1, 1.5, perf.low);
    if (perf.low ? next < c.dpr : next !== c.dpr) {
      c.dpr = next;
      resize();
    }
  });

  /**
   * Keep it smooth: if frames have been running slow for a couple of seconds,
   * draw at a lower resolution. Only ever downwards within a visit — flipping
   * back up would just find the same limit again.
   */
  let slowAvg = 1 / 60;
  let sinceCheck = 0;
  function adapt(raw: number): void {
    // A long gap is the tab having been away, not the picture being slow.
    if (raw > 0.25) return;
    slowAvg += (raw - slowAvg) * 0.05;
    sinceCheck += raw;
    if (sinceCheck < 2) return;
    sinceCheck = 0;
    if (slowAvg > 1 / 42 && c.dpr > MIN_DPR) {
      c.dpr = Math.max(MIN_DPR, c.dpr * 0.8);
      resize();
    }
  }

  function frame(_now: number, dtMs: number): void {
    if (!c.alive) return;
    const raw = dtMs / 1000;
    const dt = Math.min(0.05, raw);
    // The first frame (and the first after the tab was hidden) has no gap to judge by.
    if (dtMs > 0) adapt(raw);
    c.time += dt;
    // Ease every effect and sky towards what is wanted: in over ~1 s, out over ~1.5 s.
    for (const [id, w] of want) {
      const cur = level.get(id) ?? 0;
      level.set(id, cur + (w - cur) * Math.min(1, dt * (w > cur ? 2.2 : 1.6)));
    }
    for (const k of Object.keys(sky) as Sky[]) sky[k] += (c.skyWant[k] - sky[k]) * Math.min(1, dt * 1.2);
    if (!g) return;
    g.clearRect(0, 0, c.W, c.H);
    if (c.photo) {
      drawPhoto(c, dt);
    } else {
      drawSky(c);
    }
    drawHeavens(c);
    drawFirework(c, dt);
    if (!c.photo || Math.max(L('rain'), L('heavy-rain'), L('thunder')) > 0.01) drawClouds(c, dt);
    drawSpace(c, dt);
    drawTown(c);
    // Under the sea the land sinks away.
    if (!c.photo && sky.deep < 0.99) {
      g.globalAlpha = 1 - sky.deep;
      drawHills(c);
      // No tree grows on the moon.
      g.globalAlpha = (1 - sky.deep) * (1 - sky.space);
      if (sky.space < 0.99) drawTree(c);
      g.globalAlpha = 1;
    }
    drawFarm(c, dt);
    drawCarnival(c, dt);
    drawSeagulls(c);
    drawWaterfall(c, dt);
    drawStreet(c, dt);
    drawRiver(c);
    drawTemple(c, dt);
    drawPlayground(c, dt);
    drawRainforest(c, dt);
    drawBirds(c, dt);
    drawNightCritters(c, dt);
    drawCampfire(c, dt);
    drawFrog(c, dt);
    drawChickens(c, dt);
    drawBees(c);
    drawCat(c, dt);
    drawHome(c, dt);
    drawMusicBox(c, dt);
    drawHeartbeat(c, dt);
    drawBath(c, dt);
    drawTyping(c, dt);
    drawCoffee(c, dt);
    drawUnderwater(c, dt);
    drawWhale(c, dt);
    drawOcean(c);
    drawBubbles(c, dt);
    drawWind(c, dt);
    drawRain(c, dt);
    drawSnow(c, dt);
    drawThunder(c, dt);
    drawDrawing(c, dt);
    if (c.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${c.flash * 0.7})`;
      g.fillRect(0, 0, c.W, c.H);
      c.flash = Math.max(0, c.flash - dt * 3);
    }
    drawHero(c, dt);
    drawSparkles(c, dt);
  }
  // maxDt 1000: `adapt` tells a slow picture from a tab that was away by the size of the gap.
  stopLoop = onFrame(frame, { maxDt: 1000 });

  return {
    setOn(ids) {
      for (const id of want.keys()) want.set(id, 0);
      for (const id of ids) want.set(id, 1);
      c.skyWant = skyOf(ids);
    },
    announce(emoji) {
      c.hero = { emoji, life: 0 };
    },
    sparkle(x, y) {
      for (let i = 0; i < 8; i++)
        c.pool('tap').push({
          x,
          y,
          vx: rand(-120, 120),
          vy: rand(-160, -40),
          life: 0,
          max: 0.9,
          size: c.U() * rand(0.03, 0.05),
          spin: rand(-6, 6),
        });
    },
    setBackdrop(img) {
      c.photo = img;
      c.photoIn = 0;
    },
    destroy() {
      c.alive = false;
      stopLoop();
      ro?.disconnect();
      offPerf();
    },
  };
}
