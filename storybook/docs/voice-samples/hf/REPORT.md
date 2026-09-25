# Hugging Face TTS voice samples: blocked, no samples made

**Status:** stopped at Step 0 (access check). This environment's network policy blocks Hugging Face, so I could not download any model weights. As instructed, I did not use mirrors or any other workaround. **No audio samples were made.**

Checked: 2026-09-25, about 11:26 UTC.

## What was tested

| Host / URL | Result |
|---|---|
| `https://huggingface.co/api/models/ResembleAI/chatterbox` (model API) | **Blocked**: `CONNECT tunnel failed, response 403` (proxy log: "gateway answered 403 to CONNECT (policy denial or upstream failure)", host `huggingface.co:443`) |
| `https://huggingface.co/ResembleAI/chatterbox/resolve/main/tokenizer.json` (real file download) | **Blocked**: 403 on CONNECT |
| `https://huggingface.co/ResembleAI/chatterbox/resolve/main/conds.pt` | **Blocked**: 403 on CONNECT |
| `https://hf.co` | **Blocked**: 403 on CONNECT |
| `https://cdn-lfs.huggingface.co` (LFS weight CDN) | **Blocked**: 403 on CONNECT |
| `https://cdn-lfs-us-1.hf.co` | **Blocked**: 403 on CONNECT |
| `https://cas-bridge.xethub.hf.co` (Xet storage, now used for most HF weights) | **Blocked**: 403 on CONNECT |
| `https://download.pytorch.org/whl/cpu` | **Blocked**: 403 on CONNECT (not needed: PyPI torch would do) |
| `https://pypi.org/simple/torch/` | OK (206) |
| `https://github.com/.../kokoro-onnx/releases/...` | OK (302 to the release asset) |

## Effect

Every candidate model in the brief keeps its weights on Hugging Face: Qwen3-TTS VoiceDesign, Maya1, Chatterbox or Chatterbox Turbo, Kyutai Pocket TTS, NeuTTS Air, Higgs Audio v2, IndexTTS2 and Dia. So does the Whisper checkpoint used for the transcription check (faster-whisper pulls from `Systran/*` on HF), and so does UTMOS (SpeechMOS pulls its checkpoint from GitHub releases, but that has no value without samples). None of these could be fetched, so nothing could be rendered or measured.

## To unblock

Allow these hosts in the environment's network policy, then rerun this task:

- `huggingface.co`
- `hf.co`
- `cdn-lfs.huggingface.co`, `cdn-lfs-us-1.hf.co` (and other `cdn-lfs*.hf.co`)
- `cas-bridge.xethub.hf.co` and `*.xethub.hf.co` (Xet-backed repos serve their weights from here)

Alternatively, run the job on a machine with normal internet access. See https://code.claude.com/docs/en/claude-code-on-the-web for how environment network access is configured.

No licences were checked and no samples were ranked, because the model cards could not be reached either.
