# Made Happy: product plan

*Draft 1, 24 September 2026. Written for the founder.*

Related documents: [Series bible](series-bible.md) (Tiffin & Me and Book 1, "Goal, {name}!"), [Architecture](architecture.md) (how the prototype works), [Name pronunciation](name-pronunciation.md) and [Voice and audio options](voice-and-audio-options.md).

> **How to read the evidence.** This plan draws on six research briefs written on 24 September 2026. A network proxy blocked many of the original websites, so a lot of the findings come from search-result summaries rather than the pages themselves. Where something is well established (checked in browser source code, official documentation or a launch announcement), it is stated plainly. Anything marked **(to verify)** is medium or low confidence. It's good enough to steer by. It isn't good enough to spend money on, or to quote to a retailer, investor or journalist, until someone has checked the original source. None of this is legal advice.

## The plan in brief

- **What we're making:** a series of mass-produced mechanism board books for under-5s that read perfectly on their own, plus a free companion web page. A grown-up scans the QR code, types the child's name and checks how it sounds. The page then reads the story aloud with the name woven in and follows the book page by page. It animates each moving part and shows the name in the pictures.
- **The gap:** we found no product that combines real moving parts with personalisation. Personalised books are printed to order on flat pages at roughly £15-£35. Novelty board books cost about £7 and their audio, where it exists, is the same for every child (to verify).
- **The signature:** we say the child's name right, and the grown-up always checks it by ear first.
- **Positioning:** book first, screen optional. We never sell it as "AI", and there's an audio-only bedtime mode.
- **Business:** a premium board-book price (hypothesis: £8.99-£9.99), personalisation free, no subscription and a few paid extras. Print costs at small runs look tight. Compare selling direct, co-editions and a publisher partnership before committing to a print run (to verify with real quotes).
- **Order of work:** finish the prototype, then pilot with 10-20 families on their own phones, then launch v1 (a printed book with a cloud voice), then v2 (an older space range on the same engine).
- **Decisions needed now:** route to market, privacy stance on cloud voices, pilot budget, a UK-only launch and trade mark searches (section 10).

---

## 1. The idea and why now

### The idea

Tiffin & Me is a series of chunky board books. Each one has a cover, six spreads with one moving part each (a slider, wheel, flap or pull-tab) and a bedtime end page. The art has blank "name spots": a shirt back, bunting, a crowd banner, a scoreboard, a trophy plaque. Each spot carries a faint printed star, so the page looks finished without a phone. On the back is a QR code. A grown-up scans it, types the child's name and hears it said aloud. If it's wrong, they pick another version, type how it sounds, or record it in their own voice. The web page then reads the story with the name woven in. It waits while the child works the real slider or flap, plays a short animation of the same moving part on screen, and writes the child's name into the name spots. Through the phone camera, the name can appear over the real page. There's nothing to install, no account and no subscription, and the name stays on the phone.

### Why now

1. **Parents already scan books.** Nosy Crow has printed a QR code linking to a free streamed reading on its books since 2013 ("Stories Aloud"). So the habit exists, but that audio is the same for every child, doesn't follow the pages and needs a connection (to verify).
2. **A web page can now do the whole job.** Current phone browsers can speak, record a short clip, use the camera and keep working offline, with no app store involved. There are real limits, covered in sections 3 and 9.
3. **Cloud voices can say a name exactly.** Several text-to-speech services (software that turns text into speech) accept IPA (the International Phonetic Alphabet, a precise way of writing sounds). They also return the timing of each word, which drives on-screen highlighting. Rendering only the sentences that contain the name costs well under a penny per child: roughly $0.004-$0.01 per new name on Microsoft Azure (to verify current prices).
4. **Families want audio, not more screens.** Yoto's revenue was £94.8m in 2024, up 86%. Yoto announced new players on 10 September 2026, and the Toniebox 2 launched in the UK in September 2025 at £94.99.
5. **Screen guidance now favours shared, parent-led use.** UK guidance for under-5s, reported as published on 27 March 2026, prefers watching together and limits 2-5s to an hour a day. It advises no screens before bed and no AI toys or tools (to verify; see section 4). A book-first, audio-first product fits that guidance. A screen-first AI story app doesn't.
6. **Personalised books are a proven gift.** Penguin Random House bought Wonderbly on 4 June 2025. Wonderbly reports more than 11 million books sold.
7. **Getting names right matters.** Research on schools links mispronounced names to children's sense of belonging. UK names are diverse: Muhammad was the top boys' name in England and Wales in 2024 and 2025 (to verify). A product that asks, and then gets the name right, is doing something genuinely kind.

---

## 2. The market and the gap

### Who else is here

**Bizzy Bear and Stories Aloud (Nosy Crow).** This is the benchmark. The books are about 10 pages and 180 mm square, with a slider on every spread. They cost around £6.99, and there are 30+ titles in 23 languages (to verify). The QR code on the back opens a free streamed reading with music and sound effects. It's linear audio: no name, no page sync, no pictures and no offline use (to verify). Nosy Crow closed its in-house app team in 2018, citing tough app economics (to verify). The free web page is what replaced it. **Lesson:** a free web page that needs no install is the right shape. An app you charge for is not.

**Personalised print-on-demand books.** Wonderbly is the leader (bought by Penguin Random House in June 2025). The others are Hooray Heroes, Penwizard (licensed characters such as Peppa Pig), I See Me! (including board books), Put Me In The Story (US) and Librio. They all print flat pages to order, at roughly £15-£35 in the UK and $20-$60 in the US (to verify). We found no audio layer. Common complaints are the price once shipping is added, late delivery for birthdays, and stories that feel like "just the name dropped in" (to verify).

**AI story apps.** Oscar, StarredIn, FableKid, KidTeller and others generate a personalised, narrated story inside an app. They're mostly subscriptions (Oscar is about $49 a year; to verify), screen-first, and have no physical novelty book. Some offer to clone a parent's voice, which raises consent questions. We found no grown-up-facing name-pronunciation picker (from a limited search).

**Read-along apps.** Novel Effect listens to a grown-up reading a real or in-app book and adds sound effects. Readmio does the same with its own stories. Vooks and Epic are subscription libraries of animated and read-to-me books. All four are subscriptions costing roughly $40-$85 a year (to verify). Novel Effect shows that "the phone follows the real book" appeals, but it needs an app and listens to the room.

**Screen-free audio players.** These are Yoto and Tonies: hardware plus cards or figures. Families can load their own audio: a Yoto "Make Your Own" card holds up to 100 tracks or 500MB, and Creative Tonies record your own. They're a channel, not a competitor (see the MP3 export idea in section 3).

