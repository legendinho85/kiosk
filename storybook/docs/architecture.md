# Architecture (prototype)

This is the contract every module in `storybook/` follows. The prototype is a
zero-build web app: plain ES modules, no bundler, no framework, no npm runtime
dependencies. It runs from any static host (`npm run serve`) and is designed so
a parent can scan the QR code on a printed book and be reading within a minute.

## 1. What happens, end to end

```
Printed book back cover ── QR ──▶  https://<host>/?b=tiffin-football   (production: https://<host>/b/tiffin-football)
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
   First visit (parent)                                   Returning visit
   1. Book landing: cover + "What's your child's name?"   Landing shows "Reading for Ava ▸ Start"
      (name box at the top of the page)                   (switch child / add child)
   2. "How do you say Siobhan?" — listen to 2-4
      pronunciations, pick one / type how it sounds /
      say it / record it
   3. Ready: "Start reading" or "Magic window"
             │
             ▼
   Reader (child-facing): page by page, read aloud with the name woven in,
   words highlighted as they're spoken, the page's moving part works on screen
   (slide / turn / pull / lift / push), the child's name appears in the
   pictures (shirt, banner, scoreboard, trophy), "turn the page" to follow the
   physical book.
             │
             ▼
   Magic window (optional): camera view of the real book with the digital layer
   (name, sparkles, moving parts) drawn over it.
```

Everything personal (the name, pronunciation, recordings) stays on the device.

## 2. Hard constraints

- **No build step.** `index.html` loads `js/main.js` as `type="module"`. All
  imports are relative (`./x.js`). No bare specifiers.
- **No required network services.** Speech uses the browser's
  `speechSynthesis`; recognition/camera/AR are optional extras that degrade
  gracefully. Optional libraries (AR tracking) may be loaded lazily from
  `https://cdn.jsdelivr.net/npm/...` only when the feature is used.
- **Never assume storage works.** Use `js/core/storage.js` (it falls back to
  memory). Never touch `localStorage`/`indexedDB` directly elsewhere.
- **Never assume a voice exists.** If `speechSynthesis` is missing, has no
  voices, or errors, the narrator runs in *silent timed mode*: it still fires
  word events on an estimated timeline and resolves, so every flow still works
  (headless tests run this way).
- **Service worker is optional** (`sw.js`); registration failures are ignored
  (e.g. inside sandboxed iframes).
- **Works at** 360×640 and 390×844 portrait, 844×390 landscape, 768×1024 and
  1024×768 tablets, and desktop. No horizontal page scroll. Touch, mouse and
  keyboard all work.
- **Child-safe UI in the reader**: no links out, no ads, no purchase prompts,
  settings only behind the parent gate (press-and-hold 3 s), big targets
  (≥ 56 px), no flashing (> 3 Hz), honours `prefers-reduced-motion`.
- **Accessible**: WCAG 2.2 AA for parent screens; the reader text is real HTML
  text (screen readers can read it); controls have roles, labels and keyboard
  support.

## 3. Directory layout and ownership

```
storybook/
  index.html              app shell (links css/app.css, css/reader.css, css/ar.css; loads js/main.js)
  manifest.webmanifest    PWA manifest
  sw.js                   offline cache (optional)
  css/app.css             tokens + parent screens + shell
  css/reader.css          reader layout, word highlighting, scene animation classes
  css/ar.css              magic window + print pages
  js/main.js              boot: test hooks, state, router, services
  js/app/router.js        hash router
  js/app/screens/*.js     landing, name, pronunciation, ready, settings, home, qr
  js/app/parent-gate.js   press-and-hold gate
  js/app/ui.js            tiny DOM helpers (h(), icons, toasts)
  js/core/personalise.js  ✅ name normalisation + templates + tokenising       (done)
  js/core/storage.js      ✅ state + blobs, memory fallback                    (done)
  js/core/book.js         ✅ load + validate book packages                     (done)
  js/pronounce/*.js       ✅ lexicon, rules, respelling, candidates            (done)
  js/narrator/plan.js     ✅ page lines -> narration segments + timing         (done)
  js/narrator/narrator.js speechSynthesis runtime (+ silent timed mode)
  js/narrator/voices.js   voice discovery and ranking
  js/audio/sfx.js         Web Audio synthesised sound effects
  js/audio/recorder.js    record the parent saying the name (trim, WAV)
  js/audio/recognise.js   "say it" via SpeechRecognition -> spellings
  js/reader/reader.js     page flow, text band, narration + interaction orchestration
  js/reader/drive.js      declarative animation ("drives") engine
  js/reader/controls.js   slider / pull-tab / wheel / flap / push-button controls
  js/reader/name-fit.js   put the name into SVG name slots, shrink to fit
  js/reader/scene.js      load defs.svg once + load/sanitise scene SVGs (used by reader, app cover, magic window, print)
  js/ar/magic-window.js   camera overlay (+ optional image tracking)
  js/ar/print.js          printable test pages (blank name areas) + back-cover QR
  js/ar/qr.js             qrSvg(text) wrapper around the vendored generator
  js/vendor/qrcode.js     vendored QR generator (MIT, keep licence header)
  books/index.json        list of books
  books/<id>/book.json    the story + mechanics (format below)
  books/<id>/defs.svg     shared symbols (character poses, ball, goal...)
  books/<id>/scenes/pN.svg one SVG per page
  data/names.json         pronunciation dictionary
  tools/*.mjs             lexicon checks, QR generation
  tests/unit/*.test.mjs   node --test
  tests/e2e/*.mjs         Playwright (Chromium at /opt/pw-browsers)
  docs/*.md
```

