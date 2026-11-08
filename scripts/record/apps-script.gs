/**
 * Revisely recordings: receives takes from revisely.app/record and keeps them in this Google account's
 * Drive. It runs as the account owner (Deploy > Web app > Execute as: Me; Who has access: Anyone), so
 * volunteers need no account and never see the folder or anyone else's recordings.
 *
 * Setup (scripts/record/README.md): paste this file into a new Apps Script project, run setup() once,
 * then deploy it as a web app and put its URL in docs/record/index.html (ENDPOINT).
 *
 * In this account's Drive:
 *   "Revisely recordings (private)"        one folder per code (P01, P02 …), the takes and a consent
 *                                         and profile file each. No names anywhere in it.
 *   "Revisely recording codes (private)"  a sheet, outside that folder: each code, its personal link,
 *                                         and a Name column only you fill in. Delete a row to close a link.
 */

var FOLDER_NAME = 'Revisely recordings (private)';
var SHEET_NAME = 'Revisely recording codes (private)';
var LINK = 'https://revisely.app/record/#k=';
var CODES = 40; // P01–P40, plus P00 for testing
var MAX_BYTES = 25 * 1024 * 1024;
var TYPES = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

/** Run once from the editor: makes the folder and the codes sheet, and logs their links. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder(FOLDER_NAME).getId());
  }
  if (!props.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create(SHEET_NAME);
    var sheet = ss.getSheets()[0];
    var rows = [['Code', 'Personal link', 'Name (only you see this)', 'Notes']];
    for (var i = 0; i <= CODES; i++) {
      var code = 'P' + (i < 10 ? '0' : '') + i + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
      rows.push([code, LINK + code, i === 0 ? 'Test (not a person)' : '', '']);
    }
    sheet.getRange(1, 1, rows.length, 4).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 4);
    props.setProperty('SHEET_ID', ss.getId());
  }
  Logger.log('Recordings folder: ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
  Logger.log('Codes sheet: ' + SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getUrl());
}

function doGet(e) {
  return handle_(function () {
    var p = (e && e.parameter) || {};
    var pid = check_(p.k);
    if (p.op !== 'status') throw new Error('bad_op');
    return status_(pid);
  });
}

function doPost(e) {
  return handle_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var pid = check_(body.k);
    var folder = folderOf_(pid);
    var now = new Date().toISOString();
    if (body.op === 'consent') {
      if (body.who !== 'adult' && body.who !== 'guardian') throw new Error('bad_consent');
      writeJson_(folder, 'consent.json', { who: body.who, text: String(body.text || ''), at: now, tz: str_(body.tz, 64), ua: str_(body.ua, 300) });
      return { ok: true };
    }
    if (!folder.getFilesByName('consent.json').hasNext()) throw new Error('no_consent');
    if (body.op === 'profile') {
      writeJson_(folder, 'profile.json', { profile: body.profile || {}, at: now, ua: str_(body.ua, 300) });
      return { ok: true };
    }
    if (body.op === 'upload') {
      var item = String(body.item || '');
      var take = Number(body.take);
      var mime = String(body.mime || '').split(';')[0];
      if (!/^[a-z][a-z0-9]{0,7}$/.test(item) || !(take >= 1 && take <= 99) || !TYPES[mime]) throw new Error('bad_take');
      var bytes = Utilities.base64Decode(String(body.data || ''));
      if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('bad_size');
      var name = item + '_take' + take + '.' + TYPES[mime];
      var old = folder.getFilesByName(name); // a resend of the same take replaces it
      while (old.hasNext()) old.next().setTrashed(true);
      var file = folder.createFile(Utilities.newBlob(bytes, mime, name));
      file.setDescription(JSON.stringify({ item: item, take: take, ms: Number(body.ms) || 0, choice: body.choice || null, at: now, ua: str_(body.ua, 300) }));
      return { ok: true, name: name };
    }
    throw new Error('bad_op');
  });
}

function handle_(fn) {
  var out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** The code must be a row of the codes sheet; returns its participant id (P07). */
function check_(code) {
  code = String(code || '');
  if (!/^P\d{2,3}-[a-z0-9]{8,24}$/i.test(code)) throw new Error('bad_code');
  var cache = CacheService.getScriptCache();
  var list = cache.get('codes');
  if (!list) {
    var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheets()[0];
    var values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    list = values.map(function (r) { return String(r[0]).trim(); }).filter(String).join('\n');
    cache.put('codes', list, 300);
  }
  if (list.split('\n').indexOf(code) < 0) throw new Error('bad_code');
  return code.split('-')[0].toUpperCase();
}

function folderOf_(pid) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var it = root.getFoldersByName(pid);
  return it.hasNext() ? it.next() : root.createFolder(pid);
}

function status_(pid) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var it = root.getFoldersByName(pid);
  var out = { ok: true, pid: pid, consent: false, profile: false, done: [], takes: {} };
  if (!it.hasNext()) return out;
  var files = it.next().getFiles();
  while (files.hasNext()) {
    var name = files.next().getName();
    if (name === 'consent.json') out.consent = true;
    else if (name === 'profile.json') out.profile = true;
    var m = /^([a-z][a-z0-9]*)_take(\d+)\./.exec(name);
    if (m) {
      if (out.done.indexOf(m[1]) < 0) out.done.push(m[1]);
      out.takes[m[1]] = Math.max(out.takes[m[1]] || 0, Number(m[2]));
    }
  }
  return out;
}

function writeJson_(folder, name, value) {
  var text = JSON.stringify(value, null, 2);
  var it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, 'application/json');
}

function str_(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}