**AR books.** AR (augmented reality) means digital pictures drawn over the camera view. Carlton's iDinosaur range and DEVAR sold well a decade ago, but the category is known for glitchy apps, device limits and apps being withdrawn. Bookful left Google Play in August 2024, leaving lifetime subscribers with nothing (to verify). The 8th Wall web-AR platform stopped logins on 28 February 2026, and its hosted projects go offline on 28 February 2027. **Lesson:** never make the book depend on someone else's AR platform or app.

### Comparison

| | Moving parts in a real book | Child's name | Name said right | Follows the real book page by page | Pictures move on screen | No install, account or subscription | Works offline | Typical price |
|---|---|---|---|---|---|---|---|---|
| **Bizzy Bear + Stories Aloud** (Nosy Crow) | Yes, a slider per spread | No | — | No: one linear recording | No | Yes (free web page) | No: streams (to verify) | £6.99 book, audio free |
| **Personalised print-on-demand** (Wonderbly, Hooray Heroes, Penwizard, I See Me!, Put Me In The Story, Librio) | No: flat pages | Yes, printed | No audio found | — | No | No app, but you order and wait for delivery | It's paper | £15-£35 (US $20-$60) |
| **AI story apps** (Oscar, StarredIn, FableKid, KidTeller) | No book (StarredIn offers optional print) | Yes | No picker found | No | Some (animated video, highlighted words) | No: apps, mostly subscriptions | Not checked | e.g. Oscar about $49 a year |
| **Read-along apps** (Novel Effect, Readmio, Vooks, Epic) | No | No | — | Novel Effect follows the grown-up's voice; the others don't | Vooks animates; the others add sound | No: app plus subscription | Not checked | $40-$85 a year |
| **Audio players** (Yoto, Toniebox) | No | Only if the family records it | Only via their own recording | No | No (screen-free by design) | Hardware to buy | Not checked | Yoto Gen 4 players £89.99 and £119.99; Toniebox 2 £94.99 |
| **AR books** (Carlton iDinosaur, DEVAR, Bookful) | Not researched | No | — | Yes, via the camera, when it works | Yes | No: app installs; some apps withdrawn | Not checked | Not researched |
| **Made Happy (planned)** | Yes, one per spread | Yes: spoken and in the pictures | Yes: the grown-up confirms by ear | Yes: waits for the child; tap to turn | Yes: each moving part, plus the magic window | Yes | Yes, after the first scan (to prove in the pilot) | Hypothesis £8.99-£9.99, personalisation free |

Prices come from search summaries (to verify). The exceptions are the Yoto and Toniebox player prices, which come from launch announcements. "Not checked" means the research didn't look.

### The gap

Personalised publishers can't do mechanisms because they print one copy at a time. Novelty publishers can't personalise because they print thousands of identical copies. If the personalisation lives in the web layer, the book can be an ordinary mass-produced novelty title and still feel made for one child. We found nothing that does this (our reading of the market, from a limited search; to verify).

### What parents complain about, and our answer

| Complaint (to verify) | Where it shows up | Our answer |
|---|---|---|
| Audio needs a connection; links printed in books go dead | QR audio, educator and QR-vendor pages | Works offline after the first scan. The QR code uses our own web address. We promise the audio stays free and keep a downloadable fallback. |
| AR apps need installing, don't run on older phones, scan slowly or get withdrawn | AR books, app-store reviews | No install. The magic window is optional. Any tracking software runs on our own site, and the book never depends on it. |
| Personalised books are expensive, arrive late and feel generic | Wonderbly and Hooray Heroes reviews | A normal board-book price. The book is ordinary stock, so it can be bought in a shop the day before a birthday. The name is part of the pictures and the story, not pasted on. |
| Subscriptions pile up; "lifetime" deals vanish | Read-along apps; Bookful | No subscription and no account. |
| Screen-time guilt | Everywhere, now reinforced by the 2026 guidance | Book first, audio-first default, bedtime mode and short shared sessions. |

### Market context (all to verify)

- The UK print book market in 2025 was £1.81bn and 190.6m books. Children's, YA and educational value rose 0.4% (NielsenIQ, via search summaries).
- In the UK, Novelty & Activity was flat or down in 2024-2025, while Picture Books and Pre-School & Early Learning grew. So "another slider book" isn't a growth story on its own. When pitching to shops, lead with early learning and shared reading.
- As a benchmark, Usborne's "That's Not My…" board books had sold 6.4m copies across 50+ titles by 2019.
- There are no public figures for board books alone. Those would need paid NielsenIQ BookScan data.

---

## 3. What makes it "much better"

Stories Aloud proved that families will scan a book. Here is what we add, in priority order.

### Signature features

**1. The name, said right.**
- *What the family gets:* after typing the name, the grown-up hears it inside a line from the story and picks from two or three versions ("Which sounds right?"). If none fit, they tap syllables to set the stress and type how it sounds ("shiv-AWN"), hearing the result after every change. Or they record the name in their own voice, and the story uses that recording. Later, our narrator will record hard names for them (a human fallback).
- *Why it matters:* we found no competitor offering this (from a limited search). Big AI name readers still get names wrong. US universities now use AI to read out graduates' names, and press reports describe graduates angry at mispronunciations (to verify). Standard spelling-to-sound software gets roughly 12-20% of names wrong (to verify). No software can know which of several correct versions a family uses (Leah, Zara, Caoimhe).
- *Honest caveats:* no current browser lets a web page tell the built-in voice exactly how to say a word, so the prototype uses respellings. Exact pronunciation needs the v1 cloud voice. Some sounds are beyond an English voice (Welsh "ll", some Arabic sounds, the tones in Yoruba or Mandarin). For those names, we steer the grown-up to recording.
- *Principle:* help with pronunciation is always free.

**2. The name inside the pictures.** The book prints blank name spots with a faint star. On screen, the name writes itself in with a soft ding and shrinks to fit. Long names use the nickname, and a name is never cut off. In the magic window, the name floats over the real page.

**3. Follows the book page by page.** The app reads the page and invites the child to act ("Slide the ball to Ava!"). It waits, reads the payoff line, then says "Turn the page!" A tap or swipe moves on, so the screen matches the page in hand. We don't listen to the room (Novel Effect does). That's more private, and it works on every phone.

**4. The moving parts animate after the child moves the real one.** The physical action comes first. The child pushes the real slider, then the screen shows the ball rolling and the crowd cheering. For toddlers, a tap means "show me". The on-screen controls also work on their own if the book isn't to hand.

**5. The magic window.** It's optional and held by the grown-up for a few seconds per spread: a camera view of the real page with the name and sparkles drawn over it. As a baseline, the grown-up lines the overlay up by hand; automatic page tracking is an extra. Nothing is recorded or uploaded.
- *Caveats:* the free tracking library the prototype can use (MindAR) hasn't been updated since January 2024. There is also one unconfirmed report of it failing on iOS 27 (to verify). The newer open-source 8th Wall engine is a pre-release version. Tracking also depends on how the book is printed and illustrated (section 8). So the magic window stays a delight, never the core.

