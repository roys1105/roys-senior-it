/* =========================================================
   脳いきいき手帳 v0.2 ─ 脳トレ拡張
   「あそぶ（脳トレ）」ハブ ＋ 新ゲーム5種 ＋ クイズ問題の増強
   ねらい（認知機能の領域）：
     記憶力／注意力／計算力／言語力／判断のはやさ／見る力
   ========================================================= */
"use strict";

/* =========================================================
   1. 脳トレハブ画面
   ========================================================= */
addScreen("asobu", `
  <h2 class="page-title">🧠 脳トレメニュー</h2>
  <div class="card" style="padding:14px 16px;">
    <p style="font-size:.95rem;">好きなものを選んでください。<br>
    <span class="note">きょうの気分に合わせて、1つでも大丈夫です。</span></p>
  </div>

  <p class="sec-title">おぼえる・思い出す</p>
  <button class="menu-btn accent3" data-go="game-select">
    <span class="mi">🃏</span><span><span class="mt">記憶力ゲーム</span>
    <span class="ms">同じ絵柄のカードを2枚ずつ見つける（記憶力）</span></span></button>
  <button class="menu-btn accent3" data-go="order-select">
    <span class="mi">🔢</span><span><span class="mt">順番おぼえ</span>
    <span class="ms">光った順にタップする（作業記憶・集中力）</span></span></button>

  <p class="sec-title">考える・計算する</p>
  <button class="menu-btn accent" data-go="quiz-start">
    <span class="mi">✏️</span><span><span class="mt">脳トレクイズ</span>
    <span class="ms">計算・ことば・常識・思い出・漢字・日本の地理</span></span></button>
  <button class="menu-btn accent" data-go="calc-select">
    <span class="mi">🧮</span><span><span class="mt">計算ドリル</span>
    <span class="ms">10問に挑戦。買い物のおつり計算も（計算力）</span></span></button>

  <p class="sec-title">ことば</p>
  <button class="menu-btn accent2" data-go="word-start">
    <span class="mi">🔤</span><span><span class="mt">ことば並べかえ</span>
    <span class="ms">バラバラの文字から言葉を作る（言語力）</span></span></button>

  <p class="sec-title">見る・気づく</p>
  <button class="menu-btn accent3" data-go="puzzle-select">
    <span class="mi">🧩</span><span><span class="mt">パズルゲーム</span>
    <span class="ms">ピースをえらんで絵を完成させる（空間認知）</span></span></button>
  <button class="menu-btn accent3" data-go="find-start">
    <span class="mi">🔍</span><span><span class="mt">なかまはずれさがし</span>
    <span class="ms">1つだけちがう絵をさがす（注意力・見る力）</span></span></button>
  <button class="menu-btn accent2" data-go="stroop-start">
    <span class="mi">🎨</span><span><span class="mt">いろ と ことば</span>
    <span class="ms">文字ではなく「色」を答える（判断のはやさ）</span></span></button>
`);

document.querySelectorAll("#screen-asobu [data-go]").forEach(b => {
  b.addEventListener("click", () => showScreen(b.dataset.go));
});

/* 既存の「ゲームメニュー」画面に来たときは新ハブへ寄せる */
onScreen("game-menu", () => showScreen("asobu"));

/* =========================================================
   2. 共通：結果画面
   ========================================================= */
addScreen("result-plus", `
  <h2 class="page-title" id="rp-title">けっか</h2>
  <div class="card center">
    <p style="font-size:1.9rem;font-weight:700;color:var(--gold);font-family:'Zen Maru Gothic',sans-serif;" id="rp-score"></p>
    <p id="rp-comment" style="font-weight:700;"></p>
    <p class="note" style="margin-top:8px;">今日の記録として保存しました。</p>
  </div>
  <button class="btn" id="rp-again">もう一回</button>
  <button class="btn ghost" id="rp-menu">ほかの脳トレを見る</button>
  <button class="btn ghost small" id="rp-home">ホームに戻る</button>
`);

let rpAgainTarget = "asobu";
function showResult(title, scoreText, comment, againScreen) {
  el("rp-title").textContent = title;
  el("rp-score").textContent = scoreText;
  el("rp-comment").textContent = comment;
  rpAgainTarget = againScreen || "asobu";
  showScreen("result-plus");
  Voice.speak(scoreText + "。" + comment);
}
on("rp-again", () => showScreen(rpAgainTarget));
on("rp-menu", () => showScreen("asobu"));
on("rp-home", () => showScreen("home"));

