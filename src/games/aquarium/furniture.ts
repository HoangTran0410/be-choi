import { POKE_SECONDS, makeBubble, type Decor } from './logic';
import { maxBubbles, type State } from './state';

/** Where a piece of decor stands: further back sits a little higher up the sand. */
function decorBase(s: State, d: Decor): number {
  const { tank } = s;
  const lift = d.layer === 'far' ? -0.3 : d.layer === 'near' ? 0.35 : 0;
  return tank.floor + tank.unit * (0.14 + lift);
}

function drawBoulder(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const r = d.size * s.tank.unit * 0.5;
  const shade = (d.layer === 'near' ? 58 : 96) + d.hue * 40;
  g.fillStyle = `rgb(${shade},${shade + 10},${shade + 22})`;
  g.beginPath();
  g.moveTo(d.x - r * 1.15, base);
  g.bezierCurveTo(d.x - r * 1.2, base - r * 0.9, d.x - r * 0.5, base - r * 1.35, d.x, base - r * 1.25);
  g.bezierCurveTo(d.x + r * 0.65, base - r * 1.4, d.x + r * 1.2, base - r * 0.8, d.x + r * 1.1, base);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  g.ellipse(d.x - r * 0.35, base - r * 0.85, r * 0.4, r * 0.22, -0.4, 0, Math.PI * 2);
  g.fill();
}

/** The ornament every fish tank has: a little stone castle to swim round. */
function drawCastle(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const u = d.size * s.tank.unit;
  const stone = '#cbd5e1';
  const shade = '#94a3b8';
  const roof = `hsl(${330 + d.hue * 40} 70% 66%)`;
  const tower = (x: number, w: number, hgt: number): void => {
    g.fillStyle = stone;
    g.fillRect(x - w / 2, base - hgt, w, hgt);
    g.fillStyle = shade;
    g.fillRect(x - w / 2, base - hgt, w * 0.3, hgt);
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(x - w * 0.72, base - hgt);
    g.lineTo(x, base - hgt - w * 0.85);
    g.lineTo(x + w * 0.72, base - hgt);
    g.closePath();
    g.fill();
    g.fillStyle = '#334155';
    g.beginPath();
    g.arc(x, base - hgt * 0.72, w * 0.16, 0, Math.PI * 2);
    g.fill();
  };
  // Curtain wall with battlements.
  g.fillStyle = stone;
  g.fillRect(d.x - u * 0.42, base - u * 0.62, u * 0.84, u * 0.62);
  for (let i = 0; i < 4; i++) {
    g.fillRect(d.x - u * 0.42 + i * u * 0.24, base - u * 0.74, u * 0.13, u * 0.14);
  }
  g.fillStyle = '#334155';
  g.beginPath();
  g.moveTo(d.x - u * 0.13, base);
  g.lineTo(d.x - u * 0.13, base - u * 0.28);
  g.quadraticCurveTo(d.x, base - u * 0.5, d.x + u * 0.13, base - u * 0.28);
  g.lineTo(d.x + u * 0.13, base);
  g.closePath();
  g.fill();
  tower(d.x - u * 0.5, u * 0.3, u * 0.95);
  tower(d.x + u * 0.5, u * 0.3, u * 0.78);
  tower(d.x, u * 0.34, u * 1.25);
}

/** A rock arch: the hiding place, and something to swim through. */
function drawArch(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const u = d.size * s.tank.unit;
  const w = u * 0.72;
  const hgt = u * 1.15;
  const leg = u * 0.26;
  const shade = 104 + d.hue * 30;
  g.fillStyle = `rgb(${shade},${shade + 12},${shade + 20})`;
  g.beginPath();
  g.moveTo(d.x - w, base);
  g.lineTo(d.x - w, base - hgt * 0.5);
  g.quadraticCurveTo(d.x, base - hgt * 1.5, d.x + w, base - hgt * 0.5);
  g.lineTo(d.x + w, base);
  g.lineTo(d.x + w - leg, base);
  g.lineTo(d.x + w - leg, base - hgt * 0.45);
  g.quadraticCurveTo(d.x, base - hgt * 1.02, d.x - w + leg, base - hgt * 0.45);
  g.lineTo(d.x - w + leg, base);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(d.x - w, base - hgt * 0.45, leg * 0.4, hgt * 0.45);
}

