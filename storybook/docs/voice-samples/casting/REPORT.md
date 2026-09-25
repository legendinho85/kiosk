STATUS: INTERIM

# Casting session: six designed narrator voices

Run date: 2026-09-25 (UTC). Machine: 4 CPU cores, 15 GB RAM, no GPU; torch 2.14.0 from PyPI, fp32, 4 threads. Voices finished: 3 of 6.

**Interim push.** The first voices are ready to listen to; the rest are still rendering and will be added in the final push.

Nobody listened to these files. Every judgement below comes from measurements (Whisper, a phoneme recogniser, UTMOS22, pitch and loudness statistics). Please listen before deciding.

**No real person's voice is cloned.** Each voice was designed from a written description with Qwen3-TTS VoiceDesign. The Base model then cloned only that synthetic reference clip.

## At a glance

| # | File | Voice | Method | Whisper word errors | Ava /eɪv/ | UTMOS (all / day / bed) | Pace wpm (day / bed) | Pitch spread st (day / bed) | Loudness range dB (day / bed) | Bed vs day level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `voice1-warm-mum.mp3` | Warm young mum | clone | 0 | 5/5 ✓ | 4.36 / 4.37 / 4.33 | 126.8 / 103.9 | 2.49 / 2.84 | 19.4 / 21.3 | -1.9 dB |
| 2 | `voice2-nursery-teacher.mp3` | Gentle nursery teacher | clone | 0 | 5/5 ✓ | 4.47 / 4.47 / 4.47 | 138.8 / 111.3 | 4.61 / 3.6 | 19.2 / 19.8 | -0.9 dB |
| 3 | `voice3-soft-bedtime.mp3` | Soft bedtime voice | design (fallback) | 0 | 5/5 ✓ | 4.04 / 4.12 / 4.18 | 130.4 / 86.0 | 2.56 / 3.3 | 18.5 / 21.0 | -1.2 dB |

## Method (same for every voice)

1. **Design once.** Qwen3-TTS 1.7B VoiceDesign read a neutral reference text (not in the verse) from the voice description, 3 takes in one batch (sampling: {"do_sample": true, "temperature": 0.7, "top_p": 0.85, "top_k": 50, "repetition_penalty": 1.05, "max_new_tokens": 300}). The kept take is the one with the lowest calm score (pitch spread + 0.25 × loudness range, with penalties for monotone and for pace outside 100–135 wpm) among the takes Whisper transcribed with at most 6% word error.
   Reference text: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three... and then she gave a big, sleepy yawn."*
2. **Clone that clip for the verse.** Qwen3-TTS 1.7B **Base** (`Qwen/Qwen3-TTS-12Hz-1.7B-Base`) built one voice-clone prompt from the kept reference and its text (`create_voice_clone_prompt`, full in-context mode, not x-vector-only). Each couplet was one input, 3 takes per couplet in a batch; a couplet that failed the checks got up to 2 more rounds of 2 takes. The kept take passed the checks (≤1 Whisper word error, every Ava heard as /eɪv/) and had the lowest calm score (target pace 100–140 wpm by day, 75–115 wpm at bedtime).
3. **Less synthetic joins.** No dead digital silence: a continuous very quiet room tone (band-limited pinkish noise, −63 dBFS RMS) runs under the whole file, so gaps are room tone. 15–20 ms fades at every join; takes are trimmed with 60 ms before the first sound and 150 ms after the last, so the model's breaths inside a couplet stay. The pause between the two lines inside a couplet was measured and clamped to 0.40–0.70 s by day and 0.60–0.95 s at bedtime when the model left a real pause (it was left alone where the lines flowed straight on). Gaps: 0.8–1.0 s between day couplets, 1.5 s between the verses, 1.0–1.2 s between bedtime couplets (varied per voice).
4. **Bedtime slower and softer.** The bedtime text used ellipses at the line breaks, a lower temperature (0.45 vs 0.5), longer pauses and −2.5 dB of gain before compression.
5. **Master.** DC removal, 2:1 RMS compression (threshold −22 dBFS, 10 ms attack, 150 ms release), −2 dB high shelf at 6.5 kHz, −18 LUFS integrated, look-ahead peak limiter (−1.2 dBFS; −1.7 if the MP3 overshot), 0.3 s lead-in and 0.6 s tail, written with `soundfile.write(..., format='MP3')`, mono 24 kHz.
6. **Checks.** faster-whisper small.en (int8, beam 5) on every take and on the final MP3; `facebook/wav2vec2-lv-60-espeak-cv-ft` phoneme CTC for Ava (counted /eɪv/; any /aɪv/, /ɑːv/ or /æv/ fails); UTMOS22 strong via `prj-beatrice/utmos22-torch-native`; pitch via librosa pYIN (spread = standard deviation in semitones around the median); loudness range = p95 − p10 of 20 ms frame levels within 35 dB of the loudest; pace = words ÷ speech duration.

