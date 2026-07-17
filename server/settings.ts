/**
 * Settings schema shown in the DeskThing server UI, plus a typed reader.
 *
 * Keys live only on the machine running DeskThing — never in the repo.
 */
import { AppSettings, SETTING_TYPES } from "@deskthing/types";
import {
  DEFAULT_MODELS,
  PROVIDER_BASES,
  type LlmProvider,
} from "./llm.ts";

export type MicSource = "host" | "carthing";
export type DeviceCaptureCmd = "auto" | "arecord" | "tinycap";
export type VoiceMode = "off" | "ptt" | "wake";

export const IDS = {
  llmProvider: "llmProvider",
  llmApiKey: "llmApiKey",
  llmModel: "llmModel",
  llmBaseUrl: "llmBaseUrl",
  goveeApiKey: "goveeApiKey",
  voiceMode: "voiceMode",
  wakeWords: "wakeWords",
  micSource: "micSource",
  adbSerial: "adbSerial",
  deviceCaptureCmd: "deviceCaptureCmd",
  sttBaseUrl: "sttBaseUrl",
  sttApiKey: "sttApiKey",
  sttModel: "sttModel",
  speakReplies: "speakReplies",
  // legacy keys (migrated on read)
  grokApiKey: "grokApiKey",
  grokModel: "grokModel",
  voiceInput: "voiceInput",
} as const;

export const DEFAULT_STT_BASE = "http://localhost:8000/v1";
export const DEFAULT_STT_MODEL = "Systran/faster-whisper-base.en";
export const DEFAULT_WAKE_WORDS = "hey aura, aura";

export const SETTINGS_SCHEMA: AppSettings = {
  [IDS.llmProvider]: {
    id: IDS.llmProvider,
    label: "LLM provider",
    description:
      "OpenRouter = one key, any model (recommended). xAI = Grok direct. Custom = any OpenAI-compatible base URL.",
    type: SETTING_TYPES.SELECT,
    value: "openrouter",
    options: [
      { label: "OpenRouter (any model)", value: "openrouter" },
      { label: "xAI (Grok direct)", value: "xai" },
      { label: "Custom OpenAI-compatible", value: "custom" },
    ],
  },
  [IDS.llmApiKey]: {
    id: IDS.llmApiKey,
    label: "LLM API Key",
    description: "OpenRouter: openrouter.ai/keys · xAI: console.x.ai · Custom: your provider key",
    type: SETTING_TYPES.STRING,
    value: "",
  },
  [IDS.llmModel]: {
    id: IDS.llmModel,
    label: "Model id",
    description:
      "OpenRouter examples: openai/gpt-4o-mini, anthropic/claude-3.5-sonnet, x-ai/grok-4-fast, google/gemini-2.0-flash-001. Copy any model slug from the provider.",
    type: SETTING_TYPES.STRING,
    value: DEFAULT_MODELS.openrouter,
  },
  [IDS.llmBaseUrl]: {
    id: IDS.llmBaseUrl,
    label: "Custom API base URL",
    description: "Only for Custom provider. e.g. https://api.openai.com/v1 or a local llama.cpp server.",
    type: SETTING_TYPES.STRING,
    value: "",
    dependsOn: [{ settingId: IDS.llmProvider, isValue: "custom" }],
  },
  [IDS.goveeApiKey]: {
    id: IDS.goveeApiKey,
    label: "Govee API Key",
    description: "Govee Home app → Settings → Apply for API Key (emailed to you).",
    type: SETTING_TYPES.STRING,
    value: "",
  },
  [IDS.voiceMode]: {
    id: IDS.voiceMode,
    label: "Voice mode",
    description:
      "Off = type only. Push-to-talk = hold mic button. Wake word = always listening for phrases like \"hey aura\" then your command (needs STT + mic).",
    type: SETTING_TYPES.SELECT,
    value: "off",
    options: [
      { label: "Off (type only)", value: "off" },
      { label: "Push-to-talk", value: "ptt" },
      { label: "Wake word (always listening)", value: "wake" },
    ],
  },
  [IDS.wakeWords]: {
    id: IDS.wakeWords,
    label: "Wake words",
    description: 'Comma-separated. Default: "hey aura, aura". Spoken phrases that start a command.',
    type: SETTING_TYPES.STRING,
    value: DEFAULT_WAKE_WORDS,
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.micSource]: {
    id: IDS.micSource,
    label: "Microphone source",
    description:
      "Host = DeskThing PC mic (USB mic near Car Thing works). Car Thing = device's own 4 mics over ADB (run tools/superbird-mic-probe first).",
    type: SETTING_TYPES.SELECT,
    value: "host",
    options: [
      { label: "Host computer mic", value: "host" },
      { label: "Car Thing mics (via ADB)", value: "carthing" },
    ],
  },
  [IDS.adbSerial]: {
    id: IDS.adbSerial,
    label: "ADB serial (Car Thing)",
    description: "Leave blank if only one ADB device. From `adb devices`.",
    type: SETTING_TYPES.STRING,
    value: "",
    dependsOn: [{ settingId: IDS.micSource, isValue: "carthing" }],
  },
  [IDS.deviceCaptureCmd]: {
    id: IDS.deviceCaptureCmd,
    label: "Car Thing capture tool",
    description: "Auto-detects arecord/tinycap. Override if the probe showed only one.",
    type: SETTING_TYPES.SELECT,
    value: "auto",
    options: [
      { label: "Auto-detect", value: "auto" },
      { label: "arecord", value: "arecord" },
      { label: "tinycap (tinyalsa)", value: "tinycap" },
    ],
    dependsOn: [{ settingId: IDS.micSource, isValue: "carthing" }],
  },
  [IDS.sttBaseUrl]: {
    id: IDS.sttBaseUrl,
    label: "STT server URL (OpenAI-compatible)",
    description: "Local Whisper (recommended) or https://api.openai.com/v1. Required for push-to-talk and wake word.",
    type: SETTING_TYPES.STRING,
    value: DEFAULT_STT_BASE,
  },
  [IDS.sttApiKey]: {
    id: IDS.sttApiKey,
    label: "STT API Key",
    description: "Leave blank for a local server; set for OpenAI / hosted STT.",
    type: SETTING_TYPES.STRING,
    value: "",
  },
  [IDS.sttModel]: {
    id: IDS.sttModel,
    label: "STT model",
    description: "e.g. Systran/faster-whisper-base.en (local) or whisper-1 (OpenAI).",
    type: SETTING_TYPES.STRING,
    value: DEFAULT_STT_MODEL,
  },
  [IDS.speakReplies]: {
    id: IDS.speakReplies,
    label: "Speak replies out loud",
    description: "Host TTS: macOS `say`, Linux espeak, Windows PowerShell SAPI.",
    type: SETTING_TYPES.BOOLEAN,
    value: false,
  },
};