function praise(rate) {
  if (rate >= 1) return "全問正解！おみごとです！！";
  if (rate >= 0.8) return "とてもすばらしい出来ばえです！";
  if (rate >= 0.6) return "いい調子ですね！";
  if (rate >= 0.4) return "その調子。続けることが一番です。";
  return "だいじょうぶ。また明日いっしょにやりましょう！";
}

/* =========================================================
   3. 計算ドリル
   ========================================================= */
addScreen("calc-select", `
  <h2 class="page-title">🧮 計算ドリル</h2>
  <div class="card"><p>全10問です。数字のボタンで答えを入れてください。<br>
  <span class="note">まちがえても減点はありません。ゆっくりどうぞ。</span></p></div>
  <button class="btn" data-calc="easy">かんたん（たし算・ひき算）</button>
  <button class="btn" data-calc="normal">ふつう（かけ算・わり算も）</button>
  <button class="btn" data-calc="shopping">お買いもの計算（おつり）</button>
`);

addScreen("calc-play", `
  <div class="game-info"><span id="calc-progress"></span><span>正解：<span id="calc-score">0</span></span></div>
  <div class="card">
    <p class="big-q" id="calc-q"></p>
    <div class="ans-box" id="calc-ans">　</div>
    <div class="keypad" id="calc-pad"></div>
    <p class="quiz-result-mark" id="calc-mark" style="min-height:1.6em;margin-top:10px;"></p>
  </div>
  <button class="btn ghost small" id="calc-quit">やめてホームに戻る</button>
`);

let calcGame = null;
document.querySelectorAll("#screen-calc-select [data-calc]").forEach(b => {
  b.addEventListener("click", () => startCalc(b.dataset.calc));
});

/* 表示は記号のまま、読み上げは「たす・ひく・かける・わる」になる。
   記号→ことばの置きかえは js/plus-core.js の toSpeechText() が行う。
   式だけだと聞いたときに素っ気ないので、読み上げ用に「は、いくつでしょう」を足す。 */
function calcSpeech(q) {
  return q.speech || (q.text + " は、いくつでしょう。");
}

function makeCalcQuestion(mode) {
  if (mode === "shopping") {
    const price = randInt(3, 9) * 100 + randInt(1, 9) * 10;
    const paid = Math.ceil(price / 1000) * 1000;
    return {
      text: `${price}円の買いものを ${paid}円 ではらいました。おつりはいくら？`,
      speech: `${price}円の買いものを、${paid}円ではらいました。おつりはいくらでしょう。`,
      answer: paid - price, unit: "円"
    };
  }
  if (mode === "normal") {
    const t = randInt(1, 4);
    if (t === 1) { const a = randInt(20, 99), b = randInt(20, 99); return { text: `${a} ＋ ${b}`, answer: a + b }; }
    if (t === 2) { const a = randInt(50, 150), b = randInt(10, 49); return { text: `${a} － ${b}`, answer: a - b }; }
    if (t === 3) { const a = randInt(3, 12), b = randInt(3, 9); return { text: `${a} × ${b}`, answer: a * b }; }
    const b = randInt(2, 9), ans = randInt(2, 9); return { text: `${b * ans} ÷ ${b}`, answer: ans };
  }
  const t = randInt(1, 2);
  if (t === 1) { const a = randInt(5, 49), b = randInt(5, 49); return { text: `${a} ＋ ${b}`, answer: a + b }; }
  const a = randInt(20, 80), b = randInt(3, 19); return { text: `${a} － ${b}`, answer: a - b };
}

function startCalc(mode) {
  calcGame = { mode, total: 10, index: 0, score: 0, input: "", q: null, locked: false };
  const pad = el("calc-pad");
  pad.innerHTML = "";
  ["1","2","3","4","5","6","7","8","9","けす","0","こたえ"].forEach(k => {
    const b = document.createElement("button");
    b.textContent = k;
    if (k === "こたえ") { b.style.background = "var(--main)"; b.style.color = "#fff"; }
    if (k === "けす") { b.style.borderColor = "var(--coral)"; b.style.color = "var(--coral)"; b.style.fontSize = "1.1rem"; }
    b.addEventListener("click", () => calcKey(k));
    pad.appendChild(b);
  });
  nextCalc();
  showScreen("calc-play");
}

function nextCalc() {
  if (calcGame.index >= calcGame.total) return finishCalc();
  calcGame.q = makeCalcQuestion(calcGame.mode);
  calcGame.input = "";
  calcGame.locked = false;
  el("calc-progress").textContent = `第${calcGame.index + 1}問 ／ 全${calcGame.total}問`;
  el("calc-q").textContent = calcGame.q.text;
  el("calc-ans").textContent = "　";
  el("calc-mark").textContent = "";
  el("calc-mark").className = "quiz-result-mark";
  el("calc-score").textContent = calcGame.score;
  Voice.speak(calcSpeech(calcGame.q));
}

