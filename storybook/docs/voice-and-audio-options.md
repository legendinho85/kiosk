# Voice and audio options for production

**The short answer.** Keep the browser's free built-in voice for the prototype and as the offline fallback, but don't rely on it in production. It can't be told exactly how to say a name, and on most Android phones it can't report which word it is on. For production:

- **Main supplier: Microsoft Azure AI Speech.** It accepts exact sounds (IPA), returns word timings in the same request, has the widest range of British voices, and says it doesn't keep text sent to its live service *(to verify)*.
- **Fallback: Amazon Polly.** It has the clearest terms for children's apps.
- **ElevenLabs: only as a premium narrator, and only after written clearance.** Its usage policy bars products aimed at under-13s.
- **Architecture:** record or render the sentences without the name once per book, generate only the sentences that contain the name, cache them so each name is paid for once, and serve them from a CDN (a content delivery network, which stores files close to users). Store word timings with the audio so highlighting stays in sync.
- **Cost:** for Book 1 that is about **$0.006 per new name on Azure** *(to verify)*. Reading the book again, or another child with the same name and pronunciation, costs only delivery.

This document compares suppliers, sets out the recommended architecture and costs, covers human narrators and voice cloning, and explains what browsers can and can't do today. How the child's name is chosen and checked is in [name-pronunciation.md](name-pronunciation.md).

> **How to read this.** None of the suppliers' official pricing pages could be opened during the research, so **every price here is from secondary sources and marked *(to verify)***. Prices are in US dollars, excluding VAT; recheck them in pounds before budgeting. Terms of use also change often. Browser behaviour was checked against browser source code and is high confidence unless marked.

---

## 1. What the voice has to do

| Need | Why |
|---|---|
| Say the child's name exactly as the parent chose | The whole product rests on it |
| Accept exact sounds, i.e. IPA (the International Phonetic Alphabet) through SSML, a markup language for speech, or through a hosted pronunciation list (a "lexicon") | A sounds-like spelling isn't enough for many names |
| Report when each word is spoken ("word timings") | For word-by-word highlighting and for making the name appear in the picture as it is said |
| Warm British (en-GB) voices suitable for under-5s | UK market and bedtime reading |
| Allow us to store and replay the audio | Caching is what makes it cheap |
| Terms that allow use in a product for young children | Some suppliers forbid it |
| Keep data minimal, ideally in the UK or EU, with no training on our text | Children's Code, UK GDPR |

---

## 2. Supplier comparison

### 2a. Can it say the name right, and follow along?

| Supplier | Exact sounds (IPA) | Word timings | British voices |
|---|---|---|---|
| **Microsoft Azure AI Speech** | Yes: SSML `<phoneme alphabet="ipa">`, hosted lexicons (up to 100 KB per file; a changed file can take up to 15 minutes to apply) and `<sub>` aliases. "DragonHD" HD voices accept phonemes; "Dragon HD Omni" voices don't. | Yes, in the same request (WordBoundary events), and as a file in batch mode. Some voices have been reported to return zero timings, so test the chosen voice. | 14 standard neural voices, including Sonia, Libby, Ryan and Maisie (a child voice); HD voices (Ada, Ollie, Ryan, Sonia); multilingual Ada and Ollie. HD voices are not offered in the UK South region. |
| **Amazon Polly** | Yes, on its standard, neural and long-form engines (IPA or X-SAMPA, a keyboard-friendly version of IPA), plus lexicon files. Only partial on its newest "generative" engine *(to verify)*. | Yes ("speech marks"), but as a **second, separately billed request**. Not available on the generative engine. | Amy, Emma, Brian, Arthur (neural); Amy and reportedly Brian on generative. Runs in London. |
| **Google Cloud Text-to-Speech** | Chirp 3 HD voices take `<phoneme>` and custom pronunciations, including for en-GB. A developer forum reports them not working, so test. | Only through `<mark>` tags. The Chirp 3 HD voices probably don't support them, so we would need our own forced alignment (a tool that lines up known text against audio to get timings). | en-GB supported; voices not compared in the research. |
| **ElevenLabs** | Pronunciation dictionaries. Exact sounds work only on its `eleven_flash_v2` and `eleven_v3` models; other models silently ignore them *(to verify)*. | Yes, character-level timings in the same request. | Described as the most storyteller-like voices; British line-up not compared. |
| **OpenAI TTS** (gpt-4o-mini-tts, tts-1) and **Google Gemini-TTS** | No. Steered only by plain-English instructions and respellings. | No | Not assessed |
| **Cartesia Sonic-3.x** | Yes, inline IPA or dictionaries | Word and phoneme timings (English among the supported languages) | Not checked |
| **Inworld TTS-2** | Yes, inline IPA | Word, character, phoneme and mouth-shape timings | Not checked |
| **Deepgram Aura-2** | Yes, inline IPA (its docs warn UK and US IPA differ) | Not checked | Not checked |
| **Hume Octave 2** | Phoneme editing | Word and phoneme timings | Not checked |
| **Kokoro-82M** (runs on the device) | Yes in its Python version. The browser version doesn't read that syntax, but can be given phonemes directly. | No; timings would have to be estimated or aligned | 8 British voices |
| **Piper** (runs on the device) | Yes, as eSpeak phonemes | No | en_GB voices exist (each voice about 30–60 MB, with its own licence) |
| **Browser built-in voice** | **No.** No browser acts on SSML. | Only dependable on iPhone/Safari (section 6) | Whatever the device has |

