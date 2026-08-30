/*******************************************************************************
 * Rutgers QFC — Link hub intake backend (Google Apps Script)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES
 *   Accepts POSTs from the static GitHub Pages site and appends rows to two
 *   tabs in the bound Google Sheet:
 *     - "Emails"  : one row per gate verification  (type: "email")
 *     - "Intake"  : one row per optional form      (type: "intake")
 *   Both rows carry the same "Submission ID" (sid) so you can join them.
 *
 * SETUP
 *   1. Open your Google Sheet > Extensions > Apps Script.
 *   2. Delete any boilerplate, paste this whole file, save.
 *   3. Deploy > New deployment > type "Web app".
 *        - Description:        QFC intake
 *        - Execute as:         Me
 *        - Who has access:     Anyone
 *   4. Copy the Web app URL (ends in /exec) into script.js -> CONFIG.WEB_APP_URL
 *   5. Re-deploy (Deploy > Manage deployments > edit > Version: New) after any edit.
 *
 * CORS
 *   The browser sends the body as text/plain, which is a "simple request",
 *   so there is NO preflight OPTIONS call. Apps Script web apps automatically
 *   attach Access-Control-Allow-Origin: * to the response, so fetch() from
 *   your GitHub Pages origin can read the JSON result. doOptions() is included
 *   as a belt-and-suspenders no-op in case a client still sends a preflight.
 ******************************************************************************/

/** Tab names + column order. Change labels here if you like. */
var EMAIL_TAB  = 'Emails';
var INTAKE_TAB = 'Intake';

var EMAIL_HEADERS = [
  'Timestamp', 'Submission ID', 'Email', 'Timezone', 'Page', 'Referrer', 'User Agent'
];

var INTAKE_HEADERS = [
  'Timestamp', 'Submission ID', 'Email',
  'First Name', 'Last Name', 'Major', 'Graduation Year', 'Goals',
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
    var data = parseBody_(e);
    var type = String(data.type || 'email').toLowerCase();

    var out;
    if (type === 'intake' || type === 'intake_form' || type === 'form') {
      out = appendIntake_(data);
    } else {
      out = appendEmail_(data);
    }

    return jsonOut_({ result: 'success', type: type, tab: out.tab, row: out.row });
  } catch (err) {
    return jsonOut_({ result: 'error', message: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/* --------------------------------------------------------- GET / OPTIONS ---- */

function doGet(e) {
  return jsonOut_({ result: 'success', status: 'QFC intake endpoint is live' });
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

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function appendEmail_(d) {
  var sh = getSheet_(EMAIL_TAB, EMAIL_HEADERS);
  sh.appendRow([
    d.ts || new Date().toISOString(),
    d.sid || '',
    d.email || '',
    d.tz || '',
    d.page || '',
    d.referrer || '',
    d.ua || ''
  ]);
  return { tab: EMAIL_TAB, row: sh.getLastRow() };
}

function appendIntake_(d) {
  var sh = getSheet_(INTAKE_TAB, INTAKE_HEADERS);
  sh.appendRow([
    d.ts || new Date().toISOString(),
    d.sid || '',
    d.email || '',
    d.firstName || '',
    d.lastName || '',
    d.major || '',
    d.gradYear || '',
    d.goals || '',
    d.tz || '',
    d.page || '',
    d.referrer || '',
    d.ua || ''
  ]);
  return { tab: INTAKE_TAB, row: sh.getLastRow() };
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
