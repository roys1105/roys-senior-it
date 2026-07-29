/* =========================================================
   脳いきいき手帳 v0.2 ─ 「みんな」タブ
   ・家族と共有（既存機能へ）
   ・思い出ばなし（回想法）… 会話のきっかけカード
   ・みんなでレク（大画面モード）… 施設の集団レクで使う進行画面
   ========================================================= */
"use strict";

addScreen("minna", `
  <h2 class="page-title" style="color:var(--coral);">👪 みんなと</h2>
  <div class="card" style="padding:14px 16px;">
    <p style="font-size:.95rem;">人と話すこと・思い出を語ることは、脳にとって大きな刺激になります。<br>
    <span class="note">介護施設・デイサービスのレクリエーションにもお使いいただけます。</span></p>
  </div>

  <button class="menu-btn accent2" data-go="family">
    <span class="mi">👨‍👩‍👧</span><span><span class="mt">家族と共有する</span>
    <span class="ms">合言葉でつながり、おたがいの様子を見る</span></span></button>
  <button class="menu-btn accent" data-go="omoide">
    <span class="mi">🍵</span><span><span class="mt">思い出ばなし（回想法）</span>
    <span class="ms">昔のことを語り合う、会話のきっかけカード</span></span></button>
  <button class="menu-btn accent3" data-go="rec-select">
    <span class="mi">📣</span><span><span class="mt">みんなでレク（大画面）</span>
    <span class="ms">大きな文字で出題。集団レクの進行にどうぞ</span></span></button>
`);
document.querySelectorAll("#screen-minna [data-go]").forEach(b => {
  b.addEventListener("click", () => showScreen(b.dataset.go));
});

/* =========================================================
   1. 思い出ばなし（回想法）
   ========================================================= */
const OMOIDE_THEMES = [
  { icon: "🏫", title: "学校のころ", qs: [
    "通っていた学校まで、どうやって通いましたか？（歩き・自転車・電車）",
    "いちばん好きだった科目、苦手だった科目は？",
    "給食やお弁当で、覚えているおかずはありますか？",
    "運動会や学芸会の思い出を聞かせてください。",
    "仲のよかった友だちの名前を覚えていますか？"] },
  { icon: "🪁", title: "子どものころの遊び", qs: [
    "外ではどんな遊びをしましたか？（めんこ・ビー玉・缶けり）",
    "お正月にはどんな遊びをしましたか？",
    "近所に、よく遊びに行った場所はありますか？",
    "駄菓子屋さんで買ったお菓子は覚えていますか？",
    "きょうだいとよくケンカしましたか？"] },
  { icon: "🍚", title: "食べもの・台所", qs: [
    "お母さんの得意料理は何でしたか？",
    "ごちそうといえば、どんな料理でしたか？",
    "季節ごとに作った漬けもの・保存食はありますか？",
    "はじめて食べておどろいた食べものは？",
    "今いちばん食べたいものは何ですか？"] },
  { icon: "💼", title: "仕事のこと", qs: [
    "はじめてのお給料で、何を買いましたか？",
    "どんなお仕事をされていましたか？",
    "仕事で一番うれしかったこと、大変だったことは？",
    "職場の仲間との思い出はありますか？",
    "今の若い人に伝えたいことはありますか？"] },
  { icon: "💒", title: "結婚・家族", qs: [
    "ご家族との出会いはどんなふうでしたか？",
    "結婚式のことで覚えていることは？",
    "子育てでいちばん大変だったことは？",
    "家族でよく行った場所はどこですか？",
    "お孫さんの話を聞かせてください。"] },
  { icon: "🚃", title: "旅行・お出かけ", qs: [
    "旅行で行って、よかった場所はどこですか？",
    "はじめて乗った新幹線や飛行機のことを覚えていますか？",
    "修学旅行はどこへ行きましたか？",
    "温泉の思い出はありますか？",
    "もう一度行ってみたい場所は？"] },
  { icon: "📻", title: "昭和のくらし", qs: [
    "はじめて家に来た電化製品は何でしたか？（テレビ・洗濯機・冷蔵庫）",
    "白黒テレビでよく見た番組は？",
    "ラジオでよく聞いた番組や歌はありますか？",
    "お風呂やトイレは、今とどう違いましたか？",
    "町の様子で、今といちばん違うところは？"] },
  { icon: "🎌", title: "季節と行事", qs: [
    "お正月はどんなふうに過ごしましたか？",
    "お盆の行事で覚えていることは？",
    "近所のお祭りはどんなお祭りでしたか？",
    "雪や台風で大変だった年はありますか？",
    "季節の中で、いちばん好きなのはいつですか？"] }
];