Most detail for Azure, Polly and ElevenLabs is medium confidence; treat the whole table as *(to verify)* before signing anything.

### 2b. Cost and terms

| Supplier | Price per 1M characters *(to verify)* | Storing and replaying audio | Children's-use terms |
|---|---|---|---|
| **Azure** | About **$16** standard neural, **$22** HD; 0.5M characters a month free. Markup counts as characters (except the outer tags), so inline phoneme tags add cost; a hosted lexicon avoids that. | Microsoft's guidance says the audio is ours to use; its live service doesn't keep text or audio *(to verify)* | **Not checked** (Microsoft Product Terms). Its code of conduct requires telling users the voice is synthetic. |
| **Polly** | $4 standard, **$16** neural, $30 generative. Markup is **not** billed. Free tier for the first 12 months. Speech marks roughly double the cost. | FAQ: may be cached and replayed without restriction *(to verify)* | **Clearest of all.** FAQ allows use in apps for under-13s if we comply with COPPA, the US children's privacy law *(to verify)*. Polly may store and use text to improve the service unless we opt out *(to verify)*. |
| **Google** | $4 Standard/WaveNet, $16 Neural2, **$30** Chirp 3 HD, $160 Studio. Markup billed except `<mark>`. | Says it doesn't log text or audio; EU endpoint available *(to verify which voices it serves)* | **Not checked** |
| **ElevenLabs** | **$50** Flash/Turbo, **$100** Multilingual v2/v3 | Paid plans own their output and keep commercial rights. By default generations are saved to history; zero-retention mode and EU data residency are Enterprise-only *(to verify)*. | **Problem.** Its Prohibited Use Policy bars "bundled solutions that target anyone under the age of 13", and child-like voices are banned from its Voice Library *(to verify)*. Needs written clearance or an Enterprise contract first. |
| **OpenAI** | tts-1 about $15; gpt-4o-mini-tts about $0.015 per minute of audio | – | Personal data of under-13s needs Zero Data Retention; users must be told the voice is AI-generated |
| **Cartesia** | About $37 (on its $299 Scale plan) | Not checked | Not checked |
| **Inworld** | $25 on demand ($15 for Flash) | Not checked | Not checked |
| **Deepgram** | $30 | Not checked | Not checked |
| **Hume** | $100–200 | Not checked | Not checked |
| **Kokoro / Piper** | No per-use cost | Yes | Licences need checking: Kokoro is Apache-2.0, but its browser version depends on a GPL-licensed eSpeak wrapper (an open licence-violation issue); Piper is GPL-3.0 |

**Ruled out:** PlayHT shut down on 31 December 2025, deleting all voices and audio *(to verify)*. Coqui XTTS-v2 is licensed for non-commercial use only.

### 2c. Verdict

