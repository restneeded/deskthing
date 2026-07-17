# Aura — talk to your house

**A voice + chat assistant for your Govee lights on a jailbroken Spotify Car Thing — powered by any LLM via OpenRouter (or xAI / custom).**

Aura turns the little $10-off-eBay Car Thing into an always-on smart-home panel. Walk up and say *"hey aura, turn the living room purple"* — or type, or use scene buttons. The brain is **your choice of model** (OpenRouter recommended), not Alexa's canned intents.

It's a [DeskThing](https://deskthing.app) app: React UI on the Car Thing, Node server on the host. Server talks to your **LLM**, **Govee**, and optional **STT**.

> **Status:** v0.3 — OpenRouter, **true “Lumen” wake** (Porcupine), STT fallback, Windows **hardware mic probe**, Car Thing ADB mics, Govee. Install the release zip, not GitHub source.

---

## Why not just use Alexa?

You asked the real question: *can we make our own custom stuff that's faster and better than Alexa?* Short answer — **yes**, and here's why it can actually be better:

| | Alexa | Aura |
|---|---|---|
| Understanding | Fixed intents / skills | **Grok** — understands "make it cozy", "same as last night", follow-ups like "a bit brighter" |
| Speed | Round-trips Amazon's cloud | Local mic → your STT → Grok → Govee; use a **local Whisper** server and a fast Grok model to keep it snappy |
| Control | Whatever the skill exposes | You own the code — add any tool, any device, any behavior |
| Privacy | Always-listening on Amazon's servers | **Push-to-talk** (nothing recorded until you hold the button); STT can be 100% local |
| Personality | Corporate | Whatever you make the system prompt |

The tradeoff: Aura isn't a far-field always-listening speaker. It's **push-to-talk** (see the mic reality below). For a panel you walk up to, that's arguably better — no hot-mic, no false wakes.

---

## How it works

```
   ┌──────────────────────────┐        USB / DeskThing link        ┌───────────────────────────────┐
   │   Car Thing (800×480)    │  ◄───────────────────────────────► │   DeskThing Server (host PC)   │
   │                          │                                    │                                │
   │  React UI  (src/)        │   "aura" messages (type+request)   │   Aura server (server/)        │
   │  • hold-to-talk mic      │ ─────────────────────────────────► │   ┌────────────────────────┐   │
   │  • scene buttons         │                                    │   │ mic capture (push-to-   │   │
   │  • per-light on/off      │                                    │   │ talk) → STT (Whisper)  │   │
   │  • chat / quick chips    │                                    │   └───────────┬────────────┘   │
   │  • replies + action tags │ ◄───────────────────────────────── │               ▼                │
   └──────────────────────────┘        replies / status / devices  │        Grok (xAI) 🧠            │
                                                                    │        tool calling            │
                                                                    │               │                │
                                                                    │               ▼                │
                                                                    │        Govee cloud API 💡      │
                                                                    └───────────────────────────────┘
```

1. You hold the mic button (or type). The **server** records the host's microphone.
2. Audio → **speech-to-text** (local Whisper server, or OpenAI) → text.
3. Text → **Grok** with a set of light-control *tools*. Grok decides whether to control lights or just answer.
4. Grok's tool calls → **Govee API** (turn on/off, brightness, color, white temperature, scenes).
5. Grok's spoken reply comes back to the screen (and optionally out the host speakers via TTS).

Scene buttons, per-light on/off, and the "All off/on/Warm" chips **skip Grok entirely** and hit Govee directly, so they're instant.

---

## 🎤 The mic situation — two ways in

The Car Thing has **four far-field mics**, but you can't reach them from the Chromium webview (`getUserMedia` was never wired up on-device). Aura supports **two capture sources**, selectable in Settings:

1. **Host mic** — capture the DeskThing computer's microphone. Put a cheap USB mic next to the Car Thing. Works out of the box.
2. **Car Thing mics (the crack)** — capture the device's *own* mics over ADB. The stock OS captured them for "Hey Spotify," and community firmware keeps the stock kernel, so the pipeline is still there at the OS level — **only the browser is blocked, not a shell.** Aura runs the recorder *on the device* and tunnels the audio over the USB/ADB link it already uses.

**Start here:** run the probe to confirm your device can capture, then flip the setting.

```bash
./tools/superbird-mic-probe.sh     # records a 3s test clip on the device and pulls it back
```

Full method, mixer un-muting, and the device-tree route (if capture is disabled) are in **[`docs/MICROPHONE.md`](docs/MICROPHONE.md)**. The on-device path is implemented in [`server/adb-mic.ts`](server/adb-mic.ts).

> Either way, **text + scenes + buttons work with zero mic**, anywhere — that's the reliable core.

---

## Features

- 🎙️ **Push-to-talk** — hold the on-screen mic, speak, release. Host-mic capture + pluggable STT.
- 🧠 **Grok brain** — natural language, context ("make *it* brighter"), and general Q&A, not just commands.
- 💡 **Full Govee control** — power, brightness, RGB color, white temperature, per-room targeting with fuzzy name matching ("bedroom" → "Bedroom Lamp").
- 🎬 **8 instant scenes** — Relax, Focus, Movie, Party, Sunset, Sleep, Gaming, Daylight (RGB presets that work on any bulb/strip).
- ⚡ **Instant paths** — scene buttons, per-light On/Off, and quick chips bypass the LLM for zero-latency control.
- 🔊 **Optional spoken replies** — host-side TTS (`say` on macOS, `espeak` on Linux).
- 🔒 **Private by default** — nothing is recorded until you hold the button; STT can run fully local.

