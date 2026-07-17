# True wake word: **Lumen**

Aura’s wake mode has two engines:

| Engine | How it works | Idle cost |
|--------|----------------|-----------|
| **Porcupine (true)** | Picovoice keyword spotter on a continuous mic stream | Low — no Whisper until you say **Lumen** |
| **STT fallback** | Short rolling clips → Whisper → match text | High — Whisper runs every ~2s |

**You want Porcupine** for “Lumen”. STT fallback is only if Porcupine isn’t set up yet.

---

## 1. Create a free Picovoice account + “Lumen” keyword

1. Sign up at <https://console.picovoice.ai/> (free tier is enough).
2. Copy your **AccessKey** (Account → AccessKey).
3. Open **Porcupine** → **Train** / **Custom Keywords**.
4. Create a keyword with the phrase: **`Lumen`**
   - Language: English  
   - Platform: **Windows** (and macOS/Linux if you use those hosts too — export each platform’s `.ppn`)
5. Download the `.ppn` file, e.g. `Lumen_en_windows_v3_0_0.ppn`.

### Where to put the model

Recommended (repo-relative when developing):

```
deskthing/
  models/
    Lumen_en_windows_v3_0_0.ppn
```

Or any absolute path, e.g. `C:\Users\you\models\Lumen_en_windows_v3_0_0.ppn`.

> The `.ppn` is **platform-specific**. A Windows build will not load on Linux. Export the right one for the PC that runs DeskThing.

---

## 2. Install the Python sidecar deps (host PC)

Aura spawns a small Python process so we don’t ship fragile native Node addons inside the DeskThing zip.

```powershell
# Python 3.9+ on PATH
python -m pip install --upgrade pip
python -m pip install pvporcupine pvrecorder
```

Check:

```powershell
python -c "import pvporcupine, pvrecorder; print('ok', pvporcupine.LIBRARY_PATH)"
```

---

## 3. Aura settings (DeskThing → Aura)

| Setting | Value |
|---------|--------|
| **Voice mode** | Wake word |
| **Wake engine** | Porcupine (true) — or **Auto** (uses Porcupine when key + model exist) |
| **Picovoice AccessKey** | paste from console |
| **Wake model path (.ppn)** | full path or `models/Lumen_….ppn` |
| **Wake sensitivity** | `0.5` default (raise if it misses; lower if false triggers) |
| **Python path** | `python` or full path to `python.exe` |
| **Wake words** | `Lumen` (used for UI + STT fallback) |
| **STT server** | still required for the **command after** wake |
| **Mic source** | Host (easiest) or Car Thing after [HARDWARE_PROBE.md](HARDWARE_PROBE.md) |

---

## 4. How the pipeline works

```
 continuous PCM (host mic via PvRecorder)
        │
        ▼
  Porcupine looks for "Lumen"   ← no network, no Whisper
        │  on hit
        ▼
  record ~5s command clip (host or Car Thing ADB)
        │
        ▼
  Whisper STT  →  OpenRouter LLM  →  Govee / reply
```

After **Lumen**, speak the command in the next few seconds, e.g.:

- “Lumen … turn the living room purple”
- “Lumen … all lights off”

---

## 5. Test without the Car Thing UI

From the repo (optional smoke test):

```powershell
python tools/lumen-wake.py --access-key "YOUR_KEY" --keyword-path "models\Lumen_en_windows_v3_0_0.ppn"
```

Say **Lumen**. You should see lines like:

```
WAKE Lumen
```

Ctrl+C to stop. If that works, Aura’s wake engine will work with the same key/path.

---

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| `No module named pvporcupine` | `pip install pvporcupine pvrecorder` with the **same** Python Aura calls |
| `Porcupine invalid argument` / model load fail | Wrong platform `.ppn` (Windows vs Linux) or bad path |
| Never wakes | Raise sensitivity to `0.65–0.7`; check default mic is correct in Windows sound settings |
| False wakes | Lower sensitivity to `0.35–0.45` |
| Wakes but no command | STT not running / wrong STT URL |
| Auto falls back to STT | Missing AccessKey or model path — check Aura logs |

---

## 7. Privacy / cost

- Porcupine runs **fully on-device** after you have the model; Picovoice only needed to train/download the keyword and validate the AccessKey.
- Whisper runs **only after** a wake (when using Porcupine engine).
- OpenRouter runs only for the actual command.

---

## Related

- [HARDWARE_PROBE.md](HARDWARE_PROBE.md) — crack Car Thing mics  
- [API_KEYS.md](API_KEYS.md) — OpenRouter + STT  
