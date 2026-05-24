import { FORM_FIELDS, FORM_ID } from "../config";

export type RsvpPayload = {
  id: string;
  respuesta: "acepto" | "no_puedo";
  cantidadConfirmados: number;
  comentario?: string;
};

// Submitea al endpoint público de un Google Form vinculado al Sheet.
// El form responde con CORS bloqueado, por eso se usa `mode: "no-cors"`:
// no podemos leer la respuesta, pero el submit igual se procesa.
export async function submitRsvp(payload: RsvpPayload): Promise<void> {
  const body = new URLSearchParams();
  body.set(FORM_FIELDS.id, payload.id);
  body.set(FORM_FIELDS.respuesta, payload.respuesta);
  body.set(FORM_FIELDS.cantidadConfirmados, String(payload.cantidadConfirmados));
  if (payload.comentario) body.set(FORM_FIELDS.comentario, payload.comentario);

  const url = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;
  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}
