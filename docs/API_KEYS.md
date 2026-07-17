# API keys & services

All keys are entered in Aura's **Settings** inside the DeskThing desktop app. They persist on the host machine and are **never** written to this repo.

## 1. LLM — the brain (required)

### OpenRouter (recommended)

One key → any model (OpenAI, Anthropic, Grok via OpenRouter, Gemini, etc.).

1. Create a key at <https://openrouter.ai/keys>
2. In Aura settings:
   - **LLM provider:** OpenRouter
   - **LLM API Key:** paste the key
   - **Model id:** any OpenRouter slug, e.g.
     - `openai/gpt-4o-mini` (fast / cheap default)
     - `anthropic/claude-3.5-sonnet`
     - `x-ai/grok-4-fast`
     - `google/gemini-2.0-flash-001`
     - Browse: <https://openrouter.ai/models>

Aura calls `POST https://openrouter.ai/api/v1/chat/completions` with tool calling for lights.

### xAI (Grok direct)

- Provider: **xAI**
- Key from <https://console.x.ai>
- Model: a current id from the xAI models page

### Custom OpenAI-compatible

- Provider: **Custom**
- **Custom API base URL:** e.g. `https://api.openai.com/v1` or a local server
- Key + model for that provider

Legacy settings named “Grok API Key” are still read if present.

## 2. Govee — the lights (required for light control)

1. **Govee Home** app → **Settings → Apply for API Key** (emailed to you)
2. Paste into **Govee API Key**

Uses Govee Developer API v2. Only Wi‑Fi/cloud devices show up (not BLE-only).

## 3. Speech-to-text — ears (required for voice / wake word)

Aura uses OpenAI-compatible `/v1/audio/transcriptions`.

### Local Whisper (recommended)

- **STT server URL:** `http://localhost:8000/v1`
- **STT API Key:** blank
- **STT model:** match your server (e.g. `Systran/faster-whisper-base.en`)

### OpenAI Whisper

- URL: `https://api.openai.com/v1`
- Key: OpenAI key
- Model: `whisper-1`

## 4. Voice mode

| Mode | Behavior |
|------|----------|
| **Off** | Type / buttons only |
| **Push-to-talk** | Hold mic on screen |
| **Wake word** | Always listening; say a phrase then the command |

**Wake words** (comma-separated): default `hey aura, aura`.

v1 wake detection is **STT-based** (rolling short clips). Later we can swap idle listening for openWakeWord / Porcupine for lower cost and latency.

## 5. Microphone source

| Source | Notes |
|--------|--------|
| **Host computer mic** | USB mic next to Car Thing — easiest |
| **Car Thing mics (ADB)** | Real far-field array — run `tools/superbird-mic-probe` first. See [MICROPHONE.md](MICROPHONE.md) |

## 6. Speak replies (optional)

Host TTS: Windows SAPI, macOS `say`, Linux `espeak`.

---

### What runs where

| Piece | Where | Internet? |
|-------|--------|-----------|
| LLM (OpenRouter/xAI/…) | provider cloud | yes |
| Govee | Govee cloud | yes |
| STT (local) | your host | no |
| STT (OpenAI) | OpenAI | yes |
| Mic / wake loop / TTS | your host | no |