**6. No install, no account, no subscription.** Scan, open the web page, and be reading within a minute. The child's profile lives on the phone.

**7. Works offline after the first scan.** The page stores the book's pictures and sounds on the phone, so the next read works on a plane or in a tent.
- *Caveat:* Safari can delete a site's stored data after 7 days of browsing without visiting that site. So re-entering the name must take seconds.

**8. Audio-only bedtime mode.** The phone lies face down or the screen goes dark. The story is read aloud while the grown-up turns the real pages. This fits the advice of no screens in the hour before bed.
- *Caveat:* with the browser's own voice, the page must stay open (a dark screen, not a locked phone), because the speech stops silently when the page is suspended. Pre-rendered audio in v1 should do better. We still need to test whether it keeps playing when the phone locks (to verify).

### Ideas worth adding

| Idea | What it is | Why it's worth it | Watch-outs | When |
|---|---|---|---|---|
| **A relative reads the whole book** | A grandparent (or anyone) records every page on their own phone, line by line with prompts. The child then hears Grandma read "Goal, Ava!" while turning the real pages. | A strong gift and a strong idea for families who live apart. A natural paid extra. | The recording has to travel from Grandma's phone to the child's, which needs a server. That makes us responsible for personal data (a DPIA, consent, deletion). Sharing between households may bring in the Online Safety Act (to verify). Record the relative's real voice; never clone a voice. | v1.x |
| **Gifting set-up before wrapping** | The giver scans the book, types the name and picks a pronunciation. They get a gift tag or card with a link. The parent opens it and the book is ready ("Reading for Ava"). | Captures the gift moment instantly, with no print-to-order wait. | The name has to reach the parent's phone. It could travel inside the link itself (the part after "#", which browsers don't send to our server), or be stored briefly and deleted once used. That's a privacy and legal call. The parent should still confirm the sound. | v1 |
| **MP3 export to Yoto or Tonie** | "Save Ava's story as audio" for a Yoto Make Your Own card (up to 100 tracks or 500MB) or a Creative Tonie. | Rides the screen-free audio habit. Perfect for bedtime, with zero screen time. | Needs v1's pre-rendered audio. Check Yoto's and Tonies' terms for home-made content; card prices are unverified. Keep the files on the family's device rather than hosting them. | v1 |
| **Siblings mode** | Up to three names ("Amara and Zak"). Who is named first rotates each spread, and the big moment is shared. | Twins and siblings share books. | Every name line needs a plural version, and the art needs duplicate name spots (two shirts, two plaques). That's real writing and illustration cost, so plan the art for it in Book 1. | v1.x |
| **Nickname** | "What do you call them at home?" Used in the audio and the art when the full name is long or clashes with a character (Tiffin or Tiffany). | Sounds like home, and fixes long names on the bunting. | Keep the full name available for the cover. | Prototype |
| **One profile across the series** | Scan Book 2 and it already says "Reading for Ava". Confirmed name recordings are reused in every title. | Makes the series feel like one world, cuts set-up to seconds and lowers cloud-voice costs. | Every book must live on one web address. Safari's 7-day deletion still applies. | v1 |
| **Early-literacy framing: name recognition** | The child sees their name in print in the pictures, highlighted as it's spoken, in a font designed for early readers (Andika). Later titles could add "find your name" moments. | Retailers and parents respond to early learning, and that category grew while novelty didn't (to verify). | Don't make educational claims you can't back up. Get an early-years specialist to review the wording. | Messaging from launch |

### What stays free

The read-along, the name picker, recording your own name, offline use and bedtime mode all stay free. Put a public promise in the terms that the book's audio stays free, and keep a downloadable non-personalised reading as a fallback in case the service ever closes.

---

## 4. Positioning and screen time

### The line: book first, screen optional

- The printed book must read naturally with no phone in the room. The series bible has a print version of every name line ("Tiffin to you... thud!").
- The grown-up holds the phone. The child's hands are on the book.
- The default is sound. Pictures on screen are a short treat per page, and the magic window is a moment, not a mode.

### Don't sell it as AI

- The reported guidance says under-5s shouldn't use AI toys, tools or chatbots (to verify). Parents will read "AI app for toddlers" as exactly the thing they've been told to avoid.
- The design already fits: a fixed script and a voice that reads it. Nothing chats, listens to the child or makes up content.
- Be honest about the voice. Say plainly in the grown-up screens that the narrator is a computer voice. Some voice suppliers require this (to verify), and the EU AI Act adds duties if a voice imitates a real person (to verify).
- **Say:** "reads along with your book", "says your child's name right", "screen optional", "works with the phone face down".
- **Avoid:** "AI", "app for kids" and "screen time", plus Nosy Crow's phrases "Stories Aloud" and "scan the code, hear the story".

### The March 2026 UK guidance (reported; to verify)

Search results repeatedly report that the Department for Education and the Department of Health and Social Care published screen guidance for under-5s on 27 March 2026, based on an expert group report (EYSTAG). The primary pages couldn't be opened, so check the wording before quoting it.

| Reported advice | How the product fits |
|---|---|
| Under-2s avoid screens, except shared activities that encourage bonding and conversation | The grown-up holds the phone. Suggest audio-only for under-2s; the pictures are in the book. |
| 2-5s have at most 1 hour a day | A read takes a few minutes. There's no "next story" autoplay and no streaks. The end page says goodnight and stops. |
| No screens at meals or in the hour before bed | Bedtime audio-only mode. The last page of every book is bedtime. |
| Slow-paced content | Calm animation, nothing flashing more than 3 times a second, and reduced-motion settings respected. |
| Watching together is better than alone | Prompts speak to the grown-up and child together. There's no child-only mode. |
| No AI toys, tools, chatbots or smart speakers for under-5s until the evidence improves | No chat, no listening and no generated content. Not marketed as AI. |

The same reports say 98% of two-year-olds watch screens every day, and that the government suggests swapping screens for bedtime stories read together (to verify). The long-standing WHO advice (2019) is no sedentary screen time for under-2s, and at most an hour a day for 2-4-year-olds, with less being better.

### Bedtime

Every Tiffin book ends at bedtime: "Paw in hand, side by side. Night night, {name}." In bedtime mode the screen is dark and the story is read aloud while the grown-up turns the pages. The voice slows on the last page. This is our strongest answer to screen-time worries, and the best route into the Yoto and Tonie habit.

---

## 5. A second range for older children

### Recommendation

Yes, but second. Launch and learn with under-5s, then add two older ranges on the same engine, so the series grows up with the child: a child who had "Goal, Ava!" at two meets "Commander Ava" at six. The under-5 title "Blast off, {name}!" in the series bible is the natural bridge into space.

### The two ranges (proposals)

