import { solveTwoBone, walkFoot, type Point } from '../../core/creature';
import { footDir, type Creature, type Drop, type Food, type Pebble, type Plant, type Surface, type Vivarium } from './logic';

/**
 * How the animals are drawn: bodies built from the spine, legs planted on
 * whatever they are standing on, an eye, a pattern, and the little face above the
 * head that says how it feels.
 *
 * Everything here works off two vectors — the way along the surface and the way
 * down to it — so one piece of leg code puts a gecko's feet on the soil, on the
 * side glass and on the underside of the lid without knowing which it is doing.
 */
export interface Scene {
  viv: Vivarium;
  /** Seconds since the scene started, for every wobble and shimmer. */
  clock: number;
  /** Show the little face above each animal saying how it feels. */
  moods?: boolean;
}

/**
 * A curve through the points, so a body reads as flesh rather than a polygon.
 * `move` false continues the path already being built instead of starting a new
 * one — without it the corner drawn before this call is thrown away.
 */
export function smoothPath(c: CanvasRenderingContext2D, pts: readonly Point[], move = true): void {
  if (pts.length === 0) return;
  if (move) c.moveTo(pts[0]!.x, pts[0]!.y);
  else c.lineTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[pts.length - 1]!;
  c.lineTo(last.x, last.y);
}

