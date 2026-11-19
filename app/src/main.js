// Golden Hour Cover Studio — editor wiring.
// Photos, panel selection, drag-pan and zoom, caption editing, layouts, grades,
// undo/redo, and PNG export in the three post sizes. Runs fully offline.
import {
  LAYOUTS, GRADES, SIZES, createDefaultState, layoutById,
  layoutPanels, gradeById, drawCover, renderCover,
} from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const panelNote = document.getElementById('panel-note');
const selectedNote = document.getElementById('selected-note');
const thumbsEl = document.getElementById('thumbs');

const state = createDefaultState();
let selectedPanel = 0;
let photoCounter = 0;

// ---- history (undo / redo) ---------------------------------------------

function snapshot() {
  return JSON.stringify({
    title: state.title,
    subtitle: state.subtitle,
    layout: state.layout,
    grade: state.grade,
    size: state.size,
    panelPhoto: state.panelPhoto,
    panelZoom: state.panelZoom,
    panelPan: state.panelPan,
    heat: state.heat,
    sun: state.sun,
    badge: state.badge,
    badgeText: state.badgeText,
    grain: state.grain,
  });
}

function applySnapshot(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
  syncControls();
  render();
}

const undoStack = [];
const redoStack = [];

function commit() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

function undo() {
  if (!undoStack.length) return;
  pendingSnapshot = null;
  redoStack.push(snapshot());
  applySnapshot(undoStack.pop());
  syncHistoryButtons();
}

function redo() {
  if (!redoStack.length) return;
  pendingSnapshot = null;
  undoStack.push(snapshot());
  applySnapshot(redoStack.pop());
  syncHistoryButtons();
}

function syncHistoryButtons() {
  document.getElementById('undo').disabled = undoStack.length === 0;
  document.getElementById('redo').disabled = redoStack.length === 0;
}

// Text and slider edits update live, so the pre-edit snapshot must be taken when
// the edit starts (focus / pointer down) and pushed when it ends (change).
let pendingSnapshot = null;

function beginEdit() {
  if (pendingSnapshot === null) pendingSnapshot = snapshot();
}

function endEdit() {
  if (pendingSnapshot === null) return;
  undoStack.push(pendingSnapshot);
  if (undoStack.length > 60) undoStack.shift();
  pendingSnapshot = null;
  redoStack.length = 0;
  syncHistoryButtons();
}

// ---- rendering ----------------------------------------------------------

function currentSize() {
  return SIZES[state.size];
}

function render() {
  const size = currentSize();
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  drawCover(canvas.getContext('2d'), state, size.w, size.h);
  const layout = layoutById(state.layout);
  const total = layout.panels;
  if (selectedPanel >= total) selectedPanel = 0;
  panelNote.textContent = `Panel ${selectedPanel + 1} of ${total}`;
  const photoId = state.panelPhoto[selectedPanel];
  const photo = photoId ? state.photos.find((p) => p.id === photoId) : null;
  selectedNote.textContent = photo
    ? `Panel ${selectedPanel + 1}: ${photo.name} — drag the cover to move it, use Zoom to resize it.`
    : `Panel ${selectedPanel + 1} is empty — pick a thumbnail below the Photos heading to fill it.`;
  document.getElementById('zoom').value = String(state.panelZoom[selectedPanel] || 1);
}

function setStatus(text) {
  statusEl.textContent = text;
}

// ---- photos -------------------------------------------------------------

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function addPhoto(img, name) {
  const id = `p${++photoCounter}`;
  const photo = { id, img, name };
  state.photos.push(photo);
  // Fill the first empty panel, if there is one.
  const empty = state.panelPhoto.findIndex((p) => p === null);
  if (empty !== -1) state.panelPhoto[empty] = id;
  renderThumbs();
  return photo;
}

async function addPhotoFiles(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const img = await loadImage(URL.createObjectURL(file));
      addPhoto(img, file.name);
      added++;
    } catch {
      setStatus(`Could not read ${file.name} — try another image.`);
    }
  }
  if (added) {
    commit();
    render();
    setStatus(`${added} photo${added > 1 ? 's' : ''} added.`);
  }
}

async function loadSamples() {
  const names = ['boulevard.jpg', 'pier.jpg'];
  for (const name of names) {
    if (state.photos.some((p) => p.name === name)) continue;
    try {
      const img = await loadImage(`samples/${name}`);
      addPhoto(img, name);
    } catch {
      // Samples are a convenience; the editor works without them.
    }
  }
  render();
}

function renderThumbs() {
  thumbsEl.innerHTML = '';
  state.photos.forEach((photo) => {
    const thumb = document.createElement('img');
    thumb.src = photo.img.src;
    thumb.alt = photo.name;
    thumb.title = photo.name;
    if (state.panelPhoto[selectedPanel] === photo.id) thumb.classList.add('active');
    thumb.addEventListener('click', () => {
      commit();
      state.panelPhoto[selectedPanel] = photo.id;
      render();
      renderThumbs();
      setStatus(`${photo.name} is now in panel ${selectedPanel + 1}.`);
    });
    thumbsEl.appendChild(thumb);
  });
}

