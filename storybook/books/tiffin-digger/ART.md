# Beep beep, {name}! — art library (`defs.svg`)

`defs.svg` holds every character pose, machine part and prop for the eight scenes of Book 2,
so Tiffin looks the same on every page, and the same as in Book 1. The reader inlines it
once (`js/reader/scene.js → loadDefs`). Every scene places items with `<use>`:

```svg
<use href="#d2-tiffin-wave" transform="translate(800 900) scale(.8)"/>
```

- Every item is a `<g id="d2-…">` inside `<defs>`, not a `<symbol>`. Each is drawn in its
  own coordinates around a documented **origin**. There is no viewBox, so `translate` puts the
  origin where you want it and `scale` sets the size.
- Items carry their own outline width (5 units) with round joins and caps. Outlines scale
  with the item: at scale 0.5 they are 2.5 units wide.
- `d2-tf-*` items are Tiffin's building blocks (head with hard hat, body, waistcoat,
  boots, paws). The poses are built from them. Scenes rarely need them directly.
- The file is about 220 KB, more than Book 1's 100 KB because of the machines. It holds
  134 items. There are no scripts, styles, `<text>`, filters or external references.

## 1. Rules for scene artists

1. **IDs.** Book 1 and Book 2 artwork can be on screen together (the bookshelf shows both
   covers), so the two books never share an id.
   - Everything in this file starts with `d2-`. That includes gradients and patterns.
   - Every id in a Book 2 scene starts with `dg-pN-`, e.g. `dg-p3-horn`.
   - **Never reference a Book 1 `d-…` id** (`#d-ball`, `#d-star`, `#d-pebble`…). Book 1's
     library may not be loaded. This file has its own copies: `d2-star`, `d2-sparkle`,
     `d2-pebble`, `d2-shadow`, `d2-moon`, `d2-zzz`, `d2-confetti` and the flags.
2. **Style.** Same as Book 1: flat vector with chunky rounded shapes. Draw the big shapes
   first, then only a few details. Nothing is thinner than 4 units, and no detail is smaller
   than about 20 units.
3. **Outlines.** Use 5 units in a darker shade of each fill (see §2), with
   `stroke-linejoin="round" stroke-linecap="round"`. Never use black outlines. Only the
   boots, tyres and machine metal are near-black.
4. **Shading.** Shade with a second flat shape in a slightly darker tone. There are no
   filters, and the only gradients are the ones in §4.
5. **Characters come from here and are never redrawn.** If you need a pose that isn't
   here, ask the art-library owner.
6. **Mirroring.**
   - Don't mirror Tiffin. Her tail always sweeps to the viewer's right, and her tuft curl
     sits left of centre.
   - Machines face a fixed way: the digger and the mixer face right, the dumper and the
     crane face left. Their pivots are documented for that way round.
   - Frog, the crowd (`d2-friend-*`), cones, birds, bunting and the garland can be mirrored.
7. **The child's name is never drawn as art.** Every name spot is a blank shape (§3 gives
   the rectangles). Put an `sb-name` or `sb-letter` text slot on top, with
   `font-family="Fredoka, Andika, sans-serif" font-weight="700"`. For the printed book, add
   a faint star in the spot:
   `<use href="#d2-star" class="sb-print-only" opacity=".25" transform="… scale(.5)"/>`.
8. **Drive targets.** Wrap a `<use>` in your own page-prefixed group, e.g.
   `<g id="dg-p5-drum"><use href="#d2-mixer-disc"/></g>`. The drive engine overwrites the
   target's `transform`, so put placement transforms on an outer group. CSS animation
   classes (`sb-bob`, `sb-spin-slow`…) go on a different element from the drive target.
9. **The lucky pebble** (`d2-pebble`) goes on every spread and on the end page.
10. **Keep `defs.svg` in the page** as it ships (0×0, `position:absolute`). Hiding it with
    `display:none` stops the gradients and patterns from painting.

## 2. Palette

Book 1's colours are unchanged, so Tiffin, Goose and Frog match. Book 2 adds these:

