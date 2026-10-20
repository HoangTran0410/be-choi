/**
 * Thế giới nhỏ của bé: one book of friends and one set of buttons over several
 * little worlds. This file is the hand between them — it opens a world, hears
 * what the child did there, counts it towards the errands, and hands out what
 * the errands earn. The worlds themselves are the older games' engines.
 */
import { h } from '../../core/dom';
import { sayLines, speakText } from '../../core/say';
import { onPerfChange, perf } from '../../core/frame';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import { BOOK, CATALOG, kindByKey } from './catalog';
import { openBook, owned } from './book';
import { openDecor, type PhotoAction } from './decorPanel';
import { createForest } from './forest';
import { addToHome } from './homes';
import { createHud, type Tool } from './hud';
import { type Panel } from './panel';
import { createPhotoLayer } from './photos';
import { createPond } from './pond';
import { complete, feedEgg, hatchKey, progress, questById, refill, type QuestDef, type QuestEvent, type Reward } from './quests';
import { describe, type RevealWhat } from './reveal';
import { collect, importLegacy, load, store, type HabitatSave } from './save';
import { childContext, type Scene } from './scene';
import { createWater } from './water';
import { openWorlds } from './worldPicker';
import { worldById, type Realm, type WorldId } from './worlds';

/** The voice used for names and counting: slower than for everything else. */
/** The least gap between two feedings that count as two. */
const FEED_GAP_MS = 500;
/** How long an uncollected reward card stays up by itself. */
const REVEAL_MS = 5200;
const NAMES = new Set(CATALOG.map((k) => k.name));

