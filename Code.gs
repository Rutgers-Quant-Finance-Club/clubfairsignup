/*******************************************************************************
 * Rutgers QFC — Link hub sign-up backend (Google Apps Script)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES
 *   Accepts one POST per sign-up from the static GitHub Pages site and appends
 *   a row to the "Signups" tab of the bound Google Sheet.
 *
 * SETUP
 *   1. Open your Google Sheet > Extensions > Apps Script.
 *   2. Delete any boilerplate, paste this whole file, save.
 *   3. Deploy > New deployment > type "Web app".
 *        - Description:        QFC sign-ups
 *        - Execute as:         Me
 *        - Who has access:     Anyone
 *   4. Copy the Web app URL (ends in /exec) into script.js -> CONFIG.WEB_APP_URL
 *   5. After ANY edit here: Deploy > Manage deployments > edit > Version: New.
 *
 * CORS
 *   The browser sends the body as text/plain, which is a "simple request",
 *   so there is NO preflight OPTIONS call. Apps Script web apps automatically
 *   attach Access-Control-Allow-Origin: * to the response, so fetch() from
 *   your GitHub Pages origin can read the JSON result.
 ******************************************************************************/

var SHEET_TAB = 'Signups';

var HEADERS = [
  'Timestamp', 'Submission ID', 'Email',
  'First Name', 'Last Name', 'Phone', 'Major', 'Graduation Year', 'Goals',
  'Timezone', 'Page', 'Referrer', 'User Agent'
];

/* ------------------------------------------------------------------ POST ---- */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // avoid interleaved appendRow() races
  } catch (lockErr) {
    return jsonOut_({ result: 'error', message: 'Server busy, try again.' });
  }

  try {
    var d = parseBody_(e);
    var sh = getSheet_();

    sh.appendRow([
      d.ts || new Date().toISOString(),
      d.sid || '',
      d.email || '',
      d.firstName || '',
      d.lastName || '',
      d.phone || '',
      d.major || '',
      d.gradYear || '',
      d.goals || '',
      d.tz || '',
      d.page || '',
      d.referrer || '',
      d.ua || ''
    ]);

    return jsonOut_({ result: 'success', row: sh.getLastRow() });
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
