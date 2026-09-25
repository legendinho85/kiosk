# Hugging Face TTS voice samples: blocked again, no samples made

**Status:** stopped at Step 0 (access check), second attempt. This run was in the **"huggingface" environment**. Hugging Face is now reachable, but this environment blocks **PyPI** (and every other package source). No Python ML packages are preinstalled: no PyTorch, no NumPy, no onnxruntime. So no model could be installed or run. As instructed, I did not use mirrors or any other workaround. **No audio samples were made.**

Checked: 2026-09-25, about 11:50 UTC.

## What was tested

| Host / URL | Result |
|---|---|
| `https://huggingface.co/api/models/ResembleAI/chatterbox` (model API) | **OK** (200) |
| `https://huggingface.co/ResembleAI/chatterbox/resolve/main/README.md` | **OK** (200, via `huggingface.co/api/resolve-cache/...`) |
| `https://huggingface.co/ResembleAI/chatterbox/resolve/main/t3_cfg.safetensors` (real weight file, ranged) | **OK** (206, redirects to `us.aws.cdn.hf.co/xet-bridge-us/...`) |
| Model cards for Qwen3-TTS VoiceDesign, VoxCPM2, Chatterbox Turbo, NeuTTS Air, Pocket TTS, Maya1 | **OK** (all readable) |
| `https://pypi.org/simple/...` | **Blocked**: 403 `Host not in allowlist: pypi.org` |
| `https://files.pythonhosted.org/` (PyPI wheel downloads) | **Blocked**: 403 |
| `pip download six` (smallest possible test) | **Failed**: `No matching distribution found` (index unreachable) |
| `https://download.pytorch.org/whl/cpu` | **Blocked**: proxy 403 on CONNECT |
| `http://archive.ubuntu.com` (apt) | **Blocked**: 403 Forbidden |
| `https://registry.npmjs.org` | **Blocked**: 403 |
| `https://conda.anaconda.org` | **Blocked**: proxy 403 on CONNECT |
| `https://raw.githubusercontent.com` | **Blocked**: proxy 403 on CONNECT |
| `https://cdn-lfs.huggingface.co` (legacy LFS CDN) | Rejected (502 on CONNECT). Not needed: current weights come via the Xet CDN, which works. |
| `https://github.com/thewh1teagle/kokoro-onnx/releases/...` | OK (302 to the release asset) |

Machine: 4 cores, 15 GB RAM, Ubuntu 24.04, Python 3.10/3.11/3.12. The system Python has only 38 basic packages and no ML libraries.

## Effect

Every candidate model needs PyTorch (or onnxruntime) plus its own pip package (`qwen-tts`, `voxcpm`, `chatterbox-tts`, `neutts`, `pocket-tts`). So do the checks: `faster-whisper` for transcripts, SpeechMOS/UTMOS for naturalness, and `soundfile` for MP3 output. The model weights can be downloaded now, but nothing can run them without packages from PyPI.

I did not try to get packages any other way, such as wheels re-hosted on Hugging Face or a CDN mirror of npm/PyPI. The brief says not to route around blocks.

## To unblock

In the "huggingface" environment's settings (cloud environment menu in the session title bar, then **Edit → Network access**), add these hosts to the allowed domains (or choose a broader access level):

- `pypi.org`
- `files.pythonhosted.org`

Keep `huggingface.co` and `*.hf.co` allowed, as they are now. Optional: `download.pytorch.org`, for smaller CPU-only torch wheels (PyPI's Linux torch wheel also downloads several GB of CUDA libraries).

Access levels are described at https://code.claude.com/docs/en/claude-code-on-the-web. After that, rerun this task unchanged. The plan is ready: Qwen3-TTS 1.7B VoiceDesign first, then VoxCPM2, then Chatterbox with the designed voice as a synthetic reference, then NeuTTS Air / Pocket TTS.

## Licences seen on the model cards (for the next run)

| Model | HF repo | Card licence |
|---|---|---|
| Qwen3-TTS VoiceDesign | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | apache-2.0 |
| VoxCPM2 | `openbmb/VoxCPM2` | apache-2.0 |
| Chatterbox Turbo | `ResembleAI/chatterbox-turbo` | mit |
| NeuTTS Air | `neuphonic/neutts-air` | apache-2.0 |
| Pocket TTS | `kyutai/pocket-tts` | cc-by-4.0 (the weights; check each preset voice's own licence) |
| Maya1 | `maya-research/maya1` | apache-2.0 |

These are the `license` fields from the model cards only. I have not checked training-data licences, because no samples could be made.
