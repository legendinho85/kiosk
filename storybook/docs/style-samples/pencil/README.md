# Style sample: "Pencil & crayon"

A reusable treatment that gives the existing flat-vector scenes a soft, hand-coloured look:

- warm off-white paper
- slightly wobbly freehand edges
- a grainy pencil rim on every colour boundary, in a darker shade of the colour beside it
- diagonal wax-crayon strokes, with paper tooth showing through in the light strokes
- uneven, blotchy colouring
- fine hatching in shaded areas
- softened warm blacks

The vector scenes stay the source. The treatment is an SVG filter wrapped around them, so it works the same way for all 10 books.

It is our own generic look. It is not modelled on any illustrator or series.

| File | What |
|---|---|
| `treatment.js` | The treatment. It is an ES module that works in Node or the browser (string in, string out, no DOM needed). |
| `bake.mjs` | A command-line tool that renders a book's pages to JPEG or PNG with the treatment. It uses the app's own scene loader, rest state and name fitting. |
| `cover-screen.jpg`, `p4-screen.jpg` | Book 1 page 1 (the cover) and page 4 (the passing spread), 1600 × 1000, named "Ava", in the app's rest state. |
| `cover-print-detail.jpg`, `p4-print-detail.jpg` | The central 40 % of each page rendered at 300 DPI for a page 8.5 in wide (2550 px across), in print mode (no screen-only extras). |
| `p4-print-detail-tiffin.jpg` | An extra 300 DPI crop of Tiffin on page 4. The central crop of that page misses her. |

## Applying it

```js
import { treatScene } from './docs/style-samples/pencil/treatment.js';

const svg = treatScene(sceneText, defsText, {
  name: 'Ava',          // fills every sb-name slot (bunting letters: use bake.mjs, which uses the app's name-fit)
  mode: 'screen',       // 'screen' drops .sb-print-only, 'print' drops .sb-digital, 'all' keeps both
  drop: ['#p4-burst-you', '#p4-burst-tiffin', '#p4-cheer-sparkles'], // things that appear only after the mechanism
  seed: 11,             // use a different seed on every page
});
```

The result is a standalone `<svg>`. It contains the library defs (`inlineDefs: false` leaves them out) and the filters, and it has three layers:

1. a paper rect
2. `<g id="pc-art" transform="rotate(a)">`, containing the filter, which contains `rotate(−a)`, which contains the original scene

   The crayon strokes follow the filter's own x axis. Rotating the filter's coordinate space and counter-rotating the art is what gives the strokes their diagonal direction.

The output contains no `<style>`, script, `feImage` or external references, so it passes `js/reader/scene.js`'s sanitiser.

To bake a whole book, run this from the storybook root. It starts its own http-server on `--port` and stops it when it finishes:

```sh
node docs/style-samples/pencil/bake.mjs --book tiffin-football --pages all --out /tmp/baked \
     --name Ava --mode print --width 2550 --format jpeg --quality 90 [--svg] [--opts '{"strokes":{"angle":-40}}']
```

- `--mode print` with a name also shows the art that the app reveals at the end, such as the bunting letters.
- `bake.mjs` uses seed = 100 + the page number. The samples here used seed 8 for the cover and 11 for page 4.
- The texture is defined in scene units, not pixels. It looks the same at any output width, so a phone render and a 300 DPI print render match.

For a moving part drawn live (see the render cost section below), put `filter="url(#pc-part)"` on an element *inside* the drive target. The grain then travels and spins with the part. Include the filter defs once with `pencilFilterDefs(options)`, which returns the `<filter>` elements as a string.

## Parameters

All lengths are in scene units: the 1600 × 1000 viewBox, about 7.4 units per mm on an 8.5 in page.

