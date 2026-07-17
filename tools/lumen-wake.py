#!/usr/bin/env python3
"""
True wake-word sidecar for Aura (Picovoice Porcupine).

Prints one line per detection:
  WAKE <label>

Aura's Node server reads stdout. Also usable standalone for testing.

Examples:
  python tools/lumen-wake.py --access-key KEY --keyword-path models/Lumen_en_windows_v3_0_0.ppn
  python tools/lumen-wake.py --access-key KEY --keyword-path models/Lumen.ppn --sensitivity 0.55
"""
from __future__ import annotations

import argparse
import struct
import sys
import time


def main() -> int:
    p = argparse.ArgumentParser(description="Aura Lumen wake-word (Porcupine)")
    p.add_argument("--access-key", required=True, help="Picovoice AccessKey")
    p.add_argument(
        "--keyword-path",
        required=True,
        action="append",
        dest="keyword_paths",
        help="Path to .ppn model (repeat for multiple keywords)",
    )
    p.add_argument(
        "--sensitivity",
        type=float,
        default=0.5,
        help="0.0–1.0 (higher = more sensitive)",
    )
    p.add_argument(
        "--label",
        action="append",
        dest="labels",
        help="Optional label per keyword (default: basename of .ppn)",
    )
    p.add_argument("--device-index", type=int, default=-1, help="PvRecorder device index (-1 = default)")
    args = p.parse_args()

    try:
        import pvporcupine
        from pvrecorder import PvRecorder
    except ImportError:
        print(
            "ERR missing deps: pip install pvporcupine pvrecorder",
            file=sys.stderr,
            flush=True,
        )
        return 2

    paths = args.keyword_paths
    sens = [max(0.0, min(1.0, args.sensitivity))] * len(paths)
    labels = args.labels or []
    while len(labels) < len(paths):
        labels.append(paths[len(labels)].replace("\\", "/").split("/")[-1].split("_")[0] or "wake")

    try:
        porcupine = pvporcupine.create(
            access_key=args.access_key.strip(),
            keyword_paths=paths,
            sensitivities=sens,
        )
    except Exception as e:
        print(f"ERR porcupine create: {e}", file=sys.stderr, flush=True)
        return 3

    try:
        recorder = PvRecorder(
            frame_length=porcupine.frame_length,
            device_index=args.device_index,
        )
        recorder.start()
    except Exception as e:
        porcupine.delete()
        print(f"ERR recorder: {e}", file=sys.stderr, flush=True)
        return 4

    print(
        f"READY sample_rate={porcupine.sample_rate} frame={porcupine.frame_length} keywords={labels}",
        flush=True,
    )

    try:
        while True:
            pcm = recorder.read()
            idx = porcupine.process(pcm)
            if idx >= 0:
                label = labels[idx] if idx < len(labels) else "wake"
                print(f"WAKE {label}", flush=True)
    except KeyboardInterrupt:
        print("STOP", flush=True)
    finally:
        try:
            recorder.stop()
            recorder.delete()
        except Exception:
            pass
        porcupine.delete()
    return 0


if __name__ == "__main__":
    sys.exit(main())
