import { h, replay } from '../../core/dom';
import { writeJson } from '../../core/save';
import { SAVE_KEY, VEHICLES, makeSave, roadY, type Prop, type Vehicle } from './logic';
import { jobOf } from './jobs';
import { crosserY, honkAt } from './traffic';
import { pokeReply, seedFor } from './props';
import { POKE_REACH } from './config';
import { puff } from './fx';
import { showLoads } from './errands';
import { inView, type Drive } from './state';

/**
 * Keep the vehicle the child took out and whether they left the lights off.
 * Written only after something they did on purpose, never every frame.
 */
export function save(d: Drive): void {
  // Blocked or full storage: the drive still plays, it just forgets.
  writeJson(SAVE_KEY, makeSave(d.vehicle, d.wantNight));
}

/** Client x → canvas x in road pixels. */
function acrossCanvas(d: Drive, e: PointerEvent): { x: number; y: number } {
  const rect = d.el.canvas.getBoundingClientRect();
  const scale = rect.width ? d.road.w / rect.width : 1;
  return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
}

/** Everything beside the road answers back when it is prodded. */
function poke(d: Drive, worldX: number): void {
  const { road, ctx } = d;
  let best: Prop | null = null;
  for (const prop of inView(d)) {
    if (Math.abs(prop.x - worldX) > road.unit * POKE_REACH) continue;
    if (best === null || Math.abs(prop.x - worldX) < Math.abs(best.x - worldX)) best = prop;
  }
  if (!best) return;
  const reply = pokeReply(best, d.job, seedFor(best.slot, d.clock));
  if (!reply) return;
  d.pokes.set(best.slot, d.clock);
  puff(d, best.x, roadY(road, best.x) - road.unit * 1.2, reply.emoji, reply.count);
  if (reply.fx) ctx.audio.fx(reply.fx);
  else ctx.audio.pop(0.9 + (best.slot % 5) * 0.08);
  if (reply.say) ctx.speak(reply.say);
}

/** One of the two pedals. Held down, the car keeps going that way. */
function pedal(d: Drive, btn: HTMLElement, dir: number): void {
  const push = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    d.ctx.hint.touch();
    d.nudge = 0;
    d.steer = dir;
    btn.classList.add('down');
  };
  const lift = (): void => {
    if (d.steer === dir) d.steer = 0;
    btn.classList.remove('down');
  };
  btn.addEventListener('pointerdown', push);
  btn.addEventListener('pointerup', lift);
  btn.addEventListener('pointercancel', lift);
  btn.addEventListener('pointerleave', lift);
}

function useVehicle(d: Drive, v: Vehicle): void {
  const { garage } = d.el;
  const changed = jobOf(v).kind !== d.job.kind;
  d.vehicle = v;
  d.job = jobOf(v);
  garage.textContent = v.emoji;
  garage.dataset.vehicle = v.id;
  if (changed) {
    d.loads = [];
    d.served = new Set();
    d.hosing = null;
    showLoads(d);
  }
  replay(garage, 'anim-bounce');
  save(d);
  d.ctx.audio.fx(v.horn);
  d.ctx.speak(`${v.name}. ${d.job.brief}`);
}

/**
 * The garage. Five buttons along the bottom were five things to press by
 * accident, so they live behind one door and only the one in use is on show.
 */
function openGarage(d: Drive): void {
  if (d.shutGarage) return;
  let done = false;
  // The tap that opened this must not also choose from it: a finger still down
  // when the panel appears would land on whatever turned up underneath it.
  const opened = Date.now();
  const settled = (): boolean => Date.now() - opened > 250;
  const finish = (picked: Vehicle | null): void => {
    if (done) return;
    done = true;
    overlay.remove();
    d.shutGarage = null;
    if (picked) useVehicle(d, picked);
  };
  const tiles = VEHICLES.map((v) => {
    const tile = h(
      'button',
      {
        class: `pp-tile drive-pick${v.id === d.vehicle.id ? ' selected' : ''}`,
        type: 'button',
        'data-vehicle': v.id,
        'aria-label': v.name,
      },
      h('span', { class: 'drive-pick-face' }, v.emoji),
      h('span', { class: 'drive-pick-name' }, v.name),
    );
    tile.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (settled()) finish(v);
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
    { class: 'pp-overlay drive-picker' },
    h('div', { class: 'pp-panel' }, h('div', { class: 'pp-grid' }, ...tiles)),
    shut,
  );
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay && settled()) finish(null);
  });
  d.el.root.append(overlay);
  d.shutGarage = () => finish(null);
  d.ctx.audio.tick();
}

/** Wire every button and the canvas itself to the shared state. */
export function bindControls(d: Drive): void {
  const { canvas, horn, act, night, garage, fwd, back, root } = d.el;
  const { ctx } = d;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    d.nudge = 0;
    poke(d, d.camX + acrossCanvas(d, e).x);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  pedal(d, fwd, 1);
  pedal(d, back, -1);

  horn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    ctx.audio.fx(d.vehicle.horn);
    replay(horn, 'anim-bounce');
    navigator.vibrate?.(10);
    const { car, road } = d;
    // Everything in front gets a move on, herds included.
    const heard = honkAt(car.x, d.travellers, road);
    let scared = 0;
    for (const cr of d.crossers) {
      if (cr.x < car.x - road.unit || cr.x > car.x + road.unit * 8 || cr.hurried) continue;
      cr.hurried = true;
      scared++;
      puff(d, cr.x, crosserY(cr, road), '💨', 2);
    }
    if (scared) ctx.speak('Đàn vật chạy nhanh lên rồi!');
    else if (heard) ctx.speak('Xe phía trước tránh đường nào!');
  });

  const startWork = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    d.working = true;
    replay(act, 'anim-bounce');
  };
  const stopWork = (): void => {
    d.working = false;
  };
  act.addEventListener('pointerdown', startWork);
  act.addEventListener('pointerup', stopWork);
  act.addEventListener('pointercancel', stopWork);
  act.addEventListener('pointerleave', stopWork);

  night.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    d.wantNight = !d.wantNight;
    night.textContent = d.wantNight ? '☀️' : '🌙';
    root.classList.toggle('night', d.wantNight);
    save(d);
    ctx.audio.fx('sparkle');
    ctx.speak(d.wantNight ? 'Trời tối rồi, bật đèn lên!' : 'Trời sáng rồi!');
  });

  garage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    replay(garage, 'anim-bounce');
  });
  garage.addEventListener('pointerup', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    openGarage(d);
  });

  ctx.hint.arm(() => {
    replay(fwd, 'anim-wiggle');
    // Roll forward a little on its own, so the child sees what the button would do.
    if (d.steer === 0) d.nudge = d.car.x + d.road.unit * 2;
  });
}
