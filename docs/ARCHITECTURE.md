# Architecture

Aura is a standard [DeskThing](https://deskthing.app) app: a **client** (React, runs on the Car Thing's Chromium) and a **server** (Node, runs on the host). They exchange typed messages over the DeskThing link.

## Message protocol

Every app message rides on a single DeskThing transit `type` of **`"aura"`** and is discriminated by a `request` field. This keeps wiring to one handler per side (`server/index.ts` and `src/App.tsx`).

### Client → Server (`src/deskthing.ts`)

| request | payload | effect |
|---|---|---|
| `get_state` | — | ask for current config + device list |
| `refresh_devices` | — | re-list Govee devices |
| `chat` | `{ text }` | run text through Grok (may control lights or just answer) |
| `quick` | `{ text }` | same as chat (canned chip text) |
| `scene` | `{ sceneId }` | apply a preset scene to all lights (skips Grok) |
| `control` | `{ tool, args }` | run a light tool directly (skips Grok) — used by on/off tiles |
| `ptt_start` | — | start host-mic recording |
| `ptt_stop` | — | stop recording → STT → Grok |
| `ptt_cancel` | — | discard recording |

### Server → Client

| request | payload | effect |
|---|---|---|
| `config` | `{ hasGrok, hasGovee, voiceEnabled, model, deviceCount }` | drives setup card + mic availability |
| `devices` | `{ devices: LightDevice[] }` | populates the device strip |
| `status` | `{ state, detail }` | `idle`/`listening`/`transcribing`/`thinking`/`acting`/`error` |
| `transcript` | `{ text }` | what the mic heard (shown as a user bubble) |
| `reply` | `{ id, text, actions[] }` | assistant answer + what it did to the lights |

## The Grok agent loop (`server/grok.ts`)

1. Build messages: a **system prompt** (who Aura is + the user's actual light names/capabilities + available scenes) + short conversation history + the new user text.
2. `POST https://api.x.ai/v1/chat/completions` with the light-control **tools** and `tool_choice: "auto"`.
3. If Grok returns `tool_calls`: execute each against Govee (`executeTool`), append the results as `role: "tool"` messages, and loop (max 4 rounds).
4. If Grok returns plain content: that's the spoken reply. Return it plus the collected per-device action summaries.

General questions (no light intent) skip tools entirely — Grok just answers, so Aura doubles as a normal assistant.

## Tools → Govee (`server/tools.ts`, `server/govee.ts`)

`TOOL_DEFS` is the JSON-schema Grok sees. `executeTool` is the deterministic bridge:

- `set_power`, `set_brightness`, `set_color`, `set_white`, `apply_scene`, `list_lights`.
- `resolveTargets()` maps a spoken target ("bedroom", "all") to concrete devices via exact → substring → token-overlap matching.
- `GoveeClient` calls the v2 API: `powerSwitch`, `brightness` (range), `colorRgb` (packed int), `colorTemperatureK`.

Each tool returns a per-device `ActionSummary` (`{ target, action, ok, error }`) so the UI can show green/red chips and Grok can explain failures.

## Voice pipeline (`server/audio.ts`, `server/stt.ts`)

- `Recorder` spawns `sox`/`arecord`/`ffmpeg` on `ptt_start`, kills it gracefully on `ptt_stop`, yielding a 16 kHz mono WAV.
- `SttClient` POSTs that WAV to an OpenAI-compatible `/v1/audio/transcriptions` endpoint (local Whisper or OpenAI).
- The transcript flows into the same `handleUtterance()` path as typed text.

**On-device mic (future):** only `server/audio.ts` assumes host capture. If the Car Thing's mics become reachable, replace `Recorder` with a source that streams from the device — nothing else changes.

## Why the split of fast paths vs. Grok

- **Grok path** (chat, voice): flexible, understands intent and context. Costs an LLM round-trip.
- **Direct path** (scenes, on/off tiles, quick chips): deterministic and instant. No LLM.

Common actions get buttons; everything else gets language.

## Adding a capability

1. Add a tool to `TOOL_DEFS` in `server/tools.ts`.
2. Implement it in `applyOne()` (call any API).
3. (Optional) add a button/chip in the UI that sends `control` with the new tool for an instant path.

Grok discovers the tool from its schema automatically.
