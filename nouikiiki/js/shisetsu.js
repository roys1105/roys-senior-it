/* =========================================================
   脳いきいき手帳 v0.3 ─ 施設モード
   ・利用者を選んでから使う（1台を複数人で共用）
   ・職員メニュー：今日の実施状況一覧／CSV書き出し／利用者の管理
   ※このファイルは最後に読み込むこと
   ========================================================= */
"use strict";

/* ---------- 追加CSS ---------- */
(function injectCss() {
  const css = `
  .user-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:18px;}
  .user-tile{min-height:110px;border:none;border-radius:18px;background:var(--white);
    box-shadow:0 2px 8px rgba(43,58,85,.10);cursor:pointer;font-family:inherit;color:var(--text);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;}
  .user-tile:active{transform:translateY(2px);}
  .user-tile .uface{width:52px;height:52px;border-radius:50%;background:var(--main);color:#fff;
    display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;
    font-family:"Zen Maru Gothic",sans-serif;}
  .user-tile .uname{font-weight:700;font-size:1.05rem;font-family:"Zen Maru Gothic",sans-serif;
    line-height:1.2;text-align:center;word-break:break-all;}
  .user-tile .uinfo{font-size:.72rem;color:#6B7691;}
  .user-tile.add{border:2px dashed var(--main);background:transparent;box-shadow:none;color:var(--main);}

  .staff-row{display:flex;align-items:center;gap:10px;background:var(--white);border-radius:14px;
    padding:12px;margin-bottom:8px;box-shadow:0 2px 6px rgba(43,58,85,.08);}
  .staff-row .sface{width:38px;height:38px;border-radius:50%;background:var(--main);color:#fff;
    display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;}
  .staff-row .sname{font-weight:700;flex:1;font-size:1rem;}
  .staff-row .sstat{font-size:.78rem;color:#6B7691;text-align:right;line-height:1.4;}
  .staff-row.done{background:var(--done);}
  .badge-ok{display:inline-block;background:var(--main);color:#fff;border-radius:999px;
    padding:1px 10px;font-size:.75rem;font-weight:700;}
  .badge-no{display:inline-block;background:#EDE7D6;color:#6B7691;border-radius:999px;
    padding:1px 10px;font-size:.75rem;font-weight:700;}
  .staff-note{font-size:.8rem;color:#6B7691;}
  `;
  const el2 = document.createElement("style");
  el2.textContent = css;
  document.head.appendChild(el2);
})();

function initial(name) { return (String(name || "？").trim()[0] || "？"); }

/* =========================================================
   1. 利用者を選ぶ画面
   ========================================================= */
addScreen("user-select", `
  <h2 class="page-title">👤 きょうは どなたですか？</h2>
  <div class="card" style="padding:12px 16px;">
    <p style="font-size:.95rem;">お名前をタップしてください。<br>
    <span class="note">選んだあとの記録は、その方のものとして自動でたまっていきます。</span></p>
  </div>
  <div class="user-grid" id="user-grid"></div>
  <button class="btn ghost small" id="user-staff-btn">🔑 職員メニュー</button>
`);

function renderUserSelect() {
  const grid = el("user-grid");
  grid.innerHTML = "";
  getUsers().forEach(u => {
    const b = document.createElement("button");
    b.className = "user-tile";
    const st = streakOf(u.id);
    const doneToday = !!(getRecordsOf(u.id)[todayKey()] || {}).completed;
    b.innerHTML = `<span class="uface">${escapeHtml(initial(u.name))}</span>
      <span class="uname">${escapeHtml(u.name)}</span>
      <span class="uinfo">${doneToday ? "きょう済み" : "連続 " + st + " 日"}</span>`;
    b.addEventListener("click", () => {
      setCurrentUser(u.id);
      logOpen();
      document.getElementById("tabbar").classList.add("visible");
      showScreen("home");
    });
    grid.appendChild(b);
  });

  const add = document.createElement("button");
  add.className = "user-tile add";
  add.innerHTML = `<span style="font-size:2rem;">＋</span><span class="uname">新しい方を<br>登録する</span>`;
  add.addEventListener("click", promptAddUser);
  grid.appendChild(add);
}
onScreen("user-select", renderUserSelect);
on("user-staff-btn", () => showScreen("staff"));

function promptAddUser() {
  const name = prompt("お名前（ニックネーム）を入れてください");
  if (!name || !name.trim()) return;
  const u = addUser(name.trim());
  setCurrentUser(u.id);
  document.getElementById("tabbar").classList.add("visible");
  showScreen("home");
}

/* =========================================================
   2. 職員メニュー
   ========================================================= */
