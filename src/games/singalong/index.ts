import { h, replay } from '../../core/dom';
import type { Photo } from '../../core/photos';
import { makeTappable } from '../../core/tap';
import type { GameContext, GameModule } from '../../core/types';
import { createAudience } from './audience';
import { fanCount } from './catalog';
import { createHud, MODES, type ModeId } from './hud';
import { createNarrator } from './narrator';
import { meta } from './meta';
import { createBirdMode } from './modes/bird';
import { createEchoMode } from './modes/echo';
import { createPerformMode } from './modes/perform';
import { createSongMode } from './modes/song';
import type { Env, Mode, ModeFactory } from './modes/types';
import { createProgress } from './progress';
import { showResults } from './results';
import { rateShow, type ShowStats } from './show';
import { createStage, resolveFace } from './stage';
import { createTimers } from './timers';
import { createVoice } from './voice';
import { openWardrobe } from './wardrobe';
import './style.css';

const FACTORIES: Record<ModeId, ModeFactory> = {
  song: createSongMode,
  echo: createEchoMode,
  bird: createBirdMode,
  perform: createPerformMode,
};

/**
 * Hát cùng bé: one concert hall for everything a child can do with their voice.
 * The child is the singer (a character, or a photo of someone they love); the
 * animals and the family in the front row react to how loud and how high they
 * sing. Four ways to play — sing along, the echo choir, the singing bird, and a
 * full show with the band — all share the same stage, the same tickets and the
 * same gifts. With no microphone a tap on the singer does the singing.
 */
