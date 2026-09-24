# Soft gouache: style sample

This treatment makes the flat vector scenes look like gouache painted on warm paper. The
vector files stay the source. `treatment.js` wraps a scene in an SVG filter chain that
adds the painted look:

- Edges waver a little and are soft. There are no hard outlines: each outline is pulled
  most of the way towards its fill colour.
- Each colour has its own uneven, blotchy coverage and brush drag, so marks stop at the
  shape edges the way separate brush strokes would.
- Fine bristle streaks bend across the page.
- The paper has a tooth and pigment grain, and there are a few clustered dry-brush flecks.
- Pure black becomes a soft warm ink colour and pure white becomes warm paper.
- The brightest areas get a gentle glow.

The treatment works on every page of *Goal, {name}!* without per-page tweaking. p2, p3 and
p5–p8 were checked as well as the two samples.

| File | What |
|---|---|
| `treatment.js` | Post-processor. It uses string in and string out, has no DOM or dependencies, and runs in Node or the browser. |
| `cover-screen.jpg`, `p4-screen.jpg` | Book 1 p1 and p4 at 1600×1000 in screen mode (name "Ava", app-only sparkles shown). |
| `cover-print-detail.jpg`, `p4-print-detail.jpg` | The central 40% of each page at print resolution: 2550 px per page width, which is an 8.5 in page at 300 DPI. Print mode: no app-only extras. |

## Applying it

```js
import { treatScene } from './treatment.js';

const out = treatScene(sceneSvg, defsSvg, {
  seed: 7 * pageNumber, // different brush marks on every page; keep it fixed once printed
  animated: pageJson,   // pages/pN.json: name slots inside moving parts are not lifted
});
out.svg;     // one self-contained <svg>: filters + art library + treated scene (use this for rendering)
out.scene;   // treated scene only; the page must also contain out.defs and out.filters
out.defs;    // the art library with softened outlines (inline once, like defs.svg)
out.filters; // <svg width=0 height=0> with #gw-paint and #gw-ink (inline once)
```

`treatScene` puts all the scene content into one `<g filter="url(#gw-paint)">`. Name slots
(`text.sb-name`, `.sb-letters`) are lifted out and drawn on top with the lighter `#gw-ink`
filter, so the child's name stays crisp. Lifting only happens when no ancestor of the slot
animates, is driven, or is shown or hidden by the page. p4's banner cheers after the pass,
for example, so its name stays painted and moves with it. Ids, classes and drive targets
are kept, and the output passes `js/reader/scene.js`'s sanitiser (local `url(#…)` only).
The same seed always renders the same pixels, so the printed page and the app's tracking
target match exactly.

To pre-render a page, open `out.svg` in Playwright's Chromium. Size the viewport in scene
units (1600×1000) and set `deviceScaleFactor` to the output scale: `2550/1600` for an 8.5 in
page at 300 DPI, or `5100/1600` if a scene spans a two-page spread. Pass `timeout: 0` to
`page.screenshot()`, because large renders take tens of seconds.

## Parameters (all lengths in scene units)

| Option | Default | Effect |
|---|---|---|
| `seed` | 7 | Noise seed. Change it per page. |
| `outline` | 0.38 | Outline strength: 0 = hidden in the fill, 1 = the original darker line. Only darker strokes on filled shapes change; line work (whiskers, smiles) is left alone. |
| `outlineWidth` | 1 | Multiplies outline widths. |
| `wobble` | freq .018, 2 octaves, scale 6 | The large, gentle waver on every edge. |
| `rough` | freq .09, scale 2.2 | Small bristle roughness on edges. |
| `soften` | 0.7 | Blur after the wobble. This is what removes the hard vector edge. |
| `edgeFade` | 4 | The wobble fades out near the page edge, so no paper gap shows at the trim. |
| `blotch` | freq .011, 3 octaves, amount 1.1 | Uneven coverage, different for each colour. |
| `brush` | freq [.006, .05], amount .6 | Long streaky brush drag (x/y frequency). |
| `strokes` | freq [.03, .3], warp 35, amount .5 | Fine bristle marks whose direction bends. |
| `tooth` | freq .35, amount .3 | Paper tooth and speckled grain. |
| `flecks` | freq .2, light .5, dark .28, density .5 | Dry-brush flecks: paper showing through (light) and pigment specks (dark). |
| `paper` / `ink` | `#FBF4E6` / `#2A2320` | Colours that pure white and pure black become. |
| `saturation`, `contrast` | .96, .12 | A slightly chalky gouache grade, with a gentle S-curve. |
| `glow` | threshold .84, radius 9, amount .3 | Warm bloom around the highlights. |
| `text` | `'lift'` | `'paint'` paints name slots along with everything else. |
| `animated` | `[]` | The page JSON or a list of ids (see above). |
| `textWobble` | 2 | Edge waver for lifted name text. |
| `prefix` | `gw` | Filter id prefix. Use a different one if two treatments share a page. |

