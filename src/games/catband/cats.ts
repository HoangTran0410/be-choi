/**
 * The cats, drawn as SVG. One face for all of them (round, big eyes, pink cheeks)
 * and a handful of colours and little extras on top, so the eight on stage read as
 * eight different cats at a glance. The same drawing holds a shut mouth and an open
 * one, happy eyes and round ones; CSS shows whichever the cat is doing
 * (`.cb-sing` on the wrapper), so singing costs no redraw.
 */
import { svgEl } from '../../core/dom';

interface Look {
  body: string;
  belly: string;
  line: string;
  ear: string;
  eye: string;
  /** Tabby stripes on the forehead. */
  stripes?: string;
  /** Patches of other colours (tam thể). */
  patches?: readonly { cx: number; cy: number; rx: number; ry: number; fill: string }[];
  extra?: 'bow' | 'astro' | 'dj' | 'crown' | 'rainbow';
}

const LOOKS: Record<string, Look> = {
  xam: { body: '#9ca3af', belly: '#e5e7eb', line: '#6b7280', ear: '#fbcfe8', eye: '#1f2937' },
  trang: { body: '#f8fafc', belly: '#ffffff', line: '#94a3b8', ear: '#fbcfe8', eye: '#1f2937' },
  vang: { body: '#fcd34d', belly: '#fef3c7', line: '#d97706', ear: '#fda4af', eye: '#1f2937', stripes: '#f59e0b' },
  nau: { body: '#b45309', belly: '#fde68a', line: '#78350f', ear: '#fda4af', eye: '#1f2937' },
  hong: { body: '#f9a8d4', belly: '#fce7f3', line: '#db2777', ear: '#fff1f2', eye: '#1f2937' },
  xanh: { body: '#7dd3fc', belly: '#e0f2fe', line: '#0284c7', ear: '#fbcfe8', eye: '#1f2937' },
  tim: { body: '#c4b5fd', belly: '#ede9fe', line: '#7c3aed', ear: '#fbcfe8', eye: '#1f2937' },
  kem: { body: '#fde68a', belly: '#fffbeb', line: '#ca8a04', ear: '#fda4af', eye: '#1f2937' },
  den: { body: '#374151', belly: '#4b5563', line: '#111827', ear: '#f9a8d4', eye: '#facc15' },
  tamthe: {
    body: '#f8fafc',
    belly: '#ffffff',
    line: '#64748b',
    ear: '#fbcfe8',
    eye: '#1f2937',
    patches: [
      { cx: 32, cy: 36, rx: 15, ry: 11, fill: '#f97316' },
      { cx: 70, cy: 40, rx: 14, ry: 12, fill: '#1f2937' },
      { cx: 44, cy: 84, rx: 12, ry: 10, fill: '#f97316' },
      { cx: 66, cy: 90, rx: 10, ry: 9, fill: '#1f2937' },
    ],
  },
  cam: { body: '#fb923c', belly: '#ffedd5', line: '#c2410c', ear: '#fda4af', eye: '#1f2937', stripes: '#ea580c' },
  no: { body: '#fafafa', belly: '#ffffff', line: '#94a3b8', ear: '#fbcfe8', eye: '#1f2937', extra: 'bow' },
  phihanhgia: { body: '#e5e7eb', belly: '#ffffff', line: '#64748b', ear: '#fbcfe8', eye: '#1f2937', extra: 'astro' },
  dj: { body: '#a5b4fc', belly: '#e0e7ff', line: '#4f46e5', ear: '#fbcfe8', eye: '#1f2937', extra: 'dj' },
  vuongmien: { body: '#fed7aa', belly: '#fff7ed', line: '#c2410c', ear: '#fda4af', eye: '#1f2937', extra: 'crown' },
  cauvong: { body: '#ffffff', belly: '#ffffff', line: '#94a3b8', ear: '#fbcfe8', eye: '#1f2937', extra: 'rainbow' },
};

const FALLBACK = LOOKS.xam as Look;

function stripes(color: string): string {
  return `<g stroke="${color}" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M50 24v9"/><path d="M41 26l2 8"/><path d="M59 26l-2 8"/></g>`;
}

function extraUnder(look: Look): string {
  if (look.extra === 'astro')
    return '<rect x="30" y="76" width="40" height="9" rx="4" fill="#f87171"/><circle cx="50" cy="80" r="3.5" fill="#fff"/>';
  return '';
}

