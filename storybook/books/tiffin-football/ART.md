# Goal, {name}! — art library (`defs.svg`)

`defs.svg` holds every character pose and shared prop for the eight scenes, so that
Tiffin looks the same on every page. The reader inlines it once (`js/reader/scene.js →
loadDefs`), and every scene places items with `<use>`:

```svg
<use href="#d-tiffin-wave" transform="translate(800 900) scale(1)"/>
```

- Every item is a `<g id="d-…">` inside `<defs>`, not a `<symbol>`. Each is drawn in its
  own coordinates around a documented **origin**. There is no viewBox, so `translate`
  puts the origin where you want it and `scale` sets the size.
- Items carry their own outline width (5 units) and their round joins and caps. Outlines
  scale with the item: at scale 0.5 they are 2.5 units wide.
- `d-tf-*` items are building blocks that the poses share (head, shirt, boots, gloves…).
  Scenes may use them directly, for example a peeking head, but usually won't need to.
- The file is about 100 KB. It contains no scripts, styles, text or external references.

## 1. Rules for scene artists

1. **Style.** Flat vector with chunky rounded shapes. Draw the big shapes first, then only
   a few details. Nothing thinner than 4 units, and no detail smaller than about 20 units
   (that is 5 px on a 390 px phone).
2. **Outlines.** Use a 5-unit stroke in a darker shade of each fill (see the palette),
   with `stroke-linejoin="round" stroke-linecap="round"`. Never use black outlines. The
   boots are the only near-black fill.
   *(This differs from the "6 px #2B2A33" line in architecture.md §6. The library follows
   the art direction; please match it.)*
3. **Shading.** Shade with a second flat shape in a slightly darker tone. No filters. The
   only gradients are the few listed in §4. Use `url(#d-grad-sky)` for skies if you like.
4. **Use the characters from here and never redraw them.** If a scene needs a pose that
   is missing, ask the art-library owner.
5. **Never mirror** Tiffin, the goose, the shirt or the scoreboard with `scale(-1 1)`,
   because that reverses the 7, the 9 and the 1. Frog, the crowd fans, flags, cones and
   the ball can be mirrored.
6. **The child's name is never drawn as art.** Every name spot is a blank shape
   (§3 lists the rectangles). Put an `sb-name` or `sb-letter` text slot on top, using
   `font-family="Fredoka, Andika, sans-serif" font-weight="700"`. For the printed book,
   add a faint star in the spot, e.g.
   `<use href="#d-star" class="sb-print-only" opacity=".25" transform="… scale(.5)"/>`.
7. **Drive targets.** Wrap a `<use>` in your own page-prefixed group, e.g.
   `<g id="p4-ball"><use href="#d-ball"/></g>`. The drive engine overwrites the
   target's `transform`. Any placement transform goes on an outer group, and CSS
   animation classes (`sb-bob`…) go on a different element from the drive target.
8. **Crowd scarf colour** comes from `currentColor`. Set `color="#E4483A"` (red, our
   team) or `color="#3E7BDB"` (blue, the Blues) on the `<use>`, or on a group around a
   whole row. If you leave it unset, the scarf takes the page's text colour.
9. **The lucky pebble** (`d-pebble`) goes on every spread and the end page.
10. Keep `defs.svg` in the page as it ships, at 0×0 with `position:absolute`. Hiding it
    with `display:none` stops gradients and patterns from painting.

## 2. Palette