/** Treasure, breathing bubbles as its lid creaks. */
function drawChest(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const { tank, clock, bubbles } = s;
  const u = d.size * tank.unit;
  // The lid is where the child left it, breathing a little rather than flapping.
  const rest = d.open ? 1.15 : 0.12;
  const open = rest + Math.sin(clock * 0.7 + d.phase) * 0.06;
  g.fillStyle = '#92400e';
  g.fillRect(d.x - u * 0.5, base - u * 0.5, u, u * 0.5);
  g.fillStyle = '#fcd34d';
  g.fillRect(d.x - u * 0.5, base - u * 0.3, u, u * 0.08);
  g.fillRect(d.x - u * 0.08, base - u * 0.5, u * 0.16, u * 0.5);
  g.save();
  g.translate(d.x - u * 0.5, base - u * 0.5);
  g.rotate(-open);
  g.fillStyle = '#b45309';
  g.beginPath();
  g.ellipse(u * 0.5, 0, u * 0.5, u * 0.3, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#fcd34d';
  g.fillRect(u * 0.42, -u * 0.28, u * 0.16, u * 0.28);
  g.restore();
  // An open chest lets its treasure breathe.
  if (Math.random() < (d.open ? 0.14 : 0.02) && bubbles.length < maxBubbles()) {
    bubbles.push(makeBubble(d.x, base - u * 0.55, tank));
  }
}

/** A hoop on a stand: fish swim through it whether they mean to or not. */
function drawHoop(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const r = d.size * s.tank.unit * 0.42;
  g.fillStyle = '#e2e8f0';
  g.fillRect(d.x - r * 0.35, base - r * 0.45, r * 0.7, r * 0.45);
  g.strokeStyle = `hsl(${d.hue * 360} 85% 62%)`;
  g.lineWidth = r * 0.2;
  g.beginPath();
  g.arc(d.x, base - r * 1.45, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = r * 0.07;
  g.beginPath();
  g.arc(d.x, base - r * 1.45, r, Math.PI * 1.1, Math.PI * 1.6);
  g.stroke();
}

function drawAnemone(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const { tank, clock } = s;
  const u = d.size * tank.unit;
  // Touched, it pulls its tentacles in — the one ornament that shrinks from a finger.
  const shy = d.poke / POKE_SECONDS;
  g.strokeStyle = `hsl(${300 + d.hue * 70} 78% 70%)`;
  g.lineWidth = u * 0.16 * (1 + shy * 0.4);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const lean = (i / 8 - 0.5) * 1.4 * (1 - shy * 0.75);
    g.beginPath();
    g.moveTo(d.x, base);
    for (let sgmt = 1; sgmt <= 3; sgmt++) {
      const along = sgmt / 3;
      const wave = Math.sin(clock * 1.6 + d.phase + i) * u * 0.22 * along * (1 - shy);
      g.lineTo(d.x + lean * u * 0.55 * along + wave, base - u * 0.95 * along * (1 - shy * 0.7));
    }
    g.stroke();
  }
  g.fillStyle = `hsl(${300 + d.hue * 70} 60% 55%)`;
  g.beginPath();
  g.ellipse(d.x, base, u * 0.42, u * 0.2, 0, Math.PI, Math.PI * 2);
  g.fill();
}

/** The dark clump right against the glass. */
function drawWeed(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  const { tank, clock } = s;
  const u = d.size * tank.unit;
  for (let i = 0; i < 7; i++) {
    const lean = (i / 6 - 0.5) * 1.6;
    const tall = u * (0.6 + ((i * 37) % 10) / 22);
    g.fillStyle = `hsl(${140 + d.hue * 30} 55% ${13 + i}%)`;
    g.beginPath();
    g.moveTo(d.x + lean * u * 0.2 - u * 0.09, base);
    for (const dir of [1, -1]) {
      for (let k = dir > 0 ? 0 : 5; dir > 0 ? k <= 5 : k >= 0; k += dir) {
        const along = k / 5;
        const wave = Math.sin(clock * 0.9 + d.phase + i + along * 2) * u * 0.16 * along * along;
        g.lineTo(d.x + lean * u * 0.2 + wave + dir * u * 0.09 * (1 - along), base - tall * along);
      }
    }
    g.closePath();
    g.fill();
  }
}

function drawDecorBody(g: CanvasRenderingContext2D, s: State, d: Decor, base: number): void {
  switch (d.kind) {
    case 'boulder':
      return drawBoulder(g, s, d, base);
    case 'castle':
      return drawCastle(g, s, d, base);
    case 'arch':
      return drawArch(g, s, d, base);
    case 'chest':
      return drawChest(g, s, d, base);
    case 'hoop':
      return drawHoop(g, s, d, base);
    case 'anemone':
      return drawAnemone(g, s, d, base);
    case 'weed':
      return drawWeed(g, s, d, base);
  }
}

export function drawDecor(g: CanvasRenderingContext2D, s: State, d: Decor): void {
  const base = decorBase(s, d);
  // A poked ornament rocks on its base for a moment, so a tap always lands
  // somewhere visible even on the things that cannot open or curl.
  if (d.poke > 0) {
    g.save();
    g.translate(d.x, base);
    g.rotate(Math.sin(d.poke * 30) * 0.06 * d.poke);
    g.translate(-d.x, -base);
    drawDecorBody(g, s, d, base);
    g.restore();
    return;
  }
  drawDecorBody(g, s, d, base);
}
