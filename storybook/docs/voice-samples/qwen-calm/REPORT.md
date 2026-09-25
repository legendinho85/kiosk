STATUS: INTERIM

# Calmer Qwen3-TTS narrator: the same voice, less intensity

Goal: keep the naturalness of `../hf/qwen3tts-voicedesign.mp3` (Qwen3-TTS 1.7B VoiceDesign, Apache-2.0) and lose the "tiny bit chaotic, almost a bit intense" feel the founder heard.

Nobody here could listen, so "calm" is measured (pitch spread, loudness spread, rate, and line-to-line jumps). Every chunk was checked with Whisper and a phoneme recogniser before it was used.

## Files

- `qwen-calm-clone.mp3`: 45.9 s, 239.1 KB, -18.02 LUFS, peak -1.75 dBFS, UTMOS22 4.45
- `qwen-calm-design.mp3`: 50.63 s, 282.9 KB, -17.96 LUFS, peak -4.23 dBFS, UTMOS22 3.6
- `qwen-calm-clone-soft.mp3`: 43.9 s, 231.5 KB, -17.99 LUFS, peak -4.09 dBFS, UTMOS22 3.63

## Calm measurements next to the original

Every file is measured the same way, on the final MP3. The passage split is found automatically at the ~1.5 s gap. Values are **A / B**.

- **Pitch SD / pitch range**: the spread of F0 in semitones (Praat autocorrelation, 75–500 Hz; range is the 5th–95th percentile). Lower is steadier, but under ~1.5–2 st sounds robotic.
- **Loudness SD**: the standard deviation of RMS dB over 400 ms windows of speech (pauses excluded).
- **Line-to-line jumps**: the file is split into spoken lines at pauses. Each line gets a median pitch and an RMS level, and the jump is the absolute change between neighbouring lines. This is the "chaos" measure: drift in pitch or energy from one line to the next.
- **Rate**: words per minute over the whole passage, including pauses.

| File | Median F0 Hz | Pitch SD st | Pitch range st | Loudness SD dB | Line pitch jump st, A | Line level jump dB, A | wpm | LUFS | UTMOS22 |
|---|---|---|---|---|---|---|---|---|---|
| original `hf/qwen3tts-voicedesign.mp3` | 285 / 220 | 5.39 / 4.23 | 16.43 / 15.4 | 6.44 / 6.09 | 3.91 (max 12.44) | 2.09 (max 6.99) | 90.3 / 103.5 | -17.26 / -20.08 | 3.16 |
| **V1** `qwen-calm-clone.mp3` | 252 / 227 | 3.59 / 2.5 | 12.05 / 7.8 | 6.02 / 5.86 | 3.17 (max 6.53) | 1.54 (max 3.26) | 90.6 / 92.2 | -17.27 / -19.77 | 4.45 |
| **V2** `qwen-calm-design.mp3` | 214 / 224 | 3.56 / 2.83 | 11.73 / 9.54 | 5.53 / 5.95 | 3.63 (max 9.22) | 1.7 (max 5.07) | 77.0 / 93.0 | -17.6 / -18.77 | 3.6 |
| **V3** `qwen-calm-clone-soft.mp3` | 240 / 222 | 3.37 / 2.45 | 10.6 / 8.0 | 6.24 / 3.4 | 2.9 (max 6.05) | 1.33 (max 5.26) | 101.9 / 86.4 | -17.39 / -19.13 | 3.63 |

Original, Whisper on passage A: "Goal Ava! It's football day! Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is. Peep. Kick off. Pass, pass, pass. Tiffin to Ava. Thud. One more pass to Ava. Ready? Steady? Goal. Goal Ava. Goal, goal, goal."; passage B: "Home we go, boots off, lights low. Pawn hands side by side, what a big day, Neve. Night, night, Tiffin, night, night, Neve.". Names by phoneme: Ava /eɪv/ 5/5, Niamh /niːv/ 1/2.

## V1: `qwen-calm-clone.mp3`

This is the second V1 render, with the pitch gate and per-chunk levelling. One more pass is queued: chunk 2 ("Where is Ava's shirt? Here it is.") still sits about 6 st above the voice's reference pitch, because every other take of it failed Whisper (heard as "Eva's"). A targeted re-roll of that chunk will run after V3.

**Workflow:** design once, then clone. VoiceDesign (`Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`) made one reference clip from the calm description. `Qwen/Qwen3-TTS-12Hz-1.7B-Base` then cloned it (ICL mode: reference audio plus its transcript) for every chunk, so the whole script uses one voice.