addScreen("staff", `
  <h2 class="page-title">🔑 職員メニュー</h2>

  <div class="card">
    <p style="font-weight:700;color:var(--main);margin-bottom:8px;">きょうの実施状況（<span id="staff-date"></span>）</p>
    <p class="staff-note" style="margin-bottom:10px;" id="staff-summary"></p>
    <div id="staff-list"></div>
  </div>

  <div class="card">
    <p style="font-weight:700;color:var(--main);margin-bottom:10px;">記録の書き出し</p>
    <button class="btn small" id="staff-csv-month">📄 今月の実施状況（CSV）</button>
    <button class="btn small ghost" id="staff-csv-events">📄 活動の明細（CSV）</button>
    <button class="btn small ghost" id="staff-json" style="margin-bottom:0;">💾 まるごとバックアップ（JSON）</button>
    <p class="staff-note" style="margin-top:10px;">CSVはExcelでそのまま開けます。月末の実績まとめにお使いください。</p>
  </div>

  <div class="card">
    <p style="font-weight:700;color:var(--main);margin-bottom:10px;">利用者の管理</p>
    <div id="staff-users"></div>
    <button class="btn small coral" id="staff-add-user" style="margin-bottom:0;">＋ 利用者を追加</button>
  </div>

  <div class="card">
    <p style="font-weight:700;color:var(--main);margin-bottom:8px;">データの状態</p>
    <p class="staff-note" id="staff-storage"></p>
    <button class="btn small ghost" id="staff-backup-now" style="margin-top:10px;">💾 いますぐバックアップする</button>
    <button class="btn small ghost" id="staff-restore" style="margin-bottom:0;">🔄 バックアップから復元する</button>
  </div>

  <button class="btn ghost" id="staff-back">もどる</button>
`);

function renderStaff() {
  const today = todayKey();
  el("staff-date").textContent = today;

  const users = getUsers();
  const list = el("staff-list");
  list.innerHTML = "";
  let doneCount = 0;

  if (!users.length) {
    list.innerHTML = `<p class="staff-note">まだ利用者が登録されていません。</p>`;
  }

  users.forEach(u => {
    const rec = getRecordsOf(u.id);
    const t = rec[today] || {};
    const acts = t.activities || [];
    const habits = Object.values(t.habits || {}).filter(Boolean).length;
    if (t.completed) doneCount++;

    const row = document.createElement("div");
    row.className = "staff-row" + (t.completed ? " done" : "");
    const names = acts.map(a => a.label).filter((v, i, arr) => arr.indexOf(v) === i).join("、");
    row.innerHTML = `
      <span class="sface">${escapeHtml(initial(u.name))}</span>
      <span class="sname">${escapeHtml(u.name)}<br>
        <span class="staff-note">${t.completed ? escapeHtml(names || "実施あり") : "未実施"}${habits ? "／生活チェック" + habits : ""}</span>
      </span>
      <span class="sstat">${t.completed ? '<span class="badge-ok">済</span>' : '<span class="badge-no">未</span>'}<br>
        連続 ${streakOf(u.id)} 日</span>`;
    list.appendChild(row);
  });

  el("staff-summary").textContent = users.length
    ? `${users.length}名中 ${doneCount}名が実施済み`
    : "";

  // 利用者の管理
  const ubox = el("staff-users");
  ubox.innerHTML = "";
  users.forEach(u => {
    const row = document.createElement("div");
    row.className = "staff-row";
    row.innerHTML = `<span class="sname">${escapeHtml(u.name)}<br>
      <span class="staff-note">登録 ${u.createdAt || "-"}／最終 ${u.lastActive || "なし"}</span></span>`;
    const rename = document.createElement("button");
    rename.className = "chip";
    rename.style.minHeight = "40px";
    rename.textContent = "名前";
    rename.addEventListener("click", () => {
      const n = prompt("新しいお名前", u.name);
      if (n && n.trim()) { renameUser(u.id, n.trim()); renderStaff(); }
    });
    const del = document.createElement("button");
    del.className = "chip";
    del.style.minHeight = "40px";
    del.style.borderColor = "var(--coral)";
    del.style.color = "var(--coral)";
    del.textContent = "削除";
    del.addEventListener("click", () => {
      if (confirm(`「${u.name}」さんを削除します。\nこの方の記録もすべて消えます。よろしいですか？`)) {
        removeUser(u.id);
        renderStaff();
      }
    });
    row.appendChild(rename);
    row.appendChild(del);
    ubox.appendChild(row);
  });

  // 保存状態
  const info = el("staff-storage");
  const total = users.reduce((n, u) => n + getEventsOf(u.id).length, 0);
  info.textContent = `利用者 ${users.length}名／活動の記録 ${total}件／最終バックアップ ${storage.get("lastBackup") || "なし"}`;
  try {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(p => {
        info.textContent += p ? "／端末に保護されています" : "／保護は未設定（ホーム画面に追加すると消えにくくなります）";
      }).catch(() => {});
    }
  } catch (e) {}
}
onScreen("staff", renderStaff);

