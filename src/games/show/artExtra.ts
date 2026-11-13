import { thumbSvg } from '../museum/catalog';
import { defs, grain, instrumentInner, SHADOW, VIEW } from './art';
import type { ExtraId, ShowId } from './logic';

/**
 * The pictures of the shelf's extra instruments (viewBox 0 0 240 240, like art.ts). Four are
 * drawn here (ukulele, banjo, sax, harmonica); the rest come from the museum's own realistic
 * drawings, with their pastel backdrop taken off and fitted into the same square.
 */

function ukulele(u: string): string {
  const strings = [-4.5, -1.5, 1.5, 4.5]
    .map((o, i) => `<path d="M${120 + o * 0.9} 46 L${120 + o * 1.6} 206" stroke="${i < 2 ? '#f1ecdc' : '#e4dcc4'}" stroke-width="1" opacity=".95"/>`)
    .join('');
  const body = 'M120 112 C148 108 162 126 156 146 C153 156 168 162 168 186 C168 222 148 238 120 238 C92 238 72 222 72 186 C72 162 87 156 84 146 C78 126 92 108 120 112Z';
  return `${SHADOW(120, 232, 56)}
<g transform="translate(120 128) rotate(-24) scale(.9) translate(-120 -128)">
<path d="${body}" fill="url(#${u}honey)" stroke="#7a4514" stroke-width="2.5"/>
${grain(['M98 122 C92 152 82 186 86 232', 'M110 114 C106 160 100 200 102 238', 'M130 114 C134 160 140 200 138 238', 'M142 122 C148 152 158 186 154 232'], '#8f5a22', 0.35)}
<path d="${body}" fill="url(#${u}shine)" opacity=".5"/>
<circle cx="120" cy="170" r="17" fill="#1a0e08"/><circle cx="120" cy="170" r="17" fill="none" stroke="#3a2412" stroke-width="3"/><circle cx="120" cy="170" r="20.5" fill="none" stroke="#f3d9a6" stroke-width="1.6"/>
<rect x="100" y="204" width="40" height="9" rx="3" fill="url(#${u}dark)"/><rect x="108" y="203" width="24" height="2.6" rx="1" fill="#f4ecd8"/>
<rect x="113" y="42" width="14" height="74" fill="url(#${u}dark)"/>
${[58, 72, 85, 97, 108].map((y) => `<path d="M113 ${y} H127" stroke="#d6dbe2" stroke-width="1.8"/>`).join('')}
<circle cx="120" cy="79" r="2" fill="#f4ecd8"/><circle cx="120" cy="103" r="2" fill="#f4ecd8"/>
<rect x="112" y="40" width="16" height="4" rx="1" fill="#f4ecd8"/>
<path d="M110 40 H130 L133 16 Q133 10 127 10 H113 Q107 10 107 16Z" fill="url(#${u}dark)"/>
${[16, 30].map((y) => `<rect x="97" y="${y - 2}" width="11" height="4" rx="2" fill="url(#${u}silver)"/><circle cx="95" cy="${y}" r="4" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/><rect x="132" y="${y - 2}" width="11" height="4" rx="2" fill="url(#${u}silver)"/><circle cx="145" cy="${y}" r="4" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/>`).join('')}
${strings}
</g>`;
}

