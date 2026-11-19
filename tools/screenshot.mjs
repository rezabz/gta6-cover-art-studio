// Captures the four screenshots listed in shots.json with Playwright + Chromium.
// Serves app/ on port 8901, loads each ?shot= scene, waits for window.__shotReady,
// then saves a JPEG at the scene's viewport size, stepping the quality down until
// the file fits the gate (<= 256 KiB, long side <= 1280, short side >= 480).
// Run from the repo root:  node tools/screenshot.mjs
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/make-fun/ui-tools/node_modules/playwright/index.mjs';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const entryRoot = join(root, '..');
const shots = JSON.parse(readFileSync(join(entryRoot, 'shots.json'), 'utf8'));
const outDir = join(entryRoot, 'screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = 8901;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(200);
  }
  throw new Error('serve.ts did not come up on port 8901');
}

// Reads width/height out of a JPEG buffer (SOF0/SOF2 marker).
function jpegDims(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker found in JPEG');
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
  cwd: entryRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(`[serve] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));

let failures = 0;
try {
  await waitForServer();
  const browser = await chromium.launch();
  try {
    for (const scene of shots) {
      const page = await browser.newPage({ viewport: { width: scene.w, height: scene.h } });
      const external = [];
      page.on('request', (req) => {
        const url = req.url();
        if (!url.startsWith('http://127.0.0.1:8901') && !url.startsWith('http://localhost:8901')) {
          external.push(url);
        }
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html${scene.query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
      const target = join(outDir, scene.name);
      let quality = 85;
      let buf;
      for (;;) {
        buf = await page.screenshot({ type: 'jpeg', quality });
        if (buf.length <= 262144 || quality <= 50) break;
        quality -= 10;
      }
      writeFileSync(target, buf);
      const dims = jpegDims(buf);
      const longSide = Math.max(dims.w, dims.h);
      const shortSide = Math.min(dims.w, dims.h);
      const ok = buf.length <= 262144 && longSide <= 1280 && shortSide >= 480;
      console.log(
        `${scene.name}: ${dims.w}x${dims.h}, ${buf.length} bytes, quality ${quality}, ` +
        `external requests: ${external.length}${ok ? '' : '  <-- FAILS GATE'}`,
      );
      if (!ok || external.length) failures++;
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

if (failures) {
  console.error(`${failures} scene(s) failed the gate.`);
  process.exit(1);
}
console.log('All 4 screenshots pass the gate.');