/** A stable number in 0…1 from two others: the same animal keeps the same spots. */
export function hash(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** The way along whatever this animal is standing on. */
export function tangentOf(surface: Surface): Point {
  return surface === 'left' || surface === 'right' ? { x: 0, y: 1 } : { x: 1, y: 0 };
}

/**
 * Where `hip` puts its foot: `along` the surface, `lift` clear of it. Off the
 * ground the surface travels with the animal (`footX`/`footY`), so a dropped
 * gecko's legs hang under it instead of trailing all the way down to the soil.
 */
function footPoint(cr: Creature, hip: Point, along: number, lift: number): Point {
  const t = tangentOf(cr.surface);
  const n = footDir(cr.surface);
  const x = n.x !== 0 ? cr.footX : hip.x;
  const y = n.x !== 0 ? hip.y : cr.footY;
  return { x: x + t.x * along - n.x * lift, y: y + t.y * along - n.y * lift };
}

/** +1 when this animal is travelling the positive way along its surface. */
function forwardOf(cr: Creature): number {
  const t = tangentOf(cr.surface);
  const dot = t.x * Math.cos(cr.heading) + t.y * Math.sin(cr.heading);
  return dot >= 0 ? 1 : -1;
}

/** A hip on the belly side of vertebra `i`. */
function hipAt(cr: Creature, i: number): Point {
  const joint = cr.spine.joints[i] ?? { x: cr.x, y: cr.y };
  const n = footDir(cr.surface);
  const w = cr.spine.widthAt(i) * 0.5;
  return { x: joint.x + n.x * w, y: joint.y + n.y * w };
}

/** One leg, hip to foot, drawn as two bones with a joint between them. */
function leg(g: CanvasRenderingContext2D, hip: Point, foot: Point, bone: number, bend: number, width: number, colour: string): void {
  const knee = solveTwoBone(hip.x, hip.y, foot.x, foot.y, bone, bone, bend);
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(hip.x, hip.y);
  g.lineTo(knee.x, knee.y);
  g.lineTo(foot.x, foot.y);
  g.stroke();
}

/** The soft patch under an animal, so nothing floats. */
function drawShadow(g: CanvasRenderingContext2D, cr: Creature): void {
  if (cr.surface === 'air' || cr.held) return;
  const t = tangentOf(cr.surface);
  const fade = Math.max(0, 1 - cr.lift / Math.max(1, cr.length));
  g.save();
  g.globalAlpha = 0.16 * fade;
  g.fillStyle = '#3b2416';
  g.beginPath();
  g.ellipse(cr.x, cr.y, t.x ? cr.length * 0.45 : cr.length * 0.16, t.x ? cr.length * 0.09 : cr.length * 0.4, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Where `flanks` leaves its answer. Read them before calling it again. */
const fA: Point = { x: 0, y: 0 };
const fB: Point = { x: 0, y: 0 };

/**
 * The body's two edge points at a vertebra. It fills the two points above rather
 * than returning a fresh pair, because a full box asks for these a couple of
 * hundred times a frame and every one was a throwaway object.
 */
function flanks(cr: Creature, index: number): void {
  const joint = cr.spine.joints[index];
  if (!joint) return;
  const angle = (cr.spine.angles[index] ?? 0) + Math.PI / 2;
  const width = cr.spine.widthAt(index);
  const dx = Math.cos(angle) * width;
  const dy = Math.sin(angle) * width;
  fA.x = joint.x + dx;
  fA.y = joint.y + dy;
  fB.x = joint.x - dx;
  fB.y = joint.y - dy;
}

/**
 * Which way round the body is at vertebra `index`: +1 when the flank `flanks`
 * writes to `fA` is the one on the foot side, -1 when it is `fB`.
 *
 * It asks the vertebra's own angle, never the distance from the feet. Comparing
 * against the feet is wrong for every animal whose body is narrower than its legs
 * are long: both flanks then lie on the same side of the ground line, the sign
 * falls to whichever flank `flanks` happened to write first, and a lizard walking
 * one way is drawn belly-up while the same lizard walking the other way is fine.
 */
export function bellySign(cr: Creature, index: number): number {
  const angle = (cr.spine.angles[index] ?? 0) + Math.PI / 2;
  const n = footDir(cr.surface);
  return Math.cos(angle) * n.x + Math.sin(angle) * n.y > 0 ? 1 : -1;
}

/** The point on the body's outline at vertebra `index` that is on the foot side. */
export function bellyEdge(cr: Creature, index: number): Point {
  const joint = cr.spine.joints[index] ?? { x: cr.x, y: cr.y };
  const angle = (cr.spine.angles[index] ?? 0) + Math.PI / 2;
  const w = cr.spine.widthAt(index) * bellySign(cr, index);
  return { x: joint.x + Math.cos(angle) * w, y: joint.y + Math.sin(angle) * w };
}

/** Back on the far side from the feet, belly on the near side. */
function bodyGradient(g: CanvasRenderingContext2D, cr: Creature): CanvasGradient {
  flanks(cr, 2);
  const towards = bellySign(cr, 2);
  const belly = towards > 0 ? fA : fB;
  const back = towards > 0 ? fB : fA;
  const grad = g.createLinearGradient(back.x, back.y, belly.x, belly.y);
  grad.addColorStop(0, cr.species.back);
  grad.addColorStop(0.62, cr.species.belly);
  grad.addColorStop(1, cr.species.belly);
  return grad;
}

function drawPattern(g: CanvasRenderingContext2D, cr: Creature, seed: number, ring: readonly Point[]): void {
  const { species } = cr;
  if (species.pattern === 'none') return;
  g.save();
  // The outline the body was just drawn from, rather than a second one built
  // from scratch: the same eighteen points, and clipping is dear enough already.
  g.beginPath();
  smoothPath(g, ring);
  g.clip();
  g.fillStyle = species.patternColor;
  if (species.pattern === 'bands' || species.pattern === 'stripes') {
    // A banded snake is meant to read as banded; a banded lizard with the same
    // markings reads as a caterpillar, so its bands are fainter, thinner and
    // start behind the shoulders.
    const bold = species.kind === 'snake';
    const rings = species.pattern === 'stripes' ? 3 : bold ? 6 : 4;
    const first = species.pattern === 'bands' && !bold ? 2 : 1;
    g.globalAlpha = species.pattern === 'stripes' ? 0.7 : bold ? 0.9 : 0.45;
    for (let i = first; i < first + rings; i++) {
      flanks(cr, Math.min(i, cr.spine.joints.length - 1));
      const thick = cr.length * (species.pattern === 'stripes' ? 0.03 : bold ? 0.045 : 0.026);
      const dx = fB.x - fA.x;
      const dy = fB.y - fA.y;
      const norm = Math.hypot(dx, dy) || 1;
      const px = (-dy / norm) * thick;
      const py = (dx / norm) * thick;
      g.beginPath();
      g.moveTo(fA.x - px, fA.y - py);
      g.lineTo(fA.x + px, fA.y + py);
      g.lineTo(fB.x + px, fB.y + py);
      g.lineTo(fB.x - px, fB.y - py);
      g.closePath();
      g.fill();
    }
  } else {
    g.globalAlpha = 0.85;
    for (let i = 0; i < 7; i++) {
      const joint = cr.spine.joints[1 + (i % 4)]!;
      const off = (hash(seed, i) - 0.5) * cr.length * 0.32;
      const r = cr.length * 0.03 * (0.7 + hash(seed, i + 9));
      g.beginPath();
      g.arc(joint.x + off, joint.y + (hash(seed, i + 3) - 0.5) * cr.length * 0.16, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/**
 * The outline of the first `n` vertebrae only, closed off with a blunt end.
 *
 * A lizard's body runs the whole spine and finishes in a point, which is its
 * tail. A frog has no tail and a beetle's abdomen is round: run their outline to
 * the last joint and they grow one. Stopping short is the whole difference.
 */
function stubOutline(cr: Creature, n: number): Point[] {
  const last = Math.min(n, cr.spine.joints.length) - 1;
  const ring: Point[] = [];
  for (let i = 0; i <= last; i++) ring.push(cr.spine.edge(i, Math.PI / 2));
  for (const offset of [Math.PI * 0.72, Math.PI, Math.PI * 1.28]) ring.push(cr.spine.edge(last, offset));
  for (let i = last; i >= 0; i--) ring.push(cr.spine.edge(i, -Math.PI / 2));
  for (const offset of [-Math.PI / 3, 0, Math.PI / 3]) ring.push(cr.spine.edge(0, offset));
  return ring;
}

/** The body itself: one closed curve down the spine, filled and edged. */
function drawTrunk(g: CanvasRenderingContext2D, cr: Creature, seed: number, joints = 0): void {
  const ring = joints > 0 ? stubOutline(cr, joints) : cr.spine.outline();
  g.beginPath();
  smoothPath(g, ring);
  g.fillStyle = bodyGradient(g, cr);
  g.fill();
  // A dark edge: without it, two animals that overlap read as one odd shape.
  g.strokeStyle = 'rgba(41,25,17,0.35)';
  g.lineWidth = Math.max(1, cr.length * 0.02);
  g.stroke();
  drawPattern(g, cr, seed, ring);
}

/**
 * An eye on the back-facing side of the head, so a gecko upside down on the lid
 * still looks out into the box rather than into the glass.
 */
function drawEye(g: CanvasRenderingContext2D, cr: Creature, out = 0.45, size = 0.05): void {
  const head = cr.spine.joints[0]!;
  // The flank away from the feet: the eye goes on the animal's back, not under it.
  flanks(cr, 0);
  const top = bellySign(cr, 0) > 0 ? fB : fA;
  const ex = head.x + (top.x - head.x) * out + Math.cos(cr.heading) * cr.length * 0.05;
  const ey = head.y + (top.y - head.y) * out + Math.sin(cr.heading) * cr.length * 0.05;
  const r = Math.max(2, cr.length * size);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(ex, ey, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0f172a';
  g.beginPath();
  g.arc(ex + Math.cos(cr.heading) * r * 0.3, ey + Math.sin(cr.heading) * r * 0.3, r * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(ex - r * 0.25, ey - r * 0.3, r * 0.22, 0, Math.PI * 2);
  g.fill();
}

/** A forked tongue, flicked out now and then. That flick is most of a reptile. */
function drawTongue(g: CanvasRenderingContext2D, cr: Creature, clock: number, len: number): void {
  const flick = Math.sin(clock * 2.2 + cr.x * 0.02);
  if (flick < 0.86) return;
  const head = cr.spine.joints[0]!;
  const out = (flick - 0.86) / 0.14;
  const tip = { x: head.x + Math.cos(cr.heading) * len * out, y: head.y + Math.sin(cr.heading) * len * out };
  const spread = cr.heading + Math.PI / 2;
  g.strokeStyle = '#f43f5e';
  g.lineWidth = Math.max(1, cr.length * 0.02);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(head.x, head.y);
  g.lineTo(tip.x, tip.y);
  for (const side of [-1, 1]) {
    g.moveTo(tip.x, tip.y);
    g.lineTo(
      tip.x + Math.cos(spread) * side * len * 0.2 + Math.cos(cr.heading) * len * 0.2,
      tip.y + Math.sin(spread) * side * len * 0.2 + Math.sin(cr.heading) * len * 0.2,
    );
  }
  g.stroke();
}

/** Gecko, lizard, chameleon: a spine with four sprawling legs planted on the surface. */
function drawReptile(g: CanvasRenderingContext2D, cr: Creature, seed: number, scene: Scene): void {
  const L = cr.length;
  const fwd = forwardOf(cr);
  const belly = cr.belly;
  const bone = L * 0.16;
  const stride = L * 0.2;
  const hop = L * 0.11;
  const still = cr.still > 0 || cr.hiding;
  const t = tangentOf(cr.surface);
  const n = footDir(cr.surface);

  drawShadow(g, cr);
  // Far legs behind the body, near legs in front of it: two passes over the same
  // pair of hips, which is what makes a flat side-on animal read as having a
  // near side and a far side at all.
  for (const far of [true, false]) {
    if (!far) drawTrunk(g, cr, seed);
    g.globalAlpha = far ? 0.5 : 1;
    for (const [joint, offset, front] of [
      [1, 0, 1],
      [4, 0.5, -1],
    ] as const) {
      const hip = hipAt(cr, joint);
      const step = still ? { x: 0, y: 0 } : walkFoot(cr.phase + offset + (far ? 0.5 : 0), stride, hop);
      const lean = (far ? -0.05 : 0.05) * L * fwd;
      const foot = footPoint(cr, hip, step.x * fwd + lean, -step.y);
      // The elbow of a front leg points backwards and the knee of a hind leg
      // forwards, which is what stops a lizard walking like a table.
      leg(g, hip, foot, bone, front > 0 ? belly : -belly, L * (far ? 0.045 : 0.055), cr.species.limb);
      // Toes, splayed. Without them the foot is a line end and the animal looks
      // like it is standing on stilts.
      g.strokeStyle = cr.species.limb;
      g.lineWidth = L * 0.022;
      g.beginPath();
      for (const toe of [-0.55, 0, 0.55]) {
        g.moveTo(foot.x, foot.y);
        g.lineTo(foot.x + t.x * toe * L * 0.09 + n.x * L * 0.02, foot.y + t.y * toe * L * 0.09 + n.y * L * 0.02);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  drawTongue(g, cr, scene.clock, L * 0.22);
  drawEye(g, cr);
}

/** A snake is the spine and nothing else, which is why it is the prettiest one. */
function drawSnake(g: CanvasRenderingContext2D, cr: Creature, seed: number, scene: Scene): void {
  drawShadow(g, cr);
  drawTrunk(g, cr, seed);
  drawTongue(g, cr, scene.clock, cr.length * 0.16);
  drawEye(g, cr, 0.55, 0.035);
}

/** A shell on four stubby legs, and a head that goes away when it is frightened. */
function drawTurtle(g: CanvasRenderingContext2D, cr: Creature): void {
  const L = cr.length;
  const fwd = forwardOf(cr);
  const belly = cr.belly;
  const n = footDir(cr.surface);
  const t = tangentOf(cr.surface);
  const mid = cr.spine.joints[2] ?? { x: cr.bodyX, y: cr.bodyY };
  const tuck = cr.tucked ? 1 : 0;
  drawShadow(g, cr);

  // Legs and head first: the shell is drawn over the top of where they join on.
  g.globalAlpha = 1;
  for (const far of [true, false]) {
    g.globalAlpha = far ? 0.55 : 1;
    for (const [joint, offset] of [
      [1, 0],
      [3, 0.5],
    ] as const) {
      const hip = hipAt(cr, joint);
      const step = cr.hiding || tuck ? { x: 0, y: 0 } : walkFoot(cr.phase + offset + (far ? 0.5 : 0), L * 0.13, L * 0.05);
      const foot = footPoint(cr, hip, step.x * fwd + (far ? -0.04 : 0.04) * L * fwd, -step.y - tuck * L * 0.1);
      leg(g, hip, foot, L * 0.12, belly, L * 0.075, cr.species.limb);
    }
    g.globalAlpha = 1;
  }
  // Head on a short neck, poking out past the rim of the shell — and pulled
  // right back under it when the turtle is frightened.
  const head = cr.spine.joints[0]!;
  const out = 1 - tuck;
  const reach = 0.85 + out * 0.95;
  const hx = mid.x + (head.x - mid.x) * reach;
  const hy = mid.y + (head.y - mid.y) * reach;
  g.strokeStyle = cr.species.limb;
  g.lineWidth = L * 0.11;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(mid.x, mid.y);
  g.lineTo(hx, hy);
  g.stroke();
  g.fillStyle = cr.species.limb;
  g.beginPath();
  g.ellipse(hx, hy, L * 0.12, L * 0.09, cr.heading, 0, Math.PI * 2);
  g.fill();
  // Tail, at the other end.
  const tail = cr.spine.joints[cr.spine.joints.length - 1]!;
  g.lineWidth = L * 0.05;
  g.beginPath();
  g.moveTo(mid.x, mid.y);
  g.lineTo(mid.x + (tail.x - mid.x) * (0.55 + out * 0.4), mid.y + (tail.y - mid.y) * (0.55 + out * 0.4));
  g.stroke();

  // The shell, drawn in the body's own frame: along the surface is local +x and
  // away from it is local -y, whichever pane the turtle happens to be on. One
  // flip is all it takes, instead of four versions of a dome.
  const angle = Math.atan2(t.y, t.x);
  const flip = n.x * -Math.sin(angle) + n.y * Math.cos(angle) >= 0 ? 1 : -1;
  const along = L * 0.44;
  const high = L * 0.34;
  g.save();
  g.translate(mid.x, mid.y);
  g.rotate(angle);
  g.scale(1, flip);
  // The plastron: the flat underside it rides about on.
  g.fillStyle = cr.species.belly;
  g.beginPath();
  g.ellipse(0, L * 0.02, along * 0.92, L * 0.09, 0, 0, Math.PI * 2);
  g.fill();
  // The carapace: a half dome, dark at the rim and bright over the top.
  const dome = g.createLinearGradient(0, -high, 0, L * 0.04);
  dome.addColorStop(0, cr.species.belly);
  dome.addColorStop(0.4, cr.species.back);
  dome.addColorStop(1, cr.species.limb);
  g.fillStyle = dome;
  g.beginPath();
  g.ellipse(0, 0, along, high, 0, Math.PI, Math.PI * 2);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(41,25,17,0.4)';
  g.lineWidth = Math.max(1, L * 0.022);
  g.stroke();
  // Scutes: ribs running over the dome, plus the seam along its ridge.
  g.strokeStyle = 'rgba(41,25,17,0.25)';
  g.lineWidth = Math.max(1, L * 0.016);
  for (const at of [-0.6, -0.22, 0.22, 0.6]) {
    const x = along * at;
    const lift = high * Math.sqrt(Math.max(0, 1 - at * at));
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x * 0.75, -lift * 0.75, x * 0.5, -lift);
    g.stroke();
  }
  g.beginPath();
  g.ellipse(0, 0, along * 0.62, high * 0.55, 0, Math.PI, Math.PI * 2);
  g.stroke();
  g.restore();

  // An eye on the head that is actually out there, rather than on the vertebra
  // the head grew from — which by now is somewhere under the shell.
  const eye = {
    x: hx + Math.cos(cr.heading) * L * 0.04 - n.x * L * 0.04,
    y: hy + Math.sin(cr.heading) * L * 0.04 - n.y * L * 0.04,
  };
  const r = Math.max(1.5, L * 0.035);
  if (tuck) {
    // Frightened: the whole thing shuts, and one closed eye shows why.
    g.strokeStyle = 'rgba(41,25,17,0.6)';
    g.lineWidth = Math.max(1, L * 0.018);
    g.beginPath();
    g.arc(eye.x, eye.y, r, cr.heading + 0.4, cr.heading + Math.PI - 0.4);
    g.stroke();
    return;
  }
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(eye.x, eye.y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0f172a';
  g.beginPath();
  g.arc(eye.x + Math.cos(cr.heading) * r * 0.3, eye.y + Math.sin(cr.heading) * r * 0.3, r * 0.55, 0, Math.PI * 2);
  g.fill();
}

/** Ladybug, ant, beetle: three pairs of legs, feelers, and a hard back. */
function drawBug(g: CanvasRenderingContext2D, cr: Creature, seed: number): void {
  const L = cr.length;
  const fwd = forwardOf(cr);
  const belly = cr.belly;
  const n = footDir(cr.surface);
  const still = cr.still > 0 || cr.hiding;
  drawShadow(g, cr);

  // Six legs, in two passes so three of them go behind the shell.
  for (const far of [true, false]) {
    g.globalAlpha = far ? 0.45 : 1;
    for (let i = 0; i < 3; i++) {
      const hip = hipAt(cr, 1 + i);
      const step = still ? { x: 0, y: 0 } : walkFoot(cr.phase + i * 0.33 + (far ? 0.5 : 0), L * 0.22, L * 0.13);
      const foot = footPoint(cr, hip, step.x * fwd + (i - 1) * L * 0.12 * fwd + (far ? -0.04 : 0.04) * L * fwd, -step.y);
      leg(g, hip, foot, L * 0.17, i === 0 ? -belly : belly, L * (far ? 0.028 : 0.036), cr.species.limb);
    }
    g.globalAlpha = 1;
    if (far) {
      drawTrunk(g, cr, seed, 5);
      // The wing cases, split down the middle.
      const mid = cr.spine.joints[2]!;
      const back = cr.spine.joints[4] ?? mid;
      g.strokeStyle = 'rgba(41,25,17,0.45)';
      g.lineWidth = Math.max(1, L * 0.02);
      g.beginPath();
      g.moveTo(mid.x, mid.y);
      g.lineTo(back.x, back.y);
      g.stroke();
      // A hard shine across the back, the one thing that says "beetle".
      const head = cr.spine.joints[0]!;
      g.save();
      g.globalAlpha = 0.35;
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(
        mid.x - n.x * L * 0.06 + (head.x - mid.x) * 0.2,
        mid.y - n.y * L * 0.06 + (head.y - mid.y) * 0.2,
        L * 0.1,
        L * 0.045,
        cr.heading,
        0,
        Math.PI * 2,
      );
      g.fill();
      g.restore();
    }
  }
  // Feelers.
  const head = cr.spine.joints[0]!;
  const wave = Math.sin(cr.phase * 3) * 0.3;
  g.strokeStyle = cr.species.limb;
  g.lineWidth = Math.max(1, L * 0.025);
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const a = cr.heading + side * (0.5 + wave * side);
    g.beginPath();
    g.moveTo(head.x, head.y);
    g.quadraticCurveTo(
      head.x + Math.cos(a) * L * 0.18 - n.x * L * 0.08,
      head.y + Math.sin(a) * L * 0.18 - n.y * L * 0.08,
      head.x + Math.cos(a) * L * 0.3 - n.x * L * 0.16,
      head.y + Math.sin(a) * L * 0.3 - n.y * L * 0.16,
    );
    g.stroke();
  }
  drawEye(g, cr, 0.5, 0.035);
}

/** A frog or a cricket: folded back legs that straighten out across a hop. */
function drawHopper(g: CanvasRenderingContext2D, cr: Creature, seed: number): void {
  const L = cr.length;
  const fwd = forwardOf(cr);
  const belly = cr.belly;
  const n = footDir(cr.surface);
  // Mid-hop the back legs are out behind; standing, they are folded up beside it.
  const spring = cr.lift > 0 ? Math.min(1, cr.lift / (L * 0.6)) : 0;
  drawShadow(g, cr);

  // Back legs: a thigh up beside the body and a shin down to the foot.
  for (const far of [true, false]) {
    g.globalAlpha = far ? 0.5 : 1;
    const hip = hipAt(cr, 3);
    const foot = footPoint(cr, hip, (-0.3 - spring * 0.55) * L * fwd + (far ? -0.05 : 0.05) * L * fwd, spring * L * 0.5);
    leg(g, hip, foot, L * 0.24, -belly, L * (far ? 0.07 : 0.085), cr.species.limb);
    // Front legs, short and propping it up.
    const paw = hipAt(cr, 1);
    const front = footPoint(cr, paw, (0.16 + spring * 0.2) * L * fwd + (far ? -0.04 : 0.04) * L * fwd, spring * L * 0.35);
    leg(g, paw, front, L * 0.12, belly, L * (far ? 0.045 : 0.055), cr.species.limb);
    g.globalAlpha = 1;
    // Four vertebrae, not seven: a frog has no tail, and running its outline to
    // the end of the spine grows it one.
    if (far) drawTrunk(g, cr, seed, 4);
  }
  // Eyes up on the top of the head, which is the whole face of a frog.
  const head = cr.spine.joints[0]!;
  const r = L * 0.09;
  for (const side of [0.55, 0.15]) {
    const ex = head.x - n.x * r * 1.1 + Math.cos(cr.heading) * L * side * 0.2;
    const ey = head.y - n.y * r * 1.1 + Math.sin(cr.heading) * L * side * 0.2;
    g.fillStyle = cr.species.belly;
    g.beginPath();
    g.arc(ex, ey, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0f172a';
    g.beginPath();
    g.arc(ex + Math.cos(cr.heading) * r * 0.25, ey + Math.sin(cr.heading) * r * 0.25, r * 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(ex - r * 0.3, ey - r * 0.35, r * 0.22, 0, Math.PI * 2);
    g.fill();
  }
  // The mouth: one wide line, and the reason a frog looks pleased with itself.
  g.strokeStyle = 'rgba(41,25,17,0.4)';
  g.lineWidth = Math.max(1, L * 0.022);
  g.beginPath();
  g.arc(head.x, head.y, L * 0.11, cr.heading - 0.9, cr.heading + 0.9);
  g.stroke();
}

/** A snail: one long foot with a spiral house on its back and two eye stalks. */
function drawSnail(g: CanvasRenderingContext2D, cr: Creature): void {
  const L = cr.length;
  const n = footDir(cr.surface);
  const t = tangentOf(cr.surface);
  const mid = cr.spine.joints[2] ?? { x: cr.bodyX, y: cr.bodyY };
  drawShadow(g, cr);

  // The foot, as a smooth blob along the spine — blunt at the back, because a
  // snail's foot ends rather than tapering off into a tail.
  const ring = stubOutline(cr, 5);
  g.beginPath();
  smoothPath(g, ring);
  g.fillStyle = cr.species.belly;
  g.fill();
  g.strokeStyle = 'rgba(41,25,17,0.3)';
  g.lineWidth = Math.max(1, L * 0.02);
  g.stroke();
  // A ripple running down the foot: how a snail actually moves.
  g.save();
  g.beginPath();
  smoothPath(g, ring);
  g.clip();
  g.strokeStyle = 'rgba(41,25,17,0.12)';
  g.lineWidth = L * 0.03;
  for (let i = 0; i < 4; i++) {
    const at = ((cr.phase * 0.4 + i / 4) % 1) - 0.1;
    const p = cr.spine.joints[Math.min(cr.spine.joints.length - 1, Math.floor(at * 6))] ?? mid;
    g.beginPath();
    g.moveTo(p.x - t.x * L * 0.04 + n.x * L * 0.05, p.y - t.y * L * 0.04 + n.y * L * 0.05);
    g.lineTo(p.x + t.x * L * 0.04 - n.x * L * 0.02, p.y + t.y * L * 0.04 - n.y * L * 0.02);
    g.stroke();
  }
  g.restore();

  // The shell: a spiral of arcs, wound from the outside in.
  const sx = mid.x - n.x * L * 0.22;
  const sy = mid.y - n.y * L * 0.22;
  const r = L * 0.3;
  const shell = g.createRadialGradient(sx - n.x * r * 0.3, sy - n.y * r * 0.3, r * 0.1, sx, sy, r);
  shell.addColorStop(0, cr.species.limb);
  shell.addColorStop(1, cr.species.back);
  g.fillStyle = shell;
  g.beginPath();
  g.arc(sx, sy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(69,26,3,0.5)';
  g.lineWidth = Math.max(1, L * 0.022);
  g.stroke();
  g.beginPath();
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 3.4;
    const rr = r * (1 - i / 30);
    const px = sx + Math.cos(a + cr.heading) * rr;
    const py = sy + Math.sin(a + cr.heading) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();

  // Eye stalks, which is the whole face.
  const head = cr.spine.joints[0]!;
  g.strokeStyle = cr.species.belly;
  g.lineWidth = Math.max(1.5, L * 0.035);
  g.lineCap = 'round';
  for (const side of [0.35, -0.15]) {
    const tipX = head.x + Math.cos(cr.heading + side * 0.5) * L * 0.2 - n.x * L * 0.22;
    const tipY = head.y + Math.sin(cr.heading + side * 0.5) * L * 0.2 - n.y * L * 0.22;
    g.beginPath();
    g.moveTo(head.x, head.y);
    g.quadraticCurveTo(head.x - n.x * L * 0.12, head.y - n.y * L * 0.12, tipX, tipY);
    g.stroke();
    g.fillStyle = '#0f172a';
    g.beginPath();
    g.arc(tipX, tipY, Math.max(1.5, L * 0.035), 0, Math.PI * 2);
    g.fill();
  }
}

/** A butterfly, seen from above the way picture books draw one. */
function drawFlyer(g: CanvasRenderingContext2D, cr: Creature, seed: number): void {
  const L = cr.length;
  const beat = Math.abs(Math.sin(cr.phase));
  g.save();
  g.translate(cr.x, cr.y);
  g.rotate(Math.max(-0.4, Math.min(0.4, Math.atan2(cr.vy, Math.abs(cr.vx) || 1))) * (cr.vx >= 0 ? 1 : -1));
  g.scale(cr.vx >= 0 ? 1 : -1, 1);
  // The wings close towards the body as they beat, which is the whole animation.
  const span = L * (0.28 + beat * 0.42);
  for (const side of [-1, 1]) {
    const wing = g.createLinearGradient(0, 0, L * 0.1, side * span);
    wing.addColorStop(0, cr.species.back);
    wing.addColorStop(1, cr.species.belly);
    g.fillStyle = wing;
    g.beginPath();
    g.moveTo(-L * 0.06, 0);
    g.bezierCurveTo(L * 0.1, side * span * 0.5, L * 0.42, side * span * 1.05, L * 0.16, side * span * 1.15);
    g.bezierCurveTo(-L * 0.05, side * span * 1.1, -L * 0.06, side * span * 0.5, -L * 0.06, 0);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-L * 0.06, 0);
    g.bezierCurveTo(-L * 0.28, side * span * 0.35, -L * 0.4, side * span * 0.85, -L * 0.18, side * span * 0.9);
    g.bezierCurveTo(-L * 0.06, side * span * 0.6, -L * 0.05, side * span * 0.3, -L * 0.06, 0);
    g.closePath();
    g.fill();
    g.fillStyle = cr.species.patternColor;
    g.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(L * (0.02 + hash(seed, i) * 0.18), side * span * (0.45 + hash(seed, i + 4) * 0.5), L * 0.035, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  g.fillStyle = cr.species.limb;
  g.beginPath();
  g.ellipse(0, 0, L * 0.24, L * 0.055, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = cr.species.limb;
  g.lineWidth = Math.max(1, L * 0.022);
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(L * 0.18, 0);
    g.quadraticCurveTo(L * 0.3, side * L * 0.08, L * 0.36, side * L * 0.16);
    g.stroke();
  }
  g.restore();
}

export function drawCreature(g: CanvasRenderingContext2D, cr: Creature, index: number, scene: Scene): void {
  g.save();
  if (cr.joy > 0) {
    // A little bob of delight, around the animal's own middle.
    g.translate(cr.bodyX, cr.bodyY);
    g.rotate(Math.sin(cr.joy * 34) * 0.1 * cr.joy);
    g.translate(-cr.bodyX, -cr.bodyY);
  }
  // Tucked under a leaf: still there, but keeping out of it.
  if (cr.hiding && !cr.tucked) g.globalAlpha = 0.5;
  // In the child's hand it is off the ground, so it gets a shadow and a wriggle.
  if (cr.held) {
    g.translate(cr.x, cr.y);
    g.rotate(Math.sin(scene.clock * 22) * 0.16);
    g.translate(-cr.x, -cr.y);
    g.shadowColor = 'rgba(41,25,17,0.45)';
    g.shadowBlur = cr.length * 0.35;
  }
  switch (cr.species.kind) {
    case 'snake':
      drawSnake(g, cr, index, scene);
      break;
    case 'turtle':
      drawTurtle(g, cr);
      break;
    case 'bug':
      drawBug(g, cr, index);
      break;
    case 'hopper':
      drawHopper(g, cr, index);
      break;
    case 'snail':
      drawSnail(g, cr);
      break;
    case 'flyer':
      drawFlyer(g, cr, index);
      break;
    default:
      drawReptile(g, cr, index, scene);
  }
  g.restore();
  if (scene.moods !== false) drawMood(g, cr, scene);
}

/** The mood font, which is one string for as long as the box is one size. */
let moodSize = 0;
let moodFont = '';

/**
 * What the animal is feeling, above its head, for a child who cannot read. Only
 * hunger and delight are shown: fright already reads perfectly well from a gecko
 * bolting up the glass.
 */
function drawMood(g: CanvasRenderingContext2D, cr: Creature, scene: Scene): void {
  const mood = cr.mood;
  if (cr.held || (mood !== 'hungry' && mood !== 'excited')) return;
  const size = Math.max(scene.viv.unit * 0.34, 15);
  if (size !== moodSize) {
    moodSize = size;
    moodFont = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  }
  const n = footDir(cr.surface);
  const bob = Math.sin(scene.clock * 3 + cr.x * 0.01) * size * 0.12;
  g.save();
  g.globalAlpha = mood === 'hungry' ? 0.55 + 0.35 * Math.sin(scene.clock * 2.2) : 0.9;
  // WebKit paints an emoji as a mask when the fill is a gradient, and the last
  // thing drawn was a body. A flat colour first, and it comes out in colour.
  g.fillStyle = '#000';
  g.font = moodFont;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(mood === 'hungry' ? '🐛' : '✨', cr.bodyX - n.x * cr.length * 0.5, cr.bodyY - n.y * cr.length * 0.5 - size * 0.5 + bob);
  g.restore();
}

// ---- the box everything happens in ----

/** The back wall: a warm gradient with a cork panel standing against it. */
export function drawBack(g: CanvasRenderingContext2D, viv: Vivarium): void {
  const sky = g.createLinearGradient(0, 0, 0, viv.front);
  sky.addColorStop(0, '#fde9c8');
  sky.addColorStop(0.45, '#f6d3a3');
  sky.addColorStop(1, '#d9a877');
  g.fillStyle = sky;
  g.fillRect(0, 0, viv.w, viv.h);

  // Cork bark. Slabs of uneven width with dark seams between them and a ragged
  // top edge: at even widths it reads as fence panels, which is exactly what a
  // back wall must not look like.
  let x = -viv.unit * 0.3;
  let i = 0;
  while (x < viv.w) {
    const w = viv.unit * (0.45 + hash(i, 3) * 0.65);
    const shade = 112 + hash(i, 5) * 46;
    const lip = viv.unit * (0.1 + hash(i, 7) * 0.5);
    g.fillStyle = `rgb(${shade},${shade - 33},${shade - 60})`;
    g.beginPath();
    g.moveTo(x, viv.top + lip);
    g.quadraticCurveTo(x + w * 0.5, viv.top + lip * (0.2 + hash(i, 11) * 0.7), x + w, viv.top + lip * 0.7);
    g.lineTo(x + w, viv.floor);
    g.lineTo(x, viv.floor);
    g.closePath();
    g.fill();
    // The seam down the right-hand side, which is where the depth comes from.
    g.fillStyle = 'rgba(48,26,12,0.4)';
    g.fillRect(x + w - viv.unit * 0.035, viv.top + lip * 0.7, viv.unit * 0.035, viv.floor);
    // A groove or two down the face of the wider slabs.
    if (w > viv.unit * 0.7) {
      g.fillStyle = 'rgba(48,26,12,0.16)';
      g.fillRect(x + w * (0.3 + hash(i, 13) * 0.35), viv.top + lip, viv.unit * 0.025, viv.floor);
    }
    x += w;
    i++;
  }
  // Mottling. Slabs alone still read as a fence however uneven they are, because
  // every mark on them runs the same way; a scatter of soft dark patches across
  // the seams is what turns planks into bark.
  for (let s = 0; s < 120; s++) {
    const px = hash(s, 21) * viv.w;
    const py = viv.top + hash(s, 22) * (viv.floor - viv.top);
    const r = viv.unit * (0.03 + hash(s, 23) * 0.13);
    g.fillStyle = hash(s, 24) > 0.55 ? 'rgba(255,228,190,0.07)' : 'rgba(52,28,12,0.09)';
    g.beginPath();
    g.ellipse(px, py, r, r * (0.3 + hash(s, 25) * 0.45), hash(s, 26) * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Vines up the cork. A back wall this tall is a lot of nothing to look at, and
  // it is also what tells the eye how high a climbing gecko has got.
  for (const [at, tall, seed] of [
    [0.12, 0.62, 2],
    [0.5, 0.38, 6],
    [0.88, 0.72, 9],
  ] as const) {
    const baseX = viv.w * at;
    const climb = (viv.floor - viv.top) * tall;
    g.strokeStyle = 'rgba(46,74,34,0.65)';
    g.lineWidth = Math.max(1.5, viv.unit * 0.035);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(baseX, viv.floor);
    for (let s = 1; s <= 6; s++) {
      const along = s / 6;
      g.lineTo(baseX + Math.sin(along * 4 + seed) * viv.unit * 0.22, viv.floor - climb * along);
    }
    g.stroke();
    for (let s = 1; s <= 7; s++) {
      const along = s / 8;
      const lx = baseX + Math.sin(along * 4 + seed) * viv.unit * 0.22;
      const ly = viv.floor - climb * along;
      const side = s % 2 ? 1 : -1;
      g.fillStyle = `hsl(${104 + hash(seed, s) * 22} 32% ${20 + hash(seed, s + 3) * 12}%)`;
      g.beginPath();
      g.ellipse(lx + side * viv.unit * 0.14, ly, viv.unit * 0.15, viv.unit * 0.07, side * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // The far side of the box is darker than the near side.
  const dim = g.createLinearGradient(0, viv.top, 0, viv.floor);
  dim.addColorStop(0, 'rgba(60,32,14,0.34)');
  dim.addColorStop(1, 'rgba(60,32,14,0.04)');
  g.fillStyle = dim;
  g.fillRect(0, 0, viv.w, viv.floor);
}

/** The soil bank, from the back wall down to the front glass. */
export function drawSoil(g: CanvasRenderingContext2D, viv: Vivarium, pebbles: readonly Pebble[] = []): void {
  const grad = g.createLinearGradient(0, viv.floor - viv.unit * 0.1, 0, viv.h);
  grad.addColorStop(0, '#a1673a');
  grad.addColorStop(0.4, '#8a5430');
  grad.addColorStop(1, '#5b3520');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, viv.h);
  g.lineTo(0, viv.floor);
  const pts = Array.from({ length: 9 }, (_, i) => ({ x: (i / 8) * viv.w, y: viv.floor + Math.sin(i * 1.7) * viv.unit * 0.05 }));
  smoothPath(g, pts, false);
  g.lineTo(viv.w, viv.h);
  g.closePath();
  g.fill();
  // The crease where the soil meets the back wall, so the bank has a far edge
  // rather than being a brown shape stuck onto a brown shape.
  const crease = g.createLinearGradient(0, viv.floor - viv.unit * 0.05, 0, viv.floor + viv.unit * 0.5);
  crease.addColorStop(0, 'rgba(38,20,10,0.45)');
  crease.addColorStop(1, 'rgba(38,20,10,0)');
  g.fillStyle = crease;
  g.fillRect(0, viv.floor - viv.unit * 0.05, viv.w, viv.unit * 0.6);

  // Leaf litter and bark chips: what a substrate actually looks like, and the
  // reason a bank half the screen deep does not read as a sheet of card.
  const deep = viv.h - viv.floor;
  for (let i = 0; i < 110; i++) {
    const x = hash(i, 31) * viv.w;
    const y = viv.floor + hash(i, 32) * deep;
    const r = viv.unit * (0.03 + hash(i, 33) * 0.07);
    const tone = hash(i, 34);
    g.fillStyle =
      tone > 0.78
        ? `hsl(${88 + tone * 30} 34% 30%)`
        : tone > 0.5
          ? `hsl(${28 + tone * 12} 40% ${28 + tone * 8}%)`
          : `hsl(${22 + tone * 14} 34% ${16 + tone * 10}%)`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.28 + hash(i, 35) * 0.35), hash(i, 36) * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Grains, fixed in place, so the soil has a grit to it as well as a litter.
  g.fillStyle = 'rgba(38,20,10,0.22)';
  for (let i = 0; i < 110; i++) {
    g.fillRect(hash(i, 1) * viv.w, viv.floor + hash(i, 2) * deep, 2, 2);
  }
  g.fillStyle = 'rgba(255,224,178,0.18)';
  for (let i = 0; i < 80; i++) {
    g.fillRect(hash(i, 7) * viv.w, viv.floor + hash(i, 8) * deep, 2, 2);
  }
  for (const rock of pebbles) {
    const shade = 118 + rock.tint * 60;
    g.fillStyle = `rgb(${shade},${shade - 8},${shade - 22})`;
    g.beginPath();
    g.ellipse(rock.x, rock.y, rock.r, rock.r * rock.squash, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.ellipse(rock.x - rock.r * 0.3, rock.y - rock.r * rock.squash * 0.45, rock.r * 0.34, rock.r * rock.squash * 0.28, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * A tuft of planting. `stirred` is 0…1 of having just been brushed, which makes
 * it wave a little wider and a little faster before it settles.
 */
export function drawPlant(g: CanvasRenderingContext2D, plant: Plant, scene: Scene, stirred = 0): void {
  const { viv, clock } = scene;
  const amp = viv.unit * 0.16 * (1 + stirred * 0.5);
  const rate = plant.sway * 2 * (1 + stirred * 0.5);
  for (let b = 0; b < plant.blades; b++) {
    const lean = (b - (plant.blades - 1) / 2) * 0.26;
    const base = plant.x + lean * plant.w * 3;
    const tall = plant.h * (0.7 + hash(plant.x, b) * 0.5);
    const wave = (along: number): number =>
      Math.sin(clock * rate + plant.phase + b + along * 2.4) * amp * along * along + lean * plant.w * 6 * along;
    g.beginPath();
    g.moveTo(base - plant.w, plant.y);
    for (let s = 0; s <= 6; s++) {
      const along = s / 6;
      g.lineTo(base + wave(along) - plant.w * (1 - along), plant.y - tall * along);
    }
    for (let s = 6; s >= 0; s--) {
      const along = s / 6;
      g.lineTo(base + wave(along) + plant.w * (1 - along), plant.y - tall * along);
    }
    g.closePath();
    g.fillStyle = `hsl(${plant.hue} 52% ${26 + b * 6}%)`;
    g.fill();
  }
}

/** One piece of food on the soil: a cricket, a wriggling worm, or a still berry. */
export function drawFoodItem(g: CanvasRenderingContext2D, food: Food, viv: Vivarium): void {
  if (food.eaten) return;
  const u = viv.unit;
  g.save();
  g.translate(food.x, food.y);
  // The last second before it burrows away, it fades rather than blinking out.
  g.globalAlpha = Math.min(1, Math.max(0.15, food.life));
  if (food.kind === 'berry') {
    g.fillStyle = '#dc2626';
    g.beginPath();
    g.arc(0, 0, u * 0.07, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(-u * 0.02, -u * 0.025, u * 0.022, 0, Math.PI * 2);
    g.fill();
  } else if (food.kind === 'worm') {
    g.strokeStyle = '#f0a4a4';
    g.lineWidth = u * 0.05;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const x = (t - 0.5) * u * 0.24;
      const y = Math.sin(food.wobble + t * 4) * u * 0.03;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  } else {
    const hop = Math.max(0, Math.sin(food.wobble)) * u * 0.06;
    g.translate(0, -hop);
    g.fillStyle = '#57534e';
    g.beginPath();
    g.ellipse(0, 0, u * 0.07, u * 0.04, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#44403c';
    g.lineWidth = Math.max(1, u * 0.014);
    g.beginPath();
    g.moveTo(u * 0.02, 0);
    g.lineTo(u * 0.06, -u * 0.05);
    g.lineTo(u * 0.09, u * 0.03);
    g.stroke();
  }
  g.restore();
}

/** Mist on the inside of the glass, running down and drying out. */
export function drawDrops(g: CanvasRenderingContext2D, drops: readonly Drop[]): void {
  for (const drop of drops) {
    g.save();
    g.globalAlpha = Math.min(0.75, Math.max(0, drop.life * 0.25));
    g.fillStyle = 'rgba(226,246,255,0.5)';
    g.beginPath();
    g.ellipse(drop.x, drop.y, drop.r, drop.r * 1.25, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }
}

/**
 * The glass itself: a bright band down each side where the pane catches the
 * light, and a long diagonal reflection across the front. It is what tells the
 * child the gecko is walking on something rather than floating.
 */
export function drawGlass(g: CanvasRenderingContext2D, viv: Vivarium): void {
  g.save();
  g.globalCompositeOperation = 'screen';
  const sheen = g.createLinearGradient(0, viv.h, viv.w * 0.75, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.09)');
  sheen.addColorStop(0.52, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, viv.w, viv.h);
  g.restore();

  // The frame: silicone-jointed panes, so the box has real edges.
  const rim = Math.max(3, viv.unit * 0.09);
  g.strokeStyle = 'rgba(226,246,255,0.55)';
  g.lineWidth = rim * 0.5;
  g.strokeRect(viv.wallL, viv.top, viv.wallR - viv.wallL, viv.h - viv.top);
  g.fillStyle = 'rgba(58,42,30,0.9)';
  g.fillRect(0, 0, viv.w, viv.top * 0.42);
  g.fillStyle = 'rgba(88,64,44,0.9)';
  g.fillRect(0, viv.top * 0.42, viv.w, viv.top * 0.16);
  const edge = g.createRadialGradient(
    viv.w / 2,
    viv.h / 2,
    Math.min(viv.w, viv.h) * 0.45,
    viv.w / 2,
    viv.h / 2,
    Math.max(viv.w, viv.h) * 0.8,
  );
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(46,26,12,0.28)');
  g.fillStyle = edge;
  g.fillRect(0, 0, viv.w, viv.h);
}
