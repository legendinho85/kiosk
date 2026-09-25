STATUS: FINAL

# Hugging Face TTS voice samples: gentle British female storyteller

Run date: 2026-09-25, about 12:02–13:55 UTC. Machine: 4 CPU cores, 15 GB RAM, no GPU. PyTorch 2.14 from PyPI, 4 threads.

Nobody listened to these samples. Every judgement below comes from measurements: Whisper transcripts, phoneme recognition for the names, UTMOS22, loudness and pace. Please listen before deciding.

## TL;DR

| Rank | File | Model | Voice | Word errors* | Ava /eɪv/ | Niamh /niːv/ | UTMOS22 (all / A / B) | CPU render |
|---|---|---|---|---|---|---|---|---|
| 1 | `chatterbox-designedref.mp3` | Chatterbox (original, MIT) | synthetic reference (Qwen-designed voice) | **0** | 5/5 | 2/2 | **4.04** / 4.05 / 3.97 | 7 min |
| 2 | `chatterbox-turbo-designedref.mp3` | Chatterbox Turbo (MIT) | synthetic reference (same) | 1 ("Paw in" heard as "Pawn") | 5/5 | 2/2 | 3.94 / 3.93 / **4.29** | **4 min** |
| 3 | `qwen3tts-voicedesign-slowB.mp3` | Qwen3-TTS 1.7B VoiceDesign (Apache-2.0) | **designed from text**, no reference | 1 ("lights low" heard as "light slow", same sounds) | 5/5 | 2/2 | 3.40 / 3.68 / 3.70 | 12 min |
| 4 | `qwen3tts-voicedesign.mp3` | Qwen3-TTS 1.7B VoiceDesign | designed from text | 1–2 ("Paw in hand" heard as "Pawn hand(s)") | 5/5 | 2/2 by Whisper; last /v/ very soft | 3.17 / 3.23 / 3.94 | 9 min |
| 5 | `voxcpm2-voicedesign.mp3` | VoxCPM2 2B (Apache-2.0) | designed from text | 1 ("Paw" heard as "All") | 5/5 | 2/2 | 2.42 / 3.28 / **2.21** | 14 min |
| 6 | `pocket-tts-anna.mp3` | Kyutai Pocket TTS (CC-BY-4.0) | preset "anna" = **real VCTK speaker** p228 | 1 (one "pass" dropped) | unreliable (see below) | 2/2 | 4.11 / 4.32 / 4.08 | **2 min** |

\*Word errors are counted by Whisper small.en on the final MP3, against the script, with Ava/Niamh spellings normalised. CPU render time is for the whole sample, including automatic re-takes and checks. With a GPU every model would be many times faster.

**Recommendation:** Use the **designed voice from Qwen3-TTS VoiceDesign** as the brand voice. It is a brand-new synthetic voice described in words, so there is no real person behind it. Then **render it through Chatterbox** (or Chatterbox Turbo for speed), using a short clip of that designed voice as the reference. That combination scored best on every measure: 0 word errors, both names right, the highest UTMOS for a synthetic voice, and MIT/Apache licences throughout. Pure Qwen3-TTS (rank 3) is the fallback if we want a single model with no cloning step. It is also the only option here where passage B came out clearly slower and softer.

## Key finding: how to spell the names

A phoneme recogniser (wav2vec2 espeak) checked how each model actually said the names:

- **Do not respell Ava as "Ayva".** Qwen3-TTS read "Ayva" as "EYE-vuh" (/aɪv/) in 3 of 3 tries, and Chatterbox did the same in 5 of 9. "Ay-vuh" and "Ayvah" were also read as /aɪv/. **Plain "Ava" gave the correct AY-vuh (/eɪv/) every time** in Qwen3-TTS, Chatterbox, Chatterbox Turbo and VoxCPM2. So those samples feed plain "Ava", and the heard word is unchanged.
- Pocket TTS is the exception. It says plain "Ava" as "AV-uh" or "AH-vuh", and every "Ay…" respelling as "EYE-vuh". "A-va" was its best spelling, but it was inconsistent: 2 of the 4 chunks with Ava failed the checks even after 5 re-takes. It is not safe for personalised names without per-name tuning.
- **Niamh fed as "Neeve"** came out as /niːv/ in every model.
- NeuTTS Air (not run, see below) has real phoneme input. Its espeak front end would say Ava as /ˈɑːvə/ and Niamh as /naɪəm/, both wrong. That would need a phoneme override (/ˈeɪvə/, /nˈiːv/), which is easy to do in that model.

