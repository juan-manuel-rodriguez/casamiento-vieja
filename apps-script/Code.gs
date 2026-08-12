/**
 * Backend for the wedding RSVP app. Runs as a Google Apps Script Web App,
 * container-bound to the Sheet that stores guests and RSVPs.
 *
 * SETUP (once):
 *   1. Open the Sheet → Extensions → Apps Script.
 *   2. Delete the example file and paste this file as Code.gs.
 *   3. In the editor sidebar: ⚙ Project Settings → Script properties.
 *      Add three rows:
 *        - ADMIN_PASSPHRASE (passphrase the /admin page will require)
 *        - SPOTIFY_CLIENT_ID
 *        - SPOTIFY_CLIENT_SECRET (both from developer.spotify.com)
 *      These survive code rewrites.
 *   4. Save. Run the `setup` function once (it asks for permissions).
 *      This creates the `guests` and `songRecommendations` tabs.
 *   5. Deploy → New deployment → Web app.
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Copy the URL (ends in /exec) into src/config.ts as APPS_SCRIPT_URL.
 *
 *   When you redeploy after editing this file, the Script Properties survive
 *   so you don't need to re-enter the passphrase or Spotify keys.
 *
 * When you edit this file, redeploy via Manage deployments → Edit → New version
 * so the public URL serves the new code.
 *
 * CORS notes: Apps Script web apps cannot set custom CORS headers. POST
 * requests with Content-Type "text/plain" do not trigger a preflight, so the
 * frontend sends JSON as a text body and we parse it from e.postData.contents.
 */

// ---------- Configuration ----------

/** @const {string} */ var GUESTS_TAB = 'guests';
/** @const {string} */ var SONG_RECS_TAB = 'songRecommendations';
/** @const {string} */ var TABLES_TAB = 'tables';
/** @const {string} */ var SETTINGS_TAB = 'settings';

/**
 * Los invitados. La fila se crea cuando la persona confirma: declara su
 * nombre, su cédula y cuánta gente lleva. `cedula` es la clave con la que se
 * la reconoce si vuelve a completar el formulario, y va vacía en los que carga
 * el admin a mano —gente mayor a la que no se le manda el link y de la que no
 * hay forma de saber la cédula.
 * @const {Array<string>}
 */
var GUESTS_HEADERS = [
  'id',
  'name',
  'cedula',
  'response',
  'adultsConfirmed',
  'kidsConfirmed',
  'comment',
  'rsvpTimestamp',
  'contact',
  'notes',
  'table',
];

/**
 * Las recomendaciones son anónimas: quien recomienda una canción todavía no
 * existe como invitado, porque la fila recién se crea al confirmar.
 * @const {Array<string>}
 */
var SONG_RECS_HEADERS = ['timestamp', 'trackId', 'trackName', 'artists', 'spotifyUrl'];

/**
 * Las mesas del salón. `number` es lo que se guarda junto a cada invitado, así
 * que renumerar mesas resienta gente en silencio: conviene borrar y crear.
 * @const {Array<string>}
 */
var TABLES_HEADERS = ['number', 'seats', 'zone'];

/**
 * Contenido de la invitación, una fila por campo. Los campos que son listas
 * (eventos, cuentas, lados, listas de vestimenta) se guardan como JSON en la
 * celda: el admin los edita con un formulario, no a mano.
 * @const {Array<string>}
 */
var SETTINGS_HEADERS = ['key', 'value'];

/**
 * Key used to store the admin passphrase in PropertiesService. Set the value
 * via Project Settings → Script Properties. Storing it outside of source
 * means pasting a new version of this file does not overwrite the passphrase.
 * @const {string}
 */
var ADMIN_PASSPHRASE_KEY = 'ADMIN_PASSPHRASE';

/**
 * Código de la invitación. Se autogenera en `setup()` la primera vez y viaja
 * en la URL como ?code=... Sirve para que quien entre al dominio de casualidad
 * no vea la invitación; NO es autenticación: se reenvía por WhatsApp y se le
 * puede sacar una captura. Lo que compra es que la lista de invitados no sea
 * enumerable — `listGuests` sigue detrás de la contraseña de admin.
 *
 * CUIDADO: borrar o rotar esta property invalida todos los links ya mandados,
 * sin aviso ni forma de recuperarlos.
 * @const {string}
 */
var INVITE_CODE_KEY = 'INVITE_CODE';

/** @const {string} */ var SPOTIFY_CLIENT_ID_KEY = 'SPOTIFY_CLIENT_ID';
/** @const {string} */ var SPOTIFY_CLIENT_SECRET_KEY = 'SPOTIFY_CLIENT_SECRET';
/** @const {string} */ var SPOTIFY_TOKEN_CACHE_KEY = 'SPOTIFY_TOKEN';

/** @const {string} */ var RESPONSE_ACCEPT = 'accept';
/** @const {string} */ var RESPONSE_DECLINE = 'decline';

