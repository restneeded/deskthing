/**
 * Aura server — the DeskThing app backend.
 *
 * Responsibilities:
 *   - expose settings (API keys, voice options) in the DeskThing UI
 *   - hold the Grok + Govee + STT clients and the host mic recorder
 *   - handle messages from the Car Thing client and drive the assistant loop
 *
 * All the interesting logic lives in the sibling modules; this file is the glue.
 */
import { DeskThing } from "@deskthing/server";
import { AppSettings, DESKTHING_EVENTS } from "@deskthing/types";

import { log } from "./log.ts";
import { GoveeClient } from "./govee.ts";
import { GrokClient } from "./grok.ts";
import { SttClient } from "./stt.ts";
import { Recorder, speak, ttsAvailable, type MicRecorder } from "./audio.ts";
import { AdbRecorder } from "./adb-mic.ts";
import { executeTool } from "./tools.ts";
import { SCENES, findScene } from "./scenes.ts";
import { SETTINGS_SCHEMA, readSettings, type AuraSettings } from "./settings.ts";
import { AURA, type ServerRequest, type ActionSummary, type AuraReply } from "./types.ts";

/* ------------------------------- app state -------------------------------- */

let settings: AuraSettings | null = null;
let govee: GoveeClient | null = null;
let grok: GrokClient | null = null;
let stt: SttClient | null = null;
let recorder: MicRecorder | null = null;
let recorderKey = ""; // rebuild the recorder only when mic settings change
let busy = false;

/* ----------------------------- client transport --------------------------- */

function send(request: ServerRequest, payload?: unknown): void {
  DeskThing.send({ type: AURA, request, payload } as any);
}

function setStatus(state: string, detail?: string): void {
  send("status", { state, detail });
}

function pushConfig(): void {
  send("config", {
    hasGrok: !!settings?.grokApiKey,
    hasGovee: !!settings?.goveeApiKey,
    voiceEnabled: !!(settings?.voiceInput && recorder?.available && stt?.configured),
    model: settings?.grokModel ?? "",
    deviceCount: govee?.devices.length ?? 0,
  });
}

function pushDevices(): void {
  send("devices", { devices: govee?.devices ?? [] });
}

/* --------------------------- (re)configuration ---------------------------- */

async function configure(raw: AppSettings | null): Promise<void> {
  settings = readSettings(raw);

  govee = settings.goveeApiKey ? new GoveeClient(settings.goveeApiKey) : null;
  grok = settings.grokApiKey
    ? new GrokClient({ apiKey: settings.grokApiKey, model: settings.grokModel, govee })
    : null;
  stt = new SttClient({
    baseUrl: settings.sttBaseUrl,
    apiKey: settings.sttApiKey,
    model: settings.sttModel,
  });

  // (Re)build the mic recorder only when the mic settings actually change.
  const key = `${settings.micSource}|${settings.adbSerial}|${settings.deviceCaptureCmd}`;
  if (!recorder || key !== recorderKey) {
    recorder?.cancel();
    recorder =
      settings.micSource === "carthing"
        ? new AdbRecorder({
            serial: settings.adbSerial || undefined,
            captureCmd: settings.deviceCaptureCmd,
          })
        : new Recorder();
    recorderKey = key;
    log.info(`Mic source: ${settings.micSource} (recorder available: ${recorder.available})`);
  }

  if (govee) {
    try {
      // GrokClient reads govee.devices live at run-time, so populating the cache
      // here is enough — no need to rebuild the Grok client.
      await govee.listDevices();
    } catch (e) {
      log.error("Failed to load Govee devices:", (e as Error).message);
    }
  }

  pushConfig();
  pushDevices();
  log.info(
    `Configured — Grok:${grok ? "yes" : "no"} Govee:${govee ? "yes" : "no"} ` +
      `voice:${settings.voiceInput ? "on" : "off"} tts:${settings.speakReplies && ttsAvailable() ? "on" : "off"}`,
  );
}

/* ------------------------------ assistant loop ---------------------------- */

async function handleUtterance(text: string, showTranscript = false): Promise<void> {
  const utter = (text || "").trim();
  if (!utter) {
    setStatus("idle");
    return;
  }
  if (showTranscript) send("transcript", { text: utter });

  if (!grok) {
    replyError("Add your xAI (Grok) API key in the app settings to start talking.");
    return;
  }
  if (busy) return;
  busy = true;
  try {
    setStatus("thinking");
    const reply = await grok.run(utter, (s) => setStatus(s));
    emitReply(reply);
  } catch (e) {
    log.error("assistant error:", (e as Error).message);
    replyError((e as Error).message);
  } finally {
    busy = false;
    setStatus("idle");
  }
}

function emitReply(reply: AuraReply): void {
  send("reply", reply);
  pushDevices();
  if (settings?.speakReplies && reply.text) speak(reply.text);
}

function replyError(msg: string): void {
  const reply: AuraReply = { id: `err-${Date.now()}`, text: msg, actions: [] };
  send("status", { state: "error", detail: msg });
  send("reply", reply);
}

