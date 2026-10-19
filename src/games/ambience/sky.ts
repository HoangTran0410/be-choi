/** The sky and the land: gradient or photograph, sun, moon and stars, clouds, hills, the tree. */
import { SKIES, mix, rgb } from './scene-data';
import type { Ctx } from './context';

export function drawSky(c: Ctx): void {
  const { g, W, H, sky } = c;
  if (!g) return;
  let top = SKIES.day[0];
  let bot = SKIES.day[1];
  for (const k of ['dawn', 'winter', 'storm', 'night', 'space', 'deep'] as const) {
    top = mix(top, SKIES[k][0], sky[k]);
    bot = mix(bot, SKIES[k][1], sky[k]);
  }
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgb(top));
  grad.addColorStop(1, rgb(bot));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

/**
 * The photograph, cropped to fill, and tinted by the sky the sounds ask for:
 * the owl still brings the night, even over a sunny beach.
 */
export function drawPhoto(c: Ctx, dt: number): void {
  const { g, W, H, sky } = c;
  if (!g || !c.photo) return;
  c.photoIn = Math.min(1, c.photoIn + dt * 2);
  const k = Math.max(W / c.photo.naturalWidth, H / c.photo.naturalHeight);
  const w = c.photo.naturalWidth * k;
  const h = c.photo.naturalHeight * k;
  g.globalAlpha = c.photoIn;
  g.drawImage(c.photo, (W - w) / 2, (H - h) / 2, w, h);
  g.globalAlpha = 1;
  for (const [s, color, a] of [
    ['dawn', '244,114,182', 0.22],
    ['storm', '51,65,85', 0.45],
    ['night', '11,16,38', 0.6],
    ['deep', '14,116,144', 0.5],
    ['space', '10,6,30', 0.65],
    ['winter', '203,213,225', 0.3],
  ] as const) {
    if (sky[s] < 0.01) continue;
    g.fillStyle = `rgba(${color},${sky[s] * a})`;
    g.fillRect(0, 0, W, H);
  }
}

