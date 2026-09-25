STATUS: FINAL

# Teacher voice (casting voice 2): locked, polished, and tested with other names

Run date 2026-09-25, 15:36–17:20 UTC.
- Machine: 4 CPU cores, 15 GB RAM, torch 2.14 from PyPI, fp32.
- Models: `qwen-tts` 0.1.1, Qwen3-TTS 12Hz 1.7B VoiceDesign (commit `5ecdb673`) and Base (commit `fd4b2543`).

**Nobody listened to any file.** Every judgement below comes from measurements. Please listen before deciding.

## Short answer

- **`teacher-polished-ava.mp3`** is the same teacher. It is cloned from an exact reproduction of the casting reference.
  - The verse is now read one whole stanza at a time, so the melody no longer resets at each couplet. The biggest line-to-line pitch jump by day falls from 5.4 st in casting to 1.5 st.
  - It keeps a light lilt: pitch spread 3.2 st by day and 3.2 st at bedtime. That is above the 2.5 st monotone floor used elsewhere, but lower than casting's 4.6 st by day (see "Listen for").
  - Bedtime is 112 wpm and 2 LU quieter. Casting was 111 wpm and 0.9 dB quieter.
  - UTMOS 4.41 against casting's 4.47.
- **Name test** (fully automatic, nobody picked takes):
  - **Niamh 10/10** takes pass.
  - **Olivia 8/10** pass.
  - **Muhammad fails at bedtime**: 0/10 takes pass. The model says "mu-HAH-mid" /mʊhɑːmɪd/ rather than the names.json /mʊˈhæməd/. `teacher-auto-muhammad.mp3` is therefore a **flagged fallback**, not something the automatic pipeline would ship.
- **False accepts.** The brief's rule (edit distance ≤ 1) lets **"AV-uh" /ævə/ and "EH-vuh" /ɛvə/ pass as Ava**. That is exactly the error the casting run warned about. I added one condition, "the stressed vowel must be present", which rejects them. Details are in the name test section.
- **Sleepy anchor: not made.** None of the 6 lullaby takes qualified (see Step 2.7). So there is no `teacher-polished-ava-sleepyB.mp3`; bedtime is slowed with pauses only.

## Files

| File | What it is |
|---|---|
| `teacher-polished-ava.mp3` | The best polished version: whole-stanza renders, automatic gates and scoring, reader pauses, mastering. |
| `teacher-auto-olivia.mp3` | Fully automatic, first 5 takes per stanza, no human choice. |
| `teacher-auto-muhammad.mp3` | Fully automatic, but its **bedtime stanza failed the name gate** after 10 takes. It is the fallback take with the fewest failed gates, shipped here only so the failure can be heard. |
| `teacher-auto-niamh.mp3` | Fully automatic, fed as "Neeve". |
| `anchor/` | The locked voice: `anchor.wav` (16-bit, 24 kHz), `anchor.txt`, `anchor_prompt.safetensors` (ref_code 174×16 int64 + 2048-d speaker embedding) and `anchor.json` (recipe, seed, versions, commits). 0.7 MB. No model weights. |
| `results.json` | Every take (seed, settings, transcript, phones, gates, metrics, score), every selection, pause edit and mastering setting. |

## Step 1: voice identity locked

- **Reproduced exactly.** `casting/results.json` does not record the design seed. Seed 200 (tried first, alongside 2, 20 and 2000) gave take durations matching the casting log (13.56 / 13.70 s).
  - Setup: VoiceDesign, the voice 2 description, the reference text, language English, batch 3, sampling {temperature 0.7, top_p 0.85, top_k 50, repetition_penalty 1.05, max_new_tokens 300}, `torch.manual_seed(200)` before the batch call, fp32 CPU, 4 threads.
  - Take index 2 against `casting/ref-2.mp3`: after aligning (0.30 s MP3 lead-in), **waveform correlation 0.997, log-mel correlation 0.985, ECAPA (speechbrain/spkrec-ecapa-voxceleb) 0.987**. Speech duration is 13.69 s in both (0.0% difference). The level differs by +5.1 dB only because casting mastered its MP3.
  - Fallback 3 (decode the MP3) was not needed.
