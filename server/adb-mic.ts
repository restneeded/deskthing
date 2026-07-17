/**
 * On-device microphone capture — the "cracked mic" path.
 *
 * The Car Thing's 4 far-field mics can't be reached from Chromium, but the
 * device's Linux OS captures them fine (it did "Hey Spotify" voice). Since Aura
 * already talks to the device over ADB, we run the capture ON the Car Thing and
 * pull the audio back over the USB/ADB link — no webview involved.
 *
 * Mechanism (robust to long holds): on start we launch the device's recorder
 * (arecord or tinycap) detached, remember its PID; on stop we SIGINT it so it
 * finalizes the WAV header, then `adb pull` the file to the host for STT.
 *
 * Run `tools/superbird-mic-probe.sh` first to confirm capture works and to learn
 * the right card/device numbers.
 */
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasBin, type MicRecorder } from "./audio.ts";
import { log } from "./log.ts";

export interface AdbMicOptions {
  serial?: string; // adb device serial (optional if only one device)
  captureCmd?: "auto" | "arecord" | "tinycap";
  card?: number; // tinycap -D (ALSA card), default 0
  device?: number; // tinycap -d (subdevice), default 0
  channels?: number; // mic array is multi-channel; we downmix at STT if needed
  rate?: number;
}

const REMOTE_WAV = "/tmp/aura-mic.wav";

export class AdbRecorder implements MicRecorder {
  readonly available: boolean;
  private opts: Required<Omit<AdbMicOptions, "serial">> & { serial?: string };
  private tool: "arecord" | "tinycap" | null = null;
  private pid: string | null = null;
  private dir: string;

  constructor(opts: AdbMicOptions = {}) {
    this.available = hasBin("adb");
    this.opts = {
      serial: opts.serial?.trim() || undefined,
      captureCmd: opts.captureCmd || "auto",
      card: opts.card ?? 0,
      device: opts.device ?? 0,
      channels: opts.channels ?? 2,
      rate: opts.rate ?? 16000,
    };
    this.dir = mkdtempSync(join(tmpdir(), "aura-adbmic-"));
    if (!this.available) {
      log.warn("`adb` not found on host — install platform-tools to use Car Thing mic capture.");
    }
  }

  get recording(): boolean {
    return this.pid !== null;
  }

  private adbArgs(): string[] {
    return this.opts.serial ? ["-s", this.opts.serial] : [];
  }

  /** Run an adb shell command synchronously, return trimmed stdout. */
  private sh(cmd: string): { ok: boolean; out: string } {
    const r = spawnSync("adb", [...this.adbArgs(), "shell", cmd], {
      encoding: "utf8",
      timeout: 8000,
    });
    return { ok: r.status === 0, out: (r.stdout || "").trim() };
  }

  /** One-time: pick arecord vs tinycap based on what's on the device. */
  private detectTool(): "arecord" | "tinycap" {
    if (this.tool) return this.tool;
    if (this.opts.captureCmd !== "auto") {
      this.tool = this.opts.captureCmd;
      return this.tool;
    }
    if (this.sh("command -v arecord").out) this.tool = "arecord";
    else if (this.sh("command -v tinycap").out) this.tool = "tinycap";
    else throw new Error("Car Thing has neither `arecord` nor `tinycap` (see docs/MICROPHONE.md).");
    log.info(`Car Thing mic capture via: ${this.tool}`);
    return this.tool;
  }

  private remoteCaptureCmd(): string {
    const { card, device, channels, rate } = this.opts;
    if (this.detectTool() === "arecord") {
      // arecord writes a proper WAV and finalizes the header on SIGINT
      return `arecord -q -f S16_LE -c ${channels} -r ${rate} -t wav ${REMOTE_WAV}`;
    }
    // tinycap: records until killed; closes the file cleanly on SIGINT
    return `tinycap ${REMOTE_WAV} -D ${card} -d ${device} -c ${channels} -r ${rate} -b 16`;
  }

  start(): void {
    if (!this.available) throw new Error("adb not available");
    if (this.pid) this.forceKill();
    this.sh(`rm -f ${REMOTE_WAV}`);
    const cmd = this.remoteCaptureCmd();
    // Launch detached and echo the PID so we can signal it on stop.
    const r = this.sh(`sh -c 'nohup ${cmd} >/dev/null 2>&1 & echo __PID__$!'`);
    const m = r.out.match(/__PID__(\d+)/);
    if (!m) throw new Error(`Failed to start Car Thing capture: ${r.out || "no pid"}`);
    this.pid = m[1];
    log.debug(`Car Thing recording, remote pid ${this.pid}`);
  }

  async stop(): Promise<string | null> {
    if (!this.pid) return null;
    const pid = this.pid;
    this.pid = null;
    // SIGINT lets arecord/tinycap finalize the WAV header before it exits.
    this.sh(`kill -INT ${pid} 2>/dev/null; sleep 0.3`);

    const local = join(this.dir, `clip-${process.hrtime.bigint()}.wav`);
    await new Promise<void>((resolve) => {
      const p = spawn("adb", [...this.adbArgs(), "pull", REMOTE_WAV, local], { stdio: "ignore" });
      p.on("close", () => resolve());
      p.on("error", () => resolve());
    });
    this.sh(`rm -f ${REMOTE_WAV}`);

    if (!existsSync(local)) return null;
    try {
      // A WAV header alone is 44 bytes; anything near that means no audio.
      if (statSync(local).size <= 64) {
        rmSync(local, { force: true });
        return null;
      }
    } catch {
      /* ignore */
    }
    return local;
  }

  cancel(): void {
    this.forceKill();
    this.sh(`rm -f ${REMOTE_WAV}`);
  }

  private forceKill(): void {
    if (this.pid) {
      this.sh(`kill -KILL ${this.pid} 2>/dev/null`);
      this.pid = null;
    }
  }

  cleanup(file: string): void {
    try {
      if (existsSync(file)) rmSync(file, { force: true });
    } catch {
      /* ignore */
    }
  }
}