## 4. Core APIs (implemented)

### `js/core/personalise.js`
- `normaliseName(raw) -> {ok, display, key} | {ok:false, error}`; `NAME_ERRORS[error]` is parent-friendly text.
- `person(display, say, {count, art}) -> {display, say, count?, art?}` — `say` is what the voice is given; `count > 1` for siblings reading together; `art` is the form drawn inside pictures (read as `p.art ?? p.display`).
- `togetherPerson(children)` / `joinNames(names)` — up to 3 children: "Amara and Zak" (spoken/text), "Amara & Zak" (art).
- `fillTemplate(template, person)` — display text (`{name}`, `{name's}`, `{NAME}`, `{say:shown|spoken}`, and `{one|many}` choices such as `Where {is|are} {name's} {shirt|shirts}?` which pick the plural side when `count > 1`).
- `tokenizeLine(template, person) -> {display, spoken, units[]}`; each unit
  `{text, say, isName, nameForm, isWord, dStart, dEnd, sStart, sEnd}`.

### `js/core/storage.js`
- `loadState()`, `saveState(state)`, `upsertProfile(state, profile)`, `removeProfile`, `activeProfile(state)`, `newId()`, `blobs.put/get/delete`, `forgetEverything()`, `DEFAULT_SETTINGS`.
- Profile: `{id, display, key, pronunciation: {say, ipa, respell, label, source, useRecording, recordingId}, createdAt, updatedAt}`.
- Settings: `{voiceURI, rate, pitch, highlight, sfx, autoTurn, readPrompts, camera}`.

### `js/core/book.js`
- `loadBookList()`, `loadBook(id)` (validates), `bookUrl(id, path)`, `validateBook(book) -> string[]`.

### `js/pronounce/index.js`
- `loadLexicon() -> Promise<index>`; `getCandidates(index, display, {max}) -> Candidate[]`;
  `customCandidate(text, source)`; `toPronunciation(candidate)`; `respellToIpa`, `respellToSay`.
- Candidate: `{id, say, ipa, respell, label, source: 'dictionary'|'as-written'|'suggestion'|'custom'|'heard'}`.

### `js/narrator/plan.js`
- `planLines(lines, person, {useRecording, recordingId, linePauseMs}) -> {lines, segments}`.
  Segments: `{kind:'speech', line, text, units:[{u,start,end}]}`, `{kind:'clip', line, units:[{u}], recordingId}`, `{kind:'pause', ms}`.
- `unitForCharIndex(segment, charIndex)`, `estimateUnitMs(say, rate)`, `estimateTimeline(segment, rate)`.

## 5. Service APIs (to implement)

