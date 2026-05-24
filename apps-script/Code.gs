/**
 * Backend for the wedding RSVP app. Runs as a Google Apps Script Web App,
 * container-bound to the Sheet that stores guests and RSVPs.
 *
 * SETUP (once):
 *   1. Open the Sheet → Extensions → Apps Script.
 *   2. Delete the example file and paste this file as Code.gs.
 *   3. Change ADMIN_PASSPHRASE below to a string only you know.
 *   4. Save. Run the `setup` function once (it asks for permissions).
 *      This creates the `guests` and `rsvps` tabs with the correct headers.
 *   5. Deploy → New deployment → Web app.
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Copy the URL (ends in /exec) into src/config.ts as APPS_SCRIPT_URL.
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
/** @const {string} */ var RSVPS_TAB = 'rsvps';

/** @const {Array<string>} */
var GUESTS_HEADERS = ['id', 'name', 'plusOnes', 'invitationSent', 'contact', 'notes'];

/** @const {Array<string>} */
var RSVPS_HEADERS = ['timestamp', 'guestId', 'response', 'partySize', 'comment'];

/**
 * Shared secret required to call any admin endpoint. Change this to a value
 * only you know before deploying. Anyone you tell can manage the guest list.
 * @const {string}
 */
var ADMIN_PASSPHRASE = 'cambiame';

/** @const {string} */ var RESPONSE_ACCEPT = 'accept';
/** @const {string} */ var RESPONSE_DECLINE = 'decline';

// ---------- Public bootstrap ----------

/**
 * Idempotent setup. Creates the `guests` and `rsvps` tabs and writes headers
 * if they are missing. Safe to call repeatedly.
 */
function setup() {
  ensureSheetWithHeaders_(GUESTS_TAB, GUESTS_HEADERS);
  ensureSheetWithHeaders_(RSVPS_TAB, RSVPS_HEADERS);
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
  getGuest: function (params) {
    return handleGetGuest_(params);
  },
  submitRsvp: function (params) {
    return handleSubmitRsvp_(params);
  },
  checkAuth: function (params) {
    requireAdmin_(params);
    return { ok: true };
  },
  listGuests: function (params) {
    requireAdmin_(params);
    return { guests: readGuests_() };
  },
  listRsvps: function (params) {
    requireAdmin_(params);
    return { rsvps: readRsvps_() };
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
 * Verify the caller knows ADMIN_PASSPHRASE. Throws on failure.
 * @param {Object} params
 */
function requireAdmin_(params) {
  var supplied = String(params.auth || '');
  if (supplied !== ADMIN_PASSPHRASE) throw new Error('invalid passphrase');
}

// ---------- Handlers ----------

/**
 * Public read for the guest page. Returns only the fields the guest needs to
 * see and never reveals the full list.
 * @param {Object} params
 * @returns {{found: boolean, guest?: {id: string, name: string, plusOnes: number}}}
 */
function handleGetGuest_(params) {
  var id = requireString_(params, 'id');
  var guest = findGuestById_(id);
  if (!guest) return { found: false };
  return {
    found: true,
    guest: { id: guest.id, name: guest.name, plusOnes: guest.plusOnes },
  };
}

/**
 * @param {Object} params
 * @returns {{ok: true}}
 */
function handleSubmitRsvp_(params) {
  var id = requireString_(params, 'id');
  var response = requireString_(params, 'response');
  if (response !== RESPONSE_ACCEPT && response !== RESPONSE_DECLINE) {
    throw new Error('invalid response: ' + response);
  }
  var guest = findGuestById_(id);
  if (!guest) throw new Error('guest not found');

  var maxPartySize = guest.plusOnes + 1;
  var partySize = 0;
  if (response === RESPONSE_ACCEPT) {
    partySize = requireInt_(params, 'partySize', 1, maxPartySize);
  }
  var comment = params.comment == null ? '' : String(params.comment);

  var sheet = sheetByName_(RSVPS_TAB);
  sheet.appendRow([new Date(), id, response, partySize, comment]);
  return { ok: true };
}

/**
 * @param {Object} params
 * @returns {{ok: true, created: boolean}}
 */
function handleUpsertGuest_(params) {
  var input = params.guest || {};
  var id = requireString_(input, 'id');
  var name = requireString_(input, 'name');
  var plusOnes = Math.max(0, Math.round(Number(input.plusOnes) || 0));
  var invitationSent = Boolean(input.invitationSent);
  var contact = input.contact == null ? '' : String(input.contact);
  var notes = input.notes == null ? '' : String(input.notes);

  var row = [id, name, plusOnes, invitationSent, contact, notes];
  var sheet = sheetByName_(GUESTS_TAB);
  var existing = findGuestById_(id);
  if (existing) {
    sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
    return { ok: true, created: false };
  }
  sheet.appendRow(row);
  return { ok: true, created: true };
}

/**
 * @param {Object} params
 * @returns {{ok: true, deleted: boolean}}
 */
function handleDeleteGuest_(params) {
  var id = requireString_(params, 'id');
  var guest = findGuestById_(id);
  if (!guest) return { ok: true, deleted: false };
  sheetByName_(GUESTS_TAB).deleteRow(guest.rowIndex);
  return { ok: true, deleted: true };
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
 * @param {string} name
 * @param {Array<string>} headers
 */
function ensureSheetWithHeaders_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
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
 * @typedef {{rowIndex: number, id: string, name: string, plusOnes: number,
 *           invitationSent: boolean, contact: string, notes: string}} Guest
 */

/**
 * @typedef {{timestamp: string, guestId: string, response: string,
 *           partySize: number, comment: string}} Rsvp
 */

/**
 * @returns {Array<Guest>}
 */
function readGuests_() {
  return readSheet_(GUESTS_TAB, mapGuestRow_);
}

/**
 * @returns {Array<Rsvp>}
 */
function readRsvps_() {
  return readSheet_(RSVPS_TAB, mapRsvpRow_);
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
    plusOnes: Number(row[2] || 0),
    invitationSent: row[3] === true || row[3] === 'TRUE' || row[3] === 'true',
    contact: String(row[4] || ''),
    notes: String(row[5] || ''),
  };
}

/**
 * @param {Array<*>} row
 * @returns {Rsvp}
 */
function mapRsvpRow_(row) {
  var ts = row[0];
  return {
    timestamp: ts instanceof Date ? ts.toISOString() : String(ts || ''),
    guestId: String(row[1] || ''),
    response: String(row[2] || ''),
    partySize: Number(row[3] || 0),
    comment: String(row[4] || ''),
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
