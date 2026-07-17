/**
 * Built-in scenes and named colors.
 *
 * We express scenes as plain RGB + brightness rather than Govee's device-specific
 * "dynamic scene" ids, so a scene works identically on every bulb/strip on the
 * account without per-model lookups.
 */
import type { RGB } from "./govee.ts";

export interface Scene {
  id: string;
  label: string;
  emoji: string;
  rgb: RGB;
  brightness: number; // 0-100
}

export const SCENES: Scene[] = [
  { id: "relax", label: "Relax", emoji: "🛋️", rgb: { r: 255, g: 147, b: 41 }, brightness: 40 },
  { id: "focus", label: "Focus", emoji: "💡", rgb: { r: 255, g: 255, b: 255 }, brightness: 100 },
  { id: "movie", label: "Movie", emoji: "🎬", rgb: { r: 40, g: 20, b: 90 }, brightness: 15 },
  { id: "party", label: "Party", emoji: "🎉", rgb: { r: 255, g: 0, b: 180 }, brightness: 90 },
  { id: "sunset", label: "Sunset", emoji: "🌅", rgb: { r: 255, g: 94, b: 20 }, brightness: 55 },
  { id: "sleep", label: "Sleep", emoji: "😴", rgb: { r: 255, g: 60, b: 0 }, brightness: 5 },
  { id: "gaming", label: "Gaming", emoji: "🎮", rgb: { r: 0, g: 255, b: 120 }, brightness: 80 },
  { id: "cool", label: "Daylight", emoji: "❄️", rgb: { r: 200, g: 220, b: 255 }, brightness: 100 },
];

export function findScene(id: string): Scene | undefined {
  const q = id.toLowerCase().trim();
  return SCENES.find((s) => s.id === q || s.label.toLowerCase() === q);
}

/** A compact named-color table Grok can lean on, but it may also emit raw RGB. */
export const NAMED_COLORS: Record<string, RGB> = {
  red: { r: 255, g: 0, b: 0 },
  orange: { r: 255, g: 120, b: 0 },
  amber: { r: 255, g: 191, b: 0 },
  yellow: { r: 255, g: 240, b: 0 },
  lime: { r: 180, g: 255, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  teal: { r: 0, g: 200, b: 180 },
  cyan: { r: 0, g: 255, b: 255 },
  blue: { r: 0, g: 60, b: 255 },
  indigo: { r: 75, g: 0, b: 255 },
  purple: { r: 160, g: 0, b: 255 },
  magenta: { r: 255, g: 0, b: 255 },
  pink: { r: 255, g: 105, b: 180 },
  white: { r: 255, g: 255, b: 255 },
  warm: { r: 255, g: 160, b: 70 },
};
