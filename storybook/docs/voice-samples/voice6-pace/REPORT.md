STATUS: FINAL

# Voice 6 at picture-book pace

Run date: 2026-09-25 (UTC), about 18:08–20:35. Machine: 4 CPU cores, 15 GB RAM, no GPU. torch 2.14.0 (PyPI), qwen-tts 0.1.1, transformers 4.57.3, fp32. Base model `Qwen/Qwen3-TTS-12Hz-1.7B-Base` at commit `fd4b2543`.

**Nobody has listened to these files.** Every judgement below comes from measurements: Whisper, a phoneme recogniser, ECAPA, UTMOS22, pitch and loudness. Please listen before deciding.

## Short answer

- **No approach met every target.** The approaches trade off like this:
  - P1 (slowed reference) gets the pace right but breaks the name.
  - P2 (couplets) keeps the name but is still too quick, and its bedtime pitch rises.
  - Adding a gentle stretch fixes the pace, but costs some naturalness and speaker similarity.
- **Why pace is hard with this voice:** it speaks at about 185–240 wpm between pauses whatever I do. That holds for the reference speed, whole stanzas and couplets alike.
  - The slowed reference did not slow the speech itself. It only made the model's pauses longer.
  - Casting's 132 wpm came from longer pauses between couplets (0.9–1.5 s), not from slower speech.
