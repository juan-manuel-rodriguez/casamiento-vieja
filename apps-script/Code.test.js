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
    insertRowsAfter() {},
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
            line.forEach((v, c) => {
              const cellRow = row + r;
              const cellCol = col + c;
              // Así se comporta Sheets: sin formato de texto, "098" entra
              // como número 98. Es exactamente el bug que se está probando.
              const isText = formats.get(`${cellRow}:${cellCol}`) === "@";
              target[cellCol - 1] =
                !isText && typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
            });
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
  const fn = new Function(...keys, src + "\n;return { migrateGuestsToSelfRegistration_, migrateGuestsCedulaToPhone_, migrateSongRecsDropGuestId_, GUESTS_HEADERS, SONG_RECS_HEADERS, mapGuestRow_, handleSubmitRsvp_, handleUpsertGuest_, readGuests_, normalizePhone_ };");
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
  api.migrateGuestsCedulaToPhone_();

  assert.deepEqual(guests._grid[0], api.GUESTS_HEADERS, "headers nuevos");
  assert.equal(guests._grid[0].length, 10, "10 columnas");

  const rows = guests._grid.slice(1).map((r) => api.mapGuestRow_(r, 0));
  assert.equal(rows.length, 3, "no se pierde ninguna fila");

  const ana = rows[0];
  assert.equal(ana.name, "Ana Pérez");
  assert.equal(ana.adultsConfirmed, 3, "aceptó: conserva lo confirmado");
  assert.equal(ana.kidsConfirmed, 1);
  assert.equal(ana.table, "5", "conserva la mesa");
  assert.equal(ana.phone, "099111", "el contacto viejo pasa a ser el teléfono");
  assert.equal(ana.comment, "sin gluten");

  const luis = rows[1];
  assert.equal(luis.adultsConfirmed, 2, "sin responder: el cupo pasa a esperado");
  assert.equal(luis.kidsConfirmed, 0);
  assert.equal(luis.response, "");

  const mario = rows[2];
  assert.equal(mario.adultsConfirmed, 0, "declinó: cero");
  assert.equal(mario.table, "7", "aunque declinó conserva la mesa");

  assert.equal(guests._formats.get("2:3"), "@", "el teléfono queda en formato texto");
  console.log("PASS  migra de cupos a teléfono conservando datos, mesas y contactos");
}

// --- Caso 2: idempotencia ---
{
  const guests = makeSheet(OLD_HEADERS, [
    ["id-1","Ana",4,2,true,"accept",3,1,"","","","","seba","5"],
  ]);
  const { api, props } = run({ guests });
  api.migrateGuestsToSelfRegistration_();
  api.migrateGuestsCedulaToPhone_();
  const after = JSON.stringify(guests._grid);
  api.migrateGuestsToSelfRegistration_();
  api.migrateGuestsCedulaToPhone_();
  assert.equal(JSON.stringify(guests._grid), after, "correrlas dos veces no cambia nada");
  assert.equal(props.GUESTS_SCHEMA, "v2");
  assert.equal(props.GUESTS_PHONE_SCHEMA, "v3");
  console.log("PASS  es idempotente");
}

// --- Caso 3: hoja ya migrada, sin la property (restaurada del historial) ---
{
  const guests = makeSheet(
    ["id","name","phone","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","notes","table"],
    [["id-1","Ana","099123456","accept",2,0,"","","","3"]]);
  const { api } = run({ guests });
  api.migrateGuestsToSelfRegistration_();
  api.migrateGuestsCedulaToPhone_();
  const row = api.mapGuestRow_(guests._grid[1], 0);
  assert.equal(row.phone, "099123456", "no pisa una hoja ya migrada");
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
  api.migrateGuestsCedulaToPhone_();
  assert.deepEqual(guests._grid[0], api.GUESTS_HEADERS);
  assert.equal(guests._grid.length, 1, "solo headers");
  console.log("PASS  hoja vacía no rompe");
}


