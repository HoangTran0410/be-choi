# Handoff — branch `claude/friendly-fermat-xi2j7q` (2026-10-20)

Ghi chú bàn giao cho phiên làm việc tiếp theo. "Đã kiểm" = có test/đo chạy thật; "chưa kiểm" = suy luận
hoặc chưa ai nghe/nhìn trên máy thật. **Chưa ai thử trên iPad thật cho mọi thứ dưới đây.**

## Đã làm trong phiên này

### Giọng nói
- Lỗi gốc (đã kiểm bằng test): khi shell đang đọc tên game, lời chào của game bị `gateSpeech` bỏ luôn
  (`busy()`), nên mở game là im. Giờ 10 s đầu lời của game chờ tên game đọc xong rồi nói (`src/core/hint.ts`,
  `QUIET_POLICY.openingMs`). Nhắc 10/20/40 rồi 60 s, 3 lần nhắc có tiếng, lời tự động cách ≥ 8 s.
- Góc phụ huynh: chọn giọng đọc tiếng Việt có trên máy + độ cao giọng (trầm/vừa/cao). `src/core/speech.ts`
  (`voices`, `setVoice`, `setPitch`), settings `voiceId`, `voicePitch`.
- Nhiều game được thêm lời chào/nhắc (audit bằng `scripts/voice-audit.mjs`).

### Header
- Màn ngang thấp: cột trái hiện icon + tên game (chữ dọc). Chưa chụp kiểm.

### Ban nhạc robot
- Kệ cuộn được ở mọi điểm (cả chỗ trống), HUD không đè equalizer, tia đèn nhẹ hơn (đã kiểm Playwright).
- 26 robot mới (41 tổng), chuông/lục lạc/chuông bò/kẻng có nhiều cao độ. Robot mới dùng lại timbre sẵn
  (cello = violin, tuba = trumpet, conga/bông-gô = djembe) — chưa có tiếng riêng. Hình 26 robot mới chưa ai nhìn.
- **Lệch nhịp đã sửa** (đã đo): mỗi nốt đọc `currentTime` riêng nên nốt cùng nhịp lệch 2,7–5,3 ms. Giờ
  `core/audio` đo mọi nốt trong một task từ cùng một lần đọc (`clock()`), `groove.ts` neo lưới nhịp vào đồng hồ
  âm thanh. Khoảng cách nhịp đo được 267,86 ms ± 0,01.
- Nút đổi bài: 5 chấm không bị cắt nữa.

### Âm thanh / âm lượng (phần còn nhạy cảm nhất — đọc kỹ)
- `scripts/loudness-audit.mjs` đo 361 nguồn (synth, file ghi âm, nhạc). `npm run loudness:check` chạy cả hai script.
- File ghi âm có trim riêng từng file (`src/core/loudness-files.ts`) — đây là sửa đúng cho lỗi "âm bé tý / âm to".
- Lịch sử cân synth trong ngày: cân đều về một mức (-22) → user thấy nhỏ hơn; nâng -19 → user thấy trống cái
  nặng/ngộp, mất mềm mại, guitar chói. Đo lại: cân đều đã **phá độ cân đối cũ** (bass/kèn +2,5–5 dB, piano/xylo/
  guitar/hat −2–5 dB). **Hiện tại**: synth giữ đúng độ cân đối của code trước đợt cân (commit `a2283ff`, đo bằng
  script mới) trừ 1,5 dB headroom — `BY_EAR_DB` trong `scripts/lib/loudness-common.mjs`. Mức chung đạt bằng gain
  `MAKEUP` (+3 dB) **sau** compressor và bass exciter (không đẩy trim nóng hơn trước chúng), limiter an toàn cuối
  chuỗi (-1,5 dB, 1 ms, release 0,25 s). Chưa nghe bằng tai sau thay đổi này → **cần user nghe lại robots**.
- Bỏ mọi tiếng thay thế: con vật/xe chưa tải xong thì phát bản ghi khi tải xong (≤ 1,5 s); nốt nhạc cụ hẹn
  trước chờ worker rồi phát đúng giờ (trễ > 30 ms thì bỏ); nốt mèo chờ worker hoặc render tại chỗ.
- `src/games/robots/mix.ts` sinh bằng `node scripts/robots-mix.mjs` (robots dời +3 dB theo mức chung).
  Mỗi khi đổi `loudness.ts` hoặc master chain phải chạy lại script này.

### Kéo thả chung, responsive, gọn nút
- `core/dragdrop.ts` dùng cho robots, build/blocks/bricks/jigsaw, learn/colors/sizes/shapes/shadows/sortout,
  day/dressup/feed/cooking/birthday, tubes/harvest. Teeth/wash là cọ (không phải kéo thả), chỉ tối ưu.
  Aquarium/terrarium/fishing chưa chuyển (canvas, điều khiển trực tiếp).
- `scripts/overflow.mjs` (`npm run overflow`, env `VP=390x844,...`) kiểm cắt/tràn/nút < 56px/chồng chữ.
- Gọn nút (mục tiêu ≤ 3–4 nút điều khiển/màn): singalong (làm lại hoàn toàn: màn chọn trò trước), paint, xylo,
  jam, orchestra, catband, ambience, soundbook, videos, harvest, habitat, museum (sảnh 4 phòng), dressup, bricks.