export function createGame(ctx: GameContext): void {
  const save: HabitatSave = load();
  let photoList: Photo[] = [];
  const questWorld = (): { hasPhotos: boolean } => ({ hasPhotos: photoList.length > 0 });
  importLegacy(save);
  refill(save, questWorld());
  const persist = (): void => store(save);
  persist();

  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  };
  /** Slow, split into short parts; a new line cuts the last one off. */
  const say = (text: string): void => speakText(ctx, text);

  const root = h('div', { class: 'habitat' });
  const sceneHost = h('div', { class: 'hb-scene' });
  const layer = createPhotoLayer({ save, audio: ctx.audio, persist });
  let scene: Scene | null = null;
  let panel: Panel | null = null;
  let lastFeed = 0;
  /** Animals that arrived while their home was not on screen: they swim in when it is. */
  const arrivals: Record<Realm, string[]> = { fresh: [], sea: [], forest: [] };

  const hud = createHud((fn) => ctx.onCleanup(fn), {
    onWorld: () => openWorldPicker(),
    onBook: () => {
      syncLiving();
      openPanel_(openBook({ host: root, save, audio: ctx.audio, speak: (t) => speakText(ctx, t) }));
    },
    onTool: (tool) => useTool(tool),
    onChip: (q) => {
      say(q.say);
      const target = toolFor(q);
      if (target) hud.nudge(target);
    },
    onEgg: () => hatch(),
    onBack: () => go(save.world === 'pond' ? 'fresh' : save.world),
  });
  root.append(sceneHost, layer.el, hud.el);
  ctx.stage.append(root);
  root.classList.toggle('hb-low', perf.low);
  ctx.onCleanup(onPerfChange((low) => root.classList.toggle('hb-low', low)));

  function openPanel_(next: Panel): void {
    panel?.close();
    panel = next;
  }

  // ---- what the child has ----

  /** Anyone living in the world on screen who is not in the book yet (an older save's tank) goes in. */
  function syncLiving(): void {
    if (!scene) return;
    let changed = false;
    for (const key of scene.living()) changed = collect(save, key) || changed;
    if (changed) {
      persist();
      hud.setBook(owned(save), BOOK.length);
    }
  }

  /** Let an animal into its home: swimming in if the child is there, waiting for them if not. */
  function giveTo(key: string): void {
    const kind = kindByKey(key);
    if (!kind) return;
    const here = scene && scene.hasTank && worldById(scene.world)?.realm === kind.realm;
    if (here) {
      scene!.addFriend(key);
      return;
    }
    addToHome(key);
    if (kind.realm !== 'forest') arrivals[kind.realm].push(key);
  }

  // ---- errands ----

  function emit(ev: QuestEvent): void {
    const done = progress(save, ev);
    hud.setChips(save.quests.active);
    persist();
    for (const q of done) later(() => finish(q), 450);
  }

  function finish(q: QuestDef): void {
    if (!save.quests.active.some((s) => s.id === q.id)) return;
    hud.cheer(q.id);
    ctx.addStar();
    void ctx.celebrate();
    const rewards = complete(save, q.id, questWorld());
    hud.setChips(save.quests.active);
    hud.setBook(owned(save), BOOK.length);
    persist();
    for (const r of rewards) later(() => grant(r), 1500);
  }

  function grant(r: Reward): void {
    switch (r.type) {
      case 'species':
        giveTo(r.key);
        enqueue({ type: 'species', key: r.key, count: owned(save), how: 'quest' });
        break;
      case 'decor':
        enqueue({ type: 'decor', id: r.id });
        break;
      case 'world':
        for (const key of r.gift) giveTo(key);
        enqueue({ type: 'world', id: r.id });
        for (const key of r.gift) enqueue({ type: 'species', key, count: owned(save), how: 'gift' });
        break;
      case 'star':
        enqueue({ type: 'star', stars: save.stars });
        break;
    }
    hud.setBook(owned(save), BOOK.length);
    persist();
  }

  // ---- showing what was won, one at a time ----

  const queue: RevealWhat[] = [];
  let showing = false;
  function enqueue(what: RevealWhat): void {
    queue.push(what);
    pump();
  }
  function pump(): void {
    if (showing || !alive) return;
    const what = queue.shift();
    if (!what) return;
    showing = true;
    const shown = describe(what);
    const card = h('div', { class: 'hb-reveal', role: 'status' }, h('div', { class: 'hb-reveal-rays', 'aria-hidden': 'true' }), shown.el);
    const opened = Date.now();
    let done = false;
    const close = (): void => {
      if (done) return;
      done = true;
      card.remove();
      showing = false;
      pump();
    };
    card.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (Date.now() - opened > 700) close();
    });
    root.append(card);
    ctx.audio.jingle();
    // One sequence: the second line waits for the first instead of cutting it off.
    void sayLines(ctx, shown.say.filter(Boolean));
    later(close, REVEAL_MS);
  }

  // ---- worlds ----

  function toolFor(q: QuestDef): Tool | 'world' | null {
    switch (q.kind) {
      case 'feed':
      case 'hatch':
        return 'feed';
      case 'decor':
      case 'frame':
      case 'visitors':
        return 'decor';
      case 'night':
        return 'night';
      case 'add':
        return 'add';
      case 'catch':
        return 'special';
      case 'visit':
        return 'world';
      default:
        return null;
    }
  }

  function mount(id: WorldId): void {
    if (scene) {
      syncLiving();
      scene.flush();
      scene.destroy();
      scene = null;
    }
    sceneHost.replaceChildren();
    const def = worldById(id)!;
    const listen = {
      speak: (text: string) => {
        if (NAMES.has(text)) emit({ kind: 'hello' });
      },
      // Names are said slowest, on their own.
      isName: (text: string) => NAMES.has(text),
    };
    const make = (stage: HTMLElement) => childContext(ctx, stage, listen);
    if (def.engine === 'water') {
      const stage = h('div', { class: 'hb-embed' });
      sceneHost.append(stage);
      scene = createWater(make(stage), { world: def.id as 'fresh' | 'sea', save, persist, arrivals: arrivals[def.realm].splice(0) });
    } else if (def.engine === 'forest') {
      scene = createForest(sceneHost, { make });
    } else {
      scene = createPond(sceneHost, make, { onCatch });
    }
    const pond = def.engine === 'pond';
    hud.setWorld(def);
    hud.setMode(pond ? 'pond' : 'tank');
    const forest = def.engine === 'forest';
    hud.setIcons(forest ? '🦎' : '🐟', forest ? '🐛' : '🍤', forest ? '💦' : '🎣');
    if (pond) hud.setBackIcon(worldById(save.world === 'pond' ? 'fresh' : save.world)?.icon ?? '🐠');
    hud.setNight(scene.isNight());
    layer.show(pond ? null : def.realm);
    syncLiving();
  }

  function go(id: WorldId): void {
    if (!save.worlds.includes(id)) return;
    panel?.close();
    if (id !== 'pond') save.world = id;
    mount(id);
    persist();
    say(worldById(id)!.name);
    emit({ kind: 'visit', world: id });
    armHint();
  }

  function openWorldPicker(): void {
    openPanel_(
      openWorlds({
        host: root,
        save,
        current: scene?.world ?? 'fresh',
        audio: ctx.audio,
        speak: (t) => speakText(ctx, t),
        onPick: (id) => go(id),
      }),
    );
  }

  function onCatch(id: string): void {
    const key = `aq:${id}`;
    const kind = kindByKey(key);
    if (!kind) return;
    const isNew = collect(save, key);
    addToHome(key);
    arrivals[kind.realm].push(key);
    hud.setBook(owned(save), BOOK.length);
    persist();
    emit({ kind: 'catch' });
    if (isNew) enqueue({ type: 'species', key, count: owned(save), how: 'catch' });
  }

  // ---- the buttons ----

  function currentRealm(): Realm {
    return worldById(scene?.world ?? 'fresh')?.realm ?? 'fresh';
  }

  function useTool(tool: Tool): void {
    if (!scene) return;
    ctx.hint.touch();
    switch (tool) {
      case 'add':
        if (!scene.hasTank) return;
        openPanel_(
          openBook(
            { host: root, save, audio: ctx.audio, speak: (t) => speakText(ctx, t) },
            {
              realms: [currentRealm()],
              onPick: (kind) => {
                scene?.addFriend(kind.key);
                emit({ kind: 'add' });
              },
            },
          ),
        );
        break;
      case 'decor':
        openPanel_(
          openDecor({
            host: root,
            save,
            realm: currentRealm(),
            audio: ctx.audio,
            speak: (t) => speakText(ctx, t),
            hasPhotos: photoList.length > 0,
            onDecor: (id) => {
              if (scene?.addDecor(id)) {
                emit({ kind: 'decor' });
                persist();
              }
            },
            onPhoto: (action) => photoAction(action),
          }),
        );
        break;
      case 'feed': {
        const now = Date.now();
        if (!scene.hasTank || now - lastFeed < FEED_GAP_MS) return;
        lastFeed = now;
        scene.feed();
        emit({ kind: 'feed' });
        if (feedEgg(save)) {
          hud.showEgg(true);
          say('Có một quả trứng! Chạm vào trứng nhé!');
        }
        persist();
        break;
      }
      case 'night': {
        if (!scene.hasTank) return;
        const night = scene.toggleNight();
        hud.setNight(night);
        if (night) emit({ kind: 'night' });
        break;
      }
      case 'special':
        if (scene.world === 'forest') scene.special();
        else go('pond');
        break;
    }
    armHint();
  }

  // ---- family photos ----

  function chooseAnd(none: boolean, then: (id: string | null) => void): void {
    const choices: PickerChoice[] = photoList.map((p) => ({ id: p.id, url: p.url, label: 'ảnh' }));
    if (none) choices.push({ id: '', emoji: '🚫', label: 'không dùng ảnh' });
    showPhotoPicker(root, choices, (choice) => {
      if (choice) then(choice.id || null);
    });
  }

  function photoAction(action: PhotoAction): void {
    switch (action) {
      case 'frame':
        chooseAnd(false, (id) => {
          if (id && layer.addFrame(id)) {
            ctx.audio.pop(1.2);
            say('Treo ảnh lên rồi!');
            emit({ kind: 'frame' });
          }
        });
        break;
      case 'backdrop':
        chooseAnd(true, (id) => {
          layer.setBackdrop(id);
          ctx.audio.pop(1.2);
          say(id ? 'Ảnh làm nền đẹp quá!' : 'Bỏ ảnh nền rồi!');
        });
        break;
      case 'visitors':
        chooseAnd(false, (id) => {
          if (id && layer.addVisitor(id)) {
            ctx.audio.pop(1.2);
            say('Có khách đến xem nhà bạn!');
            emit({ kind: 'visitors' });
          }
        });
        break;
      case 'clear':
        scene?.clearExtras();
        layer.clear();
        ctx.audio.puff();
        say('Dọn sạch rồi!');
        break;
    }
  }

  ctx.photos
    .list()
    .then((list) => {
      if (!alive) return;
      photoList = list;
      layer.setPhotos(list);
      refill(save, questWorld());
      hud.setChips(save.quests.active);
    })
    .catch(() => undefined);
  ctx.onCleanup(
    ctx.photos.onChange((list) => {
      if (!alive) return;
      photoList = list;
      layer.setPhotos(list);
      refill(save, questWorld());
      hud.setChips(save.quests.active);
      persist();
    }),
  );

  // ---- the egg ----

  function hatch(): void {
    if (!save.egg || !scene) return;
    save.egg = false;
    persist();
    const egg = root.querySelector<HTMLElement>('.hb-egg');
    egg?.classList.add('hb-egg-shake');
    ctx.audio.tick();
    later(() => ctx.audio.tick(), 300);
    later(() => ctx.audio.tick(), 600);
    later(() => {
      hud.showEgg(false);
      egg?.classList.remove('hb-egg-shake');
      const key = hatchKey(save, currentRealm());
      collect(save, key);
      save.hatched++;
      giveTo(key);
      hud.setBook(owned(save), BOOK.length);
      persist();
      emit({ kind: 'hatch' });
      enqueue({ type: 'species', key, count: owned(save), how: 'egg' });
    }, 950);
  }

  // ---- a nudge when nothing has happened for a while ----

  function armHint(): void {
    if (scene?.world === 'pond') return;
    ctx.hint.arm(() => {
      ctx.speak('Bé chạm vào chỗ đang lắc nhé.');
      if (save.egg) return hud.nudge('egg');
      const open = save.quests.active.map((s) => ({ s, q: questById(s.id) })).find((e) => e.q && e.s.got < e.q.n);
      const target = open?.q ? toolFor(open.q) : null;
      hud.nudge(target ?? 'add');
    }, 9000);
  }

  // ---- start and finish ----

  hud.setChips(save.quests.active);
  hud.setBook(owned(save), BOOK.length);
  hud.showEgg(save.egg);
  const home: WorldId = save.world === 'pond' || !save.worlds.includes(save.world) ? 'fresh' : save.world;
  mount(home);
  emit({ kind: 'visit', world: home });
  armHint();

  ctx.onCleanup(() => {
    alive = false;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    panel?.close();
    if (scene) {
      syncLiving();
      scene.flush();
      scene.destroy();
      scene = null;
    }
    layer.destroy();
    persist();
    root.remove();
  });
}