- **Anchor = the raw reproduced take** (what casting fed the Base model), stored as 16-bit PCM. The prompt tensors were built from that 16-bit file, so the wav and the safetensors agree.
  - Transcript is the exact text fed: *Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three... and then she gave a big, sleepy yawn.*
  - Anchor metrics (my tools): f0 median 200.9 Hz, spread 4.21 st, 144.6 wpm.
- **Loading the prompt:** `anchor.json` has a one-line example. It builds `VoiceClonePromptItem(ref_code, ref_spk_embedding, x_vector_only_mode=False, icl_mode=True, ref_text)` from the safetensors, with no pickle.
- The description was not changed and no new voice was designed.

## Step 2: how the verse was rendered

- **Model:** Qwen3-TTS 1.7B **Base**, `generate_voice_clone` with the saved anchor prompt, full ICL mode (not x-vector-only), language English.
  - `model.generate_config` defaults were printed first: temperature 0.9, top_p 1.0, top_k 50, repetition_penalty 1.05, subtalker 0.9/1.0/50, max_new_tokens 8192. Every call overrides all of them.
- **Whole stanza per call** (121–125 characters). TTS copy (the words unchanged):
  - day: `Ava, Ava, boots on tight, the sun is up, the sky is bright. Kick the ball and watch it roll... all the way into the goal.`
  - bed: `Ava, Ava, time for bed, a cosy blanket, a sleepy head. The moon is out, the stars are too... night night, Ava. We love you.`
  - There is no "!" and no capitals, and a comma follows the name (there are no wh-questions in this verse). The "..." after "roll" and "too" is the verse's own.
- **Second punctuation version "E"** (tried for Ava only, same words): an ellipsis at the first line break (`boots on tight...` and `time for bed...`). Whole-stanza reads came out faster than casting, and this version aimed to slow them. Both versions went into one pool, and the scorer chose E for both stanzas.
- **Sampling:**
  - A = voice2's settings: talker temperature 0.5 (0.45 at bedtime, as casting voice2), top_p 0.8, top_k 50, repetition_penalty 1.05; subtalker temperature 0.75, top_p 0.9.
  - B = the same but subtalker temperature 0.7, top_p 0.95.
  - **A measured cleaner and was kept.** A: 10/10 plain Ava takes were valid speech (9/10 pass all gates). B: **2 of its 5 day takes were broken audio** (ECAPA ≈ 0, UTMOS 1.4, no words; B passed 3/5 day and 5/5 bed). The name tests used A only.
- **5 takes per stanza, seeded and logged.**
  - A batch of 5 ran out of memory (15 GB), so each set of 5 is two seeded calls of 3 and 2 takes. The seed is `base + 100·stanza + 10·config + call`; everything is in `results.json`.
  - max_new_tokens = 2× the expected length.
- **Guards on every take:**
  - longer than 1.8× expected → reject (triggered twice, on the two broken config-B takes);
  - Whisper on the first 1.5 s against the last 1–5 words of the reference text ("…gave a big sleepy yawn") → reject (none triggered);
  - a sound burst before the sustained speech onset → trimmed (none found). Every take is trimmed to 60 ms before speech and 150 ms after, with 10 ms / 40 ms fades.

### Gates and score (automatic, no hand-picking)

**Gates:**
- Whisper small.en (int8, beam 5) hears exactly the words. "cosy/cozy" is equal, and the name's spelling variants are accepted: Neve/Neave/Neeve/Niamh; Mohammed/Muhammad/Muhammed.
- The name passes the phoneme check (see the name test section).
- ECAPA to the anchor ≥ mean − 2 SD of the batch.
- UTMOS22 ≥ batch median − 0.5.
- Whisper words align to the 4 lines.

Batch statistics exclude takes that are not speech of the right words, so the two broken B takes cannot drag the thresholds down.

**Score** = distance outside voice2's own band, in both directions (lower is better):
- pitch spread: day 4.1–5.1 st, bed 3.1–4.1 st;
- raw-take pace: day 130–148, bed 100–118 wpm (the pauses slow bed to about 110);
- median F0 more than 1 st from the anchor;
- 0.5 × each line-to-line pitch jump above 2 st;
- 0.5 for each couplet end that does not fall.

UTMOS is only a gate.

### Pauses and assembly

