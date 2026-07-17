/**
 * Govee Developer API v2 client (cloud).
 *
 * Docs: https://developer.govee.com/reference/control-you-devices
 * Base host: https://openapi.api.govee.com
 * Auth header: "Govee-API-Key: <key>"
 *
 * We deliberately keep this framework-agnostic (no DeskThing imports) so the
 * light logic is easy to test and reason about on its own.
 */
import { randomUUID } from "node:crypto";
import { log } from "./log.ts";
import type { LightDevice } from "./types.ts";

const HOST = "https://openapi.api.govee.com";

// Govee v2 capability identifiers
const CAP = {
  onOff: { type: "devices.capabilities.on_off", instance: "powerSwitch" },
  brightness: { type: "devices.capabilities.range", instance: "brightness" },
  colorRgb: { type: "devices.capabilities.color_setting", instance: "colorRgb" },
  colorTemp: {
    type: "devices.capabilities.color_setting",
    instance: "colorTemperatureK",
  },
} as const;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

interface GoveeRawDevice {
  sku: string;
  device: string;
  deviceName: string;
  type: string;
  capabilities: Array<{ type: string; instance: string }>;
}

export class GoveeClient {
  private key: string;
  private cache: LightDevice[] = [];

  constructor(apiKey: string) {
    this.key = apiKey.trim();
  }

  get devices(): LightDevice[] {
    return this.cache;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<T> {
    if (!this.key) throw new Error("Govee API key is not set");
    const res = await fetch(HOST + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Govee-API-Key": this.key,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Govee returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok || (json.code !== undefined && json.code !== 200)) {
      const msg = json.message || json.msg || res.statusText;
      throw new Error(`Govee API error ${res.status}/${json.code}: ${msg}`);
    }
    return json as T;
  }

  /** Fetch and cache all controllable light devices on the account. */
  async listDevices(): Promise<LightDevice[]> {
    const json = await this.request<{ data: GoveeRawDevice[] }>(
      "/router/api/v1/user/devices",
      "GET",
    );
    const raw = json.data || [];
    this.cache = raw
      .filter((d) => /light|lamp|bulb|strip/i.test(d.type) || hasCap(d, CAP.onOff))
      .map((d) => ({
        id: d.device,
        sku: d.sku,
        name: d.deviceName,
        supports: {
          power: hasCap(d, CAP.onOff),
          brightness: hasCap(d, CAP.brightness),
          colorRgb: hasCap(d, CAP.colorRgb),
          colorTemp: hasCap(d, CAP.colorTemp),
        },
      }));
    log.info(`Loaded ${this.cache.length} Govee device(s):`, this.cache.map((d) => d.name).join(", "));
    return this.cache;
  }

  private async control(
    dev: LightDevice,
    capType: string,
    instance: string,
    value: unknown,
  ): Promise<void> {
    await this.request("/router/api/v1/device/control", "POST", {
      requestId: randomUUID(),
      payload: {
        sku: dev.sku,
        device: dev.id,
        capability: { type: capType, instance, value },
      },
    });
  }

  setPower(dev: LightDevice, on: boolean): Promise<void> {
    return this.control(dev, CAP.onOff.type, CAP.onOff.instance, on ? 1 : 0);
  }

  /** brightness as a 0-100 percentage */
  setBrightness(dev: LightDevice, pct: number): Promise<void> {
    const v = clamp(Math.round(pct), 1, 100);
    return this.control(dev, CAP.brightness.type, CAP.brightness.instance, v);
  }

  setColorRgb(dev: LightDevice, rgb: RGB): Promise<void> {
    const r = clamp(Math.round(rgb.r), 0, 255);
    const g = clamp(Math.round(rgb.g), 0, 255);
    const b = clamp(Math.round(rgb.b), 0, 255);
    const packed = (r << 16) | (g << 8) | b;
    return this.control(dev, CAP.colorRgb.type, CAP.colorRgb.instance, packed);
  }

  /** color temperature in Kelvin (~2000 warm -> ~9000 cool) */
  setColorTemp(dev: LightDevice, kelvin: number): Promise<void> {
    const v = clamp(Math.round(kelvin), 2000, 9000);
    return this.control(dev, CAP.colorTemp.type, CAP.colorTemp.instance, v);
  }
}

function hasCap(d: GoveeRawDevice, cap: { type: string; instance: string }): boolean {
  return (d.capabilities || []).some(
    (c) => c.type === cap.type && c.instance === cap.instance,
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
