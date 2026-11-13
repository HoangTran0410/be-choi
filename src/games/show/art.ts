import type { InstId } from './logic';

/**
 * Hand-drawn SVG instruments (viewBox 0 0 240 240) with real proportions: wood grain, brass and
 * silver sheen, lacquer shine. Self-contained: every drawing makes its own gradients, ids prefixed
 * with `u` so several can share one page. Used by the show, guess and band games.
 */

export const VIEW = 240;

export function defs(u: string): string {
  return `<defs>
<linearGradient id="${u}wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b4682a"/><stop offset=".45" stop-color="#e0974e"/><stop offset=".6" stop-color="#d4853d"/><stop offset="1" stop-color="#8f4d1d"/></linearGradient>
<linearGradient id="${u}woodv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a55c"/><stop offset=".5" stop-color="#cc7a33"/><stop offset="1" stop-color="#8f4d1d"/></linearGradient>
<linearGradient id="${u}dark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1d17"/><stop offset=".4" stop-color="#5a4034"/><stop offset="1" stop-color="#1e1410"/></linearGradient>
<linearGradient id="${u}black" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b4b55"/><stop offset=".25" stop-color="#1f1f26"/><stop offset="1" stop-color="#0c0c10"/></linearGradient>
<linearGradient id="${u}brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".3" stop-color="#f3c33a"/><stop offset=".65" stop-color="#c98c12"/><stop offset="1" stop-color="#8a5a06"/></linearGradient>
<linearGradient id="${u}silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#d7dde5"/><stop offset=".7" stop-color="#8f99a6"/><stop offset="1" stop-color="#cfd6de"/></linearGradient>
<radialGradient id="${u}skin" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#fffdf5"/><stop offset=".7" stop-color="#efe6cf"/><stop offset="1" stop-color="#cdbf9f"/></radialGradient>
<linearGradient id="${u}red" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8e1a1a"/><stop offset=".35" stop-color="#e04545"/><stop offset=".55" stop-color="#cc2e2e"/><stop offset="1" stop-color="#7c1414"/></linearGradient>
<linearGradient id="${u}amber" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e58a35"/><stop offset=".5" stop-color="#b8531a"/><stop offset="1" stop-color="#7a3010"/></linearGradient>
<linearGradient id="${u}shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>`;
}

export const SHADOW = (cx: number, cy: number, rx: number): string =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${Math.max(4, rx * 0.09)}" fill="#000" opacity=".16"/>`;

