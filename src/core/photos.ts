/**
 * Family photos chosen by a parent, kept on the device (IndexedDB) so the jigsaw,
 * colouring and drawing games can use them offline. Images are downscaled to JPEG
 * data URLs before storing. Falls back to an in-memory list when IndexedDB is
 * unavailable (private mode, jsdom).
 */
export interface Photo {
  id: string;
  /** JPEG data URL, longest side ≤ MAX_SIDE. */
  url: string;
  createdAt: number;
}

export interface PhotoStore {
  list(): Promise<Photo[]>;
  /** Resize and store. Returns the stored photos. Stops silently at MAX_PHOTOS. */
  add(files: Iterable<Blob>): Promise<Photo[]>;
  remove(id: string): Promise<void>;
  /** Called after every add/remove. Returns an unsubscribe function. */
  onChange(fn: (photos: Photo[]) => void): () => void;
}

export const MAX_PHOTOS = 12;
export const MAX_SIDE = 1024;
const DB_NAME = 'be-choi';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

/** Downscale an image file to a JPEG data URL. Needs a real browser (Image + canvas). */
export async function resizeImage(file: Blob, maxSide = MAX_SIDE, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không đọc được ảnh'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Không có canvas');
    c.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Không tải được ảnh'));
    el.src = url;
  });
}

/** Draw `img` into a `w`×`h` box like CSS `object-fit: cover`. */
export function drawCover(c: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/**
 * Turn a photo into a bold black-on-white line drawing the child can colour in.
 * Pure function over RGBA pixels: grayscale → Sobel edge magnitude → threshold →
 * 1-px dilation so the lines are thick enough for little fingers.
 */
export function lineArtPixels(rgba: Uint8ClampedArray, w: number, h: number, threshold = 48): Uint8ClampedArray {
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * (rgba[p] ?? 0) + 0.587 * (rgba[p + 1] ?? 0) + 0.114 * (rgba[p + 2] ?? 0);
  }
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const g = (dx: number, dy: number) => gray[i + dy * w + dx] ?? 0;
      const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1);
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
      if (Math.sqrt(gx * gx + gy * gy) > threshold) edge[i] = 1;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let black = edge[i] === 1;
      if (!black) {
        // dilate: any 4-neighbour edge makes this pixel black too
        black =
          (x > 0 && edge[i - 1] === 1) ||
          (x < w - 1 && edge[i + 1] === 1) ||
          (y > 0 && edge[i - w] === 1) ||
          (y < h - 1 && edge[i + w] === 1);
      }
      const v = black ? 40 : 255;
      const p = i * 4;
      out[p] = v;
      out[p + 1] = v;
      out[p + 2] = v;
      out[p + 3] = 255;
    }
  }
  return out;
}

/** Photo → line drawing data URL (PNG). Browser only. */
export async function toLineArt(url: string, maxSide = 768, threshold = 48): Promise<string> {
  const img = await loadImage(url);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) throw new Error('Không có canvas');
  c.drawImage(img, 0, 0, w, h);
  const src = c.getImageData(0, 0, w, h);
  const out = c.createImageData(w, h);
  out.data.set(lineArtPixels(src.data, w, h, threshold));
  c.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createPhotoStore(resize: (file: Blob) => Promise<string> = resizeImage): PhotoStore {
  const listeners = new Set<(photos: Photo[]) => void>();
  let memory: Photo[] = [];
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const db = () => (dbPromise ??= openDb());

  async function list(): Promise<Photo[]> {
    const d = await db();
    if (!d) return [...memory];
    try {
      const all = await tx<Photo[]>(d, 'readonly', (s) => s.getAll() as IDBRequest<Photo[]>);
      return all.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [...memory];
    }
  }

  async function notify(): Promise<void> {
    const photos = await list();
    for (const fn of listeners) fn(photos);
  }

  return {
    list,
    async add(files) {
      const existing = await list();
      const added: Photo[] = [];
      for (const file of files) {
        if (existing.length + added.length >= MAX_PHOTOS) break;
        let url: string;
        try {
          url = await resize(file);
        } catch {
          continue;
        }
        const photo: Photo = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, url, createdAt: Date.now() + added.length };
        const d = await db();
        if (d) {
          try {
            await tx(d, 'readwrite', (s) => s.put(photo));
          } catch {
            memory.push(photo);
          }
        } else memory.push(photo);
        added.push(photo);
      }
      if (added.length) await notify();
      return added;
    },
    async remove(id) {
      const d = await db();
      if (d) {
        try {
          await tx(d, 'readwrite', (s) => s.delete(id));
        } catch {
          /* ignore */
        }
      }
      memory = memory.filter((p) => p.id !== id);
      await notify();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
