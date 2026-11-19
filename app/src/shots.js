// Fixed scenes for screenshots: ?shot=editor shows the editor with a sample photo
// loaded; ?shot=cover shows the cover alone, filling the viewport.
// Query params: photo (sample name), caption, subtitle, layout, grade, size.
// window.__shotReady is set once the scene is painted with fonts loaded.
import { LAYOUTS, GRADES, SIZES } from './cover.js';

function pick(list, id, fallback) {
  return list.some((item) => item.id === id) ? id : fallback;
}

export async function runShot(shot, query, studio) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const state = studio.state;
  const firstPhoto = query.get('photo') ?? 'pier';
  const secondPhoto = firstPhoto === 'pier' ? 'boulevard' : 'pier';

  // Load the chosen sample first, then the other one, so every panel can be filled.
  const first = await studio.loadImage(`samples/${firstPhoto}.jpg`);
  studio.addPhoto(first, `${firstPhoto}.jpg`);
  const second = await studio.loadImage(`samples/${secondPhoto}.jpg`);
  studio.addPhoto(second, `${secondPhoto}.jpg`);

  state.title = query.get('caption') ?? 'Neon Shores';
  state.subtitle = query.get('subtitle') ?? 'chase the golden hour';
  state.layout = pick(LAYOUTS, query.get('layout') ?? 'hero', 'hero');
  state.grade = pick(GRADES, query.get('grade') ?? 'vice', 'vice');
  state.size = pick(Object.values(SIZES), query.get('size') ?? 'portrait', 'portrait');
  state.heat = Number(query.get('heat') ?? 4) || 4;
  state.sun = true;
  state.badge = true;
  state.badgeText = query.get('badge') ?? 'New';
  state.grain = true;

  // Alternate the two samples across the panels for a full mosaic look.
  const total = LAYOUTS.find((l) => l.id === state.layout).panels;
  for (let i = 0; i < total; i++) {
    state.panelPhoto[i] = state.photos[i % state.photos.length].id;
  }

  studio.syncControls();
  studio.syncPickers();
  studio.render();
  studio.renderThumbs();

  try {
    await document.fonts.load('40px Anton');
    await document.fonts.load('30px Pacifico');
    await document.fonts.ready;
  } catch {
    // The cover still renders with fallback fonts; the shot stays usable.
  }
  studio.render();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
