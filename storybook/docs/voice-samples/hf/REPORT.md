STATUS: INTERIM

# Hugging Face TTS voice samples: gentle British female storyteller (interim)

This is an early push so the founder can listen now. The run is still going. The final report will add more models (VoxCPM2, Chatterbox Turbo, maybe NeuTTS Air / Pocket TTS), full licence details and a ranking.

Access check (2026-09-25, about 12:02 UTC): Hugging Face API, weight downloads (Xet CDN) and PyPI (`pip download six`) all work. `download.pytorch.org` is still blocked; torch came from PyPI instead. `api.github.com` and `codeload.github.com` are also blocked, so UTMOS was run from a Hugging Face port (`prj-beatrice/utmos22-torch-native`, MIT) rather than `torch.hub`.

## Samples so far

| File | Model | Voice | Whisper word errors | Ava as /eɪv/ | Niamh as /niːv/ | UTMOS22 |
|---|---|---|---|---|---|---|
| `qwen3tts-voicedesign.mp3` | Qwen3-TTS 1.7B VoiceDesign | **designed from a text description** (no reference audio) | 0–1 ("Paw in" sometimes heard as "Pawn") | 5/5 | 1 clear + 1 with a very soft final /v/ (Whisper hears "Neve" both times) | 3.17 |
| `chatterbox-designedref.mp3` | Chatterbox (original, 0.5B, MIT) | cloned from an 11 s clip of **the Qwen-designed voice** (synthetic, not a real person) | 0 | 5/5 | 2/2 | 4.04 |

Both files: passage A, about 1.5 s of silence, then passage B (softer). Mastered to -18 LUFS, peaks at or below -1 dBFS, with a -2 dB high shelf at 6.5 kHz. The audio is 24 kHz mono MP3.

Important name finding: I tested respellings with a phoneme recogniser (wav2vec2 espeak CTC). The suggested respelling **"Ayva" was read as "EYE-vuh" (/aɪv/)** by Qwen (3 of 3 tries) and by Chatterbox. Plain **"Ava"** gave the correct /eɪv/ (3 of 3). So both samples feed plain "Ava". For Niamh, both are fed "Neeve".

Each text chunk was checked automatically after rendering (Whisper words plus phonemes for the names) and re-rendered up to 3 times if it failed. Full details are in `results.json`.