## How every sample was made

- **Script:** Passage A, then about 1.5 s of silence, then Passage B, exactly as given. The texts were fed in 4 chunks for A and 3 for B (a few sentences each, not line by line).
- **Gaps between chunks:** A 0.6 / 0.5 / 0.65 s. B 0.7 / 0.85 s (0.9 / 1.1 s for slowB; 0.8 / 0.95 s for Pocket). Passage B was also turned down by 0.85× (−1.4 dB).
- **Per-chunk quality gate:** each chunk was transcribed with Whisper and phoneme-checked for the names. A chunk that failed was re-rendered (up to 3 times; VoxCPM2 up to 2, Pocket up to 5), and the best take was kept. Every attempt and its transcript is in `results.json`.
- **Mastering:** DC removal, a −2 dB high shelf at 6.5 kHz, −18 LUFS integrated, and a look-ahead limiter at −1 dBFS (−1.5 dBFS for the two files where MP3 encoding overshot). 0.25 s lead-in and 0.6 s tail. All final peaks are between −1.03 and −1.88 dBFS, and loudness is −17.9 to −18.1 LUFS. MP3 is mono: 24 kHz, or 48 kHz for VoxCPM2. Files are 200–410 KB.

Text fed for passage A (all except Pocket):
```
Goal, Ava! It's football day!
Tiffin has boots. Tiffin has a ball. Where is Ava's shirt? Here it is!
Peep! Kick-off! Pass, pass, pass! Tiffin to Ava... thud!
One more pass... to Ava! Ready... steady... Goal! Goal, Ava! Goal, goal, goal!
```
Text fed for passage B (all except slowB):
```
Home we go. Boots off. Lights low.
Paw in hand, side by side. What a big day, Neeve.
Night night, Tiffin. Night night, Neeve.
```
slowB passage B: `Home we go... Boots off... Lights low.` / `Paw in hand... side by side. What a big day, Neeve.` / `Night night, Tiffin... Night night, Neeve.`
Pocket passage A: the same as above with "A-va" in place of "Ava".

Voice description (Qwen3-TTS `instruct`; VoxCPM2 in brackets before the text):
> A gentle, warm British woman in her early thirties with a soft Southern English accent, reading a bedtime picture book to a toddler: calm, kind, smiling, unhurried, with natural pauses and soft endings to phrases.

Qwen added for A: *"She sounds quietly delighted and playful for the football game, but never loud or shouty; her excitement is soft and smiling."* Qwen added for B: *"Now she is winding down for sleep: much slower and softer, hushed and sleepy, almost whispering, with long gentle pauses."* VoxCPM2 added *"; quietly delighted and playful, never loud"* for A and *"; now slower, hushed and sleepy, almost whispering"* for B.

**Synthetic reference clip for Chatterbox:** 11.05 s generated by Qwen3-TTS VoiceDesign with the description above (seed 7), saying: *"Once upon a time, in a little house at the end of the lane, there lived a sleepy puppy called Tiffin. Every evening, when the sun went down, Tiffin curled up by the fire."* No real person's voice was cloned anywhere in this run.

## Per sample

### 1. `chatterbox-designedref.mp3`: Chatterbox (original 0.5B) cloning the designed voice
- Settings: A: exaggeration 0.45, cfg_weight 0.45, temperature 0.7. B: exaggeration 0.3, cfg_weight 0.3, temperature 0.6. Seed 42. Conditionals were re-prepared for B with the lower exaggeration.
- Render: 416 s CPU for 34.6 s of audio, 9 takes (1 chunk needed 3). Output 24 kHz.
- Whisper: *"Goal, Ava, it's football day. Tiffin has boots, Tiffin has a ball. Where is Ava's shirt? Here it is. Peep, kick off, pass, pass, pass. Tiffin to Ava, thud. One more pass to Ava. Ready, steady, goal, goal, Ava, goal, goal, goal. Home we go. Boots off, lights low. Paw in hand, side by side. What a big day, Neve. Night night, Tiffin. Night night, Neve."* **0 word errors.**
- Names: Ava /eɪv/ 5/5; Niamh /niːv/ 2/2 (Whisper writes "Neve").
- UTMOS22: 4.04 (A 4.05, B 3.97).
- Pace and level: A 128 words/min, B 119; B is 2 dB quieter. Pauses: A 0.2–0.9 s, B 0.4–1.1 s. This is the brisker, tighter read of the set; B is only slightly slower.

