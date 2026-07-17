# Hardware & setup

## What you need

- A **Spotify Car Thing** flashed with **DeskThing** (jailbroken).
- A **host computer** running the DeskThing desktop server. This can be your daily PC, a mini-PC, or a Raspberry Pi that lives next to the Car Thing.
- **Node 18+** on the host (Node 20+ recommended).
- For **voice input**: a microphone reachable by the host + a recorder binary (`sox`, `arecord`, or `ffmpeg`) + a speech-to-text server (see [API_KEYS.md](API_KEYS.md)).
- For **spoken replies** (optional): `say` (macOS, built in) or `espeak-ng`/`espeak` (Linux).

## Flashing the Car Thing (DeskThing)

Aura is a DeskThing *app*, not firmware — so first get DeskThing itself running:

1. Follow the official DeskThing flashing guide: <https://deskthing.app> and the community wiki at <https://carthing.wiki>.
2. Confirm the Car Thing boots into DeskThing and connects to the DeskThing desktop app over USB.
3. Then load Aura (below).

## Loading Aura

```bash
npm install
npm run build           # produces dist/aura-vX.Y.Z.zip
```

In the DeskThing desktop app: **Downloads → Load from file →** select `dist/aura-*.zip`. Open Aura's **Settings** and add your keys.

For development with hot reload, use `npm run dev` (the DeskThing CLI) while the DeskThing server is running.

## The microphone situation

The Car Thing has four hardware mics, but **DeskThing apps cannot access them** — the community never exposed mic capture through the Chromium webview. So Aura records the **host machine's** microphone.

Practical setups that give you the "walk up and talk" feel:

- **USB lav/boundary mic** ($8–15) plugged into the host, velcroed near the Car Thing.
- **Raspberry Pi host** sitting next to the Car Thing with a USB mic — self-contained appliance.
- **Laptop/desktop host** in the same room — fine if the Car Thing lives on that desk.

Pick a recorder the host has installed (Aura auto-detects, in this order):

| OS | Install a recorder |
|---|---|
| macOS | `brew install sox` (or use `ffmpeg`) |
| Linux | `sudo apt install alsa-utils` (`arecord`) or `sox` |
| Windows | `ffmpeg` (via winget/choco) |

Aura records 16 kHz mono WAV while you hold the mic button, then sends it to your STT server.

> Lights are controlled through the Govee **cloud**, so they can be anywhere in the house on any network — only the *mic* needs to be near the Car Thing.

## Latency tips ("faster than Alexa")

- Run a **local** Whisper server (e.g. `faster-whisper-server`) on the host — no upload round-trip.
- Use a **fast, non-reasoning** Grok model.
- Prefer **scene buttons / on-off tiles** for common actions — those skip the LLM entirely.
- Keep the mic close; less noise = faster, more accurate transcription.
