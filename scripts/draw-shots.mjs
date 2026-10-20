// Deeper screenshots of "Xưởng vẽ của bé" (game id `draw`): every mode, the notebook, the
// exhibition and the sticker collection, drawn on with real pointer input. Called from
// screenshot.mjs for each viewport; also catches page overflow and JS errors.

/** A few made-up family photos and finished pictures, drawn on a canvas in the page itself. */
async function seed(page) {
  await page.evaluate(async () => {
    const make = (w, h, paint) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      paint(g, w, h);
      return c.toDataURL('image/jpeg', 0.85);
    };
    // "Mẹ": sky, sun, a house with a roof and a flowery garden — enough edges for the line-art filter.
    const photo = make(640, 480, (g, w, h) => {
      g.fillStyle = '#9ad1f5';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#6dbb5a';
      g.fillRect(0, h * 0.72, w, h * 0.28);
      g.fillStyle = '#ffd93b';
      g.beginPath();
      g.arc(w * 0.82, h * 0.2, 56, 0, 7);
      g.fill();
      g.fillStyle = '#e9c9a0';
      g.fillRect(w * 0.25, h * 0.42, w * 0.4, h * 0.34);
      g.fillStyle = '#c0392b';
      g.beginPath();
      g.moveTo(w * 0.21, h * 0.43);
      g.lineTo(w * 0.45, h * 0.18);
      g.lineTo(w * 0.69, h * 0.43);
      g.fill();
      g.fillStyle = '#5b3a29';
      g.fillRect(w * 0.41, h * 0.58, w * 0.08, h * 0.18);
      g.fillStyle = '#6ec6ff';
      g.fillRect(w * 0.3, h * 0.5, w * 0.07, h * 0.07);
      g.fillRect(w * 0.53, h * 0.5, w * 0.07, h * 0.07);
      for (const [x, y, col] of [[0.1, 0.85, '#ff5d8f'], [0.18, 0.9, '#ffb703'], [0.78, 0.86, '#ff5d8f'], [0.88, 0.92, '#b388eb']]) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(w * x, h * y, 16, 0, 7);
        g.fill();
      }
    });
    await new Promise((resolve) => {
      const req = indexedDB.open('be-choi', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('photos')) req.result.createObjectStore('photos', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const tx = req.result.transaction('photos', 'readwrite');
        tx.objectStore('photos').put({ id: 'pshot1', url: photo, createdAt: Date.now() });
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
      };
      req.onerror = () => resolve(undefined);
    });
    // Six finished pictures in the notebook, and 5 pictures made, so some things are already open.
    const works = [];
    const hues = [8, 40, 150, 200, 270, 330];
    hues.forEach((hue, i) => {
      const thumb = make(360, i % 2 ? 480 : 360, (g, w, h) => {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, w, h);
        g.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = `hsl(${(hue + k * 25) % 360} 85% 55%)`;
          g.lineWidth = 14 + k * 3;
          g.beginPath();
          g.moveTo(30 + k * 30, 40 + ((k * 53) % 90));
          g.bezierCurveTo(w * 0.3, h * 0.9, w * 0.7, h * 0.1, w - 30, h - 50 - k * 22);
          g.stroke();
        }
        g.font = '60px sans-serif';
        g.fillText(['🐶', '🌸', '🚗', '🐠', '🎈', '🌈'][i], w * 0.4, h * 0.5);
      });
      works.push({ id: `seed${i}`, mode: ['free', 'colour', 'practice', 'copy', 'free', 'colour'][i], at: Date.now() - (6 - i) * 60000, thumb, w: 360, h: i % 2 ? 480 : 360, title: ['bông hoa', 'ngôi nhà', 'ông mặt trời', 'con cá', '', 'quả táo'][i] });
    });
    localStorage.setItem('be-choi:draw', JSON.stringify({ v: 1, works, made: 5, wallpaper: null, collected: ['🐶', '🐱', '🐰', '🌸', '🌻', '🍎'], themesDone: [] }));
  });
}

async function stroke(page, pts, steps = 6) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    for (let s = 1; s <= steps; s++) await page.mouse.move(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
  }
  await page.mouse.up();
}

const paperBox = (page) => page.evaluate(() => {
  const r = (document.querySelector('.dr-paper') ?? document.querySelector('.dr-practice-paper'))?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
});