/**
 * Build stamp. Bump it whenever this file changes, then after redeploying run
 *
 *   curl -sL "<APPS_SCRIPT_URL>?action=version"
 *
 * to confirm the live URL really serves the new code. Two things make that
 * worth checking: saving in the editor does not publish anything, and "New
 * deployment" mints a second URL instead of updating the one the app calls.
 * @const {string}
 */
var CODE_VERSION = '2026-08-12.1';

// ---------- Public bootstrap ----------

/**
 * Idempotent setup. Creates the `guests` tab and writes headers
 * if they are missing. Safe to call repeatedly.
 */
function setup() {
  // Las migraciones van ANTES de ensureSheetWithHeaders_: esa función solo
  // compara y pisa la fila de headers, así que si corriera primero dejaría los
  // datos viejos reetiquetados en silencio, leyendo `adultSlots` como `cedula`.
  migrateGuestsToSelfRegistration_();
  ensureSheetWithHeaders_(GUESTS_TAB, GUESTS_HEADERS);
  ensureTextColumns_();
  migrateSongRecsDropGuestId_();
  ensureSheetWithHeaders_(SONG_RECS_TAB, SONG_RECS_HEADERS);
  ensureInviteCode_();
  ensureSheetWithHeaders_(TABLES_TAB, TABLES_HEADERS);
  seedDefaultTables_();
  ensureSheetWithHeaders_(SETTINGS_TAB, SETTINGS_HEADERS);
  ensureSettingsTextColumn_();
  dropConflictSheets_();
}

/**
 * Sheets crea copias con sufijo `_conflict…` cuando dos escrituras nacen a la
 * vez, y `setup` corre en cada request, así que dos llamadas simultáneas
 * pueden crear la misma pestaña dos veces. Se borran solo las que llevan el
 * nombre de una pestaña nuestra, para no tocar nada que haya puesto alguien.
 */
function dropConflictSheets_() {
  var known = [GUESTS_TAB, SONG_RECS_TAB, TABLES_TAB, SETTINGS_TAB];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    for (var j = 0; j < known.length; j++) {
      if (name.indexOf(known[j] + '_conflict') === 0) {
        ss.deleteSheet(sheets[i]);
        break;
      }
    }
  }
}

/** @const {string} */ var GUESTS_SCHEMA_KEY = 'GUESTS_SCHEMA';

/**
 * Migra la pestaña `guests` del modelo de cupos al de auto-registro.
 *
 * Esquema viejo: id, name, adultSlots, kidSlots, invitationSent, response,
 * adultsConfirmed, kidsConfirmed, comment, rsvpTimestamp, contact, notes,
 * side, table.
 *
 * Se detecta por el header, no solo por la Script Property, para que sobreviva
 * a restaurar la hoja desde el historial de versiones. La property es un atajo
 * para no leer el header en cada request.
 *
 * Los cupos de quien todavía no respondió pasan a ser la cantidad esperada de
 * gente: es el dato con el que el admin venía contando lugares, y perderlo
 * dejaría las mesas mal calculadas.
 */
function migrateGuestsToSelfRegistration_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(GUESTS_SCHEMA_KEY)) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GUESTS_TAB);
  if (!sheet || sheet.getLastColumn() < 3) {
    props.setProperty(GUESTS_SCHEMA_KEY, 'v2');
    return;
  }

  // El lock evita que dos requests simultáneos hagan clear() entre el clear y
  // el setValues del otro, que vaciaría la hoja. `setup` corre antes del
  // dispatch, así que este lock siempre está cerrado cuando los handlers abren
  // el suyo: el de Apps Script no es reentrante y anidarlo tira "servidor
  // ocupado" a los 10 segundos.
  withWriteLock_(function () {
    var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headerRow[2] !== 'adultSlots') {
      props.setProperty(GUESTS_SCHEMA_KEY, 'v2');
      return;
    }
    var lastRow = sheet.getLastRow();
    var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 14).getValues() : [];
    var migrated = data.map(function (r) {
      var response = String(r[5] || '');
      var expectedAdults = response === 'accept' ? r[6] : (response === 'decline' ? 0 : r[2]);
      var expectedKids = response === 'accept' ? r[7] : (response === 'decline' ? 0 : r[3]);
      return [
        r[0],               // id
        r[1],               // name
        '',                 // cedula: los que ya existían se cargaron a mano
        response,
        Math.max(0, Number(expectedAdults) || 0),
        Math.max(0, Number(expectedKids) || 0),
        r[8],               // comment
        r[9],               // rsvpTimestamp
        r[10],              // contact
        r[11],              // notes
        r[13],              // table
      ];
    });

    // clear() y no clearContents(): hay que borrar las tres columnas sobrantes,
    // porque readSheet_ lee getLastColumn() y no GUESTS_HEADERS.length.
    sheet.clear();
    sheet.getRange(1, 1, 1, GUESTS_HEADERS.length).setValues([GUESTS_HEADERS]);
    if (migrated.length > 0) {
      sheet.getRange(2, 1, migrated.length, GUESTS_HEADERS.length).setValues(migrated);
    }
    sheet.setFrozenRows(1);
    // clear() se llevó los formatos, así que hay que reponerlos acá mismo.
    applyGuestTextFormats_(sheet);
    props.setProperty(GUESTS_SCHEMA_KEY, 'v2');
  });
}

