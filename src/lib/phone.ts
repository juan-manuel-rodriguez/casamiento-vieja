/**
 * Teléfono del invitado. Es la clave con la que se lo reconoce al confirmar:
 * si vuelve a completar el formulario con el mismo número, se actualiza su
 * fila en vez de duplicarla.
 *
 * Se guarda y se muestra pelado, solo dígitos: así un espacio o un guion de
 * más no cuentan como otra persona. NO se toca el prefijo país ni el
 * cero inicial: hay invitados de otros países y recortarlos rompería sus
 * números.
 *
 * Como consecuencia, quien escriba su número de dos formas distintas —una vez
 * con prefijo país y otra sin— va a quedar dos veces. Por eso el formulario
 * fuerza el formato en el input y dice qué se espera.
 *
 * OJO: hay un espejo de esta función en apps-script/Code.gs (`normalizePhone_`).
 * Si cambia una, cambia la otra. Los casos de prueba viven en phone.test.ts y
 * valen para las dos.
 */

/** Se queda solo con los dígitos. @returns "" si no puede ser un teléfono. */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 20) return "";
  return digits;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== "";
}
