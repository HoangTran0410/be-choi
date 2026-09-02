# Bé Chơi — thiết kế web game cho bé 2+ tuổi

Ngày: 2026-09-02. Trạng thái: chốt để implement (autonomous, các giả định ghi rõ ở mục 9).

## 1. Mục tiêu

Một web app (PWA, chơi offline) gom nhiều mini game cho trẻ từ 2 tuổi, lấy cảm hứng từ
Bimi Boo Kids / Sago Mini. Bé tự chơi được trên điện thoại và tablet mà không cần biết đọc.
Phụ huynh cài lên màn hình chính, mở là chơi, không mạng vẫn chạy.

Không phải mục tiêu (v1): đăng nhập, sync tiến độ, quảng cáo, mua trong app, đa ngôn ngữ,
nhân vật/cốt truyện, asset ảnh vẽ tay.

## 2. Research: những gì "ông lớn" làm

Bimi Boo (Baby Games 2–4, Toddler Games 2+, Learning Academy) và Sago Mini xoay quanh
một bộ cơ chế lặp lại với chủ đề khác nhau:

| Cơ chế | Ví dụ ở Bimi Boo | Kỹ năng |
|---|---|---|
| Tap → phản hồi tức thì | nổ bong bóng, ú oà, đàn | nhân quả, vận động tinh |
| Kéo hình vào lỗ | shape sorter | nhận biết hình |
| Phân loại theo màu / kích thước | color sort, small-medium-large crates | phân loại |
| Ghép bóng / puzzle | shadow match, jigsaw 2–4 mảnh | tri giác thị giác |
| Chăm sóc | cho thú ăn, tắm, rửa xe | đồng cảm, vận động |
| Sáng tạo | tô màu, dán sticker | sáng tạo |
| Trí nhớ | lật thẻ 2–3 cặp | trí nhớ |
| Đếm | tap từng vật, đọc số | số đếm 1–5 |

Nguyên tắc UX chung: không cần đọc chữ, không có trạng thái "thua", không giới hạn thời gian,
nút rất to, gợi ý (wiggle) khi bé đứng im vài giây, ăn mừng sau mỗi vòng, tự chuyển vòng,
parent gate (giữ nút) cho phần cài đặt, không quảng cáo.

## 3. Danh sách game v1 (12 game)

| id | Tên | Cơ chế | Vòng chơi | Kết thúc vòng |
|---|---|---|---|---|
| `bubbles` | Bong bóng | tap để nổ bong bóng bay lên; một số bóng chứa con vật, nổ thì đọc tên | vô tận | mỗi 15 lần nổ → 1 sao |
| `shapes` | Ghép hình | kéo hình (SVG màu) vào lỗ cùng hình | 3 hình, từ vòng 3 lên 4 hình | đủ hết → ăn mừng |
| `colors` | Màu sắc | kéo bóng màu vào giỏ cùng màu | 2 giỏ × 2 bóng, từ vòng 3: 3 giỏ | đủ hết |
| `sizes` | To nhỏ | kéo vật to vào hộp to, vật nhỏ vào hộp nhỏ | 4 vật (2 to, 2 nhỏ) | đủ hết |
| `shadows` | Tìm bóng | kéo con vật lên đúng bóng đen của nó | 3 con vật | đủ hết |
| `piano` | Đàn thú | tap phím → nốt nhạc + con vật nhảy, đa chạm | tự do | không có |
| `paint` | Tô màu | vẽ ngón tay trên canvas, 8 màu, 3 cỡ cọ, 4 stamp emoji, xoá (giữ 0.7s) | tự do | không có |
| `peekaboo` | Ú oà | tap bụi cây/hộp/mây → con vật nhảy ra kêu "Ú oà!" và đọc tên | vô tận | mỗi 6 lần → 1 sao |
| `feed` | Cho ăn | kéo thức ăn đến miệng con vật; đúng món → nhai, vui; sai món → lắc đầu nhẹ, trả về | 3 món, 1 đúng; 5 con/vòng | 5 con → ăn mừng |
| `wash` | Tắm sạch | chà ngón tay để lau lớp bẩn (canvas) khỏi con vật/xe | 1 vật | sạch ≥ 90% → ăn mừng |
| `count` | Đếm số | tap từng quả → hiện số, đọc "một, hai, ba…"; đủ → đọc "Có N quả" | 1–5 vật | đủ hết |
| `memory` | Lật thẻ | lật 2 thẻ, giống nhau thì giữ | 2 cặp, từ vòng 3: 3 cặp | đủ hết |

Mỗi game khi bắt đầu đọc một câu hướng dẫn ngắn (TTS). Không game nào có nút "thua",
đồng hồ, hay điểm số dạng chữ.

## 4. Kiến trúc

### 4.1 Stack

- Vite 6 + TypeScript strict, không framework UI. DOM + CSS transition cho hầu hết game,
  Canvas 2D chỉ cho `paint`, `wash`, confetti.
