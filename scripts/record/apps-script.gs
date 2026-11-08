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
 *                                         and a Name column only you see. Delete a row to close a link.
 *                                         Its "Group link" tab holds one link anyone can join with: each
 *                                         person who opens it gets a new code (a new row) and types their
 *                                         name, which goes only into this sheet.
 */

var FOLDER_NAME = 'Revisely recordings (private)';
var SHEET_NAME = 'Revisely recording codes (private)';
var LINK = 'https://revisely.app/record/#k=';
var GROUP_LINK = 'https://revisely.app/record/#g=';
var MAX_ROWS = 400; // a group link can't add more people than this
var CODES = 40; // P01–P40, plus P00 for testing
var MAX_BYTES = 25 * 1024 * 1024;
var TYPES = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

/** Run from the editor (again after updating the script): makes what's missing and logs the links. */
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
  if (!props.getProperty('GROUP_KEY')) {
    props.setProperty('GROUP_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  }
  var group = GROUP_LINK + props.getProperty('GROUP_KEY');
  var book = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var tab = book.getSheetByName('Group link') || book.insertSheet('Group link', 1);
  tab.getRange(1, 1, 3, 1).setValues([
    ['One link for everyone (a group chat): each person who opens it gets their own code on the first tab.'],
    [group],
    ['To stop it working, delete GROUP_KEY in the script\'s Project Settings > Script properties.'],
  ]);
  tab.autoResizeColumns(1, 1);
  Logger.log('Recordings folder: ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
  Logger.log('Codes sheet: ' + book.getUrl());
  Logger.log('Group link (share this one): ' + group);
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
    if (body.op === 'join') return join_(body);
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

/** Someone opened the group link: a new row with a new code, and their name in it. */
function join_(body) {
  var key = PropertiesService.getScriptProperties().getProperty('GROUP_KEY');
  if (!key || String(body.g || '') !== key) throw new Error('bad_group');
  var name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 2) throw new Error('bad_name');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = codesSheet_();
    var last = sheet.getLastRow();
    if (last > MAX_ROWS) throw new Error('full');
    var codes = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues() : [];
    var n = 0;
    codes.forEach(function (r) {
      var m = /^P(\d+)-/.exec(String(r[0]));
      if (m) n = Math.max(n, Number(m[1]));
    });
    n += 1;
    var code = 'P' + (n < 10 ? '0' : '') + n + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    sheet.appendRow([code, LINK + code, name, 'Joined ' + new Date().toISOString().slice(0, 10) + ' with the group link']);
    CacheService.getScriptCache().remove('codes');
    return { ok: true, code: code };
  } finally {
    lock.releaseLock();
  }
}

function codesSheet_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheets()[0];
}

/** The code must be a row of the codes sheet; returns its participant id (P07). */
function check_(code) {
  code = String(code || '');
  if (!/^P\d{2,3}-[a-z0-9]{8,24}$/i.test(code)) throw new Error('bad_code');
  var cache = CacheService.getScriptCache();
  var list = cache.get('codes');
  if (!list) {
    var sheet = codesSheet_();
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