/** `shot(name)` saves a screenshot; `base` is the game URL. Adds to `problems` on overflow. */
export async function drawShots(page, base, vp, suffix, problems) {
  const shot = async (name) => {
    await page.waitForTimeout(450);
    const box = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }));
    if (box.sw > box.iw || box.sh > box.ih + 1) problems.push(`${vp.name}/draw-${name}: overflow ${JSON.stringify(box)}`);
    // Every button must be at least 72 px.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.dr-btn, .dr-tile, .dr-thumb, .dr-slot, .dr-door')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ c: el.className, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
        .filter((r) => r.w < 72 || r.h < 72),
    );
    if (small.length) problems.push(`${vp.name}/draw-${name}: small targets ${JSON.stringify(small.slice(0, 4))}`);
    await page.screenshot({ path: `screenshots/draw-${name}-${vp.name}${suffix}.png` });
  };
  const open = async () => {
    await page.goto(`${base}/#/g/draw`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  };
  const click = async (sel) => {
    await page.locator(sel).first().click();
    await page.waitForTimeout(250);
  };
  const back = async () => {
    await click('.dr-hub-btn');
  };

  // First visit: nothing earned, empty notebook.
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('be-choi:draw'));
  await open();
  await shot('hub-new');
  await click('.dr-door-book-tile');
  await shot('book-empty');
  await click('.dr-book-close');

  // Then a child who has finished a few pictures and has family photos.
  await seed(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot('hub');

  await click('.dr-door-practice');
  let b = await paperBox(page);
  await shot('practice');
  await click('.dr-way:nth-child(2)');
  await shot('practice-dots');
  await click('.dr-way:nth-child(3)');
  await page.mouse.move(b.x + b.w * 0.5, b.y + b.h * 0.5);
  await stroke(page, [[b.x + b.w * 0.4, b.y + b.h * 0.4], [b.x + b.w * 0.6, b.y + b.h * 0.5], [b.x + b.w * 0.45, b.y + b.h * 0.6]]);
  await shot('practice-colour');
  await back();

  await click('.dr-door-colour');
  b = await paperBox(page);
  await shot('colour-page');
  for (const [fx, fy, nth] of [[0.5, 0.52, 1], [0.5, 0.3, 3], [0.2, 0.2, 2]]) {
    await click(`.dr-color`);
    await page.locator('.dr-tile:not(.locked)').nth(nth).dispatchEvent('pointerdown');
    await page.locator('.dr-tile:not(.locked)').nth(nth).dispatchEvent('pointerup');
    await page.waitForTimeout(200);
    await page.mouse.click(b.x + b.w * fx, b.y + b.h * fy);
  }
  await shot('colour-filled');
  await click('.dr-pictures');
  await shot('colour-picker');
  // The family photo: its tile is first and carries a camera badge.
  await page.locator('.dr-tile').first().dispatchEvent('pointerdown');
  await page.locator('.dr-tile').first().dispatchEvent('pointerup');
  await page.waitForTimeout(2500);
  b = await paperBox(page);
  await shot('colour-photo-lines');
  await page.mouse.click(b.x + b.w * 0.45, b.y + b.h * 0.55);
  await page.mouse.click(b.x + b.w * 0.5, b.y + b.h * 0.1);
  await shot('colour-photo-filled');
  await back();

  await click('.dr-door-free');
  b = await paperBox(page);
  await click('.dr-brush');
  await shot('free-brushes');
  await page.locator('.dr-tile:not(.locked)').nth(2).dispatchEvent('pointerdown');
  await page.locator('.dr-tile:not(.locked)').nth(2).dispatchEvent('pointerup');
  await stroke(page, [[b.x + b.w * 0.1, b.y + b.h * 0.3], [b.x + b.w * 0.4, b.y + b.h * 0.1], [b.x + b.w * 0.7, b.y + b.h * 0.4], [b.x + b.w * 0.9, b.y + b.h * 0.2]], 10);
  await click('.dr-color');
  await shot('free-colours');
  await page.locator('.dr-tile:not(.locked)').nth(4).dispatchEvent('pointerdown');
  await page.locator('.dr-tile:not(.locked)').nth(4).dispatchEvent('pointerup');
  await click('.dr-brush');
  await page.locator('.dr-tile:not(.locked)').nth(1).dispatchEvent('pointerdown');
  await page.locator('.dr-tile:not(.locked)').nth(1).dispatchEvent('pointerup');
  await stroke(page, [[b.x + b.w * 0.15, b.y + b.h * 0.6], [b.x + b.w * 0.5, b.y + b.h * 0.8], [b.x + b.w * 0.85, b.y + b.h * 0.6]], 10);
  await click('.dr-stamp');
  await shot('free-stamps');
  await page.locator('.dr-tile:not(.locked)[data-id="🐶"]').dispatchEvent('pointerdown');
  await page.locator('.dr-tile:not(.locked)[data-id="🐶"]').dispatchEvent('pointerup');
  await page.mouse.click(b.x + b.w * 0.3, b.y + b.h * 0.5);
  await page.mouse.click(b.x + b.w * 0.7, b.y + b.h * 0.55);
  await shot('free');
  await click('.dr-done');
  await page.waitForTimeout(2600);
  await shot('free-saved');
  await back();

  await click('.dr-door-copy');
  b = await paperBox(page);
  await shot('copy-start');
  // trace the sun's circle and two rays with a steady hand
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.5;
  const r = b.w * 0.2;
  const ring = [];
  for (let i = 0; i <= 24; i++) ring.push([cx + r * Math.cos((i / 24) * Math.PI * 2 - Math.PI / 2), cy + r * Math.sin((i / 24) * Math.PI * 2 - Math.PI / 2)]);
  await stroke(page, ring, 2);
  await stroke(page, [[cx + b.w * 0.28, cy], [cx + b.w * 0.4, cy]], 4);
  await stroke(page, [[cx, cy - b.w * 0.28], [cx, cy - b.w * 0.4]], 4);
  await shot('copy-lit');
  await click('.dr-nb-btn');
  await shot('book');
  await click('.dr-thumb');
  await shot('book-page');
  await click('.dr-wall');
  await click('.dr-book-close');
  await click('.dr-book-close');
  await shot('copy-wallpaper');
  await back();
  await shot('hub-wallpaper');
  await click('.dr-door-book-tile');
  await click('.dr-expo-btn');
  await page.waitForTimeout(1600);
  await shot('expo');
  await click('.dr-expo .dr-book-close');
  await click('.dr-book-close');
  await click('.dr-door-collection');
  await shot('collection');
}