- Pauses are edited only inside the model's own silences of 80 ms or more (−35 dB under speech RMS), never inside speech.
- **Reader targets:**
  - comma 0.12–0.30 s;
  - line end 0.40 s;
  - couplet end 0.75 s;
  - ±10% seeded jitter;
  - bedtime ×1.3, plus 0.25 s before "night night";
  - between stanzas about 1.5 s (1.37 s after jitter).
- **One deliberate change from the brief.** The model's own pauses were already *longer* than the reader targets (for example 0.74 s after the first "Ava,", line ends of 0.5–0.6 s). Cutting them to target made the day stanza *faster* (173 wpm on a first try), further from voice2's 139. Casting voice2 has the same long comma pauses the founder liked.
  - So lengthening edits always apply. Shortening is applied only as far as the stanza stays at or below voice2's pace ceiling (148 wpm day, 110 bed).
  - For every file except Olivia's day stanza that meant no shortening (logged as `shrink_alpha`).
  - Where no model silence existed at a boundary, the model's timing was kept.
- Order:
  1. Each take normalised to −20 LUFS.
  2. Downward expander (3:1, threshold 40 dB under speech RMS, gain floor −30 dB).
  3. Pause edits with 20 ms equal-power crossfades inside gaps.
  4. Assembly.
  5. Mastering.
  6. **One continuous room tone** (pink, 100 Hz–6 kHz) added after the final gain stage, 48 dB under speech RMS (−64.2 dBFS).
  7. The floor checked on the decoded MP3.
- Pauses in the polished file: day after “ava” (comma): 0.92 s → 0.92 s; day after “ava” (comma): 0.54 s → 0.54 s; day after “tight” (line_end): 0.68 s → 0.68 s; day after “up” (comma): 0.49 s → 0.49 s; day after “bright” (couplet_end): 0.55 s → 0.75 s; day after “roll” (line_end): 0.46 s → 0.46 s; bed after “ava” (comma): 0.87 s → 0.87 s; bed after “ava” (comma): 0.58 s → 0.58 s; bed after “bed” (line_end): 0.64 s → 0.64 s; bed after “blanket” (comma): 0.56 s → 0.56 s; bed after “head” (couplet_end): 0.71 s → 0.906 s; bed after “out” (comma): 0.45 s → 0.45 s; bed after “too” (line_end): 0.58 s → 0.815 s; bed after “night” (comma): no model silence, timing kept; bed after “ava” (comma): 0.47 s → 0.47 s.

### Mastering

- Filters: HPF 80 Hz; −2 dB high shelf from 5 kHz.
- De-esser: split-band 6–8 kHz, capped at 4 dB. The cap is reached on the loudest sibilants; the 99th-percentile reduction is 4.0 dB.
- Compressor: 2:1, attack 20 ms, release 200 ms. The threshold is chosen automatically for about 2.5 dB median gain reduction on speech (−22 dBFS gave 2.4–2.5 dB).
- Levels: bedtime set 2 LU below day; −18 LUFS integrated.
- Limiter: my own look-ahead limiter on 4× oversampled peaks, to true peak ≤ −1.5 dBTP. pedalboard's `Limiter` adds makeup gain and flattened the bedtime drop, so it was replaced.
- Output: mono 24 kHz MP3 via `soundfile.write(..., format='MP3')`.

### Step 2.7: sleepy anchor (not made)

- 6 takes of *"Hush now, little mouse, the day is done. Goodnight to the moon and goodnight to the sun."* were cloned from the anchor (seeds 9000/9001).
- To qualify, a take needed exact words, F0 1–2 st below the anchor, and ECAPA ≥ 0.813 (mean − 2 SD of the Ava verse takes).
- **None qualified.** The two takes in the lower pitch range (−1.9 and −2.5 st) had ECAPA 0.78, below the gate. The takes that passed ECAPA were only −0.5 to −0.9 st lower.
- All six read quickly (192–209 wpm) rather than sleepily.
- So there is no sleepyB file, and bedtime is slowed with pauses only. Nothing is whispered.

## Metrics: each file next to casting voice2

All rows were measured with the same code on the final MP3s, including casting voice2, which re-measures to exactly its published values (138.8 wpm, 4.64 st day; UTMOS 4.466).
- Pitch spread = SD of voiced pYIN F0 in semitones around the median.
- Pace = words ÷ stanza duration (pauses included).
- Line jumps = |median F0 difference| between consecutive lines.