- `vite-plugin-pwa` (Workbox `generateSW`, precache toàn bộ build, `registerType: 'autoUpdate'`).
- Vitest + jsdom cho logic thuần. Playwright (đã có Chromium trên máy) chỉ để chụp màn hình kiểm tra thủ công, không phải test suite.
- Không runtime dependency. Đồ hoạ = emoji hệ thống + SVG inline. Âm thanh = Web Audio synth.
  Giọng nói = `speechSynthesis` với voice `vi-VN` nếu máy có, không có thì bỏ qua (chỉ SFX).
- Deploy tĩnh: GitHub Pages workflow, `base` lấy từ env `BASE_PATH`.

Lý do không dùng Phaser/Pixi: game cho bé 2 tuổi là tap/drag vật rất to, DOM xử lý tốt,
bundle < 100 KB, mỗi game là một module nhỏ độc lập, precache offline đơn giản.

### 4.2 Cây thư mục

```
be-choi/
  index.html
  vite.config.ts            # PWA manifest, base path
  src/
    main.ts                 # boot: router, unlock audio ở gesture đầu, đăng ký SW
    app/
      router.ts             # hash router: ''→home, '#/g/<id>'→game
      home.ts               # màn hình chính (lưới ô game)
      shell.ts              # khung game: thanh trên (home, parent), stage, mount/unmount
      registry.ts           # danh sách GameModule (lazy import từng game)
      storage.ts            # sao theo game, cài đặt (localStorage)
      parentPanel.ts        # panel phụ huynh: âm thanh, giọng nói, reset sao, cài PWA
    core/
      types.ts              # GameModule, GameContext
      audio.ts              # AudioEngine: pop, ding, boing, chomp, jingle, note(freq)
      speech.ts             # speak(text), chọn voice vi-VN, cancel
      drag.ts               # makeDraggable(el, {targets, onDrop}), hitTest, springBack
      hold.ts               # onHold(el, ms, cb) với vòng tiến trình (parent gate, nút xoá)
      celebrate.ts          # confetti + jingle + lời khen, resolve sau ~1.6 s
      hint.ts               # HintScheduler: gọi hint sau N giây không tương tác
      dom.ts                # h(), shuffle, pick, rand (seedable)
      content.ts            # bộ emoji có tên tiếng Việt: animals, fruits, foods, vehicles, colors
      wake.ts               # Screen Wake Lock khi đang trong game
    games/<id>/
      index.ts              # GameModule: meta + start(ctx)
      logic.ts              # hàm thuần sinh vòng chơi (được test)
      logic.test.ts
    styles/
      base.css              # reset, token, safe-area, chống zoom/select
      home.css
      shell.css
  public/
    icons/                  # icon-192.png, icon-512.png, maskable, apple-touch-icon
  docs/superpowers/{specs,plans}/
  .github/workflows/deploy.yml
  README.md
```

### 4.3 Hợp đồng game (interface)

```ts
export type Skill =
  | 'cause-effect' | 'sorting' | 'matching' | 'creative'
  | 'music' | 'memory' | 'counting' | 'care';

export interface GameMeta {
  id: string;        // slug trong URL
  title: string;     // tiếng Việt, hiển thị cho phụ huynh
  icon: string;      // emoji ô game
  color: string;     // màu nền ô game (pastel)
  skill: Skill;
  intro: string;     // câu TTS khi vào game
}

export interface GameContext {
  stage: HTMLElement;                 // vùng chơi, position: relative, đã set touch-action none
  audio: AudioEngine;
  speak(text: string): void;          // no-op nếu tắt giọng / không có voice vi
  celebrate(): Promise<void>;         // confetti + jingle + khen, resolve sau ~1.6 s
  hint: HintScheduler;                // hint.arm(fn, ms?) / hint.touch() / hint.clear()
  addStar(): void;                    // +1 sao cho game này, cập nhật storage
  onCleanup(fn: () => void): void;    // shell gọi khi rời game
}

export interface GameModule extends GameMeta {
  start(ctx: GameContext): void;
}

// registry.ts
export interface GameEntry extends GameMeta {
  load: () => Promise<{ default: GameModule }>;
}
```

`shell.ts` là nơi duy nhất tạo `GameContext`. Khi đổi route: chạy các cleanup theo thứ tự
ngược, `speechSynthesis.cancel()`, xoá sạch `stage`, thả wake lock.

### 4.4 Luồng dữ liệu

- Router đọc `location.hash` → home hoặc `shell(gameId)`.
- Shell lazy-load module game (`registry[id].load()`), tạo context, gọi `start`.
- Game giữ state riêng trong closure. Không có store toàn cục.
- Storage: `be-choi:v1` = `{ stars: Record<id, number>, settings: { sound: boolean, voice: boolean } }`.
- Audio unlock: `pointerdown` đầu tiên trên `document` → `audio.unlock()` (resume AudioContext)
  và `speech.warm()` (speak chuỗi rỗng để iOS cho phép TTS).

### 4.5 Mobile / tablet first