**Reference description:** "A gentle, warm British woman in her early thirties with a soft Southern English accent. She reads quietly and calmly to a sleepy toddler: soft, low-energy, slow and steady, with an even volume and a warm smile in her voice. No dramatic emphasis, no shouting, no sudden changes; soft endings to phrases."

**Reference text (not in the script):** "Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars before bed. One, two, three... and then she yawned a big, sleepy yawn."

**Reference sampling:** {'temperature': 0.6, 'top_p': 0.85, 'top_k': 50, 'repetition_penalty': 1.05}, seed 1234. It made 4 takes, all checked by Whisper. It kept take 0, the lowest calm score among the takes that passed:

| Take | Whisper OK | Duration s | wpm | Median F0 Hz | Pitch SD st | Loudness SD dB | Calm score |
|---|---|---|---|---|---|---|---|
| 0 (chosen) | True | 15.38 | 136.5 | 252.1 | 2.56 | 4.71 | 4.915 |
| 1 | True | 14.14 | 148.5 | 198.6 | 1.78 | 5.95 | 5.705 |
| 2 | True | 15.13 | 138.8 | 228.5 | 2.29 | 6.55 | 5.565 |
| 3 | True | 17.17 | 122.3 | 176.7 | 1.96 | 7.04 | 5.48 |

**Sampling (talker):** {'temperature': 0.6, 'top_p': 0.85, 'top_k': 50, 'repetition_penalty': 1.05}. Sub-talker (acoustic codebooks): model defaults (temperature 0.9, top_p 1.0, top_k 50). 3 takes per chunk, rendered as one batch, with a new batch if none passed. float32 on CPU, 4 threads.

**Text fed, one chunk per line.** The words heard are unchanged; only punctuation differs from the script:

```
Goal, Ava! It's football day.
Tiffin has boots. Tiffin has a ball.
Where is Ava's shirt? Here it is.
Peep. Kick-off. Pass, pass, pass.
Tiffin to Ava... thud.
One more pass... to Ava. Ready... steady...
Goal... Goal, Ava! Goal, goal, goal.
Home we go. Boots off. Lights low.
Paw in hand, side by side.
What a big day, Neeve.
Night night, Tiffin. Night night, Neeve.
```

**Assembly:** each chunk is trimmed and levelled to the same active RMS. Passage B is set about 4.5 dB lower before mastering. Gaps between chunks in seconds: [0.55, 0.7, 0.5, 0.45, 0.6, 0.4, 1.5, 0.75, 0.6, 0.85].

**Mastering:** 2:1 above -24 dBFS, attack 30 ms, release 300 ms; -2 dB at 6.5 kHz; -18 LUFS; peak ≤ -1 dBFS. The result is -18.02 LUFS with a peak of -1.75 dBFS. The MP3 is 239.1 KB at 24000 Hz.

**Whisper small.en, passage A:** "Goal, Ava. It's football day. Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is. Peep. Kickoff. Pass, pass, pass. Tiffin to Ava. Thud. One more pass. To Ava. Ready, steady. Goal. Goal, Ava. Goal, goal, goal."

**Whisper small.en, passage B:** "Home we go. Boots off. Lights low. Paw in hand, side by side. What a big day, Neve. Night, night. Tiffin. Night, night. Neve."

Word errors against the script, whole file: 0.015 [['delete', ['goal'], []]]. Whisper on the whole file sometimes merges repeated "goal"s; the per-passage transcripts above are the cleaner check.

**Names (wav2vec2 espeak phonemes, whole file):** Ava as /eɪv/ 5/5, /aɪv/ 0. Niamh (fed "Neeve") as /niːv/ 2/2.

**UTMOS22:** 4.45. **Duration:** 45.9 s. **Render time** (including the reference, all takes and all checks): 879.5 s.

**Per-chunk choice:** the calmest take that passed. The calm score is pitch SD + 0.5 × loudness SD, plus penalties for a rate outside the band, for pitch SD under 1.8 st (monotone), and for drifting from the reference voice's pitch and level.