### Narrator — `js/narrator/narrator.js`
```js
export function createNarrator({ getSettings, getRecording }) // getRecording(id) -> Promise<Blob|null>
// returns:
{
  supported,                 // boolean: speechSynthesis exists
  ready,                     // Promise: voices discovered (resolves within ~1.5 s even if none)
  hasVoice(),                // false -> silent timed mode
  listVoices(),              // [{uri, name, lang, local, isDefault}] English first, en-GB first
  unlock(),                  // call synchronously inside a tap handler (iOS/Chrome activation)
  speakText(text, {signal}), // one-off: preview a name, tap-a-word
  play(plan, {signal, onUnit(line, unit), onSegment(i), rateScale = 1, pitchScale = 1}) -> Promise<'done'|'stopped'>,
  stop(),
  speaking,                  // getter
}
```
Rules: one utterance per speech segment; highlight from `boundary` events when
they arrive, otherwise from `estimateTimeline` (re-synced at each utterance
start); guard against engines that never fire `end` (timeout = estimate × 2 +
1.5 s); Chrome needs `speechSynthesis.cancel()` before a new page; iOS needs
`unlock()` from a gesture. Clip segments play the recording (via `playBlob`);
if it fails, fall back to speaking the name. Settings: `voiceURI`, `rate`,
`pitch`. Test hook: if `globalThis.SB_TEST?.forceSilent` use silent mode; scale
all silent timings by `globalThis.SB_TEST?.timeScale ?? 1`.

### Sound effects — `js/audio/sfx.js`
`createSfx({ enabled: () => boolean }) -> { unlock(), play(name) }` with names
`whistle, kick, cheer, pop, boing, clap, ding, swoosh, drum, sparkle, click`.
All synthesised with Web Audio (no audio files), gentle volume, never throws.

### Recorder — `js/audio/recorder.js`
`isRecordingSupported()`, `recordName({maxMs = 4000, onLevel}) -> {blob, durationMs}`
(getUserMedia + MediaRecorder, then decode, trim leading/trailing silence,
normalise, re-encode as 16-bit mono WAV so every browser can play it back),
`playBlob(blob, {signal}) -> Promise<void>`.

### Recognition — `js/audio/recognise.js`
`isRecognitionSupported()`, `hearName({lang:'en-GB', maxAlternatives:5, timeoutMs:6000}) -> string[]`
(distinct single-token transcripts, best first). Must tell the parent that the
browser may send audio to its speech service.

## 6. Book package format

`books/index.json`:
```json
{ "books": [ { "id": "tiffin-football", "title": "Goal, {name}!", "subtitle": "A Tiffin & Me football story", "cover": "scenes/p1.svg", "ages": "1–4" } ] }
```

`books/<id>/book.json`:
```jsonc
{
  "id": "tiffin-football",
  "version": 1,
  "lang": "en-GB",
  "title": "Goal, {name}!",               // may use {name}
  "subtitle": "A Tiffin & Me football story",
  "character": { "name": "Tiffin", "species": "otter" },
  "defs": "defs.svg",                     // shared <g id="d-…"> items, inlined once by the reader
  "pages": [
    {
      "n": 3,                             // 1-based, sequential
      "kind": "spread",                   // cover | spread | end
      "scene": "scenes/p3.svg",
      "text":   ["Tiffin has the ball.", "Pass, pass, pass to {name}!"],   // read when the page opens
      "prompt": "Slide the ball to {name}!",                               // spoken invitation to work the mechanism
      "after":  ["{name} has it! Hooray!"],                                // read once the mechanism completes
      "sfx": { "open": "whistle" },
      "voice": { "rate": 0.85, "pitch": 0.95 },   // optional multipliers (e.g. a sleepy bedtime page)
      "mechanic": {
        "type": "slider",                 // none | slider | pull-tab | wheel | flap | push-button
        "control": { "from": [320, 900], "to": [1280, 900], "knob": "#p3-knob" },
        "drives": [
          { "target": "#p3-ball", "along": "#p3-pass-path" },
          { "target": "#p3-leg",  "rotate": [0, -35], "origin": [610, 640], "range": [0, 0.25] }
        ],
        "complete": { "at": 0.95, "show": ["#p3-star"], "hide": [], "addClass": [["#p3-crowd", "sb-cheer"]], "sfx": ["kick", "cheer"], "confetti": false }
      }
    }
  ]
}
```