| Role | Fill | Outline (darker) | Shade tone |
|---|---|---|---|
| Sky / grass / grass stripe | `#9FDCF7` / `#74C655` / `#86D166` | – | hedge `#5BAE45` |
| Otter brown (Tiffin) | `#B0703F` | `#7B4A26` | `#9C6035` |
| Cream (muzzle, tummy, throat) | `#F7E6CC` | `#CFAB80` | `#EDD6B4` |
| Dark brown (tuft, ear insides, pads) | `#8A5530` | `#5F3719` | – |
| Nose, whiskers / eyes | `#3A2A20` / `#2B1E16` | – | – |
| Cheeks | `#EE8C78` at 85% | – | – |
| Kit red | `#E4483A` | `#A6302A` | `#CC3B30`, inside `#8E231B` |
| White (collar, shorts, numbers) | `#FFFFFF` | `#AFBBC8` | `#E2E8EF` |
| Boots | `#2B2B2B` | `#111111` | highlight `#4D4D4D` |
| Accent yellow (laces, gloves, bunting) | `#FFCB3D` | `#CF9612` | `#F2B324` |
| Blues (opponents) | `#3E7BDB` | `#27549E` | `#3469C0` |
| Orange (cones, goose beak and feet) | `#F59A2B` | `#BD6A12` | `#E3851A` |
| Frog green | `#3DAA5C` | `#247140` | `#33934F`, belly `#CDEBA4` |
| Pebble | `#8FA3B8` | `#5F7389` | `#7C90A6` |
| Gold (cup) | `#F5B72E`, light `#FFE08A` | `#B37C14` | `#DE9E1B` |
| Goose white | `#FFFFFF` | `#A9B4C2` | `#E4E9F0` |
| Rabbit / duck / mouse | `#FFD6E0` / `#FFE9A8` / `#DCD7E5` | `#CF8FA2` / `#CFAE4E` / `#9A92AE` | – |
| Night wall / quilt / glow | `#2F3A66` / `#FFE9A8` / `url(#d-grad-glow)` | – | – |
| Wood (chair, pegs) | `#A8784F` | `#6E4A2C` | – |
| Net back / net lines | `#C5D7E3` / `url(#d-pat-net)` | – | – |
| Ink (text in art, if any) | `#2B2A33` | – | – |

## 3. Name spots (blank areas; the app writes the name on top)

All coordinates are in the item's own units. Multiply them by the scale you use.

| Item | Blank area | Suggested slot |
|---|---|---|
| `d-shirt-back` | name panel `x −96…96, y −104…−46` (white) | `x=0 y=−61 font-size=42 data-max-width=176 fill=#E4483A` |
| `d-cup` | plaque `x −84…84, y −292…−230` (cream) | `x=0 y=−246 font-size=44 data-max-width=150 fill=#8A5530` |
| `d-flag-*` | the flag; letter centre `(0, 40)` | `sb-letter` at `x=0 y=58 font-size=50`: white on red, red `#E4483A` on yellow and white |
| `d-scoreboard` | name row `x −150…80`, centred on `y=−40`; score windows `x 92…150` at `y=−40` and `y=+40` | name `x=−35 y=−25 font-size=44 data-max-width=220 fill=#FFCB3D`; digits at `x=121` |
| banner (drawn by the scene) | – | hold it with `d-fan-rabbit-arm-up` and `d-fan-rabbit-paw` (see §5, p4) |

