import { getJson, postJson } from "./client";
import { applyEventOverrides } from "../lib/event";
import type { EventOverrides } from "./settings";

export type Guest = {
  rowIndex: number;
  id: string;
  name: string;
  /** A `value` from EVENT.sides, or "" when unassigned. */
  side: string;
  /** Table number as text (see VENUE_TABLES), or "" when unseated. */
  table: string;
  adultSlots: number;
  kidSlots: number;
  invitationSent: boolean;
  response: "accept" | "decline" | "";
  adultsConfirmed: number;
  kidsConfirmed: number;
  comment: string;
  rsvpTimestamp: string;
  contact: string;
  notes: string;
};

/** Minimal projection of a guest exposed to the public guest page. */
export type PublicGuest = Pick<Guest, "id" | "name" | "adultSlots" | "kidSlots">;

/**
 * El backend devuelve el contenido de la invitación junto con el invitado: la
 * página ya esperaba esta respuesta antes de pintar, así que traerlo acá no
 * agrega ninguna vuelta de red.
 */
export async function fetchPublicGuest(id: string): Promise<PublicGuest | null> {
  const response = await getJson<{
    found: boolean;
    guest?: PublicGuest;
    settings?: EventOverrides;
  }>({ action: "getGuest", id });
  applyEventOverrides(response.settings);
  return response.found && response.guest ? response.guest : null;
}

export async function checkAuth(auth: string): Promise<void> {
  await postJson<{ ok: true }>({ action: "checkAuth", auth });
}

export async function listGuests(auth: string): Promise<Guest[]> {
  const response = await postJson<{ guests: Guest[] }>({ action: "listGuests", auth });
  return response.guests;
}

/**
 * Input for upsertGuest. `id` is optional: when omitted the server generates
 * a random UUID. Provide `id` only when updating an existing row.
 */
export type GuestInput = {
  id?: string;
  name: string;
  /** A `value` from EVENT.sides, or "" when unassigned. */
  side: string;
  table: string;
  adultSlots: number;
  kidSlots: number;
  invitationSent: boolean;
  contact: string;
  notes: string;
};

export async function upsertGuest(
  auth: string,
  guest: GuestInput,
): Promise<{ id: string; created: boolean }> {
  return postJson<{ ok: true; created: boolean; id: string }>({
    action: "upsertGuest",
    auth,
    guest,
  }).then((r) => ({ id: r.id, created: r.created }));
}

export async function deleteGuest(auth: string, id: string): Promise<void> {
  await postJson({ action: "deleteGuest", auth, id });
}