/** Thin curved grain lines laid over a wooden shape. */
export function grain(paths: readonly string[], stroke = '#6b3510', op = 0.22): string {
  return paths.map((d) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.1" opacity="${op}" stroke-linecap="round"/>`).join('');
}

function piano(u: string): string {
  let white = '';
  let black = '';
  const kw = 25;
  for (let i = 0; i < 8; i++) {
    const x = 20 + i * kw;
    white += `<rect x="${x}" y="130" width="${kw - 1.5}" height="52" rx="3" fill="url(#${u}skin)" stroke="#9a8d70" stroke-width="1"/>`;
  }
  for (const i of [0, 1, 3, 4, 5]) {
    const x = 20 + (i + 1) * kw - 8;
    black += `<rect x="${x}" y="130" width="16" height="32" rx="2.5" fill="url(#${u}black)"/><rect x="${x + 2.5}" y="132" width="3" height="22" rx="1.5" fill="#fff" opacity=".28"/>`;
  }
  return `${SHADOW(120, 226, 100)}
<rect x="30" y="182" width="12" height="42" rx="3" fill="url(#${u}black)"/><rect x="198" y="182" width="12" height="42" rx="3" fill="url(#${u}black)"/>
<path d="M30 28 H210 Q216 28 216 34 V122 H24 V34 Q24 28 30 28Z" fill="url(#${u}black)"/>
<path d="M36 36 H204 V112 H36Z" fill="#17171d"/>
<path d="M40 40 H120 L92 112 H40Z" fill="url(#${u}shine)" opacity=".35"/>
<rect x="84" y="46" width="72" height="50" rx="3" fill="#fffdf4" stroke="#c9bfa5"/>
${[56, 64, 72, 80].map((y) => `<path d="M92 ${y} H148" stroke="#6a6a72" stroke-width="1.4" opacity=".55"/>`).join('')}
<circle cx="104" cy="${88}" r="3.2" fill="#222"/><path d="M107 88 V68" stroke="#222" stroke-width="1.6"/>
<circle cx="126" cy="${80}" r="3.2" fill="#222"/><path d="M129 80 V62" stroke="#222" stroke-width="1.6"/>
<rect x="14" y="120" width="212" height="14" rx="5" fill="url(#${u}black)"/>
<rect x="18" y="122" width="204" height="3" rx="1.5" fill="#fff" opacity=".25"/>
<rect x="14" y="126" width="212" height="58" rx="6" fill="url(#${u}black)"/>
<rect x="18" y="127" width="204" height="6" fill="#a31d2c"/>
${white}${black}
<path d="M24 36 Q24 30 30 30 H210" stroke="#fff" stroke-opacity=".25" fill="none" stroke-width="2"/>
<rect x="206" y="196" width="0" height="0"/>`;
}

function guitar(u: string): string {
  const strings = [-6.5, -4, -1.3, 1.3, 4, 6.5]
    .map((o, i) => `<path d="M${120 + o * 0.8} 30 L${120 + o * 1.45} 206" stroke="${i < 3 ? '#e6e0cf' : '#d8c27a'}" stroke-width="${i < 3 ? 0.9 : 1.4}" opacity=".95"/>`)
    .join('');
  const frets = [46, 62, 77, 91, 104, 116]
    .map((y) => `<path d="M112.5 ${y} H127.5" stroke="#d6dbe2" stroke-width="2"/>`)
    .join('');
  return `${SHADOW(120, 232, 62)}
<g transform="translate(120 128) rotate(-24) scale(.86) translate(-120 -128)">
<path d="M120 100 C152 96 170 118 162 142 C158 156 176 164 176 190 C176 228 152 244 120 244 C88 244 64 228 64 190 C64 164 82 156 78 142 C70 118 88 96 120 100Z" fill="url(#${u}woodv)" stroke="#6b3510" stroke-width="2.5"/>
${grain(['M96 118 C90 150 80 180 84 232', 'M108 110 C104 160 98 200 100 242', 'M132 110 C136 160 142 200 140 242', 'M144 118 C150 150 160 180 156 232'])}
<path d="M120 100 C152 96 170 118 162 142 C158 156 176 164 176 190 C176 228 152 244 120 244 C88 244 64 228 64 190 C64 164 82 156 78 142 C70 118 88 96 120 100Z" fill="url(#${u}shine)" opacity=".4"/>
<circle cx="120" cy="170" r="21" fill="#1a0e08"/><circle cx="120" cy="170" r="21" fill="none" stroke="#f3d9a6" stroke-width="2.4"/><circle cx="120" cy="170" r="25" fill="none" stroke="#3a2412" stroke-width="2"/>
<path d="M104 160 Q120 150 136 160" stroke="#fff" stroke-opacity=".12" fill="none" stroke-width="3"/>
<rect x="100" y="206" width="40" height="9" rx="3" fill="url(#${u}dark)"/><rect x="108" y="205" width="24" height="3" rx="1" fill="#f4ecd8"/>
<path d="M104 202 L104 226 M136 202 L136 226" stroke="#3a2412" stroke-width="0" />
<rect x="112" y="26" width="16" height="84" fill="url(#${u}dark)"/>
<path d="M112 26 H128 V110 H112Z" fill="none" stroke="#120a06" stroke-width="1.5"/>
${frets}
<circle cx="120" cy="56" r="2.2" fill="#f4ecd8"/><circle cx="120" cy="84" r="2.2" fill="#f4ecd8"/>
<rect x="110" y="24" width="20" height="5" rx="1" fill="#f4ecd8"/>
<path d="M108 22 H132 L136 -2 Q136 -8 130 -8 H110 Q104 -8 104 -2Z" fill="url(#${u}dark)"/>
${[-2, 6, 14].map((y) => `<rect x="94" y="${y - 2}" width="12" height="4" rx="2" fill="url(#${u}silver)"/><circle cx="92" cy="${y}" r="4" fill="url(#${u}silver)"/><rect x="134" y="${y - 2}" width="12" height="4" rx="2" fill="url(#${u}silver)"/><circle cx="148" cy="${y}" r="4" fill="url(#${u}silver)"/>`).join('')}
${strings}
</g>`;
}

function violin(u: string): string {
  return `${SHADOW(120, 232, 56)}
<g transform="translate(120 124) rotate(-20) scale(.82) translate(-120 -124)">
<path d="M120 104 C148 100 160 122 152 142 C148 152 142 154 144 160 C148 168 162 172 162 196 C162 224 142 238 120 238 C98 238 78 224 78 196 C78 172 92 168 96 160 C98 154 92 152 88 142 C80 122 92 100 120 104Z" fill="url(#${u}amber)" stroke="#4a1e08" stroke-width="2.5"/>
${grain(['M100 112 C94 150 84 190 90 232', 'M112 106 C108 160 100 200 104 238', 'M128 106 C132 160 140 200 136 238', 'M140 112 C146 150 156 190 150 232'], '#3a1604', 0.28)}
<path d="M120 104 C148 100 160 122 152 142 C148 152 142 154 144 160 C148 168 162 172 162 196 C162 224 142 238 120 238 C98 238 78 224 78 196 C78 172 92 168 96 160 C98 154 92 152 88 142 C80 122 92 100 120 104Z" fill="url(#${u}shine)" opacity=".45"/>
<path d="M104 150 C98 162 108 170 102 184 M136 150 C142 162 132 170 138 184" stroke="#150a04" stroke-width="4" fill="none" stroke-linecap="round"/>
<rect x="107" y="204" width="26" height="6" rx="2" fill="#f1dfb0"/><path d="M118 210 L116 232 H124 L122 210Z" fill="url(#${u}dark)"/>
<ellipse cx="146" cy="218" rx="14" ry="8" fill="url(#${u}dark)" transform="rotate(-24 146 218)"/>
<rect x="114" y="26" width="12" height="82" rx="2" fill="url(#${u}dark)"/>
<path d="M120 28 V210" stroke="#d9d3c4" stroke-width="0" />
${[-3.6, -1.2, 1.2, 3.6].map((o) => `<path d="M${120 + o} 30 L${120 + o * 2.6} 206" stroke="#e8e2d0" stroke-width="0.9"/>`).join('')}
<path d="M114 28 Q108 12 118 8 Q132 6 130 18 Q128 26 122 22" fill="url(#${u}amber)" stroke="#4a1e08" stroke-width="2"/>
<circle cx="119" cy="16" r="2.4" fill="#4a1e08"/>
<rect x="104" y="30" width="9" height="12" rx="3" fill="url(#${u}dark)"/><rect x="127" y="30" width="9" height="12" rx="3" fill="url(#${u}dark)"/>
<rect x="104" y="46" width="9" height="12" rx="3" fill="url(#${u}dark)"/><rect x="127" y="46" width="9" height="12" rx="3" fill="url(#${u}dark)"/>
</g>
<g class="show-bow">
<path d="M22 226 L218 130" stroke="#5a2a10" stroke-width="5" stroke-linecap="round"/>
<path d="M24 222 L216 128" stroke="#a4632a" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
<path d="M44 230 Q130 168 214 140" stroke="#f6f1e2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
<path d="M18 224 L36 238 L42 230 L26 218Z" fill="url(#${u}black)"/><circle cx="31" cy="228" r="3" fill="url(#${u}silver)"/>
</g>`;
}

function flute(u: string): string {
  const keys = [64, 86, 108, 134, 156, 178]
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="${120 - (x - 20) * 0.0}" rx="6.5" ry="6.5" fill="url(#${u}silver)" stroke="#6b7480" stroke-width="1.4"/><circle cx="${x - 1.5}" cy="117" r="2" fill="#fff" opacity=".8"/><path d="M${x} 126 V134" stroke="#8791a0" stroke-width="2.4"/>`,
    )
    .join('');
  return `${SHADOW(120, 214, 92)}
<g transform="translate(120 118) rotate(-17) translate(-120 -118)">
<rect x="14" y="108" width="212" height="22" rx="11" fill="url(#${u}silver)" stroke="#7a8492" stroke-width="2"/>
<rect x="22" y="111" width="196" height="5" rx="2.5" fill="#fff" opacity=".75"/>
<path d="M22 124 H218" stroke="#5f6a79" stroke-width="2" opacity=".3"/>
<rect x="14" y="108" width="14" height="22" rx="7" fill="url(#${u}silver)" stroke="#7a8492" stroke-width="2"/>
<rect x="76" y="106" width="5" height="26" rx="2" fill="#b2bbc7"/><rect x="152" y="106" width="5" height="26" rx="2" fill="#b2bbc7"/>
<ellipse cx="52" cy="108" rx="9" ry="5" fill="#2a2f38"/><ellipse cx="52" cy="107" rx="9" ry="5" fill="none" stroke="#e8edf3" stroke-width="2"/>
<path d="M52 130 V140" stroke="#8791a0" stroke-width="2.4"/>
<path d="M60 117 H210" stroke="#a6afbc" stroke-width="2" opacity=".55"/>
${keys}
<rect x="214" y="109" width="8" height="20" rx="3" fill="#aab3c0"/>
</g>`;
}

function trumpet(u: string): string {
  return `${SHADOW(124, 206, 96)}
<g transform="translate(0 -4)">
<path d="M170 100 L226 56 Q238 112 226 168 L170 134Z" fill="url(#${u}brass)" stroke="#8a5a06" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M176 108 L218 76" stroke="#fff6c4" stroke-width="3" opacity=".75" stroke-linecap="round"/>
<ellipse cx="228" cy="112" rx="8" ry="56" fill="none" stroke="#fff3b0" stroke-width="3" opacity=".6"/>
<path d="M46 116 H176" stroke="#b9800d" stroke-width="12" stroke-linecap="round" fill="none"/>
<path d="M46 116 H176" stroke="url(#${u}brass)" stroke-width="9" stroke-linecap="round" fill="none"/>
<path d="M54 113 H172" stroke="#fff6c4" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>
<path d="M74 156 C48 158 40 188 70 190 H160 C176 190 176 156 160 156 H110" stroke="#b9800d" stroke-width="12" stroke-linecap="round" fill="none"/>
<path d="M74 156 C48 158 40 188 70 190 H160 C176 190 176 156 160 156 H110" stroke="url(#${u}brass)" stroke-width="9" stroke-linecap="round" fill="none"/>
<path d="M70 187 H158" stroke="#fff6c4" stroke-width="2" opacity=".7" stroke-linecap="round"/>
<path d="M176 136 C192 140 192 180 164 180" stroke="#b9800d" stroke-width="10" stroke-linecap="round" fill="none" opacity="0"/>
<path d="M30 122 L46 116 L46 126Z" fill="url(#${u}brass)" stroke="#8a5a06" stroke-width="2"/>
<rect x="14" y="108" width="20" height="16" rx="5" fill="url(#${u}silver)" stroke="#7a8492" stroke-width="2"/>
<rect x="8" y="109" width="9" height="14" rx="4" fill="url(#${u}silver)" stroke="#7a8492" stroke-width="2"/>
${[98, 118, 138]
  .map(
    (x) =>
      `<rect x="${x - 7}" y="84" width="14" height="86" rx="6" fill="url(#${u}brass)" stroke="#8a5a06" stroke-width="2"/><rect x="${x - 4}" y="88" width="3" height="76" rx="1.5" fill="#fff6c4" opacity=".75"/><rect x="${x - 3.5}" y="70" width="7" height="16" rx="2" fill="url(#${u}silver)" stroke="#7a8492" stroke-width="1.4"/><ellipse cx="${x}" cy="68" rx="9" ry="5.5" fill="#f4efe3" stroke="#8d8573" stroke-width="1.5"/><ellipse cx="${x - 2}" cy="66.5" rx="4" ry="1.8" fill="#fff" opacity=".9"/>`,
  )
  .join('')}
<path d="M72 116 V158" stroke="#b9800d" stroke-width="9" stroke-linecap="round"/><path d="M160 116 V156" stroke="#b9800d" stroke-width="9" stroke-linecap="round"/>
<path d="M72 116 V158 M160 116 V156" stroke="url(#${u}brass)" stroke-width="6" stroke-linecap="round"/>
</g>`;
}

function xylo(u: string): string {
  const colors = ['#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];
  let bars = '';
  const x0 = 26;
  const w = 22;
  const gap = 3.6;
  for (let i = 0; i < 8; i++) {
    const x = x0 + i * (w + gap);
    const h = 112 - i * 8.5;
    const y = 124 - h / 2;
    bars += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${colors[i]}" stroke="rgba(0,0,0,.28)" stroke-width="1.5"/>
<rect x="${x + 3}" y="${y + 4}" width="5" height="${h - 8}" rx="2.5" fill="#fff" opacity=".5"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#${u}shine)" opacity=".35"/>
<circle cx="${x + w / 2}" cy="${y + 9}" r="2.4" fill="#4a4a52"/><circle cx="${x + w / 2}" cy="${y + h - 9}" r="2.4" fill="#4a4a52"/>`;
  }
  return `${SHADOW(120, 214, 100)}
<path d="M14 70 L226 96 L226 106 L14 82Z" fill="url(#${u}woodv)" stroke="#6b3510" stroke-width="2"/>
<path d="M14 166 L226 140 L226 150 L14 178Z" fill="url(#${u}woodv)" stroke="#6b3510" stroke-width="2"/>
${grain(['M20 75 L220 100', 'M20 172 L220 146'], '#4a2208', 0.3)}
${bars}
<path d="M24 190 L54 224 M60 190 L30 224" stroke="#8f4d1d" stroke-width="0"/>
<g transform="rotate(-8 60 214)"><path d="M30 224 L96 160" stroke="#d9a35e" stroke-width="5" stroke-linecap="round"/><circle cx="102" cy="154" r="9" fill="#ef4444" stroke="#9b1c1c" stroke-width="1.5"/><circle cx="99" cy="151" r="3" fill="#fff" opacity=".6"/></g>
<g transform="rotate(8 190 214)"><path d="M210 224 L144 160" stroke="#d9a35e" stroke-width="5" stroke-linecap="round"/><circle cx="138" cy="154" r="9" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1.5"/><circle cx="135" cy="151" r="3" fill="#fff" opacity=".6"/></g>`;
}

