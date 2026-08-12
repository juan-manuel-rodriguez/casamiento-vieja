import { test } from "node:test";
import assert from "node:assert/strict";
import { nameProblem, phoneProblem } from "./guestForm.ts";

test("acepta un nombre completo", () => {
  assert.equal(nameProblem("Ana Pérez"), null);
  assert.equal(nameProblem("  Ana  Pérez  "), null);
  assert.equal(nameProblem("María de los Ángeles Rodríguez"), null);
});

test("dice qué falta en el nombre", () => {
  assert.equal(nameProblem(""), "Escribí tu nombre y apellido");
  assert.equal(nameProblem("   "), "Escribí tu nombre y apellido");
  assert.equal(nameProblem("Ana"), "Falta el apellido");
  assert.equal(nameProblem("A".repeat(81)), "El nombre es demasiado largo");
});

test("acepta teléfonos escritos de cualquier forma", () => {
  assert.equal(phoneProblem("099123456"), null);
  assert.equal(phoneProblem("099 123 456"), null);
  assert.equal(phoneProblem("+598 99 123 456"), null);
  assert.equal(phoneProblem("+54 9 11 2345-6789"), null, "de otro país");
});

test("dice qué pasa con el teléfono", () => {
  assert.equal(phoneProblem(""), "Escribí tu teléfono");
  assert.equal(phoneProblem("no tengo"), "El teléfono va en números");
  assert.equal(phoneProblem("12345"), "Faltan números: escribilo completo");
  assert.equal(phoneProblem("1".repeat(21)), "Ese número tiene demasiados dígitos");
});
