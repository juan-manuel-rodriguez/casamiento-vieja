import { postJson } from "./client";

export type RsvpResponse = "accept" | "decline";

export type RsvpPayload = {
  id: string;
  response: RsvpResponse;
  partySize: number;
  comment?: string;
};

export async function submitRsvp(payload: RsvpPayload): Promise<void> {
  await postJson({ action: "submitRsvp", ...payload });
}
