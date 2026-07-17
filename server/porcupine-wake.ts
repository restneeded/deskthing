/**
 * True wake-word engine via Python Porcupine sidecar.
 * Embeds tools/lumen-wake.py so packaged DeskThing zips still work.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, isAbsolute, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { log } from "./log.ts";

/** Kept in sync with tools/lumen-wake.py */
const EMBEDDED_LUMEN_WAKE_PY = `#!/usr/bin/env python3
from __future__ import annotations
import argparse, sys

def main() -> int:
    p = argparse.ArgumentParser(description="Aura Lumen wake-word (Porcupine)")
    p.add_argument("--access-key", required=True)
    p.add_argument("--keyword-path", required=True, action="append", dest="keyword_paths")
    p.add_argument("--sensitivity", type=float, default=0.5)
    p.add_argument("--label", action="append", dest="labels")
    p.add_argument("--device-index", type=int, default=-1)
    args = p.parse_args()
    try:
        import pvporcupine
        from pvrecorder import PvRecorder
    except ImportError:
        print("ERR missing deps: pip install pvporcupine pvrecorder", file=sys.stderr, flush=True)
        return 2
    paths = args.keyword_paths
    sens = [max(0.0, min(1.0, args.sensitivity))] * len(paths)
    labels = args.labels or []
    while len(labels) < len(paths):
        labels.append(paths[len(labels)].replace("\\\\", "/").split("/")[-1].split("_")[0] or "wake")
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
        recorder = PvRecorder(frame_length=porcupine.frame_length, device_index=args.device_index)
        recorder.start()
    except Exception as e:
        porcupine.delete()
        print(f"ERR recorder: {e}", file=sys.stderr, flush=True)
        return 4
    print(f"READY sample_rate={porcupine.sample_rate} frame={porcupine.frame_length} keywords={labels}", flush=True)
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
            recorder.stop(); recorder.delete()
        except Exception:
            pass
        porcupine.delete()
    return 0

if __name__ == "__main__":
    sys.exit(main())
`;

export interface PorcupineWakeOptions {
  accessKey: string;
  modelPath: string;
  sensitivity?: number;
  pythonPath?: string;
  onWake: (label: string) => void;
  onReady?: (info: string) => void;
  onError?: (msg: string) => void;
}

function ensureScript(): string {
  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(resolve(here, "..", "tools", "lumen-wake.py"));
  } catch {
    /* ignore */
  }
  candidates.push(resolve(process.cwd(), "tools", "lumen-wake.py"));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const dir = join(tmpdir(), "aura-wake");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "lumen-wake.py");
  writeFileSync(path, EMBEDDED_LUMEN_WAKE_PY, "utf8");
  return path;
}

export function resolveModelPath(p: string): string {
  if (!p) return p;
  if (isAbsolute(p) && existsSync(p)) return p;
  for (const t of [
    p,
    resolve(process.cwd(), p),
    resolve(process.cwd(), "models", p),
    resolve(process.cwd(), "..", p),
    resolve(process.cwd(), "..", "models", p),
  ]) {
    if (existsSync(t)) return t;
  }
  return resolve(process.cwd(), p);
}

export class PorcupineWakeEngine {
  private proc: ChildProcess | null = null;
  private opts: PorcupineWakeOptions;
  private stopping = false;

  constructor(opts: PorcupineWakeOptions) {
    this.opts = opts;
  }

  get running(): boolean {
    return this.proc !== null && !this.proc.killed;
  }

  start(): boolean {
    this.stop();
    this.stopping = false;

    const key = this.opts.accessKey?.trim();
    const model = resolveModelPath(this.opts.modelPath?.trim() || "");
    if (!key) {
      this.opts.onError?.("Picovoice AccessKey is empty");
      return false;
    }
    if (!model || !existsSync(model)) {
      this.opts.onError?.(
        `Wake model .ppn not found: ${this.opts.modelPath}. Create "Lumen" at console.picovoice.ai and set the path.`,
      );
      return false;
    }

    const script = ensureScript();
    const python = this.opts.pythonPath?.trim() || "python";
    const sens = String(Math.max(0, Math.min(1, this.opts.sensitivity ?? 0.5)));

    log.info(`Starting Porcupine wake: ${python} + ${model}`);
    try {
      this.proc = spawn(
        python,
        [
          script,
          "--access-key",
          key,
          "--keyword-path",
          model,
          "--sensitivity",
          sens,
          "--label",
          "Lumen",
        ],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
      );
    } catch (e) {
      this.opts.onError?.(`Failed to spawn Python: ${(e as Error).message}`);
      this.proc = null;
      return false;
    }

    let buf = "";
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        this.handleLine(line);
      }
    });
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const t = chunk.toString("utf8").trim();
      if (t) log.warn("[lumen-wake]", t);
      if (t.startsWith("ERR")) this.opts.onError?.(t);
    });
    this.proc.on("error", (e) => {
      this.opts.onError?.(
        `Python wake error: ${e.message}. Install Python + pip install pvporcupine pvrecorder`,
      );
      this.proc = null;
    });
    this.proc.on("exit", (code) => {
      if (!this.stopping) {
        log.warn(`Porcupine wake exited (code ${code})`);
        this.opts.onError?.(`Wake process exited (code ${code})`);
      }
      this.proc = null;
    });
    return true;
  }

  private handleLine(line: string): void {
    if (!line) return;
    if (line.startsWith("READY")) {
      log.info(line);
      this.opts.onReady?.(line);
      return;
    }
    if (line.startsWith("WAKE")) {
      const label = line.slice(4).trim() || "Lumen";
      log.info(`Porcupine wake: ${label}`);
      this.opts.onWake(label);
      return;
    }
    if (line.startsWith("ERR")) this.opts.onError?.(line);
  }

  stop(): void {
    this.stopping = true;
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* ignore */
      }
      this.proc = null;
    }
  }
}

export function canUsePorcupine(accessKey: string, modelPath: string): boolean {
  if (!accessKey?.trim() || !modelPath?.trim()) return false;
  return existsSync(resolveModelPath(modelPath.trim()));
}
