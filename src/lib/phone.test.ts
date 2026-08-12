import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPhone, normalizePhone } from "./phone.ts";

test("se queda solo con los dígitos", () => {
  // Un espacio o un guion de más no tienen que contar como otra persona.
  for (const written of ["099123456", "099 123 456", "099-123-456", " 099123456 "]) {
    assert.equal(normalizePhone(written), "099123456", `falló con "${written}"`);
  }
});

test("no toca el prefijo país ni el cero", () => {
  // A propósito: hay invitados de otros países y recortarlos rompería sus
  // números. El costo es que estas dos formas son claves distintas.
  assert.equal(normalizePhone("+598 99 123 456"), "59899123456");
  assert.equal(normalizePhone("099123456"), "099123456");
  assert.notEqual(normalizePhone("+598 99 123 456"), normalizePhone("099123456"));
});

test("acepta números de otros países", () => {
  assert.equal(normalizePhone("+54 9 11 2345-6789"), "5491123456789");
  assert.equal(normalizePhone("+1 (555) 234-5678"), "15552345678");
});

test("rechaza lo que no puede ser un teléfono", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("no tengo"), "");
  assert.equal(normalizePhone("12345"), "", "muy corto");
  assert.equal(normalizePhone("1".repeat(21)), "", "muy largo");
});

test("isValidPhone sigue a normalizePhone", () => {
  assert.equal(isValidPhone("099123456"), true);
  assert.equal(isValidPhone("123"), false);
  assert.equal(isValidPhone(""), false);
});
