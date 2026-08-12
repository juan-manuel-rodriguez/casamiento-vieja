import { postJson } from "./client";

export type RsvpResponse = "accept" | "decline";

export type RsvpPayload = {
  /** Código de la invitación. Sin él el backend no acepta nada. */
  code: string;
  name: string;
  cedula: string;
  response: RsvpResponse;
  adultsConfirmed: number;
  kidsConfirmed: number;
  comment?: string;
};

/**
 * Confirma la asistencia. Crea al invitado si es la primera vez; si la cédula
 * ya confirmó, actualiza su fila.
 *
 * @returns `created` en false cuando actualizó una confirmación previa.
 */
export async function submitRsvp(payload: RsvpPayload): Promise<{ created: boolean }> {
  const response = await postJson<{ ok: true; created: boolean }>({
    action: "submitRsvp",
    ...payload,
  });
  return { created: response.created };
}
