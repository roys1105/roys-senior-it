/* =========================================================
   脳いきいき手帳 v0.2 ─ ホーム／設定／記録グラフ の拡張
   （このファイルは最後に読み込むこと）
   ========================================================= */
"use strict";

/* =========================================================
   1. 設定画面（文字サイズ・読み上げ・大画面）
   ========================================================= */
addScreen("settings", `
  <h2 class="page-title">⚙️ 設定</h2>

  <div class="card">
    <p style="font-weight:700;margin-bottom:10px;">文字の大きさ</p>
    <div class="chip-row" id="set-font"></div>
    <p class="note">見えにくいと感じたら、大きくしてください。</p>
  </div>

  <div class="card">
    <p style="font-weight:700;margin-bottom:10px;">読み上げ（音声）</p>
    <div class="chip-row" id="set-voice"></div>
    <p class="note">問題文や案内を声で読み上げます。耳で聞くと分かりやすい方におすすめです。<br>
    ※体操とレクの案内は、設定に関わらず読み上げます。</p>

    <p style="font-weight:700;margin:16px 0 8px;">声の種類</p>
    <div class="chip-row" id="set-voice-name"></div>
    <p class="note" id="set-voice-note"></p>

    <p style="font-weight:700;margin:16px 0 8px;">話す速さ</p>
    <div class="chip-row" id="set-voice-rate"></div>

    <button class="btn small ghost" id="set-voice-test" style="margin-top:12px;margin-bottom:0;">🔊 声を聞いてみる</button>
  </div>

  <div class="card">
    <p style="font-weight:700;margin-bottom:10px;">大画面モード（施設向け）</p>
    <div class="chip-row" id="set-big"></div>
    <p class="note">テレビ・モニターに映して大勢で使うとき、文字と選択肢を大きくします。</p>
  </div>

  <div class="card">
    <p style="font-weight:700;margin-bottom:10px;">お名前</p>
    <input type="text" class="family-input" id="set-nickname" maxlength="10" style="border-color:var(--main);margin-bottom:10px;">
    <button class="btn small" id="set-nickname-save">名前を変更する</button>
  </div>

  <div class="card" id="set-about">
    <p class="note">脳いきいき手帳 v0.3<br>
    このアプリは脳トレ・生活習慣づくりの補助アプリです。病気の診断・治療を目的とするものではありません。</p>
  </div>
  <button class="btn ghost" id="set-back">もどる</button>
`);

function renderChips(boxId, options, currentFn, onPick) {
  const box = el(boxId);
  box.innerHTML = "";
  options.forEach(o => {
    const b = document.createElement("button");
    b.className = "chip" + (currentFn() === o.value ? " sel" : "");
    b.textContent = o.label;
    b.addEventListener("click", () => { onPick(o.value); renderSettings(); });
    box.appendChild(b);
  });
}

function renderSettings() {
  renderChips("set-font",
    [{ label: "ふつう", value: "normal" }, { label: "大きい", value: "large" }, { label: "とても大きい", value: "xlarge" }],
    () => storage.get("fontSize") || "normal",
    v => { storage.set("fontSize", v); applyFontSize(); });

  renderChips("set-voice",
    [{ label: "読み上げる", value: true }, { label: "読み上げない", value: false }],
    () => storage.get("voiceOn") === true,
    v => { Voice.setEnabled(v); if (v) Voice.speak("読み上げをオンにしました", true); });

  renderVoiceChoices();

  renderChips("set-big",
    [{ label: "ふつう表示", value: false }, { label: "大画面", value: true }],
    () => storage.get("bigMode") === true,
    v => { storage.set("bigMode", v); applyBigMode(); });

  const p = getProfile();
  const inp = el("set-nickname");
  if (p && inp) inp.value = p.nickname;
}
/* 声の種類と速さ（使える声は端末によって違うので、その端末にあるものだけ並べる） */
function shortVoiceLabel(v) {
  let n = String(v.name || "")
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s*-\s*Japanese.*$/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/Online/i, "")
    .trim();
  if (/Natural|Neural/i.test(v.name)) n = n.replace(/Natural|Neural/gi, "").trim() + "（自然な声）";
  return n || v.name;
}