### Controls (`mechanic.control`, SVG user units of the 1600×1000 scene)
| type | geometry | child does | progress `p` |
|---|---|---|---|
| `slider` | `from:[x,y]`, `to:[x,y]`, optional `knob:"#id"` | drag the knob along the groove | projection of the pointer on the segment |
| `pull-tab` | as slider, optional `springBack:true` | pull the tab out | same; springs back after completing if set |
| slider/pull-tab with `returnTrip:true` | as slider | slide it to the end **and back again** | `p` is the knob position; completes when it returns (≤ 0.05) after reaching the end; `mechanic.midway` effects fire on reaching the end |
| `wheel` | `center:[x,y]`, `radius`, optional `turns` (default 1), `knob:"#id"` (element rotated with the wheel) | turn the wheel (drag round) | accumulated angle ÷ (360° × turns), clockwise positive |
| `flap` | `flap:"#id"`, `hinge: top|bottom|left|right` | lift the flap (drag away from hinge, or tap) | fraction lifted |
| `push-button` | `center:[x,y]`, `radius`, optional `knob:"#id"`, `presses` (default 1) | press it | presses done ÷ presses |

Every control: **tap = "show me"** (animates to completion by itself, for
toddlers and for the physical-book-first flow), keyboard (Tab to focus,
arrows nudge, Enter/Space completes), `role="slider"` (slider/pull-tab/wheel,
with `aria-valuenow` 0–100) or `role="button"` (flap/push-button),
`aria-label` = the filled-in prompt, `data-testid="control"`. When `knob` is
omitted the control draws its own chunky tab/wheel/button so it looks like the
physical mechanism. A soft pulsing hint (`sb-hint`) shows until first touch.
Completion fires once when `p >= complete.at` (default 0.95).