function drum(u: string): string {
  const zig = Array.from({ length: 7 }, (_, i) => {
    const x = 55 + i * 20;
    return `<path d="M${x} 112 L${x + 10} 190 L${x + 20} 112" fill="none" stroke="#f4e7c8" stroke-width="2.6" stroke-linejoin="round"/>`;
  }).join('');
  return `${SHADOW(120, 226, 92)}
<path d="M40 100 V176 Q40 210 120 210 Q200 210 200 176 V100Z" fill="url(#${u}red)" stroke="#5a0f0f" stroke-width="2.5"/>
<path d="M40 112 H200" stroke="#f4c542" stroke-width="3" opacity="0"/>
${zig}
<path d="M46 108 V176 Q50 200 70 204" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="5" stroke-linecap="round"/>
<path d="M36 176 Q36 214 120 214 Q204 214 204 176" fill="none" stroke="url(#${u}silver)" stroke-width="7"/>
<ellipse cx="120" cy="100" rx="84" ry="28" fill="url(#${u}silver)" stroke="#7a8492" stroke-width="2"/>
<ellipse cx="120" cy="100" rx="76" ry="23" fill="url(#${u}skin)" stroke="#b8ab8a" stroke-width="1.5"/>
<ellipse cx="104" cy="94" rx="40" ry="8" fill="#fff" opacity=".7" transform="rotate(-6 104 94)"/>
${Array.from({ length: 10 }, (_, i) => `<circle cx="${120 + Math.cos((i / 10) * 6.283) * 80}" cy="${100 + Math.sin((i / 10) * 6.283) * 26}" r="2.6" fill="#5f6a79"/>`).join('')}
<g transform="rotate(-16 70 66)"><path d="M36 64 L110 40" stroke="#e7b76d" stroke-width="6" stroke-linecap="round"/><circle cx="114" cy="38.5" r="6.5" fill="#f1c984" stroke="#a06a2a" stroke-width="1.5"/></g>
<g transform="rotate(16 170 66)"><path d="M204 64 L130 40" stroke="#e7b76d" stroke-width="6" stroke-linecap="round"/><circle cx="126" cy="38.5" r="6.5" fill="#f1c984" stroke="#a06a2a" stroke-width="1.5"/></g>`;
}

