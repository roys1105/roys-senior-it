/* =========================================================
   脳いきいき手帳 v0.3 ─ 記録のしくみ（データ層）
   ・利用者ごとの記録（施設で1台を複数人が使えるように）
   ・追記型のイベントログ（あとからどんな集計でも作れる）
   ・IndexedDB への二重保存＋自動バックアップ（消えにくくする）
   ・CSV / JSON の書き出し

   ※このファイルは index.html の本体スクリプトの直後、
     ほかの js/*.js より先に読み込むこと。
   ========================================================= */
"use strict";

/* =========================================================
   1. 利用者
   ========================================================= */
function getUsers() { return storage.get("users") || []; }
function saveUsers(list) { storage.set("users", list); }

function getCurrentUserId() { return storage.get("currentUserId"); }
function getCurrentUser() {
  const id = getCurrentUserId();
  return getUsers().find(u => u.id === id) || null;
}
function setCurrentUser(id) {
  storage.set("currentUserId", id);
  const users = getUsers();
  const u = users.find(x => x.id === id);
  if (u) { u.lastActive = todayKey(); saveUsers(users); }
}
function newUserId() {
  return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function addUser(name) {
  const users = getUsers();
  const u = { id: newUserId(), name: String(name).trim(), createdAt: todayKey(), lastActive: null };
  users.push(u);
  saveUsers(users);
  return u;
}
function renameUser(id, name) {
  const users = getUsers();
  const u = users.find(x => x.id === id);
  if (u) { u.name = String(name).trim(); saveUsers(users); }
}
function removeUser(id) {
  saveUsers(getUsers().filter(u => u.id !== id));
  storage.remove("records:" + id);
  storage.remove("events:" + id);
  if (getCurrentUserId() === id) storage.remove("currentUserId");
}

/* 施設モード（1台を複数人で使う） */
function isFacilityMode() { return storage.get("facilityMode") === true; }
function setFacilityMode(on) { storage.set("facilityMode", !!on); }

/* =========================================================
   2. 記録は利用者ごとに持つ
      （index.html 側の getRecords / saveRecords / getProfile を差し替える）
   ========================================================= */
function recordsKey(uid) { return "records:" + (uid || getCurrentUserId()); }
function eventsKey(uid) { return "events:" + (uid || getCurrentUserId()); }

getRecords = function () {
  const uid = getCurrentUserId();
  if (!uid) return storage.get("records") || {};        // 移行前・未設定のとき
  return storage.get(recordsKey(uid)) || {};
};
saveRecords = function (records) {
  const uid = getCurrentUserId();
  if (!uid) { storage.set("records", records); return; }
  storage.set(recordsKey(uid), records);
};

/* プロフィールは「いま使っている利用者」を返す */
getProfile = function () {
  const u = getCurrentUser();
  if (u) return { nickname: u.name, memberId: u.id };
  return storage.get("profile");
};

/* 他の利用者の記録を読む（職員向け一覧で使う） */
function getRecordsOf(uid) { return storage.get(recordsKey(uid)) || {}; }
function getEventsOf(uid) { return storage.get(eventsKey(uid)) || []; }

/* 指定した利用者の連続日数 */
function streakOf(uid) {
  const rec = getRecordsOf(uid);
  let n = 0;
  const d = new Date();
  if (!rec[todayKey(d)] || !rec[todayKey(d)].completed) d.setDate(d.getDate() - 1);
  while (rec[todayKey(d)] && rec[todayKey(d)].completed) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* =========================================================
   3. 追記型のイベントログ
      １件＝｛いつ・だれが・何を・どうだったか・何秒かかったか｝
   ========================================================= */
const EVENTS_MAX = 5000;   // これを超えたら古いものから捨てる

function logEvent(kind, label, detail) {
  const uid = getCurrentUserId();
  if (!uid) return;
  const list = storage.get(eventsKey(uid)) || [];
  const now = new Date();
  list.push(Object.assign({
    ts: now.toISOString(),
    date: todayKey(now),
    hour: now.getHours(),
    kind: kind,
    label: label
  }, detail || {}));
  if (list.length > EVENTS_MAX) list.splice(0, list.length - EVENTS_MAX);
  storage.set(eventsKey(uid), list);
  scheduleBackup();
}

function getEvents() { return getCurrentUserId() ? (storage.get(eventsKey()) || []) : []; }

/* 起動したことも記録する（生活のリズムが見える） */
function logOpen() {
  const uid = getCurrentUserId();
  if (!uid) return;
  const last = storage.get("lastOpen:" + uid);
  const now = new Date();
  const stamp = todayKey(now) + " " + String(now.getHours()).padStart(2, "0");
  if (last === stamp) return;             // 同じ時間帯に何度も記録しない
  storage.set("lastOpen:" + uid, stamp);
  logEvent("open", "アプリを開いた", {});
}

/* 種目別の集計（直近n日） */
function summaryByKind(days, uid) {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromKey = todayKey(from);
  const out = {};
  (uid ? getEventsOf(uid) : getEvents()).forEach(e => {
    if (e.date < fromKey) return;
    if (e.kind === "open") return;
    const s = out[e.label] || (out[e.label] = { count: 0, score: 0, total: 0, seconds: 0 });
    s.count++;
    if (typeof e.score === "number") s.score += e.score;
    if (typeof e.total === "number") s.total += e.total;
    if (typeof e.seconds === "number") s.seconds += e.seconds;
  });
  return out;
}

/* =========================================================
   4. 消えにくくする（IndexedDB へ二重保存＋日次バックアップ）
   ========================================================= */
const IDB = (() => {
  const NAME = "nouikiiki", STORE = "backups";
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("no idb"));
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  function put(key, data) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, data, savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    })).catch(() => false);
  }
  function getAll() {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })).catch(() => []);
  }
  function del(key) {
    return open().then(db => new Promise(resolve => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
    })).catch(() => false);
  }
  return { put, getAll, del };
})();