### Drives (declarative animation, `mechanic.drives[]`)
Each drive maps the control's progress to one property of one element:
- `along: "#pathId"` — translate the target so its local origin (0,0) follows the path.
- `translate: [[x0,y0],[x1,y1]]`
- `rotate: [deg0, deg1]` with `origin: [x,y]` (scene coords; defaults to the target's bbox centre)
- `scale: [[sx0,sy0],[sx1,sy1]]` with `origin`
- `opacity: [o0, o1]`
- `visible: [from, to]` — the target is shown only while `from <= p < to`
  (`to` = 1 includes 1). Use it for flip-book frames, e.g. the three warm-up
  poses on a wheel: `[0, 0.34]`, `[0.34, 0.67]`, `[0.67, 1]`.
- optional `range: [start, end]` (sub-range of progress, default `[0,1]`) and
  `ease: linear|easeIn|easeOut|easeInOut|bounce` (default `easeInOut`).
- optional `phase: "out"|"back"` (only with `control.returnTrip`): the drive
  only runs in that half of the trip; in the `back` phase its progress is
  `1 - p` (how far back the knob has come). Drives without `phase` follow the
  knob position `p` both ways.
Transform drives on the same target combine into one `transform` attribute:
translations (`along`, `translate`) are outermost, then `rotate`, then
`scale`. `rotate`/`scale` pivot on `origin: [x, y]` in the **target's own
coordinates** (for an element drawn in place that is simply the scene
position); when omitted, the pivot is the centre of the target's own bounding
box. For `along`, draw the target centred on (0,0) (e.g. `<g id="p4-ball"><use href="#d-ball"/></g>`
where the symbol is centred) so it rides the path by its centre and scales in
place. **Never put CSS-animated classes on a drive target** — CSS transforms
override the attribute; wrap it in a group instead.

`mechanic.complete` (and `mechanic.midway` for return trips) effects:
`show: ["#id"]` (pop in), `hide: ["#id"]`, `addClass: [["#id", "class"]]`,
`sfx: ["kick", "cheer"]` (played in sequence ~250 ms apart), `confetti: true`.

### Scene SVG conventions (`scenes/pN.svg`)
- Root `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">`; no
  `<script>`, no external references, no `<style>` blocks (use presentation
  attributes; shared classes live in `css/reader.css`).
- **All ids are page-prefixed** (`p3-ball`); shared symbols in `defs.svg` use
  the `d-` prefix and are referenced with `<use href="#d-tiffin-run"/>`.
- **Name slots**: `<text class="sb-name" data-form="upper|plain|poss" data-max-width="320" x=".." y=".." text-anchor="middle" font-size="64" …>NAME</text>`.
  The reader replaces the content and shrinks it to fit `data-max-width`
  (down to 45% of the font size, then compresses letter spacing; a name with
  a space or hyphen may wrap onto two lines when `data-wrap="2"`). Add
  `data-anim="write"` to have the name write itself in letter by letter (with a
  soft ding) when the page opens, or when its hidden parent is revealed.
  Use `font-family="Fredoka, Andika, sans-serif"` and `font-weight="700"`.
- **Letter slots** (one letter per bunting flag): `<g class="sb-letters" data-overflow="#p3-name-banner">`
  containing `<text class="sb-letter">` elements in order. The reader writes
  the upper-case letters of the name (spaces/hyphens/apostrophes skipped)
  centred across the slots; empty slots stay blank. If the name has more
  letters than slots, the letters are hidden and the element named by
  `data-overflow` (an ordinary `sb-name` slot, hidden by default with
  `display="none"`) is shown instead.
- `data-reveal` on elements that stay hidden until the mechanism completes
  (they pop in).
- **Layers for print and the magic window.** `class="sb-print-only"` marks
  things that only exist in the printed book (e.g. the faint star in an empty
  name spot) — the reader hides them. `class="sb-digital"` marks extras that
  only the screen adds (sparkles, glows, motion lines, confetti). In the magic
  window the whole scene is hidden except `.sb-name`, `.sb-letters` and
  `.sb-digital` (via `visibility`), so only the name and digital extras float
  over the camera image of the real page. Print pages show the scene at
  progress 0 with `.sb-print-only` visible and names/`.sb-digital` hidden.
- Idle animation classes (from `css/reader.css`): `sb-bob`, `sb-sway`,
  `sb-wiggle`, `sb-pulse`, `sb-twinkle`, `sb-float`, `sb-spin-slow`, `sb-cheer`
  (added on completion for crowds). They use `transform-box: fill-box`.
- Style: flat vector, rounded shapes, 5 px outlines in a darker shade of each
  fill (round joins), the book palette, no filters and only the subtle
  gradients defined in `defs.svg`; keep each scene < 80 KB. `books/<id>/ART.md`
  is the illustrator's guide (catalogue, origins, pivots, layering).

## 7. Reader — `js/reader/*.js`
```js
// js/reader/scene.js
export async function loadDefs(book, baseUrl)            // inlines defs.svg once per document (hidden <svg>), idempotent
export async function loadScene(book, page, baseUrl)     // -> fresh SVGSVGElement for page (scripts/handlers stripped), after loadDefs
// js/reader/name-fit.js
export function fillNameSlots(svgRoot, person, { animate = false } = {}) // -> { writeIn(): Promise<void> } fills .sb-name / .sb-letters
// js/reader/reader.js
export async function mountReader(root, {
  book, bookId, baseUrl = bookUrl(bookId), person, pronunciation, settings, narrator, sfx,
  startPage = 1, onPageChange(n), onExit(), onMagic(n)
}) -> { destroy(), goTo(n), replay() }
```
`baseUrl` is the book package folder (so test fixtures can live elsewhere).
Page flow: slide in → `sfx.open` → name slots write themselves in → read `text` (highlight words; the name is
always visually special) → if there is a mechanic, speak the `prompt`, pulse
the control, wait → on completion run `complete` effects + sfx + confetti →
read `after` → show a pulsing **next** button ("Turn the page!"), or turn
automatically when `settings.autoTurn`. Re-prompt once after ~8 s idle.
Tap a word to hear it; tap the name to hear the name. Replay button
re-reads the page. Swipe / arrow keys / buttons change page; changing page
stops narration. Test ids: `reader`, `scene`, `page-text`, `.sb-word`
(`data-unit`, `.is-current`, `.is-name`), `next-page`, `prev-page`, `replay`,
`page-indicator`, `control`, `exit-reader`, `magic-window`; the reader root
gets `data-page="N"` and `data-state="reading|waiting|done"`.

## 8. App shell — `js/main.js`, `js/app/*`
Hash routes: `#/` (shelf), `#/b/:book` (landing), `#/b/:book/name`,
`#/b/:book/say`, `#/b/:book/read/:page`, `#/b/:book/magic/:page`,
`#/settings`, `#/qr/:book`, `#/print/:book`. On boot, `?b=<id>` or a path
ending `/b/<id>` becomes `#/b/<id>`. `?test=1` sets
`globalThis.SB_TEST = {forceSilent: true, timeScale: 0.05}`.
Screens: `export function render(root, ctx) -> cleanup` with
`ctx = {state, setState(fn), navigate(hash), narrator, sfx, lexicon, params, book}`.
Test ids: `name-input`, `name-continue`, `name-error`, `candidate`
(`data-say`), `candidate-play`, `candidate-choose`, `custom-say`,
`custom-play`, `custom-use`, `say-it`, `record-name`, `use-recording`,
`hear-in-story`, `pronunciation-done`, `start-reading`, `open-settings`,
`parent-gate`, `change-child`, `add-child`.

## 9. Magic window, print pages and QR — `js/ar/*.js`
```js
// js/ar/magic-window.js
export function isCameraSupported()
export async function mountMagicWindow(root, { book, bookId, baseUrl, page, person, narrator, sfx, onExit, onPage(n) }) -> { destroy() }
// js/ar/print.js
export async function renderPrintPages(root, { book, bookId, baseUrl, landingUrl }) -> cleanup   // A4 landscape pages + back cover with QR
// js/ar/qr.js
export function qrSvg(text, { ecl = 'M', margin = 4, moduleSize = 8, dark = '#2B2A33', light = '#FFFFFF' } = {}) -> string  // standalone <svg>
export function landingUrlFor(bookId, loc = location) -> string   // the URL a printed QR should open, e.g. https://host/path/?b=tiffin-football
```
Rear camera full-screen with the page's digital layer (only `.sb-name`,
`.sb-letters`, `.sb-digital` visible) drawn over it. Baseline: the parent lines the overlay up with the real page
(drag to move, pinch/slider to resize, remembered per book). Optional:
image-target tracking when `books/<id>/targets.mind` exists (MindAR, lazily
loaded). Always offers "back to reading" and never records or uploads video.