| File | Stanza | Pace wpm | Pitch spread st | F0 median Hz | Loudness range dB | Stanza LUFS | UTMOS | Line pitch jumps st |
|---|---|---|---|---|---|---|---|---|
| casting voice2 | day | 138.8 | 4.64 | 206.8 | 18.4 | -17.48 | 4.497 | 2.5, 0.35, 5.4 |
| casting voice2 | bed | 111.4 | 3.43 | 200.3 | 19.2 | -18.4 | 4.478 | 1.8, 2.2, 2.3 |
| teacher-polished-ava | day | 151.5 | 3.2 | 201.5 | 16.0 | -16.94 | 4.419 | 1.5, 0.7, 0.45 |
| teacher-polished-ava | bed | 111.9 | 3.22 | 209.2 | 17.2 | -19.03 | 4.432 | 1.5, 0.4, 2.1 |
| teacher-auto-olivia | day | 147.9 | 3.91 | 208.6 | 17.6 | -17.13 | 4.414 | 0.35, 1.9, 1.3 |
| teacher-auto-olivia | bed | 116.5 | 3.23 | 195.2 | 20.1 | -19.12 | 4.398 | 2.5, 0.7, 3.9 |
| teacher-auto-muhammad | day | 151.9 | 3.93 | 214.1 | 18.9 | -17.08 | 4.404 | 0.05, 1.55, 3.4 |
| teacher-auto-muhammad | bed | 116.3 | 3.37 | 199.7 | 18.6 | -18.9 | 4.433 | 2.15, 1.3, 0.85 |
| teacher-auto-niamh | day | 153.2 | 3.67 | 210.4 | 20.1 | -17.12 | 4.453 | 0.1, 1.9, 1.2 |
| teacher-auto-niamh | bed | 114.4 | 2.72 | 202.0 | 22.5 | -19.0 | 4.359 | 0.3, 0.65, 0.4 |

| File | Duration s | LUFS | True peak dBTP | Bed vs day LU | Floor dBFS (p5) | Whisper word errors | Names ok (whole-file, strict) | ECAPA vs anchor | UTMOS all |
|---|---|---|---|---|---|---|---|---|---|
| casting voice2 | 27.34 | -18.03 | -1.04 | -0.92 | -63.7 | 0 | 5/5 | 0.9048 | 4.466 |
| teacher-polished-ava | 26.21 | -18.01 | -1.77 | -2.09 | -64.8 | 0 | 5/5 | 0.8659 | 4.411 |
| teacher-auto-olivia | 26.05 | -17.99 | -1.94 | -1.99 | -64.8 | 0 | 5/5 | 0.8742 | 4.396 |
| teacher-auto-muhammad | 25.78 | -18.01 | -1.96 | -1.82 | -64.8 | 0 | 0/5 | 0.8723 | 4.415 |
| teacher-auto-niamh | 25.86 | -17.99 | -1.71 | -1.88 | -64.6 | 0 | 5/5 | 0.8591 | 4.388 |

- Names ok counts non-overlapping name matches in the whole file's phone stream (distance ≤ 1, stressed vowel present). Per-word Whisper windows clip back-to-back names such as "Olivia, Olivia", so those are kept in `results.json` for auditing only.
- ECAPA is similarity to the anchor clip. Casting voice2's verse measures 0.9048, so the new files (0.86–0.88) are the same speaker by this measure.
- The floor is the 5th percentile of 50 ms frames. Every gap in the new files sits at −63 to −64.5 dBFS, one steady bed. Casting's gaps varied from −56 to −64 dBFS.
- Casting voice2's true peak re-measures at −1.04 dBTP, because casting limited sample peaks, not true peaks.

## Gate results per take

Polished Ava. The pool is both punctuation versions, config A; ✓ = passed every gate. The chosen takes are `AvaE_dayE_A_s5500_t0` and `AvaE_bedE_A_s5600_t0`. Failed gates are listed by name.

