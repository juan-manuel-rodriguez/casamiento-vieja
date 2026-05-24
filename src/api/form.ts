import { apiPost } from "./client";

export type RsvpPayload = {
  id: string;
  respuesta: "acepto" | "no_puedo";
  cantidadConfirmados: number;
  comentario?: string;
};

export async function submitRsvp(payload: RsvpPayload): Promise<void> {
  await apiPost({ action: "submitRsvp", ...payload });
}