function calcKey(k) {
  if (!calcGame || calcGame.locked) return;
  if (k === "けす") { calcGame.input = calcGame.input.slice(0, -1); }
  else if (k === "こたえ") { return judgeCalc(); }
  else if (calcGame.input.length < 5) { calcGame.input += k; }
  el("calc-ans").textContent = calcGame.input || "　";
}

function judgeCalc() {
  if (!calcGame.input) { el("calc-mark").textContent = "数字を入れてください"; return; }
  calcGame.locked = true;
  const ok = Number(calcGame.input) === calcGame.q.answer;
  const mark = el("calc-mark");
  if (ok) { calcGame.score++; mark.textContent = "⭕ 正解！"; mark.className = "quiz-result-mark ok"; }
  else { mark.textContent = `❌ 正解は ${calcGame.q.answer}${calcGame.q.unit || ""}`; mark.className = "quiz-result-mark ng"; }
  el("calc-score").textContent = calcGame.score;
  Voice.speak(ok ? "正解です。" : `おしいですね。正解は、${calcGame.q.answer}${calcGame.q.unit || ""}です。`);
  calcGame.index++;
  setTimeout(nextCalc, ok ? 800 : 1800);
}

function finishCalc() {
  const s = calcGame.score, t = calcGame.total;
  logActivity("calc", "計算ドリル", { score: s, total: t, mode: calcGame.mode });
  showResult("🧮 計算ドリルの結果", `${s}問正解 ／ ${t}問中`, praise(s / t), "calc-select");
}
on("calc-quit", () => showScreen("home"));

/* =========================================================
   4. 順番おぼえ（作業記憶）
   ========================================================= */
addScreen("order-select", `
  <h2 class="page-title">🔢 順番おぼえ</h2>
  <div class="card"><p>光ったマスを、<strong>光った順番どおり</strong>にタップします。<br>
  1つずつ長くなっていきます。<span class="note">これは「作業記憶（ワーキングメモリ）」の体操です。</span></p></div>
  <button class="btn" data-order="4">かんたん（4マス）</button>
  <button class="btn" data-order="6">ふつう（6マス）</button>
  <button class="btn" data-order="9">むずかしい（9マス）</button>
`);

addScreen("order-play", `
  <div class="game-info"><span>レベル <span id="order-level">1</span></span><span id="order-state"></span></div>
  <div class="pad-grid" id="order-grid"></div>
  <p class="puzzle-msg" id="order-msg" aria-live="polite"></p>
  <button class="btn ghost small" id="order-quit">やめてホームに戻る</button>
`);

let orderGame = null;
const ORDER_FACES = ["🍎","🌸","🐱","🍊","🌻","🐟","🍇","🌷","🍑"];
document.querySelectorAll("#screen-order-select [data-order]").forEach(b => {
  b.addEventListener("click", () => startOrder(Number(b.dataset.order)));
});

function startOrder(cells) {
  const cols = cells === 4 ? 2 : 3;
  orderGame = { cells, cols, seq: [], input: [], level: 0, playing: false };
  const g = el("order-grid");
  g.style.gridTemplateColumns = `repeat(${cols},1fr)`;
  g.innerHTML = "";
  for (let i = 0; i < cells; i++) {
    const c = document.createElement("button");
    c.className = "pad-cell";
    c.textContent = ORDER_FACES[i];
    c.addEventListener("click", () => orderTap(i, c));
    g.appendChild(c);
  }
  showScreen("order-play");
  nextOrderLevel();
}

function nextOrderLevel() {
  orderGame.level++;
  orderGame.seq.push(randInt(0, orderGame.cells - 1));
  orderGame.input = [];
  el("order-level").textContent = orderGame.level;
  el("order-state").textContent = `${orderGame.seq.length}こ`;
  el("order-msg").textContent = "よく見ていてくださいね…";
  playOrderSequence();
}

function playOrderSequence() {
  orderGame.playing = true;
  const cellsEl = el("order-grid").children;
  let i = 0;
  const step = () => {
    if (i > 0) cellsEl[orderGame.seq[i - 1]].classList.remove("lit");
    if (i >= orderGame.seq.length) {
      orderGame.playing = false;
      el("order-msg").textContent = "さあ、同じ順番にタップ！";
      Voice.speak("同じ順番にタップしてください");
      return;
    }
    cellsEl[orderGame.seq[i]].classList.add("lit");
    i++;
    setTimeout(step, 700);
  };
  setTimeout(step, 600);
}