/** Scene buttons and quick chips bypass Grok for an instant response. */
async function applySceneDirect(sceneId: string): Promise<void> {
  const scene = findScene(sceneId);
  if (!scene) return replyError(`Unknown scene "${sceneId}".`);
  if (!govee) return replyError("Add your Govee API key in the app settings first.");
  if (busy) return;
  busy = true;
  try {
    setStatus("acting");
    const { actions } = await executeTool("apply_scene", { target: "all", scene: scene.id }, govee);
    emitReply({
      id: `scene-${Date.now()}`,
      text: sceneReplyText(scene.label, actions),
      actions,
    });
  } catch (e) {
    replyError((e as Error).message);
  } finally {
    busy = false;
    setStatus("idle");
  }
}

function sceneReplyText(label: string, actions: ActionSummary[]): string {
  const ok = actions.filter((a) => a.ok).length;
  return ok ? `${label} scene on ${ok} light${ok === 1 ? "" : "s"}.` : `Couldn't apply ${label}.`;
}

/** Direct tool execution (device on/off buttons, "all on/off" chips) — no LLM. */
async function controlDirect(tool: string, args: Record<string, unknown>): Promise<void> {
  if (!govee) return replyError("Add your Govee API key in the app settings first.");
  if (!tool || busy) return;
  busy = true;
  try {
    setStatus("acting");
    const { actions, info } = await executeTool(tool, args, govee);
    emitReply({
      id: `ctl-${Date.now()}`,
      text: info || summarizeActions(actions),
      actions,
    });
  } catch (e) {
    replyError((e as Error).message);
  } finally {
    busy = false;
    setStatus("idle");
  }
}

function summarizeActions(actions: ActionSummary[]): string {
  const ok = actions.filter((a) => a.ok);
  if (!ok.length) return "Nothing changed.";
  return ok.map((a) => `${a.target} ${a.action}`).join(", ") + ".";
}

/* ------------------------------ push-to-talk ------------------------------ */

async function pttStop(): Promise<void> {
  if (!recorder) return;
  setStatus("transcribing");
  let file: string | null = null;
  try {
    file = await recorder.stop();
    if (!file) return setStatus("idle");
    if (!stt?.configured) {
      replyError("Voice input needs an STT server — set one in the app settings.");
      return;
    }
    const transcript = await stt.transcribe(file);
    if (!transcript) {
      setStatus("idle");
      send("transcript", { text: "(didn't catch that)" });
      return;
    }
    await handleUtterance(transcript, true);
  } catch (e) {
    log.error("ptt error:", (e as Error).message);
    replyError((e as Error).message);
  } finally {
    if (file) recorder.cleanup(file);
  }
}

/* --------------------------- message dispatch ----------------------------- */

async function onClientMessage(data: any): Promise<void> {
  const request = data?.request as string;
  const payload = data?.payload ?? {};
  log.debug("client:", request, JSON.stringify(payload).slice(0, 120));

  switch (request) {
    case "get_state":
      pushConfig();
      pushDevices();
      break;
    case "refresh_devices":
      if (govee) {
        try {
          await govee.listDevices();
        } catch (e) {
          log.error("refresh failed:", (e as Error).message);
        }
      }
      pushConfig();
      pushDevices();
      break;
    case "chat":
    case "quick":
      await handleUtterance(String(payload.text ?? ""), false);
      break;
    case "scene":
      await applySceneDirect(String(payload.sceneId ?? ""));
      break;
    case "control":
      await controlDirect(String(payload.tool ?? ""), payload.args ?? {});
      break;
    case "ptt_start":
      try {
        recorder?.start();
        setStatus("listening");
      } catch (e) {
        replyError((e as Error).message);
      }
      break;
    case "ptt_stop":
      await pttStop();
      break;
    case "ptt_cancel":
      recorder?.cancel();
      setStatus("idle");
      break;
    default:
      log.warn("unknown client request:", request);
  }
}

/* ------------------------------- lifecycle -------------------------------- */

const start = async () => {
  log.info("Aura starting…");
  await DeskThing.initSettings(SETTINGS_SCHEMA);
  const raw = await DeskThing.getSettings();
  await configure(raw);
  send("status", { state: "idle" });
  log.info(`Ready. ${SCENES.length} scenes, ${govee?.devices.length ?? 0} lights.`);
};

const stop = async () => {
  recorder?.cancel();
  log.info("Aura stopped.");
};

// react to settings edits in the DeskThing UI
DeskThing.on(DESKTHING_EVENTS.SETTINGS, async (data: any) => {
  const raw = (data?.payload ?? data) as AppSettings;
  await configure(raw);
});

// all client -> server app messages ride on the "aura" type
DeskThing.on(AURA as any, onClientMessage as any);

DeskThing.on(DESKTHING_EVENTS.START, start);
DeskThing.on(DESKTHING_EVENTS.STOP, stop);