function harp(u: string): string {
  const n = 13;
  let strings = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    // Neck: quadratic Bezier P0(54,62) P1(110,6) P2(190,40); soundboard: line from S0(64,112) to S1(176,196).
    const tx = (1 - t) * (1 - t) * 54 + 2 * (1 - t) * t * 110 + t * t * 190;
    const ty = (1 - t) * (1 - t) * 62 + 2 * (1 - t) * t * 6 + t * t * 40;
    const bx = 64 + (176 - 64) * t;
    const by = 116 + (196 - 116) * t;
    const c = i % 7 === 0 ? '#e0455a' : i % 7 === 3 ? '#27272f' : '#f6efd6';
    strings += `<path d="M${tx.toFixed(1)} ${(ty + 4).toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/>`;
  }
  return `${SHADOW(124, 226, 70)}
<path d="M52 66 C62 112 90 176 108 224 L190 224 L190 204 C134 188 100 130 70 58Z" fill="url(#${u}woodv)" stroke="#6b3510" stroke-width="2.5" stroke-linejoin="round"/>
${grain(['M60 80 C76 128 100 180 118 222', 'M70 84 C86 130 108 176 130 214', 'M82 70 C96 124 118 168 150 204'], '#4a2208', 0.3)}
<path d="M86 160 C100 180 110 200 114 220 L140 220 C128 200 116 178 100 158Z" fill="#000" opacity=".08"/>
<path d="M54 62 Q110 6 190 40" stroke="#6b3510" stroke-width="17" stroke-linecap="round" fill="none"/>
<path d="M54 62 Q110 6 190 40" stroke="url(#${u}woodv)" stroke-width="13" stroke-linecap="round" fill="none"/>
<path d="M58 56 Q110 3 186 34" stroke="#ffe0a8" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".65"/>
<rect x="180" y="34" width="16" height="190" rx="5" fill="url(#${u}woodv)" stroke="#6b3510" stroke-width="2.5"/>
<rect x="184" y="44" width="3.4" height="170" rx="1.7" fill="#fff" opacity=".3"/>
${[52, 214].map((y) => `<rect x="177" y="${y}" width="22" height="8" rx="3" fill="url(#${u}brass)" stroke="#8a5a06" stroke-width="1.5"/>`).join('')}
<rect x="96" y="222" width="104" height="12" rx="4" fill="url(#${u}dark)"/>
${strings}`;
}

