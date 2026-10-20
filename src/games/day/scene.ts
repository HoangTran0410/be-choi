import { h, replay } from '../../core/dom';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import { bath } from './activities/bath';
import { bed } from './activities/bed';
import { breakfast } from './activities/breakfast';
import { comfort } from './activities/comfort';
import { dress } from './activities/dress';
import { outing } from './activities/outing';
import { party } from './activities/party';
import { pet } from './activities/pet';
import { teeth } from './activities/teeth';
import { fall } from './ambient';
import { createKid, type KidSize } from './art';
import {
  PERIODS,
  complete,
  dayIcon,
  dayLine,
  isDone,
  justUnlocked,
  makePlan,
  moodOf,
  newDay,
  newLine,
  progressOf,
  taskDef,
  tasksOf,
  visitorOf,
  type DayPlan,
  type DayState,
  type TaskId,
} from './day';
import type { Activity, Env } from './env';
import { createHud } from './hud';
import { createScope, type Scope } from './scope';
import { loadProgress, saveProgress } from './store';

const ACTIVITIES: Record<TaskId, Activity> = { dress, breakfast, teeth, outing, pet, bath, party, comfort, bed };

const BANNER_MS = 2600;
const NO_FACE = '__none';

/**
 * The whole game: one frame (HUD with the friend, the sun's road and the day's progress) around
 * a home room where the jobs of the current part of the day wait as big pictures. A job opens
 * as a "scene" inside the same frame. Finish the jobs and the sky moves on; finish the day and
 * a new one begins with something new in it.
 */