/** Deja en formato texto las columnas de texto libre de `guests`. */
function applyGuestTextFormats_(sheet) {
  var rowCount = sheet.getMaxRows() - 1;
  if (rowCount < 1) return;
  for (var i = 0; i < TEXT_COLUMNS_.length; i++) {
    sheet.getRange(2, TEXT_COLUMNS_[i], rowCount, 1).setNumberFormat('@');
  }
}

/** Saca la columna `guestId`: las recomendaciones pasaron a ser anónimas. */
function migrateSongRecsDropGuestId_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SONG_RECS_TAB);
  if (!sheet || sheet.getLastColumn() < 2) return;
  if (sheet.getRange(1, 2).getValue() !== 'guestId') return;
  withWriteLock_(function () {
    if (sheet.getRange(1, 2).getValue() !== 'guestId') return;
    var lastRow = sheet.getLastRow();
    var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];
    var migrated = data.map(function (r) {
      return [r[0], r[2], r[3], r[4], r[5]];
    });
    sheet.clear();
    sheet.getRange(1, 1, 1, SONG_RECS_HEADERS.length).setValues([SONG_RECS_HEADERS]);
    if (migrated.length > 0) {
      sheet.getRange(2, 1, migrated.length, SONG_RECS_HEADERS.length).setValues(migrated);
    }
    sheet.setFrozenRows(1);
  });
}

/**
 * Genera el código de la invitación la primera vez. Toma el lock solo cuando
 * falta, para no pagarlo en cada request.
 */
function ensureInviteCode_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(INVITE_CODE_KEY)) return;
  withWriteLock_(function () {
    if (props.getProperty(INVITE_CODE_KEY)) return;
    props.setProperty(INVITE_CODE_KEY, Utilities.getUuid());
  });
}

/** @const {number} */ var DEFAULT_TABLE_COUNT = 20;
/** @const {number} */ var DEFAULT_TABLE_SEATS = 8;
/** @const {string} */ var TABLES_SEEDED_KEY = 'TABLES_SEEDED';

/**
 * Siembra mesas para poder empezar a sentar gente sin cargarlas una por una.
 *
 * Corre una sola vez, marcada con una Script Property y no con "¿la pestaña
 * existe?": la pestaña puede haberse creado vacía por una versión anterior, y
 * en ese caso el sembrado no se dispararía nunca. El flag además evita que
 * borrar todas las mesas a propósito las haga volver en el request siguiente,
 * porque `setup` se ejecuta en cada llamada.
 */
function seedDefaultTables_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(TABLES_SEEDED_KEY)) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABLES_TAB);
  if (!sheet) return;
  props.setProperty(TABLES_SEEDED_KEY, '1');
  if (sheet.getLastRow() >= 2) return;
  var rows = [];
  for (var i = 1; i <= DEFAULT_TABLE_COUNT; i++) rows.push([i, DEFAULT_TABLE_SEATS, '']);
  sheet.getRange(2, 1, rows.length, TABLES_HEADERS.length).setValues(rows);
}

/**
 * La columna `value` de settings guarda JSON, que empieza con "[" o "{". Sin
 * formato de texto plano, Sheets intenta interpretar algunos valores y los
 * rompe. Mismo criterio que ensureTextColumns_ en la pestaña de invitados.
 */
function ensureSettingsTextColumn_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_TAB);
  if (!sheet) return;
  if (sheet.getRange(2, 2).getNumberFormat() === '@') return;
  var rowCount = sheet.getMaxRows() - 1;
  if (rowCount < 1) return;
  sheet.getRange(2, 1, rowCount, 2).setNumberFormat('@');
}



/**
 * Columns holding free text (name, comment, contact, notes, table) are forced
 * to the plain-text number format. Otherwise Sheets parses a value starting
 * with "+" or "=" — a phone like "+598 99 123 456", or a comment like "+1
 * amigo" — as a formula and the cell renders "Error de análisis de fórmula"
 * instead of the text. Cheap enough to call on every request: one
 * getNumberFormat read short-circuits it once the format is applied. The
 * guard reads the LAST column in the list, so appending a column here still
 * triggers a reformat on the next request.
 * @const {Array<number>} 1-based indexes into GUESTS_HEADERS.
 */
var TEXT_COLUMNS_ = [2, 3, 7, 9, 10, 11];

/** Índice de `cedula` dentro de TEXT_COLUMNS_: es la que decide el guard. */
var CEDULA_COLUMN_ = 3;

