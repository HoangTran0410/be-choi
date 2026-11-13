import { h } from '../core/dom';
import { MAX_NAME, MAX_PHOTOS } from '../core/photos';
import type { VoicePitch } from '../core/speech';
import { currentBuild, formatBuildTime } from './buildTime';
import { AGE_CHOICES, type AgeFilter } from './ages';
import { BREAK_PRESETS } from './breakTimer';
import { GAMES } from './registry';
import { SKILL_LABELS } from './skills';
import { DOMAIN_NAMES, dayNumber, loadSkills, summarize } from '../core/mastery';
import { englishOn, englishVoice, sayEnglish, setEnglishOn } from '../core/english';
import type { AppDeps } from './deps';
import type { Theme } from './storage';
import { applyTheme } from './theme';
import '../styles/parent.css';

export const STARS_CHANGED = 'be-choi:stars';
/** Fired when a setting that changes what the home screen shows (child's age) is changed. */
export const SETTINGS_CHANGED = 'be-choi:settings';

/**
 * A big on/off switch. A real <button> toggled on pointerup instead of a hidden
 * checkbox + label: iOS Safari is unreliable with label taps, and pointer events keep
 * working even when the page cancels touch defaults.
 */
function toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const state = h('span', { class: 'switch-state' }, checked ? 'Bật' : 'Tắt');
  const btn = h(
    'button',
    { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(checked) },
    h('span', { class: 'switch-label' }, label),
    state,
    h('span', { class: 'switch-track' }),
  );
  const flip = (e: Event) => {
    e.preventDefault();
    const v = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(v));
    state.textContent = v ? 'Bật' : 'Tắt';
    onChange(v);
  };
  btn.addEventListener('pointerup', flip);
  // Keyboard / assistive tech still get a plain click.
  btn.addEventListener('click', (e) => {
    if ((e as PointerEvent).pointerType === '' || (e as MouseEvent).detail === 0) flip(e);
  });
  return btn;
}

