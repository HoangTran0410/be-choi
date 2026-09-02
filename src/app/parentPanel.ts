import { h } from '../core/dom';
import type { AppDeps } from './deps';

export const STARS_CHANGED = 'be-choi:stars';

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, h('span', { class: 'switch-label' }, label), input, h('span', { class: 'switch-track' }));
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