function start(ctx: GameContext): void {
  const progress = createProgress();
  const voice = createVoice(ctx);
  const stage = createStage(ctx);
  const audience = createAudience(ctx);
  let alive = true;
  let current: ModeId = 'song';
  let photos: Photo[] = [];
  /** Bumped on every mode change, so a show that ends after the child left it does not pop up over the new one. */
  let epoch = 0;
  let closeResults: (() => void) | null = null;
  let closeWardrobe: (() => void) | null = null;
  let askedMic = false;
  /** The shell is still speaking the introduction: say nothing over it. */
  const hushUntil = Date.now() + 3500;

  const root = h('div', { class: 'sa' });
  const bubble = h('div', { class: 'sa-bubble', 'aria-live': 'polite' });
  const body = h('div', { class: 'sa-body' });
  const micBtn = h('button', { class: 'btn-round sa-mic', type: 'button', 'aria-label': 'Bật micro' }, '🎤');
  const wardrobeBtn = h('button', { class: 'btn-round sa-wardrobe', type: 'button', 'aria-label': 'Thay đồ cho ca sĩ' }, '👗');
  const narrator = createNarrator(ctx, (text) => {
    bubble.textContent = text;
    replay(bubble, 'anim-bounce');
  });
  const hud = createHud(ctx, (id) => switchTo(id));

  // ---- the modes ----
  const env: Env = {
    ctx,
    voice,
    stage,
    audience,
    progress,
    // Text only unless a mode asks for `speak`: nothing is spoken over the music on a tap.
    say: (text, opts) => narrator.say(text, { quiet: !opts?.speak || opts.quiet === true || Date.now() < hushUntil }),
    timers() {
      const t = createTimers();
      ctx.onCleanup(t.clear);
      return t;
    },
    touch: () => ctx.hint.touch(),
    alive: () => alive,
    finish,
  };
  const panels = new Map<ModeId, HTMLElement>();
  const modes = new Map<ModeId, Mode>();
  for (const m of MODES) {
    const panel = h('div', { class: 'sa-mode-panel', 'data-mode': m.id, hidden: true });
    panels.set(m.id, panel);
    body.append(panel);
  }

  root.append(
    stage.back,
    hud.el,
    h('div', { class: 'sa-panel' }, bubble, body),
    h('div', { class: 'sa-singer-row' }, micBtn, stage.singer, wardrobeBtn),
    audience.el,
    stage.fx,
  );
  ctx.stage.append(root);

  function mode(id: ModeId): Mode {
    let m = modes.get(id);
    if (!m) {
      m = FACTORIES[id](env, panels.get(id) as HTMLElement);
      modes.set(id, m);
    }
    return m;
  }

  function switchTo(id: ModeId, first = false): void {
    if (!first && id === current) return;
    epoch++;
    closeResults?.();
    closeResults = null;
    if (!first) {
      modes.get(current)?.leave();
      panels.get(current)?.setAttribute('hidden', '');
    }
    current = id;
    root.dataset.mode = id;
    panels.get(id)?.removeAttribute('hidden');
    hud.setMode(id);
    ctx.audio.pop();
    ctx.hint.touch();
    mode(id).enter();
  }

  async function finish(stats: ShowStats): Promise<void> {
    const mine = epoch;
    const result = rateShow(stats);
    stage.burst('sparkle');
    audience.cheer(1800);
    ctx.audio.fx('cheer');
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    const { after, gifts } = progress.addShow(result.tickets);
    hud.setTickets(after);
    refreshLook();
    if (mine !== epoch) return;
    narrator.say(gifts.length > 0 ? `Bé được ${result.stars} sao! Có quà mới nè!` : `Hay quá! Bé được ${result.stars} sao!`);
    await new Promise<void>((resolve) => {
      const close = showResults(ctx, root, { ...result, gifts, total: after }, () => {
        closeResults = null;
        resolve();
      });
      // Leaving the mode closes the card; the show must not wait for a tap that cannot come.
      closeResults = () => {
        close();
        resolve();
      };
    });
  }

  // ---- the singer, the crowd ----
  function refreshLook(): void {
    const p = progress.get();
    stage.setTheme(p.stage);
    stage.setHat(p.hat);
    stage.setFace(resolveFace(p.face, photos));
    audience.setFans(fanCount(p.tickets), photos);
    hud.setTickets(p.tickets);
  }

  function applyPhotos(list: Photo[]): void {
    if (!alive) return;
    photos = list;
    refreshLook();
  }
  void ctx.photos.list().then(applyPhotos);
  ctx.onCleanup(ctx.photos.onChange(applyPhotos));

  // A finger on the singer is a clap, and a held finger is a held note.
  const singer = stage.singer;
  singer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      singer.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom, and browsers that refuse a capture we can live without */
    }
    voice.press();
    ctx.hint.touch();
    stage.wave();
    modes.get(current)?.hit?.();
  });
  const letGo = (): void => voice.release();
  singer.addEventListener('pointerup', letGo);
  singer.addEventListener('pointercancel', letGo);
  singer.addEventListener('lostpointercapture', letGo);

  // ---- the microphone ----
  function showMic(): void {
    micBtn.classList.toggle('sa-on', voice.micOn);
    micBtn.classList.toggle('sa-off', voice.micRefused && !voice.micOn);
    root.classList.toggle('sa-mic-on', voice.micOn);
  }

  async function askMic(): Promise<void> {
    askedMic = true;
    ctx.hint.touch();
    if (voice.micOn) return;
    micBtn.classList.add('sa-waiting');
    const ok = await voice.requestMic();
    micBtn.classList.remove('sa-waiting');
    if (!alive) return;
    showMic();
    if (!ok) {
      // The button stays, dimmed: a parent who allows the microphone later can press it again.
      narrator.say('Chưa nghe được micro. Không sao, bé chạm vào ca sĩ để vỗ tay nhé!');
      return;
    }
    narrator.say('Micro nghe được rồi. Bé hát to lên nào!', { quiet: true });
  }

  makeTappable(
    micBtn,
    () => {
      ctx.audio.tick();
      void askMic();
    },
    { ctx },
  );
  // The first touch anywhere asks for the microphone, once: a child's first act is rarely the mic button.
  const firstTouch = (): void => {
    root.removeEventListener('pointerup', firstTouch);
    if (!askedMic && !voice.micOn) void askMic();
  };
  root.addEventListener('pointerup', firstTouch);

  makeTappable(
    wardrobeBtn,
    () => {
      ctx.audio.tick();
      ctx.hint.touch();
      closeWardrobe?.();
      closeWardrobe = openWardrobe(ctx, {
        parent: root,
        progress,
        photos,
        onChange: refreshLook,
        onLocked: (need, have) => narrator.say(`Còn ${Math.max(1, need - have)} vé nữa là mở. Bé hát thêm nhé!`, { quiet: true }),
      });
    },
    { ctx },
  );

  voice.onFrame((f) => {
    stage.react(f);
    audience.react(f);
    modes.get(current)?.frame?.(f);
  });

  ctx.hint.arm(() => {
    modes.get(current)?.nudge?.();
    if (!voice.micOn && !voice.micRefused) replay(micBtn, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    alive = false;
    root.removeEventListener('pointerup', firstTouch);
    closeResults?.();
    closeWardrobe?.();
    modes.get(current)?.leave();
    narrator.stop();
  });

  refreshLook();
  showMic();
  switchTo('song', true);
}

const game: GameModule = { ...meta, start };
export default game;
