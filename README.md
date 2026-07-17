# Aura — talk to your house

**A Grok-powered voice + chat assistant for your Govee lights, running on a jailbroken Spotify Car Thing.**

Aura turns the little $10-off-eBay Car Thing into an always-on smart-home panel. Walk up, hold the mic, and say *"turn the living room purple and dim it to 20%"* — or just ask it anything, because the brain is **Grok (xAI)**, not Alexa's canned intent engine.

It's a [DeskThing](https://deskthing.app) app: a React UI that runs on the Car Thing's screen, plus a Node server that runs on the computer the Car Thing is plugged into. The server talks to **Grok** for understanding and to the **Govee cloud API** for the lights.

> **Status:** v0.1 — builds into a loadable DeskThing package (`npm run build` → `dist/aura-*.zip`). Text/chat control, scene buttons, per-light on/off, and push-to-talk voice are all implemented. You supply two API keys (Grok + Govee) and, for voice, a speech-to-text server.

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

```bash
git clone https://github.com/restneeded/deskthing
cd deskthing
npm install

# dev with the DeskThing CLI (hot reload against a running DeskThing server)
npm run dev

# …or build the loadable package
npm run build          # → dist/aura-vX.Y.Z.zip
```

Then in the **DeskThing desktop app**: *Downloads → Load from file →* pick `dist/aura-*.zip`, open Aura's **Settings**, and paste your keys:

| Setting | Where to get it |
|---|---|
| **xAI (Grok) API Key** | <https://console.x.ai> — see [`docs/API_KEYS.md`](docs/API_KEYS.md) |
| **Grok Model** | A current id from <https://console.x.ai/team/default/models> (default: a fast, non-reasoning model) |
| **Govee API Key** | Govee Home app → *Settings → Apply for API Key* (emailed to you) |
| **Voice input** | Toggle on; needs `sox`/`arecord`/`ffmpeg` + an STT server below |
| **STT server URL** | Local Whisper (recommended) or `https://api.openai.com/v1` |

The app shows a setup card until Grok + Govee keys are present, then loads your lights automatically.

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
