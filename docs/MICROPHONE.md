# Cracking the Car Thing microphones

**Goal:** use the Car Thing's own 4 far-field mics for voice, instead of a mic on the host.

**TL;DR of the theory:** the mics are digital (PDM) mics wired to the device's **Amlogic G12A** SoC, which has a PDM controller with a real Linux driver. The **stock Car Thing OS captured these mics** — that's how "Hey Spotify" and tap‑to‑talk voice search worked. Community firmware (DeskThing/superbird) generally keeps the **stock kernel** and only swaps the UI. So the capture pipeline is almost certainly still present at the OS level — **it's only Chromium that can't reach it.** A shell can.

Aura exploits that: it runs the recorder **on the device** and pulls the audio back over the ADB link Aura already uses. No webview mic access required. That's implemented in [`server/adb-mic.ts`](../server/adb-mic.ts) and selected with the **Microphone source → "Car Thing mics (via ADB)"** setting.

---

## Step 1 — prove the mic is reachable (2 minutes)

With the Car Thing plugged in and ADB enabled (via [superbird-tool](https://github.com/Car-Thing-Hax-Community/superbird-tool)):

```bash
./tools/superbird-mic-probe.sh            # or pass an adb serial as $1
```

It dumps ALSA state, device-tree audio nodes, and mixer controls, then **records a 3‑second test clip on the device and pulls it to `superbird-mic-test.wav`.** Play that file:

- **You hear yourself → cracked.** Go to Step 2.
- **File exists but silence → mic is muted/zero‑gain.** Go to Step 3A.
- **No capture device at all → PDM node likely disabled in the device tree.** Go to Step 3B.

The decisive lines in the report:

```
# 2. ALSA sound cards            -> is there a card at all?
cat /proc/asound/cards
# 3. Capture-capable PCM         -> the word "capture" MUST appear
cat /proc/asound/pcm             #   e.g. "00-01: ... : capture 1"
ls /dev/snd                      #   a pcmC0D1c (trailing 'c' = capture) node
```

If there's a `...c` capture PCM and the test WAV has audio, you're done at the OS level.

---

## Step 2 — point Aura at the Car Thing mic

In Aura's **Settings** (DeskThing desktop app):

| Setting | Value |
|---|---|
| Voice input (push-to-talk) | on |
| **Microphone source** | **Car Thing mics (via ADB)** |
| ADB serial | blank (or the serial from `adb devices` if you have more than one) |
| Car Thing capture tool | Auto-detect (or force `arecord`/`tinycap` per the probe) |
| STT server URL / model | your Whisper server (see [API_KEYS.md](API_KEYS.md)) |

Hold the mic button on the Car Thing → Aura runs `arecord`/`tinycap` on the device, `adb pull`s the clip, transcribes it, and runs it through Grok. Same pipeline as host mic, different source.

**Requirements on the host:** `adb` (Android platform-tools) on PATH. Aura shares the host's adb server with DeskThing, so both can talk to the device at once.

---

## Step 3A — capture device exists but records silence

The mics are there but muted or at zero gain. Inspect and flip the capture controls:

```bash
adb shell tinymix                          # list controls + values (tinyalsa)
adb shell 'tinymix "<CTRL NAME>" 1'        # enable a capture switch
adb shell 'tinymix "<GAIN NAME>" <n>'      # raise PDM/ADC gain
# or, if the device has alsa-utils:
adb shell amixer controls | grep -iE 'capture|pdm|mic|adc'
adb shell amixer cset numid=<N> on
```

Look for names containing `PDM`, `Capture`, `ADC`, `Mic`, `Loopback`. Set the capture switch on and gain non‑zero, then re‑run the probe. Once you hear audio, do Step 2. (You can persist the mixer state on the device so it survives reboot; see superbird docs.)

---

## Step 3B — no capture device (PDM node disabled)

If `/proc/asound/pcm` shows **no capture PCM**, the kernel isn't exposing the PDM input — usually because the board's **device tree** doesn't enable the PDM node or bind a capture sound card. This is the deep route; it means patching the DTB (and possibly the kernel config).

What a working G12A PDM capture setup needs (mainline reference: [`meson-g12-common.dtsi`](https://github.com/torvalds/linux/blob/master/arch/arm64/boot/dts/amlogic/meson-g12-common.dtsi), driver `sound/soc/meson/axg-pdm.c`):

1. **Enable the PDM controller** — the `pdm` node (`compatible = "amlogic,g12a-pdm"`) set `status = "okay"` with the correct `pinctrl` for the PDM clock + data pins the mics are wired to.
2. **A DMIC codec** — a `dmic-codec` node (`compatible = "dmic-codec"`) describing the mic array (`num-channels`).
3. **A sound card** binding them — an `amlogic,axg-sound-card` with a DAI link: CPU = `&pdm`, codec = the dmic-codec. This is what makes an ALSA capture card appear.

How to apply it on superbird:

- Pull the current DTB, decompile with `dtc -I dtb -O dts`, add/enable the nodes above, recompile, and reflash the dtb partition using [superbird-tool](https://github.com/Car-Thing-Hax-Community/superbird-tool) / the [err4o4 kernel build](https://github.com/err4o4/spotify-car-thing-reverse-engineering).
- **Before hand-authoring nodes, dump the *stock* firmware's dtb** and grep it for `pdm`/`dmic`/`sound` — the stock OS did voice, so the correct, board-exact nodes almost certainly already exist there. Copy those into your DeskThing dtb rather than guessing pins.

> The pin mux and channel count are board-specific — the stock dtb is the source of truth. Don't invent GPIOs.

If capture tools themselves are missing (no `arecord`/`tinycap`), push a **static tinyalsa** build (`tinycap`/`tinymix`) to the device:

```bash
# build tinyalsa static for aarch64, then:
adb push tinycap tinymix /usr/bin/ && adb shell chmod +x /usr/bin/tinycap /usr/bin/tinymix
```

---

## Notes & gotchas

- **Multi-channel:** the array is 2–4 channels. Aura records what the tool gives; most Whisper servers downmix, but if transcription is poor, force `-c 1` (mono) via the capture tool or downmix with `sox` on the host.
- **ADB contention:** Aura and DeskThing both use the host adb server — fine. If you see "device busy", make sure only one adb *server* is running (`adb kill-server` once, then let DeskThing restart it).
- **Latency:** on-device capture + `adb pull` of a short clip is fast (sub‑second for a few seconds of 16 kHz mono). Pair it with a **local** Whisper server to stay ahead of Alexa.
- **Wake word (next):** once capture is solid, a lightweight on-device VAD/wake-word (e.g. openWakeWord on the host over the tunneled stream) removes the need to touch the screen.

---

## Why this is the right layer

| Layer | Can it reach the mic? |
|---|---|
| DeskThing Chromium / `getUserMedia` | ❌ never wired up in the webview |
| Device Linux shell / ALSA | ✅ the stock OS used it for voice |
| Aura (server + `adb`) | ✅ runs capture on the device, tunnels over USB |

We're not fighting the browser sandbox — we're going under it.
