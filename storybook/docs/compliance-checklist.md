# Compliance checklist: privacy, safety and accessibility

*Draft 1, 24 September 2026. Written for the founder of Made Happy.*

Related documents: [Product plan](product-plan.md), [Architecture](architecture.md), [Name pronunciation](name-pronunciation.md) (section 8 covers the privacy of the speech tool), [Voice and audio options](voice-and-audio-options.md) and [Print production](print-production.md).

> **This is research, not legal advice.** It is based on six research briefs written on 24 September 2026. The network blocked every regulator and legislation website (ICO, FTC, legislation.gov.uk, EUR-Lex, gov.uk and W3C), so no primary legal source was opened. Some claims were checked against copies of the legal texts mirrored on GitHub: the amended COPPA Rule, the UK government's toy-safety guidance for Great Britain and the US Consumer Product Safety Act. The rest are from memory. **Nothing about the law in this document is high confidence.** Use it to plan, to brief a lawyer and a test lab, and to ask good questions. Do not launch on the strength of it.

**How to read the marks**

| Mark | Meaning |
|---|---|
| *(to verify)* | Medium confidence. The claim was checked against a secondary copy of the source (for example a mirror of the legal text) or appeared in several sources, but nobody opened the original. |
| *(to verify: low)* | Low confidence. It comes from memory or general knowledge and no source was checked. Treat it as a lead, not a fact. |
| No mark | Either well established (checked in browser source code or official documentation) or a description of what the prototype's own code does, as seen in the repo on 24 September 2026. |
| `[x]` / `[ ]` | Already done in the prototype / still to do. |

---

## The answer in brief

1. **The web app is almost certainly covered by UK GDPR and the ICO Children's Code** *(to verify)*. Since 5 February 2026 the Code has also had legal backing: the Data (Use and Access) Act 2025 added "children's higher protection matters" to UK GDPR *(to verify)*. The cheapest way to comply is the design the prototype already has. The child's name stays on the phone, nothing is sent to Made Happy, and there are no analytics or ads. Before any public launch, close the gaps in section 1.3 and write a DPIA (a data protection impact assessment, which is a written risk review).
2. **A cloud voice changes the picture.** Once the child's name reaches a server, Made Happy is responsible for it. The voice supplier then needs a contract (a data processing agreement) and a lawful route for any data sent abroad, and you need to check that it neither keeps the name nor trains on it (section 2).
3. **In the US, treat the app as "directed to children" under COPPA** *(to verify)*. A first name typed by a parent and kept on the phone is low risk. A recording of a child's voice counts as personal information. If you serve the US, you need a written data-retention policy and a written security programme (section 3).
4. **The book is a toy as well as a book** *(to verify)*. A board book with sliders and wheels for under-5s needs EN 71-1, -2 and -3 testing to the under-36-months rules, a CE or UKCA mark, and a technical file kept for 10 years. In the US it needs testing at a CPSC-accepted lab and a Children's Product Certificate (section 4).
5. **The QR code has to keep working for as long as the book is around.** Use your own domain, redirect on your own server, print the short web address beside the code, and keep a plain audio fallback (section 5).
6. **For accessibility, aim for WCAG 2.2 AA.** Every drag needs a tap alternative, and the prototype already has one (section 6).
7. **On IP, own everything and copy nothing.** Get written assignments from the author, illustrator and paper engineer, and run trade mark searches before you pitch to anyone (section 7).

**What's needed when**

| Stage | Must have |
|---|---|
| **Now** (prototype) | Close the gaps in 1.3. Keep the "nothing leaves the phone" design. |
| **Pilot** (10-20 families, printed test pages or hand-made dummies) | A plain-English privacy note and a first DPIA draft. No cloud voice until a data processing agreement is signed and the DPIA covers it. Ask the lawyer and test lab whether any toy rules apply to samples you give to pilot families. |
| **Before selling in the UK** | Signed-off DPIA, privacy notice, complaints route, accessibility statement. EN 71 test reports, declaration of conformity, technical file, CE/UKCA mark and labels. Own domain and redirects live. Trade marks filed. |
| **Before selling in the US or EU** | US: the COPPA retention policy and security programme, CPSC-accepted lab testing and a Children's Product Certificate. EU: an EU-based economic operator for the toy, and a check on the European Accessibility Act. |

---

## Who you need

