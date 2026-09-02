# 🐣 Bé Chơi

Web game cho bé 2–4 tuổi, lấy cảm hứng từ Bimi Boo Kids / Sago Mini. Cài được lên màn hình
chính điện thoại/tablet (PWA) và **chơi hoàn toàn offline**. Không quảng cáo, không cần đọc chữ,
không có "thua", không giới hạn thời gian.

## 24 trò chơi

**🎵 Âm nhạc**

| Trò chơi | Cách chơi | Kỹ năng |
|---|---|---|
| 🎹 Đàn thú | chạm phím đàn, đa chạm, con vật nhảy | âm nhạc |
| 🎼 Đàn gõ | xylophone 8 thanh; chọn bài hát thì thanh cần gõ sáng lên để chơi theo; ▶ nghe máy chơi | giai điệu, theo dõi |
| 🥁 Trống | 6 pad trống synth, nút ▶ bật nhịp nền để gõ theo | nhịp điệu |
| 🎺 Nhạc cụ | nghe tiếng piano, ghi-ta, vi-ô-lông, kèn…; đố "nghe và tìm" | phân biệt âm thanh |
| 🎶 Nhớ giai điệu | máy chơi chuỗi nốt, bé gõ lại; dài dần đến 6 nốt | trí nhớ thính giác |
| 🎪 Ban nhạc thú | chạm từng con thú để thêm/bớt bè nhạc lặp (trống, bass, hợp âm…), 3 nhịp điệu | sáng tạo âm nhạc |

**🧩 Xếp hình & suy nghĩ**

| Trò chơi | Cách chơi | Kỹ năng |
|---|---|---|
| 🧩 Ghép tranh | jigsaw 2×2 → 3×3, kéo mảnh vào ô; dùng được ảnh của bé | không gian |
| 🏠 Xếp khối | ghép khối hình học thành 32 bức tranh (nhà, tên lửa, bướm, lâu đài…) | hình học, không gian |
| 🧱 Xếp gạch | xếp gạch kiểu Lego trên tấm đế có trọng lực, xây tự do hoặc theo mẫu | sáng tạo, không gian |
| 🔴 Quy luật | dãy 🍎🍌🍎🍌? chọn hình tiếp theo (AB → AAB → ABC) | logic |
| 🔷 Ghép hình | kéo hình màu vào lỗ cùng hình | nhận biết hình |
| 🎨 Màu sắc | kéo bóng vào giỏ cùng màu | phân loại màu |
| 🐘 To nhỏ | đồ to vào hộp to, đồ nhỏ vào hộp nhỏ | so sánh kích thước |
| 🐾 Tìm bóng | kéo con vật lên đúng bóng của nó | tri giác thị giác |
| 🔢 Đếm số | chạm từng quả, đọc "một, hai, ba…" | số đếm 1–5 |
| 🃏 Lật thẻ | lật 2 thẻ giống nhau, 2 → 4 cặp | trí nhớ |

**🎈 Chơi vui**

| Trò chơi | Cách chơi | Kỹ năng |
|---|---|---|
| 🫧 Bong bóng | chạm để làm nổ bong bóng, có con vật bên trong thì đọc tên | nhân quả, vận động tinh |
| 🎂 Sinh nhật | trang trí bánh, cắm nến theo tuổi, thắp nến, nghe "Chúc mừng sinh nhật", thổi vào micro để tắt nến | vui chơi, đếm |
| 🍳 Nấu ăn | theo công thức bằng hình, bỏ nguyên liệu, khuấy, nấu, đút cho thú ăn | trình tự, chăm sóc |
| 🪥 Đánh răng | bóp kem, chải sạch từng răng, súc miệng | thói quen vệ sinh |
| 🖍️ Tô màu | vẽ ngón tay, 8 màu, 3 cỡ cọ, stamp (+ sticker đã mở), chọn ảnh làm nền hoặc biến ảnh thành nét vẽ để tô | sáng tạo |
| 🙈 Ú oà | chạm bụi cây/hộp/mây, con vật nhảy ra "Ú oà!" | nhân quả |
| 🍎 Cho ăn | kéo đúng món cho con vật đói | chăm sóc, logic |
| 🧽 Tắm sạch | chà ngón tay để lau sạch lớp bẩn | vận động tinh |

Mỗi vòng xong có confetti + lời khen + 1 ⭐. Cứ **3 ⭐ mở 1 sticker** (48 sticker), xem lại trong
🏆 Bộ sưu tập, dùng làm stamp trong Tô màu.

## Ảnh của bé

Giữ 👪 → **📷 Ảnh của bé** → *Thêm ảnh / chụp ảnh* (iOS hỏi Thư viện ảnh hoặc Camera). Tối đa 12 ảnh,
thu nhỏ còn 1024 px, lưu IndexedDB **trên máy**, không gửi đi đâu. Ảnh xuất hiện trong Ghép tranh
(mặc định khi có ảnh), Tô màu (🖼️ nền / ✏️ nét vẽ) và Sinh nhật (ảnh bé trên bánh).

## Chạy thử

```bash
npm install
npm run dev        # http://localhost:5173, mở trên điện thoại cùng Wi-Fi bằng IP máy
```

Build và xem bản production (service worker chỉ có ở bản build):

```bash
npm run build
npm run preview    # http://localhost:4173
```