Text fed (plain "Ava"; the Base model has no style prompt):
```
Ava, Ava, boots on tight, the sun is up, the sky is bright!
Kick the ball... and watch it roll... all the way... into the goal!
Ava, Ava... time for bed. A cosy blanket... a sleepy head.
The moon is out, the stars are too... Night night, Ava. We love you.
```
Verse as written:
```
Ava, Ava, boots on tight,
the sun is up, the sky is bright!
Kick the ball and watch it roll...
all the way into the goal!

Ava, Ava, time for bed,
a cosy blanket, a sleepy head.
The moon is out, the stars are too...
night night, Ava. We love you.
```

## Per voice

### 1. Warm young mum: `voice1-warm-mum.mp3` and `ref-1.mp3`

**Listen for:** a warm, mid-pitched mum voice with the steadiest pitch of the first three (2.5 semitones spread by day); bedtime slows to about 104 wpm. Listen for whether it sounds tender enough, or a little plain.

- **Description (VoiceDesign `instruct`):** "A warm young British mum in her early thirties with a soft Southern English accent, reading to her own toddler at bedtime. Warm, smiling and tender, mid-low pitch, relaxed and unhurried. British English female narrator reading a picture book aloud to a small child. She reads slowly, at a relaxed bedtime-story pace, letting each phrase breathe with soft pauses at the commas. Gentle and calm throughout, never shouty, never dramatic, no sudden changes in volume or pitch."
- **Reference clip:** take 2 of 3; 16.7 s, f0 median 222.2 Hz, pitch spread 3.28 st, loudness range 25.3 dB, 118.6 wpm, UTMOS 4.477. Whisper: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three. And then she gave a big, sleepy yawn."* (0 word errors). Design render 129.4 s for 3 takes.
  - Other takes (pitch spread / loudness range / word errors): 3.31 st / 24.1 dB / 0 err; 3.45 st / 21.0 dB / 0 err
