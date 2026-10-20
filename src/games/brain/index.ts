import { h, replay } from '../../core/dom';
import { onPerfChange, perf } from '../../core/frame';
import type { Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { NUMBERS_VI } from '../../core/content';
import { sayLines } from '../../core/say';
import { openBox, showReward } from './collection';
import { createHud } from './hud';
import { adapt, MAX_LEVEL, rate, rewardAt, roundRng, stepOf, suggestNext, unlockedStations, type StationId } from './levels';
import { renderMap } from './map';
import { meta } from './meta';
import { loadProgress, saveProgress } from './progress';
import { STATIONS } from './stations';
import type { Env, Stats } from './types';
import './style.css';

/** After this many rounds in a row at one station the island walks the child on to another. */
const ROUNDS_BEFORE_MAP = 3;

/**
 * Trí nhớ & suy nghĩ — one treasure island, five stations, one frame. A station is a
 * small challenge (cards, balls, a tune, a missing thing, a difference); each win is a
 * star, and every three stars the island opens something new. The map never forces an
 * order, nothing is lost, nothing is timed.
 */
function start(ctx: GameContext): void {
  const progress = loadProgress();
  let alive = true;
  let photos: Photo[] = [];

  /* ---- speech, one phrase at a time ---- */
  function say(phrases: string | readonly string[]): void {
    // One slow sequence: a new line cuts the old one off, names get a long gap after them.
    void sayLines(ctx, (typeof phrases === 'string' ? [phrases] : [...phrases]).filter(Boolean));
  }

  /* ---- frame ---- */
  const root = h('div', { class: 'brain' });
  const view = h('div', { class: 'brain-view' });
  const hud = createHud(ctx, {
    avatar: () => showBox(),
    map: () => goMap(),
  });
  root.append(hud.el, view);
  ctx.stage.append(root);
  const setLow = (low: boolean) => root.classList.toggle('low', low);
  setLow(perf.low);

  const offPerf = onPerfChange(setLow);
  const offPhotos = ctx.photos.onChange((list) => (photos = list));
  void ctx.photos.list().then((list) => {
    if (alive) photos = list;
  });

  let station: { dispose(): void } | null = null;
  let overlay: HTMLElement | null = null;
  /** Bumped on every change of view, so a late callback knows it is out of date. */
  let epoch = 0;
  let sinceMap = 0;

  ctx.onCleanup(() => {
    alive = false;
    epoch++;
    leaveStation();
    ctx.stopSpeech();
    offPerf();
    offPhotos();
    window.removeEventListener('resize', onResize);
  });
  const resizers = new Set<() => void>();
  function onResize(): void {
    for (const fn of [...resizers]) fn();
  }
  window.addEventListener('resize', onResize);

  function leaveStation(): void {
    station?.dispose();
    station = null;
    ctx.hint.clear();
  }

  function closeOverlay(): void {
    overlay?.remove();
    overlay = null;
  }

  /* ---- the map ---- */
  function goMap(): void {
    epoch++;
    closeOverlay();
    leaveStation();
    hud.showMap(false);
    hud.update(progress);
    const open = unlockedStations(progress.stars);
    const next = suggestNext(open, progress.rounds, progress.last);
    const map = renderMap(ctx, progress, next, {
      station: (id) => enter(id),
      locked: (_id, need) => say(['Cần thêm', NUMBERS_VI[need] ?? String(need), 'sao nữa nhé!']),
      island: (i) => {
        progress.island = i;
        saveProgress(progress);
        goMap();
      },
    });
    view.replaceChildren(map.el);
    sinceMap = 0;
    ctx.hint.arm(() => {
      const el = map.node(next);
      if (el) replay(el, 'anim-wiggle');
    }, 9000);
  }

  /* ---- a station ---- */
  function enter(id: StationId): void {
    epoch++;
    const mine = epoch;
    closeOverlay();
    leaveStation();
    const def = STATIONS[id];
    const skill = progress.skills[id];
    const round = progress.rounds[id];
    const area = h('div', { class: `brain-station brain-st-${id}` });
    view.replaceChildren(area);
    hud.showMap(true);
    hud.update(progress);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const resize = new Set<() => void>();
    const stats: Stats = { slips: 0, hints: 0 };
    let finished = false;

    const env: Env = {
      ctx,
      area,
      level: skill.level,
      island: progress.island,
      rng: roundRng(id, skill.level, round, progress.island),
      photos,
      stats,
      alive: () => alive && epoch === mine,
      later(fn, ms) {
        const t = setTimeout(() => {
          timers.delete(t);
          if (alive && epoch === mine) fn();
        }, ms);
        timers.add(t);
      },
      say: (p) => say(p),
      arm(fn, ms) {
        ctx.hint.arm(() => {
          if (!alive || epoch !== mine) return;
          if (fn() !== false) stats.hints++;
        }, ms);
      },
      onResize(fn) {
        resize.add(fn);
        resizers.add(fn);
      },
      low: () => perf.low,
    };

    const done = (size: number): void => {
      if (finished || !alive || epoch !== mine) return;
      finished = true;
      win(id, size, stats, mine);
    };

    say(def.intro);
    const stop = def.start(env, done);
    station = {
      dispose() {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        for (const fn of resize) resizers.delete(fn);
        resize.clear();
        stop?.();
        ctx.stopSpeech();
        area.remove();
      },
    };
  }

  /** A round is won: a star, the difficulty adapts, maybe a surprise. */
  function win(id: StationId, size: number, stats: Stats, mine: number): void {
    ctx.hint.clear();
    const before = stepOf(progress.stars);
    progress.skills[id] = adapt(progress.skills[id], rate(stats.slips + stats.hints, size), MAX_LEVEL[id]);
    progress.rounds[id]++;
    progress.stars++;
    progress.last = id;
    saveProgress(progress);
    ctx.addStar();
    hud.update(progress);
    hud.popStar();
    sinceMap++;
    const reward = stepOf(progress.stars) > before ? rewardAt(stepOf(progress.stars)) : null;
    void ctx.celebrate().then(() => {
      if (!alive) return;
      if (reward) {
        // Something new: show it, then back to the map where it can be seen.
        closeOverlay();
        say([`Bé mở được ${reward.name}!`]);
        overlay = showReward(ctx, view, reward, {
          close: () => {
            closeOverlay();
            goMap();
          },
        });
        ctx.hint.arm(() => overlay && replay(overlay.querySelector('.brain-ok') ?? overlay, 'anim-wiggle'), 7000);
        return;
      }
      if (epoch !== mine) return;
      if (sinceMap >= ROUNDS_BEFORE_MAP) {
        goMap();
        say(['Mình đi', 'trạm khác', 'nhé!']);
      } else enter(id);
    });
  }

  /* ---- the treasure box ---- */
  function showBox(): void {
    if (overlay) {
      closeOverlay();
      return;
    }
    overlay = openBox(ctx, view, progress, {
      pick: (a) => {
        progress.avatar = a;
        saveProgress(progress);
        hud.update(progress);
        closeOverlay();
        showBox();
      },
      close: closeOverlay,
    });
    say(['Hộp kho báu', 'của bé!']);
  }

  hud.update(progress);
  goMap();
}

const game: GameModule = { ...meta, start };
export default game;
