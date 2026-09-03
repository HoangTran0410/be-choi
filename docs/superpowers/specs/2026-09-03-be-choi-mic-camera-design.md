# Bé Chơi v1.3 — mic & camera: ba game hát

Ngày: 2026-09-03. Bé thích hát nhưng chưa game nào dùng mic ngoài động tác thổi nến trong Sinh nhật,
và chưa game nào dùng camera. Bổ sung **một lõi mic + camera dùng chung** và **ba game riêng biệt**
đều nằm trong mục 🎵 Âm nhạc.

Nguyên tắc giữ nguyên như v1: không có "thua", không đọc chữ, mọi thứ chạm ≥ `var(--tap)`, offline 100 %,
không thêm runtime dependency. Thêm một nguyên tắc mới: **thiếu quyền mic/camera không bao giờ chặn bé chơi** —
mỗi game có đường lùi bằng ngón tay.

## 1. Lõi

### `src/core/mic.ts`

```ts
export interface MicFrame { level: number; pitch: number | null }   // level 0–1 đã làm mượt
export interface Mic {
  start(): Promise<boolean>            // false = không quyền / không mic; game vẫn chạy
  onFrame(fn: (f: MicFrame) => void): () => void
  record(maxMs?: number): void
  stopRecord(): AudioBuffer | null     // null nếu quá ngắn / im lặng
  play(buf: AudioBuffer, opts?: { rate?: number; gain?: number; onEnd?: () => void }): () => void
  stop(): void
}
export function createMic(opts?: { pitch?: boolean; fps?: number }): Mic
```

- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`,
  gọi **sau khi bé chạm** nút 🎤 (`pointerup` — iOS không cấp quyền từ `pointerdown`), đúng bài học đã có ở Sinh nhật.
- `AnalyserNode` (fftSize 1024): `getByteTimeDomainData` → `rms`; khi `pitch: true` thêm `getFloatTimeDomainData` → `detectPitch`.
  Vòng lặp bằng `setInterval` ở `fps` (mặc định 30) để không chạy khi tab ẩn.
- Thu giọng: `ScriptProcessorNode(4096)` gom `Float32Array` — cố ý **không** dùng `MediaRecorder` (khác codec
  giữa iOS/Android, phải `decodeAudioData`) và **không** dùng `AudioWorklet` (thêm file rời, rắc rối precache PWA).
  ScriptProcessor tuy deprecated nhưng chạy ở mọi trình duyệt mục tiêu và cho luôn mẫu thô để vẽ sóng âm.
- `stop()` tắt mọi track + `close()` AudioContext → rời game là đèn mic trên máy tắt hẳn (gắn vào `ctx.onCleanup`).
- Hàm thuần, export riêng, có test: `rms(Uint8Array | Float32Array)`, `smooth(prev, next, rise, fall)`
  (lên nhanh xuống chậm cho đèn khỏi giật), `detectPitch(Float32Array, sampleRate, minHz = 70, maxHz = 1000)`
  (autocorrelation chuẩn hoá, dưới ngưỡng rõ ràng thì trả `null`), `concatChunks`, `trimSilence`, `waveformBars(samples, n)`.

### `src/core/camera.ts`

```ts
export interface Camera {
  start(): Promise<HTMLVideoElement | null>            // facingMode 'user', muted, playsinline
  snapshot(decorate?: (c: CanvasRenderingContext2D, w: number, h: number) => void): Promise<Blob | null>
  stop(): void
}
export function createCamera(): Camera
```

Ảnh chụp vẽ **lật gương** bằng `drawCover` của `photos.ts` (truyền `videoWidth/videoHeight` của thẻ video), cạnh dài ≤ 1024, JPEG; `decorate` để game vẽ
khung sân khấu đè lên. Không quyền → `start()` trả `null` êm, không báo lỗi cho bé.

### Sửa chỗ cũ

- `core/testing.ts` thêm `fakeMic()`: giả `navigator.mediaDevices.getUserMedia` + `AudioContext` để smoke test
  bơm được `level` tuỳ ý trong jsdom.
- ~~`games/birthday` chuyển sang `createMic`~~ — **bỏ**: trong lúc làm có một phiên khác đang sửa chính
  game Sinh nhật, đụng vào là giẫm chân nhau. Game đó vẫn dùng đoạn mic riêng của nó; đổi sang `createMic`
  để dành cho lần sau.

## 2. Ba game

| id | Tên | Icon | Cách chơi |
|---|---|---|---|
| `sing` | Ca sĩ nhí | 🎙️ | karaoke có gương camera |
| `parrot` | Vẹt nhại giọng | 🦜 | thu giọng, thú hát lại bằng giọng bé đã biến điệu |
| `birdsong` | Hát cho chim bay | 🐦 | hát to → chim bay lên |

Cả ba `skill: 'music'` (mục 🎵 Âm nhạc), cấu trúc `meta.ts · logic.ts · logic.test.ts · index.ts · index.test.ts · style.css`,
đăng ký trong `app/registry.ts` ngay sau `jam`.

### 2.1 🎙️ Ca sĩ nhí (`sing`)

- **Chọn bài**: 5 thẻ to lấy từ `SONGS` trong `core/music.ts` (Ngôi sao lấp lánh, Kìa con bướm vàng, Con cừu nhỏ,
  Cầu Luân Đôn, Bác nông dân) — giai điệu public domain đã có sẵn.
- **Lời**: `sing/logic.ts` giữ `LYRICS: Record<songId, Phrase[]>` với `Phrase { emoji, text, beats }` — lời Việt ngắn
  tự viết cho bé (không chép lời có bản quyền). Hàm thuần `phraseIndexAt(phrases, beat)` map vị trí nhịp → câu đang hát,
  có test. Mỗi câu hiện **một emoji rất to + chữ**; câu đang hát sáng lên và nảy theo nhịp để bé bám nhịp dù chưa biết đọc.
- **Sân khấu**: rèm đỏ + đèn + 6 khán giả thú ở dưới. Nền là **gương camera** khi bật được, không thì rèm vẽ sẵn.
  Nhạc đệm chạy bằng `schedule()` (chuông + trống nhẹ, `bpm` của bài).
- **Mic**: `level` → độ sáng đèn sân khấu, vòng sáng quanh nút 🎤, khán giả nhún, nốt 🎵 bay ra khi hát to.
- **Kết bài**: vỗ tay + `ctx.celebrate()` + ⭐.
- **📷**: chụp "ảnh ca sĩ" có khung sân khấu → `ctx.photos.add([blob])`. Kho đầy 12 ảnh thì `audio.boing()`
  và nói "Hết chỗ rồi", **không** xoá ảnh cũ.
- **Đường lùi**: không mic/không camera vẫn chọn bài, nghe nhạc, chạm sân khấu ra hiệu ứng, hết bài vẫn có ⭐.

### 2.2 🦜 Vẹt nhại giọng (`parrot`)

- 5 nhân vật trong `logic.ts`: `CRITTERS = [{ id, emoji, name, rate }]` — vẹt 1.5, chuột 2.0, robot 0.85,
  voi 0.65, khủng long 0.5. Nhại giọng bằng `playbackRate` (đổi cả cao độ lẫn tốc độ — đúng kiểu chipmunk bé thích).
- **Giữ** nút 🎤 để thu, tối đa `MAX_RECORD_MS = 5000` (tự dừng), sóng âm chạy theo giọng bằng `waveformBars`.
  Thả tay → con thú đang chọn nhảy lên và hát lại. Chạm con khác → nghe lại **đúng đoạn đó** bằng giọng con đó.
- Sau 3 lần thu-và-nghe → `celebrate()` + ⭐.
- **Đường lùi**: không mic thì mỗi con thú kêu tiếng synth của mình khi chạm (vẫn là trò nhân quả chơi được).

### 2.3 🐦 Hát cho chim bay (`birdsong`)

- `logic.ts` thuần: `step(state, level, dt)` — chim chịu trọng lực `GRAVITY`, `level` tạo lực nâng `LIFT`,
  vận tốc giới hạn; cảnh cuộn ngang; vòng mây và nốt nhạc sinh theo `spawnAt(distance)`; va vào nốt → nhặt.
  Không có "thua": chạm đất thì nảy lên nhẹ, chạm vòng mây chỉ kêu `pop`. Có test cho: hát to thì `y` giảm dần,
  im thì rơi, nhặt đúng nốt khi trùng vùng.
- `index.ts`: vòng `requestAnimationFrame` vẽ bằng DOM + SVG (như các game khác), `mic.onFrame` đổ `level` vào state.
- Đủ 8 nốt → `celebrate()` + ⭐, rồi chơi tiếp vòng mới.
- **Đường lùi**: giữ ngón tay trên màn hình = `level` 0.6, chơi được y hệt khi bố mẹ từ chối quyền mic.

## 3. Kiểm thử

- `logic.test.ts` thuần từng game + `core/mic.test.ts` (rms, smooth, detectPitch trên sóng sin dựng sẵn,
  trimSilence, waveformBars).
- `index.test.ts` smoke bằng `fakeContext()` + `fakeMic()`: mở game, bơm level, kiểm DOM đổi và ⭐ được cộng.
- `scripts/e2e.mjs` và `scripts/screenshot.mjs`: `launch({ args: ['--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream'] })` + `context.grantPermissions(['microphone', 'camera'])`.
  Thiết bị giả của Chromium phát tone nên e2e kiểm được chim thật sự bay lên và đèn sân khấu sáng.
  WebKit không có cờ này → hai game mic chỉ chụp ảnh ở trạng thái "chưa bật mic" khi chạy `BROWSER=webkit`.
- README: thêm 3 dòng bảng game, mục nói về quyền mic/camera (chỉ xử lý trên máy, không gửi đi đâu).

## 3b. Bài hát dùng chung (bổ sung sau khi làm)

Gia đình muốn bé hát bài Việt Nam, nên `core/music.ts` thành songbook chung của mọi game: dời 3 bài riêng
của Đàn gõ lên core, thêm Chúc mừng sinh nhật, và chép 5 bài thiếu nhi Việt (Bắc kim thang, Cả nhà thương
nhau, Cháu lên ba, Cháu yêu bà, Chúc bé ngủ ngon) từ cảm âm gia đình sưu tầm — 14 bài. Cảm âm chỉ cho cao
độ nên **tiết tấu là ghi theo tai**, và vài chỗ không đánh dấu quãng thì chọn quãng gần nốt trước nhất.
Nhiều bài rộng hơn một quãng tám nên thêm `fitsScale(song)`: Đàn gõ chỉ hiện bài nằm gọn trong 8 thanh,
Ca sĩ nhí hát tất. Bài Lý cây bông chưa thêm: bản cảm âm thiếu dấu quãng và số nốt không khớp số tiếng.

## 4. Rủi ro

- **iOS**: `getUserMedia` trong PWA standalone cần iOS 14.3+ và HTTPS (Cloudflare Pages có sẵn). Máy cũ hơn rơi
  vào đường lùi bằng ngón tay.
- **Loa vọng vào mic**: nhạc đệm karaoke làm đèn sáng dù bé im. Giảm bằng `echoCancellation` + ngưỡng tính theo
  mức nền đo trong 1 giây đầu sau khi bật mic.
- **ScriptProcessorNode deprecated**: còn chạy ở mọi trình duyệt mục tiêu; nếu ngày nào đó bị gỡ thì chỉ cần
  thay phần thu trong `core/mic.ts`, ba game không đổi.
- **Riêng tư**: mic và camera chỉ chạy trong game đang mở, tắt ngay khi thoát; ảnh chụp vào IndexedDB trên máy,
  không có mạng nào được gọi.