---

## Quick start

**You need:** a jailbroken Car Thing running DeskThing, Node 18+, a Govee API key, and an xAI (Grok) API key. For voice, also a mic + STT server. Full walkthrough in [`docs/`](docs/).

### Install into DeskThing (end users)

**Easiest — paste the repo link (no download):**

1. DeskThing desktop → **Downloads**
2. **Add repository** (or similar “add from URL”)
3. Paste one of these:
   - `restneeded/deskthing`
   - `https://github.com/restneeded/deskthing`
4. Install **Aura** from the list that appears
5. Open Aura **Settings** and paste your keys (table below)

DeskThing reads `latest.json` / `aura.json` from [Releases](https://github.com/restneeded/deskthing/releases/latest) and pulls the built zip itself.

**Alternate — load the zip by URL** (if your DeskThing build only accepts a direct package URL):

```
https://github.com/restneeded/deskthing/releases/latest/download/aura-v0.1.0.zip
```

> **Do not install GitHub "Source code (zip)" or clone the repo into DeskThing.** That is the *source tree*. DeskThing needs the *built* package (`manifest.json` at the zip root). Source installs fail with `Unable to find the new app manifest`.

If a previous failed install left junk, quit DeskThing and delete `%AppData%\deskthing\apps\staged`, then retry.

### Build from source (developers)

```bash
git clone https://github.com/restneeded/deskthing
cd deskthing
npm install

# dev with the DeskThing CLI (hot reload against a running DeskThing server)
npm run dev

# …or build the loadable package
npm run build          # → dist/aura-vX.Y.Z.zip  (this is what you upload)
```

Then in the **DeskThing desktop app**: *Downloads → Load from file →* pick `dist/aura-*.zip`, open Aura's **Settings**:

| Setting | Where to get it |
|---|---|
| **LLM provider** | OpenRouter (recommended), xAI, or custom |
| **LLM API Key** | <https://openrouter.ai/keys> (or xAI / your provider) |
| **Model id** | e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `x-ai/grok-4-fast` |
| **Govee API Key** | Govee Home → *Settings → Apply for API Key* |
| **Voice mode** | Off / Push-to-talk / **Wake word (Lumen)** |
| **Wake engine** | Auto / Porcupine (true) / STT fallback |
| **Picovoice AccessKey + .ppn** | True Lumen — see [`docs/WAKE_WORD.md`](docs/WAKE_WORD.md) |
| **Mic source** | Host or Car Thing — probe: `tools/superbird-mic-probe.ps1` ([walkthrough](docs/HARDWARE_PROBE.md)) |
| **STT server URL** | Local Whisper (required for commands after wake) |

Full detail: [`docs/API_KEYS.md`](docs/API_KEYS.md) · [`docs/WAKE_WORD.md`](docs/WAKE_WORD.md) · [`docs/HARDWARE_PROBE.md`](docs/HARDWARE_PROBE.md).

---

## Project layout

```
deskthing/
├── deskthing/manifest.json   DeskThing app manifest + icon
├── server/                   Node backend (runs on the host)
│   ├── index.ts              lifecycle + message dispatch (the glue)
│   ├── govee.ts              Govee Developer API v2 client
│   ├── grok.ts               Grok (xAI) client + tool-calling agent loop
│   ├── tools.ts              tool schema Grok sees + executor → Govee
│   ├── scenes.ts             scene presets + named colors
│   ├── stt.ts                OpenAI-compatible speech-to-text client
│   ├── audio.ts              host mic capture (PTT) + optional TTS
│   └── settings.ts           settings schema shown in DeskThing UI
├── src/                      React UI (runs on the Car Thing)
│   ├── App.tsx               layout + state wiring
│   ├── deskthing.ts          client transport helpers
│   └── components/           StatusBar, PushToTalk, SceneBar, Conversation, …
└── docs/                     hardware, keys, architecture
```

---

## Roadmap

- [x] **Phase 1 — text & buttons:** chat, scenes, per-light control. No mic required.
- [x] **Phase 2 — push-to-talk voice:** host-mic capture → STT → Grok → Govee, optional TTS reply.
- [x] **Phase 3 — on-device mic:** capture the Car Thing's own mics over ADB (`server/adb-mic.ts` + probe). Confirm on your hardware with `tools/superbird-mic-probe.sh`.
- [ ] **Wake word** — optional local wake word over the tunneled mic stream so you don't have to touch the screen.
- [ ] **Live light state** — poll Govee device state so the UI shows real on/off + color.
- [ ] **More than lights** — the tool system is generic; add plugs, thermostats, scenes across brands.

---

## Extending it

Adding a new capability is two edits:

1. Add a tool definition to `TOOL_DEFS` in [`server/tools.ts`](server/tools.ts) (name, description, JSON-schema params).
2. Handle it in `applyOne()` — call whatever API you like.

Grok picks it up automatically from the schema. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Credits & license

Built on [DeskThing](https://github.com/ItsRiprod/DeskThing) by Riprod. Brain by [xAI Grok](https://x.ai/api). Lights by the [Govee Developer API](https://developer.govee.com). Speech-to-text via any OpenAI-compatible Whisper server.

MIT — see [LICENSE](LICENSE). Not affiliated with Spotify, xAI, or Govee.