export function runDay(ctx: GameContext): void {
  const progress = loadProgress();
  const scope = createScope();
  ctx.onCleanup(() => {
    job?.dispose();
    weather?.dispose();
    scope.dispose();
    kid.dispose();
  });

  let photos: Photo[] = [];
  let plan: DayPlan = makePlan(progress.days + 1, progress.seed, progress.lastEvent);
  let state: DayState = newDay();
  let job: Scope | null = null;
  let weather: Scope | null = null;
  let over = false;

  const kid = createKid({ mood: moodOf(state, plan) });
  const hud = createHud();
  const say = (t: string): void => ctx.speak(t);

  // ---- layout ----
  const homeKid = kid.view('big');
  const homeKidBtn = h('button', { class: 'home-kid', type: 'button', 'aria-label': 'Bạn nhỏ' }, homeKid);
  const cue = h('span', { class: 'home-cue', 'aria-hidden': 'true' });
  const faceBtn = h('button', { class: 'home-face', type: 'button', 'aria-label': 'Đổi khuôn mặt', hidden: true }, '📷');
  const hero = h('div', { class: 'home-hero' }, homeKidBtn, cue, faceBtn);
  const cards = h('div', { class: 'home-tasks' });
  const home = h('div', { class: 'day-home' }, hero, cards);
  const actHost = h('div', { class: 'day-act', hidden: true });
  const banner = h('button', { class: 'day-banner', type: 'button', hidden: true });
  const main = h('div', { class: 'day-main' }, home, actHost, banner);
  const root = h('div', { class: 'day' }, hud.el, main);
  ctx.stage.append(root);
  hud.avatar.append(kid.view('mini'));

  // ---- the little friend's face ----
  function applyFace(): void {
    const chosen = progress.face ? photos.find((p) => p.id === progress.face) : undefined;
    kid.set({ faceUrl: chosen?.url ?? '' });
    faceBtn.hidden = photos.length === 0;
  }
  void ctx.photos
    .list()
    .then((list) => {
      photos = list;
      applyFace();
    })
    .catch(() => undefined);
  ctx.onCleanup(
    ctx.photos.onChange((list) => {
      photos = list;
      applyFace();
    }),
  );

  function chooseFace(): void {
    ctx.hint.clear();
    const choices: PickerChoice[] = [
      { id: NO_FACE, emoji: '🧸', label: 'Bạn nhỏ vẽ' },
      ...photos.map((p) => ({ id: p.id, url: p.url, label: 'Ảnh' })),
    ];
    showPhotoPicker(root, choices, (c) => {
      armHint();
      if (!c) return;
      progress.face = c.id === NO_FACE ? null : c.id;
      saveProgress(progress);
      applyFace();
      replay(homeKid, 'anim-bounce');
      say('Bạn nhỏ đổi mặt rồi!');
    });
  }

  function giggle(): void {
    replay(homeKid, 'anim-wiggle');
    kid.set({ giggle: true });
    ctx.audio.pop(1.1);
    scope.later(() => kid.set({ giggle: false }), 900);
  }
  scope.tap(homeKidBtn, giggle, 300);
  scope.tap(hud.avatar, giggle, 300);
  scope.tap(faceBtn, chooseFace, 300);

  // ---- state shown on screen ----
  const CUE = { happy: '', hungry: '🍽️', sleepy: '💤', sad: '😢', angry: '💢', surprised: '❗' } as const;

  function refreshMood(): void {
    if (over) return;
    const m = moodOf(state, plan);
    kid.set({ mood: m, asleep: false });
    cue.textContent = CUE[m];
    cue.hidden = CUE[m] === '';
  }

  function renderCards(): void {
    const list = tasksOf(state.period);
    cards.replaceChildren(
      ...list.map((t) => {
        const label = t.id === 'party' && plan.event === 'birthday' ? 'Sinh nhật' : t.label;
        const icon = t.id === 'party' && plan.event === 'birthday' ? '🎂' : t.icon;
        const b = h(
          'button',
          { class: `task${isDone(state, t.id) ? ' done' : ''}`, type: 'button', 'data-task': t.id, 'aria-label': label },
          h('span', { class: 'task-icon' }, icon),
          h('span', { class: 'task-check' }, '✓'),
        );
        scope.tap(b, () => open(t.id), 250);
        return b;
      }),
    );
  }

  function refresh(): void {
    const p = progressOf(state);
    hud.setDots(p.done, p.total);
    hud.setPeriod(state.period);
    hud.setDay(plan.dayNo);
    root.dataset.period = String(state.period);
    root.dataset.weather = plan.weather;
    refreshMood();
    renderCards();
    armHint();
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      if (job) return;
      const next = cards.querySelector<HTMLElement>('.task:not(.done)');
      if (next) replay(next, 'anim-wiggle');
    });
  }

  function startWeather(): void {
    weather?.dispose();
    weather = createScope();
    if (plan.weather === 'rainy') fall(home, weather, '💧', 14);
    else if (plan.weather === 'cold') fall(home, weather, '❄️', 10);
  }

  function showBanner(icon: string, text: string, ms = BANNER_MS, then?: () => void): void {
    banner.replaceChildren(h('span', { class: 'banner-icon' }, icon), h('span', { class: 'banner-text' }, text));
    banner.hidden = false;
    replay(banner, 'anim-bounce');
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      banner.hidden = true;
      then?.();
    };
    banner.onclick = close;
    scope.later(close, ms);
  }

  // ---- jobs ----
  function open(id: TaskId): void {
    if (job || over || !banner.hidden) return;
    ctx.hint.clear();
    const def = taskDef(id);
    const s = createScope();
    job = s;
    home.hidden = true;
    actHost.hidden = false;
    actHost.replaceChildren();
    hud.inJob(true);
    root.dataset.job = id;
    const env: Env = {
      ctx,
      host: actHost,
      plan,
      days: progress.days,
      kid,
      kidView(size: KidSize) {
        const el = kid.view(size);
        s.own(() => kid.release(el));
        return el;
      },
      scope: s,
      photos: () => photos,
      visitor() {
        const v = visitorOf(plan, photos.length);
        let i = v.photoIndex;
        // Someone other than the photo that is already the friend's face, when there is a choice.
        if (i !== null && photos.length > 1 && photos[i]?.id === progress.face) i = (i + 1) % photos.length;
        return { url: i === null ? null : (photos[i]?.url ?? null), visitor: v.visitor };
      },
      say,
      finish() {
        if (job !== s) return;
        close();
        done(id);
      },
    };
    say(def.say);
    try {
      ACTIVITIES[id](env);
    } catch (err) {
      console.error(err);
      close();
    }
  }

  function close(): void {
    job?.dispose();
    job = null;
    ctx.hint.clear();
    actHost.replaceChildren();
    actHost.hidden = true;
    home.hidden = false;
    hud.inJob(false);
    delete root.dataset.job;
    refresh();
  }
  // Going back is harmless to repeat, so no cooldown.
  scope.tap(hud.home, () => close(), 0);

  function done(id: TaskId): void {
    const step = complete(state, id);
    state = step.state;
    if (step.dayDone) {
      endDay();
      return;
    }
    refresh();
    if (step.periodDone) {
      const p = PERIODS[state.period];
      if (p) {
        ctx.audio.fx('sparkle');
        showBanner(p.icon, p.say.replace(/[…!]+/g, ' ').trim(), 2200);
        say(p.say);
      }
    } else {
      replay(homeKid, 'anim-bounce');
    }
  }

  // ---- the end of a day and the start of the next ----
  function endDay(): void {
    over = true;
    progress.days++;
    progress.lastEvent = plan.event;
    saveProgress(progress);
    hud.setDots(progressOf(state).total, progressOf(state).total);
    kid.set({ asleep: true, mood: 'sleepy' });
    root.dataset.job = 'night';
    void ctx.celebrate().then(() => {
      if (!scope.alive()) return;
      ctx.addStar();
      reveal();
    });
  }

  function reveal(): void {
    const fresh = justUnlocked(progress.days);
    say(newLine(fresh));
    const card = h(
      'div',
      { class: 'reveal' },
      h('div', { class: 'reveal-title' }, fresh.length > 0 ? 'Đồ mới!' : `Xong ngày ${plan.dayNo}!`),
      h('div', { class: 'reveal-row' }, ...(fresh.length > 0 ? fresh.map((u) => h('span', { class: 'reveal-item' }, u.emoji)) : [h('span', { class: 'reveal-item' }, '🌟')])),
    );
    const next = h('button', { class: 'reveal-next', type: 'button', 'aria-label': 'Ngày mới' }, '▶️');
    const layer = h('div', { class: 'day-reveal' }, card, next);
    main.append(layer);
    let started = false;
    const go = (): void => {
      if (started) return;
      started = true;
      layer.remove();
      newDayStart();
    };
    scope.tap(next, go, 400);
    scope.later(go, 9000);
  }

  function newDayStart(): void {
    over = false;
    plan = makePlan(progress.days + 1, progress.seed, progress.lastEvent);
    state = newDay();
    kid.undress();
    kid.set({ asleep: false });
    startWeather();
    refresh();
    delete root.dataset.job;
    showBanner(dayIcon(plan), dayLine(plan).replace(/[…!]+/g, ' ').trim(), BANNER_MS);
    say(dayLine(plan));
  }

  // ---- go ----
  startWeather();
  refresh();
  showBanner(dayIcon(plan), progress.days === 0 ? 'Một ngày mới bắt đầu' : dayLine(plan).replace(/[…!]+/g, ' ').trim(), BANNER_MS);
  say(progress.days === 0 ? PERIODS[0]!.say : dayLine(plan));
}
