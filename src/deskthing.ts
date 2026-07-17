// Thin client transport around the DeskThing client SDK. Every app message uses
// transit type "aura" and is discriminated by `request`.
import { DeskThing } from "@deskthing/client";

export const AURA = "aura";

export type ClientRequest =
  | "chat"
  | "quick"
  | "scene"
  | "control"
  | "refresh_devices"
  | "get_state"
  | "ptt_start"
  | "ptt_stop"
  | "ptt_cancel";

export function send(request: ClientRequest, payload?: unknown): void {
  DeskThing.send({ type: AURA, request, payload } as any);
}

/** Subscribe to server -> client messages. Returns an unsubscribe fn. */
export function onAura(
  cb: (request: string, payload: any) => void,
): () => void {
  return DeskThing.on(AURA as any, (data: any) => cb(data?.request, data?.payload));
}