| Role | Fill | Outline (darker) | Shade / light |
|---|---|---|---|
| Hi-vis yellow (Tiffin's hat, waistcoats on Goose and Frog, the child's hat) | `#FFE14D` | `#C9A200` | `#F2CB21` / `#FFF3A6` |
| Hi-vis orange (Tiffin's waistcoat, cones, hat box, cloth, the Goose/Frog hats) | `#FF8A1F` | `#C4600A` | `#EE7A10`, inside `#D96A0B` / `#FFB066` |
| Reflective silver | `#E9EEF2` | `#AFBBC8` | – |
| Digger red (Book 1 kit red) | `#E4483A` | `#A6302A` | `#CC3B30`, dark `#8E231B` / `#F07366` |
| Machine dark (tracks, bucket, rails) | `#3B3F46` | `#202329` | plates `#6B7079`, `#585D66` / `#8A9099` |
| Tyres | `#2B2B2B` | `#111111` | tread `#4D4D4D` |
| Dumper, mixer cab and swings blue (Book 1 blue) | `#3E7BDB` | `#27549E` | `#3469C0` / `#6B9BE6` |
| Crane, skip, slide tower yellow (Book 1 accent) | `#FFCB3D` | `#CF9612` | `#F2B324` / `#FFE27F` |
| Mud | `#6E5243` | `#4B372C` | lumps `#57402F` / `#8A6A55` |
| Concrete | `#B8BEC6` | `#8C939C` | shine `#D7DCE2`, paw prints `#9AA1AA` |
| Sand | `#F2D8A0` | `#C9A96A` | `#E4C584` |
| Pine wood (easel, gate, bench, boards, stick) | `#C8955F` | `#8A5F35` | `#B5824F` / `#D9AE7E` |
| Teal (fish spring rider) | `#2FB3A6` | `#1D7E75` | `#279E92` / `#7FD6CC` |
| Cab glass | `#CDEBFA` | `#8FB8D0` | inside `#B5DDF3` |
| Cabin wall / floor / plank lines | `#FFF4E0` / `#E8C9A0` / `#D9B68A` | – | – |
| Night wall / sky / silhouettes | `#2F3A66` / `#1E2A55` / `#3A4780` on `#243058` | – | – |
| Chair wood (Book 1) | `#A8784F` | `#6E4A2C` | `#946641` |
| Grass / hedge / sky | `#74C655` / `#5BAE45` / `#9FDCF7` | – | – |

The brief gave `#E0B400` as the hi-vis outline and `#B8322A` as the digger outline. The
library uses the darker `#C9A200`, which reads better against sky, and Book 1's house red
outline `#A6302A`. Please use the same values in the scenes.

## 3. Name spots (blank areas; the app writes the name on top)

All coordinates are in the item's own units. Multiply them by the scale you use. "Slot"
gives a suggested `sb-name` text: `x`, baseline `y`, `font-size`, `data-max-width` and fill.

| Item | Blank area | Suggested slot |
|---|---|---|
| `d2-hardhat-child` sticker (p2, p8) | white oval, centre `(0,−72)`, rx 86, ry 34 | `x=0 y=−60 font-size=34 data-max-width=150 fill=#E4483A`. At the p2 brief size (`data-max-width` 170), use the hat at scale 1.13 |
| `d2-digger-body` / `d2-digger-door` nameplate (p1, p3, p4) | white oval, centre `(−80,−300)`, rx 118, ry 32 | `x=−80 y=−286 font-size=40 data-max-width=200 fill=#3B3F46` |
| `d2-digger-small` nameplate (far away, p6/p7) | white oval, centre `(−50,−176)`, rx 64, ry 20 | `x=−50 y=−167 font-size=26 data-max-width=110 fill=#3B3F46` |
| `d2-park-sign` (p7, under the cloth) | name panel `x −212…212, y −86…14` | `x=0 y=−14 font-size=64 data-form=poss data-max-width=400 data-wrap=2 fill=#E4483A`. The printed word **Park** is plain scene text: `x=0 y=90 font-size=60 fill=#8A5530` |
| `d2-plan-easel` (p4) | title panel `x −124…124, y −424…−366` | `x=0 y=−381 font-size=40 data-form=poss data-max-width=230 fill=#E4483A`. Printed **Park** below it: `x=0 y=−330 font-size=34 fill=#E4483A` |
| `d2-crane` counterweight (p6) | white panel `x 32…204, y −326…−238` | `x=118 y=−264 font-size=52 data-form=upper data-max-width=160 fill=#3B3F46` (add `letter-spacing="2"` for a stencil feel) |
| `d2-flag-*` | letter centre `(0,40)` | `sb-letter` at `x=0 y=58 font-size=50`: white on red and orange, red `#E4483A` on yellow and white |
| wet concrete (p5, drawn by the scene) | – | groove style: `fill=#8C939C stroke=#D7DCE2 stroke-width=4 paint-order=stroke` |
| cover ribbon tail (p1, drawn by the scene) | – | copy Book 1's p1: the title on a `textPath`, and the name in red `#E4483A` with a white stroke |

**Brothers and sisters reading together.** A spot too small for every name
("Amara & Zak & Oluwaseun") shows them stacked (`data-wrap` spots) or as first
letters ("A & Z & O"), never squashed. Where the story gives each child their
own thing (p2's hard hat), mark the group that holds it and its name slot with
`data-siblings="copies"`: the reader draws one copy per child, fanned out round
the artist's placement, each with one child's name. Tune the fan with
`data-sibling-step` (gap between copies, in the parent's units),
`data-sibling-scale`, `data-sibling-turn` (degrees) and `data-sibling-shift`;
each takes one value, or two (for two children, then for three). p2 uses
`data-sibling-step="196 168" data-sibling-scale="0.7 0.56" data-sibling-turn="6 6" data-sibling-shift="0 -10"`.

**Describe every page** for screen readers in `book.draft.json`: `alt` (what the
picture shows when the page opens) and, when the moving part changes it,
`altAfter`. Both are templates (`{name}`, `{one|many}`); use `{name}`, not
`{NAME}`, since screen readers may spell out capitals.

## 4. Paint servers

| id | What |
|---|---|
| `d2-grad-sky` | vertical sky, `#C9EDFB` → `#9FDCF7` (objectBoundingBox) |
| `d2-grad-glow` | radial lamp glow in `#FFE9A8`, fading out (p8 lamp) |
| `d2-grad-beam` | radial yellow headlight beam (used by `d2-digger-lights`) |
| `d2-grad-beacon` | radial orange beacon glow (used by `d2-beacon-glow`) |
| `d2-pat-planks` | vertical planks 64 wide, lines `#D9B68A`. Lay it over a `#E8C9A0` rect for the p3 hoarding |
| `d2-pat-floor` | staggered floor planks 240 × 30. Lay it over `#E8C9A0` for the p2 cabin floor |
| `d2-pat-mud` | lumpy mud texture (used by `d2-mud-patch`, and handy for a bare-mud path stretch over `#6E5243`) |

All patterns use `userSpaceOnUse`.

## 5. Catalogue

"Size" is the bounding box at scale 1, measured in Chromium. Outlines add about 3 units.
Characters use y-up-negative: the ground is `y=0` and a character stands above it.

### Tiffin, in her work kit (15 items)

She is Book 1's otter, unchanged, with different clothes. Standing Tiffin is **about 660
units tall** at scale 1, up to the ridge of her hard hat. That is 70 more than Book 1
because of the hat. At `scale(.78)` she is the brief's 520 px on p2.

| id | Pose | Origin | Size (x / y) | Suggested use |
|---|---|---|---|---|
| `d2-tiffin-wave` | waves with her left paw (viewer's right), open smile | ground between the feet | −162…306 / −661…5 | general |
| `d2-tiffin-hat-pat` | both paws patting the top of her hat, proud smile, eyes shut with joy | ground | −149…306 / −651…5 | p2 at `translate(440 900) scale(.78)` |
| `d2-tiffin-point` | points to the viewer's right ("look!"), other paw on her hip | ground; fingertip ≈ `(300,−352)` | −143…311 / −658…5 | – |
| `d2-tiffin-clap` | claps, paws in front of her chin | ground | −148…306 / −651…5 | – |
| `d2-tiffin-cheer` | both paws up, big smile ("this way!") | ground | −217…306 / −651…5 | p6 guide at `translate(520 950) scale(.45–.55)` |
| `d2-tiffin-jump` | jumps for joy, boots ~80 up | ground below her | −241…318 / −746…−71 | p7 at `translate(300 880) scale(.6)`, with `d2-shadow` at the same origin |
| `d2-tiffin-stick` | holds a long stick like a pencil, other paw on her cheek | ground; **stick tip `(−262,40)`** | −269…306 / −666…47 | p5 at `translate(260 780) scale(.55)`; the tip lands on the wet concrete in front of her |
| `d2-tiffin-drive` | sits in the digger cab, paws on two levers, big grin | **seat point** (her hip) | −148…148 / −486…83 | p3, see the digger recipe |
| `d2-tiffin-drive-steer` | as above, tongue out, eyes on the bucket | seat point | −145…179 / −496…82 | p4 |
| `d2-tiffin-lean-wave` | leans out of the cab waving (viewer's right paw) | seat point | −134…264 / −490…62 | p1, see the digger recipe |
| `d2-tiffin-sleep` | curled up asleep, **no kit, hat off**, without the raised arm | bottom centre | −325…228 / −324…2 | p8, see the sleep recipe |
| `d2-tiffin-sleep-arm` | the paw stretched up over the quilt | **shoulder pivot** | 0…95 / −176…0 | at `translate(−40 −200)` in sleep units, drawn before the body. `rotate(−6…6)` about `(0,0)` makes the sleepy twitch |
| `d2-hardhat` | Tiffin's own hat on its own | brim bottom centre | −141…141 / −144…5 | p8 floor: `rotate(−14) scale(.5)` |

Everything below about `y=−60` of the three cab poses is meant to be hidden by
`d2-digger-door`.

### Friends

| id | What | Origin | Size | Notes |
|---|---|---|---|---|
| `d2-goose-drive` | Goose in a hi-vis yellow waistcoat and orange hard hat, **sitting** with wings on a little steering wheel, facing left | **seat point** | −192…175 / −471…50 | in the dumper at scale .8 (recipe) |
| `d2-goose-drive-honk` | same origin: wings up, beak open, honking | seat point | −244…175 / −478…50 | swap it in on the p4 complete (show/hide) |
| `d2-goose-clap` | Goose standing and clapping, facing left | ground | −202…175 / −577…0 | p7 at scale ≈ .55 |
| `d2-goose-hope` | Goose standing with wings folded, head tilted, looking up hopefully | ground | −178…175 / −587…1 | p6: hide her lower half behind the swing post so she peeks |
| `d2-frog-clap` | Frog in hi-vis, beaming and clapping (green hands, no gloves in this book) | ground | −128…128 / −429…6 | p7 at scale ≈ .6. Can be mirrored |
| `d2-frog-hope` | Frog with hands clasped, looking up hopefully | ground | −128…128 / −429…6 | p6 |
| `d2-frog-cab-uhoh` | Frog leaning out of the mixer window: wide eyes, O mouth, worried brows, sweat drop, hands on cheeks | **sill point** | −138…137 / −257…128 | p5, recipe below |
| `d2-frog-cab-grin` | same origin: big grin, both hands up | sill point | −173…173 / −257…128 | swap the two with `visible` drives `[0,.5]` / `[.5,1]` |
| `d2-hardhat-orange` | the orange hat Goose and Frog wear | brim bottom centre | −141…141 / −144…5 | outlines are 10, for use at scale ≈ .5 |
| `d2-friend-rabbit`, `d2-friend-duck`, `d2-friend-mouse` | Book 1's crowd as full-body runners, paws up, facing left | ground | ≈ 210 × 300–375 | p7 at scale .4–.55. Can be mirrored |

### Digger (red, faces right, articulated)

| id | What | Origin | Size |
|---|---|---|---|
| `d2-digger-body` | tracks, house, yellow side stripe, bonnet, exhaust, lamps and beacon (off), cab with an open window (seat back inside), door with a blank nameplate. **No arm** | ground under the middle of the tracks | −322…365 / −718…4 |
| `d2-digger-door` | overlay: the cab door panel with the nameplate. Same transform as the body; draw it after the driver | same | −260…100 / −354…−240 |
| `d2-digger-glass` | optional overlay: faint glass with two glints over the window | same | window rect |
| `d2-digger-boom` | boom, red with yellow chevrons | **boom foot pivot** | −40…236 / −190…25 |
| `d2-digger-stick` | stick (dipper arm) | **elbow pivot** | −48…84 / −47…394 |
| `d2-digger-bucket` | dark bucket with four rounded teeth | **wrist pivot** | −120…79 / −26…201 |
| `d2-digger-bucket-mud` | a bucketful of mud | same as the bucket (put it inside the bucket group) | −105…30 / −2…82 |
| `d2-digger-rest` | assembled, arm resting, bucket on the ground, no driver | as body | −322…677 / −718…11 |
| `d2-digger-raised` | assembled, arm raised proudly up-right (boom −34, stick −62, bucket −38), no driver | as body | ≈ −322…1070 / −870…4 |
| `d2-digger-lights` | `sb-digital`: both lamps on, with beams to the right | as body | 100…610 / −686…−240 |
| `d2-beacon-glow` | `sb-digital`: the beacon lit, with an orange glow | **beacon centre** | ±70 |
| `d2-beacon-rays` | `sb-digital`: six rays, symmetric about the origin, so `sb-spin-slow` spins them in place | beacon centre | ±81 |
| `d2-puff` | grey exhaust puff (`sb-digital sb-float`) | centre | 90 × 58 |
| `d2-digger-small` | simplified chunky digger for far away and for the windowsill toy (scale .15–.6) | ground under the tracks | −172…333 / −362…0 |
| `d2-digger-small-sil` | the same in night-blue silhouette | same | same |

**Anchors on `d2-digger-body`** (digger units):

| Anchor | Point |
|---|---|
| boom pivot | `(318,−420)` |
| elbow, in boom units | `(220,−150)` |
| wrist, in stick units | `(60,380)` |
| driver seat | `(−80,−317)`, Tiffin at scale **.55** |
| cab window | `x −232…72, y −610…−350`; the door sill is at `y=−350` |
| horn spot | centre `(226,−348)`, radius **75** |
| beacon centre | `(−120,−694)` |
| exhaust mouth | `(150,−520)` |
| roof lamp / bonnet lamp | `(106,−646)` / `(348,−300)` |

Arm lengths: boom 266 (pivot to elbow), stick 385 (elbow to wrist). At `rotate(0)` the
bucket teeth rest on the ground about 200 below the wrist. The wrist can reach about 640
from the boom pivot with the arm straight, and 450–600 comfortably.

### Dumper (Goose's, blue, faces left)

| id | What | Origin | Size |
|---|---|---|---|
| `d2-dumper` | chassis, fat tyres, seat and backrest, little beacon. **No skip** | ground centre | −212…240 / −380…0 |
| `d2-dumper-skip` | yellow front skip | **tipping pivot**, front bottom corner. Place it at `(−205,−150)`. `rotate(−40)` tips it forward | −34…194 / −176…12 |
| `d2-mud-heap-small`, `d2-mud-heap-big` | mud in the skip, before and after the scoop | same as the skip (inside its group) | top at −210 / −273 |

The seat point is `(140,−226)`; Goose sits there at scale **.8**. The skip's mouth centre
is about `(−125,−326)` in dumper units.

### Cement mixer (Frog's, faces right)

| id | What | Origin | Size |
|---|---|---|---|
| `d2-mixer-chassis` | chassis, cradles, rear hopper and all three tyres (the parts **behind** the drum) | ground centre | −500…400 / −560…0 |
| `d2-mixer-disc` | the wheel disc: white with a bold two-arm orange spiral and a grey hub | **centre**, radius 232 | ±240 |
| `d2-mixer` | orange drum with a real round hole (window radius **220**, centre **`(−150,−330)`**), chute, blue cab, lamp | ground centre | −606…406 / −615…−63 |
| `d2-mixer-door` | overlay: the cab door with its yellow stripe; draw it after Frog | same as the mixer | 160…372 / −266…−96 |

Other anchors: chute mouth `(−590,−92)`; cab sill `(272,−262)`, where Frog sits at scale
**.62**.

### Crane (small, yellow; the jib reaches up-left)

| id | What | Origin | Size |
|---|---|---|---|
| `d2-crane` | carrier with fat tyres, cab front-left with an **empty seat and a red cushion** ("your" seat), turret, dark counterweight with a blank white panel, A-frame jib bracket. **No jib** | ground centre | −236…236 / −461…0 |
| `d2-crane-jib` | lattice jib, drawn pointing **left** along −x, tip pulley at `(−900,0)` | **jib pivot**; place it at `(70,−430)` | −920…30 / −40…40 |
| `d2-crane-trolley` | trolley that rides the jib's bottom chord; its cable leaves at `(0,30)` | its top | 60 × 59 |
| `d2-crane-hook` | yellow and black hook block with a dark hook; **catch point `(−14,134)`** | top (the cable end) | −36…34 / 0…146 |
| `d2-crane-assembled` | body, jib at `rotate(24)`, cable and hook, for far-away use | ground centre | −788…236 / −841…0 |

With the jib at `rotate(24)` its tip is at `(−752,−796)` in crane units. With the crane at
`translate(1355 880)`, the brief's p6 position, that is scene `(603,84)`.

### Playground

| id | What | Origin | Size |
|---|---|---|---|
| `d2-slide` | big red slide (the p6 knob; later on the tower). The chute runs down-**left** | **top hook point**; grab centre ≈ `(−210,170)` | −427…20 / −29…360 |
| `d2-slide-sling` | lifting sling while it hangs from the crane; **ring at `(−200,−150)`** | same as the slide | – |
| `d2-slide-tower` | yellow tower: platform at `y=−380`, cross brace, ladder at the back right, little red roof | ground centre; **slide attaches at `(−104,−380)`** | −152…242 / −630…0 |
| `d2-swing-frame` | blue swing frame | ground centre; hang points `(−80,−424)`, `(80,−424)` | ±296 / −450…0 |
| `d2-swing-seat` | red seat on chains | **hang point**; `rotate()` swings it | ±62 / 0…310 |
| `d2-swing` | frame with both seats (convenience) | ground centre | as frame |
| `d2-sandpit` | sand in a wooden edge | centre | ±198 / −56…90 |
| `d2-sand-bucket`, `d2-sand-spade` | small red bucket, small blue spade | base centre / centre | 64 × 82, 88 × 144 |
| `d2-spring-fish` | teal fish spring rider, facing left | ground centre | −150…188 / −300…6 |
| `d2-roundabout` | striped roundabout with a hand ring | ground centre | ±180 / −232…2 |

### Park gate, sign, ribbon and plan board

| id | What | Origin | Size |
|---|---|---|---|
| `d2-park-gate` | wooden posts with finials, cross beam, flowers at the feet | ground centre. Put the sign at `(0,−640)` and the ribbon at `(0,−260)` | ±369 / −612…0 |
| `d2-park-sign` | cream board, wooden frame, painted corner flowers, blank name panel | centre | ±282 / −112…142 |
| `d2-park-cloth` | **p7 flap**: orange cloth, gold trim, tassel and small star | same as the sign; hinge = top (`y=−146`) | ±302 / −147…232 |
| `d2-ribbon` | red ribbon, post to post, with a big rosette | centre; spans x ±300 | – |
| `d2-ribbon-left`, `d2-ribbon-right` | the snapped halves drooping from the posts | each at its post end: `(∓300,0)` in ribbon units | 96 × 170 |
| `d2-rosette` | the rosette alone (to pop off) | centre | 108 × 134 |
| `d2-scissors` | big ceremonial scissors | pivot screw | −175…244 / ±122 |
| `d2-plan-easel` | plan board on an easel: crayon slide, swings, sandpit, fish rider, sun; blank title panel | ground centre | ±170 / −476…0 |

### Hat box, hats and cabin things (p2)

| id | What | Origin | Size |
|---|---|---|---|
| `d2-hatbox` | the box **open**: interior in perspective, dark corner caps | **bottom centre** | ±256 / −286…6 |
| `d2-hatbox-lid` | **p2 flap**: lid and front panel, latch, stencil hard-hat icon, side handles | same as `d2-hatbox`; hinge = top (`y=−290`) | −280…280 / −290…6 |
| `d2-hardhat-child` | the child's hi-vis hat with a blank white sticker | brim bottom centre | ±141 / −144…5 |
| `d2-vest-folded` | small folded orange waistcoat | centre | 200 × 124 |
| `d2-vest-hang` | spare waistcoat on a peg | peg point | 176 × 230 below it |
| `d2-peg` | wooden peg | hanging point | 36 × 48 |
| `d2-clipboard` | clipboard with a crayon slide drawing | hanging point | 160 × 230 below it |
| `d2-boots-pair` | tiny work boots | ground centre | 153 × 59 |
| `d2-bench` | low bench; top surface at `y=−150` | ground centre | ±280 |

### Horn button (p3)

| id | What | Origin | Size |
|---|---|---|---|
| `d2-horn` | raised red rim, yellow dome, white horn icon | centre, radius 75 | 144 × 152 |
| `d2-horn-pressed` | pressed flat, darker | centre | 144 × 144 |
| `d2-horn-ring` | `sb-digital` soft glow ring (hint, or a flash on press) | centre | ±108 |

### Site furniture, mud and concrete

| id | What | Origin | Size |
|---|---|---|---|
| `d2-cone`, `d2-cone-row` | hi-vis orange cone with two white bands; three in a row | visual centre, base at `y=+50` | 100 × 99; 320 wide |
| `d2-barrier` | red and white striped barrier on dark A-feet, with lamps | ground centre | ±170 / −150…0 |
| `d2-planks` | stack of planks | ground centre | −116…110 / −104…0 |
| `d2-wheelbarrow` | green, facing right | ground centre | −208…144 / −152…0 |
| `d2-spade` | big spade, upright | blade tip | 72 × 308 |
| `d2-sandbag` | bag of sand with a little spill | ground centre | −100…140 / −148…0 |
| `d2-mud-patch` | big lumpy patch (scale it non-uniformly) | centre | 732 × 291 |
| `d2-mud-mound` | mound with a tiny orange flag; the pebble sits at ≈ `(−20,−124)` | ground centre | ±140 / −220…0 |
| `d2-mud-clod`, `d2-mud-clods` | one clod; three falling (`sb-digital`) | centre | 36; 97 × 126 |
| `d2-board` | formwork board with stakes (rotate it to follow the path) | centre | 220 × 44 |
| `d2-pawprint`, `d2-pawprints` | an otter print in concrete; a trail of six walking right | centre; first print | 53 × 49; 339 long |
| `d2-concrete-shine` | wet shine streaks | centre | 210 × 39 |
| `d2-concrete-pour`, `d2-concrete-splash` | `sb-digital` stream from the chute; splash with droplets | chute mouth (top); bottom centre | 44 × 164; 216 × 81 |
| `d2-gate-leaf` | an open plank gate leaf (p3 hoarding) | bottom hinge | 158 × 236 |
| `d2-bird` | small round blue bird (p3 hoarding), facing left | feet | 92 × 54 |

### Bunting, celebration and basics

| id | What | Origin |
|---|---|---|
| `d2-flag-red`, `-yellow`, `-orange`, `-white` | bunting flags, 90 × 110. Letter slots in §3 | **top centre** |
| `d2-bunting-corner` | four small flags on a string from `(0,0)` to `(360,40)`, for the top corners; mirror it for the right | left end |
| `d2-garland` | six tiny flags, 240 wide, to drape on the parked digger and crane (p7) | left end |
| `d2-confetti` | confetti in red, yellow, orange, blue and white (`sb-digital`) | centre |
| `d2-star`, `d2-sparkle`, `d2-shadow`, `d2-pebble`, `d2-moon`, `d2-zzz` | Book 1's basics, copied with `d2-` ids | centre |

### Bedtime (p8)

| id | What | Origin |
|---|---|---|
| `d2-chair` | wooden chair, front view. The hat goes on the top rail at `(0,−420)`, and the folded waistcoat on the seat at `(0,−236)` | ground centre (±132 / −452…0) |
| `d2-basket`, `d2-basket-front` | back and front of the wicker bed | same origin as `d2-tiffin-sleep` |
| `d2-blanket` | small blue blanket with white stars, over her body (her head and the raised paw stay out) | same origin as `d2-tiffin-sleep` |
| `d2-lamp` | bedside lamp (put `url(#d2-grad-glow)` behind it) | base centre (±80 / −240…0) |
| `d2-night-park` | the finished park and the sleeping digger as night-blue silhouettes, for the window | bottom centre (−246…200 / −169…0) |
| `d2-digger-small` at scale ≈ .16 | the toy digger on the windowsill | – |

## 6. Recipes (layering, pivots, tested angles)

These were checked in mock-ups (§8). Positions are the brief's, so adjust them freely.

**Digger with a driver and a moving arm (p1, p3, p4):**

```svg
<g transform="translate(330 860) scale(.75)">
  <use href="#d2-digger-body"/>
  <g transform="translate(318 -420)"><g id="dg-p4-boom"><use href="#d2-digger-boom"/>
    <g transform="translate(220 -150)"><g id="dg-p4-stick"><use href="#d2-digger-stick"/>
      <g transform="translate(60 380)"><g id="dg-p4-bucket-curl"><g id="dg-p4-bucket-tip">
        <use href="#d2-digger-bucket"/><use href="#d2-digger-bucket-mud"/>
      </g></g></g>
    </g></g>
  </g></g>
  <use href="#d2-tiffin-drive-steer" transform="translate(-80 -317) scale(.55)"/>
  <use href="#d2-digger-glass"/>   <!-- optional -->
  <use href="#d2-digger-door"/>
  <text class="sb-name" x="-80" y="-286" font-size="40" data-max-width="200" …>NAME</text>
</g>
```

All arm drives rotate about `origin: [0,0]`, because each group's origin is its pivot.

- **p3, asleep → awake.** Start at `rotate(0)` everywhere. On completion, lift the arm:
  boom `[0,−18]`, stick `[0,−20]`, bucket `[0,−30]`. Show `d2-digger-lights`,
  `d2-beacon-glow` and `d2-beacon-rays` (at `translate(−120 −694)`, with `sb-spin-slow` on
  a wrapper), plus two `d2-puff` at the exhaust `(150,−520)`. Put `d2-horn` at
  `(226,−348)` in digger units. At digger scale `s`, the button's scene radius is `75·s`,
  so set the control `radius` to match.
- **p4 pull-tab scoop** (tested frames: the bucket clears the skip). Use two nested boom
  groups so the boom can rise and then settle:
  - outer boom: `[0,−24]` over `range [0,.45]`
  - inner boom: `[0,+15]` over `[.45,.8]`
  - stick: `[0,−54]` over `[0,.8]`
  - bucket curl: `[0,−35]` over `[0,.8]`
  - bucket tip: `[0,+80]` over `[.8,1]`
  - At p=1 the wrist is about `(560,−60)` from the boom pivot. Put the dumper's skip
    mouth about 250 below and slightly left of that: with the digger at
    `translate(330 860) scale(.75)`, that is the dumper at `translate(1170 880) scale(.72)`.
  - The tab itself sits at `translate(250 860)` (control `from [250,860]`, `to [60,860]`),
    with its slot at `x=326, y 816…904`: at least 70 units clear of the bottom edge,
    so on a portrait phone the whole tab and its pointing-hand hint stay inside the
    picture and the touch area is a full 56 px (it was at y 930, half off the edge).
  - Show `d2-mud-heap-big` and swap Goose for `d2-goose-drive-honk` on completion.
    `d2-mud-clods` can drop during `[.3,.7]`.
- **p1 cover, raised arm**: boom −34, stick −62, bucket −38 (or use `d2-digger-raised`).
  Tiffin leaning out: `d2-tiffin-lean-wave` at `translate(-70 -300) scale(.78)` (bigger than
  in-cab, so she pokes out of the window), then `d2-digger-door`.

**Dumper (p4):** `d2-dumper`, then `d2-goose-drive` at `translate(140 -226) scale(.8)`,
then the skip group at `translate(-205 -150)` holding `d2-dumper-skip` and a
`d2-mud-heap-*`. The skip covers the bottom of Goose's steering column.

**Mixer (p5), in this order:**

1. `d2-mixer-chassis`
2. the wheel: `<g transform="translate(-150 -330)"><g id="dg-p5-drum"><use href="#d2-mixer-disc"/></g></g>`
3. `d2-mixer`
4. Frog: both `d2-frog-cab-*` at `translate(272 -262) scale(.62)`
5. `d2-mixer-door`

The window is a real hole, so only the disc shows through it. To hit the brief's wheel
exactly (centre `[1000,520]`, radius 220), place the mixer at `translate(1150 850)
scale(1)`; the tyres then reach y=850. At another scale `s`, the control radius is `220·s`.
The pour is `d2-concrete-pour` at the chute mouth `(−590,−92)`.

**Crane and slide (p6):**

- `d2-crane` at `translate(1355 880)`, then `<g transform="translate(70 -430) rotate(24)"><use href="#d2-crane-jib"/></g>`.
  If you move the crane, keep the jib group inside the crane's transform.
- The trolley stays **upright**, so don't nest it in the jib. Its top at distance `d` along
  the jib's bottom chord is, in crane units: `x = 70 − .9135·d − .4067·b`,
  `y = −430 − .4067·d + .9135·b`, with `b = 38 − .0178·d`. For example, d=300 →
  `(−217,−522)`, d=500 → `(−399,−607)`, d=700 → `(−580,−691)`.
- Draw the cable as a `#3B3F46` line of width 7, from the trolley's `(0,30)` straight down
  to `d2-crane-hook`. Hang the slide by its sling ring: hook origin = ring + `(14,−134)`.
- The knob group (`#dg-p6-slide`) holds the cable stub, `d2-crane-hook`, `d2-slide-sling`
  and `d2-slide`. At the end of the slide, the `d2-slide` origin must land on the tower's
  attach point: tower origin + `(−104,−380)`×scale. On completion, hide the sling, hook and
  cable, and show a copy of `d2-slide` in place. Draw it **before** `d2-slide-tower` so the
  post hides its hook.

**Hat box flap (p2):**

1. `d2-bench` at `translate(1200 900) scale(.93)`
2. `d2-hatbox` at `translate(1200 760)`
3. inside it, `d2-vest-folded` at box `(150,−50) scale(.8)`, then `d2-hardhat-child` at box
   `(−50,−30) scale(1.13)`
4. the sticker's `sb-name` (and its print star) in the same group as the hat
5. `<g id="dg-p2-lid"><use href="#d2-hatbox-lid"/></g>` with the same transform as the box;
   hinge `top`

For siblings, repeat the hat at x 1030 / 1200 / 1370 at scale ≈ .6.

**Park sign flap (p7):**

- In the gate group (`translate(800 900)`): `d2-park-gate`, the sign group at `(0,−640)`
  (`d2-park-sign`, the name slot and the "Park" text), and `d2-ribbon` at `(0,−260)`.
- The flap is `d2-park-cloth` with the sign's transform, hinge `top`.
- On completion, hide `d2-ribbon` and show `d2-ribbon-left` at `(−300,−260)` and
  `d2-ribbon-right` at `(300,−260)`. Let `d2-rosette` pop off.

**Sleep stack (p8):** in one group, e.g. `translate(760 760) scale(.9)`:

1. `d2-basket`
2. `<g transform="translate(-40 -200)"><g id="dg-p8-paw"><use href="#d2-tiffin-sleep-arm"/></g></g>`
3. `d2-tiffin-sleep`
4. `d2-blanket`
5. `d2-basket-front`

Put Tiffin's own hat (`d2-hardhat`) on the floor beside the basket. Hang the child's hat
on the chair: put the hat, its name slot and its print star in one group at chair
`(0,−420)`, with `rotate(−6)` on the group so the name tilts with the hat.

**Swings:** `d2-swing-frame`, then `d2-swing-seat` at each hang point, each wrapped in a
group with `sb-sway`.

**Bunting letters (p7):** hang `d2-flag-*` at their top centres along your string, and
put one `sb-letter` per flag at flag `(0,58)`. Alternate red, yellow, orange and white.

## 7. Tiffin, for anyone drawing around her

- She is Book 1's otter, and the head is Book 1's head, unchanged: wide flat head, small low
  ears, heart-shaped cream muzzle, rounded-triangle nose, "w" smile, three whiskers each
  side, big round eyes with two highlights, rosy cheeks, slim body, long thick tapering tail.
- **Work kit:**
  - A hi-vis yellow hard hat with a centre ridge, two side ribs, a glint and a front peak.
    It sits on her head, and her ears peek out under the brim.
  - Her curly tuft pokes out under the front brim as two kiss curls, just left of centre.
  - A hi-vis orange waistcoat with two silver hoops, silver braces and a cream V at the
    throat. Her arms are bare fur, and a small orange shoulder cap covers each arm root.
  - Her cream tummy shows below the waistcoat.
  - Chunky black work boots with yellow criss-cross laces. She wears no shorts, so her legs
    are brown fur.
- Expressions in use: open smile, grin (teeth), "w" smile, tongue-out concentration, eyes
  shut with joy (^ ^), sleepy closed eyes. She always looks at the reader or at what she is
  doing.
- Proportions at scale 1:
  - head centre y≈−447 (as in Book 1), hat ridge y≈−661, shoulders y≈−311
  - waistcoat hem y≈−180, boots end at y=0
- In the cab poses the head centre is at `(0,−282)` from the seat point.
- **Goose and Frog** are Book 1's characters too. They wear a hi-vis yellow band with two
  silver hoops and an orange hard hat (`d2-hardhat-orange`). Frog has green hands in this
  book. His goalkeeper gloves belong to the football story.

## 8. How it was checked

`defs.svg` is generated by a scratch script, which is not shipped:
`art2-library/gen2.mjs` with `lib.mjs`, `tiffin.mjs`, `friends.mjs`, `machines.mjs` and
`props.mjs`, in the session scratchpad. It reuses the Book 1 generator's Tiffin builders
(head, tail, paws, poses). The file was checked in headless Chromium in five ways:

- **A contact sheet**, with every item's origin and bounding box marked.
- **A character line-up** on one ground line.
- **Rough mock-ups of all eight scenes**, including these states:
  - hat box open and closed
  - digger asleep and awake (lights, beacon, puffs, horn pressed)
  - the p4 scoop at p = 0, .2, .4, .6, .8, 1
  - mixer stuck and turned (disc, pour)
  - crane with the slide hanging, and the slide installed
  - sign revealed, and cloth closed with the ribbon snapped
  - bedtime
- **A two-book test page**, which loads Book 1's and Book 2's libraries through the real
  `js/reader/scene.js` `loadDefs()`, sanitiser included. It showed Book 1's p1 and p5
  scenes next to Book 2 mock-ups: no duplicate ids, no missing `<use>` targets, and all 141
  `d2-` ids survived sanitising.
- **An id check**: every id starts with `d2-`, there are no clashes with Book 1, every
  internal `href`/`url()` resolves, and there is no `<text>`, script, style, filter or
  external reference.