| Option | Default | Effect |
|---|---|---|
| `seed` | 7 | Master seed. Change it per page. |
| `paper` | `#FBF4E6` | Paper colour. Pure white in the art becomes this. |
| `wobble.freq / octaves / scale` | 0.009 / 3 / 9 | Freehand wobble. Low frequency with a big amplitude bends long lines without distorting faces. |
| `colour.saturate` | 0.98 | Saturation multiplier. |
| `colour.black` | [.2,.17,.15] | Where pure black ends up: a warm soft charcoal. Only the darks move. |
| `colour.paperTint` | 0.7 | How much the paper colour tints every colour (0 to 1). |
| `pencil.width / strength` | 1.6 / 2.2 | Width (blur) and darkness of the pencil rim on colour boundaries. |
| `pencil.offset / offsetFreq` | 2 / 0.035 | How far the rim drifts off the fill edge ("coloured in, then outlined"). |
| `pencil.grain` | 0.4 | How broken or grainy the rim is. |
| `shading.radius / strength` | 7 / 0.45 | Soft darkening pooled along edges. Set strength to 0 to turn it off. |
| `strokes.angle` | −36 | Crayon stroke direction in degrees (negative rises to the right). |
| `strokes.along / across / octaves` | 0.006 / 0.05 / 2 | Stroke length and width (noise frequencies). |
| `strokes.pressure` | 0.12 | Darker and lighter pressure bands. |
| `strokes.gaps` | 0.25 | How much more paper tooth shows between strokes. |
| `strokes.patch / patchCover` | 0.0035 / 0.6 | Strokes show strongly in big patches and fade elsewhere, so the page isn't uniformly streaky. |
| `hatching.depth` | 0.18 | Hatch lines in areas darker than their surroundings. Set to 0 to turn it off. `radius`, `sensitivity`, `threshold`, `along`, `across` and `contrast` tune it. |
| `tooth.freq / threshold / contrast / amount` | 0.55 / .62 / 6 / .45 | Paper-tooth speckles. |
| `blotch.freq / amount` | 0.006 / 0.12 | Big pale patches of thinner colour. |
| `fibre.freq / amount` | 0.03 / 0.06 | Paper fibre mottling. |
| `pad` | 24 | How far the filter paints past the page edge. Raise it to cover bleed if the scene is drawn into the bleed. |

**Softer:** lower `strokes.pressure`, `tooth.amount` and `hatching.depth`. **More drawn:** raise `pencil.strength` and `wobble.scale`. **Plainer backgrounds:** lower `strokes.patchCover`.

## Render cost

**Measurement setup.** Headless Chromium in this container: 4 cores, no GPU (SwiftShader software rendering). Book 1, page 4.

| Render size | Untreated vector, first paint | Treated live SVG, first paint |
|---|---|---|
| Phone portrait, 390 CSS px @3x (1170 × 731) | ~0.1 s | ~1.2–1.3 s |
| Desktop, 1600 × 1000 @1x | ~0.1 s | ~1.9 s |
| Phone landscape, 844 CSS px @3x (2532 × 1583) | ~0.2 s | ~5.8 s |
| Print page, 2550 px wide | ~0.2 s | ~7.5 s |

**Animating the ball.** Moving the ball *inside* the filtered scene re-runs the filter on every frame. Measured over the three screen sizes, frames took 0.17 s to 2 s each, which is 1–6 fps. Untreated, it runs at 60 fps.

**The hybrid approach.** The static art was a pre-rendered JPEG, and only the ball was live SVG with `pc-part`. This ran at **60 fps at every size**. The JPEG weighed 175 KB (1170 px wide), 304 KB (1600 px) or 706 KB (2532 px) at quality 85.

**Verdict: too slow to run live on a phone.** Real phones render differently from this container:

- Android Chrome draws with the GPU, which may be faster.
- iOS WebKit renders SVG filters on the CPU.

On either, the mechanics would still re-filter the whole page on every frame. The large filter surfaces at 3× also cost a lot of memory.

**Recommendation:**

- **Pre-render the static art for each page** with `bake.mjs`, at 1600–2000 px wide, as WebP or JPEG (about 150–400 KB per page).
- Bake it without:
  - the drive targets
  - the name slots
  - anything that pops in
- **Keep live SVG only for the moving parts and the name.** Each gets `pc-part`, or ship each part as a small pre-rendered transparent sprite.

For print, baking is an offline job: about 7.5 s per page at 300 DPI here, so a few minutes per book.

## Print and camera notes

- **Colour:** there are no neons. Saturation is slightly reduced, and the paper tint warms and mutes every colour. The darkest value is a warm charcoal of about RGB 50/42/36, not black, so large dark areas don't print as heavy slabs.
- **Night scene:** page 8's night wall is still a big dark area. That comes from the scene, and the treatment only lightens it with grain. Consider a lighter dusk blue in the scene itself.
- **Camera tracking:** at a tracker-like 480 × 300 greyscale, I counted 12 px cells with almost no detail (standard deviation below 3). That share dropped from 33 % to 2 % on the cover and from 38 % to 2 % on page 4.
  - The pencil rims also add light–dark contrast where characters meet the background. The print-production notes flag that as weak in the flat art (Tiffin's kit against the grass).
  - This is only a proxy. Confirm it with the MindAR target compiler on a printed proof.

## Known limits

- The wobble moves every edge of the page as one field. Small details keep their shape, but very thin parallel lines, such as the goal net, can drift slightly.
- The texture is procedural. It is convincing at print size, but it is regular compared with real crayon: the stroke direction is the same across a page. A human touch-up pass on the covers would still add value.
- `fillNames` in `treatment.js` only fills `sb-name` text. For bunting letters, overflow banners and long names, use `bake.mjs`, which runs the app's own `name-fit.js`.