- `viewport-fit=cover`, `user-scalable=no`; body `100dvh`, padding theo `env(safe-area-inset-*)`.
- Stage `touch-action: none`; toàn app `user-select: none`, `-webkit-touch-callout: none`,
  `overscroll-behavior: none`; chặn `gesturestart`, `contextmenu`, double-tap zoom.
- Token kích thước: `--tap: clamp(72px, 14vmin, 140px)`; mọi thứ bé tap ≥ `--tap`.
- Layout dùng `vmin`, flex/grid; mỗi game phải chạy được ở cả dọc lẫn ngang
  (dùng `@media (orientation: portrait)` khi cần xoay trục, ví dụ phím đàn).
- Manifest: `display: fullscreen`, `orientation: any`, theme màu pastel; meta iOS standalone.
- Wake Lock khi trong game; `navigator.vibrate(15)` khi tap đúng (Android).
- Pointer Events thống nhất chuột/chạm; `setPointerCapture` khi kéo; hỗ trợ đa chạm ở `piano`, `paint`.

### 4.6 Màn hình chính

Tiêu đề "Bé Chơi" + mascot emoji nhún nhảy. Lưới ô `repeat(auto-fill, minmax(clamp(120px, 30vmin, 200px), 1fr))`.
Mỗi ô: emoji lớn, tên game bên dưới, nền pastel riêng, hàng sao (tối đa 5 ⭐, hơn thì "⭐×N").
Tap ô: âm "pop" + đọc tên game + điều hướng. Góc phải: nút phụ huynh (giữ 1.5 s).

### 4.7 Panel phụ huynh

Mở bằng giữ 1.5 s (vòng tiến trình). Nội dung: bật/tắt âm thanh, bật/tắt giọng nói,
nút "Cài lên màn hình chính" (dùng `beforeinstallprompt`; iOS hiện hướng dẫn Chia sẻ → Thêm vào MH chính),
xoá sao, phiên bản build. Đóng bằng tap ngoài hoặc nút X.

### 4.8 Game ngoài (iframe / Flash)

Registry hỗ trợ `GameEntry` kiểu `external: { url }`: shell render `<iframe>` full stage thay vì gọi `start`.
File đặt trong `public/external/**` được Workbox precache nên vẫn offline. README hướng dẫn nhúng game
HTML5 mã nguồn mở và chạy `.swf` qua Ruffle self-host. v1 không kèm game ngoài nào (tránh vấn đề bản quyền).

## 5. Xử lý lỗi và trường hợp biên

- Không có voice tiếng Việt: `speak` là no-op, game vẫn chơi được bằng SFX + animation.
- AudioContext chưa unlock (autoplay policy): mọi SFX bỏ qua im lặng, không throw.
- Xoay màn hình giữa game: game dùng layout co giãn; `paint` và `wash` giữ canvas qua resize
  (vẽ lại từ offscreen canvas). `wash` tính lại % sạch sau resize.
- Rời game khi đang kéo: cleanup gỡ listener, huỷ pointer capture.
- Service worker cập nhật: `autoUpdate`, không hiện prompt (bé không đọc được).
- localStorage bị chặn (private mode): storage bọc try/catch, chạy in-memory.

## 6. Kiểm thử

- Vitest (jsdom): `router.parse`, `storage` (get/add/reset với localStorage giả), `drag.hitTest`,
  `dom.shuffle/pick`, `hold` (timer giả), và `logic.ts` của từng game
  (ví dụ: `makeShapeRound(3)` trả 3 hình khác nhau; `makeMemoryDeck(2)` có đúng 2 cặp và trộn;
  `makeFeedRound()` có đúng 1 món đúng trong 3; `makeCountRound()` trả 1–5 vật cùng loại).
- `tsc --noEmit` và `vite build` phải sạch.
- Kiểm tra thủ công bằng Playwright: chụp home + từng game ở 390×844 (dọc) và 1024×768 (ngang).

## 7. Deploy

`.github/workflows/deploy.yml`: `npm ci && BASE_PATH=/be-choi/ npm run build` → GitHub Pages.
Local: `npm run dev`, `npm run build`, `npm run preview` (test PWA cần build vì SW chỉ có ở production).

## 8. Kế hoạch mở rộng (không làm ở v1)

Jigsaw 4 mảnh, dress-up, âm thanh động vật thật (cần asset), bảng sticker thưởng, nhân vật dẫn dắt,
đa ngôn ngữ, Twemoji để đồng nhất emoji giữa các hệ điều hành.

## 9. Giả định đã chốt (có thể đổi)

1. Tên app "Bé Chơi", repo `be-choi`, chỉ git local, chưa push GitHub.
2. Ngôn ngữ giao diện/giọng nói: tiếng Việt.
3. Không tải asset ngoài; emoji + SVG + synth. Đổi sang asset vẽ tay là việc của v2.
4. Nút Home tap thường (bé tự chuyển game được), chỉ panel phụ huynh cần giữ.
5. 12 game ở mục 3; game ngoài chỉ có slot và tài liệu.