function ensureTextColumns_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GUESTS_TAB);
  if (!sheet) return;
  if (sheet.getRange(2, CEDULA_COLUMN_).getNumberFormat() === '@') return;
  var rowCount = sheet.getMaxRows() - 1;
  if (rowCount < 1) return;
  for (var i = 0; i < TEXT_COLUMNS_.length; i++) {
    sheet.getRange(2, TEXT_COLUMNS_[i], rowCount, 1).setNumberFormat('@');
  }
}



// ---------- Router ----------

/**
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  return route_('GET', e);
}

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  return route_('POST', e);
}

/**
 * Dispatch a request to the right handler based on the `action` parameter.
 * @param {'GET'|'POST'} method
 * @param {GoogleAppsScript.Events.AppsScriptHttpRequestEvent} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function route_(method, e) {
  try {
    setup(); // cheap, idempotent
    var params = parseRequest_(method, e);
    var action = String(params.action || '');
    var handler = HANDLERS_[action];
    if (!handler) return jsonResponse_({ error: 'unknown action: ' + action });
    return jsonResponse_(handler(params));
  } catch (err) {
    var message = (err && err.message) ? err.message : String(err);
    return jsonResponse_({ error: message });
  }
}

/**
 * Map of action name to handler. Handlers receive parsed params and return a
 * plain object that is serialized as JSON. Admin-gated handlers call
 * requireAdmin_(params) themselves before doing any work.
 */
var HANDLERS_ = {
  version: function () {
    return { version: CODE_VERSION, tabs: SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) {
      return s.getName();
    }) };
  },
  getSettings: function (params) {
    requirePublicAccess_(params);
    return { settings: readSettings_() };
  },
  getInviteCode: function (params) {
    requireAdmin_(params);
    return { code: getInviteCode_() };
  },
  listTables: function (params) {
    requireAdmin_(params);
    return { tables: readTables_() };
  },
  saveTables: function (params) {
    requireAdmin_(params);
    return handleSaveTables_(params);
  },
  saveSettings: function (params) {
    requireAdmin_(params);
    return handleSaveSettings_(params);
  },
  deleteSongRecommendation: function (params) {
    requireAdmin_(params);
    return handleDeleteSongRecommendation_(params);
  },
  submitRsvp: function (params) {
    return handleSubmitRsvp_(params);
  },
  searchSongs: function (params) {
    requirePublicAccess_(params);
    return handleSearchSongs_(params);
  },
  submitSongRecommendation: function (params) {
    return handleSubmitSongRecommendation_(params);
  },
  checkAuth: function (params) {
    requireAdmin_(params);
    return { ok: true };
  },
  listGuests: function (params) {
    requireAdmin_(params);
    return { guests: readGuests_() };
  },
  listSongRecommendations: function (params) {
    requireAdmin_(params);
    return { recommendations: readSongRecommendations_() };
  },
  upsertGuest: function (params) {
    requireAdmin_(params);
    return handleUpsertGuest_(params);
  },
  deleteGuest: function (params) {
    requireAdmin_(params);
    return handleDeleteGuest_(params);
  },
};

// ---------- Request parsing ----------

/**
 * @param {'GET'|'POST'} method
 * @param {GoogleAppsScript.Events.AppsScriptHttpRequestEvent} e
 * @returns {Object<string, *>}
 */
function parseRequest_(method, e) {
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents) || {};
    } catch (_) {
      // fall through to form-encoded
    }
  }
  return (e && e.parameter) ? e.parameter : {};
}

/**
 * @param {*} payload
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse_(payload) {
  var output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ---------- Validation ----------

/**
 * Read a non-empty string param or throw.
 * @param {Object} params
 * @param {string} key
 * @returns {string}
 */
function requireString_(params, key) {
  var value = params[key];
  if (value == null) throw new Error('missing field: ' + key);
  var trimmed = String(value).trim();
  if (!trimmed) throw new Error('empty field: ' + key);
  return trimmed;
}

/**
 * Read an integer in [min, max] or throw.
 * @param {Object} params
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function requireInt_(params, key, min, max) {
  var raw = params[key];
  var n = Number(raw);
  if (!isFinite(n)) throw new Error('invalid number: ' + key);
  n = Math.round(n);
  if (n < min || n > max) throw new Error('out of range: ' + key);
  return n;
}

// ---------- Auth ----------

/**
 * Verify the caller knows the admin passphrase. Throws on failure.
 * @param {Object} params
 */
function requireAdmin_(params) {
  var supplied = String(params.auth || '');
  var expected = getAdminPassphrase_();
  if (!supplied || supplied !== expected) throw new Error('invalid passphrase');
}

/**
 * Deja pasar a quien traiga el código de la invitación o la contraseña de
 * admin. El panel usa la contraseña para no tener que conocer el código.
 *
 * El mensaje de error NO puede contener la palabra "passphrase": el admin
 * detecta credencial inválida buscando esa palabra en el mensaje, y
 * deslogearía a Seba y Emi por un código equivocado de un invitado.
 * @param {Object} params
 */