- Nhãn chỉ để xem không còn trông như nút (habitat chip nhiệm vụ, farm, harvest, birthday/teeth/bedtime, …).
- Chữ & số: một bảng cuộn dọc liên tục, 4–5 từ minh hoạ mỗi chữ, đọc tên chữ + từng từ.
- Bảo tàng: phản hồi chạm mạnh hơn (thân nhạc cụ nảy/rung, hạt nốt bay ra) cho 29 nhạc cụ.

### Hiệu năng
- `scripts/perf.mjs` (`npm run build && npm run perf -- [id…]`, CPU x4). Fishing/terrarium từ p50 ~80–93 ms
  xuống ~14 ms; aquarium 106 → 27 ms (headless, chỉ so tương đối). Cat notes render trên worker
  (`src/core/renderWorker.ts`).

## Việc còn dở / nên làm tiếp
1. **User nghe lại âm thanh** (robots: trống cái, guitar; bài hát piano; dàn nhạc) sau đợt `BY_EAR_DB` + `MAKEUP`.
   Probe đo "pumping" (hợp âm bị dìm dưới mỗi cú kick) ở scratchpad phiên trước; đầu ngày 3,3 dB, bản -19 4,7 dB.
   Nếu vẫn ngộp: cân nhắc giảm exciter (`BASS_MIX`/`BASS_DRIVE` trong `core/audio.ts`) hoặc hạ kick robots.
2. Aquarium vẫn nặng nhất (tia nắng động, cá, decor).
3. Accordion (bảo tàng) có 1 khung ~200 ms khi chạm dồn (CPU x4), chưa rõ nguyên nhân.
4. `.stage` đặt `touch-action: none` cho mọi thứ: cuộn cảm ứng phải tự làm (letters `dragscroll.ts`, kệ robots).
5. Chưa thử WebKit/iPad Safari cho bất kỳ thay đổi nào.

## Phiên 2 (2026-10-20, tiếp)
- **robots-mix --check FAIL đã sửa** (đã đo): đa số đội hình 8 robot peak 0,95–1,00. Nguyên nhân: limiter là
  `DynamicsCompressorNode`, tự cộng makeup gain (~+0,9 dB ở ngưỡng -1,5) và để lọt đầu cú đánh. Thử hạ ngưỡng
  limiter về -3 (bù MAKEUP): qua check nhưng limiter đè từng cú kick (kick solo -0,7 dB = pumping) → bỏ. Giải pháp:
  WaveShaper soft-clip cuối chuỗi (`softClipCurve` trong `core/audio.ts`, thẳng tới 0,75, uốn về 0,93). Peak ≤ 0,91,
  mức solo không đổi, `mix.ts` không cần sinh lại, `loudness:check` sạch. **Chưa nghe bằng tai.**
- Sửa từ review code: `gateSpeech` bỏ qua lời sau `dispose()`; hint callback ném lỗi vẫn hẹn lần sau; `loadVoice`/
  `loadLoop` không cache lần tải lỗi; worker render: `createBuffer` lỗi → null; worker chết mà nốt còn kịp → render tại chỗ.
- cooking: thẻ công thức/ô nguyên liệu/chấm khuấy thành nhãn phẳng (đã chụp kiểm 390x844, 844x390).
- jam: bảng 🥁 tách hàng nhịp / hàng tốc độ (`PickerChoice.group` trong `core/photoPicker.ts`); đủ 4 vòng thì ẩn ⏺.
- README: bảng mỗi nhóm một dòng, thêm Xưởng vẽ, Mặc đồ & dọn đồ, Biến hình.
- Review còn lại chưa làm (độ tin trung bình, chưa đo): (a) nốt đầu mỗi cao độ trên worker có thể bị bỏ khi muộn
  > 30 ms, hàng đợi worker FIFO không bỏ job đã quá hạn → nên pre-warm cao độ khi đặt robot; (b) 10 s đầu, lời đáp
  khi bé chạm cũng chờ tên game đọc xong (`whenFree` không xét `lastTouchAt`); (c) góc phụ huynh chỉ vẽ lại danh sách
  giọng sau 800 ms, không nghe `voiceschanged`; (d) `refreshShelf` giữa lúc kéo robot sẽ huỷ cú kéo (chưa rõ có xảy ra);
  (e) `dragdrop` không đo lại `corner` khi resize; (f) utterance không được giữ tham chiếu (Chrome có thể GC, mất `onend`).
- Playwright trên máy này cần `npx playwright install chromium` (đã cài).

## Lệnh hay dùng
```bash
npx tsc --noEmit && npx vitest run
node scripts/loudness.mjs            # cân synth (ghi src/core/loudness.ts)
node scripts/loudness-audit.mjs --fix  # cân file ghi âm (ghi src/core/loudness-files.ts)
node scripts/robots-mix.mjs          # cân robots (ghi src/games/robots/mix.ts)
npm run loudness:check && node scripts/robots-mix.mjs --check
VP=390x844,844x390,1024x768 node scripts/overflow.mjs <game…>
```
Chạy mấy script Playwright này **lần lượt**, không song song (mỗi script mở 1 Chromium + vite; máy dễ lag).