function orderTap(index, cellEl) {
  if (!orderGame || orderGame.playing) return;
  cellEl.classList.add("lit");
  setTimeout(() => cellEl.classList.remove("lit"), 220);
  orderGame.input.push(index);
  const pos = orderGame.input.length - 1;
  if (orderGame.seq[pos] !== index) return finishOrder(false);
  if (orderGame.input.length === orderGame.seq.length) {
    el("order-msg").textContent = "ぴったり！つぎへ進みます。";
    if (orderGame.level >= 10) return finishOrder(true);
    setTimeout(nextOrderLevel, 900);
  }
}

function finishOrder(cleared) {
  const lv = orderGame.level - (cleared ? 0 : 1);
  logActivity("order", "順番おぼえ", { level: lv, cells: orderGame.cells });
  const comment = cleared ? "全レベル達成！すごい記憶力です！"
    : lv >= 5 ? "5つ以上おぼえられました。りっぱです！"
    : "毎日つづけると、だんだん伸びていきますよ。";
  showResult("🔢 順番おぼえの結果", `レベル ${Math.max(lv, 0)} まで達成`, comment, "order-select");
}
on("order-quit", () => showScreen("home"));

/* =========================================================
   5. なかまはずれさがし（注意力）
   ========================================================= */
addScreen("find-start", `
  <h2 class="page-title">🔍 なかまはずれさがし</h2>
  <div class="card"><p>たくさんの絵の中に、<strong>1つだけちがう絵</strong>があります。<br>
  見つけたらタップしてください。全10問です。</p></div>
  <button class="btn" id="find-go">はじめる</button>
`);

addScreen("find-play", `
  <div class="game-info"><span id="find-progress"></span><span>正解：<span id="find-score">0</span></span></div>
  <div class="card" style="padding:12px;">
    <div class="pad-grid" id="find-grid" style="gap:5px;"></div>
    <p class="puzzle-msg" id="find-msg" aria-live="polite"></p>
  </div>
  <button class="btn ghost small" id="find-quit">やめてホームに戻る</button>
`);

const FIND_PAIRS = [
  ["🐶","🐕"],["🍎","🍏"],["🌻","🌼"],["🐟","🐠"],["🍊","🍋"],
  ["⭐","✨"],["🐱","🐈"],["🌷","🌹"],["🍇","🫐"],["☀️","🌞"],
  ["6","9"],["わ","ね"],["ぬ","め"],["シ","ツ"],["ソ","ン"],["日","目"],["土","士"],["未","末"]
];
let findGame = null;
on("find-go", () => startFind());
on("find-quit", () => showScreen("home"));

function startFind() {
  findGame = { index: 0, total: 10, score: 0, locked: false };
  nextFind();
  showScreen("find-play");
}

function nextFind() {
  if (findGame.index >= findGame.total) return finishFind();
  // マス目は最大5×5まで。6×6にすると1マス49pxになり、指でも目でもつらくなる
  // （むずかしさは「よく似た絵柄」を後半に出すことで上げる）
  const size = findGame.index < 4 ? 4 : 5;
  // 前半はひと目でわかる絵、後半はよく似た文字・記号を出す
  const easyPairs = FIND_PAIRS.slice(0, 10);
  const hardPairs = FIND_PAIRS.slice(10);
  const [base, odd] = shuffle(pick(findGame.index < 4 ? easyPairs : hardPairs));
  const total = size * size;
  const target = randInt(0, total - 1);
  const g = el("find-grid");
  g.style.gridTemplateColumns = `repeat(${size},1fr)`;
  g.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const c = document.createElement("button");
    c.className = "pad-cell";
    c.style.background = "var(--white)";
    c.style.color = "var(--text)";
    c.style.border = "2px solid var(--line)";
    c.style.fontSize = size >= 5 ? "1.5rem" : "1.7rem";
    c.textContent = i === target ? odd : base;
    c.addEventListener("click", () => findTap(i === target, c));
    g.appendChild(c);
  }
  findGame.locked = false;
  findGame.target = target;
  el("find-progress").textContent = `第${findGame.index + 1}問 ／ 全${findGame.total}問`;
  el("find-score").textContent = findGame.score;
  el("find-msg").textContent = "1つだけちがう絵をさがしてね";
}

function findTap(correct, cellEl) {
  if (findGame.locked) return;
  if (correct) {
    findGame.locked = true;
    findGame.score++;
    cellEl.style.background = "var(--done)";
    cellEl.style.borderColor = "var(--gold)";
    el("find-msg").textContent = "⭕ 正解！よく見つけましたね";
    el("find-score").textContent = findGame.score;
    findGame.index++;
    setTimeout(nextFind, 900);
  } else {
    el("find-msg").textContent = "そこはお仲間です。もういちど！";
  }
}

