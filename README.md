# Golden Hour Cover Studio

Turn any photo and a caption into multi-panel sunset poster cover art, right in your
browser. No account, no upload, no network: every file the app needs ships inside
`app/`, and your photos never leave your machine.

## How to run it offline

```bash
node serve.ts            # serves app/ on http://localhost:8080
```

Open the address in desktop Chrome. Or open `app/index.html` from any static file
server. No build step, no install.

## What it does

- **Your photos, your panels** — add one photo or several from your machine. Click a
  thumbnail to place it in the selected panel, click any panel on the cover to select
  it, drag to move its photo, and use the Zoom slider to resize it. “Fill all panels”
  spreads one photo across the whole cover.
- **6 layouts** — Hero + Three, Four Panel Grid, Nine Panel Mosaic, Full Bleed,
  Tilted Snapshots, Diagonal Split.
- **6 grades** — Vice Sunset, Neon Nights, Hot Pink, Teal Noir, Golden Hour, Mono
  Noir. Each is a canvas gradient map over your photo, so the sunset/neon look works
  on any picture.
- **Poster lettering** — your title in Anton with a sunset gradient fill and ink
  outline over a halftone dot block, a Pacifico script subtitle, a sun disc, a badge
  ribbon, a 1–5 star heat meter, film grain, and a vignette.
- **Undo / redo** for every change.
- **Export** — one click saves the current size, or all three post sizes at once:
  1080 x 1080, 1080 x 1350, and 1920 x 1080 PNGs.

The editor opens with two built-in sample photos already loaded, so the first screen
already shows a finished cover. Swap in your own photos to make it yours.

## Files

- `app/index.html` — the editor shell
- `app/style.css` — the dark sunset-neon editor UI
- `app/src/cover.js` — the cover engine (layouts, gradient-map grades, lettering,
  grain, halftone, vignette, export renderer)
- `app/src/main.js` — the editor wiring (upload, panels, pan/zoom, undo/redo, export)
- `app/src/shots.js` — fixed `?shot=cover|editor` scenes for screenshots
- `app/fonts/` — Anton and Pacifico, vendored under the SIL Open Font License
  (`app/fonts/OFL.txt` carries both license texts)
- `app/samples/` — two sample photos made with an image model, free to use
- `main.ts` — the entry program: copies `app/` + `screenshots/` to `/output` and
  writes `dossier.json`
- `serve.ts` — a tiny static server for local testing
- `tools/screenshot.mjs` — Playwright capture script for the screenshots (repo only)
- `shots.json` — the four screenshot scenes

## License

Code: MIT (see `LICENSE`). Fonts: SIL Open Font License 1.1 (see
`app/fonts/OFL.txt`). Sample photos: made with an image model for this project and
free to use. All artwork in this app is original; it contains no game logo, artwork,
character, or font from any game.
