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

/**
 * Legacy tab. RSVPs used to be appended here as an append-only history; they
 * now live as a snapshot inside `guests`. Kept as a constant only so the
 * migration can drain it and setup can delete it.
 * @const {string}
 */
var LEGACY_RSVPS_TAB = 'rsvps';

/** @const {Array<string>} */
var GUESTS_HEADERS = [
  'id',
  'name',
  'adultSlots',
  'kidSlots',
  'invitationSent',
  'response',
  'adultsConfirmed',
  'kidsConfirmed',
  'comment',
  'rsvpTimestamp',
  'contact',
  'notes',
  'side',
  'table',
];

/** @const {Array<string>} */
var SONG_RECS_HEADERS = ['timestamp', 'guestId', 'trackId', 'trackName', 'artists', 'spotifyUrl'];

/**
 * Key used to store the admin passphrase in PropertiesService. Set the value
 * via Project Settings → Script Properties. Storing it outside of source
 * means pasting a new version of this file does not overwrite the passphrase.
 * @const {string}
 */
var ADMIN_PASSPHRASE_KEY = 'ADMIN_PASSPHRASE';

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
var CODE_VERSION = '2026-08-11.1';

// ---------- Public bootstrap ----------

/**
 * Idempotent setup. Creates the `guests` tab and writes headers
 * if they are missing. Safe to call repeatedly.
 */
function setup() {
  migrateGuestsFromPlusOnes_();
  migrateGroupColumnToTable_();
  ensureSheetWithHeaders_(GUESTS_TAB, GUESTS_HEADERS);
  migrateRsvpHistoryIntoGuests_();
  dropLegacyRsvpsSheet_();
  ensureTextColumns_();
  ensureSheetWithHeaders_(SONG_RECS_TAB, SONG_RECS_HEADERS);
}

/**
 * Guests used to be tagged with a free-text group name; they are now seated at
 * a numbered table, in the same column. Renaming the header alone would leave
 * group names like "Amigos 2inn" sitting in a column that now means a table
 * number, so the old values are cleared. Idempotent: once the header reads
 * `table`, this is a no-op.
 */
function migrateGroupColumnToTable_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GUESTS_TAB);
  if (!sheet) return;
  var column = GUESTS_HEADERS.length; // `table` is the last column
  if (sheet.getLastColumn() < column) return;
  if (sheet.getRange(1, column).getValue() !== 'group') return;
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) sheet.getRange(2, column, lastRow - 1, 1).clearContent();
  sheet.getRange(1, column).setValue('table');
}

/**
 * Deletes the legacy `rsvps` tab. Runs right after
 * migrateRsvpHistoryIntoGuests_ so anything still worth keeping has already
 * been folded into `guests`. The app writes RSVPs only into `guests` now, so
 * the tab can only reappear if an older deployment is still being served.
 */
function dropLegacyRsvpsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LEGACY_RSVPS_TAB);
  if (sheet) ss.deleteSheet(sheet);
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
var TEXT_COLUMNS_ = [2, 9, 11, 12, 14];

function ensureTextColumns_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GUESTS_TAB);
  if (!sheet) return;
  if (sheet.getRange(2, TEXT_COLUMNS_[TEXT_COLUMNS_.length - 1]).getNumberFormat() === '@') return;
  var rowCount = sheet.getMaxRows() - 1;
  if (rowCount < 1) return;
  for (var i = 0; i < TEXT_COLUMNS_.length; i++) {
    sheet.getRange(2, TEXT_COLUMNS_[i], rowCount, 1).setNumberFormat('@');
  }
}

/**
 * Migration from the old guest schema:
 *   [id, name, plusOnes, invitationSent, contact, notes]
 * to the new one:
 *   [id, name, adultSlots, kidSlots, invitationSent, response,
 *    adultsConfirmed, kidsConfirmed, comment, rsvpTimestamp,
 *    contact, notes, side]
 * Converts plusOnes (extras beyond the named invitee) into adultSlots (total
 * adults, including the invitee) and seeds kidSlots = 0. Idempotent: if the
 * sheet is missing, empty, or already on the new schema, this is a no-op.
 */
