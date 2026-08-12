import { postJson } from "./client";

export type Guest = {
  rowIndex: number;
  id: string;
  name: string;
  /**
   * Clave con la que se reconoce al invitado, y por donde se lo contacta.
   * Solo dígitos.
   */
  phone: string;
  /** Número de mesa como texto (ver VENUE_TABLES), o "" si no está sentado. */
  table: string;
  response: "accept" | "decline" | "";
  adultsConfirmed: number;
  kidsConfirmed: number;
  comment: string;
  rsvpTimestamp: string;
  notes: string;
};

export async function checkAuth(auth: string): Promise<void> {
  await postJson<{ ok: true }>({ action: "checkAuth", auth });
}

export async function listGuests(auth: string): Promise<Guest[]> {
  const response = await postJson<{ guests: Guest[] }>({ action: "listGuests", auth });
  return response.guests;
}

/** El link único de la invitación. Se autogenera en el backend. */
export async function fetchInviteCode(auth: string): Promise<string> {
  const response = await postJson<{ code: string }>({ action: "getInviteCode", auth });
  return response.code;
}

/**
 * Entrada de upsertGuest. `id` es opcional: sin él, el backend genera un UUID.
 * Mandalo solo para actualizar a alguien que ya existe.
 */
export type GuestInput = {
  id?: string;
  name: string;
  phone: string;
  table: string;
  response: "accept" | "decline" | "";
  adultsConfirmed: number;
  kidsConfirmed: number;
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
