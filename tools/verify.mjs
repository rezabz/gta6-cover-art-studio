// Full Playwright verification for Golden Hour Cover Studio (repo only).
// Serves app/ on port 8902 and drives the real editor in Chromium at 1280x900:
//   - samples load, every layout and every grade renders (canvas pixels change)
//   - drag-pan and zoom change the selected panel, caption edit + undo/redo work
//   - Export all 3 sizes downloads valid PNGs at the exact pixel dimensions
//   - a second run with ALL non-local requests aborted: zero external requests,
//     app still fully works
// Run from the repo root:  node tools/verify.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/make-fun/ui-tools/node_modules/playwright/index.mjs';

const entryRoot = dirname(fileURLToPath(new URL('.', import.meta.url)));
const PORT = 8902;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const DOWNLOADS = '/tmp/gta6-verify-downloads';
mkdirSync(DOWNLOADS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('serve.ts did not come up on port 8902');
}

// PNG width/height from the IHDR chunk.
function pngDims(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: entryRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));

let failed = 0;
try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- Run 1: normal network, full interaction test ---------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('request', (req) => requests.push(req.url()));
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__studio && window.__studio.state.photos.length === 2, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    check('editor loads, 2 sample photos auto-loaded', true);

    // A hash of the whole canvas PNG: the first bytes of a PNG are the header
    // plus near-identical dark top rows, so a prefix comparison cannot tell
    // two covers apart.
    const canvasShot = () => page.evaluate(() => {
      const url = document.getElementById('cover').toDataURL('image/png');
      let h1 = 0;
      let h2 = 0;
      for (let i = 0; i < url.length; i++) {
        h1 = (h1 * 31 + url.charCodeAt(i)) >>> 0;
        h2 = (h2 + url.charCodeAt(i) * (i % 97 + 1)) >>> 0;
      }
      return `${h1}-${h2}-${url.length}`;
    });
    const baseline = await canvasShot();
    const baselineBytes = Number(baseline.split('-')[2]);
    check('cover paints (non-blank canvas)', baselineBytes > 100000, `${baselineBytes} PNG bytes`);

    // All 6 layouts render and change the cover. (The first click is the
    // already-active layout, a deliberate no-op, so it is not compared.)
    const layouts = ['hero', 'grid', 'mosaic', 'full', 'tilted', 'diagonal'];
    let last = null;
    let layoutsOk = true;
    for (const id of layouts) {
      await page.click(`#layouts button[data-id="${id}"]`);
      await page.waitForTimeout(350);
      const shot = await canvasShot();
      const stateLayout = await page.evaluate(() => window.__studio.state.layout);
      if (stateLayout !== id || (last !== null && shot === last)) layoutsOk = false;
      last = shot;
    }
    check('all 6 layouts switch and repaint', layoutsOk, layouts.join(', '));

    // All 6 grades render and change the cover (same no-op first click).
    const grades = ['vice', 'neon', 'hotpink', 'teal', 'golden', 'mono'];
    let gradesOk = true;
    last = null;
    for (const id of grades) {
      await page.click(`#grades button[data-id="${id}"]`);
      await page.waitForTimeout(350);
      const shot = await canvasShot();
      const stateGrade = await page.evaluate(() => window.__studio.state.grade);
      if (stateGrade !== id || (last !== null && shot === last)) gradesOk = false;
      last = shot;
    }
    check('all 6 grades switch and repaint', gradesOk, grades.join(', '));

    // Back to hero + vice for the interaction checks.
    await page.click('#layouts button[data-id="hero"]');
    await page.click('#grades button[data-id="vice"]');
    await page.waitForTimeout(300);

    // Drag-pan the selected panel. The controls column is taller than the
    // viewport, so clicking through it scrolls the page: bring the canvas
    // back into view first or the drag point lands off-screen.
    await page.locator('#cover').scrollIntoViewIfNeeded();
    const panBefore = await page.evaluate(() => ({ ...window.__studio.state.panelPan[0] }));
    const box = await page.locator('#cover').boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3 + 60, box.y + box.height * 0.3 + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const panAfter = await page.evaluate(() => ({ ...window.__studio.state.panelPan[0] }));
    check('drag-pan moves the selected panel', panAfter.x !== panBefore.x || panAfter.y !== panBefore.y,
      `pan ${JSON.stringify(panBefore)} -> ${JSON.stringify(panAfter)}`);

    // Zoom slider.
    await page.evaluate(() => {
      const z = document.getElementById('zoom');
      z.value = '1.8';
      z.dispatchEvent(new Event('input', { bubbles: true }));
      z.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const zoom = await page.evaluate(() => window.__studio.state.panelZoom[0]);
    check('zoom slider resizes the panel photo', Math.abs(zoom - 1.8) < 0.01, `zoom=${zoom}`);

    // Caption edit, then undo / redo.
    await page.fill('#title', 'Sunset Run');
    await page.click('#subtitle');
    await page.waitForTimeout(200);
    const edited = await page.evaluate(() => window.__studio.state.title);
    await page.click('#undo');
    await page.waitForTimeout(200);
    const undone = await page.evaluate(() => window.__studio.state.title);
    await page.click('#redo');
    await page.waitForTimeout(200);
    const redone = await page.evaluate(() => window.__studio.state.title);
    check('caption edit + undo + redo', edited === 'Sunset Run' && undone === 'Neon Shores' && redone === 'Sunset Run',
      `edited=${edited} undone=${undone} redone=${redone}`);

    // Export all 3 sizes.
    const downloads = [];
    page.on('download', (dl) => downloads.push(dl));
    await page.click('#export-all');
    for (let i = 0; i < 30 && downloads.length < 3; i++) await sleep(500);
    check('export-all produces 3 downloads', downloads.length === 3, `got ${downloads.length}`);
    const expected = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };
    let dimsOk = downloads.length === 3;
    for (const dl of downloads) {
      const path = join(DOWNLOADS, dl.suggestedFilename());
      await dl.saveAs(path);
      const buf = readFileSync(path);
      const dims = pngDims(buf);
      const key = `${dims.w}x${dims.h}`;
      const want = expected[key];
      console.log(`  download ${dl.suggestedFilename()}: ${buf.length} bytes, ${dims.w}x${dims.h}`);
      if (!want || want[0] !== dims.w || want[1] !== dims.h) dimsOk = false;
    }
    check('exported PNGs are valid at exact pixel dims', dimsOk);

    const external = requests.filter((u) => !u.startsWith(`http://127.0.0.1:${PORT}`) && !u.startsWith('data:'));
    check('normal run: zero external requests', external.length === 0, `${requests.length} total, ${external.length} external`);
    check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // ---- Run 2: ALL network blocked except the local server ---------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let blocked = 0;
    let localOk = 0;
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(`http://127.0.0.1:${PORT}`) || url.startsWith('data:')) {
        localOk++;
        route.continue();
      } else {
        blocked++;
        route.abort();
      }
    });
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__studio && window.__studio.state.photos.length === 2, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    const painted = await page.evaluate(() => {
      const c = document.getElementById('cover');
      return c.toDataURL('image/png').length > 1000;
    });
    // Switch layout + grade under the block to prove the app still works.
    await page.click('#layouts button[data-id="mosaic"]');
    await page.click('#grades button[data-id="neon"]');
    await page.waitForTimeout(400);
    const stillPaints = await page.evaluate(() => document.getElementById('cover').toDataURL('image/png').length > 1000);
    check('network-blocked: zero external requests attempted', blocked === 0, `blocked=${blocked}, local=${localOk}`);
    check('network-blocked: app still loads photos and paints', painted && stillPaints);
    check('network-blocked: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  await browser.close();
} finally {
  server.kill();
}

failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll verification checks passed.');
process.exit(failed ? 1 : 0);