addScreen("omoide", `
  <h2 class="page-title">🍵 思い出ばなし</h2>
  <div class="card">
    <p>昔のことを思い出して語り合うことを「回想法」といい、介護の現場で広く行われています。</p>
    <p class="note" style="margin-top:8px;">正解を求めない・否定しない・急かさない。うなずきながら聞くだけで十分です。
    思い出したくない話題は、そっと別のテーマに移りましょう。</p>
  </div>
  <p class="sec-title">テーマを選んでください</p>
  <div id="omoide-list"></div>
`);
(function renderOmoideList() {
  const box = el("omoide-list");
  OMOIDE_THEMES.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "menu-btn accent";
    b.innerHTML = `<span class="mi">${t.icon}</span><span><span class="mt">${t.title}</span>
      <span class="ms">${t.qs.length}つの話のタネ</span></span>`;
    b.addEventListener("click", () => openOmoide(i));
    box.appendChild(b);
  });
})();

addScreen("omoide-talk", `
  <h2 class="page-title" id="om-title"></h2>
  <div class="card center">
    <p class="note" id="om-progress" style="margin-bottom:10px;"></p>
    <p style="font-size:1.3rem;font-weight:700;line-height:1.7;" id="om-q"></p>
  </div>
  <button class="btn gold" id="om-next">つぎの話のタネ ▶</button>
  <button class="btn ghost" id="om-speak">🔊 読み上げる</button>
  <button class="btn ghost small" id="om-done">おしまい（記録する）</button>
`);

let omoide = null;
function openOmoide(i) {
  omoide = { theme: OMOIDE_THEMES[i], index: 0 };
  el("om-title").textContent = omoide.theme.icon + " " + omoide.theme.title;
  renderOmoideQ();
  showScreen("omoide-talk");
}
function renderOmoideQ() {
  const t = omoide.theme;
  el("om-progress").textContent = `${omoide.index + 1} / ${t.qs.length}`;
  el("om-q").textContent = t.qs[omoide.index];
  Voice.speak(t.qs[omoide.index]);
}
on("om-next", () => {
  omoide.index = (omoide.index + 1) % omoide.theme.qs.length;
  renderOmoideQ();
});
on("om-speak", () => Voice.speak(omoide.theme.qs[omoide.index], true));
on("om-done", () => {
  logActivity("omoide", "思い出ばなし", { theme: omoide.theme.title });
  showResult("🍵 思い出ばなし", omoide.theme.title, "お話しできたことが、いちばんの脳トレです。", "omoide");
});

/* =========================================================
   2. みんなでレク（大画面・集団向け）
   ========================================================= */
addScreen("rec-select", `
  <h2 class="page-title">📣 みんなでレク</h2>
  <div class="card">
    <p>大きな文字で1問ずつ出題します。テレビやモニターにつないで、みんなで答えるレクにお使いください。</p>
    <p class="note" style="margin-top:8px;">進行役の方が「つぎへ」を押して進めます。答えは押すまで出ません。</p>
  </div>
  <button class="btn" data-rec="mix">全部から出題（20問）</button>
  <button class="btn" data-rec="思い出">思い出クイズ（昭和）</button>
  <button class="btn" data-rec="ことば">ことわざ・ことば</button>
  <button class="btn" data-rec="地理">日本の地理</button>
  <button class="btn" data-rec="季節">季節と行事</button>
  <button class="btn" data-rec="漢字">むずかしい漢字の読み</button>
  <button class="btn ghost small" id="rec-big-toggle">🖥 大画面モード：切りかえ</button>
`);