| Take | Passed | Failed gates | Score | Pitch spread st | Pace wpm (raw) | F0 vs anchor st | Line jumps st | Line-end falls | ECAPA | UTMOS | Name phones |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `AvaE_dayE_A_s5500_t2` | ✗ | name | 0.95 | 4.04 | 156.9 | -0.1 | 0.15, 0.7, 0.15 | ↘↘↘↘ | 0.8903 | 4.554 | ævɐ eɪvɐ |
| `AvaE_dayE_A_s5500_t0` | ✓ |  | 1.58 | 3.18 | 154.6 | 0.3 | 1.45, 0.85, 0.4 | ↘↘↘↘ | 0.8698 | 4.558 | eɪvɐ eɪvɐ |
| `Ava_day_A_s5000_t2` | ✓ |  | 2.03 | 2.95 | 156.8 | 0.6 | 1.6, 1.3, 0.5 | ↘↘↘↘ | 0.8842 | 4.542 | eɪvɐ eɪvɐ |
| `AvaE_dayE_A_s5501_t1` | ✓ |  | 2.14 | 4.4 | 164.9 | 0.6 | 2.9, 0.75, 0.99 | ↘↘↘↘ | 0.8789 | 4.561 | eɪvɐ eɪvɐ |
| `Ava_day_A_s5001_t1` | ✓ |  | 2.16 | 3.54 | 164.0 | 0.0 | 2.0, 0.2, 0.2 | ↘↘↘↘ | 0.8544 | 4.548 | eɪvɐ eɪvɐbuː |
| `Ava_day_A_s5000_t1` | ✓ |  | 2.535 | 3.81 | 169.2 | 0.15 | 1.85, 0.34, 2.25 | →↘↘↘ | 0.8667 | 4.547 | eɪvɐ eɪvɐbuː |
| `Ava_day_A_s5001_t0` | ✓ |  | 2.71 | 3.86 | 158.7 | -0.1 | 4.8, 0.19, 0.2 | ↘↘↘↘ | 0.8664 | 4.561 | eɪvɐ eɪvɐ |
| `Ava_day_A_s5000_t0` | ✓ |  | 3.4 | 3.02 | 171.2 | -0.2 | 0.35, 1.1, 1.0 | ↘↘↘↘ | 0.8753 | 4.545 | eɪvɐ eɪvɐbuː |
| `AvaE_dayE_A_s5501_t0` | ✓ |  | 3.54 | 3.26 | 168.5 | -0.4 | 1.6, 0.9, 2.3 | ↘→↘↘ | 0.8848 | 4.538 | eɪvɐ eɪvɐ |
| `AvaE_dayE_A_s5500_t1` | ✓ |  | 4.77 | 2.88 | 183.5 | -0.16 | 0.5, 0.8, 0.9 | ↘↘↘↘ | 0.8662 | 4.529 | eɪvɐeɪ eɪvɐbuː |
| `AvaE_bedE_A_s5600_t0` | ✓ |  | 0.0 | 3.19 | 115.7 | 0.8 | 1.7, 0.2, 2.0 | ↘↘↘↘ | 0.8556 | 4.571 | eɪvɐ eɪvɐ aɪteɪvɐ |
| `Ava_bed_A_s5100_t1` | ✓ |  | 0.795 | 3.05 | 125.2 | 0.4 | 0.7, 1.3, 2.05 | ↘↘↘↘ | 0.8511 | 4.556 | eɪvɐ eɪvɐ aɪteɪvɐ |
| `AvaE_bedE_A_s5601_t1` | ✓ |  | 1.31 | 2.92 | 120.3 | 0.0 | 1.2, 1.6, 3.8 | ↘↘↘↘ | 0.8554 | 4.555 | eɪvɐ eɪvɐ eɪvɐ |
| `AvaE_bedE_A_s5600_t2` | ✓ |  | 1.35 | 2.81 | 128.6 | 0.3 | 0.8, 0.3, 1.6 | ↘↘↘↘ | 0.8415 | 4.551 | eɪvɐ eɪvɐ aɪteɪvɐ |
| `Ava_bed_A_s5101_t1` | ✓ |  | 1.88 | 4.13 | 123.0 | 0.09 | 0.9, 0.4, 4.7 | ↘↘→↘ | 0.8235 | 4.556 | eɪvɐ eɪvɐ teɪvɐ |
| `AvaE_bedE_A_s5601_t0` | ✓ |  | 2.205 | 4.0 | 127.3 | -0.3 | 1.6, 0.94, 4.55 | ↘↘↘↘ | 0.8335 | 4.583 | eɪvɐ eɪvɐ eɪvɐ |
| `AvaE_bedE_A_s5600_t1` | ✗ | name | 2.96 | 4.13 | 131.1 | -2.3 | 2.19, 2.0, 2.45 | ↘↘↘↘ | 0.876 | 4.556 | ævɐ ɛvɐ aɪteɪvɐ |
| `Ava_bed_A_s5101_t0` | ✓ |  | 3.025 | 2.72 | 130.2 | -0.5 | 3.85, 0.95, 1.1 | ↘→↘↘ | 0.83 | 4.54 | eɪvɐ eɪvɐ aɪteɪvɐ |
| `Ava_bed_A_s5100_t0` | ✗ | name | 3.795 | 4.12 | 131.2 | 0.7 | 6.1, 2.26, 2.55 | →↘↘↘ | 0.8578 | 4.577 | vɐ eɪvɐ eɪvɐ |
| `Ava_bed_A_s5100_t2` | ✓ |  | 4.11 | 3.14 | 131.1 | 0.09 | 0.9, 5.2, 4.4 | ↘↘→↘ | 0.8236 | 4.556 | eɪvɐ eɪvɐ eɪvɐ |

