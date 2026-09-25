STATUS: INTERIM

# Voice 6 polish (interim)

`voice6-polished-ava.mp3` is ready to listen to. The name versions (Olivia, Muhammad, Niamh) are still rendering; the full report follows with `STATUS: FINAL`.

Nobody has listened to this file. Every judgement here comes from measurements.

**Voice identity is locked, not redesigned.** The casting reference was reproduced exactly: VoiceDesign, same description, seed 600, batch 3, take 1. It matches `casting/ref-6.mp3` with a duration difference of −0.08%, a waveform correlation of 0.996 and ECAPA similarity 0.988. That clip is the anchor in `anchor/`.

| | casting `voice6-soft-northern.mp3` | `voice6-polished-ava.mp3` (interim) |
|---|---|---|
| Whisper word errors | 0 | 0 |
| Ava as /eɪvə/ (whole file, strict: v and following vowel) | 3 of 5 | 4 of 5 (every take passed 2/2 or 3/3 on its own) |
| Sentence breaks Whisper hears inside stanzas | 10 | 4 |
| UTMOS22 | 4.28 | 4.13 |
| Day median F0 / spread | 255.7 Hz / 2.99 st | 258.6 Hz / 2.36 st |
| Bedtime median F0 / spread | 274.0 Hz / 3.05 st | 241.3 Hz / 2.74 st |
| Bedtime vs day pitch | **+1.2 st (rose)** | **−1.2 st (settles lower)** |
| Bedtime vs day loudness | −1.8 LU | −2.1 LU |
| Pace, day / bedtime (wpm, including pauses) | 132 / 113 | **178 / 138 (faster; see below)** |
| Loudness / true peak | −18.1 LUFS / −0.8 dBTP | −18.0 LUFS / −1.9 dBTP |
| Room-tone floor | −63 dBFS | −64 dBFS |

**Known problem in the interim file:** whole-stanza renders flow better, but this voice speaks fast (about 200–220 wpm between pauses). The pause rules then cap the pauses, so the day stanza runs at 178 wpm against the 130 target. More takes and pace experiments are running.
