/* =========================================================
   脳いきいき手帳 v0.2 拡張 ─ 共通部品
   ・画面の追加（addScreen）
   ・読み上げ（Web Speech API）
   ・文字サイズ／設定
   ・活動の記録（種目別）
   ========================================================= */
"use strict";

/* ---------- 追加CSS ---------- */
(function injectCss() {
  const css = `
  .menu-btn{display:flex;align-items:center;gap:14px;width:100%;min-height:76px;border:none;border-radius:16px;
    background:var(--white);box-shadow:0 2px 8px rgba(43,58,85,.10);padding:12px 16px;margin-bottom:12px;
    cursor:pointer;font-family:inherit;color:var(--text);text-align:left;}
  .menu-btn:active{transform:translateY(2px);}
  .menu-btn .mi{font-size:2rem;flex-shrink:0;width:46px;text-align:center;}
  .menu-btn .mt{font-family:"Zen Maru Gothic","Noto Sans JP",sans-serif;font-weight:700;font-size:1.08rem;line-height:1.35;}
  .menu-btn .ms{font-size:.78rem;color:#6B7691;line-height:1.35;display:block;margin-top:2px;}
  .menu-btn.accent{border-left:8px solid var(--gold);}
  .menu-btn.accent2{border-left:8px solid var(--coral);}
  .menu-btn.accent3{border-left:8px solid var(--main);}
  .sec-title{font-size:1rem;font-weight:700;color:var(--main);margin:18px 0 8px;font-family:"Zen Maru Gothic",sans-serif;}
  .sec-title:first-child{margin-top:0;}

  .hbtn{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;border:2px solid var(--line);
    border-radius:14px;background:var(--white);padding:8px 12px;margin-bottom:8px;cursor:pointer;
    font-family:inherit;font-size:1rem;color:var(--text);text-align:left;}
  .hbtn .hi{font-size:1.5rem;}
  .hbtn .hcheck{margin-left:auto;font-size:1.4rem;color:#C9C2AE;}
  .hbtn.on{background:var(--done);border-color:var(--main);font-weight:700;}
  .hbtn.on .hcheck{color:var(--main);}
  .habit-bar{height:12px;border-radius:6px;background:#EDE7D6;overflow:hidden;margin:6px 0 10px;}
  .habit-bar > i{display:block;height:100%;background:var(--gold);border-radius:6px;transition:width .3s;}

  .icon-btn{position:absolute;top:14px;right:14px;width:46px;height:46px;border-radius:50%;border:2px solid var(--line);
    background:var(--white);font-size:1.3rem;cursor:pointer;line-height:1;}
  .screen{position:relative;}

  .big-q{font-size:1.6rem;font-weight:700;text-align:center;margin:10px 0 18px;font-family:"Zen Maru Gothic",sans-serif;}
  .keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
  .keypad button{min-height:62px;font-size:1.4rem;font-weight:700;border:2px solid var(--main);border-radius:14px;
    background:var(--white);color:var(--main);font-family:inherit;cursor:pointer;}
  .keypad button:active{background:var(--done);}
  .ans-box{min-height:62px;border:2px solid var(--line);border-radius:14px;background:var(--white);
    font-size:1.7rem;font-weight:700;text-align:center;line-height:58px;margin-bottom:10px;letter-spacing:.1em;}

  .pad-grid{display:grid;gap:8px;margin-bottom:14px;}
  .pad-cell{aspect-ratio:1;border:none;border-radius:14px;background:var(--main);color:#fff;font-size:1.8rem;
    display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit;transition:transform .1s;}
  .pad-cell.lit{background:var(--gold);transform:scale(1.06);}
  .pad-cell.off{opacity:.45;}

  .chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
  .chip{border:2px solid var(--main);background:var(--white);color:var(--main);border-radius:999px;
    padding:8px 16px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;min-height:48px;}
  .chip.sel{background:var(--main);color:#fff;}

  .timer-big{font-size:3.2rem;font-weight:700;text-align:center;color:var(--main);
    font-family:"Zen Maru Gothic",sans-serif;line-height:1.1;}
  .step-num{display:inline-block;min-width:34px;height:34px;line-height:34px;border-radius:50%;
    background:var(--main);color:#fff;text-align:center;font-weight:700;margin-right:8px;}
  .ol-step{display:flex;align-items:flex-start;gap:6px;margin-bottom:10px;font-size:1rem;}

  .talk-card{background:#FFF9E8;border:2px solid var(--gold);border-radius:16px;padding:16px;margin-bottom:14px;}
  .talk-card h3{color:var(--main);font-size:1.15rem;margin-bottom:8px;}
  .talk-card li{margin-left:1.2em;margin-bottom:6px;}

  .bar-chart{display:flex;align-items:flex-end;gap:6px;height:120px;margin:10px 0;}
  .bar-chart > div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;}
  .bar-chart .bar{width:100%;background:var(--main);border-radius:6px 6px 0 0;min-height:3px;}
  .bar-chart .bl{font-size:.7rem;margin-top:4px;color:#6B7691;}

  .big-mode{max-width:none;}
  body.big .app{max-width:900px;}
  body.big .big-q{font-size:2.4rem;}
  body.big .quiz-choice{font-size:1.4rem;min-height:76px;}
  `;
  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
})();