const DRAW: Record<InstId, (u: string) => string> = { piano, guitar, violin, flute, trumpet, xylo, drum, harp };

/** The inside of an instrument's `<svg>`: defs + drawing. */
export function instrumentInner(id: InstId, u: string): string {
  return defs(u) + DRAW[id](u);
}

/** A standalone `<svg>` of the instrument. `u` must be unique on the page. */
export function instrumentSvg(id: InstId, u: string, cls = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" class="${cls}" aria-hidden="true" focusable="false">${instrumentInner(id, u)}</svg>`;
}

export interface BearLook {
  fur: string;
  furDark: string;
  belly: string;
  scarf: string;
}

export const BEAR_LOOKS: readonly BearLook[] = [
  { fur: '#b97a45', furDark: '#8a5528', belly: '#e9c9a0', scarf: '#ef4444' },
  { fur: '#f1e6d4', furDark: '#c9b99d', belly: '#fffaf0', scarf: '#3b82f6' },
  { fur: '#e8913a', furDark: '#b8651a', belly: '#fbd9a6', scarf: '#22c55e' },
  { fur: '#9aa3b5', furDark: '#6b7488', belly: '#dde2ec', scarf: '#f59e0b' },
];

/**
 * A round little bear seen from the front, in a 0 0 240 240 box, sitting behind the instrument.
 * `asleep` closes the eyes (a band player switched off). Ears and head are their own groups so
 * the stylesheet can bob them. `arms: false` leaves the sides bare, for a scene that draws its own arms.
 */