function requirePublicAccess_(params) {
  var code = String(params.code || '').trim();
  if (code && code === getInviteCode_()) return;
  var supplied = String(params.auth || '');
  if (supplied && supplied === getAdminPassphrase_()) return;
  throw new Error('código de invitación inválido');
}

/** @returns {string} */
function getInviteCode_() {
  ensureInviteCode_();
  return PropertiesService.getScriptProperties().getProperty(INVITE_CODE_KEY) || '';
}

/**
 * Cédula uruguaya en forma canónica: 8 dígitos con ceros a la izquierda.
 * Sin el relleno, "1234561" y "01234561" serían la misma persona y dos claves
 * distintas, y la unicidad fallaría en silencio.
 *
 * ESPEJO de src/lib/cedula.ts. Si cambia una, cambia la otra; los casos de
 * prueba están en src/lib/cedula.test.ts y valen para las dos.
 * @param {*} raw
 * @returns {string} "" si no es normalizable.
 */
function normalizeCedula_(raw) {
  var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 8) return '';
  while (digits.length < 8) digits = '0' + digits;
  return digits;
}

/** Valida el dígito verificador. Espejo de isValidCedula en src/lib/cedula.ts. */
function isValidCedula_(raw) {
  var digits = normalizeCedula_(raw);
  if (!digits) return false;
  var weights = [2, 9, 8, 7, 6, 3, 4];
  var sum = 0;
  for (var i = 0; i < weights.length; i++) sum += Number(digits.charAt(i)) * weights[i];
  return (10 - (sum % 10)) % 10 === Number(digits.charAt(7));
}

/**
 * Read the admin passphrase from PropertiesService. Throws if not set.
 * @returns {string}
 */
function getAdminPassphrase_() {
  var stored = PropertiesService.getScriptProperties().getProperty(ADMIN_PASSPHRASE_KEY);
  if (!stored) {
    throw new Error(
      'Admin passphrase not configured. Set it in Project Settings → Script Properties (key: ' +
      ADMIN_PASSPHRASE_KEY +
      ').',
    );
  }
  return stored;
}

/**
 * Returns a cached Spotify access token, refreshing via the client_credentials
 * flow when missing or expired. Token cache TTL = expires_in - 60 seconds so
 * we never serve a token within 60s of expiry. Throws when the script
 * properties are unset or Spotify rejects the credentials.
 * @returns {string}
 */
function getSpotifyToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(SPOTIFY_TOKEN_CACHE_KEY);
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty(SPOTIFY_CLIENT_ID_KEY);
  var clientSecret = props.getProperty(SPOTIFY_CLIENT_SECRET_KEY);
  if (!clientId || !clientSecret) {
    throw new Error(
      'Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Project Settings → Script Properties.',
    );
  }
  var auth = Utilities.base64Encode(clientId + ':' + clientSecret);
  var resp = UrlFetchApp.fetch('https://accounts.spotify.com/api/token', {
    method: 'post',
    headers: { Authorization: 'Basic ' + auth },
    payload: { grant_type: 'client_credentials' },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('spotify auth failed: ' + resp.getContentText());
  }
  var json = JSON.parse(resp.getContentText());
  var ttl = Math.max(60, Number(json.expires_in || 3600) - 60);
  cache.put(SPOTIFY_TOKEN_CACHE_KEY, json.access_token, ttl);
  return json.access_token;
}

// ---------- Handlers ----------


/** @const {number} */ var MAX_PARTY_ADULTS_ = 10;
/** @const {number} */ var MAX_PARTY_KIDS_ = 10;

/**
 * Confirmación del invitado, que se registra solo.
 *
 * La fila se crea acá: antes de confirmar, la persona no existe. La cédula es
 * la clave — si ya confirmó y vuelve a completar el formulario, se actualiza su
 * fila en lugar de duplicarla.
 *
 * Todo el ciclo leer-decidir-escribir va dentro del lock: si la búsqueda
 * quedara afuera, dos envíos simultáneos de la misma cédula crearían dos filas.
 *
 * Al pisar una fila existente se conservan `table`, `contact` y `notes`, que
 * son del admin: reeditar la confirmación no tiene por qué desentar a nadie.
 *
 * Nota: quien tenga el código puede pisar la confirmación de otro si conoce su
 * cédula. Es un compromiso aceptado — no puede leerla, solo sobrescribirla, y
 * las filas que carga el admin no tienen cédula, así que no son alcanzables.
 * @param {Object} params
 * @returns {{ok: true, created: boolean}}
 */