// ---- panel picking, drag-pan --------------------------------------------

function currentPanels() {
  const size = currentSize();
  const margin = Math.round(Math.min(size.w, size.h) * 0.028);
  const titleH = state.layout === 'full' ? 0 : Math.round(size.h * 0.24);
  const area = state.layout === 'full'
    ? { x: 0, y: 0, w: size.w, h: size.h }
    : { x: margin, y: margin, w: size.w - margin * 2, h: size.h - titleH - margin * 2 };
  return layoutPanels(state.layout, area.x, area.y, area.w, area.h);
}

function hitPanel(px, py) {
  const panels = currentPanels();
  if (state.layout === 'diagonal') {
    const size = currentSize();
    return (px / size.w + py / size.h) < 1 ? 0 : 1;
  }
  for (let i = panels.length - 1; i >= 0; i--) {
    const r = panels[i];
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    rect,
  };
}

let dragging = false;
let lastPoint = null;
let dragCommitted = false;

canvas.addEventListener('pointerdown', (event) => {
  const point = canvasPoint(event);
  const hit = hitPanel(point.x, point.y);
  if (hit === -1) return;
  selectedPanel = hit;
  dragging = true;
  dragCommitted = false;
  lastPoint = point;
  canvas.setPointerCapture(event.pointerId);
  render();
  renderThumbs();
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging || !lastPoint) return;
  const point = canvasPoint(event);
  const panels = currentPanels();
  const rect = panels[selectedPanel];
  if (!rect) return;
  if (!dragCommitted) {
    commit();
    dragCommitted = true;
  }
  const pan = state.panelPan[selectedPanel];
  pan.x += (point.x - lastPoint.x) / rect.w;
  pan.y += (point.y - lastPoint.y) / rect.h;
  pan.x = Math.max(-1, Math.min(1, pan.x));
  pan.y = Math.max(-1, Math.min(1, pan.y));
  lastPoint = point;
  render();
});

function endDrag() {
  dragging = false;
  lastPoint = null;
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---- controls -----------------------------------------------------------

function buildPickers() {
  const layoutBox = document.getElementById('layouts');
  LAYOUTS.forEach((layout) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = layout.name;
    btn.dataset.id = layout.id;
    btn.addEventListener('click', () => {
      if (state.layout === layout.id) return;
      commit();
      state.layout = layout.id;
      selectedPanel = 0;
      syncPickers();
      render();
      renderThumbs();
    });
    layoutBox.appendChild(btn);
  });

  const gradeBox = document.getElementById('grades');
  GRADES.forEach((grade) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = grade.id;
    const stops = grade.stops;
    const mid = `rgb(${stops[2].slice(1).join(',')})`;
    const end = `rgb(${stops[stops.length - 1].slice(1).join(',')})`;
    btn.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'swatch';
    dot.style.background = `linear-gradient(135deg, ${mid}, ${end})`;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(grade.name));
    btn.addEventListener('click', () => {
      if (state.grade === grade.id) return;
      commit();
      state.grade = grade.id;
      syncPickers();
      render();
    });
    gradeBox.appendChild(btn);
  });

  const sizeBox = document.getElementById('sizes');
  Object.values(SIZES).forEach((size) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = size.label;
    btn.dataset.id = size.id;
    btn.addEventListener('click', () => {
      if (state.size === size.id) return;
      commit();
      state.size = size.id;
      syncPickers();
      render();
    });
    sizeBox.appendChild(btn);
  });

  const starBox = document.getElementById('stars');
  for (let s = 1; s <= 5; s++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '★';
    btn.setAttribute('aria-label', `${s} star${s > 1 ? 's' : ''}`);
    btn.dataset.value = String(s);
    btn.addEventListener('click', () => {
      commit();
      state.heat = s;
      syncStars();
      render();
    });
    starBox.appendChild(btn);
  }
}

function syncPickers() {
  document.querySelectorAll('#layouts button').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === state.layout);
  });
  document.querySelectorAll('#grades button').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === state.grade);
  });
  document.querySelectorAll('#sizes button').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === state.size);
  });
  syncStars();
}

function syncStars() {
  document.querySelectorAll('#stars button').forEach((b) => {
    b.classList.toggle('lit', Number(b.dataset.value) <= state.heat);
  });
}

function syncControls() {
  document.getElementById('title').value = state.title;
  document.getElementById('subtitle').value = state.subtitle;
  document.getElementById('badge-text').value = state.badgeText;
  document.getElementById('toggle-sun').checked = state.sun;
  document.getElementById('toggle-badge').checked = state.badge;
  document.getElementById('toggle-grain').checked = state.grain;
  syncPickers();
}