**"Commander {name}": ages 5-7, first readers, space.**
- The child reads and the app helps. The child's own name is one of the words they read ("Commander Ava, the hatch is stuck!").
- *Book:* a picture-book or first-reader format with fewer, simpler mechanisms (lift-flaps, a pull-tab, one wheel). Take advice from a paper engineer and printer.
- *App:* highlights each line as the child reads and says a word when it's tapped. It supports "you read the blue words, I'll read the rest", covers the tricky words and gives praise at the end of each mission. It doesn't listen to the child.
- *Reading level:* set with an early-reading consultant so it matches how UK schools teach phonics.
- *Name moments:* a mission badge, the rocket's livery, and the ship's computer calling "Commander Ava".

**"Mission {name}": ages 7-10, puzzle adventures in space.**
- *Book:* decoder wheels, star-chart volvelles (rotating paper-disc charts), fold-outs and printed codes. Every puzzle needs the physical book to solve.
- *App:*
  - a mission patch with the child's name, to view or print
  - an audio drama in which mission control uses the child's call-sign
  - puzzles whose answer comes from the real decoder wheel and is typed into the app
  - choose-your-path branches
  - a mission log.
- *Principle:* the book does the thinking and the app does the drama.

### What changes from the under-5 format

| | Under-5s: Tiffin & Me | 5-7: Commander {name} | 7-10: Mission {name} |
|---|---|---|---|
| **Who reads** | The grown-up and app read; the child works the moving parts | The child reads; the app highlights and helps | The child reads and solves; the app runs the drama |
| **Book (proposal)** | Board book: cover, 6 spreads, bedtime page | Picture-book or first-reader format | Activity-rich book |
| **Mechanisms** | Chunky slider, wheel, flap, pull-tab, push; toddler-proof | Lift-flaps, pull-tabs, a wheel | Decoder wheel, star-chart volvelle, fold-outs, codes |
| **Words** | 8-25 per spread, sentences of 7 words or fewer | Early-reader text, set with a reading consultant | Longer text, mission logs, clues |
| **The name** | Spoken about 11 times and shown in the pictures | Printed in the words the child reads | Call-sign, mission patch, codes that spell the name |
| **What the app adds** | Read-aloud, page follow, animation, magic window | Line highlighting, tap-a-word, "you read, I read", praise | Audio drama, puzzles, branching paths, mission patch |
| **Who holds the phone** | The grown-up | The grown-up, with the child | Often the child, so design for independent use |
| **Safety rules** | Treated as a toy, under the rules for under-3s | Probably still a toy, because it has play value; the age grading changes which tests and warnings apply (ask the test lab; to verify) | Same as 5-7 |
| **Privacy** | Name on the device; the grown-up records the name | Same, and never record the child reading | Same, plus no chat, sharing or leaderboards |
| **Screen time** | Audio-first, with a bedtime mode | Book-led, with short app moments | The audio drama can run with the phone face down |

### Privacy: don't record children's voices

- It's tempting to let the child read aloud and have the app check them. Don't, at least not without legal advice:
  - A recording of a child's voice counts as personal data (explicitly so under the US children's privacy rule, COPPA; to verify).
  - Browser speech recognition sends the audio to Google or Apple by default.
  - Speech recognition is least accurate for children aged 4-7 (to verify).
- Older children may use the app on their own, so the ICO Children's Code applies even more directly. That means high-privacy defaults, no profiling, no nudges, no chat, no sharing and no leaderboards. Sharing between users could also bring in the Online Safety Act (to verify).
- The grown-up still sets up the name and pronunciation behind the parent gate.

### What carries over, and what's new

- **Carries over:** the name and pronunciation engine, name spots in the pictures, mechanisms as on-screen controls (a decoder wheel is the existing "wheel" control), the magic window, offline use and one profile per child.
- **New:** longer texts, a child-led reading mode, branching stories, puzzle answers, multi-voice audio drama (which needs pre-rendered audio) and a printable patch.

### Sequencing

1. **Under-5s first.** Book 1 and the prototype exist, the gap is clearest there, and the content is simplest.
2. **Start the older range only after v1 shows that families come back and buy a second book.**
3. **Build the engine features the older books need** (branching, child-led reading) as extensions, not a rewrite.
4. **Set the older range's format and price from printer quotes.** Don't assume under-5 economics carry over.

---

## 6. Business model

### Pricing hypothesis (to test in the pilot)

| Option | Price | Logic | Evidence |
|---|---|---|---|
| **Trade board book** (recommended starting point) | £8.99-£9.99, personalisation free | A premium over Bizzy Bear (about £6.99) and Campbell's push-pull-slide books (about £7.99), justified by the name and read-along | To verify |
| **Direct personalised gift** | About £12.99-£16.99 | Sold on our own site as a gift; still well under Wonderbly's roughly £20-£35 | Low confidence |

Ask pilot families what they'd pay, and test both framings.

### No subscription

- Parents already juggle read-along subscriptions at $40-$85 a year (to verify), and they distrust "lifetime" deals since Bookful disappeared.
- The running cost is tiny: pennies per child for the cloud voice (to verify), and nothing for the browser voice.
- A subscription on a book you've already bought feels like a toll. It would also push us towards streaks and nudges, which the Children's Code discourages.

### Paid extras (ideas to test)

- A relative's recording of the whole book.
- Gift bundles: a box set with a gift tag and set-up link.
- A printed name bookplate or name sticker sheet. The book is treated as a toy, so check stickers with the test lab.
- MP3 export: free or paid, to be tested.
- **Not for sale:** getting the name right. Human narrator recordings of hard names are part of the promise.
- **Rule:** nothing is sold inside the child's reading screens. Purchases only happen behind the parent gate.

### Channels

| Channel | Notes |
|---|---|
| Own website (direct) | Best margin per copy; the natural home for gifting and extras |
| Amazon | Big reach; discount around 55-60% (to verify) |
| Bookshops via a distributor feeding the wholesaler Gardners | Trade discounts typically 40-55% (to verify); shops need the early-learning angle |
| Gift sites (for example notonthehighstreet, where I See Me! sells) | Reaches people shopping for personalised gifts |
| Co-editions (selling foreign-language editions to other publishers, printed in the same run) | Sold at the Bologna or Frankfurt book fairs. Keep all text in the black ink so each language needs only one plate change (to verify) |
| Publisher or packager licence | License the format and web layer to an established novelty publisher |
| Audio players (Yoto, Tonies) | MP3 export first; a partnership later |

### Print economics: headline numbers (all to verify)

None of these could be checked. They're general industry estimates with no source behind them, so get written quotes.

