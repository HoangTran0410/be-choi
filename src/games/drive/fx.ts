import type { Drive } from './state';

export function puff(d: Drive, x: number, y: number, emoji: string, count: number): void {
  const { rng, road } = d;
  for (let i = 0; i < count; i++) {
    d.flyers.push({
      x,
      y,
      vx: (rng() - 0.5) * road.unit * 1.6,
      vy: -road.unit * (0.8 + rng() * 1.2),
      life: 1,
      emoji,
      size: road.unit * (0.22 + rng() * 0.12),
    });
  }
}

export function splash(d: Drive, x: number, y: number): void {
  const { rng, road } = d;
  for (let i = 0; i < 5; i++) {
    d.flyers.push({
      x,
      y: y + road.unit * 0.3,
      vx: (rng() - 0.5) * road.unit * 2.4,
      vy: -road.unit * (0.6 + rng()),
      life: 0.6,
      emoji: '💧',
      size: road.unit * 0.18,
    });
  }
}

export function stepFlyers(d: Drive, dt: number): void {
  const { flyers, road } = d;
  for (const f of flyers) {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vy += road.unit * 3.4 * dt;
    f.life -= dt * 0.9;
  }
  for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i]!.life <= 0) flyers.splice(i, 1);
}