function migrateGuestsFromPlusOnes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GUESTS_TAB);
  if (!sheet || sheet.getLastColumn() < 3) return;
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headerRow[2] !== 'plusOnes') return;
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];
  var migrated = data.map(function (r) {
    return [
      r[0],
      r[1],
      (Number(r[2]) || 0) + 1,
      0,
      r[3],
      '',
      0,
      0,
      '',
      '',
      r[4],
      r[5],
      '',
      '',
    ];
  });
  sheet.clear();
  sheet.getRange(1, 1, 1, GUESTS_HEADERS.length).setValues([GUESTS_HEADERS]);
  if (migrated.length > 0) {
    sheet.getRange(2, 1, migrated.length, GUESTS_HEADERS.length).setValues(migrated);
  }
  sheet.setFrozenRows(1);
}

/**
 * One-time migration that takes the latest RSVP per guest from the historical
 * `rsvps` sheet and stores it as the current RSVP snapshot inside `guests`.
 * Idempotent: if guests already have response data, this is a no-op.
 */
function migrateRsvpHistoryIntoGuests_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var guestsSheet = ss.getSheetByName(GUESTS_TAB);
  var rsvpsSheet = ss.getSheetByName(LEGACY_RSVPS_TAB);
  if (!guestsSheet || !rsvpsSheet || guestsSheet.getLastRow() < 2 || rsvpsSheet.getLastRow() < 2) return;

  var guestValues = guestsSheet.getRange(2, 1, guestsSheet.getLastRow() - 1, GUESTS_HEADERS.length).getValues();
  var responseCol = 5;
  var hasAnyResponse = false;
  for (var i = 0; i < guestValues.length; i++) {
    if (String(guestValues[i][responseCol] || '').trim()) {
      hasAnyResponse = true;
      break;
    }
  }
  if (hasAnyResponse) return;

  var rsvpRows = rsvpsSheet.getRange(2, 1, rsvpsSheet.getLastRow() - 1, rsvpsSheet.getLastColumn()).getValues();
  var latestByGuest = {};
  for (var r = 0; r < rsvpRows.length; r++) {
    var row = rsvpRows[r];
    var guestId = String(row[1] || '');
    if (!guestId) continue;
    var ts = row[0] instanceof Date ? row[0].getTime() : new Date(String(row[0] || '')).getTime();
    var prev = latestByGuest[guestId];
    if (!prev || ts > prev.ts) {
      latestByGuest[guestId] = {
        ts: ts,
        rawTs: row[0],
        response: String(row[2] || ''),
        adultsConfirmed: Number(row[3] || 0),
        kidsConfirmed: Number(row[4] || 0),
        comment: String(row[5] || ''),
      };
    }
  }

  for (var g = 0; g < guestValues.length; g++) {
    var guestId = String(guestValues[g][0] || '');
    var latest = latestByGuest[guestId];
    if (!latest) continue;
    guestValues[g][5] = latest.response;
    guestValues[g][6] = latest.adultsConfirmed;
    guestValues[g][7] = latest.kidsConfirmed;
    guestValues[g][8] = latest.comment;
    guestValues[g][9] = latest.rawTs;
  }
  guestsSheet.getRange(2, 1, guestValues.length, GUESTS_HEADERS.length).setValues(guestValues);
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
  getGuest: function (params) {
    return handleGetGuest_(params);
  },
  submitRsvp: function (params) {
    return handleSubmitRsvp_(params);
  },
  searchSongs: function (params) {
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
    guest: {
      id: guest.id,
      name: guest.name,
      adultSlots: guest.adultSlots,
      kidSlots: guest.kidSlots,
    },
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

  var adultsConfirmed = 0;
  var kidsConfirmed = 0;
  if (response === RESPONSE_ACCEPT) {
    adultsConfirmed = requireInt_(params, 'adultsConfirmed', 1, guest.adultSlots);
    kidsConfirmed = requireInt_(params, 'kidsConfirmed', 0, guest.kidSlots);
  }
  var comment = params.comment == null ? '' : String(params.comment);

  return withWriteLock_(function () {
    var sheet = sheetByName_(GUESTS_TAB);
    var row = [
      guest.id,
      guest.name,
      guest.adultSlots,
      guest.kidSlots,
      guest.invitationSent,
      response,
      adultsConfirmed,
      kidsConfirmed,
      comment,
      new Date(),
      guest.contact,
      guest.notes,
      guest.side,
      guest.table,
    ];
    sheet.getRange(guest.rowIndex, 1, 1, row.length).setValues([row]);
    return { ok: true };
  });
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
 * Append a song recommendation row for the given guest.
 * @param {Object} params
 * @returns {{ok: true}}
 */
function handleSubmitSongRecommendation_(params) {
  var guestId = requireString_(params, 'id');
  var trackId = requireString_(params, 'trackId');
  var trackName = requireString_(params, 'trackName');
  var artists = String(params.artists || '');
  var spotifyUrl = String(params.spotifyUrl || '');

  var guest = findGuestById_(guestId);
  if (!guest) throw new Error('guest not found');

  return withWriteLock_(function () {
    sheetByName_(SONG_RECS_TAB).appendRow([
      new Date(), guestId, trackId, trackName, artists, spotifyUrl,
    ]);
    return { ok: true };
  });
}

/**
 * Upsert by id. If id is empty, generate a random UUID so guest links can't
 * be guessed from names. Serialized via the script lock so concurrent writes
 * can't collide on row indexes.
 * @param {Object} params
 * @returns {{ok: true, created: boolean, id: string}}
 */
function handleUpsertGuest_(params) {
  var input = params.guest || {};
  var name = requireString_(input, 'name');
  var providedId = String(input.id || '').trim();
  var adultSlots = Math.max(1, Math.round(Number(input.adultSlots) || 1));
  var kidSlots = Math.max(0, Math.round(Number(input.kidSlots) || 0));
  var invitationSent = Boolean(input.invitationSent);
  // La lista de lados vive en src/config.ts. Este endpoint pide auth de admin,
  // así que alcanza con normalizar y acotar el largo en vez de whitelistear.
  var side = String(input.side || '').trim().toLowerCase().slice(0, 32);
  var contact = input.contact == null ? '' : String(input.contact);
  var notes = input.notes == null ? '' : String(input.notes);
  // Free text on purpose: the table list lives in the frontend, and a value
  // typed straight into the sheet should survive an edit from the admin.
  var table = input.table == null ? '' : String(input.table).trim();

  return withWriteLock_(function () {
    var sheet = sheetByName_(GUESTS_TAB);
    var list = readGuests_();
    var id = providedId || Utilities.getUuid();
    var existing = findInList_(list, id);
    var row = [
      id,
      name,
      adultSlots,
      kidSlots,
      invitationSent,
      existing ? existing.response : '',
      existing ? existing.adultsConfirmed : 0,
      existing ? existing.kidsConfirmed : 0,
      existing ? existing.comment : '',
      existing ? existing.rsvpTimestamp : '',
      contact,
      notes,
      side,
      table,
    ];
    if (existing) {
      sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
      return { ok: true, created: false, id: id };
    }
    sheet.appendRow(row);
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
 * @typedef {{rowIndex: number, id: string, name: string, adultSlots: number,
 *           kidSlots: number, invitationSent: boolean, response: string,
 *           adultsConfirmed: number, kidsConfirmed: number, comment: string,
 *           rsvpTimestamp: string, contact: string, notes: string,
 *           side: string, table: string}} Guest
 */

/**
 * @returns {Array<Guest>}
 */
function readGuests_() {
  return readSheet_(GUESTS_TAB, mapGuestRow_);
}

/**
 * @typedef {{timestamp: string, guestId: string, trackId: string,
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
function mapSongRecRow_(row) {
  var ts = row[0];
  return {
    timestamp: ts instanceof Date ? ts.toISOString() : String(ts || ''),
    guestId: String(row[1] || ''),
    trackId: String(row[2] || ''),
    trackName: String(row[3] || ''),
    artists: String(row[4] || ''),
    spotifyUrl: String(row[5] || ''),
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
    adultSlots: Math.max(1, Number(row[2] || 1)),
    kidSlots: Math.max(0, Number(row[3] || 0)),
    invitationSent: row[4] === true || row[4] === 'TRUE' || row[4] === 'true',
    response: String(row[5] || ''),
    adultsConfirmed: Math.max(0, Number(row[6] || 0)),
    kidsConfirmed: Math.max(0, Number(row[7] || 0)),
    comment: String(row[8] || ''),
    rsvpTimestamp: row[9] instanceof Date ? row[9].toISOString() : String(row[9] || ''),
    contact: String(row[10] || ''),
    notes: String(row[11] || ''),
    side: String(row[12] || ''),
    table: String(row[13] || ''),
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