function finishFind() {
  logActivity("find", "なかまはずれさがし", { score: findGame.score, total: findGame.total });
  showResult("🔍 なかまはずれさがしの結果", `${findGame.score}問クリア ／ ${findGame.total}問`,
    praise(findGame.score / findGame.total), "find-start");
}

/* =========================================================
   6. いろ と ことば（ストループ課題・判断のはやさ）
   ========================================================= */
addScreen("stroop-start", `
  <h2 class="page-title">🎨 いろ と ことば</h2>
  <div class="card">
    <p>画面に色のついた言葉が出ます。<br>
    <strong>書いてある文字ではなく、「文字の色」</strong>を答えてください。</p>
    <p class="note" style="margin-top:8px;">例：<span style="color:#1F7A3D;font-weight:700;">あか</span> と出たら、答えは「みどり」です。</p>
  </div>
  <button class="btn" id="stroop-go">はじめる（全10問）</button>
`);

addScreen("stroop-play", `
  <div class="game-info"><span id="stroop-progress"></span><span>正解：<span id="stroop-score">0</span></span></div>
  <div class="card center">
    <p style="font-size:2.6rem;font-weight:700;margin:16px 0 22px;font-family:'Zen Maru Gothic',sans-serif;" id="stroop-word"></p>
    <div id="stroop-choices"></div>
    <p class="quiz-result-mark" id="stroop-mark" style="min-height:1.6em;"></p>
  </div>
  <button class="btn ghost small" id="stroop-quit">やめてホームに戻る</button>
`);

const STROOP_COLORS = [
  { name: "あか", css: "#D33A2C" }, { name: "あお", css: "#2A62B5" },
  { name: "みどり", css: "#1F7A3D" }, { name: "きいろ", css: "#C99700" },
  { name: "くろ", css: "#2B2B2B" }
];
let stroopGame = null;
on("stroop-go", () => startStroop());
on("stroop-quit", () => showScreen("home"));

function startStroop() {
  stroopGame = { index: 0, total: 10, score: 0, locked: false };
  nextStroop();
  showScreen("stroop-play");
}

function nextStroop() {
  if (stroopGame.index >= stroopGame.total) return finishStroop();
  const word = pick(STROOP_COLORS);
  let ink = pick(STROOP_COLORS);
  while (ink.name === word.name) ink = pick(STROOP_COLORS);
  stroopGame.answer = ink.name;
  stroopGame.locked = false;

  const w = el("stroop-word");
  w.textContent = word.name;
  w.style.color = ink.css;
  el("stroop-progress").textContent = `第${stroopGame.index + 1}問 ／ 全${stroopGame.total}問`;
  el("stroop-score").textContent = stroopGame.score;
  el("stroop-mark").textContent = "";

  const choices = shuffle([ink, ...shuffle(STROOP_COLORS.filter(c => c.name !== ink.name)).slice(0, 2)]);
  const box = el("stroop-choices");
  box.innerHTML = "";
  choices.forEach(c => {
    const b = document.createElement("button");
    b.className = "quiz-choice";
    b.style.textAlign = "center";
    b.textContent = c.name;
    b.addEventListener("click", () => stroopAnswer(c.name, b));
    box.appendChild(b);
  });
}

function stroopAnswer(name, btn) {
  if (stroopGame.locked) return;
  stroopGame.locked = true;
  const mark = el("stroop-mark");
  if (name === stroopGame.answer) {
    stroopGame.score++;
    btn.classList.add("correct");
    mark.textContent = "⭕ 正解！";
    mark.className = "quiz-result-mark ok";
  } else {
    btn.classList.add("wrong");
    mark.textContent = `❌ 正解は「${stroopGame.answer}」`;
    mark.className = "quiz-result-mark ng";
  }
  el("stroop-score").textContent = stroopGame.score;
  stroopGame.index++;
  setTimeout(nextStroop, 1100);
}

function finishStroop() {
  logActivity("stroop", "いろとことば", { score: stroopGame.score, total: stroopGame.total });
  showResult("🎨 いろとことばの結果", `${stroopGame.score}問正解 ／ ${stroopGame.total}問中`,
    praise(stroopGame.score / stroopGame.total), "stroop-start");
}

/* =========================================================
   7. ことば並べかえ（言語力）
   ========================================================= */
addScreen("word-start", `
  <h2 class="page-title">🔤 ことば並べかえ</h2>
  <div class="card"><p>バラバラになった文字を、正しい順にタップして言葉を作ります。<br>
  <span class="note">ヒントも出ます。全8問です。</span></p></div>
  <button class="btn" id="word-go">はじめる</button>
`);

