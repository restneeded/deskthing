/**
 * Wake-word continuous listening.
 *
 * Pipeline (v1 — no native openWakeWord binary required):
 *   1. Record a short rolling clip (listen window)
 *   2. STT it
 *   3. If transcript contains a configured wake phrase → record a longer command clip
 *   4. STT command → strip wake phrase → hand off to the assistant
 *
 * This is deliberately STT-based so it works on Windows/mac/Linux with the same
 * Whisper server you already configure. Later we can swap step 1–3 for openWakeWord
 * / porcupine on the host for lower latency and zero cloud/STT cost while idle.
 */
import { log } from "./log.ts";
import type { MicRecorder } from "./audio.ts";
import type { SttClient } from "./stt.ts";

export interface WakeLoopOptions {
  getRecorder: () => MicRecorder | null;
  getStt: () => SttClient | null;
  getWakeWords: () => string[];
  /** True while assistant is mid-turn or PTT is active — skip ticks. */
  isBusy: () => boolean;
  /** Whether wake mode is still enabled. */
  isEnabled: () => boolean;
  onStatus: (state: string, detail?: string) => void;
  onUtterance: (text: string) => Promise<void>;
  /** Seconds of audio to scan for the wake phrase. */
  listenWindowSec?: number;
  /** Seconds of audio to capture as the command after wake. */
  commandWindowSec?: number;
  /** Pause between failed listen windows. */
  idleGapMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Normalize text for loose wake matching. */
export function normalizeSpeech(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWakeWords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((w) => normalizeSpeech(w))
    .filter((w) => w.length >= 2);
}

/** True if transcript contains any wake phrase as a whole substring. */
export function matchesWake(transcript: string, wakeWords: string[]): string | null {
  const t = normalizeSpeech(transcript);
  if (!t) return null;
  for (const w of wakeWords) {
    if (!w) continue;
    // word-boundary-ish: phrase appears as its own chunk
    if (t === w || t.startsWith(w + " ") || t.includes(" " + w + " ") || t.endsWith(" " + w)) {
      return w;
    }
    // also allow tight match without spaces for short names like "aura"
    if (t.includes(w)) return w;
  }
  return null;
}

/** Remove the wake phrase from the start of a command transcript when present. */
export function stripWake(transcript: string, wakeWord: string | null): string {
  let t = normalizeSpeech(transcript);
  if (wakeWord && t.startsWith(wakeWord)) {
    t = t.slice(wakeWord.length).trim();
  }
  return t;
}

async function recordFor(rec: MicRecorder, seconds: number): Promise<string | null> {
  rec.start();
  await sleep(Math.max(0.4, seconds) * 1000);
  return rec.stop();
}

export class WakeLoop {
  private opts: Required<
    Pick<
      WakeLoopOptions,
      "listenWindowSec" | "commandWindowSec" | "idleGapMs"
    >
  > &
    WakeLoopOptions;
  private running = false;

  constructor(opts: WakeLoopOptions) {
    this.opts = {
      listenWindowSec: 1.8,
      commandWindowSec: 5,
      idleGapMs: 350,
      ...opts,
    };
  }

  get active(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    log.info("Wake loop started");
    void this.run().catch((e) => {
      log.error("wake loop crashed:", (e as Error).message);
      this.running = false;
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    log.info("Wake loop stopped");
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        if (!this.opts.isEnabled()) {
          await sleep(800);
          continue;
        }
        if (this.opts.isBusy()) {
          await sleep(400);
          continue;
        }

        const rec = this.opts.getRecorder();
        const stt = this.opts.getStt();
        const words = this.opts.getWakeWords();
        if (!rec?.available || !stt?.configured || !words.length) {
          await sleep(1500);
          continue;
        }

        // Idle listen window
        this.opts.onStatus("idle", "listening for wake word");
        let file: string | null = null;
        try {
          file = await recordFor(rec, this.opts.listenWindowSec);
          if (!file || !this.running || this.opts.isBusy()) {
            if (file) rec.cleanup(file);
            await sleep(this.opts.idleGapMs);
            continue;
          }
          const transcript = await stt.transcribe(file);
          rec.cleanup(file);
          file = null;

          const hit = matchesWake(transcript, words);
          if (!hit) {
            await sleep(this.opts.idleGapMs);
            continue;
          }

          log.info(`Wake phrase hit: "${hit}" (from "${transcript}")`);
          this.opts.onStatus("listening", `heard "${hit}" — speak your command`);

          // Command window
          const cmdFile = await recordFor(rec, this.opts.commandWindowSec);
          if (!cmdFile) {
            this.opts.onStatus("idle");
            continue;
          }
          this.opts.onStatus("transcribing");
          const cmdRaw = await stt.transcribe(cmdFile);
          rec.cleanup(cmdFile);

          // Prefer command audio; if empty, maybe the whole utterance was in the first clip
          let command = stripWake(cmdRaw || transcript, hit);
          if (!command || command === hit) {
            command = stripWake(transcript, hit);
          }
          if (!command) {
            this.opts.onStatus("idle", "didn't catch a command");
            continue;
          }

          await this.opts.onUtterance(command);
        } catch (e) {
          log.warn("wake tick error:", (e as Error).message);
          if (file && rec) rec.cleanup(file);
          this.opts.onStatus("idle");
          await sleep(800);
        }
      } catch (e) {
        log.error("wake loop error:", (e as Error).message);
        await sleep(1000);
      }
    }
  }
}
