// Backend de la app de casamiento, corriendo como Google Apps Script Web App
// pegado al Sheet (container-bound).
//
// Setup (una vez):
//   1. Abrir el Sheet → Extensiones → Apps Script.
//   2. Borrar el archivo de ejemplo y pegar este archivo como `Code.gs`.
//   3. Guardar. Ejecutar la función `setup` una vez (te va a pedir permisos).
//      Eso crea las pestañas `invitados` y `respuestas` con los headers correctos.
//   4. Deploy → New deployment → Type: Web app.
//        - Execute as: Me (tu cuenta)
//        - Who has access: Anyone
//      Copiar la URL que te da y pegarla en src/config.ts como APPS_SCRIPT_URL.
//   5. Cada vez que cambies este archivo, hay que hacer Deploy → Manage deployments
//      → Edit → New version, para que la URL pública sirva el código nuevo.
//
// CORS: los Web App de Apps Script no permiten setear Access-Control-Allow-Origin
// custom, pero los POST con Content-Type "text/plain" no disparan preflight,
// así que el frontend manda JSON en el body como string. Los GET tampoco
// disparan preflight si no agregamos headers raros.

const TAB_INVITADOS = 'invitados';
const TAB_RESPUESTAS = 'respuestas';

const HEADERS_INVITADOS = ['id', 'nombre', 'acompanantes', 'invitacionEnviada', 'contacto', 'notas'];
const HEADERS_RESPUESTAS = ['timestamp', 'id', 'respuesta', 'cantidadConfirmados', 'comentario'];

// Emails con permisos para acciones de admin (listar respuestas, CRUD de invitados).
// Mantener sincronizado con ADMIN_EMAILS en src/config.ts.
const ADMIN_EMAILS = ['juanm.rodriguez2@gmail.com'];

function setup() {
  ensureSheet_(TAB_INVITADOS, HEADERS_INVITADOS);
  ensureSheet_(TAB_RESPUESTAS, HEADERS_RESPUESTAS);
}

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some((h, i) => firstRow[i] !== h);
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

// --- Router ---

function doGet(e) {
  return route_('GET', e);
}

function doPost(e) {
  return route_('POST', e);
}

function route_(method, e) {
  try {
    setup(); // bootstrap idempotente, barato
    const params = parseParams_(method, e);
    const action = params.action;
    if (!action) return json_({ error: 'missing action' }, 400);

    switch (action) {
      case 'getInvitado':
        return json_(getInvitado_(params.id));
      case 'submitRsvp':
        return json_(submitRsvp_(params));
      case 'listInvitados':
        requireAdmin_(params);
        return json_(listInvitados_());
      case 'listRespuestas':
        requireAdmin_(params);
        return json_(listRespuestas_());
      case 'upsertInvitado':
        requireAdmin_(params);
        return json_(upsertInvitado_(params));
      case 'deleteInvitado':
        requireAdmin_(params);
        return json_(deleteInvitado_(params.id));
      default:
        return json_({ error: 'unknown action: ' + action }, 400);
    }
  } catch (err) {
    return json_({ error: String((err && err.message) || err) }, 500);
  }
}

function parseParams_(method, e) {
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {
      // fallthrough: tal vez vino como form-urlencoded
    }
  }
  return (e && e.parameter) ? e.parameter : {};
}

function json_(payload, status) {
  const out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// --- Auth ---

function requireAdmin_(params) {
  const token = params.token;
  if (!token) throw new Error('missing token');
  const resp = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('invalid token');
  const info = JSON.parse(resp.getContentText());
  if (!info.email || ADMIN_EMAILS.indexOf(info.email) === -1) {
    throw new Error('not an admin: ' + (info.email || 'unknown'));
  }
}

// --- Lecturas ---

function getInvitado_(id) {
  if (!id) return { found: false };
  const inv = findInvitadoById_(id);
  if (!inv) return { found: false };
  // Para el invitado público devolvemos sólo lo que necesita.
  return {
    found: true,
    invitado: { id: inv.id, nombre: inv.nombre, acompanantes: inv.acompanantes },
  };
}

function listInvitados_() {
  return { invitados: readSheet_(TAB_INVITADOS, mapInvitadoRow_) };
}

function listRespuestas_() {
  return { respuestas: readSheet_(TAB_RESPUESTAS, mapRespuestaRow_) };
}

function readSheet_(tab, mapper) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.map((row, i) => mapper(row, i + 2));
}

function mapInvitadoRow_(row, rowIndex) {
  return {
    rowIndex: rowIndex,
    id: String(row[0] || ''),
    nombre: String(row[1] || ''),
    acompanantes: Number(row[2] || 0),
    invitacionEnviada: row[3] === true || row[3] === 'TRUE' || row[3] === 'true',
    contacto: String(row[4] || ''),
    notas: String(row[5] || ''),
  };
}

function mapRespuestaRow_(row) {
  const ts = row[0];
  return {
    timestamp: ts instanceof Date ? ts.toISOString() : String(ts || ''),
    id: String(row[1] || ''),
    respuesta: String(row[2] || ''),
    cantidadConfirmados: Number(row[3] || 0),
    comentario: String(row[4] || ''),
  };
}

function findInvitadoById_(id) {
  const list = readSheet_(TAB_INVITADOS, mapInvitadoRow_);
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

// --- Escrituras ---

function submitRsvp_(params) {
  const id = String(params.id || '').trim();
  const respuesta = String(params.respuesta || '');
  const cantidad = Number(params.cantidadConfirmados || 0);
  const comentario = String(params.comentario || '');

  if (!id) throw new Error('missing id');
  if (respuesta !== 'acepto' && respuesta !== 'no_puedo') throw new Error('invalid respuesta');

  const inv = findInvitadoById_(id);
  if (!inv) throw new Error('invitado no encontrado');

  // El máximo de personas es vos + tus acompañantes.
  const maxPersonas = inv.acompanantes + 1;
  const cantidadOk = respuesta === 'acepto' ? Math.max(1, Math.min(maxPersonas, cantidad || 1)) : 0;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_RESPUESTAS);
  sheet.appendRow([new Date(), id, respuesta, cantidadOk, comentario]);
  return { ok: true };
}

function upsertInvitado_(params) {
  const data = params.invitado || {};
  const id = String(data.id || '').trim();
  if (!id) throw new Error('invitado.id es requerido');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_INVITADOS);
  const list = readSheet_(TAB_INVITADOS, mapInvitadoRow_);
  const existing = list.find((x) => x.id === id);

  const row = [
    id,
    String(data.nombre || ''),
    Number(data.acompanantes || 0),
    Boolean(data.invitacionEnviada),
    String(data.contacto || ''),
    String(data.notas || ''),
  ];

  if (existing) {
    sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { ok: true };
}

function deleteInvitado_(id) {
  if (!id) throw new Error('missing id');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_INVITADOS);
  const list = readSheet_(TAB_INVITADOS, mapInvitadoRow_);
  const inv = list.find((x) => x.id === id);
  if (!inv) return { ok: true, deleted: false };
  sheet.deleteRow(inv.rowIndex);
  return { ok: true, deleted: true };
}
