import { h, replay } from '../../core/dom';
import type { Point } from '../../core/creature';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  Creature,
  DROPS_PER_MIST,
  INTEREST_SECONDS,
  MAX_CREATURES,
  MIST_SECONDS,
  POKE_SECONDS,
  SAVE_KEY,
  SHAKE_SECONDS,
  SPECIES,
  STAR_EVERY_TAP,
  addFood,
  applySave,
  crowdedOut,
  decorAt,
  makeDecor,
  makeDrops,
  makePebbles,
  makePlants,
  makeSave,
  makeVivarium,
  plantAt,
  pokeDecor,
  readSave,
  savedStock,
  settleScenery,
  sheltersFrom,
  stepDrops,
  stepFood,
  stocking,
  type Decor,
  type Drop,
  type Food,
  type Interest,
  type Nudge,
  type Pebble,
  type Plant,
  type Shelter,
  type Species,
  type Vivarium,
} from './logic';
import { drawBack, drawCreature, drawDrops, drawFoodItem, drawGlass, drawPlant, drawSoil, type Scene } from './draw';
import './style.css';

/** Longest frame the simulation will take in one step. */
const MAX_STEP = 0.05;
/**
 * How soon after a press the button drops more food. A two-year-old presses a
 * button the way they press a doorbell; this is only long enough to keep one
 * press from counting twice.
 */
const FEED_EVERY = 0.5;
/** …and the same for the spray, which is even more fun to hold down. */
const MIST_EVERY = 0.6;
/** The most drops the glass holds at once. */
const MAX_DROPS = 90;
/** How far a finger must travel before a tap on an animal becomes a lift. */
const GRAB_SLOP = 14;

/** One thing to be drawn in the soil bank, and how far forward it stands. */
interface Layer {
  y: number;
  /** 0 plant, 1 ornament, 2 animal, 3 food. */
  k: 0 | 1 | 2 | 3;
  i: number;
}