- **P1, the slowed reference, failed on the name.** In 20 of 20 takes (both stretchers, 0.85× and 0.78×, whole stanzas and couplets), the **first "Ava" of the stanza comes out as "AH-va" /ɑːvə/**. The locked anchor gets it right. So P1 cannot pass the strict name gate, and **no slowed reference is shipped (no `anchor-slow/`)**.
- **Recommended method, "P5":**
  1. Whole stanzas from the **locked anchor** (as voice6-polished did).
  2. The strict gates.
  3. **Casting-level reader pauses**.
  4. A **gentle, automatic PSOLA slow-down** of the chosen takes. It is pitch- and formant-preserving, capped at 0.84×.
  - It keeps the voice6 fixes: 5 of 5 Avas, 0 word errors, whole-stanza flow.
  - It lands close to the pace band.
  - The costs: UTMOS about 3.9–4.0 against polished's 4.10, and ECAPA about 0.78–0.82 against a 0.83 target. Bedtime pitch also needs more takes per round (see below).
- **Olivia, fully automatic with the P5 method (`voice6-pace-best-olivia.mp3`):**
  - pace 138 / 114 wpm, 5 of 5 names, 0 word errors;
  - bedtime −0.2 st and −2.1 LU;
  - UTMOS 4.04.
  - It is the file closest to all targets.

## Files

| File | What it is |
|---|---|
| `voice6-pace-P1-ava.mp3` | P1: whole stanzas cloned from a slowed anchor (day: rubberband 0.85×; bed: PSOLA 0.78×). **Flagged fallback:** no P1 take passed the name gate, so the takes whose only failure was the name were used. |
| `voice6-pace-P2-ava.mp3` | P2: couplets from the locked anchor (5 takes per day couplet, 8 per bed couplet), joined automatically. |
| `voice6-pace-P4-ava.mp3` | Extra: the same P2 couplets with a fixed PSOLA 0.87× slow-down. |
| `voice6-pace-P5-ava.mp3` | **Recommended method:** whole stanzas from the locked anchor (3 takes each), with automatic PSOLA (day 0.84×, bed 0.877×). |
| `voice6-pace-best-olivia.mp3` | Olivia with the P5 method, fully automatic (3 day and 3 bed takes; no listening, no hand-picking). |
| `results.json` | Every take (seed, text, sampling, render time, transcript, phonemes, gates, metrics), the stretch checks, every selection, the pause-edit logs, mastering settings and final measurements. |

**P3** (slowed reference plus couplets) was tested but **not built**.
- The day name couplet from the 0.78× reference failed the first Ava in 3 of 3 takes, the same /ɑːvə/.
- A bedtime second couplet from a slower, 0.5 st lower reference (ECAPA 0.908 to the anchor) passed names in 2 of 3 takes, but its pitch was no lower (254–271 Hz).

## Comparison table (same code on every final MP3)

- Each file is split at the stanza gap.
- **Pace** is words ÷ stanza length including pauses; speech-only removes silences of 80 ms or more.
- **Names** means the strict whole-file count: /eɪ v + vowel/ for Ava. For Olivia it is a window within edit distance ≤1 of /əlɪviə/ that includes the stressed /ɪv/. Whisper's own name count is in brackets.
- **Breaks** counts sentence-final marks Whisper puts inside the verse, whole file (day/bed transcribed alone).
- My code re-measures casting as 132.1 / 112.8 wpm and 3/5 strict Avas, which matches its published numbers. Its break count differs from voice6's because the counting rule differs.

| File | Pace day / bed (wpm) | Speech-only day / bed | F0 day / bed (Hz) | Bed vs day | Bed vs day loudness | Pitch spread day / bed (st) | ECAPA day / bed | UTMOS all (day/bed) | Word errors | Names strict (Whisper) | Breaks | Duration | LUFS / dBTP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casting `voice6-soft-northern` | 132.1 / 112.8 | 188 / 184 | 256 / 274 | **+1.2 st** | −1.7 LU | 3.01 / 3.05 | 0.84 / 0.86 | 4.28 (4.38/4.32) | 0 | 3/5 (5) | 6 (2/3) | 27.9 s | −18.1 / −0.8 |
| voice6-polished | **178.7** / 131.7 | 230 / 202 | 259 / 223 | −2.6 st | −2.2 LU | 2.36 / 2.40 | 0.84 / 0.84 | 4.10 (4.20/4.05) | 0 | 5/5 (5) | 10 (1/3) | 22.8 s | −18.0 / −1.9 |
| **P1** slowed ref | **143.3 / 105.2** | 196 / 162 | 247 / 239 | **−0.6 st ✓** | −2.2 LU | 2.49 / 2.32 | 0.78 / 0.82 | 3.97 (3.93/4.20) | 0 | **2/5 ✗** (5) | 6 (0/3) | 27.9 s | −18.1 / −1.9 |
| **P2** couplets | 152.5 / 115.4 | 216 / 192 | 244 / 268 | **+1.6 st ✗** | −2.0 LU | 2.66 / 2.22 | 0.79 / 0.84 | **4.13** (4.23/4.10) | 0 | 5/5 ✓ (5) | 10 (1/3) | 26.0 s | −18.0 / −1.9 |
| P4 couplets + PSOLA 0.87 | **138.5 / 105.8** ✓ | 193 / 172 | 244 / 269 | +1.7 st ✗ | −2.1 LU | 2.69 / 2.23 | 0.76 / 0.81 | 3.97 (4.13/3.98) | 0 | 5/5 ✓ (5) | 10 (1/4) | 28.3 s | −18.0 / −1.9 |
| **P5** stanzas + auto PSOLA | 146.2 / **107.1** | 211 / 175 | 249 / 253 | +0.3 st ✗ | −2.1 LU | 2.27 / 1.82 | 0.78 / 0.80 | 3.91 (4.12/3.95) | 0 | 5/5 ✓ (5) | 4 (0/3) | 27.4 s | −18.1 / −1.9 |
| **Olivia** (P5, automatic) | **137.9 / 114.1** ✓ | 187 / 171 | 273 / 269 | −0.2 st | −2.1 LU | 2.28 / 1.84 | 0.81 / 0.82 | 4.04 (4.08/4.13) | 0 | 5/5 ✓ (5) | 0* (2/3) | 27.2 s | −18.0 / −1.8 |

*For the whole Olivia file, Whisper returned almost no punctuation, so "0" there means nothing. The per-stanza counts are 2 and 3.

Targets: day 125–140 and bed 100–115 wpm; bed 0.5–1.5 st below day; bed about −2 LU; 5/5 names; 0 word errors; ECAPA ≥ about 0.83; spread 2.3–3.2 st. Room-tone floor in the stanza gap is −63.9 to −64.1 dBFS in every new file.

What the table says:
- **Pace:** P4 and Olivia are in band for both stanzas. P1 is in band at bedtime and 3 wpm over by day. P5 is in band at bedtime and 6 wpm over by day. P2 is 12 over by day.
- **Bedtime pitch:** only P1 settles by 0.5–1.5 st. P2 and P4 rise, as casting did. P5 (+0.3) and Olivia (−0.2) are flat.
- **Pitch spread** falls under 2.3 st at bedtime in P2, P4, P5 and Olivia (1.8–2.2). By day everything is in band except Olivia (2.28), which is 0.02 under.
- **ECAPA** on the finished files is 0.76–0.84, below casting's 0.84/0.86. Raw takes measure 0.81–0.90. Two stages cost a little each:
  - the −64 dBFS room tone: about −0.04 on one take, measured stage by stage;
  - PSOLA: about −0.02 to −0.03 at 0.85×, measured on the anchor.

## What was done

### P1: slowed reference

- **Stretch checks on the anchor** (13.15 s, UTMOS 4.43; full numbers in `results.json`):

  | Stretch | 0.85×: ECAPA / UTMOS | 0.78×: ECAPA / UTMOS |
  |---|---|---|
  | rubberband R3 `--fine -F` | 0.977 / 3.59 | 0.962 / 3.47 |
  | WSOLA (audiotsm) | 0.973 / 3.74 | 0.970 / 3.50 |
  | **PSOLA (Praat overlap-add)** | **0.977 / 4.31** | **0.952 / 4.33** |

  - PSOLA is the only method without audible-scale artefacts on the numbers, so the P1 prompts used PSOLA. One rubberband 0.85× set was rendered first for comparison.
  - Bedtime references at 0.72× with a pitch shift:
    - −1 st: ECAPA 0.897, **excluded** (below 0.9);
    - −0.5 st: ECAPA 0.908, UTMOS 4.08, allowed;
    - no shift: ECAPA 0.942, UTMOS 4.28.
- **Prompts** were built with `create_voice_clone_prompt` in full ICL mode (not x-vector-only), with the same transcript.
- **Renders:** day text A and bed text C from voice6, sampling as voice6 (talker 0.5 by day and 0.45 at bed, top_p 0.8; subtalker 0.7/0.95), seeded batches of 3 and 2.
- **Result:**
  - Artefacts do wash out: raw take UTMOS was 4.38–4.52 for every stretcher, the same as anchor takes.
  - Pauses got longer: raw day pace 141–163 wpm with pauses.
  - **The speech itself did not slow:** 200–220 wpm speech-only, the same as anchor renders.
  - **The first Ava of every stanza was /ɑːvə/, "AH-va", in 20 of 20 takes** (P1 plus P3). The later Avas were fine. The anchor's own renders never produced /ɑːvə/; they gave /eɪvə/ for the first Ava in 14 of 19 name-first couplet and stanza takes.
  - Whisper still writes "Ava", so only the phoneme gate catches it. **Please listen to the start of the P1 file to confirm.**

### P2: couplets from the locked anchor

- Couplet copies keep a comma after the name and a full stop only at the end, for example `the moon is out, the stars are too... night night, Ava, we love you.`
- Takes: day 5 + 5, bed 8 + 8 (the extra bed takes were a search for a lower pitch).
- **Pair choice:** every gate-passing pair was scored, including the join (couplet 2's opening line vs couplet 1's closing line, penalised over 1.5 st). The join gap is the couplet-end pause: 0.9 s by day and 1.17 s at bedtime (×1.3). **This is longer than the brief's 0.7 s.** At 0.7 s the day stanza projects to about 158 wpm.
- **Day couplets read faster, not slower.** Speech-only rate was 200–268 wpm, and the short second couplet is the fastest (232–268). Bedtime couplets ran 167–237.
- **Bedtime couplets sit high:** 241–315 Hz against about 245 by day. This is casting's bedtime-rise problem. Only 2 of 8 first bedtime couplets passed the name gate.

### P5 (recommended) and P4: a gentle PSOLA slow-down of the chosen takes

- **Where it is applied:** the chosen raw take is time-stretched with Praat PSOLA (pitch and formants kept) before the pause edit.
- **How the factor is set:** it is computed automatically so the projected stanza pace hits 132 (day) or 107 (bed) wpm, clamped to 0.84–1.0. This works because the pause rules reset pause lengths anyway, so only speech time scales.
- **P4** is the P2 couplets with a fixed 0.87×.
- **P5** is new whole-stanza renders from the locked anchor (voice6's method, 3 takes each).
  - Its day takes were so quick (240–256 wpm speech-only) that the factor hit the 0.84 clamp.
  - So day lands at 146 wpm. It would take about 0.78× to reach 132, but I did not go below 0.84.
- **Why a post-render stretch at all:** it is the only lever that actually slowed the speech. The anchor test above shows PSOLA at 0.85× costs about 0.1 UTMOS and keeps ECAPA at 0.977. voice6/REPORT.md cites qwen-calm's stretch dropping UTMOS 4.43→3.48; that report does not name its stretcher, but in this run rubberband and WSOLA dropped by a similar amount while PSOLA did not.

### Gates, score, pauses and mastering (shared by every file)

- **Gates** (all must pass):
  - Whisper small.en hears the exact words.
  - Strict name count equals the expected count, and Whisper hears the name every time.
  - ECAPA ≥ pool median − 2 × 1.4826 × MAD. This is the robust version voice6 recommended.
  - UTMOS ≥ pool median − 0.5.
  - No reference echo in the first 1.5 s.
- **Gate results per pool** (passed/rendered):
  - P1: 0/17, all on the name gate.
  - P2: day couplet 1 4/5, day couplet 2 5/5, bed couplet 1 2/8, bed couplet 2 7/8.
  - P3: 2/6.
  - P5: day 3/3, bed 3/3.
  - Olivia couplets: 12/18. Olivia whole stanzas: 6/6.
- **Score:** distance outside each target band, never "lower is better". It adds pace (after the pause edit), pitch spread, F0 (day ±1 st of the anchor; bed 0.5–1.5 st below the chosen day, +4 if above), line-to-line pitch jumps over 2 st, rising line ends, Whisper breaks, and ECAPA under 0.83.
- **Whole-file check after building:** if the finished MP3 fails the word or strict name check, the next-best pair is built automatically, up to 5 builds. P2's first build had 4/5 strict Avas, so it moved to the next pair (logged in `results.json`).
- **Pauses:** cut or extended only inside the model's own silences of 80 ms or more, keeping 30 ms at each edge.
  - **The voice6 limits are too short for this voice's pace.** Under them, pace comes out day 157 / bed 119 (P1 takes) at best.
  - So all files use **casting-level "reader" pauses**: line end 0.52–0.62 s, couplet end 0.9 s, and model comma pauses kept up to 0.6 s (trimmed to about 0.45–0.52 above that).
  - Bedtime is ×1.3, with +250 ms before "night night", ±10% seeded jitter, and a 1.47 s stanza gap.
  - These are the same lengths casting used, and the founder liked casting's pace.
- **Mastering, as in voice6:**
  1. −20 LUFS per take.
  2. Expander (40 dB under speech, 2:1, −15 dB floor, 20 ms RMS detector).
  3. Pause edit.
  4. High-pass 80 Hz.
  5. High shelf −2 dB at 5 kHz.
  6. De-esser at 6–8 kHz (at most 4 dB).
  7. Compressor 2:1, 20/200 ms, auto threshold for 2.5 dB mean gain reduction.
  8. Fades.
  9. Day at −18 LU and bed 2 LU lower, whole file at −18 LUFS.
  10. True-peak limiter at −1.9 dBTP (0.2–0.9 dB of limiting).
  11. Pink room tone (100–6000 Hz) at −64 dBFS RMS.
  12. MP3 at 24 kHz mono.
  - On one take, measured stage by stage, the chain cost 0.43 UTMOS (4.41→3.98): expander −0.16, pause edit and EQ −0.05, room tone −0.20, MP3 −0.05. voice6 reported 0.08 before room tone, so my expander is a little harsher than theirs.

## Honest listening notes (predictions from the measurements)

- **Voice identity:** all files come from the same locked anchor (P1 from a stretched copy of it). ECAPA on the finished stanzas is 0.76–0.84, a little under casting (0.84/0.86). Raw takes are 0.81–0.90. Pitch by day is within 0.5 st of the anchor (244–249 Hz against 250.5), except Olivia's day stanza at 272 Hz (+1.4 st).
- **P1:** likely the most relaxed and settled bedtime, but **listen for "AH-va"** at the start of both stanzas.
- **P2:** the cleanest sound (UTMOS 4.13) with a clear gap between couplets. Whisper hears the couplets as separate sentences (10 breaks), and the bedtime stanza goes **up**.
- **P4 and P5:** the stretch may make consonants sound slightly soft or "drawn". Listen to "kick the ball". If it sounds unnatural, P2's pace (152) is the fallback.
- **P5:** likely the most connected read (0 breaks by day), close to voice6-polished in character but slower. Bedtime is not lower than day (+0.3 st) and fairly flat (spread 1.8 st).
- **Olivia:** the closest to every target on paper. Please check that "night night, Olivia" is not clipped ("Oliv-uh"); the strict phone count found 5 of 5.

## What I would do next

1. **Keep the P5 method** (locked anchor, whole stanzas, reader pauses, automatic PSOLA capped at 0.84) and render **6–9 bedtime takes per round**, with voice6's automatic pitch re-roll. With 3 takes, no bedtime take landed 0.5–1.5 st below day.
2. If the stretch sounds unnatural, drop it and accept about 150 wpm by day with reader pauses. Or lengthen the couplet-end pause to about 1.1 s by day.
3. **Do not use slowed references** for name-first text.

## Render times (CPU, 4 threads)

- **Totals:** 26 Base-model calls took 5,965 s. Several calls ran while checks were running on the same 4 cores, so single calls ranged from 56 s to 799 s. Uncontended calls took about 70–110 s for 2–3 couplets and 170–190 s for 3 whole stanzas.
- **P1:** 1,458 s: rubberband 85 437 s, PSOLA 85 590 s, PSOLA 78 431 s.
- **P2:** 1,238 s.
- **P3 test:** 236 s.
- **P5:** 982 s.
- **Olivia:** 697 s for whole stanzas, plus 1,353 s for couplets (not used).
- **Other stages:**
  - Checks: about 15–25 s per take.
  - Each final build: about 60–90 s, including the whole-file measurement.
  - Model load: 12–22 s from cache.

## Notes

- **A layout problem in the committed voice6 prompt:**
  - In `voice6/anchor/voice6-anchor-prompt.safetensors`, `ref_code` has its data in (16, 165) order but carries the shape (165, 16).
  - Rebuilding the prompt from `voice6-anchor.wav` gives the identical speaker embedding and `ref_code == stored.reshape(16,165).T`.
  - Loading the stored file directly would feed scrambled codes to the model. Every render here used the rebuilt prompt.
  - I did not modify `voice6/`.
- The first pip install failed on the `sox` wheel (Debian setuptools). Installing it with `SETUPTOOLS_USE_DISTUTILS=stdlib` fixed that.
- No model weights are committed. Nothing outside `voice6-pace/` was changed.