export function drawHeavens(c: Ctx): void {
  const { g, W, H, time, sky, L, U, glow, stars } = c;
  if (!g) return;
  const dark = Math.max(sky.night, L('sleep'), sky.space);
  const day = (1 - sky.night) * (1 - sky.storm) * (1 - sky.deep) * (1 - sky.space) * (1 - sky.winter * 0.6);
  // Stars twinkle in
  if (dark > 0.01) {
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.t);
      g.fillStyle = `rgba(255,255,240,${dark * (0.3 + 0.7 * tw) * (1 - sky.deep)})`;
      g.beginPath();
      g.arc(s.x * W, s.y * H, 0.7 + tw * 1.2, 0, Math.PI * 2);
      g.fill();
    }
    // Moon
    const mx = W * 0.82;
    const my = H * 0.16;
    const mr = U() * 0.07;
    const moon = dark * (1 - sky.deep) * (1 - sky.space);
    const halo = glow('254,249,195');
    if (halo && moon > 0.01) {
      // The halo a shadowBlur used to make, at a fraction of the cost.
      g.globalAlpha = moon * 0.5;
      g.drawImage(halo, mx - mr * 2.2, my - mr * 2.2, mr * 4.4, mr * 4.4);
      g.globalAlpha = 1;
    }
    g.fillStyle = `rgba(254,249,195,${moon})`;
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
  }
  // Sun: high at noon, low and huge with rays at dawn. A photograph has its own light.
  if (day > 0.01 && !c.photo) {
    const dawn = sky.dawn;
    const sx = W * (0.8 - dawn * 0.55);
    const sy = H * (0.15 + dawn * 0.45);
    const sr = U() * (0.07 + dawn * 0.05);
    g.save();
    g.globalAlpha = day * (1 - dark);
    g.translate(sx, sy);
    g.rotate(time * 0.15);
    g.fillStyle = dawn > 0.2 ? 'rgba(251,146,60,0.35)' : 'rgba(253,224,71,0.35)';
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath();
      g.moveTo(sr * 1.15, -sr * 0.12);
      g.lineTo(sr * (1.7 + dawn * 0.8), 0);
      g.lineTo(sr * 1.15, sr * 0.12);
      g.fill();
    }
    g.fillStyle = dawn > 0.2 ? '#fb923c' : '#fde047';
    g.beginPath();
    g.arc(0, 0, sr, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

export function drawClouds(c: Ctx, dt: number): void {
  const { g, W, H, sky, L, U, wind, clouds } = c;
  if (!g) return;
  const rainy = Math.max(L('rain'), L('heavy-rain'), L('thunder'));
  const shown = 3 + Math.round(rainy * 4);
  const dark = mix([255, 255, 255], [100, 116, 139], Math.max(sky.storm, rainy * 0.5));
  // Over a photograph clouds only come with the rain; its own sky is sky enough.
  const alpha = (1 - sky.deep) * (1 - sky.space) * (0.85 - sky.night * 0.5) * (c.photo ? rainy : 1);
  clouds.forEach((c, i) => {
    c.x += (c.v + wind() * 0.05) * dt;
    if (c.x > 1.25) c.x = -0.25;
    if (i >= shown) return;
    const x = c.x * W;
    const y = c.y * H;
    const r = U() * 0.06 * c.s * (1 + rainy * 0.4);
    g.fillStyle = rgb(dark, alpha);
    for (const [dx, dy, k] of [
      [0, 0, 1],
      [r * 0.9, r * 0.15, 0.8],
      [-r * 0.9, r * 0.2, 0.75],
      [r * 0.35, -r * 0.45, 0.8],
    ] as const) {
      g.beginPath();
      g.arc(x + dx, y + dy, r * k, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function drawHills(c: Ctx): void {
  const { g, W, H, time, sky, L, U, groundY, wind, drawEmoji, traveller, across } = c;
  if (!g) return;
  const gy = groundY();
  const night = Math.max(sky.night, L('sleep') * 0.6);
  const lush = L('countryside');
  // Snow settles white on the hills; in space the ground is the grey of the moon.
  const far = mix(
    mix(mix(mix([134, 239, 172], [74, 222, 128], lush), [20, 83, 45], night * 0.8), [241, 245, 249], L('snow') * 0.85),
    [100, 96, 120],
    sky.space,
  );
  const near = mix(
    mix(mix(mix([74, 222, 128], [34, 197, 94], lush), [22, 101, 52], night * 0.8), [226, 232, 240], L('snow') * 0.85),
    [130, 124, 150],
    sky.space,
  );
  g.fillStyle = rgb(far);
  g.beginPath();
  g.moveTo(0, gy);
  for (const x of across(20)) g.lineTo(x, gy - Math.sin((x / W) * Math.PI * 2 + 1) * H * 0.04 - H * 0.02);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  g.fillStyle = rgb(near);
  g.beginPath();
  g.moveTo(0, gy + H * 0.06);
  for (const x of across(20)) g.lineTo(x, gy + H * 0.06 - Math.sin((x / W) * Math.PI * 3) * H * 0.025);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  // The fields of the countryside: stripes and swaying wheat.
  if (lush > 0.01) {
    g.globalAlpha = lush;
    for (let i = 0; i < 16; i++) {
      const x = (i + 0.5) * (W / 16);
      const sway = Math.sin(time * 2 + i) * (4 + wind() * 10);
      drawEmoji('🌾', x + sway, gy + H * 0.09 + (i % 2) * H * 0.03, U() * 0.07, { rot: sway * 0.02 });
    }
    const cow = traveller('countryside', 1 / 60, 0.004, gy - H * 0.01);
    drawEmoji('🐄', cow.x, cow.y, U() * 0.07, { flip: cow.dir > 0 });
    g.globalAlpha = 1;
  }
}

export function drawTree(c: Ctx): void {
  const { g, W, H, time, sky, L, U, groundY, wind, drawEmoji } = c;
  if (!g) return;
  const gy = groundY();
  const sway = Math.sin(time * 1.3) * (0.02 + wind() * 0.12);
  const jungle = L('jungle');
  const x = W * 0.08;
  drawEmoji(jungle > 0.5 ? '🌴' : '🌳', x, gy - U() * 0.08, U() * 0.22, { rot: sway });
  if (jungle > 0.01) {
    g.globalAlpha = jungle;
    drawEmoji('🌴', W * 0.95, gy - U() * 0.06, U() * 0.2, { rot: -sway });
    drawEmoji('🌿', W * 0.25, gy + H * 0.05, U() * 0.12, { rot: sway });
    drawEmoji('🌿', W * 0.7, gy + H * 0.07, U() * 0.14, { rot: -sway, flip: true });
    // Eyes in the dark, blinking.
    for (const [ex, ey, k] of [
      [0.3, 0.74, 0],
      [0.62, 0.78, 2],
      [0.86, 0.72, 4],
    ] as const) {
      const open = Math.sin(time * 0.8 + k) > -0.8 ? 1 : 0.15;
      g.fillStyle = `rgba(253,224,71,${jungle * sky.night})`;
      for (const d of [-1, 1]) {
        g.beginPath();
        g.ellipse(ex * W + d * U() * 0.012, ey * H, U() * 0.007, U() * 0.007 * open, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}
