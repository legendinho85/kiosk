STATUS: INTERIM

# Teacher voice (casting voice 2): polished render

Interim push so the founder can listen early: `teacher-polished-ava.mp3`. Name tests (Olivia, Muhammad, Niamh), the optional sleepy anchor and the full write-up follow in the final push.

Nobody has listened to these files. Every judgement comes from measurements.

## What changed from casting voice2

- **Same voice, locked.** The casting reference was reproduced exactly: VoiceDesign, same description, seed 200, batch 3, take index 2, fp32 CPU. Waveform correlation with `casting/ref-2.mp3` is 0.997, ECAPA similarity 0.987, and speech length 13.69 s in both. It is saved in `anchor/` (wav, transcript, safetensors prompt, provenance JSON).
- **Whole stanza per call** (Base model, full ICL clone of the anchor), from a punctuation-only "TTS copy": no "!", comma after the name.
- **Automatic take choice:**
  - gates: exact words, Ava heard as /eɪvə/, ECAPA and UTMOS relative gates;
  - then the smallest distance from voice2's own measured band.
- **Pauses:** the model's own pauses are kept or lengthened (never cut inside speech), and there is one continuous room tone.
- **Mastering:** -18 LUFS, bedtime 2 LU quieter.

## Numbers (same measuring code for both files)

| File | Stanza | Pace wpm | Pitch spread st | F0 median Hz | Loudness range dB | UTMOS |
|---|---|---|---|---|---|---|
| casting voice2 | 138.8 | 4.64 | 206.8 | 18.4 | 4.497 |
| teacher-polished-ava | 155.1 | 3.01 | 208.0 | 17.1 | 4.404 |
| casting voice2 | 111.4 | 3.43 | 200.3 | 19.2 | 4.478 |
| teacher-polished-ava | 119.6 | 3.18 | 200.9 | 18.0 | 4.433 |

- **Polished file:**
  - 25.18 s, -18.01 LUFS, true peak -1.8700000047683716 dBTP, floor -64.7 dBFS;
  - bed vs day -1.88 LU; UTMOS 4.402;
  - Whisper 0 word errors; Ava /eɪvə/ 5/5; ECAPA vs anchor 0.8851.
- **Casting voice2:** UTMOS 4.466, ECAPA vs anchor 0.9048.

**Listen for:** whether the day stanza now sounds hurried. Whole-stanza reads come out about 12% quicker than the couplet renders (155 against 139 wpm) and a little less sing-song (3.0 against 4.6 st by day). Part of that drop is intended: casting reset its melody at each couplet (a 5.4 st jump into "Kick the ball"). Bedtime is close to voice2 in melody (3.2 against 3.4 st) and a little quicker (120 against 111 wpm). A punctuation variant aimed at pace is being tested for the final.
