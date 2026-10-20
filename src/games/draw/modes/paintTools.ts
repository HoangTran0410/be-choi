/**
 * The toolbar shared by the modes that put ink on paper: colour, pen, size, stamps,
 * paint bucket and eraser — each a big icon, no words. Colours, pens and stamp sets
 * the child has not unlocked yet show behind a lock; touching one does nothing bad.
 */
import { h } from '../../../core/dom';
import { makeButton, type PanelItem, type Scope } from '../ui';
import { COLOR_STEPS, BRUSH_STEPS, THEMES, slow, stampName, type BrushKind } from '../progress';
import { SIZES, SIZE_NAMES, type Surface } from '../surface';
import type { ModeEnv } from '../env';

export interface PaintToolsConfig {
  brushes?: boolean;
  size?: boolean;
  stamps?: boolean;
  bucket?: boolean;
  eraser?: boolean;
}

export interface PaintTools {
  buttons: HTMLElement[];
  /** Redraw the swatch and which button is lit. */
  refresh(): void;
  pickColor(hex: string): void;
}

const dot = (px: number): HTMLElement => h('span', { class: 'dr-size-dot', style: `--d:${px}px` });

export function paintTools(env: ModeEnv, surface: Surface, scope: Scope, cfg: PaintToolsConfig): PaintTools {
  const { ctx } = env;
  const buttons: HTMLElement[] = [];

  const swatch = h('span', { class: 'dr-swatch', style: `--sw:${surface.tool.color}` });
  const colorBtn = makeButton(scope, { label: 'chọn màu', content: swatch, cls: 'dr-color', onTap: openColors });
  buttons.push(colorBtn);

  let brushBtn: HTMLElement | null = null;
  if (cfg.brushes !== false) {
    brushBtn = makeButton(scope, { label: 'chọn bút', content: '✏️', cls: 'dr-brush', onTap: openBrushes });
    buttons.push(brushBtn);
  }

  let bucketBtn: HTMLElement | null = null;
  if (cfg.bucket) {
    bucketBtn = makeButton(scope, {
      label: 'đổ màu',
      content: '🪣',
      cls: 'dr-bucket',
      onTap: () => {
        surface.setTool({ tool: 'bucket' });
        ctx.audio.tick();
        refresh();
      },
    });
    buttons.splice(1, 0, bucketBtn);
  }

  let sizeBtn: HTMLElement | null = null;
  if (cfg.size !== false) {
    sizeBtn = makeButton(scope, {
      label: 'cỡ bút',
      content: dot(10),
      cls: 'dr-size',
      onTap: () => {
        const next = (surface.tool.size + 1) % SIZES.length;
        surface.setTool({ size: next });
        ctx.audio.tick();
        refresh();
      },
    });
    buttons.push(sizeBtn);
  }

  let stampBtn: HTMLElement | null = null;
  if (cfg.stamps) {
    stampBtn = makeButton(scope, { label: 'hình dán', content: surface.tool.emoji, cls: 'dr-stamp', onTap: openStamps });
    buttons.push(stampBtn);
  }

  let eraserBtn: HTMLElement | null = null;
  if (cfg.eraser !== false) {
    eraserBtn = makeButton(scope, {
      label: 'cục tẩy',
      content: '🧹',
      cls: 'dr-eraser',
      onTap: () => {
        surface.setTool({ tool: 'eraser' });
        ctx.audio.tick();
        refresh();
      },
    });
    buttons.push(eraserBtn);
  }

  function pickColor(hex: string): void {
    surface.setTool({ color: hex, tool: surface.tool.tool === 'bucket' ? 'bucket' : 'brush' });
    refresh();
  }

  function openColors(): void {
    ctx.audio.tick();
    const made = env.made();
    const items: PanelItem[] = COLOR_STEPS.map((c) => {
      const locked = c.at > made;
      return {
        id: c.hex,
        label: c.name,
        color: c.hex,
        locked,
        selected: c.hex === surface.tool.color,
        onPick: () => {
          if (locked) {
            ctx.audio.boing();
            env.say('Vẽ thêm tranh để mở màu mới nhé!');
            return false;
          }
          pickColor(c.hex);
          env.say(slow(c.name));
        },
      };
    });
    env.openPanel(items);
  }

  function openBrushes(): void {
    ctx.audio.tick();
    const made = env.made();
    const items: PanelItem[] = BRUSH_STEPS.map((b) => {
      const locked = b.at > made;
      return {
        id: b.kind,
        label: b.name,
        text: b.icon,
        locked,
        selected: surface.tool.tool === 'brush' && surface.tool.brush === b.kind,
        onPick: () => {
          if (locked) {
            ctx.audio.boing();
            env.say('Vẽ thêm tranh để mở bút mới nhé!');
            return false;
          }
          surface.setTool({ brush: b.kind as BrushKind, tool: 'brush' });
          refresh();
          env.say(slow(b.name));
        },
      };
    });
    env.openPanel(items);
  }

  function openStamps(): void {
    ctx.audio.tick();
    const made = env.made();
    const collected = new Set(env.gallery.collected());
    const items: PanelItem[] = [];
    for (const t of THEMES) {
      if (t.at > made) {
        items.push({ heading: `${t.icon}` });
        items.push({
          id: `locked-${t.id}`,
          label: `bộ hình dán ${t.name}`,
          text: t.icon,
          locked: true,
          onPick: () => {
            ctx.audio.boing();
            env.say('Vẽ thêm tranh để mở hình dán mới nhé!');
            return false;
          },
        });
        continue;
      }
      items.push({ heading: t.icon });
      for (const s of t.items) {
        items.push({
          id: s.emoji,
          label: s.name,
          text: s.emoji,
          selected: surface.tool.tool === 'stamp' && surface.tool.emoji === s.emoji,
          badge: collected.has(s.emoji) ? undefined : '✨',
          onPick: () => pick(s.emoji),
        });
      }
    }
    const own = ctx.stickers();
    if (own.length) {
      items.push({ heading: '🎁' });
      for (const emoji of own) items.push({ id: emoji, label: 'hình dán của bé', text: emoji, onPick: () => pick(emoji) });
    }
    env.openPanel(items, { wide: true, sixes: true });
  }

  function pick(emoji: string): void {
    surface.setTool({ tool: 'stamp', emoji });
    refresh();
    const name = stampName(emoji);
    if (name) env.say(slow(name));
  }

  function refresh(): void {
    const t = surface.tool;
    swatch.style.setProperty('--sw', t.color);
    if (brushBtn) {
      brushBtn.textContent = BRUSH_STEPS.find((b) => b.kind === t.brush)?.icon ?? '✏️';
      brushBtn.classList.toggle('selected', t.tool === 'brush');
    }
    bucketBtn?.classList.toggle('selected', t.tool === 'bucket');
    if (sizeBtn) {
      sizeBtn.setAttribute('aria-label', SIZE_NAMES[t.size] ?? 'cỡ bút');
      sizeBtn.replaceChildren(dot(8 + t.size * 9));
    }
    if (stampBtn) {
      stampBtn.textContent = t.emoji;
      stampBtn.classList.toggle('selected', t.tool === 'stamp');
    }
    eraserBtn?.classList.toggle('selected', t.tool === 'eraser');
  }

  refresh();
  return { buttons, refresh, pickColor };
}