### 2. `chatterbox-turbo-designedref.mp3`: Chatterbox Turbo cloning the designed voice
- Settings: A: temperature 0.7, top_p 0.95, repetition_penalty 1.2. B: temperature 0.6. Turbo ignores exaggeration and cfg. Seed 42.
- Render: 241 s CPU for 38.9 s of audio (the fastest of the good ones), 9 takes. Output 24 kHz.
- Whisper: the same as the script, except *"Pawn hand"* for "Paw in hand". The per-chunk check heard "Paw in hand" correctly, so this is a soft "in". 1 error (WER 3%).
- Names: Ava 5/5, Niamh 2/2. UTMOS22 3.94 (A 3.93, **B 4.29**, the best B score).
- Pace: A 106 wpm, B 117 wpm; B is 1.2 dB quieter. B is **not** slower. If Turbo is chosen, slow B with longer gaps or ellipses, as in slowB.

### 3. `qwen3tts-voicedesign-slowB.mp3`: Qwen3-TTS VoiceDesign, B with ellipses and longer gaps
- Settings: do_sample, temperature 0.7, top_p 0.9, top_k 50, repetition_penalty 1.05. Seed 42, fp32. B fed with "..." between phrases.
- Render: 703 s CPU for 47.2 s of audio, 12 takes (4 chunks needed 2–3). Output 24 kHz.
- Whisper: all correct, except "lights low" was written as "light slow" (the same sounds). Effectively 0 errors.
- Names: Ava 5/5, Niamh 2/2. UTMOS22 3.40 (A 3.68, B 3.70).
- Pace: **A 96 wpm, B 80 wpm, B 2.5 dB quieter.** This is the only sample where B is clearly slower and softer, as asked. B pauses are long (0.8–1.5 s), which feels sleepy but may be a little too long.

### 4. `qwen3tts-voicedesign.mp3`: Qwen3-TTS VoiceDesign, plain B
- Settings: the same as slowB, with plain B text and B gaps of 0.7 / 0.85 s. Render: 521 s CPU for 44.3 s of audio, 12 takes.
- Whisper: *"Pawn hands side by side"* for "Paw in hand, side by side" (2 word errors; the per-chunk check had passed "Paw in hand"). Everything else correct.
- Names: Ava 5/5. Niamh: Whisper hears "Neve" 2/2; the phoneme model finds the final /v/ of the last "Niamh" very soft. UTMOS22 3.17 (A 3.23, B 3.94).
- Pace: A 91 wpm, **B 104 wpm (faster than A)**; B 2.4 dB quieter. That is why slowB was made.
- An earlier Qwen run (seed 1234, "Ayva" spelling) is not included: 2 of its 5 Avas came out as "Iva", which led to the spelling finding.

### 5. `voxcpm2-voicedesign.mp3`: VoxCPM2 voice design
- Settings: cfg_value 2.0, inference_timesteps 10, fp32 (bf16 was 2× slower on CPU), seed 42. Description in brackets before each chunk.
- Render: 837 s CPU for 47.4 s of audio, 11 takes. Output **48 kHz**.
- Whisper: one error, *"All in hand"* for "Paw in hand". The chunk also failed twice in the per-chunk check (heard as "Pull in hand").
- Names: Ava 5/5, Niamh 2/2.
- UTMOS22: **2.42 overall; A 3.28, B 2.21.** The "almost whispering" B scored very low. This suggests VoxCPM2's whispery style is breathy or unnatural here; it also has the most 2–4 kHz energy of the set. The A passage is reasonable.
- Pace: A 96 wpm, B 78 wpm, B 4.2 dB quieter. It is the slowest model on CPU.

### 6. `pocket-tts-anna.mp3`: Kyutai Pocket TTS, preset voice "anna"
- Model: `kyutai/pocket-tts-without-voice-cloning`, english_2026-09. Voice "anna" = VCTK speaker p228 (female, Southern England), CC-BY-4.0. **This is a real, consenting corpus speaker, not a synthetic voice.**
- Settings: temp 0.45 for A, 0.3 for B (the default is 0.3). Seed 42. Ava fed as "A-va".
- Render: 120 s CPU for 39.5 s of audio, which is about real time including checks. The model alone is faster than real time. 20 takes.
- Whisper: one "pass" dropped ("pass, pass" instead of three). UTMOS22 **4.11** (A 4.32, B 4.08), the highest of the set.
- Names: the final file measures Ava /eɪv/ 5/5 and Niamh 2/2. But during rendering, 2 of the 4 Ava chunks never passed after 5 tries (heard as "Eva" or "a vah"). **The name handling is not reliable enough for personalisation.** It is also a real person's voice, and the brief prefers a synthetic one. It is ranked last despite its good MOS and speed.