function renderVoiceChoices() {
  const box = el("set-voice-name");
  const note = el("set-voice-note");
  if (!box) return;
  const list = Voice.listJapaneseVoices();

  if (!Voice.supported) {
    box.innerHTML = "";
    note.textContent = "このブラウザは読み上げに対応していません。";
  } else if (!list.length) {
    box.innerHTML = "";
    note.textContent = "日本語の声が見つかりませんでした。少し待ってから設定を開き直すと出てくることがあります。";
  } else {
    box.innerHTML = "";
    list.slice(0, 6).forEach(v => {
      const b = document.createElement("button");
      b.className = "chip" + (Voice.currentVoiceName() === v.name ? " sel" : "");
      b.textContent = shortVoiceLabel(v);
      b.addEventListener("click", () => {
        Voice.setVoiceName(v.name);
        renderVoiceChoices();
        Voice.speak("こんにちは。今日もいっしょに、脳トレをしましょう。", true);
      });
      box.appendChild(b);
    });
    const hasNatural = list.some(v => /Natural|Neural/i.test(v.name || ""));
    note.textContent = hasNatural
      ? `「自然な声」と出ているものが、いちばん人間らしく聞こえます。（この端末で使える声：${list.length}種類）`
      : `この端末には基本の声だけが入っています（${list.length}種類）。`
        + "スマホ・タブレットや、パソコンのEdgeで開くと、もっと自然な声が使えることがあります。";
  }

  renderChips("set-voice-rate",
    [{ label: "ゆっくり", value: 0.85 }, { label: "ふつう", value: 0.98 }, { label: "はやめ", value: 1.12 }],
    () => Voice.rate(),
    v => { Voice.setRate(v); Voice.speak("この速さでお話しします。", true); });
}

on("set-voice-test", () => {
  Voice.speak("こんにちは。25 ＋ 17 は いくつでしょう？　ゆっくり考えてくださいね。", true);
});

onScreen("settings", renderSettings);
on("set-back", () => showScreen("home"));
on("set-nickname-save", () => {
  const name = el("set-nickname").value.trim();
  if (!name) { alert("お名前を入れてください。"); return; }
  const p = getProfile();
  storage.set("profile", { nickname: name, memberId: p.memberId });
  updateFamilySelf();
  alert("お名前を変更しました。");
  showScreen("home");
});

/* =========================================================
   2. ホーム画面の拡張
   ========================================================= */
(function enhanceHome() {
  const home = document.getElementById("screen-home");
  if (!home) return;

  // 設定ボタン（右上）
  const gear = document.createElement("button");
  gear.className = "icon-btn";
  gear.id = "home-settings-btn";
  gear.textContent = "⚙️";
  gear.setAttribute("aria-label", "設定");
  gear.addEventListener("click", () => showScreen("settings"));
  home.insertBefore(gear, home.firstChild);

  // 「今日のおすすめ」＋生活チェックのカードを、統計の下に差し込む
  const statsRow = home.querySelector(".stats-row");
  const box = document.createElement("div");
  box.id = "home-plus";
  box.innerHTML = `
    <div class="card" style="border-left:8px solid var(--gold);">
      <p style="font-weight:700;color:var(--main);margin-bottom:6px;">🌟 今日のおすすめ</p>
      <p style="margin-bottom:10px;" id="home-recommend"></p>
      <button class="btn small" id="home-recommend-btn">やってみる</button>
    </div>
    <div class="card" style="border-left:8px solid var(--coral);">
      <p style="font-weight:700;color:var(--main);margin-bottom:4px;">✅ 今日の生活チェック</p>
      <div class="habit-bar"><i id="home-habit-fill" style="width:0%"></i></div>
      <p style="font-size:.9rem;margin-bottom:10px;" id="home-habit-text"></p>
      <button class="btn small ghost" id="home-habit-btn" style="margin-bottom:0;">チェックする</button>
    </div>`;
  statsRow.parentNode.insertBefore(box, statsRow.nextSibling);

  // 導線ボタンを増やす
  const extra = document.createElement("div");
  extra.innerHTML = `
    <button class="btn" id="home-karada-btn">💪 からだを動かす・生活を整える</button>`;
  const recBtn = document.getElementById("home-record-btn");
  recBtn.parentNode.insertBefore(extra, recBtn);

  document.getElementById("home-karada-btn").addEventListener("click", () => showScreen("karada"));
  document.getElementById("home-habit-btn").addEventListener("click", () => showScreen("habit"));
  document.getElementById("home-game-btn").addEventListener("click", () => showScreen("asobu"));
  document.getElementById("home-family-btn").addEventListener("click", () => showScreen("minna"));
  document.getElementById("home-family-btn").textContent = "👪 みんなと（家族・思い出ばなし・レク）";
})();

/* 今日のおすすめ（曜日ごとに領域を変えて、いろいろな刺激になるように） */
const RECOMMEND = [
  { d: "きょうは日曜日。ゆっくり「思い出ばなし」で、昔のことを語ってみませんか。", go: "omoide" },
  { d: "週のはじめは「計算ドリル」で頭のウォーミングアップ。", go: "calc-select" },
  { d: "きょうは「順番おぼえ」で、覚える力の体操をしましょう。", go: "order-select" },
  { d: "からだも動かしましょう。「いきいき体操」はいかがですか。", go: "taiso-select" },
  { d: "「ことば並べかえ」で、言葉の引き出しを開けてみましょう。", go: "word-start" },
  { d: "「コグニサイズ」で、体と頭を同時に使ってみましょう。", go: "cogni-select" },
  { d: "きょうは「脳トレクイズ」でおさらい。ゆっくりどうぞ。", go: "quiz-start" }
];