## 10. Visual language
Fonts: **Andika** (reading text — designed for early readers) and **Fredoka**
(headings), from Google Fonts, falling back to system rounded sans-serif.
Tokens (in `css/app.css`): `--ink #2B2A33`, `--paper #FFF8EC`, `--card #FFFFFF`,
`--accent` (book colour), `--sun #FFC83D`, `--sky #7EC8F0`, `--grass #6CC24A`,
`--berry #E8505B`, focus ring `--focus #1D6FE0`. Parent screens are calm and
trustworthy; the reader is bright and bold.

## 11. Family features (round 2)

State lives in `js/core/storage.js` (done): `settings.allowOnlineVoices` (default
false), `settings.bedtime`, `state.together` + `readingChildren(state)` /
`setTogether(state, ids)` (siblings, up to 3), `state.readings` +
`upsertReading` / `removeReading` / `readingsFor` / `activeReadingFor`
(grandparent mode), `profile.fullName` (when `display` is the name used in
stories, e.g. "Max"), `profile.gift` `{from, text, recordingId, createdAt}`,
and `prefs.get/set` for small per-device values.

### Who is being read to
`person = togetherPerson(readingChildren(state).map(p => ({display: p.display, say: p.pronunciation?.say})))`
(`js/core/personalise.js`). With siblings, `person.count > 1`, text picks the
plural side of `{one|many}`, pictures use `person.art` ("Amara & Zak"), and
recorded name clips are not used (the voice says the joined names).

