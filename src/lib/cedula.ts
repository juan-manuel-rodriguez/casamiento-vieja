/**
 * Cédula de identidad uruguaya.
 *
 * Es la clave con la que un invitado se identifica al confirmar: si vuelve a
 * completar el formulario con la misma cédula, se actualiza su fila en vez de
 * duplicarla. Por eso importa normalizarla antes de comparar — la misma
 * persona puede escribirla con puntos, con guion o pelada.
 *
 * OJO: hay un espejo de estas dos funciones en apps-script/Code.gs
 * (`normalizeCedula_` e `isValidCedula_`). Si cambia una, cambia la otra. Los
 * casos de prueba viven en cedula.test.ts y valen para las dos.
 */

/** Pesos del dígito verificador, aplicados a los primeros 7 dígitos. */
const CHECK_WEIGHTS = [2, 9, 8, 7, 6, 3, 4];

/**
 * Deja la cédula en su forma canónica: 8 dígitos, con ceros a la izquierda.
 *
 * El relleno con ceros no es cosmético: sin él, "1234561" y "01234561" son la
 * misma persona pero dos strings distintos, y la unicidad fallaría en silencio.
 *
 * @returns Los 8 dígitos, o "" si no hay nada normalizable.
 */
export function normalizeCedula(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 8) return "";
  return digits.padStart(8, "0");
}

/** Valida el dígito verificador. Una cédula mal tipeada crea un invitado duplicado. */
export function isValidCedula(raw: string): boolean {
  const digits = normalizeCedula(raw);
  if (!digits) return false;
  let sum = 0;
  for (let i = 0; i < CHECK_WEIGHTS.length; i++) {
    sum += Number(digits[i]) * CHECK_WEIGHTS[i];
  }
  return (10 - (sum % 10)) % 10 === Number(digits[7]);
}

/** Para mostrar: 1.234.567-2. Devuelve el original si no se puede normalizar. */
export function formatCedula(raw: string): string {
  const digits = normalizeCedula(raw);
  if (!digits) return raw ?? "";
  const body = digits.slice(0, 7).replace(/^0+(?=\d)/, "");
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digits[7]}`;
}
