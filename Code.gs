/*******************************************************************************
 * Rutgers QFC — Link hub sign-up backend (Google Apps Script)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES
 *   Accepts one POST per sign-up from the static GitHub Pages site.
 *   - New NetID      -> appends a new row to the "Signups" tab.
 *   - Existing NetID -> overwrites that person's row in place (no duplicates).
 *                       The original Timestamp + Submission ID are kept;
 *                       every other field is replaced with the newest submission.
 *
 * SETUP
 *   1. Open your Google Sheet > Extensions > Apps Script.
 *   2. Delete any boilerplate, paste this whole file, save.
 *   3. Deploy > New deployment > type "Web app".
 *        - Execute as:     Me
 *        - Who has access: Anyone
 *   4. Copy the Web app URL (ends in /exec) into script.js -> CONFIG.WEB_APP_URL
 *   5. After ANY edit here: Deploy > Manage deployments > edit > Version: New.
 *
 * CORS
 *   The browser sends the body as text/plain (a "simple request"), so there is
 *   no preflight. Apps Script web apps attach Access-Control-Allow-Origin: *
 *   to the response, so fetch() from GitHub Pages can read the JSON result.
 ******************************************************************************/

var SHEET_TAB = 'Signups';

var HEADERS = [
  'Timestamp', 'Submission ID', 'NetID', 'Email',
  'First Name', 'Last Name', 'Major', 'Graduation Year',
  'Goals', 'Best Meeting Time',
  'Timezone', 'Page', 'Referrer', 'User Agent'
];

/* ------------------------------------------------------------------ POST ---- */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // serialize find + write so there is no race
  } catch (lockErr) {
    return jsonOut_({ result: 'error', message: 'Server busy, try again.' });
  }

  try {
    var d = parseBody_(e);
    var sh = getSheet_();
    var netid = normId_(d.netid);

    var row = [
      d.ts || new Date().toISOString(),
      d.sid || '',
      netid,
      d.email || '',
      d.firstName || '',
      d.lastName || '',
      d.major || '',
      d.gradYear || '',
      d.goals || '',
      d.meetTime || '',
      d.tz || '',
      d.page || '',
      d.referrer || '',
      d.ua || ''
    ];

    var existingRow = netid ? findRowByNetid_(sh, netid) : 0;

    if (existingRow > 0) {
      var prev = sh.getRange(existingRow, 1, 1, HEADERS.length).getValues()[0];
      row[0] = prev[0] || row[0]; // keep original Timestamp
      row[1] = prev[1] || row[1]; // keep original Submission ID
      sh.getRange(existingRow, 1, 1, HEADERS.length).setValues([row]);
      return jsonOut_({ result: 'success', action: 'updated', row: existingRow });
    }

    sh.appendRow(row);
    return jsonOut_({ result: 'success', action: 'created', row: sh.getLastRow() });
  } catch (err) {
    return jsonOut_({ result: 'error', message: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/* --------------------------------------------------------- GET / OPTIONS ---- */

function doGet(e) {
  return jsonOut_({ result: 'success', status: 'QFC sign-up endpoint is live' });
}

function doOptions(e) {
  return jsonOut_({ result: 'success' });
}

/* ------------------------------------------------------------- internals ---- */

function normId_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (ignore) {
      // fall through to form params
    }
  }
  return (e && e.parameter) ? e.parameter : {};
}

/** 1-based column of the "NetID" header (falls back to 3 if not found). */
function netidCol_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === 'netid') return i + 1;
  }
  return 3;
}

/** 1-based row whose NetID matches, or 0 if none. First match wins. */
function findRowByNetid_(sh, netid) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var col = netidCol_(sh);
  var values = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normId_(values[i][0]) === netid) return i + 2;
  }
  return 0;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) {
    sh = ss.insertSheet(SHEET_TAB);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
