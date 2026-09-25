STATUS: INTERIM

# Calmer Qwen3-TTS narrator: the same voice, less intensity

Goal: keep the naturalness of `../hf/qwen3tts-voicedesign.mp3` (Qwen3-TTS 1.7B VoiceDesign, Apache-2.0) and lose the "tiny bit chaotic, almost a bit intense" feel the founder heard.

Nobody here could listen, so "calm" is measured (pitch spread, loudness spread, rate, and line-to-line jumps). Every chunk was checked with Whisper and a phoneme recogniser before it was used.

## Files

- `qwen-calm-clone.mp3`: 45.88 s, 246.6 KB, -17.98 LUFS, peak -4.35 dBFS, UTMOS22 4.4

## Calm measurements next to the original

Every file is measured the same way, on the final MP3. The passage split is found automatically at the ~1.5 s gap. Values are **A / B**.

- **Pitch SD / pitch range**: the spread of F0 in semitones (Praat autocorrelation, 75–500 Hz; range is the 5th–95th percentile). Lower is steadier, but under ~1.5–2 st sounds robotic.
- **Loudness SD**: the standard deviation of RMS dB over 400 ms windows of speech (pauses excluded).
- **Line-to-line jumps**: the file is split into spoken lines at pauses. Each line gets a median pitch and an RMS level, and the jump is the absolute change between neighbouring lines. This is the "chaos" measure: drift in pitch or energy from one line to the next.
- **Rate**: words per minute over the whole passage, including pauses.

| File | Median F0 Hz | Pitch SD st | Pitch range st | Loudness SD dB | Line pitch jump st, A | Line level jump dB, A | wpm | LUFS | UTMOS22 |
|---|---|---|---|---|---|---|---|---|---|
| original `hf/qwen3tts-voicedesign.mp3` | 285 / 220 | 5.39 / 4.23 | 16.43 / 15.4 | 6.44 / 6.09 | 3.91 (max 12.44) | 2.09 (max 6.99) | 90.3 / 103.5 | -17.26 / -20.08 | 3.16 |
| **V1** `qwen-calm-clone.mp3` | 247 / 241 | 3.61 / 2.67 | 11.81 / 8.14 | 6.16 / 5.1 | 3.24 (max 6.67) | 1.02 (max 2.39) | 90.4 / 92.5 | -17.55 / -18.74 | 4.4 |

Original, Whisper on passage A: "Goal Ava! It's football day! Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is. Peep. Kick off. Pass, pass, pass. Tiffin to Ava. Thud. One more pass to Ava. Ready? Steady? Goal. Goal Ava. Goal, goal, goal."; passage B: "Home we go, boots off, lights low. Pawn hands side by side, what a big day, Neve. Night, night, Tiffin, night, night, Neve.". Names by phoneme: Ava /eɪv/ 5/5, Niamh /niːv/ 1/2.

## V1: `qwen-calm-clone.mp3`

Interim: V2 (per-chunk VoiceDesign, calmer) and V3 (softer clone) are still to come. The V1 take choice may be tightened, because chunk 2 ("Where is Ava's shirt? Here it is.") came out with a higher median pitch than the others.

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

**Mastering:** 2:1 above -24 dBFS, attack 30 ms, release 300 ms; -2 dB at 6.5 kHz; -18 LUFS; peak ≤ -1 dBFS. The result is -17.98 LUFS with a peak of -4.35 dBFS. The MP3 is 246.6 KB at 24000 Hz.

**Whisper small.en, passage A:** "Goal, Ava. It's football day. Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is. Peep. Kickoff. Pass, pass, pass. Tiffin to Ava. Thud. One more pass. To Ava. Ready, steady. Goal. Goal, Ava. Goal, goal, goal."

**Whisper small.en, passage B:** "Home we go. Boots off. Lights low. Paw in hand, side by side. What a big day, Neve. Night, night, Tiffin, night, night, Neve."

Word errors against the script, whole file: 0.015 [['delete', ['goal'], []]]. Whisper on the whole file sometimes merges repeated "goal"s; the per-passage transcripts above are the cleaner check.

**Names (wav2vec2 espeak phonemes, whole file):** Ava as /eɪv/ 5/5, /aɪv/ 0. Niamh (fed "Neeve") as /niːv/ 2/2.

**UTMOS22:** 4.4. **Duration:** 45.88 s. **Render time** (including the reference, all takes and all checks): 1010.6 s.

**Per-chunk choice:** the calmest take that passed. The calm score is pitch SD + 0.5 × loudness SD, plus penalties for a rate outside the band, for pitch SD under 1.8 st (monotone), and for drifting from the reference voice's pitch and level.

| Chunk | Takes | Passed | Chosen median F0 Hz | Pitch SD st | Loudness SD dB | wpm (speech only) | Heard |
|---|---|---|---|---|---|---|---|
| 0 | 3 | 3 | 256.2 | 4.51 | 4.15 | 110.7 | Goal, Ava. It's football day! |
| 1 | 3 | 3 | 233.0 | 3.64 | 5.3 | 133.0 | Tiffin has boots. Tiffin has a ball. |
| 2 | 3 | 1 | 353.9 | 3.25 | 2.82 | 130.4 | Where is Ava's shirt? Here it is! |
| 3 | 3 | 3 | 249.2 | 2.3 | 3.63 | 82.3 | Peep, kick off, pass, pass, pass. |
| 4 | 3 | 2 | 192.3 | 1.8 | 1.49 | 99.6 | Tiffin to Ava, Thud. |
| 5 | 3 | 3 | 263.3 | 2.6 | 5.59 | 112.5 | One more pass, to Ava, ready, steady. |
| 6 | 3 | 1 | 236.3 | 2.04 | 7.28 | 79.6 | Goal, goal, Ava, goal, goal, goal. |
| 7 | 3 | 3 | 214.8 | 2.6 | 5.12 | 96.0 | Home we go, boots off, lights low. |
| 8 | 3 | 3 | 230.0 | 1.65 | 3.55 | 138.3 | Paw in hand, side by side. |
| 9 | 3 | 3 | 236.9 | 2.6 | 1.81 | 156.3 | What a big day, Neve. |
| 10 | 3 | 3 | 277.4 | 2.55 | 2.8 | 86.5 | Night, night, Tiffin, night, night, Neve |

Full per-take data (every attempt, transcript, phonemes and metrics) is in `results.json`. Models, venv and caches were kept outside the repo (`/opt/qc`).