> **Get a lawyer for:**
> - Whether keeping the name only on the phone means Made Happy is not processing it at all (UK and EU), and what changes when a cloud voice is added.
> - Whether a name a parent types in a parent-gated screen of a child-directed app counts as "collected from a child" under COPPA.
> - The lawful basis for any server processing (contract or legitimate interests of the parent), and the position on the digital age of consent in each EU country you target.
> - Sign-off on the DPIA against the Children's Code and the new "children's higher protection matters" duty.
> - Which transfer route to use for the chosen voice supplier (UK-US data bridge, IDTA, or EU SCCs with the UK Addendum).
> - Toy classification sign-off, alongside the test lab, and choosing an EU responsible person or importer.
> - Whether the European Accessibility Act covers a free QR-linked read-along, and whether Made Happy qualifies as a microenterprise.
> - Your consumer-law exposure if the audio service is ever withdrawn, and the wording of the "free for as long as..." promise.
> - Trade mark clearance and filing, and a design and patent freedom-to-operate search (a check that nobody else's rights block you).
> - Assignment agreements with the author, illustrator, paper engineer and any narrator.
> - US state privacy laws, if you sell in the US (not researched here).

> **Get a test lab for:**
> Choose a UKAS-accredited lab or an EU notified body (the research names Intertek, SGS, BV and UL as examples). Brief them early, before the paper engineering is fixed.
> - Their view on classification: toy or book, and which age grading applies.
> - EN 71-1 (mechanical and physical) to the under-36-months rules, including small parts after abuse tests. EN 71-2 (flammability). EN 71-3 (migration of elements from inks, varnish and board).
> - Which EN 71 editions are current, and what the Commission's guidance on toy books currently says.
> - Testing production-intent samples, then retesting for every reprint or change of material or supplier.
> - Help drafting the declaration of conformity and the technical file.
> - The warnings and age labels the book needs, in English and in each EU market's language.
> - For the US: testing at a CPSC-accepted lab (lead, small parts, use and abuse, ASTM F963), and the data for the Children's Product Certificate.
> - For the older range: how a different age grading changes the tests and warnings.

---

## 1. The web app (UK first)

### 1.1 Which rules apply

| Rule | What it means for us | Confidence |
|---|---|---|
| **UK GDPR and the Data Protection Act 2018** | A child's first name typed by a parent is personal data once it is linked to a device or household. Keeping it only on the phone greatly reduces our obligations, but may not remove them. Anything sent to a server (a cloud voice, error logs, analytics) makes Made Happy a *controller*, the organisation legally responsible for the data. | to verify: low |
| **ICO Children's Code** (the Age Appropriate Design Code) | It covers online services "likely to be accessed by children" (under-18s), and the ICO reads that broadly. A free read-along for under-5s that comes with a paid book fits, even though a parent operates it. It has 15 standards. The ones that bite hardest here are 2 (DPIA), 7 (high-privacy defaults), 8 (collect as little as possible), 9 (data sharing), 10 (geolocation off), 12 (profiling off) and 13 (no nudges). Fines go up to £17.5m or 4% of turnover. The Code came into force on 2 Sep 2020 and has been enforced since 2 Sep 2021. | to verify |
| **PECR** (the rules on cookies and storing things on a device) | Storing the name the parent has just typed, to give them the personalised story they asked for, fits the "strictly necessary" exemption. Analytics storage does not. | to verify: low |
| **Data (Use and Access) Act 2025** | See 1.4. | to verify |
| **Equality Act 2010** | An anticipatory duty to make reasonable adjustments for disabled users (section 6). | to verify: low |
| **Online Safety Act 2023** | It applies to user-to-user and search services, so it is out of scope while families can't share anything with each other. Adding sharing of stories or recordings between families would probably bring it in. | to verify |

### 1.2 What the prototype already does

These were checked in the code on 24 September 2026. The numbers in brackets are the Children's Code standards each one supports.

- [x] **The name stays on the phone.** The name, chosen pronunciation and any recording are stored only on the device (`js/core/storage.js`). There is no account and no sign-up. (7, 8, 9)
- [x] **No ads, analytics, tracking or purchase prompts.** There is no analytics code. The app's network requests load only its own files (the book, pictures and name dictionary), plus web fonts and, on computers, possibly an online voice (see 1.3). (5, 12, 13)
- [x] **"Forget everything on this device".** One button in settings, with a confirm step, wipes every name, pronunciation, recording and setting. Each child can also be deleted individually. (15: prominent tools for exercising rights)
- [x] **A parental gate.** Settings open only after a 3-second press-and-hold, or holding Space or Enter on a keyboard. It's a hold, not a puzzle, which also suits WCAG 3.3.8 (section 6). (11)
- [x] **A child-safe reader.** It has no links out, ads, purchases or streaks. Targets are big (56 px or more), nothing flashes more than 3 times a second, and it honours the phone's "reduce motion" setting. (1, 13)
- [x] **The camera is explained and never recorded.** The privacy list in settings says: "The camera picture never leaves your phone and is never recorded." The magic-window design (architecture section 9) also rules out recording or uploading video. Tracking looks at the printed page, not at faces. *(The magic-window code wasn't in the repo on 24 September 2026, so re-check this when it lands.)*
- [x] **The child is never recorded.** The only recording is "Record your voice", where the grown-up says the name. It stays on the phone.
- [x] **"Say it for us" is disclosed.** This uses the browser's speech recognition, which may send the clip to Google or Apple. The screen and settings both say so.
- [x] **The name is kept out of web addresses.** The QR code and links carry only the book ID (`?b=tiffin-football`), never the name.
- [x] **No location requests.** (10)

### 1.3 Gaps to close before any public launch

- [ ] **Make online voices opt-in.** On computers the prototype currently ranks "natural" online voices first: Chrome's Google UK English voices, and Edge's voices with "Online" in the name. Chrome's Google voices run on Google's servers, so the text they read, including the child's name, goes to Google (checked in Chrome's source code). Edge's online voices presumably do the same with Microsoft *(to verify)*. Default to on-device voices (`localService === true`). Offer online voices as an opt-in in settings, with one plain sentence explaining that the story text, including the child's name, goes to Google or Microsoft. See [name-pronunciation.md](name-pronunciation.md) section 8. This is a small change in `js/narrator/voices.js` and the settings screen.
- [ ] **Serve the fonts yourself.** `index.html` loads the Andika and Fredoka fonts from Google Fonts, so every visit contacts Google's servers, which see the phone's IP address. Serving the font files from our own domain keeps "no third parties" true. (This is an engineering point; no legal ruling on it was researched.)
- [ ] **Serve the camera-tracking library yourself** if the magic window uses MindAR, which the architecture loads from the jsDelivr CDN on demand. The reason is the same as for the fonts.
- [ ] **Put the magic window behind a grown-up step.** The reader shows a "Magic window" button to the child. The research recommends turning the camera on only after a parent action *(to verify: low)*, and the phone's permission prompt is a barrier only the first time. Use the press-and-hold gate, or offer the magic window only from the grown-up "Ready" screen. Before the phone's own prompt, show a one-line explainer: "We look at the page. Nothing is recorded." Show clearly when the camera is on, and add a "hand the phone back" pause that turns the camera off.
- [ ] **Say "your own voice" on the record screen.** It currently says "Say the name yourself". Change it to "Grown-ups: record the name in your own voice", so that nobody records the child. COPPA treats a child's voice as personal information (section 3).
- [ ] **Keep "Say it for us" in the grown-up flow.** It belongs on the pronunciation screen, never in the reader, and should keep its notice.
- [ ] **Say the narrator is a computer voice** on the grown-up screens ("The story is read by a computer voice"). Microsoft and OpenAI require this for their voices *(to verify)*. It also fits the EU AI Act's transparency duty for voices that resemble a real person *(to verify: low)*.
- [ ] **Never infer a child's ethnicity or religion from the name.** To suggest pronunciations, the engine guesses which language a name comes from. That guess could reveal ethnic origin or religion, which is *special category data* (the most sensitive kind under UK GDPR) *(to verify: low)*. Keep the guess on the phone, don't store it and never log it. Let the parent choose a language hint instead.
- [ ] **Keep the name out of logs and caches.** It must never appear in URLs, QR codes, error reports, analytics events or offline-cache keys. That is true today; keep it true when a server arrives.
- [ ] **Plan for older children.** The proposed under-10s range may be used without a parent. Don't record children reading, and have no chat, sharing or leaderboards. Keep the setup behind the gate. Sharing between users could bring in the Online Safety Act *(to verify)*.

### 1.4 What the Data (Use and Access) Act 2025 changed

The Act received Royal Assent on 19 June 2025 *(to verify)*.

| Change | In force | What to do |
|---|---|---|
| **Section 81** added Art 25(1A)-(1B) to UK GDPR, the "children's higher protection matters". Services likely to be accessed by children must take account of how children can best be protected and supported, and of the fact that children merit specific protection. | 5 Feb 2026, by SI 2026/82 *(to verify)* | The ICO says that if you already conform to the Children's Code you are likely to comply. Cover it explicitly in the DPIA. |
| The ICO updated its guidance on children's data. | 15 May 2026 *(to verify)* | Read it before writing the DPIA. |
| New PECR exemptions, including one for statistical purposes (analytics). PECR fines were raised to UK GDPR levels. | 5 Feb 2026 *(to verify)* | It's unclear whether the analytics exemption suits a child-directed service. The safer default is no analytics in child mode. |
| A new test for sending data abroad: protection must be "not materially lower". The ICO refreshed its transfer guidance on 15 Jan 2026. | *(to verify)* | This matters only if data leaves the UK, for example with a cloud voice (section 2). |
| **Section 103** (new DPA 2018 s.164A): complaints must be easy to make, for example through an electronic form, and acknowledged within 30 days. | 19 Jun 2026 *(to verify)* | Put a complaints route on the website and acknowledge complaints within 30 days. |
| Separately, **section 72 of the Children's Wellbeing and Schools Act 2026** lets the government move the UK digital age of consent (now 13) anywhere between 13 and 16. | Reportedly in force 29 Apr 2026. One source says no regulations had been made by Sept 2026 *(to verify: low)*. | Watch it. It matters only if you rely on a child's consent, which you shouldn't. |

### 1.5 UK paperwork before launch

- [ ] **A DPIA** covering the Code's 15 standards and the "children's higher protection matters", done before launch (Code standard 2).
- [ ] **A lawful basis** for any server processing: a contract with, or the legitimate interests of, the parent. Don't rely on the child's consent *(to verify)*.
- [ ] **A privacy notice** in plain English for parents, plus a one-line, child-friendly version.
- [ ] **A PECR assessment**: strictly necessary storage only, and no analytics in child mode.
- [ ] **A complaints route** that acknowledges complaints within 30 days.
- [ ] **ICO data protection fee registration**: check whether it's needed. This was not researched.
- [ ] **An accessibility statement** (section 6).
- [ ] **A short decision log** saying what leaves the phone, when, to whom, and why. It feeds the DPIA and the privacy notice.

### 1.6 EU (if you sell or serve there)

- **Digital age of consent (GDPR Art 8).** It ranges from 13 to 16 depending on the country, with 16 as the default. It only matters where consent is your lawful basis for a service offered directly to a child. Here the parent is the user, so consider contract or legitimate interests of the parent, and record that in the DPIA *(to verify)*. Ages from a secondary table: Belgium 13, Malta 13, Norway 13 (EEA), Austria 14, Bulgaria 14, Netherlands 16 *(to verify)*. From memory: France 15, Spain 14, Italy 14, Germany 16, Ireland 16 *(to verify: low)*.
- **ePrivacy Directive Art 5(3)** (cookies and device storage). The same "strictly necessary" exemption covers storing the name the parent typed *(to verify)*.
- **Digital Services Act Art 28** (protection of minors on online platforms). A read-along with no public user content is not an "online platform" *(to verify)*. The Commission's guidelines of 14 Jul 2025 are still a useful benchmark. Small and micro enterprises may be exempt from the platform rules anyway *(to verify: low)*.
- **EU AI Act Art 50**, in force since 2 Aug 2026. It matters only if a synthetic voice imitates a real person, such as a "story in Mummy's voice" clone. That would need disclosure and the voice owner's clear consent. A generic narrator that is clearly computer-generated is low risk *(to verify: low)*.
- **European Accessibility Act**: see section 6.

---

## 2. Third-party voice services

### 2.1 The risk tiers

| Tier | What happens | What it needs |
|---|---|---|
| **0: lowest** | The name is typed and stored on the phone. Pronunciation comes from the built-in dictionary or rules. Audio comes from pre-made clips or on-device voices. Nothing is sent anywhere. | Privacy notice and DPIA. The prototype does this on phones. |
| **1** | The grown-up records the name in their own voice. The recording is stored on the phone and can be deleted. | As tier 0. Because it's the parent's voice, the COPPA rule on children's voices doesn't apply, and it isn't biometric data unless used to recognise someone *(to verify)*. |
| **2** | The name text goes to our own server and then to a voice supplier under a data processing agreement, with zero retention and no training. | UK GDPR controller duties, the Children's Code, a DPIA, a transfer route, and for the US a COPPA security programme and retention policy (§312.8 and §312.10). This is the v1 plan in the product plan. |
| **3: avoid for v1** | Recording the child's speech, cloning any voice, uploading camera frames, or using analytics or ad SDKs. | Verifiable parental consent under COPPA and a much heavier DPIA. The COPPA audio exception covers only audio that is deleted immediately (section 3.4). |

Today the prototype is tier 0-1 on phones. On computers it can slip into an unmanaged form of tier 2 through online browser voices, which is the first gap in 1.3.

### 2.2 Before you switch on any cloud voice

- [ ] **A data processing agreement** (UK GDPR Art 28) with the supplier.
- [ ] **Written confirmation of no logging, no retention and no training** on our text. Vendor terms change often, so re-check them at contract time.
- [ ] **Children's-use terms that allow a service for under-5s.** See the table below; some suppliers restrict this.
- [ ] **A transfer route** if data leaves the UK *(to verify)*:
  - To the US: the "UK Extension to the EU-US Data Privacy Framework" (the UK-US data bridge, in effect since 12 Oct 2023). It applies only if the supplier is an active Data Privacy Framework participant and has also signed up to the UK Extension.
  - Otherwise: the IDTA (the UK's international data transfer agreement), or the EU standard contractual clauses with the UK Addendum, plus a transfer risk assessment.
  - Better still, use UK or EU regions. Azure's UK South region offers standard neural voices, Amazon Polly runs in London (eu-west-2), and Google has an EU endpoint.
- [ ] **Send the name only.** Send the first name and its pronunciation (IPA or respelling), with no account, user or device IDs, through a stateless proxy of our own that strips identifiers.
- [ ] **Store audio by name, not by child.** One "Ava" clip serves every Ava, and nothing links it to a family.
- [ ] **Better still, pre-render common names.** Serve a library of common UK names as static files, so that for most children no request reaches any supplier.
- [ ] **Set and publish how long server-side data lives.** COPPA requires this (§312.10), and it's good practice in the UK. For example, Azure batch-synthesis results are kept for 168 hours by default (up to 744 hours) unless you write them to your own storage *(to verify)*.
- [ ] **Update the DPIA and the privacy notice** to name the supplier.
- [ ] **Say it's a computer voice.**

### 2.3 What the research found about each supplier

All of these came from documentation or search results. The supplier sites themselves were often blocked, so read each supplier's DPA and data-use page before choosing.

| Supplier | Does it keep our text? | Services for children | Notes | Confidence |
|---|---|---|---|---|
| **Microsoft Azure AI Speech** | Microsoft says it doesn't retain text or audio from real-time synthesis. Batch jobs are stored in Azure and can be deleted. | Children's-use terms not checked | Its code of conduct requires telling users the voice is synthetic. Standard neural voices are available in UK South. | to verify |
| **Amazon Polly** | May store and use text inputs to improve the service. You opt out through an AWS Organizations policy (not verified). | Its FAQ says Polly may be used in apps directed at under-13s, subject to COPPA notice and verifiable parental consent. | Audio can be cached and replayed without restriction. Runs in the London region. | to verify |
| **Google Cloud Text-to-Speech** | Google's data-logging page says it doesn't log TTS text or audio. | Children's-use terms not checked | EU endpoint available. Which voices it serves is unclear. | to verify |
| **ElevenLabs** | API generations are saved to history by default. Zero Retention Mode is Enterprise-only. A secondary source says its non-EEA terms grant a perpetual licence to use content for service improvement unless you opt out, and opting out doesn't undo earlier use. | Its Prohibited Use Policy bars "bundled solutions that target anyone under the age of 13". Child-like voices are banned from its Voice Library. | Don't use it without written clearance or an Enterprise contract. | to verify |
| **OpenAI TTS** | Abuse-monitoring retention is up to 30 days by default. | Processing personal data of under-13s requires Zero Data Retention. | You must tell users the voice is AI-generated. Poor fit anyway: no pronunciation control. | to verify |
| **Browser online voices** (Chrome's Google voices; Edge "Online" voices) | The text goes to Google (checked in Chrome's source code) or Microsoft *(to verify)*. We have no contract with them. | n/a | See 1.3. | Chrome: high |
| **Browser speech recognition** ("Say it for us") | The audio goes to Google (Chrome) or Apple (Safari) by default. Only desktop Chrome (139+) can recognise speech on the device. | n/a | Keep it in the grown-up flow, with its notice. | high |

The children's-use terms of Cartesia, Inworld, Hume and Deepgram were not checked.

---

## 3. US: the amended COPPA Rule

### 3.1 Status

The amended Children's Online Privacy Protection Rule (16 CFR Part 312) was published on 22 Apr 2025 (90 FR 16918). It took effect on 23 Jun 2025, and firms had to comply by 22 Apr 2026. **It is now fully in force** *(to verify)*. Some safe-harbour provisions have different dates.

### 3.2 Are we "directed to children"?

Almost certainly yes *(to verify)*. §312.2 lists these factors: subject matter, visual content, animated characters, child-oriented activities, music or other audio, language, and marketing. Here the marketing is a board book for under-5s. A child-directed read-along can't credibly claim to be a general-audience service. The consequences:

- no third-party ad or analytics SDKs that set persistent identifiers
- no behavioural advertising
- any personal information collected in child mode needs verifiable parental consent (VPC), unless an exception applies.

**Open point for a US lawyer:** the COPPA text doesn't settle whether information a parent types into a parent-gated setup screen counts as collected "from a child". The defensible route is a clearly separate, gated setup and nothing collected in child mode.

### 3.3 What counts as personal information

Items as numbered in §312.2 *(to verify)*.

| Item | What it covers | What it means for us |
|---|---|---|
| (1) | A first and last name | We ask for a first name only, and a first name on its own isn't listed. **Don't add a surname field.** |
| (7) | A persistent identifier: cookie ID, IP address, device serial or other unique device identifier | Server logs of IP addresses count. They're allowed without consent if used solely for "support for internal operations" (§312.5(c)(7)) and mentioned in the online notice. Keep logs minimal and short-lived. |
| (8) | A photo, video or audio file containing a child's image or voice | **Never record the child.** Camera frames stay on the phone and are never stored. |
| (10) | Biometric identifiers usable for automated recognition, such as voiceprints and facial templates (newly added) | No voice cloning of a child, no voiceprints, no face detection. |
| (11) | Information collected online from the child and combined with an identifier | Keep the name on the phone and don't combine it with anything. |

### 3.4 The audio-file exception (§312.5(c)(9))

An audio file of a child's voice may be collected without consent only if all of these apply *(to verify)*:

- it contains no other personal information
- it is used only to respond to the child's specific request
- it is not otherwise used or disclosed
- it is deleted immediately after responding.

It still needs online notice under §312.4(d). The rule codifies the FTC's 2017 enforcement policy. **Our design doesn't need the exception:** the grown-up records the name in their own voice, and the child's voice is never captured.

### 3.5 If you serve the US

- [ ] **A written data-retention policy** (§312.10) published in the online notice. It must state the purposes, the business need and the deletion timeframe, and indefinite retention is banned *(to verify)*.
- [ ] **A written information security programme** (§312.8(b)). It needs a named coordinator, a risk assessment at least once a year, safeguards, testing and oversight of suppliers *(to verify)*.
- [ ] **Separate verifiable parental consent before disclosing to third parties**, unless the disclosure is integral to the service (§312.5(a)(2)). The rule's preamble reportedly treats AI training as never "integral" *(to verify)*.
- [ ] **If you ever collect a child's personal information**, use a recognised consent method: a signed form, a card transaction, a toll-free call or video call, a government ID checked and then deleted, knowledge-based questions, or "email plus" / "text plus". The last two are only for operators who don't disclose children's data *(to verify)*.
- [ ] **No third-party SDKs** that set persistent identifiers.
- [ ] **Sign-off from a US lawyer.** State laws, such as the California rules on minors and state age-appropriate design codes, were not researched.

---

## 4. The physical book as a toy

### 4.1 Why it counts as a toy

- **Great Britain:** the Toys (Safety) Regulations 2011 cover products "designed or intended (whether or not exclusively) for use in play by children under 14". A board book with sliders, wheels or pull-tabs for under-5s should be treated as a toy *(to verify)*.
- **EU:** the new Toy Safety Regulation (EU) 2025/2509 excludes only "reading and educational books for over-36-months children without play value". A mechanism board book for babies and toddlers is therefore a toy *(to verify)*.
- **US:** the "ordinary book" exemption from third-party testing excludes books with "inherent play value" and books "designed or intended for a child 3 years of age or younger" (15 U.S.C. 2063(d)) *(to verify)*.
- **A warning can't get you out of it.** Warnings cannot override safety requirements or disclaim a foreseeable use. A 0-5 board book can't avoid the under-3 rules by printing "Not suitable for children under 36 months" *(to verify)*.

### 4.2 UK and EU duties

From the UK government's GB toy guidance (Office for Product Safety and Standards, March 2025) *(to verify)*:

- [ ] Design to the **essential safety requirements**: physical and mechanical, flammability, chemical, electrical, hygiene and radioactivity.
- [ ] Carry out a **safety assessment** and a **conformity assessment**.
- [ ] Draw up a **declaration of conformity**: a UK DoC for UKCA, an EU DoC for CE.
- [ ] Put the **CE and/or UKCA mark** on the book, visibly, legibly and indelibly. CE marking is accepted in Great Britain indefinitely, under the Product Safety and Metrology etc. (Amendment) Regulations 2024 (in force 1 Oct 2024). CE is needed for the EU and Northern Ireland, which follows EU rules under the Windsor Framework.
- [ ] Keep the **technical documentation and the DoC for 10 years**.
- [ ] Print **identification** on the toy or packaging: type, batch or model number, plus the manufacturer's name and a contact address. The research recommendations also mention an electronic address *(to verify)*.
- [ ] Print **warnings in English**, starting with "Warning" or "Warnings". In the EU, use each market's language.
- [ ] Keep a **complaints register**, do **sample testing**, and have a **recall** plan.
- [ ] **Northern Ireland** follows EU rules.
- [ ] **Check SI 2026/40.** It was made under the Product Regulation and Metrology Act 2025 and amends the 2011 Toys Regulations, but its content wasn't checked.
- [ ] **EU sales need an EU-based economic operator** (a manufacturer, importer, authorised representative or fulfilment provider) whose address goes on the product *(to verify: low)*. Non-toy books sold into the EU fall under the General Product Safety Regulation (EU) 2023/988, which has applied since 13 Dec 2024 and also needs an EU responsible person *(to verify)*.
- [ ] **Online listings**: show the CE mark and warnings before purchase. Marketplaces treat non-compliant toys as illegal content *(to verify)*.

Penalties in GB: unlimited fines in England and Wales, up to £10,000 in Scotland, and up to 6 months in prison *(to verify)*. GB importers of goods from the EEA may put their address on the packaging or accompanying documents until 31 Dec 2027 *(to verify)*.

### 4.3 The tests

CEN standards are paywalled and the research couldn't open them, so everything in this table is from memory. **Confirm it all with the lab** *(to verify: low)*.

| Standard | Covers | Notes for a mechanism board book |
|---|---|---|
| **EN 71-1** (mechanical and physical) | Small parts, edges, points, packaging film, paper and card specifics | Toys for under-36-months must not release small parts after torque, tension, drop and bite/soak-type abuse tests. The small-parts cylinder is 31.7 mm across. |
| **EN 71-2** | Flammability | |
| **EN 71-3** | Migration of 19 elements | Inks, varnish and board are tested as "dry, brittle, powder-like or pliable" material. |

Rough cost: about £500-£1,500 per title *(to verify: low; general industry estimate)*.

### 4.4 Designing for the under-36-months rules

Brief the paper engineer with this list before the first dummy *(to verify: low; engineering practice, not checked against the standard)*:

- [ ] **Wheels and pull-tabs are the usual failure points.** Use captive tabs with end-stops, so they can't be pulled out.
- [ ] **No detachable rivets or small parts.** Use board-only alternatives to rivets, or rivets that have been tested.
- [ ] **Thick laminated greyboard**, about 1.5-2 mm.
- [ ] **Rounded corners.**
- [ ] **Saliva-resistant inks and varnish** that meet EN 71-3.
- [ ] **No glued-on embellishments.**
- [ ] **Retest for every reprint or change of material.**

The mechanisms and paper engineering are covered in [print-production.md](print-production.md).

### 4.5 EU Toy Safety Regulation (EU) 2025/2509

| Date | What happens *(to verify)* |
|---|---|
| 26 Nov 2025 | Adopted (published in the Official Journal on 12 Dec 2025). |
| 1 Jan 2026 | In force. The chapters on notified bodies and delegated powers apply. |
| Until 31 Jul 2030 | The current Toy Safety Directive 2009/48/EC and the harmonised EN 71 standards still apply. |
| 1 Aug 2030 | The rest applies and the Directive is repealed. That includes a **toy Digital Product Passport**: an entry in the Commission's registry, reached through a data carrier or weblink shown before purchase. |

The new Regulation also tightens the chemical rules, including on PFAS and bisphenols. Warnings such as "Not suitable for children under 36 months" must start with "Warning" or a pictogram and be visible before purchase, including online. **Plan the QR resolver so that it can also serve the product passport after 2030** (section 5).

### 4.6 US: CPSC and ASTM F963

- [ ] **Testing at a CPSC-accepted third-party lab.** An interactive board book for 0-5s is a children's product, not an "ordinary book" *(to verify)*. From memory *(to verify: low)*, the tests are:
  - lead in the substrate (100 ppm) and in paint or coatings (90 ppm)
  - small parts for under-3s (16 CFR 1501)
  - use-and-abuse tests (16 CFR 1500.51-.53): about 2 in-lbf torque and 10 lbf tension for 0-18 months, and 3 in-lbf and 15 lbf for 18-36 months
  - ASTM F963 as a toy (16 CFR 1250). The current mandatory version wasn't checked (F963-23?).
- [ ] **A Children's Product Certificate.**
- [ ] **Permanent tracking labels** on the product.
- [ ] **CPSC eFiling of certificate data at import**, reported to start on 8 Jul 2026 for most regulated imported consumer products *(to verify)*.
- [ ] **Tariffs** on China-printed books changed repeatedly in 2025-26 and weren't checked.

---

## 5. QR permanence

**The risk:** the printed QR code stays on shelves, in nurseries and in charity shops for 5-10 years or more. If the link dies, the only fix is a reprint. Parents already complain about dead links in books, and hosted AR platforms do disappear: 8th Wall's hosted projects stop on 28 Feb 2027.

**The law:** no statute specifically requires a book's QR link to stay live. In practice, consumer law pushes the same way *(to verify: low)*:

- The UK Consumer Rights Act 2015 requires goods to be "as described", and Part 1 Chapter 3 covers digital content.
- The misleading-omission rules in the Digital Markets, Competition and Consumers Act 2024 also apply.
- In the EU, Directives 2019/770 and 2019/771 set a 2-year minimum for conformity.

So withdrawing the audio without clear warning in advance is both a legal and a reputational risk. Whether a book plus audio counts as "goods with digital elements" is a question for the lawyer.

- [ ] **Encode your own domain** with a short, stable path, and redirect on your own server. Print spec: [print-production.md](print-production.md) section 7.
- [ ] **Use temporary (302) redirects**, so the destination can change later. Browsers cache a permanent (301) redirect for good *(to verify; engineering practice)*.
- [ ] **Never use a third-party "dynamic QR" service.** If its subscription lapses, every printed code breaks.
- [ ] **Set the domain to auto-renew**, and consider paying for several years at a time. Keep the registrar account under company control, not a personal email.
- [ ] **Keep personal data and tracking IDs out of the code.** One code per title, carrying only the book ID.
- [ ] **Print the short web address beside the code**, for phones that won't scan and for people who'd rather type.
- [ ] **Label the code "For grown-ups".**
- [ ] **Put a clear promise in the terms**, such as "this book's audio is free, with no subscription, for at least N years". Pick a promise you can keep. Get a lawyer to word it (see the lawyer box).
- [ ] **Keep a plain fallback** that survives even if the app is switched off: downloadable MP3s of the non-personalised read for each title, hosted as static files on the same domain.
- [ ] **Write a shutdown plan**: what happens to the domain, the fallback files and the promise if Made Happy is sold or closes.
- [ ] **Plan one resolver that can later serve the EU toy Digital Product Passport** as well as the read-along (from 1 Aug 2030).
- [ ] **Self-host anything the page depends on**: fonts, the tracking library and audio. Don't depend on a third-party host for the core experience.

---

## 6. Accessibility

**Target:** WCAG 2.2 AA (the Web Content Accessibility Guidelines, level AA) for the grown-up screens and the reader. The W3C site was blocked, so the criteria below come from secondary summaries *(to verify)*.

| WCAG 2.2 criterion | What it asks | Prototype today |
|---|---|---|
| **2.5.7 Dragging Movements** (AA, new in 2.2) | Every drag needs a single-pointer alternative. | [x] Every slider, wheel, pull-tab and flap also works with a tap ("show me") and with the keyboard. |
| **2.5.8 Target Size (Minimum)** (AA) | At least 24×24 CSS px. The research suggests 64-96 px for toddlers. | [x] Reader buttons are 56 px. [ ] Consider 64 px or more in the reader. |
| **1.4.2 Audio Control** | Audio that plays automatically for more than 3 seconds needs pause, stop or volume control. | [ ] Changing page stops the voice, and there are replay and exit buttons, but I found no pause button in the reader code. Add one. |
| **2.2.2 Pause, Stop, Hide** | Moving content that lasts more than 5 seconds needs a way to pause it. | [ ] The idle animations (bobbing, swaying, twinkling) respect "reduce motion", but check there's a pause for everyone. |
| **2.3.1 Three Flashes** | Nothing flashes more than 3 times a second. | [x] This is a design rule in the architecture. |
| **1.1.1 Non-text Content** | Alternative text for the illustrations. | [ ] Check that each scene has a short description. |
| **1.2.1 Audio-only** | An alternative to the narration. | [x] The on-screen text with word highlighting is real HTML text. |
| **1.4.3 Contrast** | 4.5:1 for text. | [ ] Audit. |
| **1.4.10 Reflow** | Works at 320 CSS px wide. | [ ] The prototype is designed down to 360 px. Test at 320 px. |
| **2.1.1 Keyboard** and **4.1.2 Name, Role, Value** | Everything works by keyboard and is labelled for screen readers. | [x] Controls have roles, labels and keyboard support. |
| **3.3.8 Accessible Authentication** (AA) | No cognitive-puzzle-only gates for logging in. | [x] The gate is a press-and-hold, not a puzzle. [ ] Test the 3-second hold with parents who have motor impairments. |
| **3.3.7 Redundant Entry**, **3.2.6 Consistent Help** (A) | Don't make people retype things; put help in the same place. | [ ] Check in the audit. |
| **2.3.3 Animation from Interactions** (AAA) | Honour "reduce motion". | [x] Done, although it's beyond AA. |

**Legal hooks** *(to verify)*:
- **UK:** the Equality Act 2010's anticipatory duty to make reasonable adjustments *(to verify: low)*.
- **EU:** the European Accessibility Act (Directive 2019/882), which has applied since 28 Jun 2025. It covers "e-books and dedicated software" and e-commerce, through EN 301 549, which maps to WCAG 2.1 AA. Microenterprises (under 10 staff, and no more than €2m turnover or balance sheet) are exempt for services but not for products. Whether a free QR-linked read-along counts as an e-book service is a question for the lawyer.
- **US:** a litigation risk under ADA Title III *(to verify: low)*.

- [ ] **Run a WCAG 2.2 AA audit** of the grown-up flow and the reader before launch.
- [ ] **Publish an accessibility statement.**
- [ ] **Test with a screen reader** (VoiceOver on iPhone, TalkBack on Android) on the setup screens.

---

## 7. IP

**Free to use:** the idea, the genre, the age band, the board-book format with one mechanism per spread, the mechanism types (push, pull, slide, turn, lift) and "scan for audio". Classic pull-tabs, wheels and volvelles (rotating paper discs) have centuries of prior art *(to verify: low)*.

**Protected, so avoid** *(to verify: low; the registers weren't checked)*:

- **Copyright** in Benji Davies' Bizzy Bear illustrations and the text, which lasts for the author's life plus 70 years.
- **Trade marks**: "BIZZY BEAR" and "NOSY CROW" are probably registered. "Stories Aloud" appears with ® in Nosy Crow's own materials.
- **Get-up** (the recognisable overall look of a product), protected in the UK by passing off and in the US as trade dress: the yellow bear, the square white-board covers, numbered series spines, the cover layout and the series typography.
- **Registered designs** (UK and EU, up to 25 years) on the look of a product.
- **UK unregistered design right** (CDPA 1988 s.213) in the shape or configuration of a mechanism. It lasts 10 years from first marketing or 15 years from creation. It excludes a "method or principle of construction" and must-fit or must-match features, and infringement requires copying (*Lambretta v Teddy Smith* [2004] EWCA Civ 886). The EU unregistered Community design lasts 3 years from first disclosure in the EU.
- **Patents** are possible on genuinely new paper-engineering mechanisms, and on personalisation or narration systems.

**Checklist**

- [ ] **Written assignment agreements** (the creator transfers their rights to Made Happy) from the author, illustrator and paper engineer, signed before files go to print.
- [ ] **Written consent and rights from any narrator** whose voice you use. Voice suppliers require a recorded consent statement for custom voices *(to verify)*.
- [ ] **Trade mark clearance** at UKIPO, EUIPO and (for the US) USPTO for "Tiffin & Me", "Tiffin", "Made Happy" and any older-range names, in classes 9, 16, 28 and 41. Then file your own marks before pitching to anyone.
- [ ] **Check the competitors' registrations**: "BIZZY BEAR", "Stories Aloud" and Nosy Crow's series get-up.
- [ ] **A freedom-to-operate search** (checking that no design or patent blocks you) on any new mechanism and on "name-inserted narration".
- [ ] **Register your own designs** for any genuinely new mechanism.
- [ ] **Keep clear in marketing.** Never use "Bizzy Bear" or "Nosy Crow" in product names, Amazon keywords, ads or cover styling. Don't use the phrases "Stories Aloud" or "scan the code, hear the story".
- [ ] **Keep pronunciation-data licences clean** *(to verify)*:
  - The CMU Pronouncing Dictionary allows unrestricted commercial use.
  - Wiktionary-derived data (WikiPron) and Lingua Libre audio are share-alike (CC BY-SA), so use them for internal reference only.
  - ipa-dict mixes licences.
  - Forvo and NameShouts are commercial APIs.
  - ONS baby-name statistics come under the Open Government Licence.
- [ ] **Keep software licences clean:**
  - The prototype's vendored QR generator is MIT-licensed: keep its licence header.
  - MindAR is MIT.
  - 8th Wall's closed engine binary has a restrictive licence. Clause 1.2 bars use with products that are both "offered for a fee" and whose value derives "entirely or substantially" from the software. Its MIT open-source engine does not have this restriction.
  - The eSpeak NG wrapper used by kokoro-js is GPL, and that licence is disputed.
  - The Coqui XTTS-v2 voice model is non-commercial only.
- [ ] **Treat the prototype's art and character as placeholders** until the commissioned versions are signed off.

The series bible records an informal originality check on "Tiffin" (no children's character of that name found by web search in September 2026). That's a web search, not a trade mark search.

---

## Sources

The compliance research could not open any regulator or legislation site. URLs marked "quoted, not opened" appeared in secondary sources but were not read directly. The api.github.com links are GitHub-hosted copies of legal texts or summaries that the researchers could read.

**UK data protection, the Children's Code and the Data (Use and Access) Act 2025**
- https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-what-does-it-mean-for-organisations/ (quoted, not opened)
- https://www.legislation.gov.uk/ukpga/2025/18/section/81/enacted (quoted, not opened)
- https://www.gov.uk/government/publications/uk-us-data-bridge-supporting-documents/uk-us-data-bridge-factsheet-for-uk-organisations (quoted, not opened)
- https://api.github.com/repositories/1181897234/contents/skills/privacy/uk-aadc-implementation/references/standards.md?ref=9b2ef9eae161c00a17241d42a388571321b33e9f
- https://api.github.com/repositories/1181897234/contents/skills/privacy/uk-aadc-implementation/SKILL.md?ref=9b2ef9eae161c00a17241d42a388571321b33e9f
- https://api.github.com/repositories/1342488357/contents/docs/childrens-code.md?ref=0fa0c33960bbaf35951d8c6d0219f648da055f46
- https://api.github.com/repositories/1233304192/contents/docs/compliance/LEGAL_FRAMEWORK.md?ref=0faefe4ff74130469be4a9b940dd14b1dd008a59
- https://api.github.com/repositories/1305788058/contents/context/regulations/uk-data-protection.md?ref=068b0616e83695a0ab236353d253780987738261
- https://api.github.com/repositories/1342329729/contents/docs/research/03-regulation-and-privacy.md?ref=bc577d4997039b141f997beb887215033bba258a
- https://api.github.com/repositories/1383956215/contents/docs/legal/data-protection-checklist.md?ref=7144f2f12ecfc3d96fc4b36ad99ba1df88151c09
- https://api.github.com/repositories/1335314196/contents/library/compliance/requirements/uk-gdpr-dpa2018.md?ref=c919aedde754916cc8dd6f7b1ccc1a08c92560d7

**EU: GDPR Art 8, DSA, AI Act**
- https://api.github.com/repositories/1181897234/contents/skills/privacy/gdpr-parental-consent/SKILL.md?ref=9b2ef9eae161c00a17241d42a388571321b33e9f
- https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors (quoted, not opened)
- https://api.github.com/repositories/1034349949/contents/src/app/[locale]/blog/brazil-lessons-on-kids-online-protection/content.mdx?ref=c23df279f718d2f68e51c3f5caa19b7abcf0a829
- https://api.github.com/repositories/1130531814/contents/backend/knowledge_base/guides/csam_regulation_online.md?ref=0040296de0b9f0a3f164f71145e81f253143416d
- https://api.github.com/repositories/666143144/contents/_posts/2026-08-02-ai-act-article-50-transparency-banks-omnibus-2026.md?ref=67f6fda43c4f2f8447a9f18541b84f8d93266292

**US: COPPA**
- https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule (quoted, not opened)
- https://api.github.com/repositories/1248965986/contents/all_rules/united-states/federal/16-cfr-part-312-coppa-rule.md?ref=090a22465cc23c94e6deb3151cada709980e43f3
- https://api.github.com/repositories/1248965986/contents/all_rules/united-states/federal/sources/us-federal-coppa-rule-16-cfr-part-312.ecfr-gov.xml?ref=090a22465cc23c94e6deb3151cada709980e43f3
- https://api.github.com/repositories/1232448885/contents/software-development/cipa-coppa-school-platform/references/compliance-decision-tables.md?ref=4ccd0664515f507ee8ec409e8a5dcfc790b9e30b
- https://api.github.com/repositories/1335314196/contents/library/compliance/requirements/coppa.md?ref=c919aedde754916cc8dd6f7b1ccc1a08c92560d7
- https://api.github.com/repositories/1364656345/contents/docs/research/k5-math-game/02-mobile-feasibility.md?ref=79d125d4762fd19977ea437e9f3ac5d188c2a468

**Voice suppliers and data handling**
- https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/faq-tts
- https://learn.microsoft.com/en-us/legal/cognitive-services/speech-service/text-to-speech/concepts-disclosure-guidelines
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/batch-synthesis-properties.md
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/regions.md
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/professional-voice-create-consent.md
- https://aws.amazon.com/polly/faqs/
- https://docs.aws.amazon.com/polly/latest/dg/data-protection.html
- https://docs.cloud.google.com/text-to-speech/docs/data-logging
- https://docs.cloud.google.com/text-to-speech/docs/endpoints
- https://elevenlabs.io/use-policy
- https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
- https://elevenlabs.io/docs/help-center/product/voices/voice-library/can-childrens-or-child-like-voices-be-added-to-the-voice-library
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- https://developers.openai.com/api/docs/guides/your-data
- https://api.github.com/repositories/1297116088/contents/skills/providers/text-to-speech/elevenlabs-tts/SKILL.md?ref=8c85352d5d75d4dcbe58480bd138e37b9742bab1
- https://api.github.com/repositories/1105002940/contents/plan/overhaul/analysis/gap-privacy-posture-data-egress-ma.md?ref=6e9f51b24be3fb5f86602a38725f0cc5816b1545

**Browser voices and speech recognition**
- https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/resources/network_speech_synthesis/mv3/manifest.json
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_controller_impl.cc
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_speech_api/using_the_web_speech_api/index.md

**Toy safety (GB, EU, US)**
- https://www.gov.uk/government/publications/toys-safety-regulations-2011/toys-safety-regulations-2011-great-britain (quoted, not opened)
- https://api.github.com/repositories/1222283299/contents/data/corpus/processed/UK_Official_uk-toys-safety-regulations-2011-gb.json?ref=21e4bf57a8b462b053fd5bb0a3bc49c1037bba0f
- https://api.github.com/repositories/1213890494/contents/uk/uksi-2026-40.md?ref=6a622002b0e713346c1ee2c4d7b863688e134867
- https://api.github.com/repositories/1130531814/contents/frontend/public/eucanon/2025-2509_toys/index.html?ref=0040296de0b9f0a3f164f71145e81f253143416d
- https://api.github.com/repositories/1274224589/contents/articles/eu-toy-safety-regulation-china.md?ref=b3805ab30a98e6c170154d85123e8f591678d1e0
- https://api.github.com/repositories/1208887022/contents/us/USC-T15-S2063.md?ref=44061d035c7bc104ce2a70768eb041a996c40f8a
- https://api.github.com/repositories/1146946205/contents/backend/src/processing/compliance/rules/us/manufacturing/v2026_08.json?ref=ab1a22dac24346b34df0970c3d858a69527f53ef
- The EN 71 test details and costs had no source; they are from memory and general industry knowledge.

**QR codes and link permanence**
- https://api.github.com/repositories/565208584/contents/data/raw_data/children_summaries.txt?ref=57dac9ab0cf8e62f84a56f14d978ef51081bd4af
- https://api.github.com/repositories/1107573186/contents/Library/Knowledge/Legal/customer-obligations.md?ref=6d189d9b9438502006a7bc640f136b329f7c8ee6
- https://raw.githubusercontent.com/8thwall/8thwall.github.io/main/docs/migration/faq.md
- https://www.perkins.org/resource/qr-codes-and-childrens-video-books/
- https://nosycrow.com/faqs/

**Accessibility**
- https://api.github.com/repositories/23083156/contents/packages/mui-material/src/Radio/accessibility.md?ref=f7fbcb09279713be73a7d1f0700c4c9417e95b23
- https://api.github.com/repositories/1076043819/contents/plugins/arckit-at/commands/at-barrierefreiheit.md?ref=6791b862f8f95783a534a112fcc19915e30f94fe
- https://api.github.com/repositories/97261950/contents/pages/knowledge/legal/eaa/README.md?ref=d057251de417cb4ff0e28fcad0877fee7d9d325f

**IP and licences**
- https://api.github.com/repositories/1067134135/contents/evaluation_dataset/raw/landmark/[2004] EWCA Civ 886.txt?ref=7ea21526099c1230e7a01ddcba9b5a64797fbb99
- https://nosycrow.com/book-series/bizzy-bear/
- https://nosycrow.com/contributor/benji-davies/
- https://www.youtube.com/watch?v=Jkj0ryt7Jt0
- https://github.com/cmusphinx/cmudict
- https://github.com/CUNY-CL/wikipron
- https://github.com/open-dict-data/ipa-dict
- https://raw.githubusercontent.com/8thwall/engine/main/LICENSE
- https://registry.npmjs.org/@8thwall/engine-binary
- https://github.com/xenova/phonemizer.js/issues/6
- https://github.com/coqui-ai/TTS/issues/3490

Internal: [series-bible.md](series-bible.md), [architecture.md](architecture.md), [name-pronunciation.md](name-pronunciation.md) and the prototype code (`js/core/storage.js`, `js/narrator/voices.js`, `js/app/screens/settings.js`, `js/app/screens/pronunciation.js`, `js/app/parent-gate.js`, `js/reader/reader.js`, `index.html`).

---

## Open questions / to verify

**Before relying on any of this**
- [ ] Re-check everything against the primary sources: the ICO Children's Code and DUAA guidance, the FTC's COPPA FAQ and the Federal Register text, legislation.gov.uk (SI 2011/1881, SI 2026/40, DUAA ss.81, 103 and 112) and EUR-Lex (Reg 2025/2509, Reg 2019/1020, Reg 2023/988). None of these could be opened.

**UK and EU privacy**
- [ ] Does the ICO consider purely on-device personalisation, with nothing transmitted, to be processing by the app provider? Is there post-DUAA ICO guidance on on-device processing and children?
- [ ] Does the PECR analytics exemption fit a child-directed service at all?
- [ ] Is ICO fee registration needed?
- [ ] Have any regulations been made under section 72 of the Children's Wellbeing and Schools Act 2026 to change the UK digital age of consent? (Reported as not made as of Sept 2026; unverified.)
- [ ] The digital age of consent in each EU country you'd sell into.

**US**
- [ ] Does the FTC treat information a parent enters in a parent-gated part of a child-directed service as "collected from a child"? Is there FTC guidance on on-device-only processing?
- [ ] Which US state laws would apply?

**Voice suppliers**
- [ ] Current retention and training terms (UK/EU customers, Sept 2026) for Google Cloud TTS, Azure AI Speech, Amazon Polly and ElevenLabs, and whether they allow use in child-directed services.
- [ ] Do Edge's "Online" voices send text to Microsoft, as Chrome's Google voices do to Google?
- [ ] Which suppliers are Data Privacy Framework participants with the UK Extension?

**Toy safety**
- [ ] What does SI 2026/40 change in the Toys (Safety) Regulations 2011?
- [ ] What do Schedule 1 of the GB 2011 Toys Regulations and Annex I of Directive 2009/48/EC say about books, and what does the Commission's toy-book guidance say now? (Ask the test lab.)
- [ ] The current EN 71-1 edition and its tests for paper and board books for under-36-months. Is ASTM F963-23 the current mandatory US version?
- [ ] Real EN 71 test costs per title, and how the older range's age grading changes the tests.
- [ ] Do any toy rules apply to pilot samples given to families?

**QR, accessibility and IP**
- [ ] Is a book plus QR audio "goods with digital elements" under UK or EU consumer law? What wording for the "free for N years" promise is safe?
- [ ] Does the European Accessibility Act cover a free QR-linked read-along? Would Made Happy qualify as a microenterprise?
- [ ] Are "BIZZY BEAR", "Stories Aloud" and the Bizzy Bear get-up registered (UKIPO, EUIPO, USPTO)? Are there patents on personalised, name-inserted audio narration?
- [ ] Is "Tiffin & Me" (and "Made Happy" for books and toys) clear to register in classes 9, 16, 28 and 41?

**Prototype checks**
- [ ] When the magic-window code lands, confirm that it processes everything on the phone, never saves frames, shows an explainer before the camera prompt and sits behind a grown-up step.
- [ ] Confirm the reader has, or gains, a pause control for narration (WCAG 1.4.2).