export function bearInner(look: BearLook, asleep = false, arms = true): string {
  const eye = (cx: number): string =>
    asleep
      ? `<path d="M${cx - 7} 70 Q${cx} 77 ${cx + 7} 70" stroke="#2a1a10" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="${cx}" cy="70" rx="5.4" ry="6.6" fill="#2a1a10"/><circle cx="${cx + 1.8}" cy="67.6" r="2" fill="#fff"/>`;
  return `<g class="bear-body">
<ellipse cx="120" cy="170" rx="62" ry="66" fill="${look.fur}"/>
<ellipse cx="120" cy="178" rx="40" ry="48" fill="${look.belly}"/>
${arms ? `<ellipse cx="68" cy="126" rx="20" ry="30" fill="${look.fur}" transform="rotate(24 68 126)"/>
<ellipse cx="172" cy="126" rx="20" ry="30" fill="${look.fur}" transform="rotate(-24 172 126)"/>` : ''}
<ellipse cx="88" cy="226" rx="26" ry="14" fill="${look.furDark}"/><ellipse cx="152" cy="226" rx="26" ry="14" fill="${look.furDark}"/>
</g>
<g class="bear-head">
<circle cx="76" cy="34" r="20" fill="${look.fur}"/><circle cx="76" cy="36" r="11" fill="${look.belly}"/>
<circle cx="164" cy="34" r="20" fill="${look.fur}"/><circle cx="164" cy="36" r="11" fill="${look.belly}"/>
<ellipse cx="120" cy="72" rx="56" ry="50" fill="${look.fur}"/>
<ellipse cx="120" cy="86" rx="25" ry="19" fill="${look.belly}"/>
<ellipse cx="120" cy="78" rx="8.5" ry="6" fill="#2a1a10"/><ellipse cx="117.8" cy="76.4" rx="2.6" ry="1.7" fill="#fff" opacity=".6"/>
<path d="M120 84 V90 M120 90 Q112 98 105 92 M120 90 Q128 98 135 92" stroke="#2a1a10" stroke-width="2.6" fill="none" stroke-linecap="round"/>
${eye(96)}${eye(144)}
<ellipse cx="80" cy="88" rx="9" ry="6" fill="#f87171" opacity=".4"/><ellipse cx="160" cy="88" rx="9" ry="6" fill="#f87171" opacity=".4"/>
</g>
<path d="M74 112 Q120 132 166 112 L162 126 Q120 144 78 126Z" fill="${look.scarf}"/>`;
}
