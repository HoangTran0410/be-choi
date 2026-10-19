import { onPerfChange, perf } from '../../core/frame';
import { pickDpr } from '../../core/quality';
import { makeRoad } from './logic';
import { CAMERA_AT } from './config';
import type { Drive } from './state';

/** Quality changed: re-fit the canvas to the new resolution in place. Nothing is rebuilt or reloaded. */
export function refit(d: Drive): void {
  const canvas = d.el.canvas;
  const w = canvas.parentElement?.clientWidth ?? 0;
  const hgt = canvas.parentElement?.clientHeight ?? 0;
  if (!w || !hgt) return;
  const next = pickDpr(window.devicePixelRatio || 1, 2, perf.low);
  if (next === d.dpr) return;
  d.dpr = next;
  canvas.width = Math.round(w * d.dpr);
  canvas.height = Math.round(hgt * d.dpr);
}

/** Re-fit the canvas and rebuild the road when the view size or quality changes. */
export function build(d: Drive): void {
  const canvas = d.el.canvas;
  const view = canvas.parentElement;
  const w = view?.clientWidth ?? 0;
  const hgt = view?.clientHeight ?? 0;
  if (!w || !hgt) return;
  const nextDpr = pickDpr(window.devicePixelRatio || 1, 2, perf.low);
  if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
  d.dpr = nextDpr;
  canvas.width = Math.round(w * d.dpr);
  canvas.height = Math.round(hgt * d.dpr);
  const before = d.road.unit ? d.car.x / d.road.unit : 2;
  d.road = makeRoad(w, hgt, d.road.legs);
  d.car.x = before * d.road.unit;
  d.camX = d.car.x - w * CAMERA_AT;
}

export function watchPerf(d: Drive): () => void {
  return onPerfChange(() => refit(d));
}