- **Method:** clone: Qwen3-TTS 1.7B Base, one voice-clone prompt (speaker embedding + reference codes and text) built from the designed reference
- **Sampling:** day {"do_sample": true, "temperature": 0.5, "top_p": 0.8, "top_k": 50, "repetition_penalty": 1.05, "subtalker_temperature": 0.75, "subtalker_top_p": 0.9, "max_new_tokens": 220}; bedtime {"do_sample": true, "temperature": 0.45, "top_p": 0.8, "top_k": 50, "repetition_penalty": 1.05, "subtalker_temperature": 0.75, "subtalker_top_p": 0.9, "max_new_tokens": 220}
- **Takes per couplet:** [3, 5, 3, 3] (all takes and transcripts in `results.json`)
- **Whisper on the final MP3:** *"Ava, Ava, boots on tight, the sun is up, the sky is bright. Kick the ball and watch it roll, all the way into the goal. Ava, Ava, time for bed, a cozy blanket, a sleepy head. The moon is out, the stars are too, night night Ava, we love you."* (0 word errors, WER 0%)
- **Ava check:** 5 of 5 heard as /eɪv/, 0 wrong → pass. Phonemes: `eɪvɐeɪvɐbuːtsɔntaɪtðəsʌnɪzʌpðəskaɪɪzbɹaɪkɪkðəbɔːlændwɑːtʃɪtɹoʊlɔːlðəweɪɪntəðəɡoʊleɪvɐeɪvɐtaɪmfɚbɛdɐkoʊziblæŋkɪdɐsliːpihɛdðəmuːnɪzaʊtðəstɑːɹzɑːɹtuːnaɪtnaɪteɪvɐwiːlʌvjuː`
- **UTMOS22:** 4.36 (day 4.37, bedtime 4.33)
- **Calm metrics:** day 126.8 wpm, pitch spread 2.49 st, loudness range 19.4 dB, f0 205.0 Hz; bedtime 103.9 wpm, 2.84 st, 21.3 dB, f0 194.6 Hz; bedtime is -1.9 dB vs day
- **Line pauses:** couplet 1: found 0.62 s, kept, then 0.9 s gap; couplet 2: found 0.76 s, set to 0.70s, then 1.5 s gap; couplet 3: found 0.94 s, kept, then 1.19 s gap; couplet 4: found 0.89 s, kept, then 0 s gap
- **Loudness / file:** -18.35 LUFS, peak -1.18 dBFS, 29.37 s, 180 KB
- **Render time (CPU):** 414.4 s of Base generation for all verse takes, plus 129.4 s for the reference design, plus 16.2 s for the final assembly, mastering and checks (per-take checks not included).

### 2. Gentle nursery teacher: `voice2-nursery-teacher.mp3` and `ref-2.mp3`

**Listen for:** the brightest, most lilting read (widest pitch movement, 4.6 semitones by day) and the quickest (139 wpm by day, 111 at bedtime). Listen for whether it stays kind rather than 'presenter'. Highest UTMOS so far.

- **Description (VoiceDesign `instruct`):** "A gentle British nursery teacher in her late twenties with a soft Southern English accent. Clear, kind and encouraging, lightly bright but not bubbly, unhurried and even, articulating each word softly. British English female narrator reading a picture book aloud to a small child. She reads slowly, at a relaxed bedtime-story pace, letting each phrase breathe with soft pauses at the commas. Gentle and calm throughout, never shouty, never dramatic, no sudden changes in volume or pitch."
- **Reference clip:** take 2 of 3; 13.7 s, f0 median 202.6 Hz, pitch spread 4.18 st, loudness range 22.3 dB, 144.5 wpm, UTMOS 4.533. Whisper: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three. And then she gave a big sleepy yawn."* (0 word errors). Design render 130.9 s for 3 takes.
  - Other takes (pitch spread / loudness range / word errors): 3.56 st / 26.0 dB / 0 err; 4.09 st / 23.7 dB / 0 err