/* いまの記録をまるごと1つのオブジェクトにまとめる */
function exportAll() {
  const users = getUsers();
  return {
    app: "脳いきいき手帳",
    version: "0.3",
    exportedAt: new Date().toISOString(),
    users: users,
    data: users.reduce((acc, u) => {
      acc[u.id] = { records: getRecordsOf(u.id), events: getEventsOf(u.id) };
      return acc;
    }, {})
  };
}

/* その日のバックアップを「最新の状態」に保ち続ける（直近30日ぶん）
   ・1日1回きりにすると、朝いちばんの空っぽの状態で固定されてしまうので、
     同じ日のぶんは何度でも上書きする（ただし2分に1回まで）
   ・記録が何もないときは保存しない（空で上書きして消してしまわないため） */
const BACKUP_INTERVAL_MS = 2 * 60 * 1000;
let backupTimer = null;

function scheduleBackup() {
  if (backupTimer) return;
  backupTimer = setTimeout(() => { backupTimer = null; runBackup(); }, 3000);
}

function runBackup(force) {
  const snap = exportAll();
  if (!snap.users.length) return;                       // 中身が無いなら何もしない
  const last = Number(storage.get("lastBackupAt") || 0);
  if (!force && Date.now() - last < BACKUP_INTERVAL_MS) return;

  const key = todayKey();
  storage.set("lastBackupAt", Date.now());
  storage.set("lastBackup", key);
  IDB.put("snapshot:" + key, snap).then(() => {
    IDB.getAll().then(all => {
      const snaps = all.filter(r => String(r.key).startsWith("snapshot:")).map(r => r.key).sort();
      while (snaps.length > 30) IDB.del(snaps.shift());
    });
  });
}

/* ブラウザに「このデータは消さないで」とお願いする */
function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(already => {
        if (!already) navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }
  } catch (e) {}
}

