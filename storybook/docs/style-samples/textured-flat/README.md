# Textured flat: style sample

This treatment keeps the flat, readable shapes of the vector scenes and makes them look
printed and hand-made. The vector files stay the source. `treatment.js` changes the
structure of a scene and wraps it in one SVG filter:

- **Line work.** Every outline becomes a finer, darker, warm line (70% of its width).
  It gets a faint second pencil pass, so its weight changes with direction.
- **Misregistration.** The colour sits 2.6 × 1.8 units off-register from the line, as if
  it were printed in a second pass. Colour pokes out past the line on one side, and a
  sliver shows through on the other. Shapes that touch the page edge stay put, so no gap
  opens at the trim.
- **Hatched shading.** Existing shading shapes (a slightly darker, same-hue shape on top
  of a base colour) are redrawn as loose hand hatching over half-strength flat shade.
- **Page filter.**
  - A gentle wobble on every edge, and a 0.35-unit soften.
  - Crayon texture: paper shows through in the valleys of a paper-tooth height map, and
    it varies with slow "pressure" noise.
  - Fine riso grain, lighter and darker specks, and uneven ink density.
  - The same height map is embossed as the paper tooth.
  - A tone curve gives warm paper whites (`#FCF7EC`) and soft warm blacks (`#2E2622`).

It works on all eight pages of *Goal, {name}!* with no per-page tweaks. I checked p2, p3,
p5, p6, p7 and p8 as well as the two samples.

| File | What it is |
|---|---|
| `treatment.js` | The post-processor. It takes a string and returns a string, with no DOM and no dependencies. It runs in Node or the browser. |
| `cover-screen.jpg`, `p4-screen.jpg` | Book 1 p1 and p4 at 1600×1000 in screen mode, with the name "Ava" and the app-only sparkles shown. |
| `cover-print-detail.jpg`, `p4-print-detail.jpg` | The central 40% of each page at print resolution: 2550 px per page width, which is an 8.5 in page at 300 DPI. They use print mode: the name spots are blank with the faint star, and there are no app-only extras. |

## Applying it

```js
import { treatScene } from './treatment.js';

const { svg, stats } = treatScene(sceneSvgText, defsSvgText, {
  seed: 7 * pageNumber,   // different texture on every page; never change it once printed
  pixelsPerUnit: 2550 / 1600, // device px per scene unit you'll draw at (see below)
});
// svg: one self-contained <svg viewBox="0 0 1600 1000">, containing the paint servers
// from defs.svg, the filter, the hatch patterns, a paper backing and the treated scene
```

What happens to the scene:

- Every `<use>` is expanded in place, so the output doesn't need `defs.svg`. Copies of
  library items lose their ids.
- Every scene id, class and drive target is kept exactly once. Named shapes, such as
  `#p4-pass-path` and `#p1-title-arc`, are left untouched.
- The output passes `js/reader/scene.js`'s sanitiser unchanged. It uses only local
  `url(#…)` references.
- The same seed always gives the same pixels. The printed page and the app's tracking
  target can therefore come from one render.

To render with Playwright:

1. Put `svg` in a page sized 1600×1000 CSS px.
2. Set `deviceScaleFactor` to the output scale: `2550/1600` for an 8.5 in page at 300 DPI.
3. Screenshot with `timeout: 0`.

`pixelsPerUnit` tells the treatment how big the result will be drawn:

- **1** means 1600 px wide.
- **1.59** means print. Values of 1 and above leave the look unchanged.
- **Below 1** (a phone drawing the page about 1170 px wide ≈ 0.73) makes the fine grain
  and tooth coarser and lighter. Without that, they alias into salt-and-pepper noise.

**Baking layers for the app** (see the render-cost note):

- `hide: ['p4-ball', 'p4-leg']` leaves the moving parts out, for a static background
  image.
- `only: ['p4-ball', 'p4-leg']` is sprite mode. It keeps just those parts, with their
  ancestors' placement, on a transparent background. Each part gets its own small filter
  (`#tf-sprite`, sized to the part), so the texture travels with the part when a drive
  moves it.

## Parameters

Lengths are in scene units. The page is 1600 wide.

