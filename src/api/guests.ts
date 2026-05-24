import { getJson, postJson } from "./client";

export type Guest = {
  rowIndex: number;
  id: string;
  name: string;
  plusOnes: number;
  invitationSent: boolean;
  contact: string;
  notes: string;
};

export type Rsvp = {
  timestamp: string;
  guestId: string;
  response: "accept" | "decline" | string;
  partySize: number;
  comment: string;
};

/** Minimal projection of a guest exposed to the public guest page. */
export type PublicGuest = Pick<Guest, "id" | "name" | "plusOnes">;

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

export async function listRsvps(auth: string): Promise<Rsvp[]> {
  const response = await postJson<{ rsvps: Rsvp[] }>({ action: "listRsvps", auth });
  return response.rsvps;
}

/** Build a guestId → latest Rsvp map. Latest is decided by timestamp string. */
export function latestRsvpByGuestId(rsvps: Rsvp[]): Map<string, Rsvp> {
  const map = new Map<string, Rsvp>();
  for (const rsvp of rsvps) {
    if (!rsvp.guestId) continue;
    const prev = map.get(rsvp.guestId);
    if (!prev || prev.timestamp < rsvp.timestamp) map.set(rsvp.guestId, rsvp);
  }
  return map;
}

/**
 * Input for upsertGuest. `id` is optional: when omitted the server slugifies
 * `name` and resolves collisions with a numeric suffix. Provide `id` only when
 * updating an existing row.
 */
export type GuestInput = {
  id?: string;
  name: string;
  plusOnes: number;
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