/* いちばん新しいバックアップの中身を調べる（復元する前に見せる用） */
function latestBackupInfo() {
  return IDB.getAll().then(all => {
    const snaps = all.filter(r => String(r.key).startsWith("snapshot:"))
                     .sort((a, b) => a.key < b.key ? 1 : -1);
    if (!snaps.length) return null;
    const snap = snaps[0].data || {};
    const users = snap.users || [];
    let events = 0;
    Object.keys(snap.data || {}).forEach(uid => {
      events += (snap.data[uid].events || []).length;
    });
    return {
      date: String(snaps[0].key).replace("snapshot:", ""),
      savedAt: snaps[0].savedAt,
      userCount: users.length,
      userNames: users.map(u => u.name),
      eventCount: events,
      snapshot: snap
    };
  });
}

/* IndexedDB から復元（localStorage が空になったときの備え）
   ※中身が空のバックアップでは復元しない（今の記録を消してしまわないため） */
function restoreFromBackup() {
  return latestBackupInfo().then(info => {
    if (!info || !info.userCount) return null;
    const snap = info.snapshot;
    saveUsers(snap.users);
    Object.keys(snap.data || {}).forEach(uid => {
      storage.set("records:" + uid, snap.data[uid].records || {});
      storage.set("events:" + uid, snap.data[uid].events || []);
    });
    return info;
  });
}

/* =========================================================
   5. 書き出し（CSV / JSON）
   ========================================================= */
function downloadFile(filename, text, mime) {
  try {
    const blob = new Blob(["﻿" + text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}

function csvEscape(v) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* 全利用者の活動を1枚のCSVに */
function exportEventsCsv() {
  const rows = [["利用者", "日付", "時刻", "種類", "内容", "正解数", "問題数", "レベル", "手数", "秒数"]];
  getUsers().forEach(u => {
    getEventsOf(u.id).forEach(e => {
      const t = new Date(e.ts);
      rows.push([
        u.name, e.date,
        isNaN(t) ? "" : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
        e.kind, e.label,
        e.score, e.total, e.level, e.moves, e.seconds
      ]);
    });
  });
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
  return downloadFile(`脳いきいき手帳_活動記録_${todayKey()}.csv`, csv, "text/csv");
}

/* 月ごとの実施日数を1枚のCSVに（施設の実績報告用） */
function exportMonthlyCsv(year, month) {
  const y = year, m = month;                       // m は 0始まり
  const days = new Date(y, m + 1, 0).getDate();
  const header = ["利用者"];
  for (let d = 1; d <= days; d++) header.push(String(d));
  header.push("合計");
  const rows = [header];
  getUsers().forEach(u => {
    const rec = getRecordsOf(u.id);
    const row = [u.name];
    let sum = 0;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const done = rec[key] && rec[key].completed;
      row.push(done ? "○" : "");
      if (done) sum++;
    }
    row.push(sum);
    rows.push(row);
  });
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
  return downloadFile(`脳いきいき手帳_${y}年${m + 1}月_実施状況.csv`, csv, "text/csv");
}

function exportJson() {
  return downloadFile(`脳いきいき手帳_バックアップ_${todayKey()}.json`,
    JSON.stringify(exportAll(), null, 2), "application/json");
}

/* =========================================================
   6. 移行（v0.2 までの1人ぶんの記録を、利用者1号として引き継ぐ）
   ========================================================= */
(function migrate() {
  if (storage.get("usersMigrated") === true) return;

  const legacyProfile = storage.get("profile");
  const legacyRecords = storage.get("records");

  if (legacyProfile && legacyProfile.memberId) {
    const users = getUsers();
    if (!users.some(u => u.id === legacyProfile.memberId)) {
      users.push({
        id: legacyProfile.memberId,
        name: legacyProfile.nickname || "わたし",
        createdAt: todayKey(),
        lastActive: todayKey()
      });
      saveUsers(users);
    }
    if (!getCurrentUserId()) storage.set("currentUserId", legacyProfile.memberId);
    if (legacyRecords && !storage.get("records:" + legacyProfile.memberId)) {
      storage.set("records:" + legacyProfile.memberId, legacyRecords);
    }
  }
  storage.set("usersMigrated", true);
})();

/* =========================================================
   7. 起動時の処理
   ========================================================= */
requestPersistentStorage();
logOpen();
scheduleBackup();
