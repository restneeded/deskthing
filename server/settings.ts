/**
 * Settings schema shown in the DeskThing server UI, plus a typed reader.
 *
 * Keys are entered here (not in code/env) so they persist with the app and never
 * touch the repo. All values live only on the machine running DeskThing.
 */
import { AppSettings, SETTING_TYPES } from "@deskthing/types";

export const IDS = {
  grokApiKey: "grokApiKey",
  grokModel: "grokModel",
  goveeApiKey: "goveeApiKey",
  voiceInput: "voiceInput",
  micSource: "micSource",
  adbSerial: "adbSerial",
  deviceCaptureCmd: "deviceCaptureCmd",
  sttBaseUrl: "sttBaseUrl",
  sttApiKey: "sttApiKey",
  sttModel: "sttModel",
  speakReplies: "speakReplies",
} as const;

export type MicSource = "host" | "carthing";
export type DeviceCaptureCmd = "auto" | "arecord" | "tinycap";

export const DEFAULT_MODEL = "grok-4-fast-non-reasoning";
export const DEFAULT_STT_BASE = "http://localhost:8000/v1";
export const DEFAULT_STT_MODEL = "Systran/faster-whisper-base.en";

export const SETTINGS_SCHEMA: AppSettings = {
  [IDS.grokApiKey]: {
    id: IDS.grokApiKey,
    label: "xAI (Grok) API Key",
    description: "From https://console.x.ai — this is the brain.",
    type: SETTING_TYPES.STRING,
    value: "",
  },
  [IDS.grokModel]: {
    id: IDS.grokModel,
    label: "Grok Model",
    description: "A current model id from console.x.ai/models. Fast, non-reasoning models feel snappiest.",
    type: SETTING_TYPES.STRING,
    value: DEFAULT_MODEL,
  },
  [IDS.goveeApiKey]: {
    id: IDS.goveeApiKey,
    label: "Govee API Key",
    description: "Govee Home app → Settings → Apply for API Key (emailed to you).",
    type: SETTING_TYPES.STRING,
    value: "",
  },
  [IDS.voiceInput]: {
    id: IDS.voiceInput,
    label: "Voice input (push-to-talk)",
    description: "Capture audio when you hold the mic button. Needs a recorder + an STT server below.",
    type: SETTING_TYPES.BOOLEAN,
    value: false,
  },
  [IDS.micSource]: {
    id: IDS.micSource,
    label: "Microphone source",
    description:
      "Host = the DeskThing computer's mic (put a USB mic near the Car Thing). Car Thing = the device's own 4 mics, captured over ADB (run tools/superbird-mic-probe.sh first).",
    type: SETTING_TYPES.SELECT,
    value: "host",
    options: [
      { label: "Host computer mic", value: "host" },
      { label: "Car Thing mics (via ADB)", value: "carthing" },
    ],
    dependsOn: [{ settingId: IDS.voiceInput, isValue: "true" }],
  },
  [IDS.adbSerial]: {
    id: IDS.adbSerial,
    label: "ADB serial (Car Thing)",
    description: "Leave blank if only one ADB device is connected. From `adb devices`.",
    type: SETTING_TYPES.STRING,
    value: "",
    dependsOn: [{ settingId: IDS.micSource, isValue: "carthing" }],
  },
  [IDS.deviceCaptureCmd]: {
    id: IDS.deviceCaptureCmd,
    label: "Car Thing capture tool",
    description: "auto-detects arecord/tinycap on the device. Override if the probe showed only one.",
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
    description: "Local Whisper server (recommended) or https://api.openai.com/v1.",
    type: SETTING_TYPES.STRING,
    value: DEFAULT_STT_BASE,
    dependsOn: [{ settingId: IDS.voiceInput, isValue: "true" }],
  },
  [IDS.sttApiKey]: {
    id: IDS.sttApiKey,
    label: "STT API Key",
    description: "Leave blank for a local server; set it for OpenAI.",
    type: SETTING_TYPES.STRING,
    value: "",
    dependsOn: [{ settingId: IDS.voiceInput, isValue: "true" }],
  },
  [IDS.sttModel]: {
    id: IDS.sttModel,
    label: "STT model",
    description: "e.g. Systran/faster-whisper-base.en (local) or whisper-1 (OpenAI).",
    type: SETTING_TYPES.STRING,
    value: DEFAULT_STT_MODEL,
    dependsOn: [{ settingId: IDS.voiceInput, isValue: "true" }],
  },
  [IDS.speakReplies]: {
    id: IDS.speakReplies,
    label: "Speak replies out loud",
    description: "Read Aura's answers on the host speakers (macOS `say`, or espeak/piper on Linux).",
    type: SETTING_TYPES.BOOLEAN,
    value: false,
  },
};

export interface AuraSettings {
  grokApiKey: string;
  grokModel: string;
  goveeApiKey: string;
  voiceInput: boolean;
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

export function readSettings(raw: AppSettings | null): AuraSettings {
  const micSource = str(raw, IDS.micSource, "host") === "carthing" ? "carthing" : "host";
  const capRaw = str(raw, IDS.deviceCaptureCmd, "auto");
  const deviceCaptureCmd: DeviceCaptureCmd =
    capRaw === "arecord" || capRaw === "tinycap" ? capRaw : "auto";
  return {
    grokApiKey: str(raw, IDS.grokApiKey),
    grokModel: str(raw, IDS.grokModel, DEFAULT_MODEL) || DEFAULT_MODEL,
    goveeApiKey: str(raw, IDS.goveeApiKey),
    voiceInput: bool(raw, IDS.voiceInput),
    micSource,
    adbSerial: str(raw, IDS.adbSerial),
    deviceCaptureCmd,
    sttBaseUrl: str(raw, IDS.sttBaseUrl, DEFAULT_STT_BASE) || DEFAULT_STT_BASE,
    sttApiKey: str(raw, IDS.sttApiKey),
    sttModel: str(raw, IDS.sttModel, DEFAULT_STT_MODEL) || DEFAULT_STT_MODEL,
    speakReplies: bool(raw, IDS.speakReplies),
  };
}
