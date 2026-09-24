# The speech tool: saying the child's name right

**The short answer.** No machine can reliably guess how a family says a name. So the app never guesses silently. It offers its best options, the grown-up listens and picks one, and if none is right they can type how it sounds, say it, or record it. The prototype does all of this on the phone, with the browser's own voice and nothing sent to our servers. Production adds a cloud voice that can be given exact sounds, a shared cache of name audio, smarter ranking from a parent's recording, and a human narrator as the last resort.

This document explains how the prototype works today, what production adds, how we check quality, where the limits are, and what it means for privacy. The companion document [voice-and-audio-options.md](voice-and-audio-options.md) covers choosing a voice supplier, costs and what browsers can do.

> **How to read this.** Much of the background research could only be partly checked, because many supplier, regulator and research sites were blocked during the research. Anything marked *(to verify)* comes from medium- or low-confidence research. Don't repeat those points in investor, marketing or legal material until someone has checked them. Unmarked statements about the prototype come from reading its code.

---

## 1. Why this matters

- **A wrong name is a harm, not just a glitch.** Research on schools describes repeated mispronunciation of a child's name as damaging to their sense of self and belonging. UK surveys report that people with non-Anglo names often have their names said wrong, and that most say simply being asked would have prevented it *(to verify: figures come from search summaries)*. A book that says a child's name wrong at bedtime works against the whole product.
- **Names are hard for computers.** Standard spelling-to-sound software (G2P, short for grapheme-to-phoneme) gets roughly 12–20% of proper names wrong *(to verify)*. A name's language of origin changes how it is said, and one spelling can have several correct pronunciations: Leah (LEE-uh or LAY-uh), Zara, Nia, Isla, Caoimhe.
- **Products that do this well all end the same way.** The person confirms by ear, types a sounds-like spelling or records the name, and a human steps in if that fails. LinkedIn and Microsoft Teams store a short self-recording. Apple Contacts uses a typed phonetic spelling. Alexa lets you pick from options and mark the stressed syllable. Graduation services such as Tassel allow a few AI retries and then hand over to a human voice actor *(to verify: product details come from search summaries)*.

So the design principle is **always ask, make correcting easy and blame-free, and keep a human fallback.**

---

## 2. What the grown-up sees

1. They scan the QR code and type the child's name on the book's landing page.
2. The app picks a starting pronunciation straight away (the best dictionary match, or the name as written), so nothing ever blocks.
3. **Every new name goes to the "How do we say Siobhan?" screen**, even common ones. It shows two to four options. Each has a play button and a "That's it!" button. The top dictionary option carries a "Best match" label and starts selected, so confirming an easy name takes one tap.
4. **"Try it in the story"** plays the chosen pronunciation inside two real lines of the book (for Book 1, "Goal, {name}!" and "Night night, Tiffin. Night night, {name}."), with the words lighting up as they are read. A name can sound right on its own and wrong in a sentence, so this matters.
5. **"None of these?"** opens three alternatives:
   - **Type it how it sounds**: "shih-VAWN", or just "Shivawn".
   - **Say it for us**: the browser's speech recogniser writes down what it heard. This only appears where the browser supports it, and always with a privacy note.
   - **Record your voice**: the story plays the grown-up's own recording wherever the name comes up.
6. **"That's right — let's read!"** saves the choice on the phone.

The book always shows the name exactly as typed (Siobhan). Only the voice gets the sounds-like version ("Shi vawn").

---

## 3. The layers, as built in the prototype

The code lives in `js/pronounce/` (dictionary, rules, respelling), `js/audio/recognise.js` (say it), `js/audio/recorder.js` (record it) and `js/app/screens/pronunciation.js` (the screen). The layers are listed from most trusted to least.

| # | Layer | What it gives | When it appears | Code |
|---|---|---|---|---|
| 1 | Dictionary | Curated pronunciations, with one to three variants per name | The name, or one of its other spellings, is in `data/names.json` | `lexicon.js` |
| 2 | As written | The voice reading the plain spelling | Always offered | `index.js` |
| 3 | Spelling-pattern suggestions | Guesses for unknown names ("Polish style", "Irish style") | Only when the name is not in the dictionary | `rules.js` |
| 4 | Type it how it sounds | The grown-up's own respelling | "None of these?" | `respell.js` |
| 5 | Say it | Sounds-like spellings from speech recognition | "None of these?", where the browser supports it | `recognise.js` |
| 6 | Record your voice | The grown-up's recording played in place of the name | "None of these?", where the browser can record | `recorder.js`, `narrator/plan.js` |