on("staff-back", () => showScreen(isFacilityMode() ? "user-select" : "settings"));
on("staff-add-user", () => {
  const name = prompt("お名前（ニックネーム）を入れてください");
  if (name && name.trim()) { addUser(name.trim()); renderStaff(); }
});
on("staff-csv-month", () => {
  const now = new Date();
  if (!exportMonthlyCsv(now.getFullYear(), now.getMonth())) alert("書き出しに失敗しました。");
});
on("staff-csv-events", () => {
  if (!exportEventsCsv()) alert("書き出しに失敗しました。");
});
on("staff-json", () => {
  if (!exportJson()) alert("書き出しに失敗しました。");
});
on("staff-backup-now", () => {
  runBackup(true);
  setTimeout(() => {
    latestBackupInfo().then(info => {
      alert(info ? `バックアップしました。\n${info.userCount}名／記録 ${info.eventCount}件` : "バックアップできませんでした。");
      renderStaff();
    });
  }, 400);
});

on("staff-restore", () => {
  latestBackupInfo().then(info => {
    if (!info || !info.userCount) {
      alert("復元できるバックアップが見つかりませんでした。");
      return;
    }
    const now = getUsers().length;
    const msg =
      `${info.date} のバックアップから復元します。\n\n` +
      `　バックアップの中身：${info.userCount}名（${info.userNames.join("、")}）／記録 ${info.eventCount}件\n` +
      `　いまの状態：${now}名\n\n` +
      `いまの記録は上書きされます。よろしいですか？`;
    if (!confirm(msg)) return;
    restoreFromBackup().then(res => {
      alert(res ? `${res.date} のバックアップから復元しました。` : "復元できませんでした。");
      renderStaff();
    });
  });
});

/* =========================================================
   3. 設定画面に「施設モード」と「職員メニュー」を足す
   ========================================================= */
onScreen("settings", () => {
  if (document.getElementById("set-facility")) { renderFacilityChips(); return; }
  const anchor = el("set-about") || el("set-back");   // バージョン表示の前に差し込む
  const box = document.createElement("div");
  box.innerHTML = `
    <div class="card">
      <p style="font-weight:700;margin-bottom:10px;">施設モード（1台を何人かで使う）</p>
      <div class="chip-row" id="set-facility"></div>
      <p class="note">オンにすると、起動したときに「どなたですか？」と名前を選ぶ画面が出ます。
      記録は選んだ方ごとに分かれて保存されます。</p>
      <button class="btn small ghost" id="set-staff-btn" style="margin-top:12px;margin-bottom:0;">🔑 職員メニューを開く</button>
    </div>`;
  anchor.parentNode.insertBefore(box, anchor);
  document.getElementById("set-staff-btn").addEventListener("click", () => showScreen("staff"));
  renderFacilityChips();
});

function renderFacilityChips() {
  renderChips("set-facility",
    [{ label: "使わない", value: false }, { label: "施設モード", value: true }],
    () => isFacilityMode(),
    v => {
      setFacilityMode(v);
      if (v && !getUsers().length) promptAddUser();
    });
}

/* =========================================================
   4. ホームに「利用者をかえる」を出す（施設モードのとき）
   ========================================================= */
onScreen("home", () => {
  const home = document.getElementById("screen-home");
  let btn = document.getElementById("home-switch-user");
  if (!isFacilityMode()) { if (btn) btn.style.display = "none"; return; }
  if (!btn) {
    btn = document.createElement("button");
    btn.className = "btn ghost small";
    btn.id = "home-switch-user";
    btn.addEventListener("click", () => showScreen("user-select"));
    home.appendChild(btn);
  }
  btn.style.display = "block";
  const u = getCurrentUser();
  btn.textContent = `👤 ${u ? u.name : "利用者"}さん以外の方が使う（切りかえ）`;
});

/* =========================================================
   5. 起動時の画面ふりわけ
      （index.html の init() は古い profile を見ているので、ここで正す）
   ========================================================= */
(function bootFacility() {
  const users = getUsers();
  const tabbar = document.getElementById("tabbar");

  if (!users.length) {
    tabbar.classList.remove("visible");
    showScreen("setup");
    return;
  }
  if (isFacilityMode()) {
    tabbar.classList.remove("visible");
    showScreen("user-select");
    return;
  }
  if (!getCurrentUserId()) setCurrentUser(users[0].id);
  tabbar.classList.add("visible");
  showScreen("home");
})();
