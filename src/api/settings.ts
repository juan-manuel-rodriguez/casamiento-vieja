import { getJson, postJson } from "./client";
import type { EventConfig } from "../config";

/**
 * Lo que el Sheet tiene guardado de la invitación. Es parcial a propósito: si
 * un campo nunca se editó no está en la planilla, y vale el de `config.ts`.
 */
export type EventOverrides = Partial<EventConfig>;

export async function fetchSettings(): Promise<EventOverrides> {
  const response = await getJson<{ settings: EventOverrides }>({ action: "getSettings" });
  return response.settings ?? {};
}

export async function saveSettings(auth: string, settings: EventOverrides): Promise<void> {
  await postJson<{ ok: true; count: number }>({ action: "saveSettings", auth, settings });
}