Whatever is chosen is saved on the child's profile as `{say, ipa, respell, label, source, useRecording, recordingId}`. `say` is what today's browser voice reads. `ipa` is kept whenever we know it, ready for a production voice that accepts exact sounds.

### Layer 1: the curated dictionary

Each dictionary entry holds the name, its other spellings, its origin, and one or more **variants**. Each variant carries three forms of the same pronunciation:

| Field | What it is | Isla, variant 1 | Isla, variant 2 |
|---|---|---|---|
| `ipa` | The sounds in IPA (the International Phonetic Alphabet, the standard symbols linguists use for speech sounds). Exact, and used by cloud voices in production. | ˈaɪlə | ˈɪzlə |
| `respell` | A readable respelling, with the stressed syllable in CAPITALS. This is what grown-ups see. | EYE-luh | IZ-luh |
| `say` | A plain-text spelling tuned so that an ordinary English voice with no IPA support reads it correctly. This is what today's browser voice gets. | Eyela | Izla |
| `label` | A short label for parents | Most common in UK | As spelt |

How lookup works:

- Matching ignores case, accents and apostrophes, so "Oisin" finds "Oisín" and "darcy" finds "D'Arcy".
- Other spellings share one entry. Niamh, Neve and Neamh all say NEEV. The research recommends the same for Muhammad, Mohammed and Mohammad.
- Double names are tried whole first ("Anne-Marie"), then part by part ("Mary Kate" is Mary plus Kate), and the most likely combinations are offered.
- Up to three dictionary variants are shown, followed by "As written" (unless it would sound the same).

**Status.** `data/names.json` holds **545 names with 657 pronunciations**: Irish, Scottish Gaelic, Welsh and Cornish; South Asian, Arabic, Somali, West and East African, East Asian, Eastern European, Hebrew, Turkish, Greek and Albanian; and the most popular names in England and Wales plus often-mispronounced European names. Each segment was written twice, independently. A sceptical reviewer checked each segment, a final adjudicator settled the 35 names where the two passes disagreed, and every "say" spelling was machine-checked. **None of it has yet been checked by native speakers**, and that check is needed before launch (see section 5).

**What to curate first**, following the research:
- The most common names in the ONS England and Wales lists, and the Scottish (NRS) and Northern Irish lists. Muhammad was the top boys' name in 2024 and 2025 and Olivia the top girls' name in 2025 *(to verify)*. Add fast risers such as Eliana, Anaya and Alba *(to verify)*.
- A hand-picked "often mispronounced" list: Irish, Welsh, Scottish Gaelic, South Asian, Arabic, West African, East Asian and Eastern European names.
- Only add a second variant where UK families genuinely use both (Caoimhe KEE-vuh or KWEE-vuh; Leah LEE-uh or LAY-uh).

**Licences for source data** *(to verify before use)*. CMUdict can be used commercially without restriction, but it gives US pronunciations only. Wiktionary-derived data such as WikiPron is share-alike (CC BY-SA), so use it for reference only unless we accept that licence. Forvo and NameShouts are paid services.

### Layer 2: always confirm by ear

Even a dictionary match gets confirmed, because the dictionary cannot know which valid version a family uses. The research recommends measuring how often parents accept the first option as the main quality measure (see section 6).

Two details make this fast:
- The first option starts selected, so an easy name takes one tap.
- Options that would sound identical are merged, so the parent never hears the same thing twice.

### Layer 3: spelling-pattern suggestions for unknown names

When a name isn't in the dictionary, `rules.js` looks for spelling patterns that are rare in English and offers a guess in that language's style. There are seven styles: Irish/Gaelic, Welsh, Polish, Mandarin (pinyin), Italian, Spanish/Portuguese and French. There are also some English ambiguity rules, such as the silent "s" in Isla, a hard or soft "ch" in Chloe, and the "ee-a" or "ay-a" ending of Leah.

The rules are deliberately cautious. Each part of a name gets at most one language style, so José isn't also given a French reading. The parent always has the last word.

Real output from the current rules:

| Typed | Suggestions offered (after "As written") |
|---|---|
| Saoirse | Seersha (Irish / Gaelic style) |
| Aoife | Eefa (Irish / Gaelic style) |
| Dafydd | Davith (Welsh style) |
| Łukasz | Wookash (Polish style) |
| Xinyi | Shinyee (Mandarin style), Zinyi ("Z" sound) |
| Chiara | Kiara (Italian style), Shiara (soft "sh") |
| Leah | Leea ("Ee-a" ending), Laya ("Ay-a" ending) |

**Where they fall short**, and why the dictionary comes first:
- Oisín gets "Oiseen (Spanish / Portuguese style)", which is wrong. It is said uh-SHEEN or OH-sheen.
- Wojciech gets "Voitsheh", which is close but not right (VOY-chekh).
- Oluwaseun and Zofia get no suggestion at all.

### Layer 4: type it how it sounds

The grown-up can type either:
- **a respelling**, with hyphens between syllables and the loud (stressed) syllable in CAPITALS: `shih-VAWN`, `EYE-luh`, `oh-LEEV-yuh`; or
- **a plain sounds-like spelling**: `Shivawn`, `Neeve`.

A respelling is turned into IPA (kept for production) and into a "say" spelling for today's voice. A live line shows what will happen ("Stressing shih-VAWN — the voice will say 'Shi vawn'"), and a Listen button plays it. The research found that respelling takes trial and error (Apple users often need several tries before Siri gets a name right), so instant replay matters.

One trick makes this work with plain voices. When the stress isn't on the first syllable, the app splits the word just before the stressed syllable ("Shi vawn", "A sheen"). That reliably moves the emphasis in most English voices.

| Typed | IPA kept for production | What today's voice is given |
|---|---|---|
| shih-VAWN | ʃɪˈvɔːn | Shi vawn |
| EYE-luh | ˈaɪlə | Eyela |
| uh-SHEEN | əˈʃiːn | A sheen |
| SEER-shuh | ˈsɪəʃə | Seersha |
| KEE-vuh | ˈkiːvə | Keeva |
| oh-LEEV-yuh | əʊˈliːvjə | Oh leevya |
| DAV-idh | ˈdævɪð | Davith |
| VOY-chekh | ˈvɔɪtʃɛx | Voychek (English voices have no "kh" sound, so it becomes "k") |
| Shivawn | (none: a plain spelling) | Shivawn |

**The respelling key.** This is our house style. It is based on Wikipedia's English respelling key, uses British sounds, and uses no special symbols. The BBC Pronunciation Unit's newer system also uses plain letters with CAPITALS for stress.