| Option | Default | Effect |
|---|---|---|
| `seed` | 7 | Noise seed. Use one per page. |
| `line.scale` | 0.7 | Outline width multiplier. |
| `line.darken`, `line.warm`, `line.ink` | .24, .12, `#3A2A22` | How much darker lines get, and how far they move towards a warm ink. |
| `line.lightLimit` | .66 | Stroke-only lines lighter than this (pitch lines, highlights) count as colour, not line work. |
| `line.nib`, `line.nibOffset`, `line.nibWidth` | .38, [.9, −.7], .55 | The second pencil pass: its opacity, offset and relative width. 0 turns it off. |
| `misregister` | [2.6, 1.8] | Offset of the colour from the line. [0, 0] turns it off. |
| `thickStroke` | 9 | Stroke-only shapes at least this wide on the page (limbs, goal frame) count as colour. Their wider "outline twin" underneath becomes the line. |
| `shade.on` | true | Hatch shading shapes. A shape counts as shading when its lightness drops between `minLightDrop` .015 and `maxLightDrop` .1, its hue shifts by at most `maxHueShift` 28°, and it is at least `minSize` 26 units across. |
| `shade.base`, `spacing`, `width`, `angle`, `darker` | .55, 4.8, 1.7, −38°, .07 | Hatch look: flat-shade opacity, stroke spacing, stroke width, angle, and how much darker the strokes are. |
| `wobble` | freq .022, 3 octaves, scale 5.5 | Edge waver. `scale` is the peak-to-peak displacement. |
| `soften` | .35 | Blur after the wobble. 0 gives crisper edges. |
| `edgeFade` | 10 | The wobble fades out near the page edge. |
| `tooth` | freq .3, 3 octaves, relief 1.2, shadow .12 | Paper height map and emboss. `shadow` is how dark the valleys get. |
| `crayon` | amount .22, threshold .4, pressureFreq .009, pressure .75 | Paper showing through in the tooth's valleys. `pressure` makes this vary slowly across the page. |
| `grain` / `specks` | .22 / .1 | Fine riso speckle, lighter and darker. |
| `mottle` | freq .03, amount .03 | Large, soft uneven ink density. |
| `paper`, `black` | `#FCF7EC`, `#2E2622` | The colours that pure white and pure black become. |
| `saturation`, `curve` | 1.1, [0, .235, .5, .765, 1] | Colour grade, applied before the paper and black mapping. |
| `text` | `'paint'` | `'lift'` draws the name slots crisp above the paint. Use it only when the slot's parents never move. |
| `pixelsPerUnit` | 1 | See above. |
| `hide` / `only` | – | Baking layers (see above). |
| `prefix` | `tf` | Filter and pattern id prefix. Change it if two treated scenes share a document. |

Nested options merge key by key, so `{ grain: { amount: .15 } }` keeps the grain
frequency.

- **Cleaner:** set `misregister` to [0, 0] and `line.nib` to 0, and lower `crayon.amount`.
- **More handmade:** raise `wobble.scale` to 7 and `crayon.amount` to .3.
- **Punchier colour for print tests:** set `saturation` to 1.15.

## Render cost

These timings are from headless Chromium on this server. It uses software rendering, so
real phones will differ in absolute numbers, but the ratios hold.

| | Flat vector (today) | Textured, one live page filter | Hybrid: textured image + live textured sprites |
|---|---|---|---|
| Treatment in JS (string in, string out) | – | 5–35 ms per page. The output is 63 KB (p1) to 334 KB (p6). | same |
| First paint, 1600×1000 (screenshot time, capture included) | ~0.09 s | **~1.5 s** | not timed separately: one image decode plus two small filtered sprites |
| First paint, phone size (390×244 CSS @3x) | ~0.08 s | **~0.6 s** | as above |
| Frame cost while the ball moves, 1600 wide (from a Chromium trace) | ~2 ms | **~700–900 ms**: the whole-page filter re-runs every frame | ~8.5 ms |
| Frame cost while the ball moves, phone size | ~1.7 ms | **~45 ms** | ~1.5 ms |

**Verdict: don't run the textured filter live over the whole page in the phone app.** Any
movement inside the filtered group re-runs the filter for the whole page. That includes
the name being written in, a cloud floating and a drive. The result is visible stutter at
best. On iPhones it will probably be worse, because WebKit renders SVG filters on the CPU.
It would also drain the battery.

The app should use pre-rendered images for the static art:

1. **Bake each page's static art to an image.** Use the treatment with `hide: [moving
   ids]`, rendered with Playwright. WebP or JPEG at about 2400×1500 is roughly 250–450 KB
   per page. Bake it once per book at build time, never on the phone. The same render at
   300 DPI is the print file and the source of the camera's tracking target, so print and
   app match exactly.
2. **Keep the moving parts live**, in one of two ways:
   - As live SVG in `only` sprite mode. The filter then covers only the small part, and
     the cost is about the same as flat vector today.
   - As pre-baked transparent PNG or WebP sprites that the drives move and rotate. This
     is cheapest of all and is the safest for iOS Safari.
3. **Keep the child's name live** on top, as it already is. It can stay untextured, or
   get the sprite filter once, after it has been written in.

## Known limits

- It is texture over geometric drawing. Heads are still perfect circles and every line
  has the same weight along its length (no tapering), so up close it reads as good
  digital illustration with texture brushes rather than true pencil work.
- Shading detection is a heuristic. It found 13 shading shapes on p1 but only 4 on p4,
  because the small crowd faces fall under `minSize`. An artist can hatch more by adding
  shade shapes to the art.
- The colours are slightly softer and warmer than the flat art: warm paper and a lifted
  black. Soft-proof them against the KDP colour profile before approving. The treatment
  does no CMYK conversion.
- p8's dark night wall stays a large dark area. The grain lightens it a little, but that
  is a design question for print.