| Role | Choice | Why |
|---|---|---|
| Main supplier | **Azure** | Exact sounds, word timings in one request, the widest British range (including a child voice), audio we can keep, and no retention on the live service *(to verify)*. Use UK South for standard voices, or West Europe or Sweden Central if we want HD voices. |
| Fallback / compliance-first | **Amazon Polly** (neural en-GB, London) | Explicitly allows children's apps; unlimited caching; markup not billed. Needs the second request for word timings and must avoid the generative engine. |
| Premium narrator (optional) | **ElevenLabs** | Most storyteller-like voices, but only with written clearance of the under-13 policy and an Enterprise contract for zero retention. |
| Worth a listening test | **Cartesia, Inworld** | Exact sounds and timings at similar prices; children's terms unknown. |
| Later, offline | **Kokoro** in the browser | No per-use cost and nothing leaves the phone, once phoneme input, timings and licensing are confirmed. |
| Don't use for names | OpenAI TTS, Gemini-TTS | No exact-sound control and no timings |

---

## 3. Recommended architecture

**Idea:** most of a book never changes. Only the sentences containing the name do. So render the fixed sentences once, generate the name sentences once per name and pronunciation, and cache everything.

```
BOOK PREPARATION (once per book, per voice)
  book.json lines ──► split into:
     fixed sentences (no name)  ──► render once ──► audio + word timings ──► CDN
     name sentences ("Goal, {name}!") ──► left for later

FIRST TIME A PARENT CONFIRMS A NAME
  phone ──► our small server: {book, voice, first name, IPA}   (no account, no device ID)
             │
             ├─ key = hash(book, sentence, name, IPA, voice, engine version)
             ├─ already cached? ──► return the audio links
             └─ not cached ──► supplier renders each name sentence with <phoneme>
                               ──► store audio + word timings on the CDN ──► return the links

READING
  phone plays: fixed clip, name clip, fixed clip… in page order
  highlights words and reveals the name from the stored timings
  keeps the book's audio on the phone after first use, so it works offline

FALLBACKS
  offline or server unavailable ──► browser voice with the "say" spelling
  no speech at all (e.g. Android in-app browsers) ──► pre-rendered audio, or silent read-along
  parent chose "Use my recording" ──► their clip replaces the name
```

Why this shape:

- **Whole sentences, not spliced names.** The series bible's rule is that the name is always spoken inside a fully generated sentence, so the voice around it sounds natural. Book 1 already keeps the name in short, self-contained sentences ("Goal, {name}!", "Warm up, {name}!"). Splicing only at sentence boundaries keeps the joins where natural pauses are. The risk is that expressive voices change tone depending on context, so the join between a fixed and a name sentence may be audible. Test it.
- **The pronunciation is part of the cache key.** Two Islas said differently get different audio. Every Olivia said the same way shares one set.
- **Keep the supplier key off the phone.** A small server (a "proxy") holds the account key and talks to the supplier. The research recommends this even for the prototype if a cloud voice is tried.
- **Pre-render the most common names.** Pre-rendering the top UK names as a static pack means most families never trigger a request to any supplier. That saves money and is a privacy win.
- **Nothing is generated live in front of the child.** Every clip is rendered once and can be checked. That fits the UK government's March 2026 screen-time guidance, which says under-5s shouldn't use AI tools. It is also why the product shouldn't be marketed as an "AI app".
- **It builds on the prototype.** The prototype's reading plan (`js/narrator/plan.js`) already splits pages into one-sentence pieces and can play an audio clip in place of speech, so moving to pre-rendered audio should be an extension rather than a rewrite.

**Privacy points for the server** (details in the name document):
- Send the first name and IPA only, never account or device identifiers.
- Cache by name, not by user.
- Sign a data processing agreement with the supplier and choose a UK or EU region.
- Record all of it in the data protection impact assessment (DPIA).
- A hash of a first name is easy to reverse, so treat the cache as holding names.

---

## 4. Cost estimates

**Assumptions from Book 1 ("Goal, {name}!") as drafted today:** 8 pages and 40 spoken lines (including the "your turn" prompts), about **1,050 characters** in all. 11 lines contain the name, about **350 characters** with a typical name; the rest is about **700 characters**. The research modelled a generic ~150-word book at ~900 characters and reached similar figures.

All prices *(to verify)*, in US dollars, excluding VAT. "New name" means a name and pronunciation not yet cached for that book and voice.