/** Settings panel for parents. Opened by holding the 👪 button. */
export function openParentPanel(deps: AppDeps): void {
  const { store, audio, speech, install, update, photos } = deps;
  const settings = store.settings();

  // ---- family photos (kept on this device, used by jigsaw / paint / birthday) ----
  const photoInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true }) as HTMLInputElement;
  const photoCount = h('span', { class: 'photo-count' });
  const photoGrid = h('div', { class: 'photo-grid' });
  const photoStatus = h('p', { class: 'panel-status' });
  /** Names a parent is most likely to give; shown as one-tap chips under a photo that has no name yet. */
  const QUICK_NAMES = ['Mẹ', 'Ba', 'Bà', 'Ông', 'Bé'];
  const renderPhotos = async () => {
    const list = await photos.list();
    photoCount.textContent = `${list.length}/${MAX_PHOTOS}`;
    photoGrid.replaceChildren(
      ...list.map((ph) => {
        const nameInput = h('input', {
          class: 'photo-name',
          type: 'text',
          maxlength: MAX_NAME,
          placeholder: 'Tên (Mẹ, Ba…)',
          'aria-label': 'Tên người trong ảnh',
          value: ph.name ?? '',
        }) as HTMLInputElement;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const save = () => {
          if (timer) clearTimeout(timer);
          timer = null;
          void photos.rename(ph.id, nameInput.value);
        };
        // `change` fires on leaving the box; the short delay also keeps a name typed just
        // before the panel is closed.
        nameInput.addEventListener('input', () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(save, 400);
        });
        nameInput.addEventListener('change', save);
        const chips = ph.name
          ? null
          : h(
              'div',
              { class: 'photo-chips' },
              ...QUICK_NAMES.map((n) =>
                h(
                  'button',
                  {
                    class: 'photo-chip',
                    type: 'button',
                    onClick: async () => {
                      await photos.rename(ph.id, n);
                      await renderPhotos();
                    },
                  },
                  n,
                ),
              ),
            );
        return h(
          'div',
          { class: 'photo-item' },
          h(
            'div',
            { class: 'photo-thumb', style: `background-image:url("${ph.url}")` },
            h(
              'button',
              {
                class: 'photo-remove',
                type: 'button',
                'aria-label': 'Xoá ảnh',
                onClick: async () => {
                  await photos.remove(ph.id);
                  await renderPhotos();
                },
              },
              '✕',
            ),
          ),
          nameInput,
          chips,
        );
      }),
    );
  };
  photoInput.addEventListener('change', async () => {
    const files = Array.from(photoInput.files ?? []);
    photoInput.value = '';
    if (!files.length) return;
    photoStatus.textContent = 'Đang thêm ảnh…';
    const added = await photos.add(files);
    photoStatus.textContent = added.length ? `Đã thêm ${added.length} ảnh.` : 'Không thêm được ảnh (đã đủ hoặc ảnh lỗi).';
    await renderPhotos();
  });
  void renderPhotos();
  const photoSection = h(
    'div',
    { class: 'panel-section' },
    h('h3', null, '📷 Ảnh của bé ', photoCount),
    h(
      'p',
      { class: 'panel-note' },
      'Dùng cho Ghép tranh, Tô màu, Sinh nhật và Học cùng bé. Gõ tên (Mẹ, Ba, Bà…) dưới ảnh để bé tập nhận ra người thân. Ảnh chỉ lưu trên máy này, không gửi đi đâu.',
    ),
    h('button', { class: 'panel-btn primary', type: 'button', onClick: () => photoInput.click() }, '➕ Thêm ảnh / chụp ảnh'),
    photoInput,
    photoGrid,
    photoStatus,
  );

  const close = () => overlay.remove();

  const status = h('p', { class: 'panel-status' });

  // ---- theme: light / dark / follow system ----
  const THEMES: { id: Theme; label: string }[] = [
    { id: 'light', label: '🌞 Sáng' },
    { id: 'dark', label: '🌙 Tối' },
    { id: 'auto', label: '🌗 Tự động' },
  ];
  const themeBtns = THEMES.map((t) =>
    h(
      'button',
      {
        class: `panel-seg-btn${settings.theme === t.id ? ' active' : ''}`,
        type: 'button',
        onClick: () => {
          store.setSettings({ theme: t.id });
          applyTheme(t.id);
          themeBtns.forEach((b, i) => b.classList.toggle('active', THEMES[i]?.id === t.id));
          audio.tick();
        },
      },
      t.label,
    ),
  );
  const themeRow = h('div', { class: 'panel-section' }, h('h3', null, '🎨 Giao diện'), h('div', { class: 'panel-seg' }, ...themeBtns));

  // ---- which voice reads to the child, and how high ----
  const SAMPLE = 'Xin chào bé! Mình cùng chơi nhé.';
  const voiceBtns = h('div', { class: 'panel-seg panel-seg-wrap' });
  const drawVoices = (): void => {
    const list = speech.voices?.() ?? [];
    const current = store.settings().voiceId;
    const choices = [{ id: '', name: 'Tự chọn' }, ...list];
    voiceBtns.replaceChildren(
      ...choices.map((v) =>
        h(
          'button',
          {
            class: `panel-seg-btn${current === v.id ? ' active' : ''}`,
            type: 'button',
            onClick: () => {
              store.setSettings({ voiceId: v.id });
              speech.setVoice?.(v.id || null);
              drawVoices();
              speech.speak(SAMPLE);
            },
          },
          v.name,
        ),
      ),
    );
  };
  drawVoices();
  // Voices often arrive a moment after the page starts.
  if (!(speech.voices?.() ?? []).length) setTimeout(drawVoices, 800);
  const PITCHES: { id: VoicePitch; label: string }[] = [
    { id: 'low', label: 'Trầm' },
    { id: 'normal', label: 'Vừa' },
    { id: 'high', label: 'Cao' },
  ];
  const pitchBtns = PITCHES.map((p) =>
    h(
      'button',
      {
        class: `panel-seg-btn${settings.voicePitch === p.id ? ' active' : ''}`,
        type: 'button',
        onClick: () => {
          store.setSettings({ voicePitch: p.id });
          speech.setPitch?.(p.id);
          pitchBtns.forEach((b, i) => b.classList.toggle('active', PITCHES[i]?.id === p.id));
          speech.speak(SAMPLE);
        },
      },
      p.label,
    ),
  );
  const voiceRow = speech.voices
    ? h(
        'div',
        { class: 'panel-section' },
        h('h3', null, '🗣️ Giọng đọc'),
        voiceBtns,
        h('div', { class: 'panel-seg' }, ...pitchBtns),
        h(
          'p',
          { class: 'panel-note' },
          'Bấm một giọng để nghe thử. Danh sách là các giọng tiếng Việt có trên máy. iPad: Cài đặt → Trợ năng → Nội dung đọc → Giọng nói → Tiếng Việt để tải thêm giọng (bản "Nâng cao" nghe tự nhiên hơn), rồi mở lại app.',
        ),
      )
    : null;

  // ---- child's age: hides games that are still too hard (0 = show all) ----
  const AGES: { id: AgeFilter; label: string }[] = AGE_CHOICES.map((id) => ({ id, label: id === 0 ? 'Tất cả' : `${id} tuổi` }));
  const ageBtns = AGES.map((a) =>
    h(
      'button',
      {
        class: `panel-seg-btn${settings.age === a.id ? ' active' : ''}`,
        type: 'button',
        onClick: () => {
          store.setSettings({ age: a.id });
          ageBtns.forEach((b, i) => b.classList.toggle('active', AGES[i]?.id === a.id));
          window.dispatchEvent(new Event(SETTINGS_CHANGED));
          audio.tick();
        },
      },
      a.label,
    ),
  );
  const ageRow = h(
    'div',
    { class: 'panel-section' },
    h('h3', null, '🎂 Bé mấy tuổi?'),
    h('div', { class: 'panel-seg' }, ...ageBtns),
    h('p', { class: 'panel-note' }, 'Chọn tuổi để ẩn bớt trò còn khó. Trò nào bé đã thích (❤️) vẫn hiện. Chọn "Tất cả" để hiện hết.'),
  );

  // ---- rest reminder: off by default, never stops the game ----
  // A value saved by an older build (10') stays visible and selected.
  const BREAKS = BREAK_PRESETS.includes(settings.breakMinutes)
    ? [...BREAK_PRESETS]
    : [...BREAK_PRESETS, settings.breakMinutes].sort((a, b) => a - b);
  const breakBtns = BREAKS.map((m) =>
    h(
      'button',
      {
        class: `panel-seg-btn${settings.breakMinutes === m ? ' active' : ''}`,
        type: 'button',
        onClick: () => {
          store.setSettings({ breakMinutes: m });
          breakBtns.forEach((b, i) => b.classList.toggle('active', BREAKS[i] === m));
          audio.tick();
          if (m > 0) speech.speak('Bé nghỉ mắt chút nhé!');
        },
      },
      m === 0 ? 'Tắt' : `${m}'`,
    ),
  );
  const breakRow = h(
    'div',
    { class: 'panel-section' },
    h('h3', null, '💧 Nhắc nghỉ'),
    h('div', { class: 'panel-seg' }, ...breakBtns),
    h(
      'p',
      { class: 'panel-note' },
      'Sau chừng ấy phút chơi, chú gấu ngáp rồi ngủ, có tiếng ru nhẹ và lời "bé nghỉ mắt chút nhé". Game không dừng, không khoá, không mất sao — bé chỉ bấm ▶️ để chơi tiếp. Mặc định: Tắt.',
    ),
  );

  const reportRow = buildReport(store);

  const installRow = install.isStandalone
    ? h('p', { class: 'panel-note' }, '✅ Đã cài lên màn hình chính.')
    : install.available()
      ? h('button', { class: 'panel-btn primary', onClick: () => install.prompt() }, '📲 Cài lên màn hình chính')
      : install.isIOS
        ? h('p', { class: 'panel-note' }, 'Để cài: bấm nút Chia sẻ ⎋ trong Safari → "Thêm vào MH chính".')
        : h('p', { class: 'panel-note' }, 'Để cài: mở menu trình duyệt → "Cài đặt ứng dụng" / "Thêm vào màn hình chính".');

  // ---- wiping the child's stars and stickers ----
  /**
   * The stars cannot be given back, so wiping takes two taps. The panel is already behind a
   * 1.5 s hold, but a child who does get in drums on one spot, so the second tap has to be
   * both somewhere else and not immediate.
   */
  const resetBox = h('div', { class: 'panel-reset' });
  /**
   * The question has to have been on screen this long before "Xoá hết" counts. Laying Huỷ
   * over the button that was just tapped is not enough on its own: the panel scrolls as the
   * question makes it taller, so where the buttons land is not fixed. A grown-up who has
   * read the question is never this fast; a child drumming on one spot always is.
   */
  const ARM_MS = 500;
  let askedAt = 0;
  const resetBtn = h(
    'button',
    {
      class: 'panel-btn',
      type: 'button',
      onClick: () => {
        audio.tick();
        askReset();
      },
    },
    '🗑️ Xoá hết sao và sticker',
  );

  function idleReset(): void {
    resetBox.replaceChildren(resetBtn);
  }

  function askReset(): void {
    askedAt = Date.now();
    resetBox.replaceChildren(
      h('p', { class: 'panel-note' }, 'Xoá hết sao và sticker của bé? Không lấy lại được.'),
      // Huỷ is full width and covers most of the button just tapped, so a repeat tap
      // usually lands on it; near the bottom edge it still reaches Xoá hết, which is
      // what the arming delay is for.
      h(
        'button',
        {
          class: 'panel-btn',
          type: 'button',
          onClick: () => {
            audio.tick();
            idleReset();
          },
        },
        'Huỷ',
      ),
      h('button', { class: 'panel-btn danger', type: 'button', onClick: wipeStars }, '🗑️ Xoá hết'),
    );
  }

  function wipeStars(): void {
    if (Date.now() - askedAt < ARM_MS) return;
    store.resetStars();
    window.dispatchEvent(new Event(STARS_CHANGED));
    status.textContent = 'Đã xoá hết sao và sticker.';
    audio.tick();
    idleReset();
  }

  idleReset();

  // ---- forcing a new build onto a device still running the old one ----
  const updateStatus = h('p', { class: 'panel-status' });
  const updateBtn = h(
    'button',
    {
      class: 'panel-btn',
      type: 'button',
      onClick: async () => {
        audio.tick();
        updateBtn.disabled = true;
        updateStatus.textContent = 'Đang tải bản mới…';
        // A true answer means the page is on its way out, so there is nothing to say.
        if (await update.force()) return;
        updateBtn.disabled = false;
        updateStatus.textContent = 'Cần có mạng để tải bản mới.';
      },
    },
    '⬇️ Tải bản mới nhất',
  );
  const updateSection = h(
    'div',
    { class: 'panel-section' },
    h('h3', null, '🔄 Phiên bản'),
    // The build time is what tells a parent whether this device has the latest; the
    // semver rarely moves. The download's progress shows at the top of the screen.
    h('p', { class: 'panel-version' }, [formatBuildTime(currentBuild()), `Bé Chơi v${__APP_VERSION__}`].filter(Boolean).join(' · ')),
    h('p', { class: 'panel-note' }, 'Máy vẫn còn bản cũ? Bấm để xoá bản đã lưu và tải lại từ mạng. App sẽ mở lại ngay sau đó.'),
    updateBtn,
    updateStatus,
  );

  const panel = h(
    'div',
    { class: 'panel', onClick: (e: Event) => e.stopPropagation() },
    h(
      'div',
      { class: 'panel-head' },
      h('h2', null, '👪 Phụ huynh'),
      // A parent who opened this by accident, or who is done after the first
      // switch, should not have to scroll to the bottom to get out.
      h('button', { class: 'panel-x', type: 'button', 'aria-label': 'Đóng', onClick: close }, '✕'),
    ),
    toggle('🔊 Âm thanh', settings.sound, (v) => {
      store.setSettings({ sound: v });
      audio.setEnabled(v);
      if (v) audio.ding();
    }),
    toggle('🗣️ Giọng nói', settings.voice, (v) => {
      store.setSettings({ voice: v });
      speech.setEnabled(v);
      if (v) speech.speak('Xin chào bé!');
    }),
    toggle('🎁 Báo sticker mới', settings.stickerPopup, (v) => {
      store.setSettings({ stickerPopup: v });
    }),
    settings.stickerPopup
      ? null
      : h('p', { class: 'panel-note' }, 'Bé vẫn nhận sticker như thường, chỉ là không bị ngắt giữa lúc chơi. Xem trong Album nhé.'),
    toggle('🎉 Pháo hoa ăn mừng', settings.confetti, (v) => {
      store.setSettings({ confetti: v });
    }),
    settings.confetti ? null : h('p', { class: 'panel-note' }, 'Bé thắng vẫn có nhạc và lời khen, chỉ bỏ đám giấy màu bay đầy màn hình.'),
    toggle('✨ Hôm nay chơi gì', settings.todayPick, (v) => {
      store.setSettings({ todayPick: v });
      // Home listens for this to redraw itself.
      window.dispatchEvent(new Event(STARS_CHANGED));
    }),
    settings.todayPick ? null : h('p', { class: 'panel-note' }, 'Màn hình chính không còn hàng 3 game gợi ý mỗi ngày.'),
    toggle('🇬🇧 Nói thêm tiếng Anh', englishOn(), (v) => {
      setEnglishOn(v);
      if (v) sayEnglish('Hello!', 0);
    }),
    h(
      'p',
      { class: 'panel-note' },
      englishVoice()
        ? 'Sau tên tiếng Việt (màu, hình, con vật, số…), máy đọc thêm từ tiếng Anh.'
        : 'Máy này chưa có giọng tiếng Anh nên bật cũng chưa nghe được.',
    ),
    speech.available() ? null : h('p', { class: 'panel-note' }, 'Máy này chưa có giọng đọc tiếng Việt, game vẫn chơi được bằng âm thanh.'),
    voiceRow,
    installRow,
    reportRow,
    ageRow,
    breakRow,
    themeRow,
    photoSection,
    resetBox,
    status,
    updateSection,
    h('button', { class: 'panel-btn close', onClick: close }, 'Đóng'),
  );

  const overlay = h('div', { class: 'overlay', onClick: close }, panel);
  document.body.append(overlay);
}