function banjo(u: string): string {
  const brackets = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const x1 = 120 + Math.cos(a) * 52;
    const y1 = 168 + Math.sin(a) * 52;
    const x2 = 120 + Math.cos(a) * 60;
    const y2 = 168 + Math.sin(a) * 60;
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#5f6a79" stroke-width="3" stroke-linecap="round"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="2.6" fill="url(#${u}silver)" stroke="#5f6a79" stroke-width=".8"/>`;
  }).join('');
  return `${SHADOW(120, 234, 60)}
<g transform="translate(120 140) rotate(-22) scale(.88) translate(-120 -140)">
<rect x="112" y="26" width="16" height="130" fill="url(#${u}dark)"/>
${[40, 56, 72, 87, 101, 114, 126].map((y) => `<path d="M112 ${y} H128" stroke="#d6dbe2" stroke-width="1.8"/>`).join('')}
${[56, 87, 114].map((y) => `<circle cx="120" cy="${y + 8}" r="2" fill="#f4ecd8"/>`).join('')}
<path d="M110 24 H130 L133 4 Q133 -2 127 -2 H113 Q107 -2 107 4Z" fill="url(#${u}dark)"/>
${[2, 14].map((y) => `<circle cx="100" cy="${y}" r="4" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/><circle cx="140" cy="${y}" r="4" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/>`).join('')}
<circle cx="120" cy="6" r="3.6" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/>
<circle cx="120" cy="168" r="63" fill="#2a1d17"/>
${brackets}
<circle cx="120" cy="168" r="58" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="2"/>
<circle cx="120" cy="168" r="52" fill="url(#${u}skin)" stroke="#b8ab8a" stroke-width="2"/>
<circle cx="120" cy="168" r="41" fill="none" stroke="#d8cdb0" stroke-width="1.4" opacity=".8"/>
<ellipse cx="102" cy="148" rx="24" ry="10" fill="#fff" opacity=".6" transform="rotate(-32 102 148)"/>
<path d="M110 156 H130 V180 H110Z" fill="none"/>
<rect x="100" y="186" width="40" height="5" rx="2" fill="url(#${u}dark)"/><rect x="113" y="183" width="14" height="4" rx="1.5" fill="#f4ecd8" stroke="#8d8573" stroke-width=".8"/>
<path d="M104 230 H136 L130 214 H110Z" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="1.2"/>
${[-4.5, -2.2, 0, 2.2, 4.5].map((o) => `<path d="M${120 + o * 0.7} 26 L${120 + o * 4} 224" stroke="${Math.abs(o) > 3 ? '#e3dcc6' : '#cfc7b0'}" stroke-width="1" opacity=".95"/>`).join('')}
</g>`;
}

function sax(u: string): string {
  const tube = 'M92 30 Q114 30 116 58 L124 176 Q128 218 162 212 Q194 206 192 170 L198 120';
  return `${SHADOW(150, 234, 70)}
<path d="${tube}" fill="none" stroke="#8a5a06" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${tube}" fill="none" stroke="url(#${u}brass)" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M102 34 Q110 36 112 60 L120 176 Q124 208 150 206" fill="none" stroke="#fff6c4" stroke-width="3" stroke-linecap="round" opacity=".8"/>
<path d="M176 120 L220 120 L236 70 Q206 56 164 72Z" fill="url(#${u}brass)" stroke="#8a5a06" stroke-width="2.5" stroke-linejoin="round"/>
<ellipse cx="200" cy="66" rx="36" ry="9" fill="#3a2410" stroke="#8a5a06" stroke-width="2.5" transform="rotate(-12 200 66)"/>
<ellipse cx="198" cy="64" rx="30" ry="5" fill="#120a04" opacity=".7" transform="rotate(-12 198 64)"/>
<path d="M186 120 L222 120 L232 84" stroke="#fff6c4" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
${[82, 100, 118, 136, 154].map((y, i) => `<circle cx="${117 + i * 1.6}" cy="${y}" r="7.6" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="1.6"/><circle cx="${115.5 + i * 1.6}" cy="${y - 2}" r="2.4" fill="#fff" opacity=".85"/><path d="M${126 + i * 1.6} ${y} H138" stroke="#b9800d" stroke-width="3" stroke-linecap="round"/>`).join('')}
<path d="M138 80 V160" stroke="#b9800d" stroke-width="3" stroke-linecap="round"/>
<path d="M118 186 Q142 196 150 176" stroke="#8a5a06" stroke-width="3" fill="none" stroke-linecap="round"/>
<rect x="54" y="20" width="34" height="16" rx="6" fill="url(#${u}black)" transform="rotate(8 71 28)"/>
<rect x="76" y="20" width="16" height="16" rx="3" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="1.4" transform="rotate(8 84 28)"/>
<path d="M58 24 L84 28" stroke="#fff" stroke-width="2" opacity=".3" stroke-linecap="round"/>`;
}