export interface AuraSettings {
  llmProvider: LlmProvider;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  goveeApiKey: string;
  voiceMode: VoiceMode;
  wakeWords: string;
  micSource: MicSource;
  adbSerial: string;
  deviceCaptureCmd: DeviceCaptureCmd;
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
  speakReplies: boolean;
}

function str(s: AppSettings | null, id: string, fallback = ""): string {
  const v = s?.[id]?.value;
  return typeof v === "string" ? v : fallback;
}
function bool(s: AppSettings | null, id: string, fallback = false): boolean {
  const v = s?.[id]?.value;
  return typeof v === "boolean" ? v : fallback;
}

function asProvider(v: string): LlmProvider {
  if (v === "xai" || v === "custom" || v === "openrouter") return v;
  return "openrouter";
}

function asVoiceMode(raw: AppSettings | null): VoiceMode {
  const mode = str(raw, IDS.voiceMode, "");
  if (mode === "ptt" || mode === "wake" || mode === "off") return mode;
  // migrate legacy boolean voiceInput
  if (bool(raw, IDS.voiceInput, false)) return "ptt";
  return "off";
}

export function resolveLlmBaseUrl(provider: LlmProvider, custom: string): string {
  if (provider === "custom") {
    return (custom || "https://api.openai.com/v1").replace(/\/+$/, "");
  }
  return PROVIDER_BASES[provider];
}

export function readSettings(raw: AppSettings | null): AuraSettings {
  const llmProvider = asProvider(str(raw, IDS.llmProvider, "openrouter"));

  // Prefer new keys; fall back to legacy grok* settings so existing installs keep working.
  const llmApiKey =
    str(raw, IDS.llmApiKey) || str(raw, IDS.grokApiKey);
  const llmModel =
    str(raw, IDS.llmModel) ||
    str(raw, IDS.grokModel) ||
    DEFAULT_MODELS[llmProvider];

  const micSource = str(raw, IDS.micSource, "host") === "carthing" ? "carthing" : "host";
  const capRaw = str(raw, IDS.deviceCaptureCmd, "auto");
  const deviceCaptureCmd: DeviceCaptureCmd =
    capRaw === "arecord" || capRaw === "tinycap" ? capRaw : "auto";

  return {
    llmProvider,
    llmApiKey,
    llmModel: llmModel || DEFAULT_MODELS[llmProvider],
    llmBaseUrl: str(raw, IDS.llmBaseUrl),
    goveeApiKey: str(raw, IDS.goveeApiKey),
    voiceMode: asVoiceMode(raw),
    wakeWords: str(raw, IDS.wakeWords, DEFAULT_WAKE_WORDS) || DEFAULT_WAKE_WORDS,
    micSource,
    adbSerial: str(raw, IDS.adbSerial),
    deviceCaptureCmd,
    sttBaseUrl: str(raw, IDS.sttBaseUrl, DEFAULT_STT_BASE) || DEFAULT_STT_BASE,
    sttApiKey: str(raw, IDS.sttApiKey),
    sttModel: str(raw, IDS.sttModel, DEFAULT_STT_MODEL) || DEFAULT_STT_MODEL,
    speakReplies: bool(raw, IDS.speakReplies),
  };
}
