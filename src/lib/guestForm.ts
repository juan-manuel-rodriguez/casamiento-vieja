import { normalizePhone } from "./phone.ts";

/**
 * Validación de los datos que identifican al invitado, con mensajes que dicen
 * qué arreglar y no solo que algo está mal.
 *
 * Vive acá y no en cada formulario porque el invitado y el admin cargan los
 * mismos dos campos: si los mensajes se escriben dos veces, terminan diciendo
 * cosas distintas para el mismo error.
 *
 * Devuelven null cuando el valor sirve.
 */

/** Largo máximo del nombre. El backend recorta a este mismo número. */
const MAX_NAME_LENGTH = 80;

export function nameProblem(raw: string): string | null {
  const name = (raw ?? "").trim();
  if (!name) return "Escribí tu nombre y apellido";
  if (name.length > MAX_NAME_LENGTH) return "El nombre es demasiado largo";
  // Un solo nombre no alcanza para distinguir a dos invitados en la lista.
  if (!/\s/.test(name)) return "Falta el apellido";
  return null;
}

export function phoneProblem(raw: string): string | null {
  const written = (raw ?? "").trim();
  if (!written) return "Escribí tu teléfono";
  const digits = written.replace(/\D/g, "");
  if (!digits) return "El teléfono va en números";
  if (!normalizePhone(written)) {
    return digits.length < 6
      ? "Faltan números: escribilo completo"
      : "Ese número tiene demasiados dígitos";
  }
  return null;
}