function bindControls() {
  document.getElementById('photos').addEventListener('change', (event) => {
    addPhotoFiles(event.target.files);
    event.target.value = '';
  });

  document.getElementById('use-samples').addEventListener('click', async () => {
    commit();
    await loadSamples();
    setStatus('Sample photos loaded.');
  });

  document.getElementById('fill-all').addEventListener('click', () => {
    const first = state.photos[0];
    if (!first) {
      setStatus('Add a photo first, then Fill all can spread it over every panel.');
      return;
    }
    commit();
    const total = layoutById(state.layout).panels;
    for (let i = 0; i < total; i++) state.panelPhoto[i] = first.id;
    render();
    renderThumbs();
    setStatus(`${first.name} now fills every panel.`);
  });

  const zoomInput = document.getElementById('zoom');
  zoomInput.addEventListener('focus', beginEdit);
  zoomInput.addEventListener('pointerdown', beginEdit);
  zoomInput.addEventListener('input', (event) => {
    state.panelZoom[selectedPanel] = Number(event.target.value);
    render();
  });
  zoomInput.addEventListener('change', endEdit);

  document.getElementById('reset-panel').addEventListener('click', () => {
    commit();
    state.panelZoom[selectedPanel] = 1;
    state.panelPan[selectedPanel] = { x: 0, y: 0 };
    render();
  });

  const titleInput = document.getElementById('title');
  titleInput.addEventListener('focus', beginEdit);
  titleInput.addEventListener('input', () => {
    state.title = titleInput.value;
    render();
  });
  titleInput.addEventListener('change', endEdit);

  const subtitleInput = document.getElementById('subtitle');
  subtitleInput.addEventListener('focus', beginEdit);
  subtitleInput.addEventListener('input', () => {
    state.subtitle = subtitleInput.value;
    render();
  });
  subtitleInput.addEventListener('change', endEdit);

  const badgeInput = document.getElementById('badge-text');
  badgeInput.addEventListener('focus', beginEdit);
  badgeInput.addEventListener('input', () => {
    state.badgeText = badgeInput.value;
    render();
  });
  badgeInput.addEventListener('change', endEdit);

  document.getElementById('toggle-sun').addEventListener('change', (event) => {
    commit();
    state.sun = event.target.checked;
    render();
  });
  document.getElementById('toggle-badge').addEventListener('change', (event) => {
    commit();
    state.badge = event.target.checked;
    render();
  });
  document.getElementById('toggle-grain').addEventListener('change', (event) => {
    commit();
    state.grain = event.target.checked;
    render();
  });

  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
  document.getElementById('export-one').addEventListener('click', () => exportSize(state.size));
  document.getElementById('export-all').addEventListener('click', exportAll);
}

// ---- export -------------------------------------------------------------

function slug(text) {
  return (text || 'cover').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cover';
}

function downloadCanvas(coverCanvas, filename) {
  return new Promise((resolve) => {
    coverCanvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve(true);
    }, 'image/png');
  });
}

async function exportSize(sizeId) {
  const size = SIZES[sizeId];
  const coverCanvas = renderCover(state, size.w, size.h);
  const ok = await downloadCanvas(coverCanvas, `${slug(state.title)}-${size.w}x${size.h}.png`);
  setStatus(ok ? `Saved ${slug(state.title)}-${size.w}x${size.h}.png` : 'Export failed in this browser.');
  return ok;
}

async function exportAll() {
  const names = [];
  for (const sizeId of Object.keys(SIZES)) {
    const size = SIZES[sizeId];
    const coverCanvas = renderCover(state, size.w, size.h);
    const ok = await downloadCanvas(coverCanvas, `${slug(state.title)}-${size.w}x${size.h}.png`);
    if (ok) names.push(`${size.w}x${size.h}`);
    // Small pause so the browser registers three separate downloads.
    await new Promise((r) => setTimeout(r, 350));
  }
  setStatus(names.length === 3 ? `Saved all 3 sizes: ${names.join(', ')}. ` : `Saved ${names.join(', ')}.`);
}

// ---- boot ---------------------------------------------------------------

const studio = {
  state,
  render,
  renderThumbs,
  loadImage,
  loadSamples,
  addPhoto,
  syncControls,
  syncPickers,
  commit,
  exportSize,
  exportAll,
  setStatus,
  gradeById,
};

// Exposed for Playwright verification and the fixed screenshot scenes.
window.__studio = studio;

buildPickers();
bindControls();
syncControls();
syncHistoryButtons();
render();

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, studio);
} else {
  // Open with a finished-looking cover so the first screen already shows the art.
  loadSamples().then(() => {
    // The second sample fills the remaining panels for a fuller mosaic.
    if (state.photos[1]) {
      const total = layoutById(state.layout).panels;
      for (let i = 0; i < total; i++) {
        if (state.panelPhoto[i] === null) state.panelPhoto[i] = state.photos[1].id;
      }
      render();
      renderThumbs();
    }
  });
  document.fonts.load('40px Anton').then(() => render()).catch(() => {});
  document.fonts.load('30px Pacifico').then(() => render()).catch(() => {});
}
