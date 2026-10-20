/**
 * Ban nhạc robot, wired together: the shelf, the stage, the groove, the voice, the goals and the
 * family photos. Everything the child does funnels into a few small actions (place, remove, move,
 * change level, change song); after each one `changed()` brings the sound, the picture, the goals
 * and the save up to date. Nothing can be wrong: a drop that cannot happen just does nothing.
 */
import { perf, startLoop } from '../../core/frame';
import { h } from '../../core/dom';
import type { Photo } from '../../core/photos';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { createRig } from './art';
import { createDnd, type Drop, type Source } from './dnd';
import { SONGS, createGroove, findSong, midiFreq, pitchOf, stepMs, type Level, type SongId } from './groove';
import { createLineup } from './lineup';
import { QUESTS, currentQuest, loadProgress, newlyDone, saveProgress, unlockedIds, type Progress, type Quest } from './quests';
import { barsOf, findRobot, playerFor, type RobotDef, type Role } from './robots';
import { createShelf } from './shelf';
import { createStage } from './stage';
import { byeLines, createNarrator, fullLines, hintLines, newRobotLines, placedLines, songLines, type Missing } from './voice';

const HINT_MS = 9000;
const REWARD_MS = 2800;
const FINALE_MS = 7000;

export function mountBand(ctx: GameContext): void {
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  };

  const saved: Progress = loadProgress();
  const done = new Set(saved.done);
  const tried = new Set<SongId>(saved.tried);
  const fullIn = new Set<SongId>(saved.fullIn);
  let last = saved.last;
  let unlocked = unlockedIds(done);
  const fresh = new Set<string>();
  let selected: string | null = null;
  let placed = 0;
  let wasFull = false;
  let photos: Photo[] = [];
  /** Which family photo is whose face (robot id → photo id). */
  const faces = new Map<string, string>();
  let backdropOf: string | null = null;

  const lineup = createLineup();
  const stage = createStage();
  const shelf = createShelf();
  const groove = createGroove({
    audio: ctx.audio,
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (hd) => clearTimeout(hd as ReturnType<typeof setTimeout>),
  });
  const narrator = createNarrator({ speakSeq: (p) => ctx.speakSeq(p), stopSpeech: () => ctx.stopSpeech() });
  let songId: SongId = saved.song;
  groove.setSong(songId);
  stage.setSong(songId);

  // ---- layout ------------------------------------------------------------------------------
  const parts = h('div', { class: 'rb-parts' });
  const stickers = h('div', { class: 'rb-stickers' });
  const questBox = h('div', { class: 'rb-quest', 'aria-hidden': 'true' }, parts, stickers);
  const againBtn = h('button', { class: 'btn-round rb-again', type: 'button', 'aria-label': 'Đội hình lần trước', hidden: true }, '🔄');
  const pips = h('div', { class: 'rb-pips' }, ...SONGS.map((s) => h('i', { 'data-song': s.id })));
  const songIcon = h('span', { class: 'rb-song-icon' });
  const songBtn = h('button', { class: 'btn-round rb-song', type: 'button', 'aria-label': 'Đổi bài nhạc' }, songIcon, pips);
  const top = h('div', { class: 'rb-top' }, questBox, againBtn, songBtn);
  const reward = h('div', { class: 'rb-reward-layer', 'aria-hidden': 'true' });
  const root = h('div', { class: 'rb' }, top, stage.el, shelf.el, reward);
  root.dataset.song = songId;
  ctx.stage.append(root);
  ctx.onCleanup(() => root.remove());

  // ---- drawing helpers ----------------------------------------------------------------------
  function renderSong(): void {
    songIcon.textContent = findSong(songId).icon;
    root.dataset.song = songId;
    stage.setSong(songId);
    pips.querySelectorAll('i').forEach((p) => p.classList.toggle('on', (p as HTMLElement).dataset.song === songId));
  }

  function view() {
    return { robots: lineup.robots(), tried, fullIn };
  }

  function renderQuest(): void {
    parts.replaceChildren();
    const q = currentQuest(done);
    if (q) {
      for (const p of q.parts(view())) parts.append(h('span', { class: p.done ? 'rb-part on' : 'rb-part' }, p.icon));
    }
    stickers.replaceChildren(...QUESTS.filter((x) => done.has(x.id)).map((x) => h('span', { class: 'rb-sticker' }, x.sticker)));
    questBox.classList.toggle('all-done', !q);
  }

  function renderAgain(): void {
    const any = last.some((s) => s && unlocked.includes(s.robot));
    againBtn.hidden = !(lineup.count() === 0 && any);
  }

  function persist(): void {
    if (lineup.count() > 0) last = lineup.snapshot();
    saveProgress({ done: [...done], tried: [...tried], fullIn: [...fullIn], last, song: songId });
  }

  // ---- photos --------------------------------------------------------------------------------
  const photoUrl = (id: string | undefined): string | null => (id ? (photos.find((p) => p.id === id)?.url ?? null) : null);

  function assignFace(robot: string): void {
    if (photos.length === 0) return;
    const used = new Set(faces.values());
    const free = photos.find((p) => !used.has(p.id));
    faces.set(robot, (free ?? photos[faces.size % photos.length])!.id);
  }

  function syncFaces(): void {
    for (const [robot, pid] of [...faces]) if (!photos.some((p) => p.id === pid) || lineup.slotOf(robot) < 0) faces.delete(robot);
    for (const robot of lineup.robots()) if (!faces.has(robot)) assignFace(robot);
    for (let s = 0; s < lineup.capacity; s++) {
      const seat = lineup.seat(s);
      stage.setFace(s, seat ? photoUrl(faces.get(seat.robot)) : null);
    }
    const lastRobot = backdropOf && lineup.slotOf(backdropOf) >= 0 ? backdropOf : (lineup.robots()[0] ?? null);
    backdropOf = lastRobot;
    stage.setBackdrop(lastRobot ? photoUrl(faces.get(lastRobot)) : null);
  }

  void ctx.photos.list().then((list) => {
    if (!alive) return;
    photos = list;
    syncFaces();
  });
  const offPhotos = ctx.photos.onChange((list) => {
    if (!alive) return;
    photos = list;
    syncFaces();
  });
  ctx.onCleanup(offPhotos);

  // ---- the shelf -----------------------------------------------------------------------------
  const disposers: Array<() => void> = [];
  const dnd = createDnd({
    layer: root,
    targets: () => stage.targets(),
    stageRect: () => stage.el.getBoundingClientRect(),
    shelfRect: () => shelf.el.getBoundingClientRect(),
    onTap: (src) => (src.kind === 'shelf' ? tapShelf(src.robot) : cycleLevel(src.slot)),
    onHold: (src) => {
      if (src.kind === 'stage') removeAt(src.slot);
    },
    onPickUp: (src) => {
      ctx.hint.touch();
      if (src.kind === 'shelf') {
        shelf.seen(src.robot);
        fresh.delete(src.robot);
      }
      stage.canDrop(true);
    },
    onDrop: (src, drop) => dropped(src, drop),
    ghost: (src, el) => {
      if (src.kind === 'shelf') return shelf.ghost(src.robot) ?? (el.cloneNode(true) as HTMLElement);
      return el.cloneNode(true) as HTMLElement;
    },
    onHolding: (src, on) => {
      if (src.kind === 'stage') stage.setHolding(src.slot, on);
    },
    ctx,
  });

  function refreshShelf(): void {
    while (disposers.length) disposers.pop()?.();
    const defs = unlocked.map((id) => findRobot(id)).filter((d): d is RobotDef => !!d);
    shelf.setRobots(defs, fresh);
    shelf.setOnStage(new Set(lineup.robots()));
    shelf.select(selected);
    for (const d of defs) {
      const item = shelf.itemEl(d.id);
      if (!item) continue;
      disposers.push(dnd.attach(item, () => (lineup.slotOf(d.id) >= 0 ? null : { kind: 'shelf', robot: d.id })));
    }
  }

  function select(id: string | null): void {
    selected = id;
    shelf.select(id);
    stage.canDrop(id !== null);
  }

  function preview(def: RobotDef): void {
    const song = findSong(groove.running ? groove.song.id : songId);
    const ms = stepMs(song);
    let hits = (barsOf(def.id, song.style, 2)[0] ?? []).filter((x) => x.s < 8);
    if (groove.running) hits = hits.slice(0, 1);
    for (const x of hits) {
      const delay = (x.s * ms) / 1000;
      if (x.drum) ctx.audio.drum(x.drum, delay);
      else if (x.p) ctx.audio.note(midiFreq(pitchOf(song, 0, x.p)), Math.max(0.15, (x.d * ms) / 1000), def.timbre, delay);
    }
  }

  function tapShelf(id: string): void {
    ctx.hint.touch();
    const def = findRobot(id);
    if (!def) return;
    shelf.seen(id);
    fresh.delete(id);
    if (selected === id) {
      select(null);
      return;
    }
    select(id);
    preview(def);
  }

  // ---- actions -------------------------------------------------------------------------------
  function place(id: string, slot: number, quiet = false, level: Level = 2): boolean {
    const def = findRobot(id);
    if (!def || !unlocked.includes(id)) return false;
    const occupant = lineup.seat(slot);
    if (occupant && occupant.robot !== id) removeAt(slot, true);
    if (!lineup.place(slot, id, level)) return false;
    groove.setPlayer(slot, playerFor(def), level);
    if (!groove.running) groove.start();
    stage.put(slot, def, level);
    assignFace(id);
    backdropOf = id;
    attachBot(id);
    shelf.setOnStage(new Set(lineup.robots()));
    shelf.seen(id);
    fresh.delete(id);
    if (!quiet) ctx.audio.pop(1.1);
    navigator.vibrate?.(10);
    const n = lineup.count();
    if (!quiet) {
      const lines = placedLines(def, n, placed++);
      if (lineup.full()) lines.splice(1, 1, ...placedLines(def, n, 0).slice(1), ...fullLines());
      narrator.say(lines);
    }
    changed();
    return true;
  }

  const botDispose = new Map<string, () => void>();
  function attachBot(id: string): void {
    botDispose.get(id)?.();
    const slot = lineup.slotOf(id);
    const el = stage.figureEl(slot);
    if (!el) return;
    botDispose.set(
      id,
      dnd.attach(el, () => {
        const s = lineup.slotOf(id);
        return s >= 0 ? { kind: 'stage', slot: s } : null;
      }),
    );
  }

  function removeAt(slot: number, silent = false): void {
    const seat = lineup.remove(slot);
    if (!seat) return;
    groove.setPlayer(slot, null);
    botDispose.get(seat.robot)?.();
    botDispose.delete(seat.robot);
    faces.delete(seat.robot);
    stage.leave(slot, performance.now());
    shelf.setOnStage(new Set(lineup.robots()));
    if (!silent) {
      ctx.audio.tick();
      narrator.say(byeLines());
    }
    if (lineup.count() === 0) groove.stop();
    changed();
  }

  function move(from: number, to: number): void {
    const r = lineup.move(from, to);
    if (r === 'none') return;
    groove.swap(from, to);
    stage.swap(from, to);
    ctx.audio.pop(0.9);
    changed();
  }

  function cycleLevel(slot: number): void {
    ctx.hint.touch();
    const lv = lineup.cycle(slot);
    if (!lv) return;
    groove.setLevel(slot, lv as Level);
    stage.setLevel(slot, lv as Level);
    ctx.audio.tick();
    navigator.vibrate?.(8);
    persist();
  }

  function dropped(src: Source, drop: Drop): void {
    ctx.hint.touch();
    stage.canDrop(selected !== null);
    if (src.kind === 'shelf') {
      if (drop.kind === 'slot') {
        select(null);
        place(src.robot, drop.slot);
      } else if (drop.kind === 'shelf') {
        tapShelf(src.robot);
      }
      return;
    }
    if (drop.kind === 'slot') move(src.slot, drop.slot);
    else if (drop.kind === 'shelf') removeAt(src.slot);
  }

  // Tapping an empty seat puts the picked robot there; with nothing picked it points at a robot to pick.
  stage.slotEls.forEach((el, i) => {
    makeTappable(
      el,
      () => {
        ctx.hint.touch();
        if (lineup.seat(i)) return;
        if (selected) {
          const id = selected;
          select(null);
          place(id, i);
        } else {
          ctx.audio.pop(0.8);
          suggest(false);
        }
      },
      { ctx, feedback: false, cooldownMs: 150 },
    );
  });

  makeTappable(
    songBtn,
    () => {
      ctx.hint.touch();
      const next = SONGS[(SONGS.findIndex((s) => s.id === songId) + 1) % SONGS.length]!;
      songId = next.id;
      groove.setSong(songId);
      tried.add(songId);
      renderSong();
      ctx.audio.tick();
      narrator.say(songLines(songId));
      songBtn.classList.remove('anim-bounce');
      void songBtn.offsetWidth;
      songBtn.classList.add('anim-bounce');
      changed();
    },
    { ctx, feedback: false, cooldownMs: 300 },
  );

  makeTappable(
    againBtn,
    () => {
      ctx.hint.touch();
      let n = 0;
      last.forEach((s, slot) => {
        if (s && place(s.robot, slot, true, s.level)) n++;
      });
      if (n > 0) narrator.say(placedLines(findRobot(lineup.robots()[0]!)!, n, 0).slice(1));
    },
    { ctx, feedback: false, cooldownMs: 500 },
  );

  // ---- goals, finale, hints ------------------------------------------------------------------
  const rewards: Quest[] = [];
  let showing = false;

  function showReward(): void {
    const q = rewards.shift();
    if (!q) {
      showing = false;
      return;
    }
    showing = true;
    const card = h(
      'div',
      { class: 'rb-reward' },
      h('div', { class: 'rb-reward-sticker' }, q.sticker),
      h('div', { class: 'rb-reward-star' }, '⭐'),
    );
    const row = h('div', { class: 'rb-reward-new' });
    for (const id of q.reward) {
      const def = findRobot(id);
      if (!def) continue;
      const rig = createRig(def.color, def.look);
      row.append(h('div', { class: 'rb-reward-bot' }, rig.svg));
    }
    card.append(row);
    reward.replaceChildren(card);
    ctx.audio.ding();
    later(() => {
      reward.replaceChildren();
      showReward();
    }, REWARD_MS);
  }

  function evaluate(): void {
    if (lineup.full()) fullIn.add(groove.running ? groove.song.id : songId);
    const won = newlyDone(done, view());
    if (won.length === 0) return;
    for (const q of won) {
      done.add(q.id);
      for (const r of q.reward) fresh.add(r);
      ctx.addStar();
      rewards.push(q);
    }
    unlocked = unlockedIds(done);
    refreshShelf();
    if (!showing) showReward();
    later(() => {
      narrator.say(newRobotLines());
      const first = won.flatMap((q) => q.reward)[0];
      if (first) shelf.nudge(first);
    }, 3800);
  }

  function finale(): void {
    stage.setFinale(true);
    later(() => stage.setFinale(false), FINALE_MS);
    // About as long as "Tám bạn robot rồi" and "Đủ cả ban nhạc rồi" take at a slow pace, plus a breath.
    const lead = 7500;
    later(() => {
      ctx.addStar();
      void ctx.celebrate();
    }, lead);
  }

  function changed(): void {
    if (lineup.full() && !wasFull) {
      wasFull = true;
      finale();
    } else if (!lineup.full()) {
      wasFull = false;
    }
    syncFaces();
    evaluate();
    renderQuest();
    renderAgain();
    persist();
  }

  const hasRole = (role: Role): boolean => lineup.robots().some((id) => findRobot(id)?.role === role);

  /** A gentle nudge about what the band lacks: a robot on the shelf wobbles. No wrong answers. */
  function suggest(speak: boolean): void {
    const free = unlocked.map((id) => findRobot(id)).filter((d): d is RobotDef => !!d && lineup.slotOf(d.id) < 0);
    if (free.length === 0 || lineup.full()) return;
    const order: Array<[Missing, Role]> = [
      ['beat', 'beat'],
      ['bass', 'bass'],
      ['chord', 'chord'],
      ['melody', 'melody'],
    ];
    let what: Missing = 'more';
    let pick: RobotDef | undefined = free.find((d) => fresh.has(d.id)) ?? free[Math.floor(Math.random() * free.length)];
    if (lineup.count() === 0) {
      what = 'empty';
      pick = free.find((d) => d.id === 'kick') ?? free[0];
    } else {
      for (const [m, role] of order) {
        if (hasRole(role)) continue;
        const fit = free.find((d) => d.role === role);
        if (fit) {
          what = m;
          pick = fit;
          break;
        }
      }
    }
    if (!pick) return;
    shelf.nudge(pick.id);
    if (speak) narrator.say(hintLines(what));
  }

  ctx.hint.arm(() => suggest(true), HINT_MS);
  ctx.onCleanup(() => ctx.hint.clear());

  // ---- the loop ------------------------------------------------------------------------------
  startLoop(ctx, (now, dt) => {
    const events = groove.drain(now);
    const phase = groove.phase(now);
    stage.update({ now, dt, phase, events, activeIdx: phase ? phase.idx : -1, startsAt: (s) => groove.startsAt(s), low: perf.low });
  });

  // ---- go ------------------------------------------------------------------------------------
  renderSong();
  refreshShelf();
  renderQuest();
  renderAgain();

  ctx.onCleanup(() => {
    alive = false;
    groove.stop();
    narrator.stop();
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    while (disposers.length) disposers.pop()?.();
    botDispose.forEach((d) => d());
    botDispose.clear();
    stage.dispose();
    shelf.dispose();
  });
}
