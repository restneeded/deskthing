/**
 * Wake orchestration:
 *   - Porcupine (true "Lumen") when AccessKey + .ppn are set
 *   - STT rolling-window fallback otherwise
 *
 * After wake: record command window → STT → assistant.
 */
import { log } from "./log.ts";
import type { MicRecorder } from "./audio.ts";
import type { SttClient } from "./stt.ts";
import {
  PorcupineWakeEngine,
  canUsePorcupine,
} from "./porcupine-wake.ts";

export type WakeEngineKind = "auto" | "porcupine" | "stt";

export interface WakeLoopOptions {
  getRecorder: () => MicRecorder | null;
  getStt: () => SttClient | null;
  getWakeWords: () => string[];
  getEngine: () => WakeEngineKind;
  getPicovoiceKey: () => string;
  getModelPath: () => string;
  getSensitivity: () => number;
  getPythonPath: () => string;
  isBusy: () => boolean;
  isEnabled: () => boolean;
  onStatus: (state: string, detail?: string) => void;
  onUtterance: (text: string) => Promise<void>;
  listenWindowSec?: number;
  commandWindowSec?: number;
  idleGapMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

export function matchesWake(transcript: string, wakeWords: string[]): string | null {
  const t = normalizeSpeech(transcript);
  if (!t) return null;
  for (const w of wakeWords) {
    if (!w) continue;
    if (t === w || t.startsWith(w + " ") || t.includes(" " + w + " ") || t.endsWith(" " + w)) {
      return w;
    }
    if (t.includes(w)) return w;
  }
  return null;
}

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
    Pick<WakeLoopOptions, "listenWindowSec" | "commandWindowSec" | "idleGapMs">
  > &
    WakeLoopOptions;
  private running = false;
  private sttLoop = false;
  private porcupine: PorcupineWakeEngine | null = null;
  private capturingCommand = false;

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
    log.info("Wake loop starting…");
    void this.bootstrap();
  }

  stop(): void {
    this.running = false;
    this.sttLoop = false;
    this.porcupine?.stop();
    this.porcupine = null;
    log.info("Wake loop stopped");
  }

  private resolveEngine(): "porcupine" | "stt" {
    const want = this.opts.getEngine();
    const key = this.opts.getPicovoiceKey();
    const model = this.opts.getModelPath();
    const porcupineOk = canUsePorcupine(key, model);
    if (want === "porcupine") return porcupineOk ? "porcupine" : "stt";
    if (want === "stt") return "stt";
    // auto
    return porcupineOk ? "porcupine" : "stt";
  }

  private async bootstrap(): Promise<void> {
    if (!this.running) return;
    const engine = this.resolveEngine();
    if (engine === "porcupine") {
      this.startPorcupine();
    } else {
      log.info("Wake engine: STT fallback (set Picovoice key + Lumen .ppn for true wake)");
      this.opts.onStatus("idle", "wake: STT fallback — say Lumen");
      this.sttLoop = true;
      void this.runSttLoop();
    }
  }

  private startPorcupine(): void {
    this.porcupine?.stop();
    this.porcupine = new PorcupineWakeEngine({
      accessKey: this.opts.getPicovoiceKey(),
      modelPath: this.opts.getModelPath(),
      sensitivity: this.opts.getSensitivity(),
      pythonPath: this.opts.getPythonPath(),
      onReady: () => {
        this.opts.onStatus("idle", 'listening for "Lumen"');
      },
      onError: (msg) => {
        log.warn("Porcupine error, falling back to STT:", msg);
        this.opts.onStatus("idle", "Porcupine failed — STT fallback");
        this.porcupine?.stop();
        this.porcupine = null;
        if (this.running && !this.sttLoop) {
          this.sttLoop = true;
          void this.runSttLoop();
        }
      },
      onWake: (label) => {
        void this.afterWake(label);
      },
    });
    const ok = this.porcupine.start();
    if (!ok) {
      this.porcupine = null;
      this.sttLoop = true;
      void this.runSttLoop();
    } else {
      log.info("Wake engine: Porcupine (true Lumen)");
    }
  }

  private async afterWake(label: string): Promise<void> {
    if (!this.running || this.opts.isBusy() || this.capturingCommand) return;
    this.capturingCommand = true;
    try {
      this.opts.onStatus("listening", `heard "${label}" — speak your command`);
      const rec = this.opts.getRecorder();
      const stt = this.opts.getStt();
      if (!rec?.available || !stt?.configured) {
        this.opts.onStatus("idle", "mic or STT not ready for command");
        return;
      }
      // Brief gap so "Lumen" isn't the whole command clip
      await sleep(200);
      const file = await recordFor(rec, this.opts.commandWindowSec);
      if (!file) {
        this.opts.onStatus("idle", "didn't catch a command");
        return;
      }
      this.opts.onStatus("transcribing");
      const raw = await stt.transcribe(file);
      rec.cleanup(file);
      const command = stripWake(raw, normalizeSpeech(label));
      if (!command) {
        this.opts.onStatus("idle", "didn't catch a command");
        return;
      }
      await this.opts.onUtterance(command);
    } catch (e) {
      log.warn("afterWake error:", (e as Error).message);
      this.opts.onStatus("idle");
    } finally {
      this.capturingCommand = false;
      if (this.running && this.porcupine?.running) {
        this.opts.onStatus("idle", 'listening for "Lumen"');
      }
    }
  }

  private async runSttLoop(): Promise<void> {
    while (this.running && this.sttLoop) {
      try {
        if (!this.opts.isEnabled()) {
          await sleep(800);
          continue;
        }
        if (this.opts.isBusy() || this.capturingCommand) {
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

        this.opts.onStatus("idle", "listening for wake word (STT)");
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

          log.info(`STT wake hit: "${hit}" (from "${transcript}")`);
          this.opts.onStatus("listening", `heard "${hit}" — speak your command`);

          const cmdFile = await recordFor(rec, this.opts.commandWindowSec);
          if (!cmdFile) {
            this.opts.onStatus("idle");
            continue;
          }
          this.opts.onStatus("transcribing");
          const cmdRaw = await stt.transcribe(cmdFile);
          rec.cleanup(cmdFile);

          let command = stripWake(cmdRaw || transcript, hit);
          if (!command || command === hit) command = stripWake(transcript, hit);
          if (!command) {
            this.opts.onStatus("idle", "didn't catch a command");
            continue;
          }
          await this.opts.onUtterance(command);
        } catch (e) {
          log.warn("STT wake tick error:", (e as Error).message);
          if (file && rec) rec.cleanup(file);
          this.opts.onStatus("idle");
          await sleep(800);
        }
      } catch (e) {
        log.error("STT wake loop error:", (e as Error).message);
        await sleep(1000);
      }
    }
  }
}
