/**
 * Front camera as a mirror: a <video> the game can show behind its scene, and a
 * snapshot the parent can keep. Like the microphone, a refused permission is not
 * an error — `start()` just answers null and the game carries on without it.
 */
import { MAX_SIDE } from './photos';

export interface Camera {
  /** True while a stream is running. */
  readonly on: boolean;
  /** Ask for the camera. Must be called from a user gesture (iOS). Never throws. */
  start(): Promise<HTMLVideoElement | null>;
  /**
   * Mirrored JPEG of the current frame, sized like the video. `decorate` draws on
   * top (a frame, stage lights) before the picture is encoded.
   */
  snapshot(decorate?: (c: CanvasRenderingContext2D, w: number, h: number) => void): Promise<Blob | null>;
  stop(): void;
}

/** Fit `sw`×`sh` inside a `max` box, keeping the shape. */
export function snapshotSize(sw: number, sh: number, max = MAX_SIDE): { w: number; h: number } {
  if (sw <= 0 || sh <= 0) return { w: 0, h: 0 };
  const s = Math.min(1, max / Math.max(sw, sh));
  return { w: Math.max(1, Math.round(sw * s)), h: Math.max(1, Math.round(sh * s)) };
}

export function createCamera(max = MAX_SIDE): Camera {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let starting: Promise<HTMLVideoElement | null> | null = null;

  async function open(): Promise<HTMLVideoElement | null> {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') return null;
    let media: MediaStream;
    try {
      media = await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    } catch {
      return null;
    }
    try {
      const el = document.createElement('video');
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.srcObject = media;
      try {
        // Autoplay may be blocked; the stream still renders once the child taps again.
        await el.play();
      } catch {
        /* ignore */
      }
      stream = media;
      video = el;
      return el;
    } catch {
      for (const t of media.getTracks()) t.stop();
      return null;
    }
  }

  return {
    get on() {
      return stream !== null;
    },
    async start() {
      if (video) return video;
      if (!starting) starting = open();
      const el = await starting;
      starting = null;
      return el;
    },
    async snapshot(decorate) {
      const el = video;
      if (!el || !el.videoWidth || !el.videoHeight) return null;
      const { w, h } = snapshotSize(el.videoWidth, el.videoHeight, max);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext('2d');
        if (!c) return null;
        // Mirror, so the picture matches what the child saw on screen.
        c.save();
        c.translate(w, 0);
        c.scale(-1, 1);
        c.drawImage(el, 0, 0, w, h);
        c.restore();
        decorate?.(c, w, h);
        return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
      } catch {
        return null;
      }
    },
    stop() {
      if (video) {
        try {
          video.pause();
          video.srcObject = null;
        } catch {
          /* already detached */
        }
        video.remove();
        video = null;
      }
      if (stream) {
        try {
          for (const t of stream.getTracks()) t.stop();
        } catch {
          /* already gone */
        }
        stream = null;
      }
    },
  };
}