function handleSubmitRsvp_(params) {
  requirePublicAccess_(params);
  var name = requireString_(params, 'name').replace(/\s+/g, ' ').slice(0, 80);
  var cedula = normalizeCedula_(requireString_(params, 'cedula'));
  if (!isValidCedula_(cedula)) throw new Error('cédula inválida');

  var response = requireString_(params, 'response');
  if (response !== RESPONSE_ACCEPT && response !== RESPONSE_DECLINE) {
    throw new Error('invalid response: ' + response);
  }
  var adultsConfirmed = 0;
  var kidsConfirmed = 0;
  if (response === RESPONSE_ACCEPT) {
    adultsConfirmed = requireInt_(params, 'adultsConfirmed', 1, MAX_PARTY_ADULTS_);
    kidsConfirmed = requireInt_(params, 'kidsConfirmed', 0, MAX_PARTY_KIDS_);
  }
  var comment = params.comment == null ? '' : String(params.comment).slice(0, 500);

  return withWriteLock_(function () {
    var sheet = sheetByName_(GUESTS_TAB);
    var existing = findByCedula_(readGuests_(), cedula);
    var row = [
      existing ? existing.id : Utilities.getUuid(),
      name,
      cedula,
      response,
      adultsConfirmed,
      kidsConfirmed,
      comment,
      new Date(),
      existing ? existing.contact : '',
      existing ? existing.notes : '',
      existing ? existing.table : '',
    ];
    if (existing) {
      sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
      return { ok: true, created: false };
    }
    sheet.appendRow(row);
    // La fila recién agregada puede caer más allá del rango que formateó
    // ensureTextColumns_, y sin formato de texto la cédula pierde los ceros.
    applyGuestTextFormats_(sheet);
    return { ok: true, created: true };
  });
}

/**
 * Busca por cédula normalizando también lo que está en la planilla, para
 * tolerar una tipeada a mano con puntos.
 * @param {Array<Guest>} list
 * @param {string} cedula
 * @returns {Guest|null}
 */
function findByCedula_(list, cedula) {
  if (!cedula) return null;
  for (var i = 0; i < list.length; i++) {
    if (normalizeCedula_(list[i].cedula) === cedula) return list[i];
  }
  return null;
}

/**
 * Public search against Spotify's catalog. Used by the guest page to let
 * guests pick a song to recommend.
 * @param {Object} params
 * @returns {{tracks: Array}}
 */
function handleSearchSongs_(params) {
  var query = String(params.query || '').trim();
  if (query.length < 2) return { tracks: [] };
  var token = getSpotifyToken_();
  var url =
    'https://api.spotify.com/v1/search?type=track&limit=8&market=UY&q=' +
    encodeURIComponent(query);
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('spotify search failed: ' + resp.getContentText());
  }
  var data = JSON.parse(resp.getContentText());
  var items = (data.tracks && data.tracks.items) || [];
  return {
    tracks: items.map(function (t) {
      var images = (t.album && t.album.images) || [];
      var image = images.length > 0 ? images[images.length - 1] : null;
      return {
        id: t.id,
        name: t.name,
        artists: (t.artists || []).map(function (a) { return a.name; }).join(', '),
        album: t.album ? t.album.name : '',
        imageUrl: image ? image.url : '',
        spotifyUrl: t.external_urls ? t.external_urls.spotify : '',
        previewUrl: t.preview_url || '',
      };
    }),
  };
}

/**
 * Guarda una recomendación de canción. Es anónima: quien la manda todavía no
 * existe como invitado, porque la fila se crea recién al confirmar.
 * @param {Object} params
 * @returns {{ok: true}}
 */
function handleSubmitSongRecommendation_(params) {
  requirePublicAccess_(params);
  var trackId = requireString_(params, 'trackId');
  var trackName = requireString_(params, 'trackName');
  var artists = String(params.artists || '');
  var spotifyUrl = String(params.spotifyUrl || '');

  return withWriteLock_(function () {
    sheetByName_(SONG_RECS_TAB).appendRow([
      new Date(), trackId, trackName, artists, spotifyUrl,
    ]);
    return { ok: true };
  });
}

/**
 * Alta y edición desde el admin. Sirve además para confirmar por otra persona:
 * la gente mayor a la que no se le manda el link se carga acá con su respuesta
 * y su cantidad de gente ya puesta.
 *
 * A diferencia del modelo anterior, el admin es dueño de `response` y de los
 * confirmados: no se preservan de la fila existente, se pisan con lo que
 * mande. Si el invitado y el admin editan a la vez, gana el último; los dos
 * caminos toman el mismo lock, así que no hay corrupción.
 *
 * La cédula es opcional —los cargados a mano no la tienen— pero si viene, tiene
 * que ser válida y no puede pertenecer a otra fila.
 * @param {Object} params
 * @returns {{ok: true, created: boolean, id: string}}
 */