## Licences

| Model | Code | Weights | Training data (per card) | Commercial-use notes |
|---|---|---|---|---|
| [Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) | Apache-2.0 (`qwen-tts` 0.1.1) | Apache-2.0 | Not stated on the card (tech report arXiv:2601.15621) | OK. No watermark. Voice designed from text, so no real speaker. |
| [ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox) | MIT (`chatterbox-tts` 0.1.7) | MIT | "0.5M hours of cleaned data", sources not listed | OK. All output carries an imperceptible **PerTh watermark** (`resemble-perth`, MIT). It is a cloning model: only feed it synthetic or consented references. |
| [ResembleAI/chatterbox-turbo](https://huggingface.co/ResembleAI/chatterbox-turbo) | MIT (same package) | MIT | Not stated | Same as above. |
| [openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2) | Apache-2.0 (`voxcpm` 2.0.3) | Apache-2.0 ("free for commercial use") | "2M+ hours multilingual speech", sources not listed | OK. |
| [kyutai/pocket-tts-without-voice-cloning](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning) | MIT (`pocket-tts` 3.3.0) | CC-BY-4.0 | Not detailed. The voice "anna" is VCTK p228, CC-BY-4.0 ([kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices)) | OK with **attribution**. The gated main repo's terms prohibit voice cloning and impersonation. Avoid the Expresso and EARS presets (CC-BY-NC). |
| [neuphonic/neutts-air](https://huggingface.co/neuphonic/neutts-air) (not run) | Apache-2.0 (`neutts` 1.4.1) | Apache-2.0 | Lists **Emilia (CC-BY-NC-4.0)** and neuphonic/emilia-yodas-english-neucodec | The weights are permissive, but the NC training data is a caveat. The repo is gated. |

Tools used only for checking: faster-whisper small.en (MIT), facebook/wav2vec2-lv-60-espeak-cv-ft (Apache-2.0), prj-beatrice/utmos22-torch-native (MIT).

## Ranking reasons

1. **Chatterbox + designed reference.** It is the only sample with zero measured errors, both names right, and a high MOS (4.04). Its exaggeration and cfg controls give a calm, steady read. It is MIT licensed, and the voice identity comes from our own designed voice. Downside: a brisk pace (about 120–128 wpm), and B is only slightly slower.
2. **Chatterbox Turbo + designed reference.** The same voice, about 2× faster, with the best B MOS (4.29). One soft "in". B needs slowing.
3. **Qwen3-TTS VoiceDesign (slowB).** The designed voice itself, with no cloning step, and the most "bedtime" pacing (B clearly slower and softer). Its MOS is lower than Chatterbox's. That is typical of expressive, whispery reads and does not necessarily mean it sounds worse to a listener; please listen to this one next to rank 1.
4. **Qwen3-TTS VoiceDesign (plain B).** The same voice. B was faster than A, and there was one "Paw in hand" slip.
5. **VoxCPM2.** Names correct, but the whispery B scored very low (2.21). It is also the slowest on CPU.
6. **Pocket TTS "anna".** Excellent MOS and speed, but unreliable with Ava, and it is a real person's voice.

## Not run, and blocked hosts

- **NeuTTS Air:** the Hugging Face repos `neuphonic/neutts-air` and `neuphonic/neucodec` are **gated** (401 without an HF token that has accepted the terms). There is no token in this environment. The package installed fine; it needed a small torchtune shim.
- **Pocket TTS main repo** (`kyutai/pocket-tts`): gated (401). The public non-cloning repo was used instead.
- **Maya1 (3B):** skipped as too slow for a 4-core CPU in the time budget.
- **Blocked hosts:** `download.pytorch.org` (proxy refused; torch came from PyPI instead). `api.github.com` and `codeload.github.com` (403, so `torch.hub` could not load tarepan/SpeechMOS; the MIT Hugging Face port of UTMOS22 was used instead).
- **Hosts that worked:** huggingface.co API and Xet CDN weight downloads, pypi.org and files.pythonhosted.org, GitHub release assets, and archive.ubuntu.com (apt, used for espeak-ng).

Everything, including per-take transcripts, phoneme strings, pause lists and exact settings, is in `results.json`.