// --- Caso 6: auto-registro, unicidad y aviso antes de pisar ---
{
  const guests = makeSheet(["id","name","phone","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","notes","table"], []);
  guests.appendRow = function (row) { this._grid.push(row.slice()); };
  const { api } = run({ guests }, { INVITE_CODE: "codigo-ok", GUESTS_SCHEMA: "v2", GUESTS_PHONE_SCHEMA: "v3" });

  const base = { code: "codigo-ok", name: "Ana  Pérez", phone: "099 123 456", response: "accept" };
  const first = api.handleSubmitRsvp_({ ...base, adultsConfirmed: 2, kidsConfirmed: 1, comment: "sin gluten" });
  assert.equal(first.created, true, "la primera crea la fila");
  assert.equal(api.readGuests_().length, 1);
  assert.equal(api.readGuests_()[0].phone, "099123456", "guarda solo los dígitos");
  assert.equal(api.readGuests_()[0].name, "Ana Pérez", "colapsa los espacios de más");

  guests._grid[1][9] = "4"; // el admin la sienta en una mesa

  // Segundo envío con el mismo número: avisa en vez de pisar.
  const warned = api.handleSubmitRsvp_({ ...base, phone: "099-123-456", adultsConfirmed: 3, kidsConfirmed: 0 });
  assert.equal(warned.ok, false, "no escribe");
  assert.equal(warned.needsConfirmation, true, "avisa que ya hay registro");
  assert.equal(warned.previousResponse, "accept", "dice qué había, no de quién");
  assert.equal(api.readGuests_()[0].adultsConfirmed, 2, "la fila quedó intacta");

  // Recién con la confirmación explícita, pisa.
  const replaced = api.handleSubmitRsvp_({ ...base, phone: "099-123-456", adultsConfirmed: 3, kidsConfirmed: 0, confirmReplace: true });
  assert.equal(replaced.created, false, "actualiza, no crea");
  assert.equal(api.readGuests_().length, 1, "sigue habiendo UNA sola fila");
  assert.equal(api.readGuests_()[0].adultsConfirmed, 3, "ahora sí se actualizó");
  assert.equal(api.readGuests_()[0].table, "4", "conserva la mesa: reeditar no desienta");
  console.log("PASS  avisa antes de pisar y solo escribe con confirmación explícita");

  // El prefijo país NO se normaliza: es otra clave, y crea otra fila.
  const withCode = api.handleSubmitRsvp_({ ...base, phone: "+598 99 123 456", adultsConfirmed: 1, kidsConfirmed: 0 });
  assert.equal(withCode.created, true, "el prefijo país cuenta como otro número");
  assert.equal(api.readGuests_().length, 2);
  console.log("PASS  el prefijo país es otra clave, a propósito");

  assert.throws(() => api.handleSubmitRsvp_({ ...base, code: "mal", adultsConfirmed: 1, kidsConfirmed: 0 }), /código de invitación inválido/);
  assert.throws(() => api.handleSubmitRsvp_({ ...base, phone: "123", adultsConfirmed: 1, kidsConfirmed: 0 }), /teléfono inválido/);
  assert.throws(() => api.handleSubmitRsvp_({ ...base, adultsConfirmed: 99, kidsConfirmed: 0, confirmReplace: true }), /out of range/);
  console.log("PASS  rechaza código inválido, teléfono inválido y cantidades absurdas");

  const declined = api.handleSubmitRsvp_({ code: "codigo-ok", name: "Luis", phone: "27123456",
    response: "decline", adultsConfirmed: 5, kidsConfirmed: 5 });
  assert.equal(declined.created, true);
  assert.equal(api.readGuests_().find((g) => g.name === "Luis").adultsConfirmed, 0, "declinar fuerza cero");
  console.log("PASS  declinar deja el conteo en cero");
}

// --- Caso 7: el admin no puede robar un teléfono ajeno ---
{
  const guests = makeSheet(["id","name","phone","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","notes","table"], [["id-1","Ana","099123456","accept",2,0,"","","",""]]);
  guests.appendRow = function (row) { this._grid.push(row.slice()); };
  const { api } = run({ guests }, { INVITE_CODE: "c", GUESTS_SCHEMA: "v2", GUESTS_PHONE_SCHEMA: "v3", ADMIN_PASSPHRASE: "p" });
  assert.throws(() => api.handleUpsertGuest_({ guest: { name: "Otro", phone: "099 123 456", response: "accept", adultsConfirmed: 1, kidsConfirmed: 0 } }), /ya hay un invitado con ese teléfono/);
  const manual = api.handleUpsertGuest_({ guest: { name: "Abuela", phone: "24001122", response: "accept", adultsConfirmed: 2, kidsConfirmed: 0 } });
  assert.equal(manual.created, true, "el admin da de alta con su propio teléfono");
  console.log("PASS  teléfono único entre filas");
}

// --- Caso 8: el teléfono no puede perder el cero inicial ---
{
  const NEW = ["id","name","phone","response","adultsConfirmed","kidsConfirmed","comment","rsvpTimestamp","notes","table"];
  const guests = makeSheet(NEW, []);
  const { api } = run({ guests }, { INVITE_CODE: "c", GUESTS_SCHEMA: "v2", GUESTS_PHONE_SCHEMA: "v3" });

  api.handleSubmitRsvp_({ code: "c", name: "Juan Rodríguez", phone: "098230013",
    response: "accept", adultsConfirmed: 1, kidsConfirmed: 0 });

  const stored = guests._grid[1][2];
  assert.equal(typeof stored, "string", "se guarda como texto, no como número");
  assert.equal(stored, "098230013", "conserva el cero inicial");
  assert.equal(api.readGuests_()[0].phone, "098230013");
  console.log("PASS  el teléfono conserva el cero inicial y se guarda como texto");

  // Y sigue siendo la misma clave al volver a confirmar.
  const again = api.handleSubmitRsvp_({ code: "c", name: "Juan Rodríguez", phone: "098230013",
    response: "accept", adultsConfirmed: 2, kidsConfirmed: 0, confirmReplace: true });
  assert.equal(again.created, false, "lo reconoce, no duplica");
  assert.equal(api.readGuests_().length, 1);
  console.log("PASS  con el cero conservado, el número sigue siendo la misma clave");
}

console.log("\nOK: migración y auto-registro verificados");