| Supplier and voice | Price per 1M chars | **Per new name** (~350 chars) | Per read with no caching (~1,050 chars) | 10,000 new names a month | 100,000 new names a month |
|---|---|---|---|---|---|
| Azure neural, hosted lexicon | $16 | **$0.006** | $0.017 | $56 | $560 |
| Azure neural, inline phoneme tags (~50 extra chars per sentence) | $16 | $0.014 | – | $144 | $1,440 |
| Azure HD | $22 | $0.008 | $0.023 | $77 | $770 |
| Polly neural, including speech-marks request | $16 × 2 | $0.011 | $0.034 | $112 | $1,120 |
| Google Neural2 | $16 | $0.006 | $0.017 | $56 | $560 |
| Google Chirp 3 HD (plus our own alignment) | $30 | $0.011 | $0.032 | $105 | $1,050 |
| Inworld TTS-2 | $25 | $0.009 | $0.026 | $88 | $875 |
| Deepgram Aura-2 | $30 | $0.011 | $0.032 | $105 | $1,050 |
| Cartesia (Scale plan) | ~$37 | $0.013 | $0.039 | $130 | $1,300 |
| ElevenLabs Flash | $50 | $0.018 | $0.053 | $175 | $1,750 |
| ElevenLabs v3 | $100 | $0.035 | $0.105 | $350 | $3,500 |

What this means:

- **Per read, once cached: effectively nil** for the voice. A re-read, or the next child with the same name and pronunciation, costs only file delivery from the CDN and a small server. The research estimates storage at about 100 KB per name set, or about 10 GB for 100,000 names *(to verify)*. CDN and server costs weren't researched; get quotes.
- **Per new name: well under a penny** on Azure, Polly or Google. Even at 100,000 brand-new names a month, Azure is in the hundreds of dollars, and real costs will be lower because common names repeat.
- **Per book: about a cent** to render the ~700 fixed characters in one voice on Azure. Re-render only when the text or voice changes.
- **Free tiers:** Azure's 0.5M free characters a month covers about 1,400 new Book 1 names *(to verify)*.
- **Each new book adds its own name sentences**, so a child who owns three books costs three sets. Cost scales with the characters in name sentences: roughly $0.016 per 1,000 characters on Azure. A longer book for the under-10s range with, say, three times as many name sentences would cost about three times as much per new name. That is still pennies.
- **Custom narrator voices add fixed costs** (section 5), which can outweigh the per-character costs above.

---

## 5. Human narrators and voice cloning

| Option | How it works | Pros | Cons and risks |
|---|---|---|---|
| **A. Stock cloud voice** (recommended start) | A supplier's en-GB voice reads everything | Cheapest; consistent; exact name control | Less character than a real storyteller; must be labelled as a computer voice |
| **B. Human narrator for the fixed text, cloud voice for name sentences** | Mix a real recording with synthetic sentences | Warm fixed text | The voice changes mid-page. **The research advises against it.** |
| **C. Human narrator plus a name library** | The narrator records each name sentence for the most common names (and rare names on request) | Most natural; also the human fallback for hard names | Recording time grows with names × sentences × books. Needs a turnaround promise (e.g. "our narrator will record it for you"). Fees not researched; get quotes. |
| **D. Clone a narrator's voice** | Train a custom voice on the narrator, then generate every sentence in it, including names | A signature voice with exact name control; everything sounds like one person | Consent, contracts and fixed costs (below). Run blind listening tests with parents against option A. |
| **E. A family member's voice** | Today: the parent records only the name (built into the prototype). A clone of a parent reading the whole story is possible technically. | Very warm | Cloning a real family member is a "deepfake-type" use with disclosure and consent duties *(to verify)*. It goes against the UK guidance to keep AI tools away from under-5s. **Not for v1.** Real (not cloned) grandparent recordings could be a paid extra later. |

**Cloning options** *(all to verify)*:

| Supplier | What it takes | Reported cost |
|---|---|---|
| **Azure professional voice** | A Limited Access application; the narrator records a spoken consent statement themselves; about 20–40 hours of training compute | Training about $52 per compute hour, capped at $4,992; hosting about $4.04 an hour (about **$2,950 a month** if always on); speech about $24 per 1M characters |
| **Azure personal voice** | A 5–90 second sample plus a consent statement; approved uses only; not in UK South | About $24 per 1M characters plus $600 per 1,000 voice profiles a month |
| **ElevenLabs Professional Voice Clone** | At least 30 minutes of audio (2–3 hours recommended). **The narrator must create it themselves** and pass a spoken check; it is then shared with us. | Creator plan or above, and subject to the under-13 policy clearance above |
| **Google Instant Custom Voice** | Allow-list via sales; a scripted consent recording plus a reference recording (about 10 seconds each) | About $60 per 1M characters |
| **OpenAI custom voices** | Eligible customers only; consent recording required | Not stated |
| **Cartesia** | Cloning from about 10 seconds of audio, with consent controls | Plan-based |

