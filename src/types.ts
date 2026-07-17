// UI-side mirror of the server message payloads.

export interface LightDevice {
  id: string;
  sku: string;
  name: string;
  supports: { power: boolean; brightness: boolean; colorRgb: boolean; colorTemp: boolean };
}

export interface ActionSummary {
  target: string;
  action: string;
  ok: boolean;
  error?: string;
}

export interface AuraReply {
  id: string;
  text: string;
  actions: ActionSummary[];
}

export interface AuraConfigFlags {
  hasLlm?: boolean;
  hasGrok: boolean;
  hasGovee: boolean;
  voiceEnabled: boolean;
  voiceMode?: string;
  model: string;
  provider?: string;
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

export interface Message {
  id: string;
  role: "user" | "aura";
  text: string;
  actions?: ActionSummary[];
}

export interface SceneButton {
  id: string;
  label: string;
  emoji: string;
}

export const SCENES: SceneButton[] = [
  { id: "relax", label: "Relax", emoji: "🛋️" },
  { id: "focus", label: "Focus", emoji: "💡" },
  { id: "movie", label: "Movie", emoji: "🎬" },
  { id: "party", label: "Party", emoji: "🎉" },
  { id: "sunset", label: "Sunset", emoji: "🌅" },
  { id: "sleep", label: "Sleep", emoji: "😴" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "cool", label: "Daylight", emoji: "❄️" },
];