- **Method:** clone: Qwen3-TTS 1.7B Base, one voice-clone prompt (speaker embedding + reference codes and text) built from the designed reference
- **Sampling:** day {"do_sample": true, "temperature": 0.5, "top_p": 0.8, "top_k": 50, "repetition_penalty": 1.05, "subtalker_temperature": 0.75, "subtalker_top_p": 0.9, "max_new_tokens": 220}; bedtime {"do_sample": true, "temperature": 0.45, "top_p": 0.8, "top_k": 50, "repetition_penalty": 1.05, "subtalker_temperature": 0.75, "subtalker_top_p": 0.9, "max_new_tokens": 220}
- **Takes per couplet:** [3, 3, 3, 7] (all takes and transcripts in `results.json`)
- **Whisper on the final MP3:** *"Ava, Ava, boots on tight, the sun is up, the sky is bright. Kick the ball and watch it roll, all the way into the goal. Ava, Ava, time for bed, a cozy blanket, a sleepy head. The moon is out, the stars are too, night night Ava, we love you."* (0 word errors, WER 0%)
- **Ava check:** 5 of 5 heard as /eɪv/, 0 wrong → pass. Phonemes: `eɪvɐeɪvbuːtsɑːntaɪtðəsʌnɪzʌpðəskaɪɪzbɹaɪtkɪkðəbɔːlændwɑːtʃɪtɹoʊlɔːlðəweɪɪntəðəɡoʊleɪvɐeɪvɐtaɪmfɚbɛdɐkoʊziblæŋkɪtɐsliːpihɛdðəmuːnɪzaʊtðəstɑːɹzɑːɹtuːnaɪtnaɪteɪvɐwiːlʌvjuː`
- **UTMOS22:** 4.47 (day 4.47, bedtime 4.47)
- **Calm metrics:** day 138.8 wpm, pitch spread 4.61 st, loudness range 19.2 dB, f0 207.4 Hz; bedtime 111.3 wpm, 3.6 st, 19.8 dB, f0 199.1 Hz; bedtime is -0.9 dB vs day
- **Line pauses:** couplet 1: found 0.53 s, kept, then 0.85 s gap; couplet 2: found 0.82 s, set to 0.70s, then 1.5 s gap; couplet 3: found 0.72 s, kept, then 1.06 s gap; couplet 4: found 0.61 s, kept, then 0 s gap
- **Loudness / file:** -18.03 LUFS, peak -1.15 dBFS, 27.34 s, 175 KB
- **Render time (CPU):** 437.4 s of Base generation for all verse takes, plus 130.9 s for the reference design, plus 15.2 s for the final assembly, mastering and checks (per-take checks not included).

### 3. Soft bedtime voice: `voice3-soft-bedtime.mp3` and `ref-3.mp3`

**Listen for:** the slowest, most hushed bedtime of the first three (86 wpm, pitch drops to about 183 Hz). This one is VoiceDesign, not a clone (see method), so listen for whether it sounds like the same woman across all four couplets.

- **Description (VoiceDesign `instruct`):** "A British woman in her thirties with a calm Received Pronunciation accent, speaking very softly and slightly breathily, quiet and intimate, as if reading beside a cot while a baby falls asleep. Hushed but clear, slow and soothing. British English female narrator reading a picture book aloud to a small child. She reads slowly, at a relaxed bedtime-story pace, letting each phrase breathe with soft pauses at the commas. Gentle and calm throughout, never shouty, never dramatic, no sudden changes in volume or pitch."
- **Reference clip:** take 2 of 3; 15.02 s, f0 median 218.4 Hz, pitch spread 2.71 st, loudness range 24.1 dB, 131.8 wpm, UTMOS 4.29. Whisper: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three. And then she gave a big, sleepy yawn."* (0 word errors). Design render 178.1 s for 3 takes.
  - Other takes (pitch spread / loudness range / word errors): 3.75 st / 22.4 dB / 0 err; 3.45 st / 25.0 dB / 0 err
