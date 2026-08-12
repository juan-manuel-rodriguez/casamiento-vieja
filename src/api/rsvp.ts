import { postJson } from "./client";

export type RsvpResponse = "accept" | "decline";

export type RsvpPayload = {
  /** Código de la invitación. Sin él el backend no acepta nada. */
  code: string;
  name: string;
  /** Solo dígitos. Es la clave que identifica al invitado. */
  phone: string;
  response: RsvpResponse;
  adultsConfirmed: number;
  kidsConfirmed: number;
  comment?: string;
  /**
   * Autoriza a pisar una confirmación previa. Sin esto, el backend avisa en
   * vez de escribir: pisar la de otro por un número mal tipeado sería
   * silencioso y caro de descubrir.
   */
  confirmReplace?: boolean;
};

/** Lo que devuelve el backend cuando el teléfono ya tenía una confirmación. */
export type RsvpResult =
  | { kind: "saved"; created: boolean }
  | { kind: "needs-confirmation"; previousResponse: "accept" | "decline" | "" };

/**
 * Confirma la asistencia. Crea al invitado si es la primera vez.
 *
 * Si ese teléfono ya tenía registro y no viene `confirmReplace`, no escribe:
 * devuelve `needs-confirmation` para que el formulario pregunte antes.
 */
export async function submitRsvp(payload: RsvpPayload): Promise<RsvpResult> {
  const response = await postJson<{
    ok: boolean;
    created?: boolean;
    needsConfirmation?: boolean;
    previousResponse?: "accept" | "decline" | "";
  }>({ action: "submitRsvp", ...payload });

  if (response.needsConfirmation) {
    return { kind: "needs-confirmation", previousResponse: response.previousResponse ?? "" };
  }
  return { kind: "saved", created: Boolean(response.created) };
}
