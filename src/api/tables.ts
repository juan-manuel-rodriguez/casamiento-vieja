import { postJson } from "./client";
import type { VenueTable } from "../lib/tables";

export async function listTables(auth: string): Promise<VenueTable[]> {
  const response = await postJson<{ tables: VenueTable[] }>({ action: "listTables", auth });
  return response.tables;
}

/**
 * Guarda la lista completa de mesas, no una sola. El backend pisa la pestaña
 * entera, así que la escritura es atómica: o queda la lista nueva o la vieja,
 * nunca una mezcla.
 */
export async function saveTables(auth: string, tables: VenueTable[]): Promise<number> {
  const response = await postJson<{ ok: true; count: number }>({
    action: "saveTables",
    auth,
    tables,
  });
  return response.count;
}