| Chunk | Takes | Passed | Chosen median F0 Hz | Pitch SD st | Loudness SD dB | wpm (speech only) | Heard |
|---|---|---|---|---|---|---|---|
| 0 | 3 | 3 | 256.2 | 4.51 | 4.15 | 110.7 | Goal, Ava. It's football day! |
| 1 | 3 | 3 | 233.0 | 3.64 | 5.3 | 133.0 | Tiffin has boots. Tiffin has a ball. |
| 2 | 6 | 1 | 353.9 | 3.25 | 2.82 | 130.4 | Where is Ava's shirt? Here it is! |
| 3 | 3 | 3 | 249.2 | 2.3 | 3.63 | 82.3 | Peep, kick off, pass, pass, pass. |
| 4 | 3 | 2 | 258.3 | 4.49 | 5.17 | 100.4 | Tiffin to Ava, Thud. |
| 5 | 3 | 3 | 263.3 | 2.6 | 5.59 | 112.5 | One more pass, to Ava, ready, steady. |
| 6 | 3 | 1 | 236.3 | 2.04 | 7.28 | 79.6 | Goal, goal, Ava, goal, goal, goal. |
| 7 | 3 | 3 | 214.8 | 2.6 | 5.12 | 96.0 | Home we go, boots off, lights low. |
| 8 | 3 | 3 | 230.0 | 1.65 | 3.55 | 138.3 | Paw in hand, side by side. |
| 9 | 3 | 3 | 236.9 | 2.6 | 1.81 | 156.3 | What a big day, Neve. |
| 10 | 3 | 3 | 226.5 | 2.79 | 3.07 | 85.7 | night night tiffin night night neave |

## V2: `qwen-calm-design.mp3`

Chunk 0 set the pitch anchor (the median F0 of its chosen take). Later chunks had to stay within 3 st of it (B aims 1 st lower) or be re-rolled; after 2 rounds any take that passed Whisper was allowed. Because each chunk is designed afresh from the description, takes of the same line varied from about 170 to 380 Hz median F0. The gate and the take selection keep that in check, but cannot remove it the way cloning does.

**Workflow:** VoiceDesign per chunk, like the original, with calmer instructions and lower sampling.

**Description, passage A:** "A gentle, warm British woman in her early thirties with a soft Southern English accent. She reads quietly and calmly to a sleepy toddler: soft, low-energy, slow and steady, with an even volume and a warm smile in her voice. No dramatic emphasis, no shouting, no sudden changes; soft endings to phrases."

**Description, passage B:** "A gentle, warm British woman in her early thirties with a soft Southern English accent. She is winding down a bedtime story for a toddler who is falling asleep: very soft, hushed and sleepy, slower than before, low and even in volume, with a warm smile in her voice and long, gentle pauses. No emphasis, no sudden changes; soft, fading endings to phrases."

**Sampling (talker):** {'temperature': 0.5, 'top_p': 0.8, 'top_k': 50, 'repetition_penalty': 1.05}. Sub-talker (acoustic codebooks): model defaults (temperature 0.9, top_p 1.0, top_k 50). 3 takes per chunk, rendered as one batch, with a new batch if none passed. float32 on CPU, 4 threads.

**Text fed, one chunk per line.** The words heard are unchanged; only punctuation differs from the script:

```
Goal, Ava! It's football day.
Tiffin has boots. Tiffin has a ball.
Where is Ava's shirt? Here it is.
Peep. Kick-off. Pass, pass, pass.
Tiffin to Ava... thud.
One more pass... to Ava. Ready... steady...
Goal... Goal, Ava! Goal, goal, goal.
Home we go. Boots off. Lights low.
Paw in hand, side by side.
What a big day, Neeve.
Night night, Tiffin. Night night, Neeve.
```

**Assembly:** each chunk is trimmed and levelled to the same active RMS. Passage B is set about 4.5 dB lower before mastering. Gaps between chunks in seconds: [0.55, 0.7, 0.5, 0.45, 0.6, 0.4, 1.5, 0.75, 0.6, 0.85].

**Mastering:** 2:1 above -24 dBFS, attack 30 ms, release 300 ms; -2 dB at 6.5 kHz; -18 LUFS; peak ≤ -1 dBFS. The result is -17.96 LUFS with a peak of -4.23 dBFS. The MP3 is 282.9 KB at 24000 Hz.

**Whisper small.en, passage A:** "Goal Ava, it's football day. Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is. Peep. Kick off. Pass, pass, pass. Tiffin to Ava. Thud. One more pass. To Ava. Ready? Steady. Goal. Goal Ava. Goal, goal, goal"

