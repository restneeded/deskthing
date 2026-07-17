/**
 * Shared message protocol between the Car Thing client (src/) and the server.
 *
 * Every message rides on a single DeskThing transit `type` of "aura" and is
 * discriminated by `request`. Keeping one type keeps the client/server wiring
 * to a single `DeskThing.on("aura", ...)` handler on each side.
 */

export const AURA = "aura" as const;

/** request values the CLIENT sends to the SERVER */
export type ClientRequest =
  | "chat" // { text }        user typed or on-device transcribed text
  | "ptt_start" //             begin host-mic recording (push-to-talk pressed)
  | "ptt_stop" //              stop recording -> transcribe -> run through Grok
  | "ptt_cancel" //            abort recording, do nothing
  | "scene" // { sceneId }     apply a built-in preset scene
  | "control" // { tool, args } run a light tool directly (instant, skips Grok)
  | "quick" // { text }        a canned command chip (routed through Grok like chat)
  | "refresh_devices" //       re-list Govee devices
  | "get_state"; //            ask for a fresh snapshot (config + devices)

/** request values the SERVER sends to the CLIENT */
export type ServerRequest =
  | "config" // { AuraConfigFlags }
  | "devices" // { devices: LightDevice[] }
  | "status" // { AuraStatus }
  | "transcript" // { text }   what the mic heard
  | "reply"; // { AuraReply }  the assistant's answer + what it did

export interface AuraConfigFlags {
  hasGrok: boolean;
  hasGovee: boolean;
  /** voice input (host mic + STT) is fully configured and available */
  voiceEnabled: boolean;
  model: string;
  deviceCount: number;
}

export type AuraState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "acting"
  | "error";

export interface AuraStatus {
  state: AuraState;
  detail?: string;
}

/** A human-readable summary of one thing the assistant did to the lights. */
export interface ActionSummary {
  target: string;
  action: string; // e.g. "turned on", "set to warm white", "dimmed to 30%"
  ok: boolean;
  error?: string;
}

export interface AuraReply {
  id: string;
  text: string;
  actions: ActionSummary[];
}

export interface LightDevice {
  /** Govee device id (a MAC-like string) */
  id: string;
  /** Govee SKU / model, e.g. "H6159" */
  sku: string;
  name: string;
  supports: {
    power: boolean;
    brightness: boolean;
    colorRgb: boolean;
    colorTemp: boolean;
  };
}