- **Method:** design (fallback): Qwen3-TTS 1.7B VoiceDesign read the verse directly from the same description, lower sampling, because Base cloning failed the Ava check
- **Sampling:** day {"do_sample": true, "temperature": 0.5, "top_p": 0.8, "top_k": 50, "repetition_penalty": 1.05, "subtalker_temperature": 0.75, "subtalker_top_p": 0.9, "max_new_tokens": 220}; bedtime {"do_sample": true, "temperature": 0.45, "top_p": 0.8, "top_k": 50, "repetition_penalty": 1.05, "subtalker_temperature": 0.75, "subtalker_top_p": 0.9, "max_new_tokens": 220}
- **Takes per couplet:** [3, 3, 3, 3] (all takes and transcripts in `results.json`)
- **Whisper on the final MP3:** *"Ava, Ava, boots on tight, the sun is up, the sky is bright. Kick the ball and watch it roll all the way into the goal. Ava, Ava, time for bed. A cozy blanket, a sleepy head. The moon is out, the stars are too. Night, night, Ava, we love you."* (0 word errors, WER 0%)
- **Ava check:** 5 of 5 heard as /eɪv/, 0 wrong → pass. Phonemes: `eɪvɐeɪvɐbuːtsɑːntaɪtðəsʌnɪzʌpðəskaɪɪzbɹaɪtkɪkðəbɔːlændwɑːtʃɪtɹoʊlɔːlðəweɪɪntəðəɡoʊleɪvəeɪvtaɪmfɚbɛdɐkoʊziblæŋkɪdɐsliːpihɛdðəmuːnɪzaʊtðəstɑːɹzɑːɹtuːnaɪtnaɪteɪvəwiːlʌvjuː`
- **UTMOS22:** 4.04 (day 4.12, bedtime 4.18)
- **Calm metrics:** day 130.4 wpm, pitch spread 2.56 st, loudness range 18.5 dB, f0 219.7 Hz; bedtime 86.0 wpm, 3.3 st, 21.0 dB, f0 182.6 Hz; bedtime is -1.2 dB vs day
- **Line pauses:** couplet 1: found 0.36 s, set to 0.40s, then 0.82 s gap; couplet 2: found 0.32 s, set to 0.40s, then 1.5 s gap; couplet 3: found 1.31 s, set to 0.95s, then 1.05 s gap; couplet 4: found 0.92 s, kept, then 0 s gap
- **Loudness / file:** -18.06 LUFS, peak -1.16 dBFS, 32.1 s, 205 KB
- **Render time (CPU):** 320.5 s of VoiceDesign generation for all verse takes, plus 178.1 s for the reference design, plus 57.3 s for the final assembly, mastering and checks (per-take checks not included).
- **Clone attempt first:** Base cloning of `ref-3` rendered 20 takes (574 s). Couplets 1 and 3 failed the Ava check in all 7 takes each: the first Ava came out as /ɑːv/, /æv/ or /ʌv/ every time. So the whole verse was re-rendered with VoiceDesign (same description plus a short day or bedtime line, see `results.json`), as the brief allows.

### 4. Classic storyteller: `voice4-classic-storyteller.mp3` and `ref-4.mp3`

- **Description (VoiceDesign `instruct`):** "A British woman in her forties with a rich, warm, slightly lower voice, like a classic British audiobook narrator. Measured, reassuring and steady, with a smooth, even delivery. British English female narrator reading a picture book aloud to a small child. She reads slowly, at a relaxed bedtime-story pace, letting each phrase breathe with soft pauses at the commas. Gentle and calm throughout, never shouty, never dramatic, no sudden changes in volume or pitch."
- **Reference clip:** take 2 of 3; 14.42 s, f0 median 217.2 Hz, pitch spread 2.87 st, loudness range 23.9 dB, 137.3 wpm, UTMOS 4.532. Whisper: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three, and then she gave a big sleepy yawn."* (0 word errors). Design render 140.0 s for 3 takes.
  - Other takes (pitch spread / loudness range / word errors): 2.38 st / 23.1 dB / 0 err; 3.45 st / 23.9 dB / 0 err
- Verse not rendered yet.

### 5. Kind granny: `voice5-kind-granny.mp3` and `ref-5.mp3`

- **Description (VoiceDesign `instruct`):** "A kind British grandmother in her sixties with a gentle Home Counties accent. Warm, slightly husky, slow and loving, reading to her grandchild on her lap. Soft and steady. British English female narrator reading a picture book aloud to a small child. She reads slowly, at a relaxed bedtime-story pace, letting each phrase breathe with soft pauses at the commas. Gentle and calm throughout, never shouty, never dramatic, no sudden changes in volume or pitch."
- **Reference clip:** take 1 of 3; 16.26 s, f0 median 206.2 Hz, pitch spread 1.78 st, loudness range 22.0 dB, 121.8 wpm, UTMOS 4.457. Whisper: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three, and then she gave a big, sleepy yawn."* (0 word errors). Design render 153.0 s for 3 takes.
  - Other takes (pitch spread / loudness range / word errors): 2.11 st / 21.3 dB / 0 err; 4.97 st / 23.2 dB / 0 err
