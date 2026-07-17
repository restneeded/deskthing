/**
 * The "hands" of the assistant: the function/tool schema we hand to Grok, plus
 * the executor that turns a tool call into real Govee API calls.
 *
 * Grok decides *what* to do (which is the smart part). This file is the dumb,
 * deterministic bridge that actually pokes the lights and reports back what
 * happened in plain language.
 */
import type { GoveeClient, RGB } from "./govee.ts";
import type { ActionSummary, LightDevice } from "./types.ts";
import { NAMED_COLORS, SCENES, findScene } from "./scenes.ts";

/** OpenAI/Grok-compatible tool definitions. */
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "set_power",
      description: "Turn lights on or off.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: 'A room/light name, or "all" for every light.' },
          on: { type: "boolean", description: "true = on, false = off" },
        },
        required: ["target", "on"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_brightness",
      description: "Set brightness as a percentage from 1 to 100.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string" },
          brightness: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["target", "brightness"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_color",
      description:
        "Set an RGB color. Provide either a common color name in `color`, or explicit `rgb`.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string" },
          color: { type: "string", description: "e.g. red, warm, teal, magenta" },
          rgb: {
            type: "object",
            properties: {
              r: { type: "integer", minimum: 0, maximum: 255 },
              g: { type: "integer", minimum: 0, maximum: 255 },
              b: { type: "integer", minimum: 0, maximum: 255 },
            },
          },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_white",
      description:
        "Set a white color temperature. Use `kelvin` (2000 warm to 9000 cool) or `warmth` word.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string" },
          kelvin: { type: "integer", minimum: 2000, maximum: 9000 },
          warmth: { type: "string", enum: ["warm", "neutral", "cool", "daylight"] },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_scene",
      description: `Apply a preset scene. Available scenes: ${SCENES.map((s) => s.id).join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          target: { type: "string" },
          scene: { type: "string", enum: SCENES.map((s) => s.id) },
        },
        required: ["target", "scene"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_lights",
      description: "List the names of the lights the user has, and what each supports.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

const ALL_WORDS = new Set([
  "all", "everything", "every light", "all lights", "house", "home", "whole house", "*",
]);

/** Resolve a spoken target ("bedroom", "all") to concrete devices. */
export function resolveTargets(target: string, devices: LightDevice[]): LightDevice[] {
  const q = (target || "").toLowerCase().trim();
  if (!q || ALL_WORDS.has(q)) return devices;

  // exact name
  const exact = devices.filter((d) => d.name.toLowerCase() === q);
  if (exact.length) return exact;

  // substring either direction
  const sub = devices.filter(
    (d) => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()),
  );
  if (sub.length) return sub;

  // token overlap (e.g. "living room lamp" vs "Living Room")
  const qt = new Set(q.split(/\s+/));
  const scored = devices
    .map((d) => {
      const dt = d.name.toLowerCase().split(/\s+/);
      const overlap = dt.filter((t) => qt.has(t)).length;
      return { d, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return scored.length ? [scored[0].d] : [];
}

interface ToolArgs {
  target?: string;
  on?: boolean;
  brightness?: number;
  color?: string;
  rgb?: RGB;
  kelvin?: number;
  warmth?: string;
  scene?: string;
}

const WARMTH_K: Record<string, number> = {
  warm: 2400,
  neutral: 4000,
  cool: 6000,
  daylight: 6500,
};

/**
 * Execute one tool call. Returns a per-device summary; never throws for a single
 * device failure (we collect the error into the summary so Grok can explain it).
 * `list_lights` returns [] for actions and stuffs its answer into `info`.
 */
export async function executeTool(
  name: string,
  args: ToolArgs,
  govee: GoveeClient,
): Promise<{ actions: ActionSummary[]; info?: string }> {
  const devices = govee.devices;

  if (name === "list_lights") {
    if (!devices.length) return { actions: [], info: "No lights are set up yet." };
    const lines = devices.map((d) => {
      const caps = Object.entries(d.supports)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ");
      return `${d.name} (${d.sku}) — ${caps}`;
    });
    return { actions: [], info: lines.join("\n") };
  }

  const targets = resolveTargets(args.target || "all", devices);
  if (!targets.length) {
    return {
      actions: [
        {
          target: args.target || "?",
          action: "no match",
          ok: false,
          error: `Couldn't find a light called "${args.target}". Known: ${devices
            .map((d) => d.name)
            .join(", ") || "none"}.`,
        },
      ],
    };
  }

  const summaries: ActionSummary[] = [];
  for (const dev of targets) {
    try {
      const action = await applyOne(name, args, dev, govee);
      summaries.push({ target: dev.name, action, ok: true });
    } catch (err) {
      summaries.push({
        target: dev.name,
        action: name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { actions: summaries };
}

async function applyOne(
  name: string,
  args: ToolArgs,
  dev: LightDevice,
  govee: GoveeClient,
): Promise<string> {
  switch (name) {
    case "set_power":
      await govee.setPower(dev, !!args.on);
      return args.on ? "turned on" : "turned off";

    case "set_brightness": {
      const pct = clampPct(args.brightness ?? 100);
      await govee.setBrightness(dev, pct);
      return `set to ${pct}%`;
    }

    case "set_color": {
      const rgb = resolveColor(args);
      if (!rgb) throw new Error("no color provided");
      await govee.setColorRgb(dev, rgb);
      return `set to ${args.color || `rgb(${rgb.r},${rgb.g},${rgb.b})`}`;
    }

    case "set_white": {
      const k = args.kelvin ?? WARMTH_K[(args.warmth || "neutral").toLowerCase()] ?? 4000;
      await govee.setColorTemp(dev, k);
      return `set to ${k}K white`;
    }

    case "apply_scene": {
      const scene = findScene(args.scene || "");
      if (!scene) throw new Error(`unknown scene "${args.scene}"`);
      if (dev.supports.power) await govee.setPower(dev, true);
      if (dev.supports.colorRgb) await govee.setColorRgb(dev, scene.rgb);
      if (dev.supports.brightness) await govee.setBrightness(dev, scene.brightness);
      return `set to "${scene.label}"`;
    }

    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

function resolveColor(args: ToolArgs): RGB | null {
  if (args.rgb && typeof args.rgb.r === "number") return args.rgb;
  if (args.color) {
    const key = args.color.toLowerCase().trim();
    if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  }
  return null;
}

function clampPct(n: number): number {
  return Math.max(1, Math.min(100, Math.round(n)));
}