addScreen("word-play", `
  <div class="game-info"><span id="word-progress"></span><span>正解：<span id="word-score">0</span></span></div>
  <div class="card">
    <p class="note" style="margin-bottom:6px;">ヒント</p>
    <p style="font-weight:700;margin-bottom:14px;" id="word-hint"></p>
    <div class="ans-box" id="word-ans">　</div>
    <div class="chip-row" id="word-chips"></div>
    <p class="quiz-result-mark" id="word-mark" style="min-height:1.6em;"></p>
    <button class="btn ghost small" id="word-clear" style="margin-bottom:0;">やりなおす</button>
  </div>
  <button class="btn ghost small" id="word-quit">やめてホームに戻る</button>
`);

const WORD_BANK = [
  { w: "さくらもち", h: "春に食べる、桜の葉でつつんだお菓子" },
  { w: "おしょうがつ", h: "一年のはじめの行事" },
  { w: "せんたくもの", h: "洗って干すもの" },
  { w: "ゆのみぢゃわん", h: "お茶を飲むときの器" },
  { w: "うんどうかい", h: "秋によく開かれる学校の行事" },
  { w: "ざぶとん", h: "座るときに敷くもの" },
  { w: "たんぽぽ", h: "春に黄色い花をつけ、綿毛がとぶ" },
  { w: "ふろしき", h: "물건をつつむ四角い布", hFix: "物をつつむ四角い布" },
  { w: "ひまわり", h: "夏に大きな黄色い花がさく" },
  { w: "おんせん", h: "旅行先でつかる、あたたかいお湯" },
  { w: "かみひこうき", h: "紙を折って飛ばすもの" },
  { w: "しょうゆ", h: "お刺身につける黒い調味料" },
  { w: "こいのぼり", h: "5月にあげる、さかなの形のかざり" },
  { w: "らじおたいそう", h: "朝、みんなでする体操" },
  { w: "つきみだんご", h: "秋の名月に供えるお菓子" },
  { w: "とうだい", h: "海辺で光り、船を導く建物" }
].map(o => ({ w: o.w, h: o.hFix || o.h }));

let wordGame = null;
on("word-go", () => startWord());
on("word-quit", () => showScreen("home"));

function startWord() {
  wordGame = { list: shuffle(WORD_BANK).slice(0, 8), index: 0, score: 0, picked: [], locked: false };
  nextWord();
  showScreen("word-play");
}

function nextWord() {
  if (wordGame.index >= wordGame.list.length) return finishWord();
  const item = wordGame.list[wordGame.index];
  wordGame.current = item;
  wordGame.picked = [];
  wordGame.locked = false;
  el("word-progress").textContent = `第${wordGame.index + 1}問 ／ 全${wordGame.list.length}問`;
  el("word-score").textContent = wordGame.score;
  el("word-hint").textContent = item.h;
  el("word-ans").textContent = "　";
  el("word-mark").textContent = "";
  Voice.speak("ヒント。" + item.h);

  const chars = shuffle([...item.w]);
  const box = el("word-chips");
  box.innerHTML = "";
  chars.forEach(ch => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = ch;
    b.addEventListener("click", () => {
      if (wordGame.locked || b.disabled) return;
      b.disabled = true;
      b.style.opacity = ".35";
      wordGame.picked.push(ch);
      el("word-ans").textContent = wordGame.picked.join("");
      if (wordGame.picked.length === item.w.length) judgeWord();
    });
    box.appendChild(b);
  });
}

function judgeWord() {
  wordGame.locked = true;
  const ok = wordGame.picked.join("") === wordGame.current.w;
  const mark = el("word-mark");
  if (ok) { wordGame.score++; mark.textContent = "⭕ 正解！"; mark.className = "quiz-result-mark ok"; }
  else { mark.textContent = `❌ 正解は「${wordGame.current.w}」`; mark.className = "quiz-result-mark ng"; }
  el("word-score").textContent = wordGame.score;
  Voice.speak(ok ? "正解" : "正解は" + wordGame.current.w);
  wordGame.index++;
  setTimeout(nextWord, ok ? 1000 : 2000);
}

on("word-clear", () => {
  if (!wordGame || wordGame.locked) return;
  wordGame.picked = [];
  el("word-ans").textContent = "　";
  document.querySelectorAll("#word-chips .chip").forEach(c => { c.disabled = false; c.style.opacity = "1"; });
});

