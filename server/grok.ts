/**
 * Grok (xAI) client — the "brain".
 *
 * The xAI API is OpenAI-compatible, so this is a thin fetch wrapper around
 * POST https://api.x.ai/v1/chat/completions with tool calling.
 *
 * Flow: user text -> Grok (with light-control tools) -> Grok either answers
 * directly (general chat) or emits tool_calls, which we execute against Govee
 * and feed back, until Grok produces a final spoken reply.
 */
import { randomUUID } from "node:crypto";
import { log } from "./log.ts";
import type { GoveeClient } from "./govee.ts";
import { TOOL_DEFS, executeTool } from "./tools.ts";
import { SCENES } from "./scenes.ts";
import type { ActionSummary, AuraReply, LightDevice } from "./types.ts";

const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 8; // user/assistant turns to keep for context

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export class GrokClient {
  private key: string;
  private model: string;
  private govee: GoveeClient | null;
  private history: ChatMessage[] = [];

  constructor(opts: { apiKey: string; model: string; govee: GoveeClient | null }) {
    this.key = opts.apiKey.trim();
    this.model = opts.model.trim() || "grok-4-fast-non-reasoning";
    this.govee = opts.govee;
  }

  setModel(model: string) {
    if (model?.trim()) this.model = model.trim();
  }

  clearHistory() {
    this.history = [];
  }

  private systemPrompt(devices: LightDevice[]): string {
    const deviceList = devices.length
      ? devices.map((d) => `- "${d.name}" (${describeCaps(d)})`).join("\n")
      : "(no lights configured yet)";
    const sceneList = SCENES.map((s) => s.id).join(", ");
    return [
      "You are Aura, a fast, friendly voice assistant living on a small touchscreen (a jailbroken Spotify Car Thing).",
      "You control the user's Govee smart lights AND answer general questions like a normal AI assistant.",
      "",
      "The user's lights:",
      deviceList,
      "",
      `Available preset scenes: ${sceneList}.`,
      "",
      "Rules:",
      "- When the user wants to change lights, CALL THE TOOLS. Do not just describe what you would do.",
      "- You may issue multiple tool calls in one turn (e.g. turn on + set color).",
      '- "target" is a light name from the list above, or "all" for every light. Match loosely (a spoken "bedroom" should hit "Bedroom Lamp").',
      "- If the user just chats or asks a question unrelated to lights, answer normally and DON'T call tools.",
      "- Keep spoken replies short and natural — one or two sentences. This is read aloud and shown on a tiny screen.",
      "- After acting, confirm briefly what you did (e.g. \"Living room's purple now.\"). Don't restate the whole command.",
      "- If a light name doesn't exist, say so and list what's available.",
    ].join("\n");
  }

  /**
   * Run one user utterance to completion.
   * `onStatus` lets the caller reflect thinking/acting state on the UI.
   */
  async run(
    userText: string,
    onStatus?: (s: "thinking" | "acting") => void,
  ): Promise<AuraReply> {
    if (!this.key) throw new Error("Grok (xAI) API key is not set");

    const devices = this.govee?.devices ?? [];
    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt(devices) },
      ...this.history,
      { role: "user", content: userText },
    ];

    const collectedActions: ActionSummary[] = [];
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      onStatus?.("thinking");
      const assistant = await this.completion(messages);
      messages.push(assistant);

      const calls = assistant.tool_calls ?? [];
      if (!calls.length) {
        finalText = (assistant.content || "").trim();
        break;
      }

      onStatus?.("acting");
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          /* leave args empty; executor will report the miss */
        }
        let toolContent: string;
        if (this.govee) {
          const result = await executeTool(call.function.name, args, this.govee);
          collectedActions.push(...result.actions);
          toolContent = result.info
            ? result.info
            : JSON.stringify({ actions: result.actions });
        } else {
          toolContent = "Lights are not configured (no Govee API key).";
          collectedActions.push({
            target: String(args.target ?? "?"),
            action: call.function.name,
            ok: false,
            error: "Govee not configured",
          });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: toolContent });
      }
    }

    if (!finalText) {
      // Model kept calling tools past the cap, or returned empty — synthesize one.
      finalText = summarize(collectedActions);
    }

    // persist a trimmed conversation for follow-ups ("make it brighter")
    this.history.push({ role: "user", content: userText });
    this.history.push({ role: "assistant", content: finalText });
    if (this.history.length > MAX_HISTORY * 2) {
      this.history = this.history.slice(-MAX_HISTORY * 2);
    }

    return { id: randomUUID(), text: finalText, actions: collectedActions };
  }

  private async completion(messages: ChatMessage[]): Promise<ChatMessage> {
    const res = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.key}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: this.govee ? TOOL_DEFS : undefined,
        tool_choice: this.govee ? "auto" : undefined,
        temperature: 0.3,
        stream: false,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Grok API error ${res.status}: ${text.slice(0, 300)}`);
    }
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Grok returned non-JSON: ${text.slice(0, 200)}`);
    }
    const msg = json?.choices?.[0]?.message;
    if (!msg) throw new Error("Grok returned no message");
    log.debug("grok msg", JSON.stringify(msg).slice(0, 400));
    return {
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: msg.tool_calls,
    };
  }
}

function describeCaps(d: LightDevice): string {
  const caps: string[] = [];
  if (d.supports.power) caps.push("on/off");
  if (d.supports.brightness) caps.push("brightness");
  if (d.supports.colorRgb) caps.push("color");
  if (d.supports.colorTemp) caps.push("white temp");
  return caps.join("/");
}

function summarize(actions: ActionSummary[]): string {
  if (!actions.length) return "Okay.";
  const ok = actions.filter((a) => a.ok);
  const bad = actions.filter((a) => !a.ok);
  const parts: string[] = [];
  if (ok.length) parts.push(ok.map((a) => `${a.target} ${a.action}`).join(", ") + ".");
  if (bad.length) parts.push("Couldn't do: " + bad.map((a) => a.target).join(", ") + ".");
  return parts.join(" ");
}