Whichever voice we use, **say plainly in the grown-up screens that the narrator is a computer voice.** Azure and OpenAI require this, the compliance research recommends it, and the prototype doesn't say it yet.

---

## 6. What browsers can and can't do today

The prototype uses only the browser's built-in voice (`speechSynthesis`). Here is what that really means on phones in September 2026, and how the prototype copes (`js/narrator/narrator.js`, `js/narrator/voices.js`).

| Limit | Detail | How the prototype copes |
|---|---|---|
| **No pronunciation markup** | No browser acts on SSML. Safari passes the text through as plain text; Chrome strips the tags. | The voice is given the "say" spelling from the dictionary or the parent's respelling ("Shi vawn"). |
| **Word timings only on Safari** | Word-by-word ("boundary") events are dependable only on iPhone/iPad and Mac Safari. Chrome on Android, Samsung Internet and Chrome's Google voices on computers never send them. Firefox and Edge are listed as supporting them. | Uses word events if they arrive within a quarter of a second; otherwise moves the highlight on an estimated timeline based on syllable counts, speed and punctuation. If events stop mid-sentence, it switches to the estimate rather than freezing. |
| **iPhone needs a tap first** | iOS silently ignores speech until one piece of speech is started inside a tap (no error is raised). Chrome raises a "not-allowed" error if the page hasn't been tapped. | The Start tap immediately speaks a silent utterance and wakes the audio system. If speech still seems blocked, the reader shows a "Tap to hear the story" button. |
| **Android in-app browsers have no speech** | Links opened inside Instagram, Facebook and similar Android apps use a built-in browser (WebView) with no speech at all. Camera access is also denied by default there *(to verify)*. | "Silent timed mode": the words still light up on the estimated timeline and every page works. The pronunciation screen explains there is no voice and suggests recording. **Not yet built:** an "Open in Chrome" prompt, and pre-rendered audio for these browsers. |
| **Pause doesn't pause on Android** | pause() stops speech and resume() does nothing | The prototype has no pause and never calls it. Changing page stops the reading, and "Replay" reads the page again from the start. |
| **Long speech can cut out** | Chrome and Edge have a long-standing note that speech may stop after about 15 seconds *(to verify)*. | One short utterance per sentence. |
| **Limited choice of voice** | Chrome on Android offers one voice per language and region, so you can't pick a particular British voice. iPhones offer web pages only Apple's on-device voices, not Siri voices *(to verify on devices)*. Chrome's Google voices on computers are online-only and hidden on mobile data. | Ranks voices: British first, then Irish/Australian/NZ/South African/Indian, then American. Natural-sounding voices are preferred, joke voices (Bubbles, Zarvox, Grandpa…) always come last, and on phones on-device voices are nudged up. Grown-ups can choose in settings, where online voices are marked. |
| **Online voices can fail** | Network voices depend on the connection | If a voice errors, or an online voice never starts (probably offline), it is set aside for the session and the next best voice is tried, up to three times. If nothing works, the page carries on in silent timed mode. |
| **Locking the phone** | Safari silently clears queued speech when the page is suspended | When the page is hidden it cancels cleanly, and restarts the sentence when the page is visible again. |
| **Older iPhone bugs** | Cancel and queue bugs fixed only in Safari 26 and 27 | Waits a moment after cancelling before speaking again, and uses start and end "watchdog" timers so a stuck engine can't stall the page. |
| **Lockdown Mode** | iOS Lockdown Mode switches off web speech and IndexedDB (the browser database the prototype uses for recordings) | Silent timed mode. A recording can't be kept between visits; storage falls back to memory for the session. |
| **Speed and pitch** | On iOS, speed above 2 is no faster and pitch below 0.5 has no effect | Default speed 0.9 and pitch 1.05, kept within 0.5–1.6; "Slower" is 0.75. |
| **Silent switch** | Unknown whether the iPhone's ring/silent switch mutes web speech *(to verify)* | Nothing yet |
| **Privacy** | Online voices send the sentence text, including the name, to Google (and presumably Microsoft for Edge's "Online" voices, *to verify*) | Currently ranks online natural voices first on computers. **Recommended:** default to on-device voices and make online voices an opt-in (see the name document). |

**Bottom line:** the browser voice is good enough for a prototype and a fallback, and the prototype handles its quirks carefully. But it can't guarantee pronunciation or timing on the phones most UK parents use. Pre-rendered audio with stored timings fixes both, and it also works in Android in-app browsers, which can play audio files even though they can't speak.

---

## 7. Decisions and next steps

- [ ] **Listening test** of 50–100 hard UK names from the same IPA on Azure, Polly, ElevenLabs and Cartesia, judged by native speakers and a few parents.
- [ ] **Test Azure word timings** on the chosen en-GB voice (some voices report zero offsets).
- [ ] **Test joins** between fixed and name sentences in the chosen voice.
- [ ] **Check children's-use terms** in writing for Azure, Google, Cartesia and Inworld; get written clearance from ElevenLabs if it stays on the list.
- [ ] **Recheck all prices in GBP** from the official pages.
- [ ] **Data protection:** data processing agreement, UK/EU region, no-training and no-retention settings, DPIA before any server feature.
- [ ] **Prototype changes:** on-device voices by default with online voices opt-in; an "Open in Chrome/Safari" prompt in Android in-app browsers; a "computer voice" label for grown-ups.
- [ ] **Device test run** on iPhones (iOS 17, 18, 26, 27, in Safari and as a home-screen app), iPad, a Pixel with Chrome, a Samsung phone with Samsung Internet, Firefox on Android, the Instagram and Facebook in-app browsers, and desktop Chrome, Edge, Firefox and Safari. Log which voices appear and which events actually fire.
- [ ] **Decide the narrator route** (option A, C or D) after blind listening tests with parents.

---

## Sources

**Microsoft Azure AI Speech**
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/speech-ssml-phonetic-sets.md
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/high-definition-voices.md
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/includes/language-support/tts.md
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/regions.md
- https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechsynthesiswordboundaryeventargs?view=azure-node-latest
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/batch-synthesis-properties.md
- https://learn.microsoft.com/en-us/answers/questions/1651510/azure-text-to-speech-wordboundary-event-always-ret
- https://azure.microsoft.com/en-us/pricing/details/speech/
- https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-speech-%E2%80%93-neural-hd-text-to-speech-recent-voice-updates/4505380
- https://texttolab.com/blog/azure-text-to-speech-pricing
- https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security
- https://learn.microsoft.com/en-us/legal/cognitive-services/speech-service/text-to-speech/concepts-disclosure-guidelines
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/professional-voice-create-consent.md
- https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/ai-services/speech-service/personal-voice-overview.md
- https://speechactors.com/article/microsoft-azure-pricing-and-plans

**Amazon Polly**
- https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html
- https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html
- https://docs.aws.amazon.com/polly/latest/dg/speechmarks.html
- https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html
- https://aws.amazon.com/polly/pricing/
- https://aws.amazon.com/polly/faqs/
- https://docs.aws.amazon.com/polly/latest/dg/data-protection.html

**Google Cloud Text-to-Speech**
- https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- https://raw.githubusercontent.com/googleapis/googleapis/master/google/cloud/texttospeech/v1beta1/cloud_tts.proto
- https://discuss.ai.google.dev/t/custom-pronunciations-not-working-with-chirp3-hd-voices/106259
- https://docs.cloud.google.com/text-to-speech/docs/ssml
- https://cloud.google.com/text-to-speech/pricing
- https://texttolab.com/blog/google-cloud-tts-pricing
- https://docs.cloud.google.com/text-to-speech/docs/data-logging
- https://docs.cloud.google.com/text-to-speech/docs/endpoints
- https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice
- https://docs.cloud.google.com/text-to-speech/docs/gemini-tts

**ElevenLabs**
- https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/terms-of-use
- https://elevenlabs.io/use-policy
- https://elevenlabs.io/docs/help-center/product/voices/voice-library/can-childrens-or-child-like-voices-be-added-to-the-voice-library
- https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
- https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning

**OpenAI and newer suppliers**
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/docs/guides/custom-voices
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- https://docs.cartesia.ai/build-with-cartesia/sonic-3/custom-pronunciations
- https://docs.cartesia.ai/api-reference/tts/websocket
- https://texttolab.com/blog/cartesia-pricing
- https://docs.inworld.ai/tts/capabilities/custom-pronunciation
- https://texttolab.com/blog/inworld-pricing
- https://developers.deepgram.com/docs/tts-voice-controls
- https://deepgram.com/pricing
- https://dev.hume.ai/docs/text-to-speech-tts/timestamps
- https://www.hume.ai/pricing
- https://infrabase.ai/audio/playht
- https://github.com/idiap/coqui-ai-TTS
- https://github.com/coqui-ai/TTS/issues/3490

**On-device voices**
- https://github.com/hexgrad/kokoro
- https://github.com/hexgrad/misaki
- https://raw.githubusercontent.com/hexgrad/kokoro/main/kokoro.js/src/phonemize.js
- https://github.com/xenova/phonemizer.js/issues/6
- https://github.com/OHF-Voice/piper1-gpl
- https://github.com/Poket-Jony/piper-tts-web

**Browser behaviour**
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/cocoa/PlatformSpeechSynthesizerCocoa.mm
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_controller_impl.cc
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_android.cc
- https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/speech/speech_synthesis.cc
- https://raw.githubusercontent.com/chromium/chromium/main/content/public/android/java/src/org/chromium/content/browser/TtsPlatformImpl.java
- https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/resources/network_speech_synthesis/mv3/manifest.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechSynthesis.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechSynthesisUtterance.json
- https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/speech-synthesis.json
- https://raw.githubusercontent.com/jankapunkt/easy-speech/master/FAQ.md
- https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes
- https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes
- https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes

**Guidance, privacy and positioning**
- https://beststartinlife.gov.uk/screen-time-under-5s/
- https://assets.publishing.service.gov.uk/media/69c53daf4a06660f085442a7/EYSTAG_report.pdf
- https://www.gov.uk/government/publications/uk-us-data-bridge-supporting-documents/uk-us-data-bridge-factsheet-for-uk-organisations
- https://api.github.com/repositories/666143144/contents/_posts/2026-08-02-ai-act-article-50-transparency-banks-omnibus-2026.md?ref=67f6fda43c4f2f8447a9f18541b84f8d93266292

## Open questions / to verify

- [ ] **All prices**, from the official pages, in GBP. None of Azure, Polly, Google or ElevenLabs pricing pages could be opened.
- [ ] **Children's-use terms** for Azure (Microsoft Product Terms), Google Cloud, Cartesia, Inworld, Deepgram and Hume. Only Polly (allowed with COPPA compliance), ElevenLabs (restricted) and OpenAI (zero retention needed for under-13 data) were confirmed, and even those only from search summaries.
- [ ] **ElevenLabs:** would a parent-operated companion app for an under-5 print book count as a prohibited "bundled solution" targeting under-13s? Needs its written answer.
- [ ] **Data terms:** does Polly use our text to improve its service unless we opt out, and how exactly do we opt out? Does ElevenLabs keep a perpetual licence to content outside the EEA?
- [ ] **Google:** do Chirp 3 HD voices support `<mark>` timings, and does the EU endpoint serve them?
- [ ] **Polly:** exactly what does "partial" phoneme support on the generative engine mean?
- [ ] **Azure:** correct, non-zero word timings on the chosen en-GB voice? Can a professional custom voice be hosted only while rendering, instead of always on?
- [ ] **Joins:** do fixed and name sentences join smoothly in each engine, especially with HD or expressive voices?
- [ ] **Kokoro in the browser:** does it take our phonemes reliably, and what is the licence position of its GPL-licensed eSpeak dependency (legal advice needed)?
- [ ] **Devices:** which British voices each iPhone version exposes to web pages; whether Edge's "Online (Natural)" voices are available to web pages, send word timings, and send text to Microsoft; whether the iPhone silent switch mutes web speech; what happens to narration on Chrome for Android when the screen locks.
- [ ] **Narrator costs:** quotes for a human narrator (fixed text, name library, turnaround for on-request names) and for CDN and server hosting.
