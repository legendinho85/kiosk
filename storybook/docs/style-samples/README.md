# Style samples: a hand-made finish for Tiffin

These samples test three ways to give Book 1's flat vector art (*Goal, {name}!*) a soft, "almost drawn" finish. The vector scenes stay the source in every case. Each finish is code that wraps a scene, so the one we choose can be applied to all 10 books. None of them copies any illustrator or series. They all use generic techniques: grain, wobbly edges, crayon texture and paper.

**Start here:**
- `comparison.jpg` (2400 px wide) and `comparison-phone.jpg` (1080 px wide, stacked for a phone) put Original, A, B and C side by side.
- Row 1 is the cover and row 2 is page 4, both as they appear on screen.
- Row 3 is a close-up of Tiffin rendered for print at 300 DPI and shown at 100%.

| Folder | What's in it |
|---|---|
| `original/` | The untreated art, for reference. Cover and page 4 at 1600 × 1000, plus 300 DPI print crops of the same area as the treatment crops. |
| `pencil/` | A: Pencil & crayon. The treatment, a batch baker (`bake.mjs`), samples and the artist's README. |
| `gouache/` | B: Soft gouache. The treatment, samples and README. |
| `textured-flat/` | C: Textured flat. The treatment, samples and README. |

## Measured side by side (page 4, one run, same machine)

| | Original | A: Pencil | B: Gouache | C: Textured flat |
|---|---|---|---|---|
| First paint at 1600 × 1000 | ~0.2–0.7 s | 2.8 s | 7.4 s | 1.2 s |
| One print page at 2550 px (8.5 in, 300 DPI) | 0.4 s | 10.5 s | 23 s | 8.0 s |
| Flat, detail-free patches the camera sees (lower is better) | 38 % | 2.5 % | 17 % | 27 % (15 % tuned, see C) |
| Strong corners the camera can lock on to (higher is better) | 6,900 | 9,400 | 6,300 | 8,500 |
| Darkest tone (0 = black) | 16 (boots, eyes) | 4, in only ~30 pixels; otherwise warm charcoal | 47 | 45 |

About these numbers:
- **Setup:** headless Chromium with software rendering on 4 cores, with other jobs running in the background. The absolute times are high, so compare the columns rather than the values.
- **Method:** renders took turns across the four finishes, three rounds each, and the table gives the median.
- **Camera figures:** each page was scaled to a tracker-like 480 × 300 greyscale view. A patch counts as flat when a 12 px cell has almost no variation. These are stand-ins for a real tracker, so they still need confirming with the MindAR compiler on a printed proof.
- **Live animation:** all three finishes are far too slow for the phone app if the filter runs live while something moves (about 1–6 fps for A and under 1 fps for B at full size, against 60 fps today). All three artists independently reached the same answer: bake each page's still art to an image and keep the moving parts and the child's name live on top. That also runs at 60 fps.

## A: Pencil & crayon

**What it is.** One SVG filter wraps the whole scene. It adds:
- warm paper
- freehand wobble on every edge
- a grainy pencil rim in a darker shade of each colour
- diagonal wax-crayon strokes that come and go in patches
- uneven colouring and fine hatching
- softened blacks

**Strengths.**
- At print size it is the most convincingly hand-coloured of the three.
- It gives the camera by far the most to grip. Flat patches drop from 38 % to 2.5 %, and it has the most strong corners.

**Risks.**
- On screen and phone it looks busy. The strokes all run one way across the page, and in the sky they read as rain.
- A fine white speckle sits over everything, including Tiffin's face, and it dulls her eyes. On KDP's inkjet print that speckle could look like dust or a print fault.
- Tiny toddler-page details carry a lot of texture.

**App cost.** It is the middle option: about 2.8 s to first paint and about 10 s per 300 DPI page. It must be baked for the app.

## B: Soft gouache

**What it is.** The treatment:
- pulls outlines into their fill colours, so edges read as soft painted edges
- gives each colour its own blotchy paint coverage, plus bristle streaks, paper grain and a few dry-brush flecks
- turns whites into warm paper and blacks into soft ink
- keeps the child's name crisp on top

**Strengths.**
- It is the warmest and most painterly look, and the closest to a premium painted picture book.
- It is lovely at print size, and the night page (p8) is especially good.

**Risks.**
- Losing the outline softens every shape. It is the only finish with *fewer* strong corners than today's flat art (6,300 against 6,900), so it may be the weakest camera target even though it covers more flat area than C.
- The white flecks carry the same dust risk as A.
- The goal net stays a large pale area.
- At phone size the grain turns into general softness.

**App cost.** It is by far the heaviest: about 7.4 s to first paint and about 23 s per 300 DPI page, roughly 1.5 hours for 10 books of 24 pages. That time can be split across parallel renders. It must be baked for the app.

## C: Textured flat

**What it is.** The treatment:
- turns every outline into a finer, darker, warm crayon line with a faint second pass
- sets the colour slightly off-register from the line
- redraws shading shapes as loose hatching
- adds a page filter with gentle wobble, crayon texture that skips in the paper's tooth, fine grain, specks, embossed paper, warm whites and soft blacks

**Strengths.**
- Tiffin's face and every shape stay as readable as today, which matters most for 2–5-year-olds, yet the line looks hand-drawn.
- The small colour offset is charming.
- It has soft warm blacks (darkest tone 45) and no streaks or white flecks that could pass for print faults.
- It is the fastest of the three: about 1.2 s to first paint and about 8 s per print page.
- It already has a setting for phone-size baking (`pixelsPerUnit`) and a sprite mode for moving parts.

**Risks.**
- It has the lightest texture of the three. By default, flat patches only drop from 38 % to 27 %.
- Up close it reads as good digital illustration with texture brushes rather than true pencil.
- The sky looks slightly dusty.
- Automatic hatching finds few shapes.
- Its SVG is larger (209 KB on page 4).

**Tested fix.** I tried stronger texture settings: `mottle: {freq: .02, amount: .05}` plus `crayon: {amount: .28, pressure: .85}`.
- Flat patches fell from 27 % to 15 % on page 4, and from 22 % to 12 % on the cover.
- Skies look more hand-coloured.
- Going further (`amount: .07`) starts to look stained.

## Recommendation

**Use C (Textured flat) for the series, with the texture turned up as in the tested fix above.** It delivers the brief:
- a soft, drawn crayon line, grainy colour, a little wobble and paper
- and it protects what matters most across 10 books: faces a toddler can read, clean print, the lowest render cost, and good edges for the camera

A has the best camera numbers but looks noisy and busy. B is the prettiest close up, but its lost outlines weaken tracking and it is about three times slower to bake.

**Next steps**
1. Set C's tuned settings as the series default.
2. Bake one spread at 300 DPI and order a KDP proof copy. Check the grain, the warm paper tint (it prints as a very light ink tint) and the colours.
3. Run the MindAR compiler on the baked pages to check tracking properly.
4. Lighten page 8's night wall to a dusk blue in the scene itself. That area stays large and dark under every finish.
5. In the app, show baked page images, with the moving parts and the name drawn live on top.