function handleUpsertGuest_(params) {
  var input = params.guest || {};
  var name = requireString_(input, 'name');
  var providedId = String(input.id || '').trim();
  var cedula = normalizeCedula_(input.cedula);
  if (String(input.cedula || '').trim() && !isValidCedula_(cedula)) {
    throw new Error('cédula inválida');
  }
  var response = String(input.response || '').trim();
  if (response !== RESPONSE_ACCEPT && response !== RESPONSE_DECLINE) response = '';
  var adultsConfirmed = Math.max(0, Math.round(Number(input.adultsConfirmed) || 0));
  var kidsConfirmed = Math.max(0, Math.round(Number(input.kidsConfirmed) || 0));
  var contact = input.contact == null ? '' : String(input.contact);
  var notes = input.notes == null ? '' : String(input.notes);
  // Texto libre a propósito: la lista de mesas vive en el frontend, y un valor
  // tipeado directo en la planilla tiene que sobrevivir a una edición.
  var table = input.table == null ? '' : String(input.table).trim();

  return withWriteLock_(function () {
    var sheet = sheetByName_(GUESTS_TAB);
    var list = readGuests_();
    var id = providedId || Utilities.getUuid();
    var existing = findInList_(list, id);
    if (cedula) {
      var owner = findByCedula_(list, cedula);
      if (owner && owner.id !== id) {
        throw new Error('ya hay un invitado con esa cédula: ' + owner.name);
      }
    }
    var row = [
      id,
      name,
      cedula,
      response,
      adultsConfirmed,
      kidsConfirmed,
      existing ? existing.comment : '',
      existing ? existing.rsvpTimestamp : '',
      contact,
      notes,
      table,
    ];
    if (existing) {
      sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
      return { ok: true, created: false, id: id };
    }
    sheet.appendRow(row);
    applyGuestTextFormats_(sheet);
    return { ok: true, created: true, id: id };
  });
}

/**
 * @param {Array<Guest>} list
 * @param {string} id
 * @returns {Guest|null}
 */
function findInList_(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/**
 * Serialize writes through the script lock. Apps Script does not guarantee
 * isolation between concurrent doPost invocations, so we wrap any
 * read-modify-write sequence in here to avoid races on id generation and
 * row indexes.
 * @template T
 * @param {function(): T} work
 * @returns {T}
 */
function withWriteLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('servidor ocupado, reintentá');
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

/**
 * @param {Object} params
 * @returns {{ok: true, deleted: boolean}}
 */
function handleDeleteGuest_(params) {
  var id = requireString_(params, 'id');
  return withWriteLock_(function () {
    var guest = findGuestById_(id);
    if (!guest) return { ok: true, deleted: false };
    sheetByName_(GUESTS_TAB).deleteRow(guest.rowIndex);
    return { ok: true, deleted: true };
  });
}


/**
 * Reemplaza la lista completa de mesas. Se pisa entera en vez de hacer CRUD
 * fila por fila: el admin edita una lista y la guarda, y así la escritura es
 * atómica y no quedan huecos si algo falla en el medio.
 * @param {Object} params
 * @returns {{ok: true, count: number}}
 */
function handleSaveTables_(params) {
  var input = params.tables;
  if (!Array.isArray(input)) throw new Error('missing field: tables');

  var seen = {};
  var rows = input.map(function (t) {
    var number = Math.round(Number(t.number));
    if (!isFinite(number) || number < 1) throw new Error('número de mesa inválido: ' + t.number);
    if (seen[number]) throw new Error('mesa repetida: ' + number);
    seen[number] = true;
    var seats = Math.round(Number(t.seats));
    if (!isFinite(seats) || seats < 1) throw new Error('lugares inválidos en la mesa ' + number);
    return [number, seats, t.zone == null ? '' : String(t.zone).trim()];
  });
  rows.sort(function (a, b) { return a[0] - b[0]; });

  return withWriteLock_(function () {
    var sheet = sheetByName_(TABLES_TAB);
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, TABLES_HEADERS.length).clearContent();
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, TABLES_HEADERS.length).setValues(rows);
    return { ok: true, count: rows.length };
  });
}

/**
 * @typedef {{number: number, seats: number, zone: string}} VenueTable
 * @returns {Array<VenueTable>}
 */
function readTables_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABLES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, TABLES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var number = Number(values[i][0]);
    if (!number) continue;
    out.push({
      number: number,
      seats: Math.max(1, Number(values[i][1] || 1)),
      zone: String(values[i][2] || ''),
    });
  }
  out.sort(function (a, b) { return a.number - b.number; });
  return out;
}

/**
 * Contenido de la invitación como objeto. Los valores que arrancan con "[" o
 * "{" se parsean como JSON; el resto viaja como texto. Si un JSON quedó roto
 * por una edición a mano en el Sheet, se devuelve el texto crudo en lugar de
 * tirar toda la respuesta abajo.
 * @returns {Object<string, *>}
 */
function readSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SETTINGS_HEADERS.length).getValues();
  var out = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    var raw = values[i][1];
    var text = raw == null ? '' : String(raw);
    var head = text.charAt(0);
    if (head === '[' || head === '{') {
      try {
        out[key] = JSON.parse(text);
        continue;
      } catch (err) {
        // JSON roto a mano en el Sheet: mejor devolver el texto que romper todo.
      }
    }
    out[key] = text;
  }
  return out;
}

