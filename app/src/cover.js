// Golden Hour Cover Studio — the cover engine.
// Draws multi-panel poster covers onto a 2D canvas: panel layouts, gradient-map
// sunset/neon grades, Anton display lettering with a sunset gradient fill and ink
// outline, Pacifico script subtitle, halftone title block, grain and vignette.
// Everything is drawn locally; no network, no external assets.

export const INK = '#14081f';
export const PANEL = '#1e0b2e';
export const PINK = '#ff2e88';
export const ORANGE = '#ff7a18';
export const GOLD = '#ffc93c';
export const TEAL = '#19e3d6';
export const PAPER = '#fff6ec';

export const SIZES = {
  square: { id: 'square', label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  portrait: { id: 'portrait', label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  wide: { id: 'wide', label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
};

export const LAYOUTS = [
  { id: 'hero', name: 'Hero + Three', panels: 4 },
  { id: 'grid', name: 'Four Panel Grid', panels: 4 },
  { id: 'mosaic', name: 'Nine Panel Mosaic', panels: 9 },
  { id: 'full', name: 'Full Bleed', panels: 1 },
  { id: 'tilted', name: 'Tilted Snapshots', panels: 3 },
  { id: 'diagonal', name: 'Diagonal Split', panels: 2 },
];

// Each grade is a gradient map: luminance 0..1 walks these stops (dark to light).
export const GRADES = [
  {
    id: 'vice', name: 'Vice Sunset',
    stops: [[0, 26, 6, 46], [0.25, 90, 16, 90], [0.55, 255, 46, 136], [0.8, 255, 122, 24], [1, 255, 201, 60]],
  },
  {
    id: 'neon', name: 'Neon Nights',
    stops: [[0, 8, 6, 32], [0.3, 60, 10, 110], [0.6, 255, 46, 136], [0.85, 25, 227, 214], [1, 255, 246, 236]],
  },
  {
    id: 'hotpink', name: 'Hot Pink',
    stops: [[0, 30, 4, 40], [0.35, 140, 10, 90], [0.65, 255, 46, 136], [0.9, 255, 150, 200], [1, 255, 246, 236]],
  },
  {
    id: 'teal', name: 'Teal Noir',
    stops: [[0, 6, 14, 20], [0.3, 10, 50, 66], [0.6, 16, 140, 130], [0.85, 25, 227, 214], [1, 220, 255, 245]],
  },
  {
    id: 'golden', name: 'Golden Hour',
    stops: [[0, 32, 14, 8], [0.3, 110, 50, 20], [0.6, 255, 122, 24], [0.85, 255, 190, 60], [1, 255, 246, 236]],
  },
  {
    id: 'mono', name: 'Mono Noir',
    stops: [[0, 10, 8, 16], [0.35, 60, 52, 70], [0.7, 160, 150, 165], [1, 255, 246, 236]],
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

/** A fresh editor state. Photos live in `photos`; panels point at them by id. */
export function createDefaultState() {
  return {
    title: 'Neon Shores',
    subtitle: 'chase the golden hour',
    layout: 'hero',
    grade: 'vice',
    size: 'portrait',
    photos: [],
    panelPhoto: [null, null, null, null, null, null, null, null, null],
    panelZoom: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    panelPan: [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
    ],
    heat: 4,
    sun: true,
    badge: true,
    badgeText: 'New',
    grain: true,
  };
}

/** Panel rectangles for a layout inside the photo area (x, y, w, h in px). */
export function layoutPanels(layoutId, x, y, w, h) {
  const gap = Math.max(4, Math.round(Math.min(w, h) * 0.012));
  const g = gap;
  switch (layoutId) {
    case 'grid': {
      const cw = (w - g) / 2;
      const ch = (h - g) / 2;
      return [
        { x, y, w: cw, h: ch },
        { x: x + cw + g, y, w: cw, h: ch },
        { x, y: y + ch + g, w: cw, h: ch },
        { x: x + cw + g, y: y + ch + g, w: cw, h: ch },
      ];
    }
    case 'mosaic': {
      const cw = (w - 2 * g) / 3;
      const ch = (h - 2 * g) / 3;
      const out = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          out.push({ x: x + c * (cw + g), y: y + r * (ch + g), w: cw, h: ch });
        }
      }
      return out;
    }
    case 'full':
      return [{ x, y, w, h }];
    case 'tilted': {
      const cw = w * 0.62;
      const ch = h * 0.58;
      return [
        { x: x + w * 0.03, y: y + h * 0.02, w: cw, h: ch, rot: -4 },
        { x: x + w * 0.35, y: y + h * 0.18, w: cw, h: ch, rot: 3 },
        { x: x + w * 0.08, y: y + h * 0.4, w: cw, h: ch * 0.92, rot: -2 },
      ];
    }
    case 'diagonal':
      return [
        { x, y, w, h, clip: 'top' },
        { x, y, w, h, clip: 'bottom' },
      ];
    case 'hero':
    default: {
      const heroW = w * 0.6;
      const sideW = w - heroW - g;
      const sideH = (h - 2 * g) / 3;
      return [
        { x, y, w: heroW, h },
        { x: x + heroW + g, y, w: sideW, h: sideH },
        { x: x + heroW + g, y: y + sideH + g, w: sideW, h: sideH },
        { x: x + heroW + g, y: y + 2 * (sideH + g), w: sideW, h: sideH },
      ];
    }
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpStops(stops, t) {
  if (t <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, ...c0] = stops[i - 1];
      const [t1, ...c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f));
    }
  }
  return stops[stops.length - 1].slice(1);
}

// Look-up table per grade so the per-pixel map stays cheap.
const lutCache = new Map();
function gradeLut(grade) {
  if (lutCache.has(grade.id)) return lutCache.get(grade.id);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = lerpStops(grade.stops, i / 255);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  lutCache.set(grade.id, lut);
  return lut;
}

// Graded copies of photos, keyed so dragging a panel does not re-grade it.
const gradedCache = new Map();
function gradedPhoto(photo, grade, pw, ph) {
  const key = `${photo.id}|${grade.id}|${pw}x${ph}`;
  const hit = gradedCache.get(key);
  if (hit) return hit;
  if (gradedCache.size > 32) gradedCache.clear();
  const off = document.createElement('canvas');
  off.width = Math.max(2, pw);
  off.height = Math.max(2, ph);
  const octx = off.getContext('2d');
  const scale = Math.max(pw / photo.img.naturalWidth, ph / photo.img.naturalHeight);
  const dw = photo.img.naturalWidth * scale;
  const dh = photo.img.naturalHeight * scale;
  octx.drawImage(photo.img, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
  const data = octx.getImageData(0, 0, off.width, off.height);
  const px = data.data;
  const lut = gradeLut(grade);
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    const base = lum * 3;
    // Blend the map at 82% so a little of the photo's own colour survives.
    px[i] = Math.round(px[i] * 0.18 + lut[base] * 0.82);
    px[i + 1] = Math.round(px[i + 1] * 0.18 + lut[base + 1] * 0.82);
    px[i + 2] = Math.round(px[i + 2] * 0.18 + lut[base + 2] * 0.82);
  }
  octx.putImageData(data, 0, 0);
  gradedCache.set(key, off);
  return off;
}

function drawPlaceholder(ctx, rect, grade, seed) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  grad.addColorStop(0, `rgb(${grade.stops[1].slice(1).join(',')})`);
  grad.addColorStop(0.55, `rgb(${grade.stops[2].slice(1).join(',')})`);
  grad.addColorStop(1, `rgb(${grade.stops[3].slice(1).join(',')})`);
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // A small sun disc so an empty panel still reads as sunset art.
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.42;
  const r = Math.min(rect.w, rect.h) * 0.22;
  const sun = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  sun.addColorStop(0, GOLD);
  sun.addColorStop(1, 'rgba(255,46,136,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  void seed;
}

function coverFitDraw(ctx, img, rect, zoom, pan) {
  const scale = Math.max(rect.w / img.width, rect.h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = rect.x + (rect.w - dw) / 2 + pan.x * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + pan.y * rect.h;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawHalftone(ctx, x, y, w, h, color, maxR) {
  const step = Math.max(10, maxR * 2.4);
  ctx.fillStyle = color;
  for (let row = 0; row * step < h; row++) {
    for (let col = 0; col * step < w; col++) {
      const px = x + col * step + (row % 2 ? step / 2 : 0);
      const py = y + row * step;
      const fade = 1 - row * step / h;
      const r = Math.max(0.6, maxR * fade);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawGrain(ctx, w, h, seed) {
  const rand = mulberry32(seed);
  const count = Math.floor((w * h) / 900);
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < count; i++) {
    const v = rand() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rand() * w, rand() * h, 1.4, 1.4);
  }
  ctx.restore();
}

function drawVignette(ctx, w, h) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
  grad.addColorStop(0, 'rgba(20,8,31,0)');
  grad.addColorStop(1, 'rgba(20,8,31,0.38)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function fitAnton(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, sans-serif`;
  while (size > 16 && ctx.measureText(text).width > maxWidth) {
    size = Math.floor(size * 0.94);
    ctx.font = `${size}px Anton, sans-serif`;
  }
  return size;
}

function drawStar(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = GOLD;
    ctx.fill();
  } else {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.stroke();
  }
}

/** Draws the whole cover for `state` onto `ctx` at pixel size w x h. */
export function drawCover(ctx, state, w, h) {
  const grade = gradeById(state.grade);
  const layout = layoutById(state.layout);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  const margin = Math.round(Math.min(w, h) * 0.028);
  const titleH = state.layout === 'full' ? 0 : Math.round(h * 0.24);
  const photoArea = state.layout === 'full'
    ? { x: 0, y: 0, w, h }
    : { x: margin, y: margin, w: w - margin * 2, h: h - titleH - margin * 2 };
  const panels = layoutPanels(state.layout, photoArea.x, photoArea.y, photoArea.w, photoArea.h);
  const frameW = Math.max(3, Math.round(Math.min(w, h) * 0.006));

  // Sun disc behind the panels, top right.
  if (state.sun && state.layout !== 'full') {
    const sx = w * 0.82;
    const sy = photoArea.y + photoArea.h * 0.16;
    const sr = Math.min(w, h) * 0.13;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.2);
    glow.addColorStop(0, 'rgba(255,201,60,0.85)');
    glow.addColorStop(0.4, 'rgba(255,122,24,0.35)');
    glow.addColorStop(1, 'rgba(255,46,136,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 2.2, 0, Math.PI * 2);
    ctx.fill();
    const disc = ctx.createLinearGradient(sx, sy - sr, sx, sy + sr);
    disc.addColorStop(0, GOLD);
    disc.addColorStop(1, ORANGE);
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Panels.
  panels.forEach((rect, i) => {
    const photoId = state.panelPhoto[i];
    const photo = photoId ? state.photos.find((p) => p.id === photoId) : null;
    const zoom = state.panelZoom[i] || 1;
    const pan = state.panelPan[i] || { x: 0, y: 0 };
    ctx.save();
    if (rect.clip === 'top' || rect.clip === 'bottom') {
      ctx.beginPath();
      if (rect.clip === 'top') {
        ctx.moveTo(rect.x, rect.y);
        ctx.lineTo(rect.x + rect.w, rect.y);
        ctx.lineTo(rect.x, rect.y + rect.h);
      } else {
        ctx.moveTo(rect.x + rect.w, rect.y + rect.h);
        ctx.lineTo(rect.x + rect.w, rect.y);
        ctx.lineTo(rect.x, rect.y + rect.h);
      }
      ctx.closePath();
      ctx.clip();
      const inner = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      if (photo) {
        const graded = gradedPhoto(photo, grade, Math.ceil(rect.w / 2), Math.ceil(rect.h / 2));
        coverFitDraw(ctx, graded, inner, zoom, pan);
      } else {
        drawPlaceholder(ctx, inner, grade, i + 1);
      }
    } else if (rect.rot) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rect.rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(6, Math.min(w, h) * 0.01));
      ctx.clip();
      if (photo) {
        const graded = gradedPhoto(photo, grade, Math.ceil(rect.w / 2), Math.ceil(rect.h / 2));
        coverFitDraw(ctx, graded, rect, zoom, pan);
      } else {
        drawPlaceholder(ctx, rect, grade, i + 1);
      }
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rect.rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(6, Math.min(w, h) * 0.01));
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = frameW;
      ctx.stroke();
      ctx.restore();
      ctx.restore();
      return;
    } else {
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(4, Math.min(w, h) * 0.008));
      ctx.clip();
      if (photo) {
        const graded = gradedPhoto(photo, grade, Math.ceil(rect.w / 2), Math.ceil(rect.h / 2));
        coverFitDraw(ctx, graded, rect, zoom, pan);
      } else {
        drawPlaceholder(ctx, rect, grade, i + 1);
      }
    }
    ctx.restore();
    // Paper frame around each panel.
    ctx.save();
    if (rect.clip) {
      ctx.beginPath();
      if (rect.clip === 'top') {
        ctx.moveTo(rect.x, rect.y);
        ctx.lineTo(rect.x + rect.w, rect.y);
        ctx.lineTo(rect.x, rect.y + rect.h);
      } else {
        ctx.moveTo(rect.x + rect.w, rect.y + rect.h);
        ctx.lineTo(rect.x + rect.w, rect.y);
        ctx.lineTo(rect.x, rect.y + rect.h);
      }
      ctx.closePath();
    } else {
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(4, Math.min(w, h) * 0.008));
    }
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = frameW;
    ctx.stroke();
    ctx.restore();
  });

  // Badge ribbon, top left corner.
  if (state.badge && state.badgeText.trim()) {
    const bw = Math.min(w * 0.34, 340);
    const bh = Math.max(22, Math.round(h * 0.032));
    ctx.save();
    ctx.translate(margin + bw * 0.28, margin + bh * 0.5);
    ctx.rotate(-0.06);
    ctx.fillStyle = PINK;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 2;
    ctx.strokeRect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6);
    ctx.fillStyle = PAPER;
    ctx.font = `${Math.round(bh * 0.52)}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.badgeText.trim().toUpperCase(), 0, 1);
    ctx.restore();
  }

  // Title block with halftone dots.
  const titleY = margin + photoArea.h;
  if (state.layout !== 'full') {
    ctx.fillStyle = INK;
    ctx.fillRect(0, titleY, w, titleH);
    drawHalftone(ctx, 0, titleY + titleH * 0.08, w, titleH * 0.5, PINK, Math.max(3, h * 0.004));
    const lineY = titleY + titleH * 0.52;
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = Math.max(2, h * 0.003);
    ctx.beginPath();
    ctx.moveTo(margin, lineY);
    ctx.lineTo(w - margin, lineY);
    ctx.stroke();
  } else {
    // Full bleed: a dark scrim rises from the bottom so the title stays readable.
    const scrim = ctx.createLinearGradient(0, h * 0.55, 0, h);
    scrim.addColorStop(0, 'rgba(20,8,31,0)');
    scrim.addColorStop(1, 'rgba(20,8,31,0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
  }

  // Title: Anton, sunset gradient fill, ink outline.
  const title = (state.title || '').trim().toUpperCase();
  if (title) {
    const baseY = state.layout === 'full' ? h * 0.86 : titleY + titleH * 0.42;
    const maxW = w - margin * 2;
    const startSize = Math.round(h * (state.layout === 'full' ? 0.11 : 0.13));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitAnton(ctx, title, maxW, startSize);
    const grad = ctx.createLinearGradient(0, baseY - size * 0.55, 0, baseY + size * 0.55);
    grad.addColorStop(0, GOLD);
    grad.addColorStop(0.5, ORANGE);
    grad.addColorStop(1, PINK);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeText(title, w / 2, baseY);
    ctx.fillStyle = grad;
    ctx.fillText(title, w / 2, baseY);
    ctx.lineWidth = Math.max(1, size * 0.015);
    ctx.strokeStyle = 'rgba(255,246,236,0.85)';
    ctx.strokeText(title, w / 2, baseY);
  }

  // Subtitle in Pacifico script.
  const sub = (state.subtitle || '').trim();
  if (sub) {
    const subY = state.layout === 'full' ? h * 0.95 : titleY + titleH * 0.78;
    let size = Math.round(h * 0.032);
    ctx.font = `${size}px Pacifico, cursive`;
    while (size > 12 && ctx.measureText(sub).width > w * 0.86) {
      size = Math.floor(size * 0.94);
      ctx.font = `${size}px Pacifico, cursive`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEAL;
    ctx.fillText(sub, w / 2, subY);
  }

  // Star heat meter, bottom right of the title block.
  const starR = Math.max(8, Math.round(h * 0.014));
  const starGap = starR * 2.3;
  const meterW = starGap * 5;
  const starY = state.layout === 'full' ? h * 0.06 : titleY + titleH * 0.82;
  const starX0 = w - margin - meterW + starR;
  for (let s = 0; s < 5; s++) {
    drawStar(ctx, starX0 + s * starGap, starY, starR, s < state.heat);
  }

  if (state.grain) drawGrain(ctx, w, h, 20261119);
  drawVignette(ctx, w, h);

  // Outer paper frame.
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = Math.max(3, Math.round(Math.min(w, h) * 0.005));
  ctx.strokeRect(
    ctx.lineWidth / 2, ctx.lineWidth / 2,
    w - ctx.lineWidth, h - ctx.lineWidth,
  );
  ctx.restore();
}

/** Renders the cover at w x h and returns the canvas. */
export function renderCover(state, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawCover(canvas.getContext('2d'), state, w, h);
  return canvas;
}