### Online voices are opt-in (privacy)
Browser "online"/network voices (`localService === false`, e.g. Chrome's Google
voices, Edge's "Online (Natural)") send the text — including the child's
name — to the browser maker's servers. The narrator only uses them when
`settings.allowOnlineVoices` is true. `narrator.voiceStatus()` →
`{local: number, online: number, usingOnline: boolean, needsConsent: boolean}`;
`needsConsent` is true when there is no local English voice but online ones
exist (the app then asks the grown-up; until they agree, narration is silent
with highlighting). `listVoices()` still lists online voices, flagged
`online: true`, so settings can show them.

### Environment — `js/core/env.js`
`detectEnvironment(nav = navigator, win = window) -> { speech: boolean, recognition: boolean, camera: boolean,
 inAppBrowser: null | 'android-webview' | 'facebook' | 'instagram' | 'tiktok' | 'snapchat' | 'linkedin' | 'other', os: 'ios'|'android'|'other',
 openInBrowserHint: string | null }` — the hint is parent-friendly text such as
"This page opened inside Instagram, which can't read aloud. Tap ⋯ and choose
'Open in browser'." (null when all is well).

### Audio tools — `js/audio/mix.js`
`concatToWav(parts: Array<Blob | {silenceMs: number} | {chime: true}>, {sampleRate = 22050}) -> Promise<Blob>`
(decodes each blob, resamples to mono, joins with silences/soft chimes,
encodes WAV); `downloadBlob(blob, filename)`; `shareOrDownload(blob, filename, {title, text}) -> Promise<'shared'|'downloaded'|'cancelled'>`
(Web Share API with files when available).

### Reader additions — `js/reader/reader.js`
`mountReader(root, { ..., reading = null, bedtime = false })`:
- `reading`: `{ readerName, getPart(n, 'main'|'after') -> Promise<Blob|null> }`.
  When a part exists it is played instead of the computer voice (main = the
  page text + prompt, after = the after lines), with highlighting estimated
  across the clip's duration; missing parts fall back to the voice.
- `bedtime`: calm night styling (dimmed page, no bright effects, soft sounds),
  the story carries on by itself: after the prompt the mechanism plays itself
  ("show me") after a few seconds if nobody touches it, and pages turn
  automatically after a soft chime.
- A pause/play button (`data-testid="pause"`) that pauses narration and timers.
- Name spotting: tapping a name in the picture (`.sb-name`, `.sb-letters`)
  sparkles it and the voice says "That says {name}!".
- Name slots use `person.art ?? person.display`.

### Family packs — `js/family/pack.js`
A single JSON file parents share by WhatsApp/email/AirDrop (no server):
```jsonc
{ "format": "starring-pack", "version": 1,
  "kind": "reading" | "gift",
  "bookId": "tiffin-football", "createdAt": 1790000000000,
  "readerName": "Grandma Rose",                        // reading packs
  "parts": { "1": { "main": {"mime": "audio/mp4", "data": "<base64>"}, "after": null } },
  "child": { "display": "Ava", "fullName": null, "pronunciation": { "say": "Ava", "ipa": "", "respell": "", "label": "", "source": "gift" } }, // gift packs
  "message": { "from": "Auntie Jo", "text": "Happy birthday!", "audio": {"mime": "audio/wav", "data": "<base64>"} } } // gift packs (audio optional)
```
`buildPack(...) -> Blob`, `readPack(file) -> Promise<ParsedPack>` (untrusted
input: size caps (30 MB), audio MIME allow-list, text length caps, never
rendered as HTML), `importPack(state, parsed, blobs) -> Promise<{state, summary}>`.
Filenames: `<book>-<reader-or-child>.starring.json`.

### App screens — `js/app/screens/*`
New routes: `#/b/:book/record` (record a reading, page by page, teleprompter
with the child's name filled in), `#/b/:book/gift` (set up a gift), `#/open`
(open a family pack). Ready screen: reading-together picker, "Who's reading?"
(computer voice / recorded readings), bedtime toggle, gift message player,
"Save as audio for Yoto / Tonie" (recorded readings only — the computer voice
can't be saved by browsers; explain that the full version will use a cloud
voice for this). Settings: online-voices consent toggle with a clear
explanation, readings list (play, choose, send, delete), open a pack.

## 12. Round 3 (founder's extra ideas)

- **Home languages**: `Reading.language` (free text, e.g. "Urdu"); `readingLabel(reading)` → "Read by Nana in Urdu". A reading in another language plays page by page without word-by-word highlighting (the timing can't match English text); the teleprompter lets the reader read the English or tell it in their own words.
- **Name clash check** — `js/core/clash.js`: `nameClashes(childName, book.characters)` and `clashMessage(...)`; books list their cast in `book.characters` (e.g. `["Tiffin", "Goose", "Frog"]`). The name screen offers a nickname when there is a clash.
- **Find your first letter** — `js/activities/letter-trace.js`: `mountLetterTrace(root, {person, narrator, sfx, onDone, onSkip, reducedMotion, bedtime})`, offered after the last page when `settings.letterActivity`.
- **Name stickers** — `js/ar/stickers.js`: `renderStickerSheet(root, {book, bookId, baseUrl, person, trimMm})`, route `#/stickers/:book`: A4 sticker sheets sized to the printed name spots.
- **Accessibility**: `settings.easyRead` (dyslexia-friendly reading text) and `settings.highContrast`, applied as `data-easy-read` / `data-contrast="high"` on `<html>`.
- **Nursery/class edition**: parked (privacy), see docs/product-plan.md.