The tables for Olivia, Muhammad and Niamh, and for config B, are in `results.json` (`selection`).

## Render times (CPU, fp32, 4 threads)

- **Generation:**
  - plain Ava, A+B: 20 takes, 897 s;
  - Ava version E: 10 takes, 381 s;
  - Olivia: 384 s;
  - Niamh: 354 s;
  - Muhammad: 363 s, plus a 216 s retry round;
  - lullaby: 6 takes, 130 s.
- **Per stanza:** about 100–125 s for a batch of 3 and 70–90 s for a batch of 2. That is about 40 s of CPU per 10-second take, 3–4× slower than real time.
- **Model loading:** about 40 s per process.
- **Checks:** Whisper, phonemes, ECAPA, UTMOS and pYIN take about 9 s per take.
- **Assembly, mastering and final verification:** about 50 s per file.
- **Fully automatic cost of one personalised verse:** about 6.5 min of CPU for 10 takes + 1.5 min of checks + 1 min of assembly. With a GPU this would be far quicker.
- **Locking the voice:** reproduction 153 s, anchor export 60 s.

## Name test: what customers would get

- **Setup:**
  - Same gates, score and assembly as Ava.
  - Config A.
  - Up to 5 takes per stanza, then an automatic retry round of 5 if nothing passed.
  - No human choice.
- **Phoneme check:**
  - Model: wav2vec2-lv-60-espeak-cv-ft, greedy CTC over the whole trimmed take.
  - Target: the IPA of `names.json` entries[].variants[0]. Olivia /əˈlɪviə/, Muhammad /mʊˈhæməd/, Niamh /niːv/, Ava /ˈeɪvə/.
  - Comparison: on atomic phones (long vowels, diphthongs and affricates kept whole). ɐ, ʌ and ɚ count as ə; ᵻ as ɪ; ɾ as d. [a] counts as [æ], because Southern British says the TRAP vowel as [a] and the recogniser writes it so.
  - Pass: Whisper hears the name every time, AND the whole-take phone stream contains that many non-overlapping windows within edit distance ≤ 1 **that include the stressed vowel**.
  - Why whole-take: per-word Whisper windows were also logged, but they clip back-to-back repeats such as "Olivia, Olivia". So the whole-take count decides, and the per-window results are kept for auditing.

| Name (fed as) | Day: pass / takes | Bed: pass / takes | Takes needed (first pass) | Final file names | Outcome |
|---|---|---|---|---|---|
| Ava | 9/10 | 8/10 | day 1st, bed 2nd | 5/5 /eɪvə/ | pass |
| Olivia (Olivia) | 4/5 | 4/5 | 1st / 1st | 5/5 /əlɪviə/ | pass |
| Niamh (Neeve) | 5/5 | 5/5 | 1st / 1st | 5/5 /niːv/ | pass |
| Muhammad (Muhammad) | 2/5 | 0/10 | 1st / never | 0/5 strict (1/5 under the plain distance ≤ 1 rule) | **fail** |

- **Pass rate by name and stanza:**
  - Niamh 100%;
  - Olivia 80% (one day take said "Oliva" /əlɪvə/; one bed take had a word error);
  - Muhammad 40% by day and 0% at bedtime;
  - Ava 85%.