| Item | Estimate |
|---|---|
| Unit cost ex-works China (the factory price before shipping): about 10 pages, 180 mm square, 4-5 hand-assembled mechanisms | 3,000 copies: $2.50-$4.50 each. 5,000: $2.00-$3.50. 10,000: $1.50-$2.80 |
| Plain board book, for comparison | $0.60-$1.20 |
| Minimum run | 3,000-5,000 (1,500-2,000 sometimes possible, at a premium) |
| Paper engineer (designs and prototypes the mechanisms) | About £1.5k-£6k per title (a guess) |
| EN 71 toy-safety testing | About £500-£1,500 per title |
| Timeline | 8-12 weeks' production, then 5-8 weeks by sea; 5-7 months from final files to a UK warehouse; 9-12 months from concept to stock |
| Retailer discount | 40-55% for the trade; Amazon 55-60% |
| Publishers' target landed cost (unit cost including freight) | 15-20% of the shelf price: about £1.20-£1.60 at £7.99, or about £1.50-£2.00 at £9.99 |
| ISBN (the book's catalogue number) | From Nielsen, the UK agency: about £90+ for one, cheaper in blocks |
| Print-on-demand (Amazon KDP, IngramSpark) | Can't make board books, so the book must be litho-printed (conventional printing in large runs) and sold through the book trade |
| Import duty and VAT on printed children's books | Generally 0%, with caveats for novelty or toy-like items (check with HMRC) |

**Headline:** at shelf prices of about £7-£10, runs of 3,000-10,000 copies are unlikely to reach normal trade margins once freight is added (to verify). Only the larger runs at the higher price come close, depending on the exchange rate. That doesn't kill the idea, but it means the route to market matters.

**The digital layer is cheap (to verify):**
- The browser voice is free.
- With a cloud voice, the fixed sentences are recorded once per book. Only the sentences containing the name are made for each new child. That comes to about $0.004-$0.01 per new name on Azure.
- At 10,000-100,000 reads a month, that's about $40-$1,000 a month, even if every read were a new child.
- Storage is trivial (about 100 KB per child's set of name sentences), and Azure's free allowance covers roughly 2,000 new names a month.

"Free forever" is affordable. The print run is the money question.

### Direct, co-edition or publisher?

| Route | For | Against |
|---|---|---|
| **Direct** (own brand, own print run) | Full control, best margin per copy, you own the customer relationship | You fund a 3,000-5,000 minimum run, stock, safety testing, distribution and marketing; 9-12 months' lead time |
| **Co-edition** | A bigger combined run lowers the unit cost; foreign-rights income | Needs selling at book fairs; text restricted to the black ink; other publishers' schedules |
| **Publisher or packager licence** | They fund printing, distribution and safety compliance; faster reach into shops | A smaller share per copy and less control; you must protect the brand and web layer in the contract |

**Recommendation:**
- Run the pilot on printed test pages or hand-made dummies, not a print run.
- In parallel, get quotes from 3-4 novelty printers (the research names Leo Paper, Hung Hing, Everbest and 1010 Printing) and one UK packager (for example Imago).
- Have two or three exploratory conversations with novelty publishers.
- File trade marks before pitching anyone.
- Choose the route with a real profit-and-loss forecast after the pilot.

---

## 7. Brand and IP

### Keep clear of Bizzy Bear

| Protected: avoid | Free to use |
|---|---|
| The name "Bizzy Bear" and anything close ("Busy Bear", "Bizzy ___") | The idea, the genre and the age band |
| Benji Davies' character and illustrations (copyright). Don't imitate the look. | The board-book format with one mechanism per spread |
| The "Stories Aloud®" mark and the tagline "scan the code, hear the story" | Mechanism types: push, pull, slide, turn, lift. Classic pull-tabs, wheels and volvelles have centuries of prior art. |
| Trade dress (the recognisable overall look of a product): the yellow bear, square white-board covers, numbered series spines, cover layout and series typography | A QR code on the back linking to audio (already market-standard) |
| Specific mechanism shapes may carry UK unregistered design right (up to 10-15 years) or registered designs | Repetition, rhyme and sound words |
| Patents are possible on genuinely new mechanisms or on name-insertion narration systems (not yet searched) | |

All of this is low confidence and not legal advice. Trade mark registers weren't checked.

**Where we stand:** Tiffin is an otter, not a bear, and not yellow. A web search in September 2026 found no children's character called Tiffin (see the series bible). The series name "Tiffin & Me" and the title pattern "[cheer], {name}!" are working drafts. Don't use "Bizzy Bear" or "Nosy Crow" in product names, Amazon keywords, ads or cover styling.

### IP checklist

- [ ] Formal trade mark clearance (UK IPO and EUIPO, plus USPTO if selling in the US) for "Tiffin & Me", "Tiffin", "Made Happy", the companion's name and the older-range names. Search classes 9 (software and recorded media), 16 (books and printed matter), 28 (toys and games) and 41 (education and entertainment). Then file your own marks.
- [ ] Check whether "BIZZY BEAR", "Stories Aloud" and Nosy Crow's series look are registered.
- [ ] Freedom-to-operate search (checking whether a design or patent blocks you) on any new mechanism and on "name-inserted narration".
- [ ] Commission original text, characters, art and paper engineering under written assignment agreements (the author, illustrator and paper engineer transfer their rights to Made Happy).
- [ ] If you use a signature narrator's voice, get written consent and rights from the narrator. Voice suppliers require recorded consent for custom voices.
- [ ] Register designs for any genuinely new mechanism.
- [ ] Keep pronunciation data licences clean. The CMU pronouncing dictionary allows commercial use. Wiktionary-derived data is share-alike, so use it for internal reference only. ONS name statistics come under the Open Government Licence.
- [ ] Buy a short web address you control for the QR code, set it to auto-renew, and never route through a third-party "dynamic QR" service.
- [ ] Treat the prototype art and character as placeholders until the commissioned versions are signed off.

---

## 8. Roadmap

| Stage | When (indicative) | Goal | Exit test |
|---|---|---|---|
| **0. Prototype** | Now (September 2026) | Book 1 works end to end in a browser | Runs on the device test list; Book 1 complete |
| **1. Pilot** | Q4 2026 to Q1 2027 | Prove the name, follow-along and price with 10-20 real families | Pilot metrics met (below); parents would pay |
| **2. v1 launch** | Aim for stock before Christmas 2027 (realistic if the 9-12-month print estimate holds; to verify) | Printed Book 1 with a cloud voice | Safety tests passed; metrics hold on the real printed book |
| **3. v2** | 2028 | Older range; bigger extras | Families buy a second book |

### Stage 0: Prototype (now)

Already in place or being built (see the [architecture](architecture.md)):
- name entry, with pronunciation candidates, respelling and record-your-own
- narration with the browser voice, including a silent timed fallback
- word highlighting
- the name in the pictures
- five kinds of animated on-screen control (slider, pull-tab, wheel, flap, push-button)
- the magic window, with manual alignment and optional tracking
- printable test pages with blank name spots and a back-cover QR code
- offline storage and a parent gate.

Known limits:
- Browser voices vary by phone and can't take IPA.
- Android in-app browsers (such as Instagram's or Facebook's) have no speech, so show an "Open in Chrome" button.
- iPhones need one tap before any sound.
- Chrome on Android doesn't report word timings, so highlighting is estimated.

Before the pilot, turn the "say it" option off by default. It uses browser speech recognition, which sends audio to Google or Apple and is unreliable on iPhone.

### Stage 1: Pilot (10-20 families, real devices)

- [ ] **Recruit** 10-20 families with children aged 1-4, including names that English voices get wrong: Irish, Welsh, Scottish Gaelic, South Asian, Arabic, West African, East Asian and Eastern European.
- [ ] **Materials:** printed test pages or a hand-made dummy of Book 1 with the QR code. Families use their own phones.
- [ ] **Voice comparison:** pre-render cloud-voice audio, with word timings, for about 20 demo names, and compare it with the browser voice.
- [ ] **One "Start" tap** unlocks sound and keeps the screen awake.
- [ ] **Detect in-app browsers** and offer "Open in Chrome/Safari".
- [ ] **Separate name panel:** at least 20 names per origin group, checked by native speakers. The pilot families alone are too few.
- [ ] **QR test:** print the code at about 25-30 mm, with high error correction (level Q), black on a white panel. Scan it on real laminate with at least 10 different phones.
- [ ] **Device list:** iPhones on iOS 17, 18, 26 and 27; an iPad; a Pixel with Chrome; a Samsung with Samsung Internet; Firefox on Android; the Instagram and Facebook in-app browsers; desktop browsers.
- [ ] **Measure without tracking children:** run moderated sessions with written consent from parents, plus a short questionnaire. Add an opt-in test log that never contains the name. There are no analytics in the app.

### Stage 2: v1 launch (printed Book 1)

- [ ] **Cloud voice with IPA:**
  - Microsoft Azure as the main supplier: many British voices, exact IPA and word timings. It says it doesn't keep text from live requests (to verify).
  - Amazon Polly as the fallback: it has the clearest terms for children's products (to verify).
  - Avoid ElevenLabs unless it confirms in writing that we're allowed. Its policy bars "bundled solutions" aimed at under-13s (to verify).
  - Keep the supplier's key on a small server, never on the phone.
- [ ] **Pre-rendered audio:**
  - record the fixed sentences once per book and voice
  - make only the name sentences for each new name
  - cache everything, so repeat reads cost nothing and work offline
  - store word timings with the audio for highlighting.
- [ ] **Name dictionary:**
  - Sources: the ONS top names for England and Wales, the Scottish and Northern Irish lists, and an "often mispronounced" list.
  - Give each name 1-3 versions, checked by native speakers.
  - Map spelling variants to one entry (Muhammad, Mohammed, Mohammad).
- [ ] **Human narrator fallback** for names that fail after three tries.
- [ ] **Tracking-friendly art** (so a phone camera can recognise each page):
  - Check every spread in greyscale, because trackers see brightness, not colour.
  - Put texture across the whole page, with no big flat areas. The current briefs have large flat skies (page 1's sky fills the top 62%), so the illustrator needs to add texture.
  - Avoid repeating patterns.
  - Give each spread a distinct background.
  - Keep name spots small (under about 10% of the page) and surrounded by detail.
- [ ] **Print finish:** ask for matte lamination or varnish, because gloss hurts tracking, and test printed proofs in home lighting.
- [ ] **AR engine bake-off:** MindAR (possibly a maintained fork) against 8th Wall's open-source engine, on the device list. Keep tap-to-turn always available.
- [ ] **QR code:**
  - one code per title, on our own short web address, redirected in a way we can change later
  - a human-readable short link printed beside it
  - a "For grown-ups" label.
- [ ] **Compliance and paperwork:**
  - a DPIA (data protection impact assessment) against the ICO Children's Code
  - a plain-English privacy notice
  - a data processing agreement with the voice supplier
  - a complaints route
  - ICO fee registration
  - EN 71-1, -2 and -3 testing (the European toy-safety standards)
  - CE or UKCA marking (safety marks) and a technical file kept for 10 years
  - an accessibility audit to WCAG 2.2 AA (the web accessibility standard).
- [ ] **Extras for v1:** the gifting link, MP3 export and one profile across the series.

### Stage 3: v2

- [ ] The older range ("Commander {name}", "Mission {name}").
- [ ] Siblings mode, and a relative's recording of the whole book (with a server and a DPIA).
- [ ] A native app wrapper (a thin app around the same web code, using the phone's built-in AR tracking), but only if the pilot and v1 show AR is the main reason people buy. Otherwise stay web-only.
- [ ] Optional: rank pronunciation candidates against the grown-up's recording on a server, only with explicit consent and deletion after use.
- [ ] Optional: an offline voice that runs inside the browser, once its licensing questions are cleared (to verify).

### Key metrics

| Metric | Target | Measured in | Where the target comes from |
|---|---|---|---|
| Grown-up accepts the first pronunciation offered (curated names) | 90% or more, with no origin group far behind | Pilot, v1 | Names research |
| Taps to confirm a name | 3 or fewer | Pilot | Names research |
| Time from scan to the first page read aloud (first visit) | Under 60 seconds (median) | Pilot, v1 | Our design goal |
| Time to start a returning read | Under 10 seconds | Pilot | Our proposal |
| Grown-ups who give up at the name step | Set after the first sessions; aim near zero | Pilot | Our proposal |
| Reads aloud on every test device (or the "open in browser" fix works) | 100% of the device list | Pilot | Our proposal |
| QR code scans first time on real laminate | 10 out of 10+ phones | Pilot, v1 proofs | Our proposal |
| Page on screen matches the page in hand | 95% or more of page turns (observed) | Pilot | Our proposal |
| Works offline after first open | 100% of the device list | Pilot | Our proposal |
| Magic window: page found; smoothness; session length | Under 1.5 s; 20+ frames a second; under 2 minutes per book | v1 | AR research (researcher's proposal) |
| The name never leaves the phone | Zero network requests containing the name | Prototype, pilot | Privacy design |
| Cloud-voice cost per new name | $0.01 or less | v1 | Voice research (to verify) |
| Families who read again within a week; would pay the hypothesis price | Set targets before the pilot starts | Pilot | Our proposal |

---

## 9. Top risks and mitigations

Likelihood and impact are our judgement.

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **We mispronounce a child's name.** This is harm, not just a bad experience, and a reputational risk (the graduation-name backlash) | Medium / High | Always confirm by ear. Offer respelling, recording and a human narrator fallback. Steer impossible sounds to recording. Track acceptance by name origin. |
| **Phones behave differently.** iPhones need a tap before sound; Android in-app browsers have no speech; Chrome on Android gives no word timings; Safari deletes stored data after 7 days of browsing without a visit | High / Medium | One "Start" tap unlocks everything. Detect in-app browsers and offer "Open in Chrome/Safari". Pre-rendered audio in v1. Re-entering the name takes seconds. Test on a real device list. |
| **The magic window is unreliable.** MindAR is unmaintained, with a reported iOS 27 failure; 8th Wall's engine is a pre-release; gloss and flat art defeat tracking | High / Low (it's optional) | It's never the core. Manual alignment is the baseline. Run an engine bake-off, brief the illustrator for tracking-friendly art and ask for matte lamination. A small decorative page badge is a fallback. |
| **Links rot or the service shuts down.** QR codes sit on shelves for 5-10+ years; withdrawing advertised audio creates consumer-law exposure (to verify) | Medium / High | Our own domain with changeable redirects and a printed short link. No third-party hosts. A public "audio stays free" promise and downloadable fallback audio. |
| **Screen-time backlash, or being seen as an "AI app"** | Medium / High | Book first, audio-first, bedtime mode, the grown-up holds the phone. Never market it as AI; say "computer voice" plainly. |
| **Privacy and compliance.** The Children's Code applies; a cloud voice makes us responsible for the name; COPPA applies if we sell in the US | Medium / High | Keep the name on the device by default. DPIA, data processing agreements and no analytics in child mode. Never record the child. Get legal review before launch. |
| **The book counts as a toy.** Pull-tabs and wheel rivets are the usual failure points in the under-3s small-parts rules (to verify) | High (it applies) / High | Involve a test lab early. Captive tabs with end-stops, thick laminated board, rounded corners and compliant inks. Test every print run. |
| **Print economics don't work at small runs** | Medium / High | Quotes from 3-4 printers and a packager. Compare co-edition, publisher licence and direct premium. Don't commit to a run until the pilot says yes. |
| **A big publisher adds personalisation**, and the novelty category is flat (to verify) | Medium / Medium | Compete on getting the name right and following the book. Build the name dictionary as a moat. Move quickly, file trade marks, and consider partnering rather than fighting. |
| **IP conflict with Bizzy Bear or Nosy Crow** | Low / High | Original character and art, formal searches, and none of their phrases or look. |
| **Voice suppliers change terms or disappear.** ElevenLabs restricts use for under-13s; PlayHT shut down at the end of 2025 (both to verify) | Medium / Medium | Azure first, Polly as fallback. Store pronunciations in a supplier-neutral form (IPA). Cache audio we're allowed to keep. |
| **The timeline slips.** 9-12 months from concept to stock, factory holidays and freight delays (to verify) | Medium / Medium | Get quotes early and plan backwards from the gifting season. |

---

## 10. Decisions to make next

Each decision has a recommended default.

1. **Route to market.** Explore a publisher or packager licence alongside a direct launch, and decide after the pilot with real quotes. *Default: run both conversations now.*
2. **Pricing to test.** *Default: a £8.99-£9.99 trade price, with a £12.99-£16.99 direct gift version as the alternative.*
3. **Privacy stance on the cloud voice.** Sending the first name alone to a voice supplier under a data processing agreement is needed for exact pronunciation. *Default: yes for v1, only the name and nothing else, with a DPIA. Keep the browser voice and the grown-up's own recording as fully on-device options.*
4. **Narrator.** A standard computer voice, or a signature human narrator (a custom voice costs thousands a month to host on Azure; to verify). *Default: a standard British computer voice for v1, plus human recordings for hard names.*
5. **Market.** *Default: UK first.* The US adds COPPA and US toy testing; the EU adds a named EU representative on the product.
6. **AR ambition.** *Default: keep the magic window as an optional delight. Revisit a native app only if pilot families say it's why they'd buy.*
7. **Pilot budget and scope.** Covers 10-20 families, test pages or dummies, a paper-engineer consultation, printer quotes and an initial legal review. *Default: approve before the end of Q4 2026.*
8. **Names and brand.** Choose the companion's name and confirm or replace "Tiffin & Me", then commission trade mark searches. *Default: search before any public use.*
9. **Older range timing.** *Default: after v1, starting with "Commander {name}".*

---

## Sources

Internal: [series-bible.md](series-bible.md) and [architecture.md](architecture.md).

**Novelty books and Stories Aloud**
- https://nosycrow.com/stories-aloud/
- https://nosycrow.com/faqs/
- https://nosycrow.com/product/bizzy-bear-football-player/
- https://nosycrow.com/blog/a-new-look-for-bizzy-bear/
- https://uk.bookshop.org/p/books/bizzy-bear-farmyard-fun-nosy-crow/2464236
- https://www.panmacmillan.com/series/campbell-busy-books/s103655110927
- https://www.thebookseller.com/news/nosy-crow-closes-house-app-department-776276

**Personalised books**
- https://global.penguinrandomhouse.com/announcements/prh-acquires-wonderbly-one-of-the-uks-fastest-growing-independent-publishers-and-leader-in-personalized-gift-books/
- https://www.thebookseller.com/news/penguin-random-house-buys-wonderbly
- https://www.wonderbly.com/uk/personalized-books/kids/age/toddler
- https://www.trustpilot.com/review/wonderbly.com
- https://www.trustpilot.com/review/hoorayheroes.co.uk
- https://www.penwizard.com/uk/brand/penwizard.html
- https://www.iseeme.com/en-gb/personalised-board-books.html
- https://www.notonthehighstreet.com/iseeme
- https://www.sourcebooks.com/about-put-me-in-the-story
- https://uk.librio.com/en/

**Story and read-along apps**
- https://oscarstories.com/
- https://apps.apple.com/us/app/personalized-books-starredin/id6755108381
- https://www.fablekid.com/
- https://noveleffect.com/pricing/
- https://apps.apple.com/us/app/readmio-kids-books-read-aloud/id1473021827
- https://www.vooks.com/plans/
- https://www.getepic.com/plans

**Audio players**
- https://musically.com/2025/08/27/childrens-speakers-startup-yoto-saw-sales-grow-by-86-in-2024/
- https://yoto.space/news/post/introducing-yotos-4th-generation-ClbHyuXT9m8Kd5r
- https://uk.yotoplay.com/products/make-your-own-cards-5-pack
- https://www.madeformums.com/news/toniebox-2-uk-release-date/
- https://tonies.com/en-gb/toniebox-2/

**Market size and trends**
- https://nielseniq.com/global/en/insights/commentary/2026/bestsellers-and-trends-uk-and-ireland-2025/
- https://nielseniq.com/global/en/insights/commentary/2025/bestsellers-trends-in-the-uk-ireland-in-2024/
- https://en.wikipedia.org/wiki/That's_Not_My..._(book_series)

**Screen-time guidance**
- https://beststartinlife.gov.uk/screen-time-under-5s/
- https://assets.publishing.service.gov.uk/media/69c53daf4a06660f085442a7/EYSTAG_report.pdf
- https://educationhub.blog.gov.uk/2026/03/new-advice-for-parents-on-screen-time-for-young-children
- https://www.gov.uk/government/news/newguidance-on-screen-use-for-children-aged-5-16
- https://theconversation.com/uk-government-recommends-maximum-one-hour-of-screen-time-for-younger-children-what-the-evidence-says-275752
- https://www.who.int/publications/i/item/9789241550536

**AR books and web AR**
- https://www.appbrain.com/app/bookful-fun-books-for-kids/com.inceptionxr.bookful.app.android
- https://medium.com/@19037187/augmented-reality-for-childrens-books-is-it-here-to-stay-fa3bf0a07371
- https://forum.8thwall.com/t/important-changes-to-8th-wall-business/8578
- https://raw.githubusercontent.com/8thwall/8thwall.github.io/main/docs/migration/faq.md
- https://raw.githubusercontent.com/8thwall/8thwall.github.io/main/docs/engine/guides/image-targets.md
- https://registry.npmjs.org/@8thwall/engine
- https://github.com/hiukim/mind-ar-js
- https://github.com/hiukim/mind-ar-js/issues/581
- https://raw.githubusercontent.com/immersive-web/image-tracking/main/explainer.md

**What phone browsers can do**
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechSynthesis.json
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_controller_impl.cc
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_android.cc
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/storage_api/storage_quotas_and_eviction_criteria/index.md
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/WakeLock.json
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_speech_api/using_the_web_speech_api/index.md

**Cloud voices**
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation
- https://azure.microsoft.com/en-us/pricing/details/speech/
- https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security
- https://aws.amazon.com/polly/faqs/
- https://aws.amazon.com/polly/pricing/
- https://elevenlabs.io/use-policy

**Names and pronunciation**
- https://www.ons.gov.uk/releases/babynamesinenglandandwales2025
- https://www.nrscotland.gov.uk/publications/babies-first-names-2024/
- https://tassel.com/blog/we-use-ai-to-announce-graduate-names-heres-exactly-how
- https://www.bostonglobe.com/2026/04/17/metro/unh-ai-name-reader-grad-walk-nh/
- https://www.isca-archive.org/eurospeech_2003/vozila03_eurospeech.pdf
- https://www.tandfonline.com/doi/abs/10.1080/13613324.2012.674026
- https://the-learning-agency.com/guides-resources/closing-the-child-speech-recognition-gap-evidence-limitations-and-paths-forward/
- https://github.com/cmusphinx/cmudict
- https://github.com/CUNY-CL/wikipron

**Privacy, safety and law** (the researchers couldn't open these pages directly)
- https://www.legislation.gov.uk/ukpga/2025/18/section/81/enacted
- https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-what-does-it-mean-for-organisations/
- https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- https://www.gov.uk/government/publications/toys-safety-regulations-2011/toys-safety-regulations-2011-great-britain
- https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors

**Brand and IP**
- https://nosycrow.com/book-series/bizzy-bear/
- https://nosycrow.com/contributor/benji-davies/
- https://www.youtube.com/watch?v=Jkj0ryt7Jt0

**Print and QR codes**
- https://raw.githubusercontent.com/soldair/node-qrcode/master/README.md
- The print-cost, timeline, ISBN and distribution figures in section 6 had no sources: they are general industry knowledge and all need checking.

---

## Open questions / to verify

**Market and pricing**
- [ ] Bizzy Bear's actual price (£6.99 or £7.99), format and sales figures. Does Stories Aloud stream only, or can it be saved offline?
- [ ] UK prices for Librio, I See Me! and Hooray Heroes. Does Librio run a subscription?
- [ ] Does any competitor already offer a name-pronunciation picker? None was found, but the search was limited.
- [ ] Board-book and novelty sales figures (paid NielsenIQ BookScan data).
- [ ] Yoto Make Your Own card and Creative Tonie prices, and their terms for home-made audio.
- [ ] Will parents pay £8.99-£9.99, or £12.99-£16.99 direct? (Pilot.)

**Screen time**
- [ ] The exact wording of the 27 March 2026 under-5s guidance (open the EYSTAG report and the Best Start in Life page).
- [ ] What the separate guidance for 5-16-year-olds says. It matters for the older range.

**Print and production**
- [ ] Written quotes for 3,000, 5,000 and 10,000 copies with 4-5 mechanisms, including freight. Are there UK or EU short-run options?
- [ ] Can the printer do matte lamination on board? Do die-cut slots and their shadows break page tracking?
- [ ] Paper-engineer fees, EN 71 test costs and real lead times.
- [ ] Does HMRC zero-rate mechanism board books? What are the US tariffs if we sell there?
- [ ] Current ISBN prices. Confirm that print-on-demand can't make board books.

**Law and compliance** (get a lawyer)
- [ ] If the name stays on the phone, is Made Happy processing it at all (UK GDPR)? What changes when a cloud voice is used?
- [ ] DPIA against the Children's Code and the 2026 "children's higher protection" duty. Do we need ICO fee registration? What complaints process does the new law require?
- [ ] Toy classification and the current EN 71 editions (ask the test lab). What does SI 2026/40 change in the GB toy rules?
- [ ] The gifting link: can the name travel in the link's "#" part without breaking the series bible's rule that names never go into web addresses?
- [ ] Relatives' recordings shared between households: does the Online Safety Act apply?
- [ ] Voice suppliers' current terms for children's services (Azure, Google, Polly), and written clearance from ElevenLabs if it's ever used.
- [ ] US (COPPA, product testing) and EU (named EU representative, accessibility law) requirements, if we go beyond the UK.
- [ ] Consumer-law exposure if the audio service were ever withdrawn.

**Technology**
- [ ] Is the MindAR iOS 27 failure real, and does the suggested workaround fix it? How stable is 8th Wall's open-source engine on mid-range phones?
- [ ] Does pre-rendered audio keep playing when the phone locks (bedtime mode)? Does the iPhone silent switch mute it?
- [ ] Are Home Screen web apps exempt from Safari's 7-day data deletion? Does recording work reliably in them?
- [ ] Does Azure give correct word timings for the chosen British voice? Does splicing name sentences into pre-rendered audio sound seamless?
- [ ] How well does each voice say hard names from IPA? (A listening test with native speakers, 50-100 names.)
- [ ] Can an in-browser offline voice (Kokoro) be used commercially, given the GPL question over one of its components?

**IP**
- [ ] Are "BIZZY BEAR", "Stories Aloud" and Nosy Crow's series look registered? Is "Tiffin & Me" clear in classes 9, 16, 28 and 41?
- [ ] Are there patents on name-inserted narration, or design rights on specific mechanisms we plan to use?

**Names**
- [ ] Native-speaker checks for every dictionary entry.
- [ ] Re-check survey and press figures (name-bias studies, graduation stories) against the originals before quoting them in marketing or to investors.