const fmtMin = (ms: number): string => {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} phút`;
  return `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')}`;
};

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "Bé đã chơi": time today and over the last week, favourite games, skills practised, stars. */
export function buildReport(store: AppDeps['store']): HTMLElement {
  const days = store.playReport(7);
  const today = days[days.length - 1]!;
  const weekMs = days.reduce((a, d) => a + d.ms, 0);
  const weekStars = days.reduce((a, d) => a + d.stars, 0);
  const peak = Math.max(1, ...days.map((d) => d.ms));

  const bars = h(
    'div',
    { class: 'report-days' },
    ...days.map((d, i) => {
      const wd = WEEKDAY[new Date(`${d.key}T12:00:00`).getDay()]!;
      return h(
        'div',
        { class: `report-day${i === days.length - 1 ? ' today' : ''}`, title: `${d.key}: ${fmtMin(d.ms)}` },
        h('span', null, d.ms ? `${Math.round(d.ms / 60_000)}'` : ''),
        h('div', { class: 'report-day-bar', style: `height:${Math.round((d.ms / peak) * 100) * 0.6}%` }),
        h('span', null, wd),
      );
    }),
  );

  const perGame: Record<string, number> = {};
  for (const d of days) for (const [id, ms] of Object.entries(d.games)) perGame[id] = (perGame[id] ?? 0) + ms;
  const top = Object.entries(perGame)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topMax = top[0]?.[1] ?? 1;
  const rows = (items: { icon: string; label: string; ms: number }[], max: number) =>
    items.map((it) =>
      h(
        'div',
        { class: 'report-row' },
        h('span', null, it.icon),
        h('span', null, it.label),
        h('div', { class: 'report-track' }, h('div', { class: 'report-fill', style: `width:${Math.round((it.ms / max) * 100)}%` })),
        h('span', null, fmtMin(it.ms)),
      ),
    );

  const skillMs: Record<string, number> = {};
  for (const [id, ms] of top.length ? Object.entries(perGame) : []) {
    const g = GAMES.find((x) => x.id === id);
    if (g) skillMs[g.skill] = (skillMs[g.skill] ?? 0) + ms;
  }
  const skills = Object.entries(skillMs).sort((a, b) => b[1] - a[1]);

  return h(
    'div',
    { class: 'panel-section' },
    h('h3', null, '📊 Bé đã chơi'),
    h(
      'div',
      { class: 'report-head' },
      h('span', null, `Hôm nay: ${fmtMin(today.ms)} · ⭐ ${today.stars}`),
      h('span', null, `7 ngày: ${fmtMin(weekMs)} · ⭐ ${weekStars}`),
    ),
    bars,
    top.length
      ? h(
          'div',
          null,
          h('div', { class: 'report-sub' }, '🎮 Chơi nhiều nhất'),
          ...rows(
            top.map(([id, ms]) => {
              const g = GAMES.find((x) => x.id === id);
              return { icon: g?.icon ?? '🎮', label: g?.title ?? id, ms };
            }),
            topMax,
          ),
          h('div', { class: 'report-sub' }, '🧠 Bé đang luyện'),
          ...rows(
            skills.map(([k, ms]) => ({
              icon: SKILL_LABELS[k as keyof typeof SKILL_LABELS]?.[0] ?? '✨',
              label: SKILL_LABELS[k as keyof typeof SKILL_LABELS]?.[1] ?? k,
              ms,
            })),
            skills[0]?.[1] ?? 1,
          ),
        )
      : h('p', { class: 'panel-note' }, 'Chưa có dữ liệu. Thời gian chơi được ghi từ giờ trở đi, chỉ lưu trên máy này.'),
    buildLearned(),
  );
}

/** "Bé đã thuộc": per topic, how many things the child has met / knows across days / needs reviewing. */
export function buildLearned(state = loadSkills(), day = dayNumber()): HTMLElement | null {
  const rows = summarize(state, day);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.met));
  return h(
    'div',
    { class: 'report-learned' },
    h('div', { class: 'report-sub' }, '🎓 Bé đã thuộc (đúng ngay lần đầu, qua nhiều ngày)'),
    ...rows.map((r) =>
      h(
        'div',
        { class: 'report-row' },
        h('span', null, '•'),
        h('span', null, DOMAIN_NAMES[r.domain] ?? r.domain),
        h('div', { class: 'report-track' }, h('div', { class: 'report-fill', style: `width:${Math.round((r.solid / max) * 100)}%` })),
        h('span', null, `${r.solid}/${r.met}${r.due ? ` · ôn ${r.due}` : ''}`),
      ),
    ),
  );
}
