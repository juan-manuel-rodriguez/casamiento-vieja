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

export async function listGuests(token: string): Promise<Guest[]> {
  const response = await postJson<{ guests: Guest[] }>({ action: "listGuests", token });
  return response.guests;
}

export async function listRsvps(token: string): Promise<Rsvp[]> {
  const response = await postJson<{ rsvps: Rsvp[] }>({ action: "listRsvps", token });
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

export type GuestInput = Omit<Guest, "rowIndex">;

export async function upsertGuest(token: string, guest: GuestInput): Promise<void> {
  await postJson({ action: "upsertGuest", token, guest });
}

export async function deleteGuest(token: string, id: string): Promise<void> {
  await postJson({ action: "deleteGuest", token, id });
}
