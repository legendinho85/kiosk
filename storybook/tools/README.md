# Tools

Small Node scripts (Node 20+, no dependencies) for preparing books and print files.

| Script | What it does |
|---|---|
| `build-book.mjs` | Merges `books/<id>/book.draft.json` (the story) with the illustrators' `pages/pN.json` into `book.json`, then validates it. `node tools/build-book.mjs tiffin-football` |
| `check-lexicon.mjs` | Checks the pronunciation dictionary (`data/names.json`). `node tools/check-lexicon.mjs --strict` |
| `make-qr.mjs` | Print-ready QR codes for the back covers (below). |

The magic window's optional image tracking needs a `targets.mind` file per book. There's no script for it yet; see [Image tracking targets](#image-tracking-targets-targetsmind) below.

---

## QR codes for the back cover: `make-qr.mjs`

```sh
# One code per book, pointing at where the app is hosted:
node tools/make-qr.mjs --base https://example.com/app/                # every book in books/index.json
node tools/make-qr.mjs --base https://example.com/app/ --book tiffin-football --out print/

# Better for the real print run: your own short link (see "Why a short link" below):
node tools/make-qr.mjs --url HTTPS://MHAPPY.UK/B1 --book tiffin-football --out print/
```

It writes `print/<book>-qr.svg` and prints a summary:

```
print/tiffin-football-qr.svg
  opens     HTTPS://MHAPPY.UK/B1
  code      version 2, 25 x 25 modules, level Q, alphanumeric mode
  printed   24.8 x 24.8 mm including the quiet zone (0.75 mm per module)
  print it  100% black (K only) on white; put "MHAPPY.UK/B1" beside it in words
```

Options: `--style path` makes `<base>b/<book>` links instead of `<base>?b=<book>`
(both open the book in the app). `--ecl L|M|Q|H` sets error correction (default Q).
`--module-mm 0.75` sets the size of one square. `--help` lists everything.

### What the file is

- **Vector (SVG), sized in millimetres.** Place it in the cover artwork at 100%. It stays sharp at any size.
- **Error correction level Q.** The code still reads with about 25% of it damaged: scuffs, sticky fingers, glare on laminate. The on-screen QR code (`#/qr/<book>`) uses level M, because a screen is never scuffed.
- **A quiet zone of 4 modules.** The blank white margin is part of the code. Don't crop it, and don't let artwork, the cover's edge or a rounded corner eat into it.
- **True black on white.** The squares are `#000000`: print them as 100% K only, never as "rich black" (black plus other inks). Registration errors between inks make soft, fuzzy edges. Never print a code reversed (white on dark).
- **Only the book, never the child.** A printed code opens the book's page (`?b=tiffin-football`) and nothing else. The child's name is typed on the phone and stays there. The tool warns if a link looks like it carries a name.

### How big

- **At least 20-25 mm across, quiet zone included.** 25-30 mm is safer on a board book that will be held at arm's length. `docs/print-production.md` §7 has the research behind these numbers.
- **Each module at least 0.6-0.75 mm.** The tool warns below 0.6 mm or under 20 mm overall.
- A shorter link makes a smaller code at the same module size. A lower-case link with a query string (`https://example.com/app/?b=tiffin-football`) needs a 33 × 33 grid: 30.8 mm at 0.75 mm per module. `HTTPS://MHAPPY.UK/B1` needs 25 × 25: 24.8 mm.
- Put the web address beside the code in words, plus a label like "For grown-ups", for phones that won't scan and parents who'd rather type.
- Keep it on the flat back cover, away from the spine, rounded corners and the hinge. Curves and folds distort the code.

### Test it on many phones before you print

Test the printed proof on the real board and laminate, not a screen or an office print:

- iPhone Camera app, an older iPhone, Google Lens, Samsung's camera, Chrome's and Samsung Internet's QR scanners, and a couple of older, cheaper Android phones: **10 phones or more**.
- At arm's length, at an angle, in dim evening light, and with a glossy reflection across it.
- Check **what opens**. Some scanner and social apps open links in their own built-in browser, which may block the camera and speech. The link should open the reader, and "Add to Home Screen" should work from there.

### Why a short link you control (not a long URL)

1. **Smaller, easier to scan.** A short link in capitals (`HTTPS://MHAPPY.UK/B1`) fits QR's compact alphanumeric mode (digits, A-Z, `:/.-$%*+` and space), so the code has fewer, bigger squares at the same printed size. Your server should accept `/B1` and `/b1`.
2. **You can move the app without reprinting.** The printed code can never change, but where it points can: the short link answers with a **temporary (302) redirect** to the reader, e.g. `/b/tiffin-football`. Don't use a permanent 301: browsers remember those for good.
3. **It outlives hosting changes.** Keep the domain on auto-renew for as long as any copy of the book exists. Never use a third-party "dynamic QR" service: if it closes or starts charging, every printed book stops working.
4. **No tracking and no personal data** in the link. One code per title, not one per copy.

The prototype's own codes point at wherever the prototype happens to be hosted. That's fine for test pages, but never send one to the printer.

---

## Test pages and the magic window

`#/print/<book>` shows printable A4 landscape test pages: every page at rest, the name spots blank with their faint star, and a back cover with the QR code. Print them at 100% ("actual size") to try the magic window before a real book exists (`docs/print-production.md` §8).

In the magic window the grown-up lines the picture up with the page by hand: drag to move, pinch or the slider to resize, a small turn, and a see-through "whole page" guide. The fit is remembered on the phone for each book and each way up. Everything below is an optional extra on top of that.

## Image tracking targets (`targets.mind`)

**Experimental.** If `books/<id>/targets.mind` exists, the magic window loads [MindAR](https://github.com/hiukim/mind-ar-js) 1.2.5 from jsDelivr when the camera starts. It then pins the overlay to the page it recognises, and turning the real page turns the app's page too. When tracking loses the page, or MindAR can't load, the hand-made fit takes over; tracking never blocks it. A book can say `"targets": "path/in/package.mind"` to skip the existence check, or `"targets": false` to switch tracking off.

How to make the file from the final artwork:

1. **Export one image per page, in book order**: page 1 first. Target *i* in the file is page *i + 1*, so every page needs a target, even the cover.
2. Each image must be **exactly the scene area** that the app draws: the 16:10 frame of `scenes/pN.svg`, with no margins, bleed or text block. The overlay is stretched to the target's corners.
3. Use the **printed state**: mechanisms at rest, name spots blank (with their faint star), none of the screen-only extras (`.sb-digital`). The test pages show exactly this, so while prototyping you can screenshot each `.tp-art` box on `#/print/<book>`. For the real book, export from the print files.
4. Make them **at least 1,000 px on the short side** (PNG or JPG).
5. Compile them with MindAR's image-target compiler:
   - the web tool: <https://hiukim.github.io/mind-ar-js-doc/tools/compile>. Add the images in order, compile, download `targets.mind`; or
   - in any browser console, with the same library the app uses:
     ```js
     const { Compiler } = await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
     const c = new Compiler();
     await c.compileImageTargets(images /* <img> elements, page order */, (p) => console.log(`${p.toFixed(0)}%`));
     const blob = new Blob([await c.exportData()]); // save as books/<id>/targets.mind
     ```
     `tests/e2e/ar.e2e.mjs` does this in headless Chromium: it compiles targets from the test pages, films a page at an angle and checks that the overlay lands within a few pixels.
6. Save it as `books/<id>/targets.mind` and check the compiler's feature-point preview. **Test on printed proofs under home lighting.** Tracking depends on the art: light-dark contrast, texture and no big flat areas or repeats. Matt lamination tracks better than gloss. `docs/print-production.md` §3.2 lists the rules and Book 1's risks.

Budget roughly 0.5 MB per page in the `.mind` file. The app only downloads it (and MindAR, about 2 MB) when a grown-up opens the magic window.
