import { h } from '../core/dom';
import { MAX_PHOTOS } from '../core/photos';
import type { AppDeps } from './deps';
import type { Theme } from './storage';
import { applyTheme } from './theme';

export const STARS_CHANGED = 'be-choi:stars';

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
  const { store, audio, speech, install, photos } = deps;
  const settings = store.settings();

  // ---- family photos (kept on this device, used by jigsaw / paint / birthday) ----
  const photoInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true }) as HTMLInputElement;
  const photoCount = h('span', { class: 'photo-count' });
  const photoGrid = h('div', { class: 'photo-grid' });
  const photoStatus = h('p', { class: 'panel-status' });
  const renderPhotos = async () => {
    const list = await photos.list();
    photoCount.textContent = `${list.length}/${MAX_PHOTOS}`;
    photoGrid.replaceChildren(
      ...list.map((ph) =>
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
      ),
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
    h('p', { class: 'panel-note' }, 'Dùng cho Ghép tranh, Tô màu, Sinh nhật. Ảnh chỉ lưu trên máy này, không gửi đi đâu.'),
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

  const panel = h(
    'div',
    { class: 'panel', onClick: (e: Event) => e.stopPropagation() },
    h('h2', null, '👪 Phụ huynh'),
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
    speech.available() ? null : h('p', { class: 'panel-note' }, 'Máy này chưa có giọng đọc tiếng Việt, game vẫn chơi được bằng âm thanh.'),
    installRow,
    themeRow,
    photoSection,
    resetBox,
    status,
    h('p', { class: 'panel-version' }, `Bé Chơi v${__APP_VERSION__}`),
    h('button', { class: 'panel-btn close', onClick: close }, 'Đóng'),
  );

  const overlay = h('div', { class: 'overlay', onClick: close }, panel);
  document.body.append(overlay);
}
