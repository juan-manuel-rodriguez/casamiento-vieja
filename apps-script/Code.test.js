/**
 * Corre el Code.gs real contra una planilla simulada.
 *
 * Apps Script no se puede testear de otra manera sin deployar, y la migración
 * de esquema es lo único de este proyecto que puede perder datos de verdad.
 * Los stubs son mínimos: solo lo que el código toca.
 *
 * Correr con: npm test
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_GS = path.join(path.dirname(fileURLToPath(import.meta.url)), "Code.gs");

const OLD_HEADERS = ["id","name","adultSlots","kidSlots","invitationSent","response",
  "adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","contact","notes","side","table"];

function makeSheet(headers, rows) {
  const grid = [headers.slice(), ...rows.map((r) => r.slice())];
  const formats = new Map();
  const sheet = {
    _grid: grid,
    _formats: formats,
    _frozen: 0,
    getLastColumn: () => Math.max(...grid.map((r) => r.length)),
    getLastRow: () => grid.length,
    getMaxRows: () => Math.max(grid.length, 50),
    setFrozenRows(n) { this._frozen = n; },
    clear() { grid.length = 0; formats.clear(); },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const line = grid[row - 1 + r] || [];
            const cells = [];
            for (let c = 0; c < numCols; c++) cells.push(line[col - 1 + c] ?? "");
            out.push(cells);
          }
          return out;
        },
        getValue() { return (grid[row - 1] || [])[col - 1] ?? ""; },
        setValues(values) {
          values.forEach((line, r) => {
            const target = grid[row - 1 + r] || (grid[row - 1 + r] = []);
            line.forEach((v, c) => { target[col - 1 + c] = v; });
          });
        },
        setNumberFormat(fmt) {
          for (let r = 0; r < numRows; r++) formats.set(`${row + r}:${col}`, fmt);
        },
        getNumberFormat() { return formats.get(`${row}:${col}`) || "0"; },
        clearContent() {
          for (let r = 0; r < numRows; r++)
            for (let c = 0; c < numCols; c++)
              if (grid[row - 1 + r]) grid[row - 1 + r][col - 1 + c] = "";
        },
      };
    },
  };
  return sheet;
}

function run(sheets, props = {}) {
  const src = fs.readFileSync(CODE_GS, "utf8");
  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets[n] || null,
        getSheets: () => Object.entries(sheets).map(([name, s]) => ({ ...s, getName: () => name })),
        insertSheet: (n) => (sheets[n] = makeSheet([], [])),
        deleteSheet: () => {},
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => "uuid-generado" },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    console,
  };
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + "\n;return { migrateGuestsToSelfRegistration_, migrateSongRecsDropGuestId_, GUESTS_HEADERS, SONG_RECS_HEADERS, mapGuestRow_, handleSubmitRsvp_, handleUpsertGuest_, readGuests_, normalizeCedula_, isValidCedula_ };");
  return { api: fn(...keys.map((k) => sandbox[k])), props };
}

// --- Caso 1: migración del esquema viejo con datos reales ---
{
  const guests = makeSheet(OLD_HEADERS, [
    // aceptó: se quedan los confirmados, no los cupos
    ["id-1","Ana Pérez",4,2,true,"accept",3,1,"sin gluten","2026-08-01","099111","nota","seba","5"],
    // no respondió: los cupos pasan a ser la cantidad esperada
    ["id-2","Luis Gómez",2,0,false,"",0,0,"","","","","emi",""],
    // declinó: queda en cero
    ["id-3","Mario Ruiz",3,1,true,"decline",0,0,"no puedo","2026-08-02","","","seba","7"],
  ]);
  const { api } = run({ guests });
  api.migrateGuestsToSelfRegistration_();

  assert.deepEqual(guests._grid[0], api.GUESTS_HEADERS, "headers nuevos");
  assert.equal(guests._grid[0].length, 11, "11 columnas");

  const rows = guests._grid.slice(1).map((r) => api.mapGuestRow_(r, 0));
  assert.equal(rows.length, 3, "no se pierde ninguna fila");

  const ana = rows[0];
  assert.equal(ana.name, "Ana Pérez");
  assert.equal(ana.adultsConfirmed, 3, "aceptó: conserva lo confirmado");
  assert.equal(ana.kidsConfirmed, 1);
  assert.equal(ana.table, "5", "conserva la mesa");
  assert.equal(ana.contact, "099111", "conserva el contacto");
  assert.equal(ana.comment, "sin gluten");
  assert.equal(ana.cedula, "", "los que ya existían no tienen cédula");

  const luis = rows[1];
  assert.equal(luis.adultsConfirmed, 2, "sin responder: el cupo pasa a esperado");
  assert.equal(luis.kidsConfirmed, 0);
  assert.equal(luis.response, "");

  const mario = rows[2];
  assert.equal(mario.adultsConfirmed, 0, "declinó: cero");
  assert.equal(mario.table, "7", "aunque declinó conserva la mesa");

  assert.equal(guests._formats.get("2:3"), "@", "la cédula queda en formato texto");
  console.log("PASS  migra el esquema viejo conservando datos, mesas y contactos");
}

// --- Caso 2: idempotencia ---
{
  const guests = makeSheet(OLD_HEADERS, [
    ["id-1","Ana",4,2,true,"accept",3,1,"","","","","seba","5"],
  ]);
  const { api, props } = run({ guests });
  api.migrateGuestsToSelfRegistration_();
  const after = JSON.stringify(guests._grid);
  api.migrateGuestsToSelfRegistration_();
  assert.equal(JSON.stringify(guests._grid), after, "correrla dos veces no cambia nada");
  assert.equal(props.GUESTS_SCHEMA, "v2");
  console.log("PASS  es idempotente");
}

// --- Caso 3: hoja ya migrada, sin la property (restaurada del historial) ---
{
  const guests = makeSheet(
    ["id","name","cedula","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","contact","notes","table"],
    [["id-1","Ana","12345672","accept",2,0,"","","","","3"]]);
  const { api } = run({ guests });
  api.migrateGuestsToSelfRegistration_();
  const row = api.mapGuestRow_(guests._grid[1], 0);
  assert.equal(row.cedula, "12345672", "no pisa una hoja ya migrada");
  assert.equal(row.table, "3");
  console.log("PASS  detecta por el header y no re-migra");
}

// --- Caso 4: recomendaciones pierden guestId ---
{
  const songs = makeSheet(["timestamp","guestId","trackId","trackName","artists","spotifyUrl"], [
    ["2026-08-01","id-1","t1","La Balsa","Los Gatos","http://x"],
  ]);
  const { api } = run({ songRecommendations: songs });
  api.migrateSongRecsDropGuestId_();
  assert.deepEqual(songs._grid[0], api.SONG_RECS_HEADERS);
  assert.deepEqual(songs._grid[1], ["2026-08-01","t1","La Balsa","Los Gatos","http://x"]);
  console.log("PASS  saca guestId conservando la canción");
}

// --- Caso 5: hoja vacía ---
{
  const guests = makeSheet(OLD_HEADERS, []);
  const { api } = run({ guests });
  api.migrateGuestsToSelfRegistration_();
  assert.deepEqual(guests._grid[0], api.GUESTS_HEADERS);
  assert.equal(guests._grid.length, 1, "solo headers");
  console.log("PASS  hoja vacía no rompe");
}


// --- Caso 6: auto-registro y unicidad por cédula ---
{
  const NEW = ["id","name","cedula","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","contact","notes","table"];
  const guests = makeSheet(NEW, []);
  guests.appendRow = function (row) { this._grid.push(row.slice()); };
  const { api } = run({ guests }, { INVITE_CODE: "codigo-ok", GUESTS_SCHEMA: "v2" });

  const first = api.handleSubmitRsvp_({ code: "codigo-ok", name: "Ana  Pérez", cedula: "1.234.567-2",
    response: "accept", adultsConfirmed: 2, kidsConfirmed: 1, comment: "sin gluten" });
  assert.equal(first.created, true, "la primera crea la fila");
  assert.equal(api.readGuests_().length, 1);

  // el admin la sienta en una mesa
  guests._grid[1][10] = "4";

  const second = api.handleSubmitRsvp_({ code: "codigo-ok", name: "Ana Pérez", cedula: "12345672",
    response: "accept", adultsConfirmed: 3, kidsConfirmed: 0, comment: "" });
  assert.equal(second.created, false, "la segunda actualiza, no crea");
  const list = api.readGuests_();
  assert.equal(list.length, 1, "sigue habiendo UNA sola fila");
  assert.equal(list[0].adultsConfirmed, 3, "se actualizó la cantidad");
  assert.equal(list[0].kidsConfirmed, 0);
  assert.equal(list[0].table, "4", "conserva la mesa: reeditar no desienta");
  assert.equal(list[0].name, "Ana Pérez", "colapsa los espacios de más");
  console.log("PASS  misma cédula con y sin puntos = una sola fila, conservando la mesa");

  assert.throws(() => api.handleSubmitRsvp_({ code: "mal", name: "X", cedula: "12345672", response: "accept", adultsConfirmed: 1, kidsConfirmed: 0 }), /código de invitación inválido/, "rechaza código inválido");
  assert.throws(() => api.handleSubmitRsvp_({ code: "codigo-ok", name: "X", cedula: "12345673", response: "accept", adultsConfirmed: 1, kidsConfirmed: 0 }), /cédula inválida/, "rechaza cédula con verificador malo");
  assert.throws(() => api.handleSubmitRsvp_({ code: "codigo-ok", name: "X", cedula: "12345672", response: "accept", adultsConfirmed: 99, kidsConfirmed: 0 }), /out of range/, "acota la cantidad de gente");
  console.log("PASS  rechaza código inválido, cédula inválida y cantidades absurdas");

  const declined = api.handleSubmitRsvp_({ code: "codigo-ok", name: "Luis", cedula: "1234561",
    response: "decline", adultsConfirmed: 5, kidsConfirmed: 5 });
  assert.equal(declined.created, true);
  const luis = api.readGuests_().find((g) => g.name === "Luis");
  assert.equal(luis.adultsConfirmed, 0, "declinar fuerza cero");
  assert.equal(luis.cedula, "01234561", "guarda la cédula normalizada con ceros");
  console.log("PASS  declinar deja el conteo en cero y normaliza la cédula");
}

// --- Caso 7: el admin no puede robar una cédula ajena ---
{
  const NEW = ["id","name","cedula","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","contact","notes","table"];
  const guests = makeSheet(NEW, [["id-1","Ana","12345672","accept",2,0,"","","","",""]]);
  guests.appendRow = function (row) { this._grid.push(row.slice()); };
  const { api } = run({ guests }, { INVITE_CODE: "c", GUESTS_SCHEMA: "v2", ADMIN_PASSPHRASE: "p" });
  assert.throws(() => api.handleUpsertGuest_({ guest: { name: "Otro", cedula: "12345672", response: "accept", adultsConfirmed: 1, kidsConfirmed: 0 } }), /ya hay un invitado con esa cédula/);
  const manual = api.handleUpsertGuest_({ guest: { name: "Abuela", cedula: "", response: "accept", adultsConfirmed: 2, kidsConfirmed: 0 } });
  assert.equal(manual.created, true, "el admin da de alta sin cédula");
  console.log("PASS  cédula única, y el alta manual va sin cédula");
}

console.log("\nOK: migración y auto-registro verificados");