- **Muhammad:** every failing take says /mʊhɑːmɪd/, /məhɑːmɪd/ or /moʊhɑːmɪd/ ("mu/mo-HAH-mid"), 2–3 edits from the target. This is a real way people say the name, but not the "most common in UK" /mʊˈhæməd/ in names.json. Whisper still hears "Muhammad" every time, so **Whisper alone would have shipped it**.
  - The shipped fallback's final phones: mʊhɑːmə, ᵻd, məhɑːmᵻ, moʊhɑːmᵻ, tməhɑːmɪ.
  - Fix for production: a respelling or phoneme override for this name (not tested here, since the brief says plain spelling), and "never ship without a pass".
- **False accepts spotted:**
  - Under the brief's plain "edit distance ≤ 1" rule, three Ava takes passed that contain a wrong Ava:
    - `AvaE_dayE_A_s5500_t2`: /ævə/, "AV-uh";
    - `AvaE_bedE_A_s5600_t1`: /ævə/ and /ɛvə/;
    - `Ava_bed_A_s5100_t0`: the first Ava heard only as /və/.
    `AvaE_dayE_A_s5500_t2` was the second-best day take on score, so a plain distance rule could have shipped "AV-uh". A 3-phone name tolerates one wrong vowel at distance 1. The stressed-vowel condition rejects all three.
  - I found no false accept under the stricter rule. However:
    - Short names stay the weak spot (one edit is a third of "Neeve").
    - Whisper is lenient: it wrote "Neve", "Neave", "Muhammed" and "Mohammed" for the same sounds, so it cannot judge pronunciation.
    - The recogniser's own vowel errors could still pass or fail a take wrongly.
- **Echo guard:** no triggers across 71 takes. **Length guard:** 2 triggers, both on the broken config-B takes, which the other gates also failed. **Click trim:** no bursts found before the first word.

## Listen for

1. **Same person?** Compare `teacher-polished-ava.mp3` with `casting/voice2-nursery-teacher.mp3`. The speaker measures the same (ECAPA 0.87 against 0.90 to the anchor, median F0 202–209 Hz against 200–207 Hz).
2. **Does the lilt survive?** The melody now flows across each stanza instead of restarting at each couplet: the biggest day line jump fell from 5.4 to 1.5 st. Overall pitch movement is lower (3.2 against 4.6 st by day). Part of casting's 4.6 came from those resets, but listen for whether the day stanza now sounds a little plainer or less sing-song. If so, the next thing to try is more takes per stanza, since takes by day ranged from 2.9 to 4.4 st.
3. **Pace.** The day stanza is quicker than casting (152 against 139 wpm). Whole-stanza reads articulate faster, and I did not shorten the model's long comma pauses so as not to rush it further. Bedtime matches voice2 (112 against 111 wpm) and is clearly quieter (−2.1 LU).
4. **Pauses.** Check the gap after the first "Ava," of each stanza: about 0.9 s by the silence measure, which includes the soft end of the name. It is the model's own, and casting has a similar one. It could feel slightly long.
5. **Bedtime ending.** Listen to the "night night, Ava" line: 0.25 s extra before it, and a falling end. The bedtime stanza line jumps are 1.5 / 0.4 / 2.1 st.
6. **Name files:** Olivia and Niamh should sound like the same narrator with the name said right. For Muhammad, listen to the bedtime "Muhammad"s ("mu-HAH-mid") and decide whether that pronunciation is acceptable. The pipeline says no by the names.json target.
7. **Room tone:** one continuous, very low bed at −64 dBFS, so gaps should never drop to dead digital silence or pump.

## Honest caveats

- The ECAPA and UTMOS gates are batch-relative. They catch outliers, not a batch that is uniformly wrong.
- ECAPA similarity to a single 14 s reference is modest for everything, casting included (0.86–0.90). The anchor reproduction (0.987) is the strong result.
- Pitch spread over short stanzas, pYIN octave slips and Whisper word timestamps are all approximate. The line-end "fall" test only looks at the last 0.35 s of each line.
- The de-esser is a simple split-band gain, not a commercial de-esser. It is capped at 4 dB, so it reaches the cap only on the strongest /s/ sounds.
- The seed search tried 200 first. The provenance JSON records exactly how the anchor was made, so it can be rebuilt with the same package versions and the same CPU arithmetic. A different torch build or thread count may not be bit-exact.
