import { h, replay, wait } from '../../core/dom';
import { sayText } from '../../core/say';
import { makeTappable } from '../../core/tap';
import type { GameContext, GameModule } from '../../core/types';
import { ARROW, SAY, generateLevel, loadSave, nextHint, persist, simulate, type Cell, type Level, type Move, type Tile } from './logic';
import { meta } from './meta';
import './style.css';
import { recordSkill } from '../../core/mastery';

const STEP_MS = 850;

/**
 * Cú tìm kho báu: the child lines up big arrow tiles in a tray and presses play; the owl walks the
 * program step by step, saying "lên / xuống / sang trái / sang phải". Bumping into a tree or the edge
 * is a soft bounce and the program stops; nothing is ever lost and the tray stays to be fixed.
 */
function start(ctx: GameContext): void {
  const save = loadSave();
  let level: Level = generateLevel(save.level);
  let tray: Tile[] = [];
  let running = false;
  /** Runs on this level so far: solved on the first run counts as known. */
  let runs = 0;
  let alive = true;
  let cell = 80;
  let curCell: Cell = level.start;

  const board = h('div', { class: 'tr-board' });
  const wrap = h('div', { class: 'tr-wrap' }, board);
  const trayEl = h('div', { class: 'tr-tray' });
  const palette = h('div', { class: 'tr-palette' });
  const play = h('button', { class: 'tr-play', type: 'button', 'aria-label': 'Chạy' }, '▶️');
  const clear = h('button', { class: 'tr-clear', type: 'button', 'aria-label': 'Xoá hết' }, '🗑️');
  const panel = h('div', { class: 'tr-panel' }, trayEl, palette, h('div', { class: 'tr-go' }, clear, play));
  const root = h('div', { class: 'tr' }, wrap, panel);
  ctx.stage.append(root);

  const owl = h('div', { class: 'tr-owl' }, '🦉');
  let chestEl: HTMLElement;
  let starEls: HTMLElement[] = [];

  const at = (c: Cell, dx = 0, dy = 0) => `translate(${c.c * cell + dx}px, ${c.r * cell + dy}px)`;

  function layout(): void {
    root.classList.toggle('is-land', (root.clientWidth || 390) > (root.clientHeight || 844));
    const w = wrap.clientWidth || 380;
    const hh = wrap.clientHeight || 380;
    cell = Math.max(56, Math.floor(Math.min(w, hh) / level.size) - 2);
    const px = cell * level.size;
    board.style.cssText = `width:${px}px;height:${px}px;--cell:${cell}px`;
    owl.style.transform = at(curCell);
    for (const el of board.querySelectorAll<HTMLElement>('.tr-item'))
      el.style.transform = `translate(${Number(el.dataset.c) * cell}px, ${Number(el.dataset.r) * cell}px)`;
  }
  function buildBoard(): void {
    board.replaceChildren();
    for (let r = 0; r < level.size; r++)
      for (let c = 0; c < level.size; c++) board.append(h('div', { class: (r + c) % 2 ? 'tr-cell is-b' : 'tr-cell' }));
    const put = (cl: Cell, emoji: string, klass: string): HTMLElement => {
      const el = h('div', { class: `tr-item ${klass}` }, emoji);
      el.dataset.r = String(cl.r);
      el.dataset.c = String(cl.c);
      board.append(el);
      return el;
    };
    level.rocks.forEach((rk, i) => put(rk, i % 2 ? '🪨' : '🌳', 'tr-rock'));
    starEls = level.stars.map((s) => put(s, '⭐', 'tr-star'));
    chestEl = put(level.chest, '🎁', 'tr-chest');
    curCell = level.start;
    board.append(owl);
    owl.style.transition = 'none';
    layout();
  }

  function renderTray(highlight = -1): void {
    trayEl.replaceChildren();
    for (let i = 0; i < level.maxSteps; i++) {
      const t = tray[i];
      const slot = h(
        'button',
        { class: t ? 'tr-slot is-full' : 'tr-slot', type: 'button', 'aria-label': t ? SAY[t] : 'Chỗ trống' },
        t ? ARROW[t] : '',
      );
      if (i === highlight) slot.classList.add('is-now');
      if (t) makeTappable(slot, () => removeAt(i), { ctx, cooldownMs: 200 });
      trayEl.append(slot);
    }
    play.classList.toggle('is-ready', tray.length > 0);
  }

  function renderPalette(): void {
    palette.replaceChildren();
    for (const t of level.tiles) {
      const b = h('button', { class: 'tr-tile', type: 'button', 'data-tile': t, 'aria-label': SAY[t] }, ARROW[t]);
      if (t === 'again') b.append(h('span', { class: 'tr-x2' }, '×2'));
      makeTappable(b, () => add(t), { ctx, cooldownMs: 150 });
      palette.append(b);
    }
  }

  function add(t: Tile): void {
    if (running) return;
    ctx.hint.touch();
    if (tray.length >= level.maxSteps) {
      ctx.audio.boing();
      return;
    }
    if (t === 'again' && tray.length === 0) {
      ctx.audio.boing();
      void sayText(ctx, 'Bấm mũi tên trước nhé!');
      return;
    }
    tray.push(t);
    ctx.audio.pop(0.8 + tray.length * 0.08);
    ctx.speak(SAY[t]);
    renderTray();
  }

  function removeAt(i: number): void {
    if (running) return;
    ctx.hint.touch();
    tray.splice(i, 1);
    ctx.audio.pop(0.7);
    renderTray();
  }

  function reset(): void {
    curCell = level.start;
    owl.style.transition = 'none';
    owl.style.transform = at(curCell);
    starEls.forEach((s) => s.classList.remove('is-got'));
    chestEl.textContent = '🎁';
    void owl.offsetWidth;
    owl.style.transition = '';
  }

  async function animate(m: Move): Promise<void> {
    renderTray(m.tile);
    if (m.kind === 'move') {
      owl.style.transform = at(m.to);
      curCell = m.to;
      ctx.audio.pop(1.1);
      if (m.star !== undefined) {
        starEls[m.star]?.classList.add('is-got');
        ctx.audio.note(880, 0.2);
      }
      await wait(STEP_MS);
      return;
    }
    // Soft bounce against a tree or the edge.
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[m.dir];
    owl.style.transform = at(m.from, d[0]! * cell * 0.3, d[1]! * cell * 0.3);
    await wait(260);
    ctx.audio.boing();
    owl.style.transform = at(m.from);
    await wait(380);
  }

  async function run(): Promise<void> {
    if (running || tray.length === 0) {
      if (!running) {
        ctx.audio.boing();
        void sayText(ctx, 'Bấm mũi tên trước nhé!');
      }
      return;
    }
    running = true;
    ctx.hint.touch();
    root.classList.add('is-running');
    reset();
    await wait(200);
    const result = simulate(level, tray);
    runs++;
    const spokenTile = new Set<number>();
    for (const m of result.moves) {
      if (!alive) return;
      if (!spokenTile.has(m.tile)) {
        spokenTile.add(m.tile);
        ctx.speak(m.kind === 'move' ? SAY[tray[m.tile]!] : SAY[m.dir]);
      }
      await animate(m);
    }
    if (!alive) return;
    renderTray();
    if (result.outcome === 'win') {
      chestEl.textContent = '🎉';
      replay(chestEl, 'anim-wiggle');
      ctx.audio.ding();
      void sayText(ctx, 'Cú tìm thấy kho báu rồi!');
      await ctx.celebrate();
      if (!alive) return;
      ctx.addStar();
      recordSkill(`code:L${Math.min(level.k, 12)}`, runs === 1);
      runs = 0;
      save.level = level.k + 1;
      persist(save);
      await wait(600);
      if (!alive) return;
      next();
      return;
    }
    const last = result.moves.at(-1);
    if (result.outcome === 'bump') {
      const rock = last?.kind === 'rock';
      void sayText(ctx, rock ? 'Ôi, có cây chắn đường! Mình đi đường khác nhé.' : 'Hết đường rồi! Mình đổi hướng nhé.');
    } else if (level.stars.length && result.moves.length && result.at.r === level.chest.r && result.at.c === level.chest.c) {
      void sayText(ctx, 'Còn ngôi sao nữa! Mình nhặt sao trước nhé.');
    } else {
      void sayText(ctx, 'Chưa tới kho báu. Thêm bước nữa nhé!');
    }
    await wait(1100);
    if (!alive) return;
    reset();
    running = false;
    root.classList.remove('is-running');
    ctx.hint.touch();
  }

  function next(): void {
    level = generateLevel(save.level);
    tray = [];
    running = false;
    root.classList.remove('is-running');
    buildBoard();
    renderPalette();
    renderTray();
    intro();
  }

  function intro(): void {
    if (level.stars.length) void sayText(ctx, 'Nhặt hết ngôi sao rồi mở kho báu nhé!');
    else void sayText(ctx, 'Dẫn cú tới kho báu nhé!');
    let nudged = -1;
    ctx.hint.arm(() => {
      if (running) return;
      if (nudged !== (ctx.hint.epoch ?? 0)) {
        nudged = ctx.hint.epoch ?? 0;
        void sayText(ctx, tray.length ? 'Bấm nút chạy nhé!' : 'Bấm mũi tên để dẫn cú đi nhé!');
      }
      const want = nextHint(level, tray);
      const el = want ? palette.querySelector<HTMLElement>(`[data-tile="${want}"]`) : tray.length ? play : null;
      if (el) replay(el, 'anim-wiggle');
    });
  }

  makeTappable(play, () => void run(), { ctx, cooldownMs: 300 });
  makeTappable(
    clear,
    () => {
      if (running) return;
      tray = [];
      ctx.audio.pop(0.6);
      renderTray();
    },
    { ctx, cooldownMs: 250 },
  );

  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
  });

  buildBoard();
  renderPalette();
  renderTray();
  intro();
  requestAnimationFrame(layout);
}

const game: GameModule = { ...meta, start };
export default game;