Nested options merge key by key, so `{ tooth: { amount: .2 } }` keeps the tooth frequency.
Softer: lower `blotch`, `brush` and `strokes`. More handmade: raise `wobble.scale` to 8
and `flecks.density` to .7.

## Render cost and what the app should do

Measured in headless Chromium with software raster on 4 CPU cores, p4:

| Setup | 1600×1000 @1x | Phone: 390 px wide @3x |
|---|---|---|
| Flat vector (the current art) | about 0.1 s to paint, 60 fps animating the ball | about 0.1 s, 60 fps |
| **Gouache, fully live SVG** | **4–10 s** to paint, **0.6 fps** animating | **2–4 s**, **about 6 fps** |
| Gouache still image + only the ball live (its own small filter) | about 0.6 s (mostly image decode), **60 fps** | about 0.3 s, **60 fps** |
| Print renders (offline) | 2550×1594 full page: about 22 s. 5100×3188: about 92 s. | – |

As live SVG, the treatment is too slow for the phone app. The chain runs 7 noise fields,
3 displacements and 3 blurs over every pixel. Any animation inside the painted group,
including the name write-in and the drive engine moving a part, re-runs the whole chain on
every frame. GPU raster on Android Chrome would be faster than these numbers. iOS Safari
(WebKit) draws SVG filters on the CPU, so expect seconds per page there and a hot phone.

The app should use pre-rendered textured images for the static art and keep only the
moving parts live:

1. At build time, render each page's static layer with this treatment to WebP or JPEG at
   about 2× phone size, roughly 2000×1250 and a few hundred KB. Render the print file from
   the same source at 300 DPI.
2. Moving parts (drive targets, animated classes, items shown or hidden by the mechanic)
   should either be pre-rendered as transparent sprites or stay live SVG with the filter on
   a group *inside* the driven transform. A small filter is cheap: the ball held 60 fps even
   in software, and the texture travels with the part instead of swimming.
3. Keep the child's name live on top with `#gw-ink`, or paint it into the image when the
   personalised page is generated.
4. Use the same stills as the camera targets. They are deterministic, and the grain gives
   the tracker far more features than flat fills do.

For 10 books of about 24 pages at 2550 px, a batch pre-render is roughly 1.5 hours on one
machine, and pages can render in parallel.

## Print notes (KDP premium colour)

- No pure black and no neon colours. The grade lifts black to `#2A2320` and pulls
  saturation to 96%, so the kit red and pitch green stay close to what CMYK can print.
  Large dark areas, such as p8's night wall, stay as dark as the art makes them. Lighten
  them in the scene if the proof prints heavy.
- Whites print as a faint warm paper tint (`#FBF4E6`). If a proof copy shows it as dotty
  halftone, set `paper: '#FFFDF8'`.
- The texture is sized in scene units, so it scales with the art. At 8.5 in and 300 DPI
  the grain is about 0.2–0.4 mm and the bristle streaks about 0.5 mm wide and 4–5 mm
  long: visible on paper without looking like noise. Supply print files as PNG or maximum-quality JPEG, because
  grain suffers at JPEG quality 85.