onScreen("home", () => {
  const now = new Date();
  const r = RECOMMEND[now.getDay()];
  const t = el("home-recommend");
  if (t) t.textContent = r.d;
  const b = el("home-recommend-btn");
  if (b) b.onclick = () => showScreen(r.go);

  const habits = getHabits();
  const n = Object.values(habits).filter(Boolean).length;
  const total = (typeof HABITS !== "undefined") ? HABITS.length : 6;
  const fill = el("home-habit-fill");
  if (fill) fill.style.width = Math.round((n / total) * 100) + "%";
  const ht = el("home-habit-text");
  if (ht) ht.textContent = n === 0 ? "まだ記録がありません。1つでもどうぞ。" : `${n} / ${total} こ 記録できました。`;

  // 「今日は完了」表示のときも、続けて遊べるようにする
  const done = el("home-done");
  if (done && done.style.display !== "none" && !document.getElementById("home-done-more")) {
    const more = document.createElement("button");
    more.className = "btn small";
    more.id = "home-done-more";
    more.style.marginTop = "10px";
    more.textContent = "もっと脳トレをする";
    more.addEventListener("click", () => showScreen("asobu"));
    done.appendChild(more);
  }
});

/* =========================================================
   3. 記録画面：週間グラフ＋今日の内容
   ========================================================= */
(function enhanceCalendar() {
  const cal = document.getElementById("screen-calendar");
  if (!cal) return;
  const box = document.createElement("div");
  box.innerHTML = `
    <div class="card">
      <p style="font-weight:700;color:var(--main);margin-bottom:4px;">この2週間のようす</p>
      <p class="note" style="margin-bottom:4px;">緑＝脳トレの回数／オレンジ＝生活チェックの数</p>
      <div class="bar-chart" id="cal-chart"></div>
    </div>
    <div class="card">
      <p style="font-weight:700;color:var(--main);margin-bottom:8px;">今日やったこと</p>
      <div id="cal-today-list"></div>
    </div>`;
  cal.appendChild(box);
})();

onScreen("calendar", () => {
  const days = activityCountByDay(14);
  const max = Math.max(3, ...days.map(d => Math.max(d.count, d.habitCount)));
  const chart = el("cal-chart");
  chart.innerHTML = "";
  days.forEach(d => {
    const col = document.createElement("div");
    const h1 = Math.round((d.count / max) * 100);
    const h2 = Math.round((d.habitCount / max) * 100);
    col.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:2px;width:100%;height:100%;">
        <div class="bar" style="height:${h1}%;"></div>
        <div class="bar" style="height:${h2}%;background:var(--gold);"></div>
      </div>
      <span class="bl">${d.date.getDate()}</span>`;
    chart.appendChild(col);
  });

  const rec = getRecords()[todayKey()] || {};
  const list = el("cal-today-list");
  list.innerHTML = "";
  const acts = rec.activities || [];
  if (!acts.length && !rec.completed) {
    list.innerHTML = `<p class="note">まだ記録がありません。今日もひとつ、やってみませんか。</p>`;
  } else {
    if (!acts.length) list.innerHTML = `<p>脳トレを1つ行いました。</p>`;
    acts.slice().reverse().forEach(a => {
      const p = document.createElement("p");
      let detail = "";
      if (a.score !== undefined && a.total !== undefined) detail = `（${a.score}／${a.total}問）`;
      else if (a.level !== undefined) detail = `（レベル${a.level}）`;
      else if (a.moves !== undefined) detail = `（${a.moves}手）`;
      p.innerHTML = `✅ ${escapeHtml(a.label)} <span class="note">${detail}</span>`;
      p.style.marginBottom = "6px";
      list.appendChild(p);
    });
  }
  const habits = getHabits();
  const hn = Object.values(habits).filter(Boolean).length;
  if (hn) {
    const p = document.createElement("p");
    p.innerHTML = `✅ 生活チェック <span class="note">（${hn}こ）</span>`;
    list.appendChild(p);
  }
});

/* =========================================================
   4. 起動時のタブ整合
   ========================================================= */
(function boot() {
  // 既存の init() は showScreen("home") 済み。ここでタブの見た目を合わせる。
  const active = document.querySelector(".screen.active");
  if (active) {
    const id = active.id.replace("screen-", "");
    document.querySelectorAll(".tab").forEach(t =>
      t.classList.toggle("active", t.dataset.screen === tabKeyOf(id))
    );
    (SCREEN_HOOKS[id] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }
})();
