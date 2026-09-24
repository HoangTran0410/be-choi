# 🐣 Bé Chơi

**39 trò chơi nhỏ cho bé 2–4 tuổi**, chạy ngay trên trình duyệt, cài lên điện thoại/iPad như app
và **chơi được khi không có mạng**.

Không quảng cáo · không cần biết chữ · không có "thua" · không đếm giờ · bấm lung tung cũng không sao.

## Có gì để chơi?

| | |
|---|---|
| 🎵 **Âm nhạc** | 🎤 Sân khấu nhạc · 🎹 Đàn thú · 🎼 Đàn gõ · 🥁 Trống · 🎺 Nhạc cụ · 🎶 Nhớ giai điệu · 🎪 Ban nhạc thú · 🎙️ Ca sĩ nhí · 🦜 Vẹt nhại giọng · 🐦 Hát cho chim bay |
| 👂 **Nghe** | 📣 Bấm nghe tiếng · 🔊 Ai kêu đấy? |
| 🧩 **Suy nghĩ** | 🧩 Ghép tranh · 🏠 Xếp khối · 🧱 Xếp gạch · 🧪 Xếp bi màu · 🔴 Quy luật · 🔷 Ghép hình · 🎨 Màu sắc · 🐘 To nhỏ · 🐾 Tìm bóng · 🔢 Đếm số · 🃏 Lật thẻ |
| 🌊 **Thế giới nhỏ** | 🐠 Bể cá · 🦎 Bể cạn · 🎣 Câu cá · 🌻 Vườn cây · 🐔 Nông trại · 🚗 Bé lái xe · 🌠 Đêm hè |
| 🎈 **Chơi vui** | 🫧 Bong bóng · 🎂 Sinh nhật · 🍳 Nấu ăn · 🪥 Đánh răng · 🖍️ Tô màu · 🙈 Ú oà · 🌙 Giờ đi ngủ · 🍎 Cho ăn · 🧽 Tắm sạch |

Vài trò nổi bật:

- **📣 Bấm nghe tiếng** — sách âm thanh 6 trang: bấm con bò thì bò rống, bấm xe cứu hoả thì còi hú, bấm em bé thì bé cười.
- **🐠 Bể cá / 🦎 Bể cạn** — bể của riêng bé, tự sống, nhớ giữa các lần chơi. Bắt, thả, cho ăn, bật đèn đêm.
- **🚗 Bé lái xe** — con đường không bao giờ lặp: núi tuyết, biển, rừng, tàu hoả chạy qua, tắc đường thì bấm còi.
- **🎙️ Ca sĩ nhí** — 14 bài thiếu nhi có nhạc đệm, bé hát vào mic thì sân khấu sáng lên.

Chơi xong được ⭐, đủ 3 ⭐ mở một sticker để dùng trong Tô màu.

## Cho bố mẹ

- **Cài lên máy:** iOS mở bằng Safari → Chia sẻ → *Thêm vào MH chính*. Android: menu ⋮ → *Cài đặt ứng dụng*.
- **Góc phụ huynh:** giữ nút 👪 1,5 giây — bật/tắt âm thanh, giọng đọc, pháo hoa, chế độ tối, thêm ảnh của bé.
- **Riêng tư:** micro, camera và ảnh chỉ xử lý trên máy, không gửi đi đâu. Rời game là mic tắt.
- **Giọng đọc tiếng Việt** dùng giọng có sẵn của máy (iOS: Cài đặt → Trợ năng → Nội dung đọc → Giọng nói → Tiếng Việt).

## Chạy thử

```bash
npm install
npm run dev          # http://localhost:5173 — mở trên điện thoại cùng Wi-Fi bằng IP máy
npm test             # test
npm run build        # bản production (có offline)
```

<details>
<summary>Thêm lệnh cho dev</summary>

```bash
npm run preview                        # xem bản build
npm run typecheck
node scripts/screenshot.mjs [game…]    # chụp mọi game ở 3 cỡ màn hình, báo lỗi tràn
npm run e2e                            # chơi thật các game trong Chromium headless
npm run loudness:check                 # kiểm tra âm lượng các âm thanh đều nhau
node scripts/soundbook.mjs [id…]       # tìm lại âm thanh cho Bấm nghe tiếng (cần ffmpeg + uv)
```

</details>

## Deploy

Push lên `main` là GitHub Actions tự test, build và đưa lên **Cloudflare Pages**. Chỉ cần thêm 2 secret
trong GitHub (*Settings → Secrets and variables → Actions*): `CLOUDFLARE_API_TOKEN` (quyền
*Cloudflare Pages: Edit*) và `CLOUDFLARE_ACCOUNT_ID`. Muốn deploy chỗ khác thì `npm run build` rồi đưa
thư mục `dist` lên.

## Làm game mới

Mỗi game là một thư mục `src/games/<id>/` gồm `meta.ts` (tên, icon, màu), `logic.ts` (+ test),
`index.ts` và `style.css`, rồi thêm một dòng vào `src/app/registry.ts`. Xem `bubbles` làm mẫu.

Ba nguyên tắc cho bé 2 tuổi:

1. **Không ép thứ tự** — cái gì trên màn hình cũng bấm được, xong khi *đủ* chứ không cần *đúng thứ tự*.
2. **Không có sai** — bấm nhầm chỉ nghe "boing" nhẹ rồi thôi.
3. **To, dễ bấm** — mọi thứ ≥ 72 px, chạy được cả màn hình dọc lẫn ngang.

## Âm thanh và hình ảnh

Hình là emoji + SVG, nhạc cụ tự tổng hợp bằng Web Audio, nên app rất nhẹ và không phụ thuộc thư viện
nào. Tiếng con vật và tiếng trong *Bấm nghe tiếng* là bản thu thật, giấy phép tự do — nguồn ghi trong
`public/sfx/CREDITS.md` và `public/sounds/CREDITS.md`. Repo chỉ mô phỏng *thể loại* game của
Bimi Boo / Sago Mini, không dùng asset của họ.
