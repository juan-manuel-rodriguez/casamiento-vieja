import { getJson, postJson } from "./client";

export type Guest = {
  rowIndex: number;
  id: string;
  name: string;
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

export async function fetchPublicGuest(id: string): Promise<PublicGuest | null> {
  const response = await getJson<{ found: boolean; guest?: PublicGuest }>({
    action: "getGuest",
    id,
  });
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