/**
 * Reemplaza el contenido de la invitación. Recibe el objeto entero, no un
 * campo suelto, así el Sheet nunca queda con una mezcla de dos versiones.
 * @param {Object} params
 * @returns {{ok: true, count: number}}
 */
function handleSaveSettings_(params) {
  var input = params.settings;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('missing field: settings');
  }
  var rows = [];
  for (var key in input) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    var value = input[key];
    rows.push([key, value === null || value === undefined
      ? ''
      : (typeof value === 'object' ? JSON.stringify(value) : String(value))]);
  }

  return withWriteLock_(function () {
    var sheet = sheetByName_(SETTINGS_TAB);
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, SETTINGS_HEADERS.length).clearContent();
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, SETTINGS_HEADERS.length).setValues(rows);
      sheet.getRange(2, 1, rows.length, SETTINGS_HEADERS.length).setNumberFormat('@');
    }
    return { ok: true, count: rows.length };
  });
}

/**
 * Borra una recomendación por su fila. Hace falta para limpiar las que quedan
 * huérfanas cuando se borra al invitado que las mandó.
 * @param {Object} params
 * @returns {{ok: true, deleted: boolean}}
 */
function handleDeleteSongRecommendation_(params) {
  var rowIndex = Math.round(Number(params.rowIndex));
  if (!isFinite(rowIndex) || rowIndex < 2) throw new Error('fila inválida: ' + params.rowIndex);
  return withWriteLock_(function () {
    var sheet = sheetByName_(SONG_RECS_TAB);
    if (rowIndex > sheet.getLastRow()) return { ok: true, deleted: false };
    sheet.deleteRow(rowIndex);
    return { ok: true, deleted: true };
  });
}

// ---------- IO helpers ----------

/**
 * @param {string} name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function sheetByName_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('missing sheet: ' + name);
  return sheet;
}

/**
 * Idempotent: makes sure a sheet named `name` exists with the given headers
 * in row 1. Safe under concurrent execution — if two doPost handlers race
 * and both try to insertSheet, the second falls back to the just-created
 * sheet instead of crashing.
 * @param {string} name
 * @param {Array<string>} headers
 */
function ensureSheetWithHeaders_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    try {
      sheet = ss.insertSheet(name);
    } catch (err) {
      // Concurrent request created it between our getSheetByName and
      // insertSheet calls. Re-read and proceed.
      sheet = ss.getSheetByName(name);
      if (!sheet) throw err;
    }
  }
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var matches = true;
  for (var i = 0; i < headers.length; i++) {
    if (firstRow[i] !== headers[i]) { matches = false; break; }
  }
  if (!matches) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

/**
 * @typedef {{rowIndex: number, id: string, name: string, cedula: string,
 *           response: string, adultsConfirmed: number, kidsConfirmed: number,
 *           comment: string, rsvpTimestamp: string, contact: string,
 *           notes: string, table: string}} Guest
 */

/**
 * @returns {Array<Guest>}
 */
function readGuests_() {
  return readSheet_(GUESTS_TAB, mapGuestRow_);
}

/**
 * @typedef {{rowIndex: number, timestamp: string, trackId: string,
 *           trackName: string, artists: string, spotifyUrl: string}} SongRec
 */

/**
 * @returns {Array<SongRec>}
 */
function readSongRecommendations_() {
  return readSheet_(SONG_RECS_TAB, mapSongRecRow_);
}

/**
 * @param {Array<*>} row
 * @returns {SongRec}
 */
function mapSongRecRow_(row, rowIndex) {
  var ts = row[0];
  return {
    rowIndex: rowIndex,
    timestamp: ts instanceof Date ? ts.toISOString() : String(ts || ''),
    trackId: String(row[1] || ''),
    trackName: String(row[2] || ''),
    artists: String(row[3] || ''),
    spotifyUrl: String(row[4] || ''),
  };
}

/**
 * @param {string} tab
 * @param {function(Array<*>, number): *} mapper
 * @returns {Array<*>}
 */
function readSheet_(tab, mapper) {
  var sheet = sheetByName_(tab);
  if (sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) rows.push(mapper(values[i], i + 2));
  return rows;
}

/**
 * @param {Array<*>} row
 * @param {number} rowIndex
 * @returns {Guest}
 */
function mapGuestRow_(row, rowIndex) {
  return {
    rowIndex: rowIndex,
    id: String(row[0] || ''),
    name: String(row[1] || ''),
    cedula: String(row[2] || ''),
    response: String(row[3] || ''),
    adultsConfirmed: Math.max(0, Number(row[4] || 0)),
    kidsConfirmed: Math.max(0, Number(row[5] || 0)),
    comment: String(row[6] || ''),
    rsvpTimestamp: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || ''),
    contact: String(row[8] || ''),
    notes: String(row[9] || ''),
    table: String(row[10] || ''),
  };
}

/**
 * @param {string} id
 * @returns {Guest|null}
 */
function findGuestById_(id) {
  var list = readGuests_();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
