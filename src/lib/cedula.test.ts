import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCedula, isValidCedula, normalizeCedula } from "./cedula.ts";

test("normaliza sacando puntos y guion", () => {
  assert.equal(normalizeCedula("1.234.567-2"), "12345672");
  assert.equal(normalizeCedula("1234567-2"), "12345672");
  assert.equal(normalizeCedula(" 1234 5672 "), "12345672");
});

test("rellena con ceros a la izquierda hasta 8 dígitos", () => {
  // Sin esto, la misma persona sería dos claves distintas y se duplicaría.
  assert.equal(normalizeCedula("1234561"), "01234561");
  assert.equal(normalizeCedula("123456"), "00123456");
});

test("rechaza lo que no puede ser una cédula", () => {
  assert.equal(normalizeCedula(""), "");
  assert.equal(normalizeCedula("abc"), "");
  assert.equal(normalizeCedula("12345"), "", "muy corta");
  assert.equal(normalizeCedula("123456789"), "", "muy larga");
});

test("valida el dígito verificador", () => {
  assert.equal(isValidCedula("1.234.567-2"), true);
  assert.equal(isValidCedula("12345672"), true, "sin puntos da lo mismo");
  assert.equal(isValidCedula("12345673"), false, "verificador cambiado");
  assert.equal(isValidCedula("48123456"), false);
});

test("una cédula con ceros a la izquierda valida igual", () => {
  const withPadding = normalizeCedula("1234561");
  assert.equal(withPadding, "01234561");
  assert.equal(isValidCedula("1234561"), isValidCedula(withPadding));
});

test("no valida basura", () => {
  assert.equal(isValidCedula(""), false);
  assert.equal(isValidCedula("abc"), false);
  assert.equal(isValidCedula("12345"), false);
});

test("formatea para mostrar", () => {
  assert.equal(formatCedula("12345672"), "1.234.567-2");
  assert.equal(formatCedula("1.234.567-2"), "1.234.567-2", "es idempotente");
  assert.equal(formatCedula("01234561"), "123.456-1", "sin ceros de relleno");
  assert.equal(formatCedula("no es"), "no es", "devuelve el original si no puede");
});
