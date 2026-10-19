import { createCamera } from '../../core/camera';
import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  CENTER,
  DETECT_MS,
  LOST_MS,
  MASKS,
  MAX_DETECT_ERRORS,
  nextIndex,
  placeOnStage,
  smooth,
  trackMask,
  type MaskDef,
  type Placement,
  type RewardState,
} from './logic';
import './style.css';

interface FaceDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>>;
}
interface FaceDetectorCtor {
  new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }): FaceDetectorLike;
}

/**
 * Biến hình. The front camera is a mirror and an animal mask sits on the child's
 * face. Where the browser has FaceDetector the mask follows the face; where it
 * does not, the mask stays in the middle and the child leans in to wear it.
 * Without a camera at all, a cartoon child in a cartoon mirror wears the masks.
 *
 * Everything stays on the device: no picture is taken, kept or sent anywhere, and
 * leaving the game switches the camera off. There is no wrong answer — the big
 * button always gives another mask and its animal sound.
 */
function start(ctx: GameContext): void {
  const cam = createCamera();
  let alive = true;
  let index = 0;
  let reward: RewardState = { seen: [] };
  let place: Placement = CENTER;
  let video: HTMLVideoElement | null = null;
  let detector: FaceDetectorLike | null = null;
  let detectErrors = 0;
  let detecting = false;
  let lastFace = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let celebrating = false;

  const mirror = h('div', { class: 'mask-mirror' });
  const cartoon = h('div', { class: 'mask-cartoon' }, h('span', null, '🧒'));
  const note = h('div', { class: 'mask-cartoon-note' }, 'Gương hoạt hình đây! Bé đội mặt nạ nhé!');
  mirror.append(cartoon);
  const emoji = h('div', { class: 'mask-emoji' });
  const face = h('div', { class: 'mask-face' }, emoji);
  const nextBtn = h('button', { class: 'btn-round mask-next hint', type: 'button', 'aria-label': 'Đổi mặt nạ', onpointerdown: onNext });
  const camBtn = h('button', { class: 'btn-round mask-cam', type: 'button', 'aria-label': 'Bật máy ảnh', onpointerup: onCam }, '📷');
  const root = h('div', { class: 'mask' }, mirror, note, face, nextBtn, camBtn);
  ctx.stage.append(root);

  function current(): MaskDef {
    return MASKS[index] as MaskDef;
  }

  function render(): void {
    const m = current();
    emoji.textContent = m.emoji;
    emoji.style.setProperty('--mask-glow', m.glow);
    nextBtn.textContent = (MASKS[nextIndex(index)] as MaskDef).emoji;
    layout();
  }

  function layout(): void {
    const w = ctx.stage.clientWidth || 0;
    const hgt = ctx.stage.clientHeight || 0;
    face.style.transform = `translate(${Math.round(place.x * w)}px, ${Math.round(place.y * hgt)}px)`;
    const size = Math.round(place.size * Math.min(w, hgt));
    emoji.style.setProperty('--mask-size', `${size || 240}px`);
  }

  function wear(i: number, first = false): void {
    index = i;
    const m = current();
    render();
    replay(emoji, 'pop');
    if (first) return;
    ctx.audio.fx(m.voice);
    ctx.speak(m.say);
    const r = trackMask(reward, m.id);
    reward = r.state;
    if (r.reward && !celebrating) {
      celebrating = true;
      ctx.addStar();
      void ctx.celebrate().then(() => {
        celebrating = false;
      });
    }
  }

  function onNext(): void {
    ctx.audio.unlock();
    ctx.hint.touch();
    nextBtn.classList.remove('hint');
    wear(nextIndex(index));
    armHint();
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      if (alive) nextBtn.classList.add('hint');
    });
  }

  // ---- face tracking (optional) ----
  function makeDetector(): FaceDetectorLike | null {
    const Ctor = (globalThis as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
    if (typeof Ctor !== 'function') return null;
    try {
      return new Ctor({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      return null;
    }
  }

  async function track(): Promise<void> {
    const el = video;
    const det = detector;
    if (!alive || !el || !det || detecting || !el.videoWidth) return;
    detecting = true;
    try {
      const faces = await det.detect(el);
      detectErrors = 0;
      const box = faces[0]?.boundingBox;
      const target = box
        ? placeOnStage(box, { w: el.videoWidth, h: el.videoHeight }, { w: ctx.stage.clientWidth, h: ctx.stage.clientHeight })
        : null;
      if (target) {
        lastFace = Date.now();
        place = smooth(place, target);
      } else if (Date.now() - lastFace > LOST_MS) {
        place = smooth(place, CENTER, 0.2);
      }
      if (alive) layout();
    } catch {
      // Unsupported on this device after all: the fixed mask is fine.
      if (++detectErrors >= MAX_DETECT_ERRORS) detector = null;
    } finally {
      detecting = false;
    }
  }

  async function onCam(): Promise<void> {
    ctx.hint.touch();
    if (camBtn.classList.contains('waiting') || video) return;
    camBtn.classList.add('waiting');
    const el = await cam.start();
    camBtn.classList.remove('waiting');
    if (!alive) {
      cam.stop();
      return;
    }
    if (!el) {
      ctx.speak('Chưa mở được máy ảnh. Mình chơi với gương hoạt hình nhé!');
      return;
    }
    video = el;
    el.className = 'mask-video';
    mirror.append(el);
    root.classList.add('cam-on');
    camBtn.hidden = true;
    place = CENTER;
    detector = makeDetector();
    detectErrors = 0;
    lastFace = Date.now();
    if (detector && !timer) timer = setInterval(() => void track(), DETECT_MS);
    layout();
    ctx.speak('Bé nhìn thấy mình chưa?');
  }

  ctx.onCleanup(() => {
    alive = false;
    if (timer) clearInterval(timer);
    timer = null;
    video = null;
    cam.stop();
    window.removeEventListener('resize', layout);
  });
  window.addEventListener('resize', layout);

  wear(0, true);
  armHint();
  // Camera first: the child just tapped the tile, so this counts as a user gesture.
  void onCam();
}

const game: GameModule = { ...meta, start };
export default game;