- Verse not rendered yet.

### 6. Soft Northern lilt: `voice6-soft-northern.mp3` and `ref-6.mp3`

- **Description (VoiceDesign `instruct`):** "A British woman in her thirties with a gentle Yorkshire accent from the north of England. Warm, friendly, calm and cosy, soft Northern vowels, relaxed and unhurried. British English female narrator reading a picture book aloud to a small child. She reads slowly, at a relaxed bedtime-story pace, letting each phrase breathe with soft pauses at the commas. Gentle and calm throughout, never shouty, never dramatic, no sudden changes in volume or pitch."
- **Reference clip:** take 1 of 3; 13.0 s, f0 median 249.5 Hz, pitch spread 2.99 st, loudness range 21.9 dB, 152.3 wpm, UTMOS 4.43. Whisper: *"Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars. One, two, three, and then she gave a big sleepy yawn."* (0 word errors). Design render 121.0 s for 3 takes.
  - Other takes (pitch spread / loudness range / word errors): 3.26 st / 25.0 dB / 0 err; 3.37 st / 22.1 dB / 0 err
- Verse not rendered yet.

## Licences

| Component | Code | Weights | Notes |
|---|---|---|---|
| Qwen3-TTS 1.7B VoiceDesign (`Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`) | Apache-2.0 (`qwen-tts` 0.1.1 package metadata) | Apache-2.0 (model card `license: apache-2.0`) | Designs the voice from text; no real speaker. No watermark. |
| Qwen3-TTS 1.7B Base (`Qwen/Qwen3-TTS-12Hz-1.7B-Base`) | Apache-2.0 (same package) | Apache-2.0 (model card `license: apache-2.0`) | Voice-clone model: only ever fed our own synthetic reference clips. |
| Qwen3-TTS tokenizer (bundled `speech_tokenizer`) | Apache-2.0 | Apache-2.0 | |
| Checks only: faster-whisper small.en | MIT | MIT | not part of the product |
| Checks only: facebook/wav2vec2-lv-60-espeak-cv-ft | Apache-2.0 | Apache-2.0 | |
| Checks only: prj-beatrice/utmos22-torch-native | MIT | MIT | UTMOS is a rough naturalness hint, not a judge of warmth or calm. |

Training data for Qwen3-TTS is not listed on the model cards (see the tech report, arXiv:2601.15621).

## Caveats

- **The first "Ava" of a couplet is the weak spot.** With Base cloning, the Ava at the very start of an input was often said as AH-vuh (/ɑːv/) or AV-uh (/æv/), while the second Ava was right. The phoneme check caught this, and failing takes were re-rendered; the kept takes all measure /eɪv/. For production, start each rendered chunk with a word before the name, or check every name automatically as done here.
- **Line breaks inside a couplet:** Whisper and the pause measurement show the models usually leave a real pause between the two lines; where it was over the limit it was trimmed to the limit, and where it was a short but real pause (0.12–0.40 s) it was lengthened to 0.40 s with a crossfade. Lines that flowed straight on were left alone.
- **Bedtime level:** −2.5 dB was applied before compression; after 2:1 compression and loudness matching the measured difference is about 1–2 dB.
- Whisper writes "cosy" as "cozy"; this is not counted as an error. Per-take logs in `results.json` recorded before this normalisation may show it as 1 word error.
- The "Kick the ball" couplet was fed with extra ellipses ("Kick the ball... and watch it roll... all the way... into the goal!") after the first attempt came out rushed (180–210 wpm). A pace gate (day ≤170 wpm, bedtime ≤140 wpm) was then added to the checks.

Everything (every take, transcript, phoneme string, metric and setting) is in `results.json`.