**Whisper small.en, passage B:** "Home we go, boots off, lights low, paw in hand, side by side. What a big day, Neve. Night night, Tiffin. Night night, Neve."

Word errors against the script, whole file: 0.0 . Whisper on the whole file sometimes merges repeated "goal"s; the per-passage transcripts above are the cleaner check.

**Names (wav2vec2 espeak phonemes, whole file):** Ava as /eɪv/ 5/5, /aɪv/ 0. Niamh (fed "Neeve") as /niːv/ 2/2.

**UTMOS22:** 3.6. **Duration:** 50.63 s. **Render time** (including the reference, all takes and all checks): 1033.9 s.

**Per-chunk choice:** the calmest take that passed. The calm score is pitch SD + 0.5 × loudness SD, plus penalties for a rate outside the band, for pitch SD under 1.8 st (monotone), and for drifting from the reference voice's pitch and level.

| Chunk | Takes | Passed | Chosen median F0 Hz | Pitch SD st | Loudness SD dB | wpm (speech only) | Heard |
|---|---|---|---|---|---|---|---|
| 0 | 3 | 2 | 293.0 | 3.69 | 4.18 | 101.9 | Goal Ava, it's football day. |
| 1 | 3 | 2 | 254.5 | 3.56 | 8.53 | 133.0 | Tiffin has boots. Tiffin has a ball. |
| 2 | 6 | 4 | 226.3 | 2.1 | 4.24 | 133.0 | Where is Ava's shirt? Here it is. |
| 3 | 6 | 4 | 228.5 | 3.15 | 3.67 | 74.0 | Peep, kick off, pass, pass, pass. |
| 4 | 6 | 1 | 222.4 | 2.47 | 10.83 | 87.2 | Tiffin to Ava Thud |
| 5 | 6 | 4 | 190.9 | 2.34 | 7.1 | 67.9 | One more pass to Ava. Ready? Steady. |
| 6 | 6 | 1 | 181.9 | 2.88 | 5.2 | 59.8 | Goal, goal Ava, goal, goal, goal. |
| 7 | 6 | 6 | 186.2 | 2.24 | 5.27 | 94.7 | Home we go, boots off, lights low. |
| 8 | 3 | 1 | 246.3 | 2.69 | 3.85 | 110.3 | Paw in hand, side by side. |
| 9 | 3 | 3 | 237.0 | 2.0 | 1.58 | 180.3 | What a big day, Neve. |
| 10 | 6 | 5 | 236.9 | 1.99 | 6.19 | 100.4 | Night night, Tiffin. Night night, Neve. |

## V3: `qwen-calm-clone-soft.mp3`

**Workflow:** design once, then clone. VoiceDesign (`Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`) made one reference clip from the calm description. `Qwen/Qwen3-TTS-12Hz-1.7B-Base` then cloned it (ICL mode: reference audio plus its transcript) for every chunk, so the whole script uses one voice.

**Reference description:** "A gentle, warm British woman in her early thirties with a soft Southern English accent. She reads quietly and calmly to a sleepy toddler: soft, low-energy, slow and steady, with an even volume and a warm smile in her voice. No dramatic emphasis, no shouting, no sudden changes; soft endings to phrases."

**Reference text (not in the script):** "Once upon a time, in a little house by the park, there lived a small rabbit who loved to count the stars before bed. One, two, three... and then she yawned a big, sleepy yawn."

**Reference sampling:** {'temperature': 0.6, 'top_p': 0.85, 'top_k': 50, 'repetition_penalty': 1.05}, seed 1234. It made 4 takes, all checked by Whisper. It kept take 0, the lowest calm score among the takes that passed:

| Take | Whisper OK | Duration s | wpm | Median F0 Hz | Pitch SD st | Loudness SD dB | Calm score |
|---|---|---|---|---|---|---|---|
| 0 (chosen) | True | 15.38 | 136.5 | 252.1 | 2.56 | 4.71 | 4.915 |
| 1 | True | 14.14 | 148.5 | 198.6 | 1.78 | 5.95 | 5.705 |
| 2 | True | 15.13 | 138.8 | 228.5 | 2.29 | 6.55 | 5.565 |
| 3 | True | 17.17 | 122.3 | 176.7 | 1.96 | 7.04 | 5.48 |

**Sampling (talker):** {'temperature': 0.6, 'top_p': 0.85, 'top_k': 50, 'repetition_penalty': 1.05}. Sub-talker (acoustic codebooks): model defaults (temperature 0.9, top_p 1.0, top_k 50). 3 takes per chunk, rendered as one batch, with a new batch if none passed. float32 on CPU, 4 threads.