addScreen("rec-play", `
  <div class="game-info"><span id="rec-progress"></span><span id="rec-cat"></span></div>
  <div class="card">
    <p class="big-q" id="rec-q"></p>
    <div id="rec-choices"></div>
    <p class="quiz-result-mark" id="rec-answer" style="min-height:2rem;font-size:1.4rem;"></p>
  </div>
  <button class="btn gold" id="rec-show">答えを見る 👀</button>
  <button class="btn" id="rec-next">つぎの問題 ▶</button>
  <button class="btn ghost" id="rec-speak">🔊 もう一度読み上げる</button>
  <button class="btn ghost small" id="rec-quit">おしまい</button>
`);

let rec = null;
document.querySelectorAll("#screen-rec-select [data-rec]").forEach(b => {
  b.addEventListener("click", () => startRec(b.dataset.rec));
});
on("rec-big-toggle", () => {
  storage.set("bigMode", storage.get("bigMode") !== true);
  applyBigMode();
  alert(storage.get("bigMode") ? "大画面モードにしました（文字が大きくなります）" : "ふつうの表示に戻しました");
});

function startRec(cat) {
  const pool = cat === "mix" ? QUIZ_BANK : QUIZ_BANK.filter(q => q.cat === cat);
  const list = shuffle(pool).slice(0, cat === "mix" ? 20 : 12);
  rec = { list, index: 0, cat };
  renderRec();
  showScreen("rec-play");
}
function renderRec() {
  const q = rec.list[rec.index];
  el("rec-progress").textContent = `第${rec.index + 1}問 ／ 全${rec.list.length}問`;
  el("rec-cat").textContent = q.cat;
  el("rec-q").textContent = q.q;
  el("rec-answer").textContent = "";
  const box = el("rec-choices");
  box.innerHTML = "";
  q.choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "quiz-choice";
    b.textContent = `${i + 1}. ${c}`;
    b.addEventListener("click", () => showRecAnswer());
    box.appendChild(b);
  });
  Voice.speak(q.q + "。" + q.choices.map((c, i) => `${i + 1}、${c}`).join("。"), true);
}
function showRecAnswer() {
  const q = rec.list[rec.index];
  document.querySelectorAll("#rec-choices .quiz-choice").forEach((b, i) => {
    if (i === q.answer) b.classList.add("correct");
  });
  const a = el("rec-answer");
  a.textContent = `⭕ 答えは「${q.choices[q.answer]}」`;
  a.className = "quiz-result-mark ok";
  Voice.speak("答えは、" + q.choices[q.answer], true);
}
on("rec-show", showRecAnswer);
on("rec-speak", () => {
  const q = rec.list[rec.index];
  Voice.speak(q.q + "。" + q.choices.map((c, i) => `${i + 1}、${c}`).join("。"), true);
});
on("rec-next", () => {
  rec.index++;
  if (rec.index >= rec.list.length) {
    logActivity("rec", "みんなでレク", { cat: rec.cat, total: rec.list.length });
    showResult("📣 みんなでレク おしまい", `${rec.list.length}問できました`,
      "みなさん、おつかれさまでした！", "rec-select");
    return;
  }
  renderRec();
});
on("rec-quit", () => {
  logActivity("rec", "みんなでレク", { cat: rec.cat, total: rec.index });
  showScreen("minna");
});

/* 家族画面から「みんな」に戻れるようにする */
onScreen("family", () => {
  if (document.getElementById("family-back-minna")) return;
  const b = document.createElement("button");
  b.className = "btn ghost small";
  b.id = "family-back-minna";
  b.textContent = "◀ みんなメニューに戻る";
  b.addEventListener("click", () => showScreen("minna"));
  document.getElementById("screen-family").appendChild(b);
});
