# Print production: making the physical book

*Draft 1, 24 September 2026. Written for the founder of Made Happy.*

Related documents: [Product plan](product-plan.md) (section 6 covers print economics and route to market), [Series bible](series-bible.md) (Book 1's mechanisms and scene briefs), [Architecture](architecture.md) (scene format, print layers, magic window), [Compliance checklist](compliance-checklist.md) (toy safety and QR permanence) and the illustrator's guide `books/tiffin-football/ART.md`.

> **How to read the evidence.** Very little about print production could be checked. Printer websites, Nosy Crow, Amazon, Nielsen and HMRC were all blocked during the research. The specs, prices, printer names and lead times below are general industry knowledge, marked *(to verify: low)*. **Get written quotes before spending money.** Two areas are well evidenced: how camera-tracking engines "see" artwork, which was read in the engines' own source code and documentation, and QR code sizes, which were calculated during the research with a QR library.

**Marks used:** *(to verify)* = medium confidence (seen in several sources, original not opened). *(to verify: low)* = general knowledge, no source checked. No mark = well evidenced, or a fact about the prototype's own files.

---

## The answer in brief

- **Who makes it:** a specialist novelty printer, mostly in southern China and Hong Kong, with a few in Spain and Italy. You often reach them through a UK packager or broker. A freelance paper engineer designs the moving parts and makes blank white test copies called "white dummies" *(to verify: low)*.
- **How long it takes:** about 9-12 months from concept to stock in a UK warehouse, of which 5-7 months runs from final files to warehouse *(to verify: low)*.
- **What it costs:** roughly $2.50-$4.50 a copy at 3,000 copies, $2.00-$3.50 at 5,000 and $1.50-$2.80 at 10,000. These are factory prices before freight, testing and paper engineering *(to verify: low)*. At a £7-£10 shelf price that leaves thin trade margins, so the route to market matters (section 6).
- **Design the art twice:** once for the mechanisms and once for the phone camera. Getting the camera part right is cheap now and impossible to fix after printing (section 3).
- **Four decisions before the art is final:**
  1. **Trim size and page shape.** The app draws each spread at 16:10, but a square board book's spread is 2:1. The printed page and the app's scene must match, or the magic window's name won't line up.
  2. **Matte or gloss lamination.** Gloss is common on board books, but it hurts camera tracking.
  3. **Five or six mechanisms.** Book 1 has six. The cost estimates assume 4-5.
  4. **Words inside the pictures.** Any printed words in the art ("Goal," on the cover, "GO!" on the banner, "BLUES" on the scoreboard) make foreign editions dearer.
- **QR code:** use your own short domain with an upper-case path, error-correction level Q and a size of about 25-30 mm including the blank margin. Print it 100% black on white, put the web address beside it in words, and test it on at least 10 phones (section 7).
- **Try it first:** the prototype's printable test pages (`#/print/tiffin-football`) let you try the magic window on paper before any money goes to a printer (section 8).

---

## 1. What a mechanism board book is

### Typical specs

| Spec | Bizzy Bear-style books | Book 1 "Goal, {name}!" as written | Confidence |
|---|---|---|---|
| Trim (finished size) | About 180 × 180 mm, square | Not set yet (see the shape problem below) | to verify |
| Pages | About 10 board pages (4-5 spreads). The newer "Find and Follow" titles are 8 pages. | A cover, 6 spreads (12 pages) and a bedtime end page, so longer than a typical Bizzy Bear | to verify |
| Mechanisms | One per spread: slider, pull-tab, wheel, push-tab or lift-flap. *Football Player* has five sliders. | Six: 2 flaps, 1 wheel, 2 sliders (one with a linked scoreboard strip) and 1 pull-tab | to verify |
| Board | 1.2-2.0 mm greyboard (the toy-safety research suggests 1.5-2 mm) | – | to verify: low |
| Corners | Rounded | Rounded | to verify: low |
| Finish | Laminated wrap, gloss or matt | Matt preferred, for the camera (section 3) | to verify: low |
| Assembly | Mechanisms assembled by hand | – | to verify: low |
| UK shelf price | £6.99 (Bizzy Bear); £7.99 (Campbell "Busy Books") | Hypothesis: £8.99-£9.99 | to verify |

Parent reviews of Bizzy Bear say the sliders are sturdier than lift-the-flaps, but determined toddlers can tear tabs and food can jam the sliders *(to verify)*.

### The shape problem: decide it first

The prototype draws every page as a 1600 × 1000 scene, a 16:10 rectangle, and treats pages 2-7 as spreads. A 180 mm square board book has a 360 × 180 mm spread, a 2:1 rectangle. The magic window draws the child's name at the scene's coordinates over the camera picture of the real page. **If the printed spread and the app scene have different shapes, the name won't land in the name spot.**

Pick one:

| Option | What it means |
|---|---|
| **A. Keep 16:10 and choose a portrait page** | Each page is 8:10, for example 160 mm wide × 200 mm tall, which gives a 320 × 200 mm spread. The app's scenes stay as they are. |
| **B. Keep a square page and widen the scenes** | Change the scenes to 2:1 (for example 2000 × 1000). The art and the app's mechanism coordinates then need re-laying out. |

The examples are just arithmetic. Ask the printer and paper engineer which trims they make efficiently before choosing. Two more layout questions:

- **The cover is a single page.** Scene 1 is drawn as a landscape rectangle, so the printed cover needs its own layout, and so does the cover's magic-window layer.
- **Is the bedtime end page a single page or a spread?** Decide this with the paper engineer's page plan.

### Book 1 is on the long side

Six spreads plus a cover and end page is more than the roughly 10-page Bizzy Bear format *(to verify)*. The spread with the linked scoreboard strip (page 6) is the most complex mechanism in the book. Don't cut anything yet. Ask for quotes at **both five and six mechanisms**, and decide once you've seen the difference.

---

## 2. Mechanisms and paper engineering

### Who does what

| Who | What they do | Rough cost *(to verify: low)* |
|---|---|---|
| **Freelance paper engineer** | Designs the mechanisms, makes white dummies (usually 2-4 rounds) and supplies the dielines (the cutting and folding templates) and assembly notes | About £1.5k-£6k per title. This is a guess. |
| **The printer's engineering team** | Adapts the design for the factory: materials, assembly steps and tolerances | Usually inside the quote; ask |
| **Packager** (for example Imago in the UK) | Can supply paper engineering and print management together, and deal with the factory for you | A margin on the print price; ask |
| **Test lab** | EN 71 toy-safety tests on production-intent samples ([compliance checklist](compliance-checklist.md) section 4) | About £500-£1,500 per title |

Get the paper engineer's rights assigned to Made Happy in writing ([compliance checklist](compliance-checklist.md) section 7).

### Book 1's mechanisms, in print and on screen

Taken from the [series bible](series-bible.md). The "safety" column comes from the toy-safety research *(to verify: low)*. The camera column comes from the tracking research (section 3).

| Page | Mechanism | In the book | Safety and manufacture | Camera |
|---|---|---|---|---|
| 2 | **Flap**: the kit bag's front panel | Die-cut board flap hinged along the zip line | Hinge strength; rounded flap edges | The name spot (the shirt) is under the flap, so it only shows when the flap is lifted |
| 3 | **Wheel**: warm-up poses | Board disc behind a round window, with a thumb notch at the page edge | The pivot is a classic small-parts failure point: make it captive and tested | The window changes as the disc turns. It's about 11% of the spread, which is fine. |
| 4 | **Slider, there and back**: pass the ball | Football knob in a curved slot | Captive knob with end-stops; food can jam slots | Slot shadows change the picture slightly |
| 5 | **Pull-tab**: Tiffin's dive | Tab from the left edge slides a die-cut Tiffin across the goal | The tab must not pull out; needs an end-stop | A big moving figure, so the target must use the rest position |
| 6 | **Slider plus a linked strip**: the winning goal | Knob up a straight slot; a strip behind the page turns the scoreboard from 0 to 1 | The most complex part: two linked pieces, and more cost | The scoreboard's name spot sits beside a changing window |
| 7 | **Flap**: cloth over the cup | Lift the cloth to reveal the cup's plaque | As page 2 | As page 2 |

### Brief for the paper engineer

- [ ] **Age grading:** 0-5, designed to the under-36-months toy rules. Use captive tabs with end-stops, no detachable rivets or small parts, rounded corners, thick laminated board and no glued-on bits ([compliance checklist](compliance-checklist.md) section 4.4).
- [ ] **Toddler-proof:** chunky tabs, and slots that don't trap food.
- [ ] **A clear rest position for each mechanism.** The art, the camera target and the app's "progress 0" all start from it.
- [ ] **A drawing of each moving part's path** in the page's coordinates. The app's on-screen sliders, wheels and pull-tabs (`books/tiffin-football/book.json`) should follow the same paths as the paper ones, so update them from the final dielines.
- [ ] **Book 1 specifics:** the page 4 slider goes there and back; the page 6 linked strip must turn the scoreboard from 0 to 1 cleanly.
- [ ] **Deliverables:** white dummies (2-4 rounds), dielines, a parts list and assembly notes.
- [ ] **A written assignment of rights.**

---

## 3. Designing the art: for the mechanisms and for the camera

### 3.1 For the mechanisms

This is practical advice, not from the research, so check it with the paper engineer and printer.

- Build the art on the paper engineer's dielines, with die-cuts, slots, windows and hinge lines on their own layer.
- Keep faces, text and name spots clear of slot paths and of anything that slides over them.
- Draw what's under a flap or behind a window as finished art too. It's seen every time the mechanism moves.
- Keep name spots on board that doesn't move, where possible. Book 1's shirt (page 2) and cup plaque (page 7) are revealed by flaps, which is fine: the app shows the name when the flap is lifted.

### 3.2 For the camera (the magic window)

**Why it matters now:** the magic window works in two ways.

- **Baseline:** the grown-up lines the overlay up with the real page by hand. This works with any art.
- **Optional image tracking:** the app recognises the printed page and pins the name to it automatically (MindAR today, possibly 8th Wall's open-source engine later).

Tracking only works if the art was drawn for it, and you can't change printed art. These points come from the engines' own source code and documentation, as read on 24 September 2026:

| Rule | Why | What to do |
|---|---|---|
| **Brightness, not colour** | MindAR turns the image grey by averaging red, green and blue. 8th Wall says image detection "cannot distinguish between colors". A red shape on a green background of similar lightness is invisible to it. | Review every spread in greyscale. |
| **Detail spread across the page** | The engines hunt for corners and texture in a grid across the page. Long clean vector edges and flat fills score poorly. Corners, junctions, hand-drawn line texture, crayon or paper grain and scattered small objects score well. Blank areas are wasted. | Add texture and grain in the print art, even if the screen art stays flat. Avoid big empty skies and walls. |
| **No repeats or symmetry** | Wallpaper, bricks, polka dots and tiles cause wrong matches. So do rotationally symmetric designs. | Vary repeated elements; break up grids. |
| **Each spread looks different** | Features shared across pages, such as the same hero or the same text block, make the engine report the wrong page. | Give each spread a distinct background, so that the background, not Tiffin, carries most of the detail. Consider leaving the text block out of the target image. |
| **Mechanisms at rest, and small** | Sliders, wheels and flaps change the picture and cast shadows in slots. | Make the target images with every mechanism at rest, and keep moving parts a minority of the page. |
| **Small, blank name spots** | A blank area is a hole in the detail. | Keep each name spot small (roughly under 10% of the page) and surrounded by detail. The faint star helps. |
| **Matte finish** | 8th Wall: "Glossy surfaces… can lower tracking quality. Use matte materials in diffuse lighting." | Ask for matt lamination or varnish, and test printed proofs under ordinary home lighting (section 9). |
| **Enough resolution** | MindAR tracks on small internal images; AR.js wants 300 DPI or more. | Supply art at 300 DPI or more. About 1,000 px on the short side is plenty for making a MindAR target. |

#### Book 1's palette as the camera sees it

These greys were calculated from the series bible's colours with MindAR's formula, (R + G + B) ÷ 3, on a 0 (black) to 255 (white) scale.

| Colour | Grey | Colour | Grey |
|---|---|---|---|
| Tiffin brown `#B0703F` | 117 | Sky `#9FDCF7` | 209 |
| Kit red `#E4483A` | 119 | Sunny yellow `#FFCB3D` | 173 |
| Grass `#74C655` | 133 | Cone orange `#F59A2B` | 147 |
| Grass stripe `#86D166` | 148 | Scarf blue `#3E7BDB` | 135 |
| Hedge `#5BAE45` | 111 | Frog green `#3DAA5C` | 108 |
| Boot black `#2B2B2B` | 43 | Cream `#F7E6CC` | 227 |
| Night wall `#2F3A66` | 69 | White | 255 |

**What this shows:** Tiffin's brown (117), her red kit (119) and the grass (133) are almost the same grey. To the camera, Tiffin in her kit on the pitch is a nearly flat patch, separated only by her darker outlines. The same goes for Frog (108) against the hedge (111), and the blue scarves (135) against the grass. The screen art can stay as it is, but for print, ask the illustrator for more light-dark contrast and texture where characters meet the background.

#### Book 1's specific risks

| Risk | Where | Suggestion |
|---|---|---|
| Repeating grids | Goal nets (pages 1, 5 and 6), mowing stripes, bunting (pages 1, 3 and 7), confetti (page 7) | Vary them: a net with a hole or a tangle, bunting in different sizes, irregular confetti |
| Rows of look-alike figures | The crowd stands (pages 4, 6 and 7) | Mix sizes, poses and props |
| The same element on two pages | An identical scoreboard top right on pages 5 and 6; the crowd banner on pages 4 and 7; Tiffin on every page | Change one scoreboard's surroundings; make the backgrounds carry the detail |
| Big flat areas | The sky on page 1 (top 62%), the wall on page 2, the night wall on page 8 | Clouds, texture, wallpaper that isn't a regular pattern, pictures on the wall |
| The text block | The same typeface in the same place on every spread | Leave it out of the target crop |

#### Targets per page or per spread?

- 8th Wall's target tool crops to a 3:4 upright shape, so a spread would have to become two per-page targets.
- MindAR accepts any shape, but tracking a whole spread means holding the phone about 30-40 cm away, which is an estimate.

Decide from tests on printed proofs.

#### Check the art with the tools

MindAR's target compiler can show the detail points it found, and 8th Wall's `image-target-cli` builds its targets. Run each final spread through both before sign-off.

#### If tracking fails the tests

- Add a small decorative "badge" in a page corner that the phone can read reliably, such as a stylised paw print built on an ArUco marker (a square black-and-white code that a small JavaScript library, `js-aruco2`, can read in any browser).
- Don't print a QR code on every spread. It clashes with the picture-book look. The single QR on the back cover is fine.

#### Engine risks, briefly

- MindAR (the prototype's optional tracker) has had no updates since January 2024. There is one unreproduced report (issue #581, August 2026) of it failing to start on iOS 27 *(to verify)*.
- 8th Wall's new open-source engine was published on 17 September 2026 and is marked "pre-release".

Neither changes the art rules above. Both are reasons to keep the hand-aligned baseline, and to test on real phones before promising tracking on the box.

---

## 4. Printers and packagers to approach

### Who

These names are **commonly cited** novelty and board-book specialists *(to verify: low)*. None was contacted and their websites couldn't be opened.

| Where | Names |
|---|---|
| Southern China and Hong Kong | Leo Paper Group (Heshan; known for pop-ups and novelty), Hung Hing Printing (Shenzhen), 1010 Printing, Everbest Printing (Guangzhou), Toppan Leefung, C&C Offset, Golden Cup |
| Europe | Grafo and Egedsa (Spain), L.E.G.O. (Italy) |
| UK packager or broker | Imago |

**Suggested approach:** ask 3-4 specialist printers and at least one UK packager for written quotes.

### What to send them

A one-page spec sheet:

- **Format:** trim size (see section 1), page count, board thickness and rounded corners.
- **Printing:** four-colour both sides. Keep the text in black only, so it can change for co-editions.
- **Finish:** matt lamination. Ask for a gloss price too, for comparison.
- **Mechanisms:** the list from section 2, with the white dummy or photos, and whether paper engineering is supplied or needed.
- **Age grading:** 0-5, under-36-months toy rules; markets UK first, then EU and US.
- **Quantities:** 3,000, 5,000 and 10,000.
- **Delivery:** ex-works (you arrange shipping) and delivered to a UK warehouse, so you can compare.

### What to ask for in the quote

- [ ] **Unit price at 3,000, 5,000 and 10,000**, at both **five and six mechanisms**.
- [ ] **Matt lamination on board:** can they do it, and what's the price difference from gloss?
- [ ] **Paper-engineering adaptation:** is it included? How many rounds of dummies?
- [ ] **Proofs:** printed proofs on the real board and laminate (not just a screen PDF), and their cost.
- [ ] **Toy safety:** who arranges EN 71-1/-2/-3 testing, and the cost per title. Can they supply material declarations for inks, varnish and board (for EN 71-3) and help with the technical file? Have they made under-36-months mechanism books for the UK and EU before?
- [ ] **Markings:** can they print a batch number, and apply CE/UKCA marks and US tracking labels if needed?
- [ ] **Packaging:** shrink-wrap or not, carton size and copies per carton.
- [ ] **Timeline:** production time after proof approval, the Chinese New Year shutdown and the next free slot.
- [ ] **Freight:** a delivered-to-UK price or a named freight partner, and sea-freight time.
- [ ] **Terms:** deposit and payment schedule, overs and unders (the accepted margin of copies over or under the order), reprint price and minimum reprint quantity.
- [ ] **Co-editions:** the cost of a black-plate change for another language.
- [ ] **Small runs:** can they do 1,500-2,000 copies, and at what premium?

Put the answers in one table so the quotes can be compared line by line.

---

## 5. Lead times

All *(to verify: low)*. Plan from real quotes.

| Step | Typical time |
|---|---|
| Paper engineering: design and 2-4 rounds of white dummies | Weeks to a few months (not researched) |
| Final art on the final dielines, plus camera checks | Depends on the illustrator |
| Pre-press and printed proofs | A few weeks (not researched) |
| Production after proof approval | 8-12 weeks |
| Sea freight to the UK | 5-8 weeks, longer since 2024 because of Red Sea diversions |
| Chinese New Year shutdown | Weeks around late January or February; plan around it |
| **Final files to UK warehouse** | **About 5-7 months** |
| **Concept to stock** | **About 9-12 months** |

EN 71 testing runs on production-intent samples, so leave room in the plan for the results before shipping.

---

## 6. Rough economics (all to verify)

**None of these numbers could be checked. They're general industry estimates with no source behind them.** Use them to shape questions, not to decide.

### Per copy

| Item | Estimate *(to verify: low)* |
|---|---|
| Factory price (ex-works China), about 10 pages, 180 mm square, 4-colour, laminated, 4-5 hand-assembled mechanisms | 3,000 copies: $2.50-$4.50. 5,000: $2.00-$3.50. 10,000: $1.50-$2.80. |
| A plain board book, for comparison | $0.60-$1.20 |
| Freight, duty and warehousing | Not researched: get quotes |
| A different QR code on every copy (not recommended) | About $0.02-$0.10 extra, plus hand application and checks |

### Per title (fixed costs)

| Item | Estimate *(to verify: low)* |
|---|---|
| Paper engineer | About £1.5k-£6k (a guess) |
| EN 71 testing | About £500-£1,500 |
| ISBN (from Nielsen, the UK agency) | About £90+ for one; cheaper in blocks of 10 or 100 |
| Author and illustrator fees | Not researched |
| White dummies and printed proofs | Not researched: ask the printer |

### What Made Happy receives per copy

| Channel | Discount off the shelf price *(to verify: low)* | At £9.99, Made Happy gets |
|---|---|---|
| Bookshops (through a distributor) | 40-55% | About £4.50-£6.00, before distributor fees (not researched) |
| Amazon | 55-60% | About £4.00-£4.50 |
| Direct from your own site | 0% | £9.99 (or £12.99-£16.99 if sold as a premium personalised product), minus postage, packing and payment fees (not researched) |

**VAT:** printed children's books are generally zero-rated in the UK, but novelty or toy-like items can be treated differently *(to verify: low; check with HMRC)*. If the book were standard-rated, VAT would come out of the shelf price.

### The headline

Publishers usually aim for a landed cost (unit cost including freight) of about 15-20% of the shelf price. That's about £1.20-£1.60 at £7.99, or £1.50-£2.00 at £9.99 *(to verify: low)*. The factory estimates above, plus freight, sit above that at 3,000-5,000 copies. That doesn't kill the idea, but it pushes towards one of these:

1. **Selling direct** at a premium.
2. **Co-editions** with foreign publishers, which combine print runs. Keep all words in the black plate. The blank name spots help, because they are the same in every language. Printed words inside the pictures ("Goal," on the cover ribbon, "GO!" on the banner, "BLUES" on the scoreboard) are in colour, so a foreign edition would need a colour-plate change. Either accept that, or move those words into the black plate.
3. **Licensing** the format and web app to an established novelty publisher.

The [product plan](product-plan.md) (section 6) compares the three. The digital side is cheap by comparison: see [voice-and-audio-options.md](voice-and-audio-options.md).

### Publishing basics *(to verify: low)*

- Amazon KDP and IngramSpark print-on-demand can't make board books, so the book must be litho-printed (conventional printing in large runs) and sold through the book trade or direct.
- Buy ISBNs from Nielsen and list the title on Nielsen Title Editor, so shops and Amazon get the details.
- Legal deposit: send one copy to the British Library within a month of publication.

---

## 7. The QR code on the back cover

### The spec

| Item | Spec | Why |
|---|---|---|
| **What it encodes** | A short link on a domain you own, with an upper-case path, for example `HTTPS://MHAPPY.UK/B1`. That domain is only an illustration from the research; nobody has checked whether it's available. | Upper-case letters and digits fit QR's compact "alphanumeric" mode, which makes a smaller, easier-to-scan code. |
| **Where it goes** | Your server answers `/B1` (and `/b1`: accept both cases) with a temporary (302) redirect to the reader, for example `/b/tiffin-football`, which the app already understands. | You can move the app later without reprinting. Browsers cache a permanent (301) redirect for good. Never use a third-party "dynamic QR" service. |
| **Error correction** | Level Q, which survives about 25% damage | It copes with scuffs, sticky fingers and glare. |
| **Size** | About 25-30 mm square **including** a 4-module blank margin (the quiet zone). Modules at least 0.6-0.75 mm. `HTTPS://MHAPPY.UK/B1` at level Q is a 25 × 25 grid, so about 24.8 mm at 0.75 mm per module, margin included. | Calculated during the research. For comparison, a lower-case `https://madehappy.co.uk/b/football` needs a 33 × 33 grid (about 30.8 mm), and a long link with a query string about 36.8 mm. |
| **Ink** | 100% black ink only, on a white panel. No "rich black" (black mixed with other inks), and no reversed white-on-black. | The research advises this (the general guidance behind it wasn't verified). |
| **Placement** | On the flat back cover, away from the rounded corners and the spine. | Curves and edges distort the code. |
| **Beside it** | The web address in words, for example `mhappy.uk/b1`, and the label "For grown-ups". | For phones that won't scan, and parents who'd rather type. |
| **What it never contains** | The child's name, personal data or tracking IDs. One code per title, not per copy. | Privacy, and the code never needs to change. |

**Permanence:** the domain must outlive every printed copy. Set it to auto-renew, keep a plain MP3 fallback on the same domain, and plan for the code also to serve the EU's toy Digital Product Passport from 2030. See the [compliance checklist](compliance-checklist.md), section 5.

### Scan testing

- [ ] **Test the printed proof, on the real laminate**, not a screen or office print. Gloss glare is a known problem.
- [ ] **Use at least 10 phones:**
  - iPhone Camera
  - Google Lens
  - Samsung's camera
  - Chrome's and Samsung Internet's QR scanners
  - a couple of older, cheaper Android phones
  - an older iPhone.
- [ ] **Test at arm's length, at an angle, and in dim evening light.**
- [ ] **Check what opens.** Some scanner apps and social apps (Instagram, Facebook) open links in their own built-in Android browser, which has no speech and blocks the camera by default. The app should notice this and offer "Open in Chrome".

### Making the file with the prototype

- **`tools/make-qr.mjs`** is the prototype's command-line QR tool. It makes the code as a vector (SVG) file from a URL, which is what a printer wants. The tool wasn't yet in the repo when this was written, so check the notes at the top of the file for its options. Before the file goes to the printer, check three things:
  1. **Level Q.** The app's on-screen QR helper (`js/ar/qr.js`) defaults to level M.
  2. **A 4-module quiet zone.**
  3. **Pure black, `#000000`.** The on-screen default is the app's ink colour, `#2B2A33`, a dark blue-grey that would print as a mix of inks.
- **The production link, not the prototype's.** The prototype's codes point at wherever the prototype happens to be hosted (`…/?b=tiffin-football`). That's fine for testing, but never send it to the printer. The printed code must carry the permanent short link from the table above.
- **`#/qr/tiffin-football`** shows the book's code on a laptop screen, so you can scan it with a phone during demos.

---

## 8. Trying the magic window before the real book exists

You don't need a printed book to test the idea with families.

1. **Open `#/print/tiffin-football`** (in the app: Settings, then "Printable test pages"). It lays out each page on A4 landscape the way the printed book will look:
   - the scene at rest
   - the name spots left blank, with their faint star
   - a back cover with the QR code.
2. **Print it** on a colour printer. Matt paper is closest to the matt laminate you'll want.
3. **Scan the QR on the test back cover** with a phone. Type a name, check how it sounds, and choose "Magic window".
4. **Line the overlay up with the printed page**: drag to move, pinch or use the slider to resize. The app remembers the fit for each book. If a page has a tracking target (`books/tiffin-football/targets.mind`), the app tries to pin the name automatically.
5. **Try it the way families will:** a parent holding the phone, a child touching the paper, ordinary evening light and short bursts.

What you learn from this feeds the art brief (section 3) and the pilot. The test pages are the prototype's own art, not print-ready files, and A4 paper doesn't behave like laminated board, so repeat the checks on the printer's proofs.

---

## 9. Pre-press checklist

Work through this before files go to the printer and again at proof stage.

**Decisions locked**
- [ ] Trim size and page plan (cover, 6 spreads, end page) agreed with the paper engineer and printer.
- [ ] The printed spread and the app's scene have the same shape (section 1), and the cover has its own layout.
- [ ] Number of mechanisms (five or six) chosen from real quotes.
- [ ] Matt or gloss chosen after testing tracking and QR scanning on proofs.
- [ ] Words inside the pictures: keep them in colour, or move them into black for co-editions.

**Art files**
- [ ] Built on the final dielines, with die-cuts, slots, windows and hinge lines on their own layer.
- [ ] Bleed, safe area, colour profile and file format to the printer's written spec.
- [ ] Raster art at 300 DPI or more at final size.
- [ ] Nothing important in slot paths, under moving parts' travel, near rounded corners or in the spine.
- [ ] Art under flaps and behind windows finished.
- [ ] Every name spot blank, with the faint star (the app uses its yellow star at 25% opacity), small (roughly under 10% of the page) and surrounded by detail.
- [ ] The lucky pebble on every spread and the end page (series bible).

**Camera checks** (section 3)
- [ ] Every spread reviewed in greyscale, with light-dark contrast where characters meet the background.
- [ ] Texture and detail across each page, with no large flat areas.
- [ ] No regular repeats, and no identical elements on two pages.
- [ ] Each spread run through MindAR's compiler visualiser and 8th Wall's `image-target-cli`.
- [ ] Target images exported with every mechanism at rest, at least 1,000 px on the short side.
- [ ] Tracking tested on a printed proof under home lighting, on the device test list.

**Text**
- [ ] Every personalised line has a print version without the name ("Where is your shirt?", "Goal! Goal, goal, goal!"), as the series bible requires. The app's book data doesn't hold the print text yet, so keep it as a separate print script.
- [ ] Proofread, and read aloud with no phone in the room: the printed book must work on its own.
- [ ] All running text in the black plate.

**Back cover and legal marks** *(which marks are needed is to verify with the lab and lawyer; [compliance checklist](compliance-checklist.md) section 4)*
- [ ] The QR code to the spec in section 7, with the web address in words and "For grown-ups".
- [ ] ISBN and barcode.
- [ ] CE and/or UKCA mark.
- [ ] Manufacturer's name and postal address (and an electronic address), plus a batch or type number.
- [ ] Warnings, if any, in English, starting with "Warning". In the EU, in each market's language.
- [ ] Age grading.
- [ ] The EU economic operator's address, if selling in the EU. The US tracking label, if selling in the US.

**Proofs and samples**
- [ ] White dummies signed off.
- [ ] Printed proofs on the real board and laminate checked for colour, cut and fold.
- [ ] Every mechanism worked 50+ times on the proof (a sanity check, not a safety test).
- [ ] QR scan test on the proof with at least 10 phones.
- [ ] Magic-window test on the proof.
- [ ] Production-intent samples sent to the test lab; EN 71 reports received before shipping.

**Paperwork and digital side**
- [ ] Assignment agreements signed by the author, illustrator and paper engineer.
- [ ] Declaration of conformity and technical file started (keep for 10 years).
- [ ] ISBN registered and title listed on Nielsen Title Editor.
- [ ] Domain bought, set to auto-renew, and the redirect live for both `/B1` and `/b1`.
- [ ] The book's page published, tracking targets made from the final art, and the MP3 fallback uploaded.

---

## 10. The older range (under-10s)

The [product plan](product-plan.md) (section 5) proposes two older ranges on the same engine: "Commander {name}" for ages 5-7 and "Mission {name}" (space puzzles) for 7-10. For print:

- **Different formats.** They'd be picture-book or first-reader formats with fewer, simpler mechanisms (lift-flaps, a pull-tab, one wheel). The 7-10 books would use activity mechanisms: decoder wheels, star-chart volvelles (rotating paper-disc charts) and fold-outs. Get separate quotes, and don't assume the under-5 economics carry over.
- **Probably still a toy.** A book with play value likely counts as a toy, but the older age grading changes which tests and warnings apply *(to verify with the test lab)*.
- **Space art is hard for the camera.** Night skies are big, dark, flat areas, and evenly spaced stars are a repeating pattern. Fill the sky with varied, irregular detail: planets, craters, hand-drawn texture and clusters of different-sized stars.
- **Decoder wheels need registration.** Where a puzzle's answer depends on a wheel lining up with printed symbols, ask the paper engineer about tolerances, so the answer works on every copy.

---

## Sources

**Bizzy Bear format and price (search summaries; pages not opened)**
- https://nosycrow.com/product/bizzy-bear-football-player/
- https://www.waterstones.com/book/bizzy-bear-football-player-20/benji-davies/9781788008426
- https://www.amazon.co.uk/Bizzy-Bear-Football-Benji-Davies/dp/1788008421
- https://nosycrow.com/book/bizzy-bear-going-shopping-34/
- https://nosycrow.com/book/bizzy-bear-find-and-follow-on-the-farm/
- https://nosycrow.com/blog/a-new-look-for-bizzy-bear/
- https://screenwiseapp.com/media/bizzy-bear-recycling-truck-book
- https://uk.bookshop.org/p/books/bizzy-bear-farmyard-fun-nosy-crow/2464236
- https://www.panmacmillan.com/series/campbell-busy-books/s103655110927
- https://nosycrow.com/stories-aloud/

**Printers, costs, lead times, ISBNs and distribution**
- No sources. These are general industry knowledge from the research and all need checking.

**Camera tracking and artwork**
- https://registry.npmjs.org/mind-ar/-/mind-ar-1.2.5.tgz
- https://raw.githubusercontent.com/hiukim/mind-ar-js-doc/master/docs/quick-start/compile.md
- https://raw.githubusercontent.com/hiukim/mind-ar-js-doc/master/docs/quick-start/tracking-config.md
- https://github.com/hiukim/mind-ar-js
- https://github.com/hiukim/mind-ar-js/issues/581
- https://raw.githubusercontent.com/8thwall/8thwall.github.io/main/docs/engine/guides/image-targets.md
- https://raw.githubusercontent.com/8thwall/8thwall/main/apps/image-target-cli/README.md
- https://raw.githubusercontent.com/8thwall/8thwall/main/packages/engine/README.md
- https://raw.githubusercontent.com/8thwall/8thwall.github.io/main/docs/migration/faq.md
- https://registry.npmjs.org/@8thwall/engine
- https://raw.githubusercontent.com/immersive-web/image-tracking/main/explainer.md
- https://raw.githubusercontent.com/AR-js-org/AR.js-Docs/master/docs/image-tracking.md
- https://raw.githubusercontent.com/wiki/Carnaux/NFT-Marker-Creator/Creating-good-markers.md
- https://registry.npmjs.org/js-aruco2

**QR codes**
- https://raw.githubusercontent.com/soldair/node-qrcode/master/README.md
- The sizes were calculated during the research with the segno QR library.

**Built-in browsers in social and scanner apps**
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechSynthesis.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json
- https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/main/core/java/android/webkit/WebChromeClient.java

**Toy safety (see the compliance checklist for the full list)**
- https://www.gov.uk/government/publications/toys-safety-regulations-2011/toys-safety-regulations-2011-great-britain (quoted, not opened)
- https://api.github.com/repositories/1222283299/contents/data/corpus/processed/UK_Official_uk-toys-safety-regulations-2011-gb.json?ref=21e4bf57a8b462b053fd5bb0a3bc49c1037bba0f

Internal: [series-bible.md](series-bible.md) (mechanisms, palette, scene briefs), [architecture.md](architecture.md) (scene format, print layers, magic window, QR helper), `books/tiffin-football/ART.md` (illustrator's guide) and `books/tiffin-football/scenes/*.svg` (name spots and faint stars).

---

## Open questions / to verify

**Format and specs**
- [ ] Bizzy Bear's actual trim size, page count, board thickness and shelf price (£6.99 or £7.99).
- [ ] Which trims do novelty printers make efficiently? Portrait (to keep the app's 16:10 spreads) or square (to change the scenes to 2:1)?
- [ ] Is Book 1's page plan (cover, 6 spreads, end page) a standard board count, or does it need adjusting?

**Printers, cost and time**
- [ ] Written quotes for 3,000, 5,000 and 10,000 copies at five and six mechanisms, including freight to the UK.
- [ ] Are there UK or EU printers for short novelty runs (1,500-2,000 copies)?
- [ ] Paper-engineer fees, dummy rounds and real lead times.
- [ ] EN 71 test costs per title, and whether the printer arranges them.
- [ ] Does HMRC zero-rate mechanism board books for VAT? What are the US tariffs on China-printed board books?
- [ ] Current ISBN prices. Confirm that print-on-demand can't make board books.
- [ ] Distributor fees and terms for a new small publisher.

**Finish and camera**
- [ ] Can the printer do matt lamination on board, and at what price difference?
- [ ] Do die-cut slots and their shadows break tracking of the art around them?
- [ ] Per-page or per-spread targets: decide from printed proofs.
- [ ] Is MindAR's iOS 27 start-up failure (issue #581) real on release builds, and does the suggested workaround fix it? How stable is 8th Wall's open-source engine on mid-range phones?

**QR**
- [ ] Which short domain to buy, and is it available? (`MHAPPY.UK` is only an example.)
- [ ] Does gloss or matt laminate affect scanning on older phones? (Proof test.)
- [ ] Which QR scanner apps do UK parents actually use, and which of them open links in built-in browsers that block the camera?
- [ ] Check `tools/make-qr.mjs` once it's in the repo: level Q, quiet zone, pure black, SVG output.
