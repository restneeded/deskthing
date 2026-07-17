# Car Thing microphone probe — walkthrough

**Goal:** prove the Spotify Car Thing’s **own 4 far-field mics** work over ADB so Aura can listen for **“Lumen”** and commands without a host USB mic.

**Time:** ~10 minutes if ADB already works. Longer if capture is muted or missing from the device tree.

---

## What you’re proving

| Layer | Works? |
|-------|--------|
| Chromium / DeskThing webview `getUserMedia` | No — never wired |
| Device Linux ALSA capture (stock kernel) | Yes on stock — “Hey Spotify” used it |
| Aura server + `adb shell` recorder + pull | Yes, if ALSA capture exists |

We do **not** fight the browser. We record **on the device** and pull the WAV over USB.

---

## Prerequisites

1. Car Thing flashed with community firmware that has **ADB** (superbird / DeskThing setup).
2. USB data cable to the PC that runs DeskThing.
3. **adb** on PATH ([platform-tools](https://developer.android.com/tools/releases/platform-tools)).
4. This repo cloned (or at least the `tools/` scripts).

---

## Step 1 — Run the probe (Windows)

In PowerShell from the repo root:

```powershell
cd path\to\deskthing
.\tools\superbird-mic-probe.ps1
```

If you have more than one ADB device:

```powershell
adb devices
.\tools\superbird-mic-probe.ps1 -Serial YOUR_SERIAL
```

### Linux / macOS

```bash
chmod +x tools/superbird-mic-probe.sh
./tools/superbird-mic-probe.sh
# or: ./tools/superbird-mic-probe.sh SERIAL
```

---

## Step 2 — Read the verdict

The script writes:

- `superbird-mic-report.txt` — full dump
- `superbird-mic-test.wav` — 3 second test (if capture worked)

It may open the WAV in your default player.

### Outcome A — You hear yourself

**Mics are cracked.** In DeskThing → Aura settings:

| Setting | Value |
|---------|--------|
| Microphone source | **Car Thing mics (via ADB)** |
| ADB serial | blank (or your serial) |
| Capture tool | Auto |
| Voice mode | **Wake word** |
| Wake engine | **Porcupine (true)** once Lumen model is set — see [WAKE_WORD.md](WAKE_WORD.md) |

### Outcome B — WAV exists but silent / hiss

Capture path is there; **mixer is muted or gain is zero**.

```powershell
adb shell tinymix
# look for Capture / PDM / ADC / Mic switches and gains
adb shell "tinymix 'NAME' 1"          # example: enable switch
adb shell "tinymix 'GAIN NAME' 40"    # example: raise gain
```

Then re-run the probe. When you hear speech in the WAV, go to Outcome A.

### Outcome C — No capture PCM / no WAV

`/proc/asound/pcm` has no `capture` and no `/dev/snd/pcmC*D*c` nodes.

The **device tree** likely disabled PDM. Deep fix:

1. Dump **stock** firmware DTB and grep for `pdm` / `dmic` / `sound`.
2. Copy working nodes into your superbird DTB (do not invent GPIOs).
3. Reflash DTB via [superbird-tool](https://github.com/Car-Thing-Hax-Community/superbird-tool).

Details: [MICROPHONE.md](MICROPHONE.md) Step 3B.

### Outcome D — No arecord / tinycap

Push static tinyalsa binaries (aarch64), then re-probe:

```powershell
adb push tinycap /usr/bin/
adb push tinymix /usr/bin/
adb shell chmod +x /usr/bin/tinycap /usr/bin/tinymix
```

---

## Step 3 — Point Aura at the device mic

After Outcome A:

1. Install Aura **v0.3+** zip.
2. Settings as in the table above.
3. Host still needs `adb` on PATH (same adb DeskThing uses).
4. For **true “Lumen”** wake word, complete [WAKE_WORD.md](WAKE_WORD.md) (Picovoice custom keyword + Python sidecar).

**While cracking mics:** use **Host computer mic** (USB mic by the Car Thing) so wake word / OpenRouter still work.

---

## Step 4 — Sanity checklist before wake word

- [ ] `adb devices` shows `device` (not `unauthorized`)
- [ ] Probe WAV has audible speech
- [ ] Aura mic source = Car Thing (or Host for testing)
- [ ] Local Whisper STT running (needed for the **command** after wake)
- [ ] Porcupine Lumen model + access key configured (true wake)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `adb` not found | Install platform-tools; new terminal |
| `unauthorized` | Re-plug; re-enable ADB on device |
| device busy | `adb kill-server` then open DeskThing again |
| tinycap empty file | Wrong `-D` / `-d` — match section 3 of the report |
| DeskThing + probe conflict | Both can share one adb server; only one *server* process |

---

## Related

- [MICROPHONE.md](MICROPHONE.md) — theory, DTB, multi-channel notes  
- [WAKE_WORD.md](WAKE_WORD.md) — true **Lumen** Porcupine setup  
- [API_KEYS.md](API_KEYS.md) — OpenRouter, Govee, STT  