/**
 * Bể cạn: a terrarium that runs whether or not anybody is playing with it.
 *
 * Every animal is a spine — a head that leads and a chain of vertebrae that may
 * not bend past a limit — with legs solved by two-bone IK onto whatever it is
 * standing on. That last part is the whole game: the surface can be the soil, it
 * can be a pane of side glass, and it can be the underside of the lid, so a gecko
 * walks up the wall and hangs upside down without a single special case in the
 * drawing code.
 *
 * The child can tap an animal to be told what it is, run a finger over the soil
 * (curious ones come, shy ones bolt), press 🐛 to drop crickets that crawl about
 * until somebody eats them — a star each time the soil is cleared, marked by a
 * bell rather than by confetti over the box — and press 💦 to mist the glass.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'terrarium-canvas' });
  const feed = h('button', { class: 'terrarium-feed', type: 'button', 'aria-label': 'cho ăn' }, '🐛');
  // The jar only appears while an animal is in the child's fingers, so it can
  // never be pressed by accident — and nothing leaves the box unless it is meant to.
  const jar = h('div', { class: 'terrarium-jar', 'aria-hidden': 'true' }, '🫙');
  // One button rather than a row of them: a tray of twelve animals took the whole
  // bottom of the box, which is where the animals are.
  const add = h('button', { class: 'terrarium-add', type: 'button', 'aria-label': 'thêm bạn' }, '🦎');
  const mist = h('button', { class: 'terrarium-mist', type: 'button', 'aria-label': 'xịt nước' }, '💦');
  // Lights out. At night only the lamp on the lid lights anything — and the day
  // animals curl up while the gecko, the snail and the cricket come out.
  const lamp = h('button', { class: 'terrarium-lamp', type: 'button', 'aria-label': 'bật tắt đèn' }, '🌙');
  const root = h('div', { class: 'terrarium' }, canvas, feed, add, mist, lamp, jar);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let viv: Vivarium = makeVivarium(1, 1);
  let creatures: Creature[] = [];
  let plants: Plant[] = [];
  let decor: Decor[] = [];
  let pebbles: Pebble[] = [];
  let foods: Food[] = [];
  let drops: Drop[] = [];
  let nudge: Nudge | null = null;
  let shelters: Shelter[] = [];
  /** Something that was just poked, and is worth a look. */
  let interest: Interest | null = null;
  /** The animal in the child's fingers, and where the finger went down. */
  let held: Creature | null = null;
  let grabFrom: Point | null = null;
  let grabCandidate: Creature | null = null;
  /** A plant or an ornament the child is sliding along the soil. */
  let moving: Plant | Decor | null = null;
  /** What would be slid along the soil if the finger travels from here. */
  let movable: Plant | Decor | null = null;
  /** Lights out: the box is dark except for the pool under the lamp. */
  let night = false;
  /** Eases between day and night so the switch is a dimmer, not a light switch. */
  let dusk = 0;
  /** 1 just after a spray, fading out: wet glass is slippery. */
  let wet = 0;
  let taps = 0;
  let clock = 0;
  let feeding = false;
  /** When the last helping went in, and the last spray, on the box's own clock. */
  let lastFed = -Infinity;
  let lastMist = -Infinity;
  /** Timers this game started, so leaving takes them with us. */
  const timers: ReturnType<typeof setTimeout>[] = [];

  function later(fn: () => void, ms: number): void {
    timers.push(setTimeout(() => alive && fn(), ms));
  }

  // ---- the box itself ----

  function build(): void {
    const w = root.clientWidth;
    const hgt = root.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    viv = makeVivarium(w, hgt);
    plants = makePlants(viv);
    decor = makeDecor(viv);
    pebbles = makePebbles(viv);
    // Put the box back the way the child left it, if they left one.
    const save = readSave(load());
    if (save) {
      applySave(save, decor, plants, viv);
      night = save.night === true;
      dusk = night ? 1 : 0;
      lamp.textContent = night ? '☀️' : '🌙';
      root.classList.toggle('terrarium-night', night);
    }
    creatures = (savedStock(save) ?? stocking(viv)).map((species) => new Creature(species, viv));
    shelters = sheltersFrom(viv, plants, decor);
    foods = [];
    drops = [];
    wet = 0;
    feeding = false;
    held = null;
    grabCandidate = null;
    grabFrom = null;
    root.classList.remove('terrarium-dragging');
    jar.classList.remove('terrarium-jar-over');
  }

  // ---- the box the child built ----

  function load(): string | null {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Keep who lives here and where the furniture ended up. Called after anything
   * the child did on purpose, never every frame: this is their box, not a replay.
   */
  function save(): void {
    if (!viv.w) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave(creatures, decor, plants, viv, night)));
    } catch {
      /* private browsing, or storage full: the box still plays, it just forgets */
    }
  }

  // ---- choosing an animal to add ----

  /** One little picture per species, drawn once and kept for the picker. */
  const portraits = new Map<string, HTMLCanvasElement>();
  /** The open picker, so leaving the game takes it with us. */
  let closePicker: (() => void) | null = null;

  /** Where a creature's whole body sits, legs and all, so it can be framed. */
  function bodyBox(cr: Creature): { cx: number; cy: number; w: number; h: number } {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    // Legs, wings and eye stalks all reach well past the spine.
    const reach = cr.length * (cr.species.kind === 'flyer' ? 0.5 : 0.3);
    cr.spine.joints.forEach((joint, i) => {
      const pad = Math.max(cr.spine.widthAt(i) * 2.4, reach);
      left = Math.min(left, joint.x - pad);
      right = Math.max(right, joint.x + pad);
      top = Math.min(top, joint.y - pad);
      bottom = Math.max(bottom, joint.y + pad);
    });
    return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
  }

  /**
   * A portrait of one species, drawn with the same code that draws it walking.
   * The child picks the animal they can see rather than a word they cannot read.
   */
  function portrait(species: Species): HTMLCanvasElement {
    const found = portraits.get(species.id);
    if (found) return found;
    const px = 64;
    const art = h('canvas', { class: 'terrarium-chip-art', width: px * 2, height: px * 2 });
    const cc = art.getContext('2d');
    if (cc) {
      const mini = makeVivarium(px * 2, px * 2);
      const posed = new Creature(species, mini, () => 0.5, { x: px, y: mini.floor + px * 0.2 });
      posed.heading = 0;
      posed.spine.replant(posed.bodyX, posed.bodyY, 0);
      // A creature's x is its head, not its middle, and every species is a
      // different size and shape. Fit the whole body to the button instead, so an
      // ant is as easy to hit as a snake and nothing hangs off the edge.
      const box = bodyBox(posed);
      const zoom = Math.min((px * 1.75) / Math.max(1, box.w), (px * 1.75) / Math.max(1, box.h));
      cc.setTransform(zoom, 0, 0, zoom, px - box.cx * zoom, px - box.cy * zoom);
      drawCreature(cc, posed, 0, { viv: mini, clock: 0, moods: false });
      cc.setTransform(1, 0, 0, 1, 0, 0);
    }
    portraits.set(species.id, art);
    return art;
  }

  /**
   * The picker. Choosing closes it, because the point of choosing an animal is
   * watching it walk in — which cannot be seen from behind a panel.
   */
  function openPicker(): void {
    if (closePicker) return;
    let done = false;
    // The tap that opened this must not also choose from it. Even opening on
    // pointerup, a finger held down over a tile would land on it the moment the
    // panel appeared underneath.
    const opened = Date.now();
    const settled = (): boolean => Date.now() - opened > 250;
    const finish = (species: Species | null): void => {
      if (done) return;
      done = true;
      overlay.remove();
      closePicker = null;
      if (species) addPet(species);
    };
    const tiles = SPECIES.map((species) => {
      const tile = h(
        'button',
        { class: 'pp-tile terrarium-pick', type: 'button', 'aria-label': species.name, 'data-species': species.id },
        portrait(species),
      );
      tile.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (settled()) finish(species);
      });
      return tile;
    });
    const shut = h('button', { class: 'pp-close btn-round', type: 'button', 'aria-label': 'Đóng' }, '✕');
    shut.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (settled()) finish(null);
    });
    const overlay = h(
      'div',
      { class: 'pp-overlay terrarium-picker' },
      h('div', { class: 'pp-panel' }, h('div', { class: 'pp-grid' }, ...tiles)),
      shut,
    );
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay && settled()) finish(null);
    });
    root.append(overlay);
    closePicker = () => finish(null);
    ctx.audio.tick();
  }

  /** A new animal walks in from whichever wall is nearer. */
  function addPet(species: Species): void {
    ctx.hint.touch();
    // A full box makes room for the new one rather than refusing it: the one that
    // goes is one of whichever kind there are already most of.
    if (creatures.length >= MAX_CREATURES) {
      const goes = crowdedOut(creatures.map((cr) => cr.species.id));
      const leaving = creatures[goes >= 0 ? goes : 0];
      if (leaving) creatures = creatures.filter((cr) => cr !== leaving);
      ctx.audio.puff();
    }
    const fromLeft = Math.random() < 0.5;
    const cr = new Creature(species, viv, Math.random, {
      x: fromLeft ? -viv.unit : viv.w + viv.unit,
      y: viv.floor + (viv.front - viv.floor) * (0.2 + Math.random() * 0.6),
    });
    cr.heading = fromLeft ? 0 : Math.PI;
    cr.spine.replant(cr.bodyX, cr.bodyY, cr.heading);
    cr.joy = 1.4;
    creatures.push(cr);
    save();
    ctx.audio.pop(1.3);
    navigator.vibrate?.(10);
    speakFor(cr);
  }

  /** Its own voice first if it has one, then its name — never both at once. */
  function speakFor(cr: Creature): void {
    if (cr.species.voice) {
      ctx.audio.fx(cr.species.voice);
      later(() => ctx.speak(cr.species.name), 700);
      return;
    }
    ctx.speak(cr.species.name);
  }

  // ---- the furniture ----

  function drawRock(g: CanvasRenderingContext2D, d: Decor): void {
    const r = d.size * viv.unit * 0.5;
    const shade = (d.layer === 'near' ? 74 : 116) + d.hue * 38;
    g.fillStyle = `rgb(${shade},${shade - 8},${shade - 20})`;
    g.beginPath();
    g.moveTo(d.x - r * 1.15, d.y);
    g.bezierCurveTo(d.x - r * 1.2, d.y - r * 0.9, d.x - r * 0.5, d.y - r * 1.3, d.x, d.y - r * 1.2);
    g.bezierCurveTo(d.x + r * 0.65, d.y - r * 1.35, d.x + r * 1.2, d.y - r * 0.8, d.x + r * 1.1, d.y);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.ellipse(d.x - r * 0.35, d.y - r * 0.82, r * 0.4, r * 0.2, -0.4, 0, Math.PI * 2);
    g.fill();
  }

  /** A hollow log: the best hiding place in the box, and the one with a doorway. */
  function drawLog(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    const r = u * 0.36;
    const left = d.x - u * 0.55;
    const right = d.x + u * 0.55;
    // A lying cylinder: a rounded top and bottom rather than a rectangle, or it
    // is a plank and no child believes anything lives inside a plank.
    const barrel = g.createLinearGradient(0, d.y - r * 1.6, 0, d.y);
    barrel.addColorStop(0, `hsl(${26 + d.hue * 12} 32% 44%)`);
    barrel.addColorStop(0.55, `hsl(${24 + d.hue * 12} 33% 34%)`);
    barrel.addColorStop(1, `hsl(${22 + d.hue * 12} 34% 24%)`);
    g.fillStyle = barrel;
    g.beginPath();
    g.moveTo(left, d.y - r * 0.8);
    g.quadraticCurveTo(d.x, d.y - r * 1.9, right, d.y - r * 0.8);
    g.quadraticCurveTo(d.x, d.y + r * 0.35, left, d.y - r * 0.8);
    g.closePath();
    g.fill();
    // Bark, as grooves that follow the curve of the barrel.
    g.strokeStyle = 'rgba(52,28,12,0.35)';
    g.lineWidth = Math.max(1, u * 0.022);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      g.beginPath();
      g.moveTo(left + u * 0.06, d.y - r * (0.8 + t * 0.95));
      g.quadraticCurveTo(d.x, d.y - r * (0.8 + t * 1.5), right - u * 0.06, d.y - r * (0.8 + t * 0.95));
      g.stroke();
    }
    // The open end, which is what makes it a hide rather than a log.
    g.fillStyle = `hsl(${30 + d.hue * 12} 28% 48%)`;
    g.beginPath();
    g.ellipse(left, d.y - r * 0.8, r * 0.28, r * 0.85, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2b1a0e';
    g.beginPath();
    g.ellipse(left, d.y - r * 0.8, r * 0.17, r * 0.58, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.09)';
    g.beginPath();
    g.ellipse(d.x, d.y - r * 1.5, u * 0.32, r * 0.12, 0, 0, Math.PI * 2);
    g.fill();
  }

  /** A leaning branch, which is what a chameleon would pick if it were asked. */
  function drawBranch(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    const lean = (d.hue - 0.5) * 0.5;
    g.strokeStyle = '#6b4423';
    g.lineCap = 'round';
    g.lineWidth = u * 0.11;
    g.beginPath();
    g.moveTo(d.x, d.y);
    g.quadraticCurveTo(d.x + lean * u * 0.5, d.y - u * 0.6, d.x + lean * u, d.y - u * 1.15);
    g.stroke();
    g.lineWidth = u * 0.05;
    for (const twig of [0.45, 0.75]) {
      const bx = d.x + lean * u * twig;
      const by = d.y - u * 1.15 * twig;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + u * 0.2 * (twig > 0.6 ? -1 : 1), by - u * 0.14, bx + u * 0.36 * (twig > 0.6 ? -1 : 1), by - u * 0.34);
      g.stroke();
    }
    // A few leaves, breathing in the warm air off the lamp.
    for (let i = 0; i < 5; i++) {
      const along = 0.35 + (i / 5) * 0.6;
      const lx = d.x + lean * u * along + Math.sin(clock * 0.8 + i + d.phase) * u * 0.03;
      const ly = d.y - u * 1.15 * along;
      g.fillStyle = `hsl(${104 + i * 8} 44% ${28 + i * 3}%)`;
      g.beginPath();
      g.ellipse(lx + (i % 2 ? u * 0.16 : -u * 0.16), ly, u * 0.17, u * 0.075, i % 2 ? -0.5 : 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** A stone hide with a doorway, dark inside. */
  function drawCave(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    const shade = 122 + d.hue * 30;
    g.fillStyle = `rgb(${shade},${shade - 10},${shade - 24})`;
    g.beginPath();
    g.moveTo(d.x - u * 0.6, d.y);
    g.quadraticCurveTo(d.x - u * 0.62, d.y - u * 0.72, d.x, d.y - u * 0.8);
    g.quadraticCurveTo(d.x + u * 0.62, d.y - u * 0.72, d.x + u * 0.6, d.y);
    g.closePath();
    g.fill();
    g.fillStyle = '#211510';
    g.beginPath();
    g.moveTo(d.x - u * 0.2, d.y);
    g.quadraticCurveTo(d.x - u * 0.21, d.y - u * 0.4, d.x, d.y - u * 0.44);
    g.quadraticCurveTo(d.x + u * 0.21, d.y - u * 0.4, d.x + u * 0.2, d.y);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.ellipse(d.x - u * 0.28, d.y - u * 0.52, u * 0.16, u * 0.08, -0.5, 0, Math.PI * 2);
    g.fill();
  }

  /** The water dish. Poked, it slops about; the level is where the child left it. */
  function drawDish(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    const ripple = d.poke / POKE_SECONDS;
    g.fillStyle = '#a8a29e';
    g.beginPath();
    g.ellipse(d.x, d.y, u * 0.5, u * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    const level = d.open ? 0.42 : 0.3;
    g.fillStyle = 'rgba(125,211,252,0.75)';
    g.beginPath();
    g.ellipse(d.x, d.y - u * 0.03, u * level, u * (level * 0.34 + ripple * 0.03), 0, 0, Math.PI * 2);
    g.fill();
    if (ripple > 0) {
      g.strokeStyle = `rgba(255,255,255,${0.5 * ripple})`;
      g.lineWidth = Math.max(1, u * 0.02);
      g.beginPath();
      g.ellipse(d.x, d.y - u * 0.03, u * level * (0.4 + (1 - ripple) * 0.6), u * level * 0.2, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = Math.max(1, u * 0.025);
    g.beginPath();
    g.ellipse(d.x, d.y, u * 0.5, u * 0.17, 0, Math.PI, Math.PI * 2);
    g.stroke();
  }

  /** A flower, which is the one thing in the box a butterfly is interested in. */
  function drawFlower(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    const shy = d.poke / POKE_SECONDS;
    const sway = Math.sin(clock * 1.1 + d.phase) * u * 0.06;
    g.strokeStyle = '#4d7c0f';
    g.lineWidth = Math.max(1.5, u * 0.05);
    g.beginPath();
    g.moveTo(d.x, d.y);
    g.quadraticCurveTo(d.x + sway * 0.5, d.y - u * 0.4, d.x + sway, d.y - u * 0.72);
    g.stroke();
    const cx = d.x + sway;
    const cy = d.y - u * 0.72;
    const petals = `hsl(${d.hue * 360} 82% ${68 - shy * 8}%)`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + shy * 0.5;
      g.fillStyle = petals;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * u * 0.16, cy + Math.sin(a) * u * 0.16, u * 0.14, u * 0.09, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fcd34d';
    g.beginPath();
    g.arc(cx, cy, u * 0.1, 0, Math.PI * 2);
    g.fill();
  }

  /** The big leaf against the front glass, which frames the picture. */
  function drawLeaf(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    const wave = Math.sin(clock * 0.7 + d.phase) * 0.05 + d.poke * 0.1;
    for (let i = 0; i < 3; i++) {
      const lean = (i - 1) * 0.5 + wave;
      const tall = u * (0.75 + i * 0.16);
      g.save();
      g.translate(d.x, d.y);
      g.rotate(lean);
      g.fillStyle = `hsl(${118 + i * 8} 40% ${17 + i * 5}%)`;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(-u * 0.32, -tall * 0.55, 0, -tall);
      g.quadraticCurveTo(u * 0.32, -tall * 0.55, 0, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = Math.max(1, u * 0.02);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -tall * 0.92);
      g.stroke();
      g.restore();
    }
  }

  /** A mossy mound: soft cover for the small ones. */
  function drawMoss(g: CanvasRenderingContext2D, d: Decor): void {
    const u = d.size * viv.unit;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI;
      g.fillStyle = `hsl(${96 + (i % 3) * 10} ${38 + (i % 2) * 12}% ${24 + (i % 4) * 5}%)`;
      g.beginPath();
      g.arc(d.x + Math.cos(a + Math.PI) * u * 0.42, d.y - Math.sin(a) * u * 0.2, u * 0.16, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawDecor(g: CanvasRenderingContext2D, d: Decor): void {
    // A poked ornament rocks on its base for a moment, so a tap always lands
    // somewhere visible even on the things that cannot open or curl.
    if (d.poke > 0) {
      g.save();
      g.translate(d.x, d.y);
      g.rotate(Math.sin(d.poke * 30) * 0.05 * d.poke);
      g.translate(-d.x, -d.y);
      drawDecorBody(g, d);
      g.restore();
      return;
    }
    drawDecorBody(g, d);
  }

  function drawDecorBody(g: CanvasRenderingContext2D, d: Decor): void {
    switch (d.kind) {
      case 'rock':
        return drawRock(g, d);
      case 'log':
        return drawLog(g, d);
      case 'branch':
        return drawBranch(g, d);
      case 'cave':
        return drawCave(g, d);
      case 'dish':
        return drawDish(g, d);
      case 'flower':
        return drawFlower(g, d);
      case 'leaf':
        return drawLeaf(g, d);
      case 'moss':
        return drawMoss(g, d);
    }
  }

  /** The heat lamp on the lid, and the warm pool it throws on the soil by day. */
  function drawLamp(g: CanvasRenderingContext2D): void {
    const x = viv.w * 0.5;
    const y = viv.top * 0.58;
    g.fillStyle = '#3f2d1e';
    g.beginPath();
    g.moveTo(x - viv.unit * 0.42, viv.top * 0.42);
    g.lineTo(x + viv.unit * 0.42, viv.top * 0.42);
    g.lineTo(x + viv.unit * 0.26, y + viv.unit * 0.12);
    g.lineTo(x - viv.unit * 0.26, y + viv.unit * 0.12);
    g.closePath();
    g.fill();
    g.fillStyle = night ? '#fef3c7' : '#fde68a';
    g.beginPath();
    g.ellipse(x, y + viv.unit * 0.12, viv.unit * 0.24, viv.unit * 0.07, 0, 0, Math.PI * 2);
    g.fill();
  }

  // ---- the loop ----

  function step(dt: number): void {
    clock += dt;
    // A box does not go dark in one frame; give the eye a couple of seconds.
    dusk += ((night ? 1 : 0) - dusk) * Math.min(1, dt * 1.2);
    wet = Math.max(0, wet - dt / MIST_SECONDS);
    settleScenery(plants, decor, dt);
    stepDrops(drops, dt);
    if (interest) {
      interest.life -= dt;
      if (interest.life <= 0) interest = null;
    }
    stepFood(foods, dt, viv);
    const world = { foods, nudge, shelters, interest, neighbours: creatures, night: dusk > 0.5, wet };
    for (const cr of creatures) {
      if (cr.update(dt, viv, world)) ctx.audio.chomp();
      // An animal brushing past a tuft sets it waving, which is what makes the
      // planting feel like part of the box rather than wallpaper.
      if (cr.surface === 'ground') {
        const brushed = plantAt(plants, cr.bodyX, cr.y, viv);
        if (brushed) brushed.shake = Math.max(brushed.shake, SHAKE_SECONDS * 0.45);
      }
    }
    // Eaten food leaves the list rather than lying in it: the button no longer
    // waits for the soil to clear, so nothing else would ever shorten it.
    if (foods.some((f) => f.eaten)) foods = foods.filter((f) => !f.eaten);
    // The star is for a box that has been fed until nothing is left, however many
    // helpings that took — so pressing more cannot earn it any faster.
    if (feeding && foods.length === 0) {
      feeding = false;
      // A quiet bell rather than ctx.celebrate(): 🐛 gets pressed again and
      // again, and confetti over the box every time turns a box to watch into
      // something that keeps interrupting itself. Same call as the tank next door.
      ctx.audio.ding();
      ctx.addStar();
    }
    // After dark, one cricket somewhere in the room. It is the whole sound of a
    // terrarium at night, and it is the reason to press the lamp at all.
    if (dusk > 0.7 && Math.random() < dt * 0.1) ctx.audio.fx('cricket');
  }

  /**
   * Depth here is drawing order, not motion: the soil bank runs from the back
   * wall to the front glass, and everything standing in it — plants, ornaments,
   * animals, crickets — is drawn in the order it stands. Anything up the glass
   * has left the bank behind and is drawn first, at the back.
   */
  const order: Layer[] = [];

  function sortBank(): void {
    order.length = 0;
    plants.forEach((plant, i) => order.push({ y: plant.y, k: 0, i }));
    decor.forEach((d, i) => {
      if (d.layer === 'mid') order.push({ y: d.y, k: 1, i });
    });
    creatures.forEach((cr, i) => {
      if (cr.held) return;
      // Anything up the glass has left the bank behind: draw it at the very back,
      // against the side pane, rather than sorting it in among the planting.
      const climbing = cr.surface === 'left' || cr.surface === 'right' || cr.surface === 'ceiling';
      order.push({ y: climbing ? viv.floor - viv.unit : cr.y, k: 2, i });
    });
    foods.forEach((food, i) => {
      if (!food.eaten) order.push({ y: food.y, k: 3, i });
    });
    order.sort((a, b) => a.y - b.y);
  }

  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // One of these per frame rather than one per animal: with a box full of
    // animals that is a few hundred throwaway objects a second.
    const view: Scene = { viv, clock };
    drawBack(g, viv);
    drawSoil(g, viv, pebbles);
    // The back of the bank, behind everything else standing in it. Drawn after
    // the soil, not before: the soil is nearly half the screen here, so anything
    // painted under it is simply painted out.
    g.save();
    // Distance haze, so the log does not look like it stands among the animals.
    g.globalAlpha = 0.82;
    for (const d of decor) if (d.layer === 'far') drawDecor(g, d);
    g.restore();
    sortBank();
    for (const item of order) {
      if (item.k === 0) {
        const plant = plants[item.i];
        if (plant) drawPlant(g, plant, view, plant.shake / SHAKE_SECONDS);
      } else if (item.k === 1) {
        const d = decor[item.i];
        if (d) drawDecor(g, d);
      } else if (item.k === 2) {
        const cr = creatures[item.i];
        if (cr) drawCreature(g, cr, item.i, view);
      } else {
        const food = foods[item.i];
        if (food) drawFoodItem(g, food, viv);
      }
    }
    for (const d of decor) if (d.layer === 'near') drawDecor(g, d);
    // The animal in the child's hand is drawn last, so it is never lost behind
    // a leaf.
    creatures.forEach((cr, i) => {
      if (cr.held) drawCreature(g, cr, i, view);
    });
    // By day the lamp throws a warm pool down the middle of the bank. It is what
    // a basking spot looks like, and it is where the sleepy ones end up.
    if (dusk < 0.98) {
      g.save();
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = (1 - dusk) * 0.3;
      const pool = g.createRadialGradient(viv.w * 0.5, viv.top, viv.unit * 0.2, viv.w * 0.5, viv.top, viv.h * 0.85);
      pool.addColorStop(0, 'rgba(255,236,180,0.75)');
      pool.addColorStop(0.55, 'rgba(255,224,150,0.22)');
      pool.addColorStop(1, 'rgba(255,214,130,0)');
      g.fillStyle = pool;
      g.fillRect(0, 0, viv.w, viv.h);
      g.restore();
    }
    drawNight(g);
    drawLamp(g);
    drawDrops(g, drops);
    drawGlass(g, viv);
  }

  /**
   * The dark, with the lamp's beam cut out of it, kept on its own canvas. Cutting
   * the hole straight into the box would erase the box: `destination-out` takes
   * away everything under it, animals included, and what shows through is the page
   * behind the canvas. Built here and laid over the top instead, so inside the
   * beam the box is simply untouched — which is what "lit" means.
   */
  const nightLayer = document.createElement('canvas');
  let nightBuiltFor = '';

  function buildNight(): void {
    const key = `${viv.w}x${viv.h}x${dpr}`;
    if (nightBuiltFor === key) return;
    nightLayer.width = Math.max(1, Math.round(viv.w * dpr));
    nightLayer.height = Math.max(1, Math.round(viv.h * dpr));
    const n = nightLayer.getContext('2d');
    if (!n) return;
    nightBuiltFor = key;
    n.setTransform(dpr, 0, 0, dpr, 0, 0);
    n.clearRect(0, 0, viv.w, viv.h);
    n.fillStyle = 'rgba(10,18,44,0.84)';
    n.fillRect(0, 0, viv.w, viv.h);

    const lampX = viv.w * 0.5;
    const lampY = viv.top * 0.7;
    const reach = viv.h * 0.8;
    const hole = n.createRadialGradient(lampX, lampY, reach * 0.05, lampX, lampY, reach);
    // Solid through the beam, soft only at its edge: inside the light an animal
    // should look exactly as it does by day.
    hole.addColorStop(0, 'rgba(0,0,0,1)');
    hole.addColorStop(0.7, 'rgba(0,0,0,1)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    n.globalCompositeOperation = 'destination-out';
    n.fillStyle = hole;
    // Blur the cut so the sides of the beam fade rather than ruling two hard
    // lines across the box. Baked once, so the blur costs nothing per frame.
    try {
      n.filter = `blur(${Math.max(6, viv.unit * 0.45)}px)`;
    } catch {
      /* no filter support: a crisp beam is better than none */
    }
    n.beginPath();
    n.moveTo(lampX - viv.unit * 0.5, 0);
    n.lineTo(lampX + viv.unit * 0.5, 0);
    n.lineTo(lampX + reach * 0.72, viv.h);
    n.lineTo(lampX - reach * 0.72, viv.h);
    n.closePath();
    n.fill();
    n.filter = 'none';
  }

  function drawNight(g: CanvasRenderingContext2D): void {
    if (dusk < 0.01) return;
    buildNight();
    g.save();
    g.globalAlpha = dusk;
    g.drawImage(nightLayer, 0, 0, viv.w, viv.h);
    g.restore();

    // A glow at the bulb itself, and nowhere else: that is where a lamp glows.
    g.save();
    g.globalAlpha = dusk * 0.5;
    g.globalCompositeOperation = 'screen';
    const bulb = g.createRadialGradient(viv.w * 0.5, viv.top * 0.7, 0, viv.w * 0.5, viv.top * 0.7, viv.unit * 1.4);
    bulb.addColorStop(0, 'rgba(255,241,196,0.85)');
    bulb.addColorStop(1, 'rgba(255,241,196,0)');
    g.fillStyle = bulb;
    g.fillRect(0, 0, viv.w, viv.unit * 3);
    g.restore();
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !viv.w) return;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  function at(e: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? viv.w / rect.width : 1;
    const sy = rect.height ? viv.h / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function greet(cr: Creature, p: Point): void {
    cr.startle(p.x, p.y);
    ctx.audio.pop(1.2);
    navigator.vibrate?.(10);
    speakFor(cr);
    taps++;
    if (taps % STAR_EVERY_TAP === 0) {
      ctx.addStar();
      ctx.audio.jingle();
      const star = h('div', { class: 'terrarium-star', style: `left:${(cr.bodyX / viv.w) * 100}%;top:${(cr.bodyY / viv.h) * 100}%` }, '⭐');
      root.append(star);
      later(() => star.remove(), 900);
    }
  }

  /** Is the finger over the jar in the corner? */
  function overJar(e: PointerEvent): boolean {
    const r = jar.getBoundingClientRect();
    const pad = r.width * 0.35;
    return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
  }

  function nearestTo(x: number, y: number): Creature | null {
    let best: Creature | null = null;
    let bestAway = Infinity;
    for (const cr of creatures) {
      const away = Math.hypot(cr.bodyX - x, cr.bodyY - y);
      if (away < bestAway) {
        bestAway = away;
        best = cr;
      }
    }
    return best;
  }

  /** Everything a poke does, wherever it lands. */
  function poke(p: Point): void {
    const d = decorAt(decor, p.x, p.y, viv);
    if (d) {
      pokeDecor(d);
      interest = { x: d.x, y: d.y - d.size * viv.unit * 0.4, life: INTEREST_SECONDS };
      ctx.audio.pop(d.kind === 'dish' ? 1.6 : 0.9);
      navigator.vibrate?.(10);
      // A flower is an invitation: the nearest animal goes over to look.
      if (d.kind === 'flower') {
        const guest = nearestTo(d.x, d.y);
        if (guest) guest.joy = 2;
      }
      return;
    }
    const plant = plantAt(plants, p.x, p.y, viv);
    if (plant) {
      plant.shake = SHAKE_SECONDS;
      interest = { x: plant.x, y: plant.y - plant.h * 0.5, life: INTEREST_SECONDS };
      ctx.audio.tick();
      return;
    }
    if (p.y > viv.floor - viv.unit * 0.2) {
      // The soil: a puff of dust, and every tuft near the hand waves.
      ctx.audio.puff();
      for (const near of plants) if (Math.abs(near.x - p.x) < viv.unit * 1.4) near.shake = SHAKE_SECONDS * 0.6;
      return;
    }
    ctx.audio.tick();
  }

  /** Lift an animal off the ground into the child's fingers. */
  function grab(cr: Creature, p: Point): void {
    held = cr;
    cr.hold(p.x, p.y);
    root.classList.add('terrarium-dragging');
    ctx.audio.pop(1.7);
    navigator.vibrate?.(14);
    // Everybody else saw that. Nothing frightens a lizard like a neighbour
    // vanishing upwards — but only the ones who really saw it, because
    // frightening half the box at once empties it and leaves the child holding an
    // animal in a dead room.
    for (const other of creatures) {
      if (other !== cr && Math.hypot(other.bodyX - cr.bodyX, other.bodyY - cr.bodyY) < viv.unit * 2)
        other.startle(cr.bodyX, cr.bodyY, true);
    }
  }

  /** Scooped into the jar and taken out of the box for good. */
  function scoop(cr: Creature): void {
    creatures = creatures.filter((other) => other !== cr);
    ctx.audio.puff();
    navigator.vibrate?.(20);
    ctx.speak('Tạm biệt!');
    replay(jar, 'anim-bounce');
  }

  // ---- the buttons ----

  // Opened on pointerup, not pointerdown: opening on the press means the release
  // of that same tap lands on whichever animal the panel put under the finger.
  add.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    replay(add, 'anim-bounce');
  });
  add.addEventListener('pointerup', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    openPicker();
  });

  lamp.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    night = !night;
    lamp.textContent = night ? '☀️' : '🌙';
    root.classList.toggle('terrarium-night', night);
    replay(lamp, 'anim-bounce');
    ctx.audio.tick();
    ctx.speak(night ? 'Tắt đèn, ngủ ngon nhé!' : 'Trời sáng rồi!');
    // Everybody notices the lights going out — and the night ones are pleased.
    for (const cr of creatures) cr.joy = cr.dozing(night) ? 0.4 : 1.4;
    save();
  });

  feed.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (clock - lastFed < FEED_EVERY) return;
    lastFed = clock;
    // Said over every press it turns into a stutter, because each phrase cuts off
    // the one before it. Once per helping is what it is for.
    const first = foods.length === 0;
    feeding = true;
    foods = addFood(foods, viv);
    ctx.audio.tick();
    ctx.hint.touch();
    replay(feed, 'anim-bounce');
    if (first) ctx.speak('Cho các bạn ăn nào!');
  });

  mist.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (clock - lastMist < MIST_EVERY) return;
    lastMist = clock;
    ctx.hint.touch();
    const first = wet === 0;
    wet = 1;
    if (drops.length < MAX_DROPS) drops = [...drops, ...makeDrops(viv, DROPS_PER_MIST)];
    ctx.audio.puff();
    navigator.vibrate?.(12);
    replay(mist, 'anim-bounce');
    // Everything perks up in the wet: the plants shake and everybody has a moment.
    for (const plant of plants) plant.shake = SHAKE_SECONDS * 0.8;
    for (const cr of creatures) cr.joy = Math.max(cr.joy, 1.6);
    if (first) ctx.speak('Xịt nước cho mát nào!');
  });

  // ---- the finger in the box ----

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = at(e);
    nudge = { x: p.x, y: p.y, held: true };
    grabFrom = p;
    grabCandidate = creatures.find((cr) => cr.hits(p.x, p.y)) ?? null;
    if (grabCandidate) return;
    // Nothing walking here, so whatever is planted here can be slid along the
    // soil instead — but only if the finger travels. A press on the spot pokes it.
    movable = decorAt(decor, p.x, p.y, viv) ?? plantAt(plants, p.x, p.y, viv);
    poke(p);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!nudge?.held) return;
    const p = at(e);
    nudge.x = p.x;
    nudge.y = p.y;

    // A press that travels turns into a lift; a press that stays put is a hello.
    if (!held && grabCandidate && grabFrom && Math.hypot(p.x - grabFrom.x, p.y - grabFrom.y) > GRAB_SLOP) {
      grab(grabCandidate, p);
    }
    if (!held && !moving && movable && grabFrom && Math.abs(p.x - grabFrom.x) > GRAB_SLOP) {
      moving = movable;
      root.classList.add('terrarium-moving');
      ctx.audio.pop(0.7);
      navigator.vibrate?.(10);
    }
    if (moving) {
      // Along the soil only: these things stand on it. Kept a body's width off the
      // glass so nothing ends up half outside the box.
      const edge = viv.unit * 0.6;
      moving.x = Math.min(viv.w - edge, Math.max(edge, p.x));
      shelters = sheltersFrom(viv, plants, decor);
      return;
    }
    if (held) {
      held.hold(p.x, p.y);
      jar.classList.toggle('terrarium-jar-over', overJar(e));
      return;
    }
    // A finger dragged through the planting sets it waving.
    const brushed = plantAt(plants, p.x, p.y, viv);
    if (brushed) brushed.shake = Math.max(brushed.shake, SHAKE_SECONDS * 0.7);
  });

  const release = (e?: PointerEvent): void => {
    if (moving) {
      moving = null;
      movable = null;
      grabCandidate = null;
      grabFrom = null;
      root.classList.remove('terrarium-moving');
      ctx.audio.tick();
      save();
      if (nudge) nudge.held = false;
      return;
    }
    movable = null;
    if (held) {
      if (e && overJar(e)) scoop(held);
      else held.release(viv);
      save();
      held = null;
      root.classList.remove('terrarium-dragging');
      jar.classList.remove('terrarium-jar-over');
    } else if (grabCandidate && grabFrom) {
      // Never moved: that was a hello, not a lift.
      greet(grabCandidate, grabFrom);
    }
    grabCandidate = null;
    grabFrom = null;
    if (nudge) nudge.held = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  ctx.hint.arm(() => {
    // Point at whatever the box needs: food when they are hungry, a new friend
    // otherwise — and the spray whenever the glass has dried out.
    const starving = creatures.filter((cr) => cr.mood === 'hungry').length;
    replay(starving > creatures.length / 3 ? feed : wet === 0 && Math.random() < 0.4 ? mist : add, 'anim-wiggle');
    const cr = creatures[Math.floor(Math.random() * creatures.length)];
    if (cr) cr.joy = 0.8;
  });

  const onResize = (): void => {
    // Force a rebuild on the next frame.
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    closePicker?.();
    for (const timer of timers) clearTimeout(timer);
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  });

  build();
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
}

const game: GameModule = { ...meta, start };
export default game;
