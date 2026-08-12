import { getJson, postJson } from "./client";
import type { EventConfig } from "../config";

/**
 * Lo que el Sheet tiene guardado de la invitación. Es parcial a propósito: si
 * un campo nunca se editó no está en la planilla, y vale el de `config.ts`.
 */
export type EventOverrides = Partial<EventConfig>;

/**
 * @param access El código de la invitación en la página del invitado, o la
 * contraseña de admin en el panel: el backend acepta cualquiera de los dos.
 */
export async function fetchSettings(access: string): Promise<EventOverrides> {
  // Va en los dos campos porque el backend acepta cualquiera de los dos y acá
  // no sabemos cuál nos tocó: el invitado trae código, el admin contraseña.
  const response = await getJson<{ settings: EventOverrides }>({
    action: "getSettings",
    code: access,
    auth: access,
  });
  return response.settings ?? {};
}

export async function saveSettings(auth: string, settings: EventOverrides): Promise<void> {
  await postJson<{ ok: true; count: number }>({ action: "saveSettings", auth, settings });
}