| Write | Sound (IPA) | As in |
|---|---|---|
| a | æ | cat |
| ah | ɑː | father |
| ar | ɑː | car |
| air | ɛə | hair |
| aw | ɔː | law |
| ay | eɪ | day |
| e, eh | ɛ | bed |
| ee | iː | see |
| eer | ɪə | near |
| ew | juː | few |
| i, ih | ɪ | sit |
| eye, igh (or y as a syllable's vowel: MY-luh) | aɪ | eye |
| o | ɒ | hot |
| oh | əʊ | go |
| oo | uː | food |
| uu | ʊ | book |
| oor | ʊə | poor (older British) |
| or | ɔː | for |
| ow | aʊ | now |
| oy | ɔɪ | boy |
| u | ʌ | cup |
| uh | ə (the weak "uh" sound, called schwa) | the "a" in "about" |
| ur | ɜː | fur |
| ch | tʃ | chip |
| j | dʒ | jam |
| sh | ʃ | ship |
| zh | ʒ | measure |
| th | θ | thin |
| dh | ð | this |
| ng | ŋ | sing |
| kh | x | loch |
| hl | ɬ | Welsh "ll" |
| g | ɡ (always hard) | go |
| y (before a vowel) | j | yes |

Syllables are separated by hyphens and words by spaces, and the stressed syllable is in CAPITALS. Parents rarely follow a key exactly, so the reader is lenient: it also understands ai, ey, ea, oa, ou, er, ph, ck, x, c and q. A capital only on the first letter ("Shivawn") is not treated as stress.

### Layer 5: say it (speech recognition)

The grown-up taps **Say it** and says the name once. The browser's speech recogniser writes down what it heard, and each distinct spelling becomes an option labelled "What we heard". Recognisers tend to spell a name the way it sounds ("Neeve" for Niamh), which is exactly what a plain voice needs. Filler words ("um", "her name is") are dropped.

This is a convenience, not a foundation:
- **Privacy.** By default, the browser sends the audio to its maker's servers (Google for Chrome, Apple for Safari). Recognition on the device itself exists only in desktop Chrome (and Edge) 139 and later. The screen says so before listening.
- **Reliability.** Developers report that it does nothing inside an iPhone home-screen web app and can hang in Safari *(to verify on devices)*. Firefox doesn't offer it outside test versions.
- **Accuracy.** Recognisers lean towards real words and known names, so for a well-known name they often return the normal spelling, which is the very thing the voice already gets wrong *(to verify)*.

The prototype only shows Say it where the browser supports it, and every failure (no permission, no speech, no network) comes back as a short, friendly message, usually suggesting typing the name instead.

### Layer 6: record your voice

Where the browser can record, the grown-up gets a 3-2-1 countdown and up to 4 seconds to say the name. Recording stops shortly after they stop speaking. The app then:
- trims the silence at each end, keeping a short lead-in so soft sounds such as "Sh" and "H" survive;
- evens out the volume and softens the edges;
- saves it as a plain WAV file that every browser can play (iPhones and Android phones record in different formats).

A switch then reads "Use my recording whenever the story says the name". When it is on, the reading plan (`narrator/plan.js`) plays the recording in place of the spoken name. Possessives ("Ava's") are still read by the voice, because a recording can't grow an "'s". If the clip won't play, the voice says the name instead.

- **It stays on the phone.** Recordings are stored with the rest of the child's data, and "Forget everything on this device" deletes them.
- **It is the grown-up's voice, not the child's, on purpose.** Under the US children's privacy law (COPPA), a recording of a child's voice counts as the child's personal information, and voiceprints now do too *(to verify with a lawyer)*. A parent's own recording kept on the device is the lowest-risk option.
- **The trade-off.** A home recording will not match the narrator's voice, volume or room sound. A name at the end of a sentence ("Well done, Aoife!") is also said differently from one in the middle. The series bible's rule is that the name is always spoken inside a fully synthesised sentence. The recording is the deliberate exception, a last resort when no voice can say the name.

---

## 4. What production adds

| Addition | What it does | Why the prototype can't do it | Notes |
|---|---|---|---|
| **Cloud voice with exact sounds** | Sends the stored IPA to a voice service using SSML (a markup language for speech) `<phoneme>` tags, e.g. `<phoneme alphabet="ipa" ph="ʃɪˈvɔːn">Siobhan</phoneme>`, or through a hosted pronunciation list (a "lexicon") | No browser acts on SSML: Safari reads the text as plain text and Chrome strips the tags | Azure, Amazon Polly, Google (Chirp 3 HD, with reported problems) and ElevenLabs (some models only) accept IPA *(to verify per voice)*. For a pick with no IPA ("as written" or "heard"), send the `say` spelling as an alias instead, or generate IPA on the server. |
| **Per-name caching** | Renders each name sentence once for each book, name, pronunciation and voice, then reuses it for every child with the same name and pronunciation | Nothing server-side exists yet | Cost and architecture are in the voice document. The pronunciation is part of the cache key, so an Isla said EYE-luh and an Isla said IZ-luh get different audio. |
| **Ranking from a recording** | A phoneme recogniser (software that writes down the individual sounds it hears) compares the parent's recording with each candidate and reorders them. The parent still confirms. | Too heavy for a phone on first scan | ZIPA (MIT licence, 64M or 300M parameters) is the first choice; wav2vec2-lv-60-espeak-cv-ft (Apache-2.0) is second *(to verify sizes and speed)*. Letting it write the name down freely would get about one sound wrong per name, which is why it only ranks candidates *(to verify)*. Needs explicit consent to upload; delete the audio after scoring. |
| **Candidates for unknown names** | A server-side language model proposes two to four pronunciations as IPA plus a respelling, optionally using a language of origin the parent chooses | Needs a server | Research suggests large language models are now strong at spelling-to-sound conversion, but they pick one version confidently, so the parent still confirms *(to verify)*. **Never guess ethnicity or background from the name or family.** |
| **Human narrator fallback** | After at most three automatic tries, offer: "Our narrator will record [name] for you." The narrator records the name in each story line. With consent, the result goes into the dictionary. | Needs people and a workflow | This copies the graduation-announcement services. Present it as a promise ("we will say your child's name right"), not as a failure. Turnaround and cost need working out. |
| **Native-speaker checking** | Every dictionary entry is checked by someone who uses the name, plus a panel of diverse UK parents | A process, not code | See sections 5 and 6. |

A later option is an on-device voice that accepts phonemes (Kokoro or Piper, running in the browser). It would give exact sounds with no per-use cost and no data leaving the phone. Licensing and word-timing gaps need resolving first; see the voice document.

---

## 5. How the dictionary is checked

Run:

```
node tools/check-lexicon.mjs [path/to/names.json] [--json] [--strict]
```

It makes three checks:

1. **Structure.** Required fields are present, the IPA and "say" text use allowed characters, respellings parse, and no spelling belongs to two entries.
2. **Consistency.** Does the respelling (shih-VAWN) turn into roughly the same sounds as the IPA (ʃɪˈvɔːn)? It warns below 60% similarity.
3. **Speakability.** Does a plain English voice reading the "say" text produce something close to the IPA? It uses **espeak-ng**, a free, open-source British English voice that can print the sounds it would make, and compares them with the IPA. Small dialect differences are ignored. It warns below 70% similarity, and it also checks that the stress lands on the same syllable.

Only structural errors fail the check. The other two produce warnings, because espeak-ng is a **stand-in**: it sounds robotic, and commercial voices and phone voices may read the same spelling differently. On the current dictionary the check reports 545 entries, 657 variants, 0 errors, 8 warnings and 96% average similarity. The warnings are known limits: sounds a plain English voice cannot make (Welsh "ll", the "ch" in Fiachra), and a few cases where espeak-ng reads a spelling slightly differently from a phone voice.

**What it can't check** is whether the IPA is how families actually say the name. That needs native speakers. The plan is to have each origin group reviewed by speakers, starting with the names flagged medium or low confidence in the dictionary.

---

## 6. Measuring quality

**The main measure is first-candidate acceptance, broken down by name origin**: how often the grown-up keeps the first option without changing it. The origin comes from the dictionary entry's label, never from guesses about the family. Names not in the dictionary form their own group.

Proposed targets from the research (to confirm in a pilot):

| Measure | Target |
|---|---|
| First option accepted, for dictionary names | 90% or more |
| Taps to confirm a name | 3 or fewer |
| How often each fallback is used (typing, say it, record) | Track, no target |
| Grown-ups who give up on the screen | Track, aim for near zero |
| Gaps between origin groups | Look for and fix; recognisers are documented to be less accurate for some accents and groups *(to verify)* |

Before launch, test with a panel of diverse UK parents, with at least 20 names per origin group.

**Collect this carefully.** The app currently sends nothing, and the reading mode should stay free of analytics. Gather these numbers in a consented test panel, or, if ever in the product, as anonymous totals that never contain the name or its origin. A name's origin can hint at ethnicity or religion, which UK data protection law treats as special-category data *(to verify with a lawyer)*.

---

## 7. Limits: sounds an English voice can't make

Some names contain sounds that an English (en-GB) voice cannot produce, however good the pronunciation data is:

| Sound | Example | What happens today |
|---|---|---|
| Welsh "ll" (IPA ɬ) | Llew, Llinos | The key has `hl` for it, but a browser voice can only be given "thl" (HLEW becomes "Thlew"). That is an approximation, not the real sound. |
| Scottish/Welsh "ch" as in loch (IPA x) | Wojciech (VOY-chekh) | The voice gets "k" |
| Arabic sounds made deep in the throat (IPA ħ, ʕ) | Some pronunciations of Arabic names | No English spelling gets close |
| Tones (pitch changes that carry meaning) | Many Yoruba and Mandarin names | English voices don't do tone |

Cloud voices given IPA may do better on some of these, but it is untested *(to verify with a listening test using native speakers)*.

**The plan:** mark these names in the dictionary, and treat a respelling that uses `hl` or `kh` the same way. For those names, point the grown-up towards **Record your voice** (or, in production, the human narrator) rather than offering a poor synthetic version. **The prototype doesn't do this steering yet.**

---

## 8. Privacy

**Principle: the child's name stays on the phone.** No account is needed. The name, the chosen pronunciation and any recording are stored on the device (`js/core/storage.js`), and the grown-up can wipe everything with "Forget everything on this device".

What leaves the phone, and when:

| Action | What is sent | To whom | Prototype today |
|---|---|---|---|
| Typing the name, picking from the dictionary, typing a respelling | Nothing | – | Yes, nothing sent |
| Hearing the story with an **on-device** voice | Nothing | – | Used on phones by preference |
| Hearing the story with an **online** voice (Chrome's "Google UK English" voices; Edge's voices with "Online" in the name) | Each sentence's text, including the name | Google or Microsoft | **Possible**, see below |
| Say it | The recording of the grown-up saying the name | Google or Apple | Only when tapped, with a notice |
| Record your voice | Nothing | – | Yes, it stays on the phone |
| Production cloud voice | The first name and its IPA only, with no account or device IDs | Our server, then the voice supplier | Not built |

**Online browser voices are a gap to close.** Chrome's Google voices run on Google's servers, so the text they read, including the child's name, goes to Google. Edge's "Online" voices presumably work the same way with Microsoft *(to verify)*. On phones the prototype prefers on-device voices, and iPhones only offer Apple's on-device voices to web pages *(to verify on devices)*. On computers, however, the prototype currently ranks online "natural" voices first because they sound better. The settings list marks them "· online" but doesn't ask first.

**Recommendation: use on-device voices by default, and make online voices an opt-in** in the grown-ups' settings, with one plain sentence: "Online voices sound more natural, but your browser sends the story text, including your child's name, to Google or Microsoft." This is a small change to the voice ranking in `js/narrator/voices.js` and the settings screen.

**Legal footing** *(to verify with a lawyer; the regulator's sites could not be opened during the research)*:
- A child's first name typed by a parent is personal data under UK GDPR once it is linked to a device or household. Keeping it only on the device greatly reduces our obligations, but may not remove them.
- The ICO Children's Code almost certainly applies to the web app. It expects privacy-protecting defaults, collecting as little as possible, and a data protection impact assessment (DPIA) before launch.
- As soon as a name reaches a server (cloud voice, error logs), we become responsible for it under UK GDPR. The voice supplier then needs a data processing agreement, and we need a lawful route for any transfer abroad.
- A child's own voice recording is higher-risk data (see Layer 6). That matters more for the planned under-10s range, where children may use the app themselves: keep recording as a grown-up step behind the parent gate.

---

## 9. Known gaps in the prototype (as of 24 September 2026)

- [ ] The dictionary needs native-speaker checks, especially for names with more than one family pronunciation.
- [ ] Online browser voices are not yet opt-in (section 8).
- [ ] No steering to "Record your voice" for sounds English voices can't make (section 7).
- [ ] A one-syllable respelling typed in capitals (e.g. "NEEV") isn't recognised as a respelling, so the voice is given "NEEV" in capitals. Some voices spell capitals out letter by letter. Test and fix.
- [ ] The spelling rules misfire on some names (Oisín). Dictionary coverage is the real fix.
- [ ] No nickname-only pronunciation yet. The research suggests also asking "What do you call them at home?" (e.g. "Mo" for Muhammad) and speaking that.
- [ ] Nothing server-side yet: no cloud voice, no ranking from recordings, no human fallback.

---

## Sources

**How other products handle names** *(mostly from search summaries; primary pages were blocked)*
- https://www.linkedin.com/help/linkedin/answer/a550527/record-and-display-your-name-pronunciation-on-your-profile
- https://learn.microsoft.com/en-us/microsoftteams/name-pronunciation
- https://www.macrumors.com/how-to/correct-siri-pronunciation-names/
- https://www.nextpit.com/how-to-alexa-pronounce-name-correctly
- https://cloud.name-coach.com/
- https://tassel.com/blog/we-use-ai-to-announce-graduate-names-heres-exactly-how
- https://www.bostonglobe.com/2026/04/17/metro/unh-ai-name-reader-grad-walk-nh/
- https://www.nameshouts.com/

**Why names are hard, and why it matters**
- https://www.isca-archive.org/eurospeech_2003/vozila03_eurospeech.pdf
- https://aclanthology.org/N12-1039.pdf
- https://arxiv.org/html/2606.22009
- https://www.tandfonline.com/doi/abs/10.1080/13613324.2012.674026
- https://www.ntu.ac.uk/research/groups-and-centres/projects/say-my-name-experiences-and-impacts-of-pronunciation-of-names-in-higher-education-in-contexts-of-culturally-diverse-student-identities
- https://preply.com/en/blog/name-bias-uk-research/

**Name lists and pronunciation data**
- https://www.ons.gov.uk/releases/babynamesinenglandandwales2025
- https://www.gov.uk/government/statistics/baby-names-in-england-and-wales-2025
- https://www.nrscotland.gov.uk/publications/babies-first-names-2024/
- https://github.com/cmusphinx/cmudict
- https://github.com/CUNY-CL/wikipron
- https://github.com/open-dict-data/ipa-dict
- https://api.forvo.com/plans-and-pricing/

**Respelling conventions**
- https://en.wikipedia.org/wiki/Help:Pronunciation_respelling_key
- https://en.wikipedia.org/wiki/BBC_Pronunciation_Unit
- https://warwick.ac.uk/fac/soc/law/research/projects/saymyname/

**Browser speech and recognition**
- https://github.com/mdn/browser-compat-data/issues/15663
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_controller_impl.cc
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/cocoa/PlatformSpeechSynthesizerCocoa.mm
- https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/resources/network_speech_synthesis/mv3/manifest.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_speech_api/using_the_web_speech_api/index.md
- https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md
- https://github.com/WebAudio/web-speech-api/issues/96
- https://developer.apple.com/forums/thread/748048
- https://github.com/TalAter/annyang/pull/130
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaRecorder.json

**Cloud voices that accept IPA**
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation
- https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html
- https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html
- https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- https://discuss.ai.google.dev/t/custom-pronunciations-not-working-with-chirp3-hd-voices/106259
- https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries

**Phoneme recognisers and checking tools**
- https://github.com/lingjzhu/zipa
- https://aclanthology.org/2025.acl-long.961/
- https://huggingface.co/facebook/wav2vec2-lv-60-espeak-cv-ft
- https://huggingface.co/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX
- https://github.com/xinjli/allosaurus
- https://arxiv.org/abs/2510.24992
- https://arxiv.org/abs/2606.11639
- https://github.com/espeak-ng/espeak-ng/blob/master/src/espeak-ng.1.ronn

**Privacy and children's data** *(secondary copies; regulator sites were blocked)*
- https://www.legislation.gov.uk/ukpga/2025/18/section/81/enacted
- https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-what-does-it-mean-for-organisations/
- https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- https://api.github.com/repositories/1248965986/contents/all_rules/united-states/federal/16-cfr-part-312-coppa-rule.md?ref=090a22465cc23c94e6deb3151cada709980e43f3
- https://api.github.com/repositories/1181897234/contents/skills/privacy/uk-aadc-implementation/references/standards.md?ref=9b2ef9eae161c00a17241d42a388571321b33e9f

## Open questions / to verify

- [ ] **Native-speaker checks** of every dictionary entry, starting with medium- and low-confidence ones. Which names have more than one real UK pronunciation?
- [ ] **Listening test:** how well do Azure, Polly, ElevenLabs and Cartesia say 50–100 hard UK names from the same IPA, including Irish broad and slender consonants, Welsh "ll", Arabic ħ/ʕ and tones?
- [ ] **Devices:** does recording work reliably in an iPhone home-screen web app on iOS 18/19 and later, and does the microphone permission prompt reappear on each launch? Does "Say it" work there at all?
- [ ] **Which voices each device actually offers**, and which are online. In particular, confirm that Edge's "Online" voices send text to Microsoft and that iPhones expose only on-device voices.
- [ ] **Phoneme recognisers:** real download size and phone speed for ZIPA's small model and the wav2vec2 port. Is POWSM's licence commercially usable, and does it beat ranking?
- [ ] **Legal:** does purely on-device storage make Made Happy responsible for the name under UK GDPR? What consent is needed to upload a recording for ranking, or to add a parent's correction to the dictionary? Get a DPIA done before any server feature.
- [ ] **Data licences:** confirm CMUdict terms and whether any share-alike data has been used in the drafted dictionary.
- [ ] **Figures quoted from search summaries** (G2P error rates, survey percentages, ONS rankings, product details) need checking against the original pages before any external use.
- [ ] **Human fallback:** turnaround, cost per name and how to fit it into a no-account product (how do we deliver the clip back to the right phone?).
