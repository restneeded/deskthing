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
export type WakeEngineSetting = "auto" | "porcupine" | "stt";

export const IDS = {
  llmProvider: "llmProvider",
  llmApiKey: "llmApiKey",
  llmModel: "llmModel",
  llmBaseUrl: "llmBaseUrl",
  goveeApiKey: "goveeApiKey",
  voiceMode: "voiceMode",
  wakeEngine: "wakeEngine",
  wakeWords: "wakeWords",
  picovoiceAccessKey: "picovoiceAccessKey",
  wakeModelPath: "wakeModelPath",
  wakeSensitivity: "wakeSensitivity",
  pythonPath: "pythonPath",
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
export const DEFAULT_WAKE_WORDS = "Lumen";
export const DEFAULT_WAKE_MODEL = "models/Lumen_en_windows_v3_0_0.ppn";

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
      'Off = type only. Push-to-talk = hold mic. Wake word = listen for "Lumen" (true Porcupine) then your command.',
    type: SETTING_TYPES.SELECT,
    value: "off",
    options: [
      { label: "Off (type only)", value: "off" },
      { label: "Push-to-talk", value: "ptt" },
      { label: "Wake word (Lumen)", value: "wake" },
    ],
  },
  [IDS.wakeEngine]: {
    id: IDS.wakeEngine,
    label: "Wake engine",
    description:
      "Auto = Porcupine when AccessKey + .ppn exist, else STT. Porcupine = true on-device keyword. STT = Whisper rolling clips (fallback).",
    type: SETTING_TYPES.SELECT,
    value: "auto",
    options: [
      { label: "Auto (prefer true Lumen)", value: "auto" },
      { label: "Porcupine (true)", value: "porcupine" },
      { label: "STT fallback only", value: "stt" },
    ],
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.wakeWords]: {
    id: IDS.wakeWords,
    label: "Wake words (STT fallback / label)",
    description: 'Default: Lumen. Used for STT fallback matching and UI text.',
    type: SETTING_TYPES.STRING,
    value: DEFAULT_WAKE_WORDS,
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.picovoiceAccessKey]: {
    id: IDS.picovoiceAccessKey,
    label: "Picovoice AccessKey",
    description: "From console.picovoice.ai — required for true Lumen wake (Porcupine).",
    type: SETTING_TYPES.STRING,
    value: "",
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.wakeModelPath]: {
    id: IDS.wakeModelPath,
    label: "Wake model path (.ppn)",
    description:
      'Path to your Lumen Porcupine model, e.g. C:\\…\\Lumen_en_windows_v3_0_0.ppn — see docs/WAKE_WORD.md',
    type: SETTING_TYPES.STRING,
    value: DEFAULT_WAKE_MODEL,
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.wakeSensitivity]: {
    id: IDS.wakeSensitivity,
    label: "Wake sensitivity (0–1)",
    description: "Higher = easier to trigger. Default 0.5. Try 0.65 if it misses Lumen.",
    type: SETTING_TYPES.STRING,
    value: "0.5",
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.pythonPath]: {
    id: IDS.pythonPath,
    label: "Python path",
    description: "python or full path to python.exe (needs: pip install pvporcupine pvrecorder)",
    type: SETTING_TYPES.STRING,
    value: "python",
    dependsOn: [{ settingId: IDS.voiceMode, isValue: "wake" }],
  },
  [IDS.micSource]: {
    id: IDS.micSource,
    label: "Microphone source",
    description:
      "Host = DeskThing PC mic. Car Thing = device mics over ADB — run tools/superbird-mic-probe.ps1 first (docs/HARDWARE_PROBE.md).",
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
  wakeEngine: WakeEngineSetting;
  wakeWords: string;
  picovoiceAccessKey: string;
  wakeModelPath: string;
  wakeSensitivity: number;
  pythonPath: string;
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
  if (bool(raw, IDS.voiceInput, false)) return "ptt";
  return "off";
}

function asWakeEngine(v: string): WakeEngineSetting {
  if (v === "porcupine" || v === "stt" || v === "auto") return v;
  return "auto";
}

export function resolveLlmBaseUrl(provider: LlmProvider, custom: string): string {
  if (provider === "custom") {
    return (custom || "https://api.openai.com/v1").replace(/\/+$/, "");
  }
  return PROVIDER_BASES[provider];
}

export function readSettings(raw: AppSettings | null): AuraSettings {
  const llmProvider = asProvider(str(raw, IDS.llmProvider, "openrouter"));

  const llmApiKey = str(raw, IDS.llmApiKey) || str(raw, IDS.grokApiKey);
  const llmModel =
    str(raw, IDS.llmModel) ||
    str(raw, IDS.grokModel) ||
    DEFAULT_MODELS[llmProvider];

  const micSource = str(raw, IDS.micSource, "host") === "carthing" ? "carthing" : "host";
  const capRaw = str(raw, IDS.deviceCaptureCmd, "auto");
  const deviceCaptureCmd: DeviceCaptureCmd =
    capRaw === "arecord" || capRaw === "tinycap" ? capRaw : "auto";

  const sensRaw = parseFloat(str(raw, IDS.wakeSensitivity, "0.5"));
  const wakeSensitivity = Number.isFinite(sensRaw) ? Math.max(0, Math.min(1, sensRaw)) : 0.5;

  return {
    llmProvider,
    llmApiKey,
    llmModel: llmModel || DEFAULT_MODELS[llmProvider],
    llmBaseUrl: str(raw, IDS.llmBaseUrl),
    goveeApiKey: str(raw, IDS.goveeApiKey),
    voiceMode: asVoiceMode(raw),
    wakeEngine: asWakeEngine(str(raw, IDS.wakeEngine, "auto")),
    wakeWords: str(raw, IDS.wakeWords, DEFAULT_WAKE_WORDS) || DEFAULT_WAKE_WORDS,
    picovoiceAccessKey: str(raw, IDS.picovoiceAccessKey),
    wakeModelPath: str(raw, IDS.wakeModelPath, DEFAULT_WAKE_MODEL) || DEFAULT_WAKE_MODEL,
    wakeSensitivity,
    pythonPath: str(raw, IDS.pythonPath, "python") || "python",
    micSource,
    adbSerial: str(raw, IDS.adbSerial),
    deviceCaptureCmd,
    sttBaseUrl: str(raw, IDS.sttBaseUrl, DEFAULT_STT_BASE) || DEFAULT_STT_BASE,
    sttApiKey: str(raw, IDS.sttApiKey),
    sttModel: str(raw, IDS.sttModel, DEFAULT_STT_MODEL) || DEFAULT_STT_MODEL,
    speakReplies: bool(raw, IDS.speakReplies),
  };
}