function extraOver(look: Look): string {
  switch (look.extra) {
    case 'bow':
      return '<g transform="translate(70 22)"><path d="M0 0L-13 -8V8Z M0 0L13 -8V8Z" fill="#f43f5e"/><circle r="4.5" fill="#e11d48"/></g>';
    case 'astro':
      return '<circle cx="50" cy="48" r="39" fill="#bae6fd" fill-opacity=".4" stroke="#94a3b8" stroke-width="4"/><path d="M26 30q6-12 20-14" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".8"/>';
    case 'dj':
      return '<path d="M15 50A35 35 0 0 1 85 50" fill="none" stroke="#1e293b" stroke-width="6" stroke-linecap="round"/><rect x="9" y="44" width="12" height="22" rx="6" fill="#ef4444" stroke="#1e293b" stroke-width="2.5"/><rect x="79" y="44" width="12" height="22" rx="6" fill="#ef4444" stroke="#1e293b" stroke-width="2.5"/>';
    case 'crown':
      return '<path d="M32 22L36 4L43 15L50 2L57 15L64 4L68 22Z" fill="#facc15" stroke="#ca8a04" stroke-width="2.5" stroke-linejoin="round"/><circle cx="50" cy="12" r="2.6" fill="#ef4444"/>';
    case 'rainbow':
      return '<g fill="none" stroke-width="3.4" stroke-linecap="round"><path d="M33 27q17-14 34 0" stroke="#ef4444"/><path d="M33 33q17-14 34 0" stroke="#facc15"/><path d="M33 39q17-14 34 0" stroke="#22c55e"/><path d="M33 45q17-14 34 0" stroke="#3b82f6"/></g>';
    default:
      return '';
  }
}

/** The cat as an `<svg>` string. */
export function catMarkup(designId: string): string {
  const k = LOOKS[designId] ?? FALLBACK;
  const patches = (k.patches ?? []).map((p) => `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${p.fill}"/>`).join('');
  return `<svg viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<path class="cb-tail" d="M72 100q26 2 22-26" fill="none" stroke="${k.line}" stroke-width="11" stroke-linecap="round"/>
<path class="cb-tail" d="M72 100q26 2 22-26" fill="none" stroke="${k.body}" stroke-width="7" stroke-linecap="round"/>
<ellipse cx="50" cy="86" rx="27" ry="23" fill="${k.body}" stroke="${k.line}" stroke-width="3"/>
<ellipse cx="50" cy="92" rx="14" ry="15" fill="${k.belly}"/>
${extraUnder(k)}
<ellipse cx="36" cy="106" rx="11" ry="6" fill="${k.body}" stroke="${k.line}" stroke-width="3"/>
<ellipse cx="64" cy="106" rx="11" ry="6" fill="${k.body}" stroke="${k.line}" stroke-width="3"/>
<path d="M20 40L22 8L46 26Z" fill="${k.body}" stroke="${k.line}" stroke-width="3" stroke-linejoin="round"/>
<path d="M80 40L78 8L54 26Z" fill="${k.body}" stroke="${k.line}" stroke-width="3" stroke-linejoin="round"/>
<path d="M26 32L26 17L38 26Z" fill="${k.ear}"/>
<path d="M74 32L74 17L62 26Z" fill="${k.ear}"/>
<ellipse cx="50" cy="52" rx="35" ry="29" fill="${k.body}" stroke="${k.line}" stroke-width="3"/>
${patches}
${k.stripes ? stripes(k.stripes) : ''}
<ellipse cx="50" cy="63" rx="14" ry="10" fill="${k.belly}"/>
<circle cx="27" cy="62" r="5.5" fill="#fb7185" opacity=".45"/>
<circle cx="73" cy="62" r="5.5" fill="#fb7185" opacity=".45"/>
<g class="cb-eyes-open">
<ellipse cx="37" cy="51" rx="5.5" ry="7.5" fill="${k.eye}"/><ellipse cx="63" cy="51" rx="5.5" ry="7.5" fill="${k.eye}"/>
<circle cx="39" cy="48" r="2.2" fill="#fff"/><circle cx="65" cy="48" r="2.2" fill="#fff"/>
</g>
<g class="cb-eyes-happy" fill="none" stroke="${k.eye === '#facc15' ? '#facc15' : '#1f2937'}" stroke-width="3.4" stroke-linecap="round">
<path d="M30 53q7-9 14 0"/><path d="M56 53q7-9 14 0"/>
</g>
<path d="M46.5 58.5h7L50 63Z" fill="#f472b6" stroke="#be185d" stroke-width="1.2" stroke-linejoin="round"/>
<g class="cb-mouth-shut" fill="none" stroke="${k.line === '#111827' ? '#f9a8d4' : '#7c2d12'}" stroke-width="2.4" stroke-linecap="round">
<path d="M50 63q-4 6-9 3"/><path d="M50 63q4 6 9 3"/>
</g>
<g class="cb-mouth-open">
<ellipse cx="50" cy="71" rx="9" ry="10" fill="#7f1d1d"/>
<ellipse cx="50" cy="77" rx="6" ry="4.2" fill="#fb7185"/>
</g>
<g stroke="${k.line}" stroke-width="1.8" stroke-linecap="round" opacity=".7">
<path d="M19 58L5 55"/><path d="M19 64L5 66"/><path d="M81 58L95 55"/><path d="M81 64L95 66"/>
</g>
${extraOver(k)}
</svg>`;
}

/** The cat as an element, ready to put in a cell. */
export function catSvg(designId: string): SVGSVGElement {
  return svgEl(catMarkup(designId));
}

/** Every design id this file can draw. */
export const DRAWN_DESIGNS: readonly string[] = Object.keys(LOOKS);