function finishWord() {
  logActivity("word", "ことば並べかえ", { score: wordGame.score, total: wordGame.list.length });
  showResult("🔤 ことば並べかえの結果", `${wordGame.score}問正解 ／ ${wordGame.list.length}問中`,
    praise(wordGame.score / wordGame.list.length), "word-start");
}

/* =========================================================
   8. クイズ問題の追加（24問 → 84問）
   ========================================================= */
QUIZ_BANK.push(
  // --- 漢字 ---
  { cat: "漢字", q: "「紅葉」の読みかたは？", choices: ["こうよう", "べにば", "あかば"], answer: 0 },
  { cat: "漢字", q: "「土産」の読みかたは？", choices: ["どさん", "みやげ", "つちさん"], answer: 1 },
  { cat: "漢字", q: "「小豆」の読みかたは？", choices: ["こまめ", "しょうず", "あずき"], answer: 2 },
  { cat: "漢字", q: "「足袋」の読みかたは？", choices: ["たび", "あしぶくろ", "そくたい"], answer: 0 },
  { cat: "漢字", q: "「行灯」の読みかたは？", choices: ["こうとう", "あんどん", "ぎょうとう"], answer: 1 },
  { cat: "漢字", q: "「団扇」の読みかたは？", choices: ["だんせん", "おうぎ", "うちわ"], answer: 2 },
  { cat: "漢字", q: "「五月雨」の読みかたは？", choices: ["さみだれ", "ごがつあめ", "さつきあめ"], answer: 0 },
  { cat: "漢字", q: "「七夕」の読みかたは？", choices: ["しちゆう", "たなばた", "ななゆう"], answer: 1 },
  // --- 日本の地理 ---
  { cat: "地理", q: "日本一大きい湖はどこ？", choices: ["琵琶湖", "霞ヶ浦", "十和田湖"], answer: 0 },
  { cat: "地理", q: "「讃岐うどん」で有名な県は？", choices: ["徳島県", "香川県", "愛媛県"], answer: 1 },
  { cat: "地理", q: "日本一長い川は？", choices: ["利根川", "石狩川", "信濃川"], answer: 2 },
  { cat: "地理", q: "「安芸の宮島」があるのは何県？", choices: ["広島県", "山口県", "島根県"], answer: 0 },
  { cat: "地理", q: "「阿波おどり」で有名な県は？", choices: ["高知県", "徳島県", "和歌山県"], answer: 1 },
  { cat: "地理", q: "北海道の道庁がある市は？", choices: ["旭川市", "函館市", "札幌市"], answer: 2 },
  { cat: "地理", q: "「加賀百万石」といえば今の何県？", choices: ["石川県", "富山県", "福井県"], answer: 0 },
  { cat: "地理", q: "日本で一番南にある県は？", choices: ["鹿児島県", "沖縄県", "宮崎県"], answer: 1 },
  // --- 季節・行事 ---
  { cat: "季節", q: "「立春」はだいたい何月ごろ？", choices: ["2月", "4月", "6月"], answer: 0 },
  { cat: "季節", q: "端午の節句に食べるお菓子は？", choices: ["さくら餅", "かしわ餅", "月見だんご"], answer: 1 },
  { cat: "季節", q: "「土用の丑の日」に食べるものは？", choices: ["さんま", "かに", "うなぎ"], answer: 2 },
  { cat: "季節", q: "節分にまくものは？", choices: ["豆", "米", "塩"], answer: 0 },
  { cat: "季節", q: "お彼岸に供えるお菓子といえば？", choices: ["ようかん", "おはぎ", "きんつば"], answer: 1 },
  { cat: "季節", q: "十五夜に飾る植物は？", choices: ["竹", "松", "すすき"], answer: 2 },
  { cat: "季節", q: "「衣替え」をする月は一般に6月と何月？", choices: ["10月", "8月", "12月"], answer: 0 },
  { cat: "季節", q: "冬至に入るお風呂は？", choices: ["しょうぶ湯", "ゆず湯", "薬草湯"], answer: 1 },
  // --- 歌・芸能（思い出） ---
  { cat: "思い出", q: "童謡「ふるさと」の出だしは「うさぎ追いし◯◯やま」。◯◯は？", choices: ["かの", "この", "あの"], answer: 0 },
  { cat: "思い出", q: "「川の流れのように」を歌ったのは？", choices: ["都はるみ", "美空ひばり", "島倉千代子"], answer: 1 },
  { cat: "思い出", q: "「北国の春」を歌ったのは？", choices: ["春日八郎", "村田英雄", "千昌夫"], answer: 2 },
  { cat: "思い出", q: "昭和45年（1970年）に大阪で開かれたのは？", choices: ["日本万国博覧会", "オリンピック", "国体"], answer: 0 },
  { cat: "思い出", q: "「サザエさん」の作者は？", choices: ["水木しげる", "長谷川町子", "やなせたかし"], answer: 1 },
  { cat: "思い出", q: "初めて開通した新幹線の路線は？", choices: ["山陽新幹線", "東北新幹線", "東海道新幹線"], answer: 2 },
  { cat: "思い出", q: "黒澤明監督の有名な映画といえば？", choices: ["七人の侍", "男はつらいよ", "ゴジラ"], answer: 0 },
  { cat: "思い出", q: "「およげ！たいやきくん」が大流行したのは何年代？", choices: ["昭和30年代", "昭和50年代", "平成10年代"], answer: 1 },
  // --- ことば（追加） ---
  { cat: "ことば", q: "「二階から◯◯」。◯◯に入るのは？", choices: ["目薬", "水", "石"], answer: 0 },
  { cat: "ことば", q: "「346」の反対から読むと？…では「ねこ」の反対から読むと？", choices: ["こね", "この", "ねこ"], answer: 0 },
  { cat: "ことば", q: "「うり二つ」とはどんな意味？", choices: ["よく似ている", "とても安い", "二人で分ける"], answer: 0 },
  { cat: "ことば", q: "「はきものをそろえる」の「はきもの」とは？", choices: ["ぼうし", "くつ", "かばん"], answer: 1 },
  { cat: "ことば", q: "「たで食う虫も◯◯◯」。◯に入るのは？", choices: ["みなちがう", "すきずき", "いそがしい"], answer: 1 },
  { cat: "ことば", q: "「泣きっ面に◯◯」。◯◯に入るのは？", choices: ["あめ", "かぜ", "はち"], answer: 2 },
  { cat: "ことば", q: "「あたたかい」の反対のことばは？", choices: ["すずしい", "つめたい", "さむい"], answer: 2 },
  { cat: "ことば", q: "「一石二鳥」と同じ意味に近いのは？", choices: ["一挙両得", "十人十色", "馬耳東風"], answer: 0 },
  // --- 常識・くらし（追加） ---
  { cat: "常識", q: "救急車を呼ぶときの電話番号は？", choices: ["110番", "119番", "117番"], answer: 1 },
  { cat: "常識", q: "信号の「青」は、進んでよい？とまる？", choices: ["進んでよい", "とまる", "注意してとまる"], answer: 0 },
  { cat: "常識", q: "夏の脱水を防ぐために大切なのは？", choices: ["こまめな水分", "厚着", "がまん"], answer: 0 },
  { cat: "常識", q: "血圧の「上」が高いことを一般に何という？", choices: ["低血圧", "高血圧", "貧血"], answer: 1 },
  { cat: "常識", q: "食後に大切な習慣は？", choices: ["歯みがき", "全力運動", "冷水浴"], answer: 0 },
  { cat: "常識", q: "「敬老の日」は何曜日と決まっている？", choices: ["日曜日", "月曜日", "土曜日"], answer: 1 },
  { cat: "常識", q: "うるう年は何年ごと？", choices: ["2年", "3年", "4年"], answer: 2 },
  { cat: "常識", q: "1リットルは何ミリリットル？", choices: ["100", "1000", "10000"], answer: 1 },
  // --- 計算（追加） ---
  { cat: "計算", q: "1000円で 680円の買いもの。おつりは？", choices: ["320円", "420円", "220円"], answer: 0 },
  { cat: "計算", q: "1日3回、5日分の薬は何回分？", choices: ["12回", "15回", "18回"], answer: 1 },
  { cat: "計算", q: "9 × 7 は いくつ？", choices: ["56", "63", "72"], answer: 1 },
  { cat: "計算", q: "150 － 75 は いくつ？", choices: ["65", "85", "75"], answer: 2 },
  { cat: "計算", q: "1時間30分は何分？", choices: ["90分", "80分", "100分"], answer: 0 },
  { cat: "計算", q: "半分の半分は、もとの何分の一？", choices: ["3分の1", "4分の1", "6分の1"], answer: 1 },
  { cat: "計算", q: "12個のみかんを3人で同じ数ずつ分けると1人何個？", choices: ["3個", "6個", "4個"], answer: 2 },
  { cat: "計算", q: "88 ＋ 12 は いくつ？", choices: ["100", "90", "110"], answer: 0 }
);

/* クイズの出題数を5問→7問に（問題数が増えたため） */
onScreen("quiz-start", () => {
  const p = document.querySelector("#screen-quiz-start .card p");
  if (p) p.innerHTML = "計算・ことば・常識・思い出・漢字・地理・季節の中から<strong>5問</strong>出題します。";
});
