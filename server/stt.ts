/**
 * Speech-to-text.
 *
 * xAI/Grok has no transcription endpoint, so STT is a separate service. We speak
 * the OpenAI-compatible `/v1/audio/transcriptions` protocol, which lets you point
 * Aura at EITHER:
 *   - a local Whisper server (recommended: faster-whisper-server / speaches /
 *     whisper.cpp server) for low latency + full privacy, OR
 *   - OpenAI's hosted Whisper.
 *
 * Configure the base URL + model in the app settings. Default base URL targets a
 * local server on :8000.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { log } from "./log.ts";

export interface SttConfig {
  baseUrl: string; // e.g. http://localhost:8000/v1  or  https://api.openai.com/v1
  apiKey: string; // may be empty for a local server
  model: string; // e.g. "Systran/faster-whisper-base.en" or "whisper-1"
}

export class SttClient {
  constructor(private cfg: SttConfig) {}

  get configured(): boolean {
    return !!this.cfg.baseUrl && !!this.cfg.model;
  }

  update(cfg: Partial<SttConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  async transcribe(wavPath: string): Promise<string> {
    if (!this.configured) throw new Error("STT is not configured");
    const url = this.cfg.baseUrl.replace(/\/$/, "") + "/audio/transcriptions";
    const bytes = await readFile(wavPath);

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/wav" }), basename(wavPath));
    form.append("model", this.cfg.model);
    form.append("response_format", "json");
    form.append("language", "en");

    const headers: Record<string, string> = {};
    if (this.cfg.apiKey) headers["Authorization"] = `Bearer ${this.cfg.apiKey}`;

    const res = await fetch(url, { method: "POST", headers, body: form });
    const text = await res.text();
    if (!res.ok) throw new Error(`STT error ${res.status}: ${text.slice(0, 200)}`);
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // some servers return raw text
      return text.trim();
    }
    const out = (json.text || "").trim();
    log.debug("transcript:", out);
    return out;
  }
}
