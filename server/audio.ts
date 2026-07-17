/**
 * Host-side audio: microphone capture for push-to-talk, and optional spoken
 * replies (TTS).
 *
 * WHY host-side? The Car Thing's 4 hardware mics are NOT reachable from the
 * DeskThing Chromium webview — the community never got mic access working there.
 * So Aura captures audio on the machine running the DeskThing server. Put that
 * machine (or a cheap USB mic plugged into it) next to the Car Thing and you get
 * the "walk up and talk" experience anyway. See docs/HARDWARE.md.
 *
 * Recording is controlled by the client: press-and-hold the mic button ->
 * ptt_start, release -> ptt_stop. We spawn whatever recorder is installed
 * (sox `rec`, `arecord`, or `ffmpeg`) and write a 16 kHz mono WAV.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { log } from "./log.ts";

export function hasBin(name: string): boolean {
  const probe = platform() === "win32" ? "where" : "command";
  const args = platform() === "win32" ? [name] : ["-v", name];
  const r = spawnSync(probe, args, { stdio: "ignore", shell: platform() !== "win32" });
  return r.status === 0;
}

/**
 * Common shape for anything that records a push-to-talk clip and hands back a
 * WAV path. Implemented by the host-mic `Recorder` (below) and the on-device
 * `AdbRecorder` (adb-mic.ts) that captures the Car Thing's own microphones.
 */
export interface MicRecorder {
  readonly available: boolean;
  readonly recording: boolean;
  start(): void;
  stop(): Promise<string | null>;
  cancel(): void;
  cleanup(file: string): void;
}

type RecorderKind = "sox" | "arecord" | "ffmpeg" | null;

function pickRecorder(): RecorderKind {
  if (hasBin("rec")) return "sox"; // sox's `rec` — simplest, cross-platform
  if (platform() === "linux" && hasBin("arecord")) return "arecord";
  if (hasBin("ffmpeg")) return "ffmpeg";
  return null;
}

function recorderArgs(kind: RecorderKind, outFile: string): { cmd: string; args: string[] } {
  switch (kind) {
    case "sox":
      return { cmd: "rec", args: ["-q", "-r", "16000", "-c", "1", "-b", "16", outFile] };
    case "arecord":
      return { cmd: "arecord", args: ["-q", "-f", "S16_LE", "-r", "16000", "-c", "1", outFile] };
    case "ffmpeg": {
      const input =
        platform() === "darwin"
          ? ["-f", "avfoundation", "-i", ":0"]
          : platform() === "win32"
            ? ["-f", "dshow", "-i", "audio=default"]
            : ["-f", "alsa", "-i", "default"];
      return {
        cmd: "ffmpeg",
        args: ["-hide_banner", "-loglevel", "error", "-y", ...input, "-ar", "16000", "-ac", "1", outFile],
      };
    }
    default:
      throw new Error("no recorder");
  }
}

export class Recorder implements MicRecorder {
  readonly available: boolean;
  private kind: RecorderKind;
  private proc: ChildProcess | null = null;
  private dir: string;
  private current: string | null = null;

  constructor() {
    this.kind = pickRecorder();
    this.available = this.kind !== null;
    this.dir = mkdtempSync(join(tmpdir(), "aura-audio-"));
    if (!this.available) {
      log.warn("No microphone recorder found (install `sox`, `arecord`, or `ffmpeg`). Voice input disabled.");
    } else {
      log.info(`Voice capture using: ${this.kind}`);
    }
  }

  get recording(): boolean {
    return this.proc !== null;
  }

  start(): void {
    if (!this.available) throw new Error("no recorder installed");
    if (this.proc) this.hardStop();
    const file = join(this.dir, `ptt-${process.hrtime.bigint()}.wav`);
    const { cmd, args } = recorderArgs(this.kind, file);
    this.current = file;
    this.proc = spawn(cmd, args, { stdio: "ignore" });
    this.proc.on("error", (e) => log.error("recorder error:", e.message));
  }

  /** Stop recording gracefully and return the finished WAV path. */
  async stop(): Promise<string | null> {
    if (!this.proc || !this.current) return null;
    const file = this.current;
    const proc = this.proc;
    await new Promise<void>((resolve) => {
      proc.once("close", () => resolve());
      // SIGINT lets sox/ffmpeg finalize the WAV header cleanly
      proc.kill("SIGINT");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
        resolve();
      }, 1500);
    });
    this.proc = null;
    this.current = null;
    return existsSync(file) ? file : null;
  }

  cancel(): void {
    this.hardStop();
    if (this.current && existsSync(this.current)) rmSync(this.current, { force: true });
    this.current = null;
  }

  private hardStop(): void {
    if (this.proc) {
      this.proc.kill("SIGKILL");
      this.proc = null;
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

/* --------------------------- optional spoken replies --------------------------- */

let ttsBin: { cmd: string; args: (t: string) => string[] } | null | undefined;

function pickTts() {
  if (ttsBin !== undefined) return ttsBin;
  if (platform() === "darwin" && hasBin("say")) {
    ttsBin = { cmd: "say", args: (t) => [t] };
  } else if (hasBin("espeak-ng")) {
    ttsBin = { cmd: "espeak-ng", args: (t) => [t] };
  } else if (hasBin("espeak")) {
    ttsBin = { cmd: "espeak", args: (t) => [t] };
  } else if (platform() === "win32") {
    ttsBin = { cmd: "powershell", args: () => [] }; // handled specially in speak()
  } else {
    ttsBin = null;
  }
  return ttsBin;
}

/** Speak a reply on the host's speakers. Fire-and-forget; never throws. */
export function speak(text: string): void {
  if (!text) return;
  if (platform() === "win32") {
    try {
      const p = spawn(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak([Console]::In.ReadToEnd())",
        ],
        { stdio: ["pipe", "ignore", "ignore"] },
      );
      p.stdin?.write(text);
      p.stdin?.end();
      p.on("error", () => {});
      return;
    } catch {
      return;
    }
  }
  const t = pickTts();
  if (!t) return;
  try {
    const p = spawn(t.cmd, t.args(text), { stdio: "ignore" });
    p.on("error", () => {});
  } catch {
    /* ignore */
  }
}

export function ttsAvailable(): boolean {
  if (platform() === "win32") return true;
  return pickTts() !== null;
}