**Brothers and sisters reading together.** A spot too small for every name
("Amara & Zak & Oluwaseun") shows them stacked (`data-wrap` spots) or as first
letters ("A & Z & O"), never squashed. Where the story gives each child their
own thing (p2's shirt), mark the group that holds it and its name slot with
`data-siblings="copies"`: the reader draws one copy per child, fanned out round
the artist's placement, each with one child's name. Tune the fan with
`data-sibling-step` (gap between copies, in the parent's units),
`data-sibling-scale`, `data-sibling-turn` (degrees) and `data-sibling-shift`;
each takes one value, or two (for two children, then for three). p2 uses
`data-sibling-step="170 140" data-sibling-scale="0.74 0.62" data-sibling-turn="8 7" data-sibling-shift="-6 -44"`.

**Describe every page** for screen readers in `book.draft.json`: `alt` (what the
picture shows when the page opens) and, when the moving part changes it,
`altAfter`. Both are templates (`{name}`, `{one|many}`); use `{name}`, not
`{NAME}`, since screen readers may spell out capitals.

## 4. Paint servers

| id | What |
|---|---|
| `d-grad-sky` | vertical sky, `#C9EDFB` → `#9FDCF7` (objectBoundingBox) |
| `d-grad-gold` | diagonal gold shine, `#FFE08A` → `#F5B72E` → `#E29E1C` (used by the cup) |
| `d-grad-glow` | radial lamp glow in `#FFE9A8`, fading to transparent (p8 lamp) |
| `d-pat-net` | goal net grid: 44-unit squares of 5-unit `#DDEAF2` lines (userSpaceOnUse). Lay it over a `#C5D7E3` net back |
| `d-pat-led` | dark LED-dot texture (used by the scoreboard) |

## 5. Catalogue

"Size" is the geometry bounding box at scale 1; outlines add about 3 units. Characters
use y-up-negative: the ground is `y=0` and the character stands above it.

### Tiffin — 12 items (the red kit with the 7)

Standing Tiffin is **about 590 units tall** at scale 1 (593 to the top of her tuft). Her
head is about 40% of that. The tail always sweeps out to the viewer's right, except in
the kick, where she faces right and the tail trails left.

| id | Pose | Origin | Size (x / y range) | Suggested use |
|---|---|---|---|---|
| `d-tiffin-wave` | left paw waving; right boot resting on a ball | ground between the feet | x −195…306, y −606…4 | p1 at `translate(800 900) scale(1)`. Put `d-ball` **before** her at `translate(−150 −42) scale(.84)` (Tiffin units) |
| `d-tiffin-boot` | holds a boot up; the other arm tucks a ball; left foot still in its red sock | ground between the feet | x −194…306, y −603…5 | p2 at `translate(420 900) scale(1)`. Order: `d-tiffin-boot`, then `d-ball` at `translate(−150 −236)`, then `d-tiffin-boot-paw` with the **same** transform as the pose |
| `d-tiffin-boot-paw` | overlay: the paw that hugs the tucked ball | same as `d-tiffin-boot` | x −194…−130, y −225…−161 | see above |
| `d-tiffin-stretch` | warm-up 1: arms up high | ground | x −148…306, y −667…4 | p3 wheel: `translate(760 790) scale(.58)` (all three poses share this ground line) |
| `d-tiffin-bend` | warm-up 2: touching toes (front view, the 7 on her back, tail up) | ground | x −164…212, y −466…7 | p3 wheel: `translate(760 790) scale(.58)` |
| `d-tiffin-starjump` | warm-up 3: star jump, boots ~30 up | ground below her | x −272…310, y −623…−16 | p3 wheel: `translate(760 790) scale(.58)` |
| `d-tiffin-kick-body` | ready to kick, facing right, **without** the kicking leg | ground below the hips | x −320…224, y −597…−6 | p4 at `translate(320 840) scale(.85)` |
| `d-tiffin-kick-leg` | the kicking leg; origin = **hip pivot** | hip | x −149…57, y −57…132 | nest it inside the body's group at `translate(36 −147)` (see recipe) |
| `d-tiffin-keeper` | goalkeeper: knees bent, arms wide, yellow gloves, eyes wide | ground | x −296…307, y −578…8 | p5 at `translate(700 820) scale(.95)` |
| `d-tiffin-dive` | full-length dive **up and to the left**, gloves ahead | **middle of her tummy** (airborne) | x −424…379, y −287…219 | p5 with the ball between the gloves at `(−400 −205)` in dive units, e.g. dive at `translate(520 420) scale(.85)` |
| `d-tiffin-cheer` | both paws up, big open smile | ground | x −217…306, y −593…5 | p6 at `translate(170 940) scale(.62)` |
| `d-tiffin-jump` | celebration jump: feet tucked, eyes shut with joy, boots ~80 up | ground below her | x −241…318, y −688…−72 | p7 at `translate(360 900) scale(.85)`, with `d-shadow` at the same origin |
| `d-tiffin-sleep` | curled up asleep, no kit, one paw stretched up; no basket | bottom centre (the surface she lies on) | x −325…228, y −376…2 | p8 at `translate(760 800) scale(.9)`. Draw the basket behind her and the blanket in front |

**Kick recipe (p4):**

```svg
<g transform="translate(320 840) scale(.85)">
  <use href="#d-tiffin-kick-body"/>
  <g transform="translate(36 -147)">
    <g id="p4-leg"><use href="#d-tiffin-kick-leg"/></g>
  </g>
</g>
```

Drive: `{ "target": "#p4-leg", "rotate": [0, -95], "origin": [0, 0], "phase": "back" }`.
At `rotate(0)` the leg is cocked back. At `−45` it passes under her. At **`−95` the boot
meets a ball whose centre is at `(170, −50)`** in body units (scene position
`320 + 170×.85, 840 − 50×.85` ≈ `(465, 798)`). At `−110` it follows through.

**Wheel recipe (p3):** place all three warm-up poses and give them `visible` drives
`[0, .34]`, `[.34, .67]`, `[.67, 1]`. With all three at `translate(760 790) scale(.58)`
they share one ground line and fit inside the 480-wide window (centre `(800 600)`), so
Tiffin stays the same size as the wheel turns.

**Keeper → dive (p5):** show `d-tiffin-keeper` for the first part of the pull, then
`d-tiffin-dive` (`visible` drives), and move a group around the dive with a `translate`
drive towards the ball in the top-left corner.

### Friends — the Blues

| id | What | Origin | Size | Notes |
|---|---|---|---|---|
| `d-goose-kick` | friendly goose, blue shirt no. 9, mid-kick, **facing left** | ground below the body (standing foot at x=44) | x −198…201, y −531…0 | p5 at `translate(1340 880) scale(.95)`. The ball at the moment of the kick is at `(−196 −118)` in goose units |
| `d-goose-clap` | goose clapping its wings, happy, facing left | ground between the feet | x −202…175, y −535…0 | p7 at `translate(1200 880) scale(.8)` |
| `d-frog-leap` | Frog the keeper leaping the wrong way (to the LEFT), eyes squeezed shut, sweat drops | middle of the body (airborne) | x −287…321, y −170…121 | p6 at `translate(480 420) scale(1–1.2)` |
| `d-frog-clap` | Frog beaming and clapping his yellow gloves | ground between the feet | x −128…128, y −366…6 | p7 at `translate(1410 880) scale(.85)` |

### Crowd (head and shoulders; the scarf is `currentColor`)

| id | What | Origin | Size | Notes |
|---|---|---|---|---|
| `d-fan-rabbit` | pink rabbit | bottom centre of the shoulders | x −70…70, y −257…0 | stands: scale .5 (p4), .34 (p6 back strip) |
| `d-fan-duck` | yellow duckling | bottom centre | x −70…70, y −192…0 | same |
| `d-fan-mouse` | grey mouse | bottom centre | x −78…78, y −188…0 | same |
| `d-fan-rabbit-arm-up` | rabbit with its arm raised; paw centre at `(70 −196)` | bottom centre | x −70…86, y −257…0 | banner holders. Mirror the left-hand one: `translate(490 470) scale(−.62 .62)` |
| `d-fan-rabbit-paw` | overlay: just the raised paw | same as above | x 54…86, y −212…−180 | draw after the banner so the paws grip its top corners |

**Banner recipe (p4, p7):** first the rabbits (`d-fan-rabbit-arm-up`, one mirrored), then
the banner rect with its `sb-name` text, then the two `d-fan-rabbit-paw` uses with the
same transforms as the rabbits. At scale .62 the paws are about 122 units above the
rabbits' origins.

### Props

| id | What | Origin | Size | Notes |
|---|---|---|---|---|
| `d-ball` | football, white with black patches | **centre**, radius 50 | ±50 | exactly centred, so it can ride `along` paths and spin in place. p4 knob 1.1 → 1.5, p6 knob 1.2 |
| `d-cone` | orange training cone with a white band | centre (base at y=+50) | ±50 | – |
| `d-cone-row` | 4 cones, 100 apart | centre | x −200…200 | p3 at scale .8 |
| `d-pebble` | the lucky pebble: blue-grey with a white spot | centre | 44 × 30 | every spread, scale 1 |
| `d-bottle` | red water bottle with a white sports cap | centre (base at y=+66) | 52 × 138 | p3 at scale .8 |
| `d-boot` | single boot, side view, toe to the right | centre | 112 × 60 | spare boot (p2/p8) |
| `d-socks` | pair of rolled white socks with red bands | centre | 163 × 60 | p2, inside the bag |
| `d-shirt-back` | red shirt from the back: white name panel and a big white 1 | centre | 336 × 294 | p2 inside the bag (≈ .6), p8 over the chair (≈ .7). Name slot: §3 |
| `d-kitbag` | red duffel with a white stripe and dark red handles; the dark opening is drawn in | about the visual centre (body y −110…200, handles to −194) | x −250…250 | p2 at `translate(1200 700) scale(1)` |
| `d-kitbag-flap` | the front panel with a yellow zip along its top edge: the p2 flap | **same origin as `d-kitbag`** | panel `x −190…190, y −86…172` | use the same transform as the bag. Hinge = top edge (y=−86). Put the shirt and socks between the bag and the flap |
| `d-cup` | big gold trophy with two loop handles and a blank cream plaque | **base centre** | x −171…171, y −350…0 | p7 on the podium at scale .9; p8 windowsill at .3. Plaque: §3 |
| `d-cloth-flap` | red cloth with folds, a gold trim and a small star: the p7 flap | **base centre, same as `d-cup`** | x −200…200, y −384…0 | use the same transform as the cup and it covers the cup completely |
| `d-flag-red`, `d-flag-yellow`, `d-flag-white` | triangular bunting flags | **top centre** | 90 × 110 | hang them on your string at their origin. Letter slots: §3 |
| `d-scarf-hang` | red and white striped scarf on a peg | **peg point** (top centre) | x −58…60, y −18…255 | p2 coat peg |
| `d-scoreboard` | dark board with LED texture and two score windows (no text) | centre | 344 × 180 | p5 and p6 top right at scale .95. Rows: §3 |
| `d-star` | 5-point yellow star | centre (radius 48) | 92 × 87 | print-only name-spot star; sparkles |
| `d-sparkle` | 4-point twinkle | centre (radius 40) | 80 × 80 | `sb-digital sb-twinkle` |
| `d-confetti` | patch of confetti in the kit colours | centre | 308 × 183 | p6/p7, `sb-digital` |
| `d-shadow` | soft ground shadow (black at 13%) | centre | 260 × 40 | under jumps and characters |
| `d-moon` | sleepy crescent moon | centre | 150 × 172 | p8 window, scale ≈ .6 |
| `d-zzz` | "z z z" in pale cream, for dark walls | centre | 147 × 129 | p8, `sb-digital sb-float` |

### Building blocks (`d-tf-*`)

| id | What | Origin |
|---|---|---|
| `d-tf-head`, `d-tf-head-3q` | Tiffin's head without eyes or mouth (front, and turned a little to the viewer's right) | head centre; head 256 × 208, tuft to y=−146, whiskers to x ±148 |
| `d-tf-shirt`, `d-tf-shorts` | kit, shirt with the V collar and the 7 | hip centre (shoulders at `(±70, −146)`, legs at `(±40, 36)`) |
| `d-tf-tail` | the standing tail | Tiffin ground origin |
| `d-tf-boot-front`, `d-tf-boot-side` | boots | ankle (sole at y=42 / y=29) |
| `d-tf-paw`, `d-tf-palm`, `d-tf-glove` | back of the paw, paw with pads, yellow goalkeeper glove | wrist; fingers point to −y |

## 6. Tiffin, for anyone drawing around her

- She is a young **otter**, never a bear. Her head is wide and flat with small, low, round
  ears and a three-flick tuft in `#8A5530`. She has a heart-shaped cream muzzle whose two
  lobes are the whisker pads, a rounded-triangle nose, a small "w" smile, three whiskers
  on each side reaching past her cheeks, big round eyes with two white highlights, rosy
  cheeks, a slim bendy body and a **long, thick, tapering tail** that is always visible.
- Kit: red shirt with a white V collar, white sleeve stripes and a white **7** on the
  front (and on the back); white shorts; red socks with white tops; black boots with
  yellow laces. The keeper gloves are big and yellow `#FFCB3D`.
- Expressions in use: `w` smile, open laugh, "o" (keeper), eyes shut with joy (^ ^),
  sleepy closed eyes. The face always looks towards the reader or the ball.
- Proportions at scale 1: head centre about y=−447, head 256 wide; shoulders at y≈−311;
  shorts from −199 to −115; boots end at y=0.

## 7. How it was checked

`defs.svg` is generated by a scratch script (not shipped). It was rendered in headless
Chromium through a contact sheet (every item with its origin and bounding box marked),
a side-by-side line-up on one ground line, `<use>` at scale .5 and 1, rough mock-ups of
all eight scenes, and a test page that loads the file through the real
`js/reader/scene.js` `loadDefs()` (sanitiser included). Gradients, patterns and the
`color` attribute on crowd `<use>`s all work through it.