Kiểm tra: `npm test` (Vitest, logic + smoke test từng game), `npm run typecheck`.
Chụp màn hình mọi game ở 3 cỡ (điện thoại dọc/ngang, tablet) và báo lỗi tràn màn hình:

```bash
npm run build && node scripts/screenshot.mjs        # ảnh trong ./screenshots
node scripts/screenshot.mjs shapes memory           # chỉ vài game
npm run e2e                                         # chơi thật các game trong Chromium headless
BROWSER=webkit node scripts/screenshot.mjs          # engine WebKit (giống Safari/iPad)
```

## Cài lên điện thoại / tablet

1. Deploy (xem bên dưới) hoặc mở URL preview trên máy.
2. **iOS (Safari):** bấm Chia sẻ ⎋ → *Thêm vào MH chính*.
3. **Android (Chrome):** giữ nút 👪 trong app 1,5 giây → *Cài lên màn hình chính*, hoặc menu ⋮ → *Cài đặt ứng dụng*.
4. Mở từ icon: app chạy toàn màn hình, không cần mạng.

Panel phụ huynh (giữ 👪 1,5 giây): bật/tắt âm thanh, bật/tắt giọng nói, giao diện Sáng/Tối/Tự động
(tối theo hệ thống, nền game dịu 45 % để chơi buổi tối), ảnh của bé, cài app, xoá sao/sticker.
Màn hình chính nhớ vị trí cuộn khi ra khỏi game.
Giọng đọc tiếng Việt dùng voice có sẵn của hệ điều hành (iOS: cài trong Cài đặt → Trợ năng →
Nội dung đọc → Giọng nói → Tiếng Việt; Android: Google TTS). Máy không có voice tiếng Việt thì
game vẫn chơi bình thường bằng âm thanh.

## Deploy lên GitHub Pages

Repo có sẵn `.github/workflows/deploy.yml`. Trong GitHub: *Settings → Pages → Source: GitHub Actions*.
Push lên `main` là tự build với `BASE_PATH=/<tên-repo>/` và deploy. Deploy chỗ khác (Cloudflare Pages,
Netlify, Vercel) thì chỉ cần `npm run build` và trỏ vào thư mục `dist` (base path `/`).

## Cấu trúc

```
src/
  main.ts            boot: audio, giọng nói, router, service worker
  app/               home, shell (khung game), registry, storage, parent panel
  core/              types (hợp đồng game), dom, audio synth (8 nhạc cụ + trống), music (nốt, bài hát), speech, drag, hold, hint, celebrate
  games/<id>/        meta.ts · logic.ts (thuần, có test) · index.ts (DOM) · style.css
  styles/            base.css (token, animation, class dùng chung), home.css, shell.css
scripts/screenshot.mjs
docs/superpowers/    spec và plan
```

Không có runtime dependency: đồ hoạ là emoji + SVG, âm thanh và tiếng nhạc cụ sinh bằng Web Audio
(piano, xylophone, chuông, ghi-ta Karplus-Strong, sáo, kèn, vi-ô-lông, bộ trống), giọng nói
bằng Web Speech API. Bài hát trong Đàn gõ là giai điệu public domain có lời Việt. Vì vậy offline 100 % và bundle rất nhỏ.

## Thêm một game mới

1. Tạo `src/games/<id>/meta.ts` (id, tên, icon, màu, kỹ năng, câu giới thiệu).
2. Viết `logic.ts` (hàm thuần sinh vòng chơi) + `logic.test.ts`.
3. Viết `index.ts` export `GameModule { ...meta, start(ctx) }` — xem `src/core/types.ts` và game mẫu
   `shapes` (kéo thả) hoặc `bubbles` (chạm).
4. Thêm vào `src/app/registry.ts` (`{ ...meta, load: () => import('../games/<id>/index') }`).
5. `npm test`, `npm run build`, `node scripts/screenshot.mjs <id>`.

Nguyên tắc UX cho bé 2 tuổi: mọi thứ bé chạm ≥ `var(--tap)` (72–140 px), Pointer Events +
`touch-action: none`, chạy được cả dọc lẫn ngang, sai thì chỉ `boing` + trả về chỗ cũ, đứng im
6 giây thì `ctx.hint` lắc vật cần chạm, xong vòng thì `ctx.celebrate()` rồi `ctx.addStar()`.

## Nhúng game có sẵn (HTML5 / Flash)

Có thể thêm game ngoài bằng cách đặt file vào `public/external/<tên>/` và viết một module nhỏ
`start(ctx)` gắn `<iframe src="external/<tên>/index.html">` full stage. File trong `public/` được
service worker precache nên vẫn chơi offline (nhớ thêm đuôi file vào `workbox.globPatterns` trong
`vite.config.ts` nếu khác js/css/html/svg/png).

Game Flash (`.swf`) chạy được bằng [Ruffle](https://ruffle.rs): tải bản self-hosted vào
`public/external/ruffle/`, tạo `index.html` nạp `ruffle.js` và `<embed src="game.swf">`, rồi nhúng
như trên. Lưu ý: chỉ nhúng game bạn có quyền sử dụng; các game của Bimi Boo, Sago Mini là sản phẩm
thương mại, repo này chỉ mô phỏng **thể loại** chứ không dùng asset của họ.

## Hướng phát triển

Dress-up, âm thanh động vật thật, bảng sticker thưởng, nhân vật dẫn dắt, thêm bài hát cho Đàn gõ,
Twemoji để emoji giống nhau trên mọi máy.