**Text fed, one chunk per line.** The words heard are unchanged; only punctuation differs from the script:

```
Goal, Ava! It's football day.
Tiffin has boots. Tiffin has a ball.
Where is Ava's shirt? Here it is.
Peep. Kick-off. Pass, pass, pass.
Tiffin to Ava... thud.
One more pass, to Ava. Ready, steady.
Goal. Goal, Ava. Goal, goal, goal.
Home we go... Boots off... Lights low.
Paw in hand... side by side.
What a big day, Neeve.
Night night, Tiffin... Night night, Neeve.
```

**Assembly:** each chunk is trimmed and levelled to the same active RMS. Passage B is set about 4.5 dB lower before mastering, and time-stretched ×1.11 longer with Rubber Band (pedalboard). Gaps between chunks in seconds: [0.55, 0.7, 0.5, 0.45, 0.6, 0.4, 1.5, 0.75, 0.6, 0.85], B gaps ×1.15.

**Mastering:** 2:1 above -24 dBFS, attack 30 ms, release 300 ms; -2 dB at 6.5 kHz; -18 LUFS; peak ≤ -1 dBFS. The result is -17.99 LUFS with a peak of -4.09 dBFS. The MP3 is 231.5 KB at 24000 Hz.

**Whisper small.en, passage A:** "Goal, Ava, it's football day. Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is. Peep, kick off, pass, pass, pass. Tiffin to Ava. Thud. One more pass to Ava. Ready, steady. Goal, goal, Ava. Goal, goal, goal."

**Whisper small.en, passage B:** "Home we go, boots off, lights low, paw in hand, side by side. What a big day, Neve. Night, night, Tiffin. Night, night, Neve."

Word errors against the script, whole file: 0.0 . Whisper on the whole file sometimes merges repeated "goal"s; the per-passage transcripts above are the cleaner check.

**Names (wav2vec2 espeak phonemes, whole file):** Ava as /eɪv/ 5/5, /aɪv/ 0. Niamh (fed "Neeve") as /niːv/ 1/2.

**UTMOS22:** 3.63. **Duration:** 43.9 s. **Render time** (including the reference, all takes and all checks): 914.4 s.

**Per-chunk choice:** the calmest take that passed. The calm score is pitch SD + 0.5 × loudness SD, plus penalties for a rate outside the band, for pitch SD under 1.8 st (monotone), and for drifting from the reference voice's pitch and level.

| Chunk | Takes | Passed | Chosen median F0 Hz | Pitch SD st | Loudness SD dB | wpm (speech only) | Heard |
|---|---|---|---|---|---|---|---|
| 0 | 3 | 2 | 238.5 | 3.51 | 6.27 | 115.3 | Goal, Ava. It's football day. |
| 1 | 3 | 3 | 272.2 | 4.23 | 3.02 | 150.3 | Tiffin has boots. Tiffin has a ball. |
| 2 | 3 | 3 | 261.1 | 2.99 | 5.1 | 146.9 | Where is Ava's shirt? Here it is! |
| 3 | 3 | 3 | 264.1 | 3.17 | 1.94 | 95.9 | Peep, kick off, pass, pass, pass. |
| 4 | 9 | 2 | 202.3 | 2.24 | 4.28 | 114.8 | Tiffin to Ava. Thud. |
| 5 | 3 | 3 | 236.7 | 2.67 | 4.85 | 120.0 | One more pass to Ava. Ready, steady. |
| 6 | 3 | 3 | 222.5 | 3.04 | 2.21 | 108.2 | Goal, goal, Ava. Goal, goal, goal. |
| 7 | 3 | 3 | 230.1 | 2.27 | 2.56 | 106.4 | Home we go boots off lights low |
| 8 | 3 | 3 | 204.7 | 2.03 | 1.87 | 124.3 | Paw in hand, side by side. |
| 9 | 3 | 3 | 228.4 | 3.11 | 3.25 | 145.0 | What a big day, Neve! |
| 10 | 3 | 2 | 223.5 | 2.07 | 2.87 | 102.3 | Night, night, Tiffin. Night, night, Neve. |

Full per-take data (every attempt, transcript, phonemes and metrics) is in `results.json`. Models, venv and caches were kept outside the repo (`/opt/qc`).
