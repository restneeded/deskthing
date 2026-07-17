# API keys & services

All keys are entered in Aura's **Settings** inside the DeskThing desktop app. They persist with the app on the host machine and are **never** written to this repo.

## 1. xAI (Grok) — the brain (required)

1. Go to <https://console.x.ai> and sign in.
2. Create an API key under **API Keys**.
3. Paste it into **Settings → xAI (Grok) API Key**.
4. Set **Grok Model** to a current id from <https://console.x.ai/team/default/models>.
   - The default targets a **fast, non-reasoning** model for low latency. Reasoning models are smarter but slower — your call.
   - Model ids change over time; if you get a `model not found` error, check the models page and update this setting.

The xAI API is OpenAI-compatible; Aura calls `POST https://api.x.ai/v1/chat/completions` with tool calling.

## 2. Govee — the lights (required for light control)

1. Open the **Govee Home** app on your phone.
2. Go to **Settings (profile) → Apply for API Key**.
3. Fill in a reason ("personal smart home project") — the key is **emailed** to you, usually within minutes.
4. Paste it into **Settings → Govee API Key**.

Aura uses the **Govee Developer API v2** (`https://openapi.api.govee.com`). On startup it lists your devices; tap the refresh icon (top-right) after adding new lights.

> Only Wi-Fi/cloud-connected Govee devices appear. BLE-only models won't show up in the cloud API.

## 3. Speech-to-text — the ears (required only for voice)

Aura speaks the **OpenAI-compatible** `/v1/audio/transcriptions` protocol, so you can point it at either a local server or OpenAI.

### Option A — local Whisper (recommended: fast + private)

Run one of these on the host and point Aura at it:

- **faster-whisper-server** / **speaches** — `pip install` or Docker, exposes `http://localhost:8000/v1`.
- **whisper.cpp** server build — OpenAI-compatible endpoint.

Then in **Settings**:
- **Voice input:** on
- **STT server URL:** `http://localhost:8000/v1`
- **STT API Key:** *(leave blank)*
- **STT model:** e.g. `Systran/faster-whisper-base.en` (match what your server loaded)

### Option B — OpenAI Whisper (hosted)

- **STT server URL:** `https://api.openai.com/v1`
- **STT API Key:** your OpenAI key
- **STT model:** `whisper-1`

## 4. Text-to-speech — the voice (optional)

Turn on **Speak replies out loud** to have Aura read answers on the host's speakers. No key needed — it uses `say` (macOS) or `espeak-ng`/`espeak` (Linux) if present.

---

### What runs where

| Piece | Runs on | Needs internet? |
|---|---|---|
| Grok | xAI cloud | yes |
| Govee | Govee cloud | yes |
| STT (Option A) | your host | no |
| STT (Option B) | OpenAI cloud | yes |
| Mic capture / TTS | your host | no |