/* ---------- 画面を後から追加する ---------- */
function addScreen(id, html) {
  const existing = document.getElementById("screen-" + id);
  if (existing) { existing.innerHTML = html; return existing; }
  const sec = document.createElement("section");
  sec.className = "screen";
  sec.id = "screen-" + id;
  sec.innerHTML = html;
  document.querySelector(".app").appendChild(sec);
  return sec;
}

/* ---------- 読み上げのための文章づくり ----------
   画面の表示はそのままに、「読み上げるときだけ」自然な言い方に直す。
   ・計算の記号 … ＋→たす／－→ひく／×→かける／÷→わる／＝→は
   ・絵文字や記号は読まない（「しろまるせいかい」などと読ませない）
   ・区切りに読点を入れて、棒読みにならないようにする            */
function toSpeechText(input) {
  let s = String(input);

  // 絵文字・記号（読み上げると邪魔になるもの）を落とす
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{20E3}\u{2B00}-\u{2BFF}]/gu, " ");

  // 計算の記号（数字にはさまれているときだけ言葉に置きかえる）
  s = s.replace(/(\d)\s*[＋+]\s*(?=\d)/g, "$1 たす ");
  s = s.replace(/(\d)\s*[－\-ー−‐―–—]\s*(?=\d)/g, "$1 ひく ");
  s = s.replace(/(\d)\s*[×✕ｘxX＊*]\s*(?=\d)/g, "$1 かける ");
  s = s.replace(/(\d)\s*[÷]\s*(?=\d)/g, "$1 わる ");
  s = s.replace(/(\d)\s*[／\/]\s*(?=\d)/g, "$1 わる ");
  s = s.replace(/\s*[＝=]\s*/g, " は ");

  // 残った区切り記号は、読点にして「間」にする
  s = s.replace(/\s*[／\/｜|]\s*/g, "、");
  s = s.replace(/[「」『』（）()]/g, " ");

  // 読点・句点のあとに軽い間を作る（続けて詰まって聞こえるのを防ぐ）
  s = s.replace(/([。！？!?])\s*/g, "$1 ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

/* ---------- 読み上げ（Web Speech API） ---------- */
const Voice = (() => {
  const supported = "speechSynthesis" in window;
  let voices = [];
  let chosen = null;

  /* 端末に入っている日本語の声のうち、いちばん自然なものを選ぶ。
     Windows/Edge の「Natural」、iPhone/Macの Kyoko、Androidの Google 日本語 など、
     機種によって使える声が違うので、名前で点数をつけて選ぶ。 */
  function scoreVoice(v) {
    const n = (v.name || "") + " " + (v.voiceURI || "");
    let s = 0;
    if (/Natural|ニューラル|Neural/i.test(n)) s += 100;   // いちばん人間らしい
    if (/Online/i.test(n)) s += 40;
    if (/Nanami|なな み|Ayumi|Haruka|Ichiro|Keita|Sayaka/i.test(n)) s += 30;
    if (/Kyoko|Otoya|Hattori|O-Ren/i.test(n)) s += 30;    // Apple
    if (/Google/i.test(n)) s += 25;                        // Android/Chrome
    if (v.localService) s += 5;
    return s;
  }

  function refreshVoices() {
    if (!supported) return;
    try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
    const ja = voices.filter(v => /^ja(-|_|$)/i.test(v.lang || ""));
    const savedName = storage.get("voiceName");
    chosen = ja.find(v => v.name === savedName)
          || ja.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0]
          || null;
  }
  if (supported) {
    refreshVoices();
    try { speechSynthesis.onvoiceschanged = refreshVoices; } catch (e) {}
  }

  function listJapaneseVoices() {
    return voices.filter(v => /^ja(-|_|$)/i.test(v.lang || ""))
                 .sort((a, b) => scoreVoice(b) - scoreVoice(a));
  }
  function currentVoiceName() { return chosen ? chosen.name : null; }
  function setVoiceName(name) { storage.set("voiceName", name || null); refreshVoices(); }

  function rate() {
    const r = Number(storage.get("voiceRate"));
    return (r >= 0.6 && r <= 1.4) ? r : 0.98;   // ゆっくりすぎると逆に不自然になる
  }
  function setRate(r) { storage.set("voiceRate", r); }

  function enabled() { return storage.get("voiceOn") === true; }
  function setEnabled(v) { storage.set("voiceOn", !!v); if (!v) stop(); }
  function stop() { if (supported) { try { speechSynthesis.cancel(); } catch (e) {} } }

  function speak(text, force) {
    if (!supported || (!enabled() && !force) || !text) return;
    const say = toSpeechText(text);
    if (!say) return;
    try {
      speechSynthesis.cancel();
      if (!chosen) refreshVoices();
      const u = new SpeechSynthesisUtterance(say);
      u.lang = "ja-JP";
      if (chosen) u.voice = chosen;
      u.rate = rate();
      u.pitch = 1.05;    // ほんの少し高めのほうが明るく、機械っぽさが減る
      u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  return {
    supported, enabled, setEnabled, speak, stop,
    listJapaneseVoices, currentVoiceName, setVoiceName, rate, setRate, refreshVoices
  };
})();

/* ---------- 文字サイズ ---------- */
const FONT_SIZES = { normal: 18, large: 21, xlarge: 24 };
function applyFontSize() {
  const key = storage.get("fontSize") || "normal";
  document.documentElement.style.fontSize = (FONT_SIZES[key] || 18) + "px";
}
applyFontSize();

/* ---------- 大画面（みんなで）モード ---------- */
function applyBigMode() {
  document.body.classList.toggle("big", storage.get("bigMode") === true);
}
applyBigMode();

/* ---------- 画面にいた時間をはかる（かかった時間の記録に使う） ---------- */
let screenEnteredAt = Date.now();
(function wrapShowScreen() {
  const orig = showScreen;
  showScreen = function (id) {
    screenEnteredAt = Date.now();
    return orig(id);
  };
})();
function secondsOnScreen() {
  return Math.max(0, Math.round((Date.now() - screenEnteredAt) / 1000));
}

/* ---------- 活動記録（種目別） ---------- */
/* records[YYYY-MM-DD] = { completed, activities:[{kind,label,score,total,at}], habits:{...} }
   あわせて、あとから何でも集計できるように追記型のイベントも残す（js/records.js） */
function logActivity(kind, label, detail) {
  const info = Object.assign({ seconds: secondsOnScreen() }, detail || {});
  const records = getRecords();
  const key = todayKey();
  const rec = records[key] || { completed: false };
  rec.completed = true;
  rec.activities = rec.activities || [];
  rec.activities.push(Object.assign({ kind, label, at: new Date().toISOString() }, info));
  records[key] = rec;
  saveRecords(records);
  if (typeof logEvent === "function") logEvent(kind, label, info);
  updateFamilySelf();
}

function getHabits(dateKey) {
  return (getRecords()[dateKey || todayKey()] || {}).habits || {};
}
function setHabit(id, on) {
  const records = getRecords();
  const key = todayKey();
  const rec = records[key] || { completed: false };
  rec.habits = rec.habits || {};
  rec.habits[id] = !!on;
  records[key] = rec;
  saveRecords(records);
  if (on && typeof logEvent === "function") logEvent("habit", "生活チェック", { item: id });
}

/* 直近n日の活動回数 */
function activityCountByDay(days) {
  const records = getRecords();
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const k = todayKey(d);
    const rec = records[k] || {};
    const habits = rec.habits || {};
    out.push({
      key: k,
      date: new Date(d),
      count: (rec.activities || []).length || (rec.completed ? 1 : 0),
      habitCount: Object.values(habits).filter(Boolean).length
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ---------- 小道具 ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function el(id) { return document.getElementById(id); }
function on(id, fn) { const e = el(id); if (e) e.addEventListener("click", fn); }
