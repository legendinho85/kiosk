STATUS: FINAL

# Voice 6 polish: same voice, whole stanzas, bedtime that settles

Run date: 2026-09-25 (UTC), about 15:55–18:15. Machine: 4 CPU cores, 15 GB RAM, no GPU. torch 2.14.0 (PyPI), qwen-tts 0.1.1, transformers 4.57.3, fp32, 4 threads.

**Nobody has listened to these files.** Every judgement below comes from measurements: Whisper, a phoneme recogniser, ECAPA, UTMOS22, pitch and loudness. Please listen before deciding.

## Short answer

- **Listen to `voice6-polished-ava.mp3` first.** It uses the same voice identity as casting voice 6, locked by an exact reproduction of the casting reference. Each stanza was rendered in one pass.
- **All three voice 6 issues are fixed on the numbers:**
  - The bedtime stanza now sits **2.6 semitones below** the day stanza. In casting it was 1.2 st above.
  - **All 5 Avas** are heard as /eɪvə/ with the v present. Casting had 3 of 5 on the same strict check.
  - Whisper hears **7 sentence breaks** inside the verse instead of 10.
- **What got worse:**
  - The day stanza is **quick: 178 wpm** including pauses, against 132 in casting and a 130 target. Whole-stanza renders flow, but this voice speaks at about 200 wpm between pauses. The pause rules (which only shorten or lengthen the model's own gaps, within limits) cannot bring that down to 130. Three punctuation variants and the model's non-streaming mode did not slow it either (details below).
  - UTMOS is 4.10 against casting's 4.28.
  - The bedtime drop overshoots the "about 1 st" target.
- **Automatic name renders:**
  - **Olivia** is clean: bedtime 1.4 st below day, 5 of 5 names matched.
  - **Niamh** ("Neeve") says the name right 5 of 5, but her bedtime came out **0.4 st above** her day stanza. The one lower take failed the word check.
  - **Muhammad** passes Whisper 5 of 5, but the phoneme recogniser matches only 4 of 5 in the whole file. Its UTMOS is the lowest (3.93).

## Files

| File | What it is | Duration | LUFS / true peak | UTMOS22 |
|---|---|---|---|---|
| `voice6-polished-ava.mp3` | the polished verse, best takes by gates plus target distance | 22.75 s | −18.02 / −1.86 dBTP | 4.10 |
| `voice6-auto-olivia.mp3` | fully automatic, no listening | 24.08 s | −17.99 / −1.93 | 4.08 |
| `voice6-auto-muhammad.mp3` | fully automatic | 23.63 s | −18.04 / −1.92 | 3.93 |
| `voice6-auto-niamh.mp3` | fully automatic, fed as "Neeve" | 23.87 s | −18.04 / −1.84 | 4.07 |
| `anchor/` | locked voice asset (see Step 1) | 13.15 s | raw, not mastered | 4.43 (casting) |
| `results.json` | every take, transcript, phoneme string, gate, score and setting | | | |

## Metrics next to casting voice 6

Both files are measured with the same code on the final MP3. Each file is split at the gap between stanzas.

- **Pace:** words ÷ stanza length, including pauses. This matches casting's method; casting reported 132/113 and this code gets 132.0/112.8.
- **Pitch:** median and spread from pYIN, in semitones around the median.

| | casting `voice6-soft-northern.mp3` | **`voice6-polished-ava.mp3`** | target |
|---|---|---|---|
| Whisper word errors (whole file) | 0 | 0 | 0 |
| Ava /eɪvə/ with the v (whole file, strict vowel+v+vowel count) | 3 of 5 | **5 of 5** | 5 of 5 |
| Sentence breaks Whisper hears inside the stanzas | 10 | **7** (day 1, bed 3 when transcribed alone) | as few as possible |
| Day median F0 | 255.7 Hz (+0.35 st vs anchor) | 258.6 Hz (+0.55 st) | within ±1 st of the 250.5 Hz anchor ✓ |
| Day pitch spread | 2.99 st | 2.35 st | about 2.9 st (a little flatter) |
| Day pace | 132 wpm | **178.5 wpm** | about 130 ✗ |
| Bed median F0 | 274.0 Hz | 222.6 Hz | about 1 st below day, never above |
| **Bed vs day pitch** | **+1.2 st (rose)** | **−2.6 st (settles)** | about −1 st (overshoots by 1.6 st) |
| Bed pitch spread | 3.05 st | 2.35 st | 2.5–3 st (slightly under) |
| Bed pace | 112.8 wpm | 131.6 wpm | 100–110 ✗ |
| Bed vs day loudness | −1.8 LU | −2.1 LU | −2 LU ✓ |
| ECAPA vs anchor (day / bed) | 0.83 / 0.86 | 0.84 / 0.84 | same voice |
| UTMOS22 (all / day / bed) | 4.28 / 4.40 / 4.35 | 4.10 / 4.20 / 4.05 | no defects |
| Integrated loudness / true peak | −18.13 LUFS / −0.79 dBTP | −18.02 LUFS / −1.86 dBTP | −18 / ≤ −1.5 ✓ |
| Room-tone floor (gap between stanzas) | −63.3 dBFS | −64.1 dBFS | −63 to −68 ✓ |
| Spectral balance, 4–8 kHz vs 0.5–4 kHz | −13.9 dB | −19.4 dB | (see the shelf note) |

Whisper on `voice6-polished-ava.mp3`: *"Ava, Ava, boots on tight. The sun is up, the sky is bright. Kick the ball and watch it roll, all the way into the goal. Ava, Ava, time for bed. A cozy blanket, a sleepy head. The moon is out, the stars are too. Night night, Ava. We love you."*

Casting, for comparison: *"Ava, Ava, boots on tight. The sun is up. The sky is bright. Kick the ball and watch it roll all the way into the goal. Ava, Ava, time for bed. A cozy blanket. A sleepy head. The moon is out. The stars are too. Night night, Ava. We love you."*

## Step 1: the locked voice (`anchor/`)

**The casting reference was reproduced exactly.** The casting log recorded the description, sampling, batch and take index, but not the design seed.
- A cheap prefix search found it. It rendered only the first ~3 s (34 tokens) of the same batched call for candidate seeds and compared each take with `ref-6.mp3` by log-mel correlation.
- Seeds 6000, 6 and 60 gave at most 0.79. **Seed 600, take 1 gave 0.991.**
- The full re-render then used `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`, the casting description, the reference text, language "English", `torch.manual_seed(600)` once, a batch of 3, and sampling `{temperature 0.7, top_p 0.85, top_k 50, repetition_penalty 1.05, max_new_tokens 300}`. Subtalker settings were the model defaults. The render took 101 s.

Reproduction check against `casting/ref-6.mp3`, speech-trimmed:

| Take | Duration vs ref | Log-mel correlation | Waveform correlation (gain-matched, best lag) | ECAPA | Spectrum difference (LTAS) |
|---|---|---|---|---|---|
| **1 (the casting pick)** | **−0.08%** | **0.983** | **0.996** | **0.988** | 0.31 dB |
| 0 | −7.6% | 0.19 | 0.03 | 0.72 | 2.28 dB |
| 2 | +1.9% | 0.36 | 0.03 | 0.59 | 2.67 dB |

Takes 0 and 2 also match casting's logged durations for its other takes (12.0 s and 13.24 s). The residual difference in take 1 is the casting file's mastering and MP3 encoding.

**What is saved:**
- `voice6-anchor.wav`: the raw take 1, trimmed to 60 ms before the first sound and 150 ms after the last. It has no loudness change and no room tone: 13.15 s, 16-bit, 24 kHz, median F0 250.5 Hz.
- `voice6-anchor.txt`: the exact transcript fed to the model. Whisper hears it word for word.
- `voice6-anchor-prompt.safetensors`: the Base model's ICL clone prompt. It holds `ref_code` (int64, 165 × 16 codec frames) and `ref_spk_embedding` (float32, 2048), with `ref_text` in the metadata. It is safetensors, not a pickle.
- `voice6-anchor.json`: provenance. It records the description, seed, sampling, batch and take index, the reproduction check, versions, and the model commits: VoiceDesign `5ecdb67327fd37bb2e042aab12ff7391903235d3`, Base `fd4b254389122332181a7c3db7f27e918eec64e3`.

No model weights are committed.

## Step 2: how the polished Ava file was made

**1. One stanza per call.** Base model `generate_voice_clone`, full ICL prompt from the anchor (not x-vector-only), language English. `model.generate_config` was printed before rendering: do_sample True, temperature 0.9, top_p 1.0, top_k 50, repetition_penalty 1.05, subtalker 0.9/1.0/50, max_new_tokens 8192. Those defaults were overridden per call as below.

**2. TTS copy of the text.** The words are identical to the verse; only punctuation changes. Every variant is under 170 characters, has no "!" and no capitals, has a comma after each name and a full stop only at the end.
- Day A (used): `Ava, Ava, boots on tight, the sun is up, the sky is bright, kick the ball and watch it roll, all the way into the goal.`
- Day C and D (tried): an ellipsis at the couplet end, and extra commas inside lines ("kick the ball, and watch it roll, all the way, into the goal"). Neither slowed the read (158–180 wpm). C made Whisper hear more sentence breaks.
- Bed C (used): `Ava, Ava, time for bed, a cosy blanket, a sleepy head... the moon is out, the stars are too... night night, Ava, we love you.` This has one ellipsis per line at most. It flowed better than bed A (commas only, with the ellipsis after "too"), where 6 of 6 takes were heard as 7–8 separate sentences, mostly questions ("Ava? Ava? Time for bed?").

**3. Sampling.**
- Talker: temperature 0.5 by day and 0.45 at bedtime, top_p 0.8, top_k 50, repetition_penalty 1.05.
- Subtalker: temperature 0.75 with top_p 0.9 ("s75"), or 0.7 with top_p 0.95 ("s70").
- Each call was seeded (`torch.manual_seed`) and made 3 takes in one batch. 18 day takes and 18 bedtime takes were rendered: 6 calls each, across the variants and the non-streaming test. All are logged in `results.json` with seed, batch and take index.
- The chosen takes: day `A / s70 / seed 8102 / take 0`; bed `C / s70 / seed 8221 / take 2`.

**4. Guards.**
- `max_new_tokens` = 1.8 × the expected length (a take that fills it is rejected).
- A take over 1.8× the expected length is rejected.
- A reference-echo check: Whisper on the first 1.5 s must not start with a 1–5-word suffix of the reference text. It never fired.
- A click/thud trim before the first word.
- Two takes were garbage: bed B take 2 ("Thanks for watching!", 25.5 s) and a non-streaming take (ECAPA 0.01). Both were rejected by the word, name and UTMOS gates.

**5. Gates (all must pass), then the score.**
- **Words:** faster-whisper small.en hears the exact words. "Cozy" counts as "cosy", "good night" as "goodnight".
- **Name:** wav2vec2-lv-60-espeak finds every Ava as /eɪ v + vowel/. The whole take is counted, and each Whisper-timed Ava is also checked on the whole-take CTC output.
- **ECAPA ≥ pool mean − 2 SD.**
- **UTMOS ≥ pool median − 0.5.**
- Day: 12 of 18 takes passed; the failures were name ×5 and ECAPA ×1. Bed: 11 of 18 passed; the failures were name ×7, words ×2, ECAPA ×2 and UTMOS ×2.
- The **score** is the distance from the target band in both directions, never "lower is better". It adds pitch spread, pace (projected after pause editing), line-to-line pitch jumps over 2 st, line ends that rise, and sentence breaks Whisper hears. Median F0 counts too: by day ±1 st around the anchor; at bedtime 0.5–1.5 st below the chosen day take, with a +4 penalty for any take above it.
- The chosen bedtime take is 1.1 st below its band (−2.6 st instead of about −1 st). It still won because it was the only one Whisper heard as a single flowing sentence (0 breaks in the raw take). The next-best take has the right pitch (241 Hz, −1.2 st) but 3 breaks.

**6. Pauses.** Cuts only happen inside the model's own silences of 80 ms or more, keeping 30 ms at each edge. There is never a cut inside speech.
- Line end: 0.36–0.45 s. Couplet end: 0.7 s. Comma pauses over 300 ms are trimmed to about 0.27–0.3 s.
- Bedtime gaps are ×1.3, and there is +250 ms before "night night, Ava". Everything gets ±10% seeded jitter. Stanza gap 1.47 s.
- Where the model left no gap at a line end, its timing was kept. That happened on day line 3→4 ("…watch it roll all the way…").
- The day take had a 1.3 s pause after the first "Ava,"; it was trimmed to 0.27 s. This is part of why the day stanza reads fast. The full edit log is in `results.json`.

**7. Order and mastering.**
1. Each take was loudness-normalised to −20 LUFS.
2. Downward expander: threshold 40 dB under the speech RMS (about −58 dBFS), 2:1, at most −15 dB, 20 ms RMS detector, 5/150 ms.
3. Pause edit.
4. High-pass 80 Hz.
5. High shelf −2 dB from 5 kHz.
6. De-esser at 6–8 kHz: at most 4 dB, about 1 dB on average over speech.
7. Compressor 2:1, 20 ms attack, 200 ms release. The threshold was auto-set so speech gets 2.5 dB of gain reduction on average (5 dB peak).
8. Fades: 10 ms in, 40 ms out. Crossfades: 20 ms equal-power, only inside gaps.
9. Stanza levels: day at −18 LU and bed 2 LU lower, then the whole file set to −18 LUFS. A true-peak limiter at −1.9 dBTP (0.1 dB of limiting).
10. After the final gain, **one continuous room-tone bed**: pink noise band-limited to 100–6000 Hz, at −64 dBFS RMS (48 dB under speech).
11. Written with `soundfile.write(..., format='MP3')`, mono, 24 kHz.

- **Shelf −2 vs −3 dB:** −3 dB gave the same UTMOS (4.107 vs 4.095, within noise) and took the 4–8 kHz balance down another 0.6 dB. The chosen day take is already the darkest of the pool (4–8 kHz at −17.7 dB against −12.5 dB for the anchor), so −3 dB would dull it for no measured gain. **−2 dB was kept.**
- **A bug found and fixed on the way:** the first build used a 2 ms level detector in the expander. It followed single pitch periods and dropped UTMOS from 4.50 to 3.68. With a 20 ms RMS detector the whole chain costs 0.08 before the room tone, and the room tone at −48 dB costs about 0.15 (casting's room tone costs about the same).

**8. Bedtime "sleepy" reference: none qualified.**
- The anchor was cloned reading *"Hush now, little mouse, the day is done. Goodnight to the moon and goodnight to the sun."* 8 takes, seeds 7101 and 7102, 4 takes each.
- Every take read at 157–184 wpm, against the required 95–110. Median F0 ranged from −1.75 to +2.25 st vs the anchor, and ECAPA was 0.77–0.87.
- So, per the brief, bedtime used the **main anchor**, and the bedtime take was chosen by the pitch band and slowed with the ×1.3 pauses. Nothing was whispered.

**9. Pace experiments that did not help.**
- Non-streaming text mode (`non_streaming_mode=True`) on 3 day and 3 bed takes: same pace (159–182 wpm by day), more sentence breaks.
- The ellipsis and extra-comma variants: same pace.
- Time-stretching was not tried; the earlier `qwen-calm` round found it drops UTMOS from 4.43 to 3.48.
- To reach 130 wpm with this voice, the realistic options are one of:
  - longer line-end pauses than the brief allows;
  - a separately designed slower-pace reference of the same voice (a new ICL prompt; not tried, to keep the locked identity).

## Step 3: automatic name renders (no listening, no hand-picking)

The pipeline was the same as for Ava (day text A, bed text C, subtalker s75, 3 takes per round), with two changes:
- **Name gate for other names:** Whisper must hear the name every time. Accepted spellings: Olivia; Muhammad/Mohammed/Muhammed/Mohamed/…; Niamh/Neve/Neeve/Neave/Kneave. Also, the whole-take phoneme sequence must contain the name the right number of times within **edit distance ≤ 1** of the `names.json` IPA.
  - Two notation equivalences are allowed: /ə/ = /ɐ/ = /ɪ/ for reduced vowels, and /æ/ = /a/ (espeak's British TRAP vowel).
  - Counting in the whole-take sequence replaced per-word windows. Whisper's timestamps drift on a repeated name ("Olivia, Olivia"), which gave false rejects in the first pass.
- **Automatic pitch re-roll:** if no passing bedtime take was at least 0.5 st below the chosen day take, another round was rendered, up to 3 rounds (9 takes).

| Name (IPA) | Day: rendered / passed / takes to first pass | Bed: rendered / passed / takes to first pass | Bed vs day | Whole-file name check (Whisper / phonemes ≤1) | Word errors | UTMOS |
|---|---|---|---|---|---|---|
| Olivia /əˈlɪviə/ | 3 / 3 / 1 | 3 / 2 / 1 | **−1.4 st**, −2.1 LU ✓ | 5/5 / 5/5 ✓ | 0 | 4.08 |
| Muhammad /mʊˈhæməd/ | 3 / 2 / 1 | 9 / 3 / 3 (2 pitch re-rolls) | −0.7 st, −2.1 LU ✓ | 5/5 / **4/5** ✗ | 0 | 3.93 |
| Niamh /niːv/ ("Neeve") | 3 / 3 / 1 | 9 / 8 / 1 (2 pitch re-rolls) | **+0.4 st ✗**, −2.1 LU | 5/5 / 5/5 ✓ | 0 | 4.07 |

- **Pass rate per take (all gates):** Olivia 5/6, Muhammad 5/12, Niamh 11/12: **21 of 30 takes (70%)**.
  - Every stanza had a passing take in its first round of 3 on words and names. Muhammad's bedtime first passed at take 3.
  - Two stanzas needed pitch re-rolls. Muhammad's bedtime found a lower take in round 3. Niamh's never did: the only lower take, 233 Hz, failed the word check ("sleepy **hat**").
  - Render time per name: Olivia 214 s (2 calls); Muhammad 434 s and Niamh 418 s (4 calls each, including the re-rolls). The final name run took 932 s including checks.
- **Rejections were mostly Muhammad.** 8 of its 12 takes failed the name gate: the recogniser heard /moʊhɑːmɪd/ or /mɔhamɪd/ ("Mo-HAHM-id"), 2 edits from the IPA. That is arguably a real variant, not an error, but the gate is strict by design.
- **Possible false accepts (please listen):**
  - **Olivia**, last name in the file ("night night, Olivia"): phonemes /əlɪvə/, distance 1, a possible "Oliv-uh". Whisper wrote "Olivia". It passed.
  - **Muhammad** day take 0 (not used): /mʊhmɪd/ with the stressed vowel missing, distance 1. It passed the gate.
  - **Muhammad**, whole file: 4 of 5 match within 1 edit. The fifth is 2 edits away, although the same take matched 3 of 3 when checked alone.
  - **Niamh:** Whisper transcribes the whole file with exclamation marks ("Neve! Neve! Boots on tight!"). The name is right (/niːv/ 5/5), but this may mean an emphatic read. Please listen to the start of each stanza.
- **Takeaway for production:** with 3 takes per round, words and names are reliable enough for Olivia and Niamh. The bedtime-pitch rule needs more takes or a lower bedtime reference, and Muhammad needs either a looser, variant-aware name target or a respelling test.

## Honest listening notes (predictions from the measurements, not listening)

- **Character:** the same designed voice. ECAPA vs the anchor is 0.84 in both stanzas, the same as casting (0.83/0.86). Day pitch is within 0.55 st of the anchor, so it should sound like the voice you liked. It is not Northern; nothing was done to change the accent.
- **Flow:**
  - The day stanza should sound like one continuous sentence with a small couplet pause. Whisper hears only one break, after "bright".
  - The bedtime stanza is smoother than casting (3 breaks against 4 when transcribed alone), with longer pauses and a clear pause before "night night".
- **Bedtime settles:** 36 Hz lower than the day stanza, quieter by 2.1 LU, pitch spread 2.35 st (not monotone). It may sound a touch too low relative to the day; the target was about 1 st.
- **The main risk is pace.** The day stanza may feel brisk for a bedtime-book voice (178 wpm vs 132 in casting). If it does, the day take with the most natural pace in the pool is `ava_day_A_s75_nsm_s8112_t0` (159.6 wpm projected). It lost on flow (2 Whisper breaks).
- UTMOS 4.10 is a little below casting (4.28); every take scored about 4.45–4.5 raw. There is no defect on the numbers, but listen for any pumping from the 2:1 compressor on the louder "Kick the ball" line.

## Licences

| Component | Code | Weights | Notes |
|---|---|---|---|
| Qwen3-TTS 1.7B VoiceDesign and Base | Apache-2.0 (qwen-tts 0.1.1) | Apache-2.0 | Designed voice from text; Base only ever clones our own synthetic anchor. No real person cloned. |
| Checks only: faster-whisper small.en | MIT | MIT | |
| Checks only: facebook/wav2vec2-lv-60-espeak-cv-ft | Apache-2.0 | Apache-2.0 | needs `phonemizer` + espeak-ng |
| Checks only: speechbrain/spkrec-ecapa-voxceleb | Apache-2.0 | Apache-2.0 | |
| Checks only: prj-beatrice/utmos22-torch-native | MIT | MIT | a rough naturalness hint only |

## Notes

- **Memory:** a 1.7B fp32 render process peaks at about 12.2 GB during loading, so rendering and checking ran in separate processes. The first attempt was killed by the out-of-memory killer; decoding takes one at a time lowered the steady state.
- **The ECAPA gate (mean − 2 SD)** is weak when a pool contains garbage takes, which inflate the SD: the bedtime pool threshold fell to 0.19. The garbage takes were caught by the other gates. A median-based threshold would be more robust.
- Render times (CPU, batch of 3 or 4): about 90–115 s per call, and about 195 s for a call that included a runaway take.
  - Ava: 1386 s over 12 calls.
  - Sleepy reference: 194 s.
  - Names: 1066 s over 10 calls.
  - Reference reproduction: 101 s, plus about 90 s of seed search.
  - Checks: about 20–25 s per take.
- Nothing outside `voice6/` was changed.