function harmonica(u: string): string {
  const holes = Array.from({ length: 10 }, (_, i) => {
    const x = 36 + i * 17.2;
    return `<rect x="${x}" y="118" width="13" height="16" rx="3" fill="#0b0b0f"/><rect x="${x + 2}" y="124" width="9" height="6" rx="2" fill="#2f3340"/>`;
  }).join('');
  const rivets = [34, 206].map((x) => `<circle cx="${x}" cy="104" r="3.4" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/><circle cx="${x}" cy="148" r="3.4" fill="url(#${u}silver)" stroke="#6b7480" stroke-width=".8"/>`).join('');
  return `${SHADOW(120, 192, 96)}
<rect x="20" y="88" width="200" height="30" rx="9" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="2"/>
<rect x="28" y="91" width="184" height="6" rx="3" fill="#fff" opacity=".8"/>
<path d="M44 106 H196" stroke="#5f6a79" stroke-width="1.4" opacity=".5" stroke-dasharray="3 5"/>
<rect x="24" y="116" width="192" height="20" rx="4" fill="url(#${u}black)"/>
${holes}
<rect x="20" y="134" width="200" height="30" rx="9" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="2"/>
<rect x="28" y="152" width="184" height="6" rx="3" fill="#fff" opacity=".35"/>
<path d="M44 144 H196" stroke="#5f6a79" stroke-width="1.4" opacity=".5" stroke-dasharray="3 5"/>
<rect x="9" y="94" width="18" height="64" rx="9" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="2"/>
<rect x="213" y="94" width="18" height="64" rx="9" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="2"/>
${rivets}
<path d="M70 99 H170" stroke="#7a8492" stroke-width="3" stroke-linecap="round" opacity=".35"/>`;
}

const CUSTOM: Partial<Record<ExtraId, (u: string) => string>> = { ukulele, banjo, sax, harmonica };

/** The museum thumbnail of `kind` with its backdrop removed, fitted into the 240 box (300:240 → 0.8). */
function museumArt(kind: string): string {
  const svg = thumbSvg(kind as never);
  const inner = svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<rect x="0" y="0" width="300" height="240"[^>]*\/>/, '');
  return `<g transform="translate(0 24) scale(.8)">${inner}</g>`;
}

const MUSEUM: Partial<Record<ExtraId, string>> = {
  marimba: 'marimba',
  bell: 'bell',
  kalimba: 'kalimba',
  accordion: 'accordion',
  handpan: 'handpan',
  steelpan: 'steelpan',
  panflute: 'panflute',
  vibraphone: 'vibraphone',
  tambourine: 'tambourine',
  maracas: 'maracas',
};

/** Extra gradients the drawings here use. */
const extraDefs = (u: string): string =>
  `<defs><linearGradient id="${u}honey" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2b866"/><stop offset=".5" stop-color="#d98a3a"/><stop offset="1" stop-color="#a4561c"/></linearGradient></defs>`;

export function showInner(id: ShowId, u: string): string {
  const custom = CUSTOM[id as ExtraId];
  if (custom) return defs(u) + extraDefs(u) + custom(u);
  const kind = MUSEUM[id as ExtraId];
  if (kind) return `${SHADOW(120, 226, 84)}${museumArt(kind)}`;
  const inner = instrumentInner(id as never, u);
  // The bear holds the xylophone's mallets (arms.ts), so the two lying on the drawing go.
  return id === 'xylo' ? inner.replace(/<g transform="rotate\((?:-8 60|8 190) 214\)">.*?<\/g>/g, '') : inner;
}

/** A standalone `<svg>` of any instrument on the show shelf. `u` must be unique on the page. */
export function showSvg(id: ShowId, u: string, cls = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" class="${cls}" aria-hidden="true" focusable="false">${showInner(id, u)}</svg>`;
}
