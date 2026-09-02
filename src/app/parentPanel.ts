import { h } from '../core/dom';
import type { AppDeps } from './deps';

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
  const { store, audio, speech, install } = deps;
  const settings = store.settings();

  const close = () => overlay.remove();

  const status = h('p', { class: 'panel-status' });

  const installRow = install.isStandalone
    ? h('p', { class: 'panel-note' }, '✅ Đã cài lên màn hình chính.')
    : install.available()
      ? h('button', { class: 'panel-btn primary', onClick: () => install.prompt() }, '📲 Cài lên màn hình chính')
      : install.isIOS
        ? h('p', { class: 'panel-note' }, 'Để cài: bấm nút Chia sẻ ⎋ trong Safari → "Thêm vào MH chính".')
        : h('p', { class: 'panel-note' }, 'Để cài: mở menu trình duyệt → "Cài đặt ứng dụng" / "Thêm vào màn hình chính".');

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
    speech.available() ? null : h('p', { class: 'panel-note' }, 'Máy này chưa có giọng đọc tiếng Việt, game vẫn chơi được bằng âm thanh.'),
    installRow,
    h(
      'button',
      {
        class: 'panel-btn',
        onClick: () => {
          store.resetStars();
          window.dispatchEvent(new Event(STARS_CHANGED));
          status.textContent = 'Đã xoá hết sao.';
        },
      },
      '🗑️ Xoá hết sao',
    ),
    status,
    h('p', { class: 'panel-version' }, `Bé Chơi v${__APP_VERSION__}`),
    h('button', { class: 'panel-btn close', onClick: close }, 'Đóng'),
  );

  const overlay = h('div', { class: 'overlay', onClick: close }, panel);
  document.body.append(overlay);
}
