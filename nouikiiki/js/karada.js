/* =========================================================
   脳いきいき手帳 v0.2 ─ 「からだ」タブ
   ・いすに座ってできる体操（音声ガイド＋タイマー）
   ・コグニサイズ（運動＋頭の課題＝二重課題）
   ・今日の生活チェック（生活習慣の記録）
   ・いきいき豆知識
   ※ 医療行為ではありません。無理のない範囲で行う前提の案内にとどめています。
   ========================================================= */
"use strict";

/* =========================================================
   1. ハブ画面
   ========================================================= */
addScreen("karada", `
  <h2 class="page-title">💪 からだ と くらし</h2>
  <div class="card" style="padding:14px 16px;">
    <p style="font-size:.95rem;">からだを動かすこと・人と話すこと・よく眠ることは、
    頭の元気ともつながっていると言われています。<br>
    <span class="note">できることを、できる範囲で。休みながらどうぞ。</span></p>
  </div>

  <p class="sec-title">からだを動かす</p>
  <button class="menu-btn accent3" data-go="taiso-select">
    <span class="mi">🪑</span><span><span class="mt">いすに座って いきいき体操</span>
    <span class="ms">声のガイド付き。3〜5分でできます</span></span></button>
  <button class="menu-btn accent" data-go="cogni-select">
    <span class="mi">👣</span><span><span class="mt">コグニサイズ（足ぶみ＋頭の課題）</span>
    <span class="ms">体を動かしながら数える・しりとりをする二重課題</span></span></button>

  <p class="sec-title">きょうの暮らし</p>
  <button class="menu-btn accent2" data-go="habit">
    <span class="mi">✅</span><span><span class="mt">今日の生活チェック</span>
    <span class="ms" id="karada-habit-sub">6つのいきいき習慣を記録する</span></span></button>
  <button class="menu-btn accent2" data-go="mame">
    <span class="mi">📖</span><span><span class="mt">いきいき豆知識</span>
    <span class="ms">脳の健康のために知っておきたいこと</span></span></button>
`);
document.querySelectorAll("#screen-karada [data-go]").forEach(b => {
  b.addEventListener("click", () => showScreen(b.dataset.go));
});
onScreen("karada", () => {
  const n = Object.values(getHabits()).filter(Boolean).length;
  const s = el("karada-habit-sub");
  if (s) s.textContent = n > 0 ? `今日は ${n}／${HABITS.length} こ記録できています` : "6つのいきいき習慣を記録する";
});

/* =========================================================
   2. いすに座ってできる体操
   ========================================================= */
const TAISO_PROGRAMS = [
  {
    id: "asa", name: "朝のめざめ体操", mins: "約3分",
    desc: "起きてすぐ、いすに座ったままできる、やさしい体操です。",
    steps: [
      { t: "背すじをのばして、いすに深く座りましょう。足の裏を床につけます。", s: 15 },
      { t: "鼻から息を吸って、口からゆっくり吐きます。3回くりかえしましょう。", s: 25 },
      { t: "両肩を、耳に近づけるようにゆっくり上げて、ストンと落とします。", s: 25 },
      { t: "首をゆっくり右へ、次に左へ。痛くないところまでで大丈夫です。", s: 25 },
      { t: "両手を前に伸ばして、グー・パーをくりかえします。", s: 25 },
      { t: "かかとを上げ下げします。ふくらはぎを動かしましょう。", s: 25 },
      { t: "最後にもう一度、大きく深呼吸。おつかれさまでした。", s: 20 }
    ]
  },
  {
    id: "kata", name: "肩と首をらくにする体操", mins: "約3分",
    desc: "デスクや読書のあとに。肩まわりをゆるめます。",
    steps: [
      { t: "いすに浅めに座り、背すじをのばします。", s: 15 },
      { t: "右手を左肩にのせ、ひじで大きく円をえがきます。", s: 25 },
      { t: "反対の手にかえて、同じように円をえがきます。", s: 25 },
      { t: "両手を頭の上で組んで、上へぐーっとのばします。", s: 25 },
      { t: "上半身を、ゆっくり右にひねります。ゆっくり戻します。", s: 25 },
      { t: "左にもひねります。息は止めないでくださいね。", s: 25 },
      { t: "肩の力をぬいて、ひと息つきましょう。", s: 20 }
    ]
  },
  {
    id: "ashi", name: "足腰しっかり体操", mins: "約4分",
    desc: "転ばないからだづくり。いすの背をつかんで行っても大丈夫です。",
    steps: [
      { t: "いすに座り、両足を床にしっかりつけます。", s: 15 },
      { t: "右足をまっすぐ前に上げて、5つ数えて下ろします。", s: 30 },
      { t: "左足も同じように、5つ数えて下ろします。", s: 30 },
      { t: "ももを高く上げて、その場で足ぶみを20回。", s: 30 },
      { t: "つま先を上げ下げします。すねの筋肉を動かします。", s: 25 },
      { t: "いすの背につかまり、ゆっくり立って座るを3回。無理はしないでください。", s: 35 },
      { t: "深呼吸して終わりです。よくがんばりました。", s: 20 }
    ]
  },
  {
    id: "kao", name: "お口と顔の体操", mins: "約3分",
    desc: "食べる・話す力を保つ体操。噛む力・飲み込む力は脳とも関わりがあります。",
    steps: [
      { t: "「あ・い・う・え・お」と、口を大きく動かして言いましょう。", s: 25 },
      { t: "ほおをふくらませて、5秒。次にへこませて、5秒。", s: 25 },
      { t: "舌を出して、上・下・右・左へ動かします。", s: 25 },
      { t: "「パ・タ・カ・ラ」を、はっきり10回言いましょう。", s: 30 },
      { t: "首を左右にゆっくり回して、のどをゆるめます。", s: 25 },
      { t: "唾をごくんと飲みこみます。飲み込む練習です。", s: 20 },
      { t: "おつかれさまでした。お水をひと口どうぞ。", s: 20 }
    ]
  }
];

addScreen("taiso-select", `
  <h2 class="page-title">🪑 いきいき体操</h2>
  <div class="card"><p>いすに座ったままできる体操です。声で案内します。<br>
  <span class="note">※痛みがあるとき、体調の悪いときは行わないでください。無理のない範囲で。</span></p></div>
  <div id="taiso-list"></div>
`);
(function renderTaisoList() {
  const box = el("taiso-list");
  TAISO_PROGRAMS.forEach(p => {
    const b = document.createElement("button");
    b.className = "menu-btn accent3";
    b.innerHTML = `<span class="mi">🪑</span><span><span class="mt">${p.name}（${p.mins}）</span>
      <span class="ms">${p.desc}</span></span>`;
    b.addEventListener("click", () => startTaiso(p));
    box.appendChild(b);
  });
})();

addScreen("taiso-play", `
  <div class="game-info"><span id="taiso-name"></span><span id="taiso-step"></span></div>
  <div class="card center">
    <p class="timer-big" id="taiso-timer">0</p>
    <p class="note">秒</p>
    <p style="font-size:1.2rem;font-weight:700;margin:18px 0 6px;line-height:1.6;" id="taiso-text"></p>
  </div>
  <button class="btn gold" id="taiso-pause">⏸ 一時停止</button>
  <button class="btn ghost" id="taiso-next">つぎへ進む ▶</button>
  <button class="btn ghost small" id="taiso-quit">やめる</button>
`);

let taiso = null;
function startTaiso(program) {
  taiso = { program, index: -1, timer: null, remain: 0, paused: false };
  el("taiso-name").textContent = program.name;
  showScreen("taiso-play");
  taisoNext();
}
function taisoNext() {
  if (taiso.timer) clearInterval(taiso.timer);
  taiso.index++;
  if (taiso.index >= taiso.program.steps.length) return finishTaiso();
  const step = taiso.program.steps[taiso.index];
  taiso.remain = step.s;
  el("taiso-step").textContent = `${taiso.index + 1} / ${taiso.program.steps.length}`;
  el("taiso-text").textContent = step.t;
  el("taiso-timer").textContent = taiso.remain;
  Voice.speak(step.t, true);   // 体操は常に読み上げ（手が離せないため）
  taiso.timer = setInterval(() => {
    if (taiso.paused) return;
    taiso.remain--;
    el("taiso-timer").textContent = Math.max(taiso.remain, 0);
    if (taiso.remain <= 0) taisoNext();
  }, 1000);
}
function finishTaiso() {
  if (taiso.timer) clearInterval(taiso.timer);
  logActivity("taiso", "いきいき体操", { program: taiso.program.name });
  Voice.speak("おつかれさまでした", true);
  showResult("🪑 体操おつかれさまでした", taiso.program.name, "体を動かすことは、頭の元気にもつながります。よくがんばりました！", "taiso-select");
}
on("taiso-pause", () => {
  taiso.paused = !taiso.paused;
  el("taiso-pause").textContent = taiso.paused ? "▶ 再開する" : "⏸ 一時停止";
  if (taiso.paused) Voice.stop();
});
on("taiso-next", () => taisoNext());
on("taiso-quit", () => {
  if (taiso && taiso.timer) clearInterval(taiso.timer);
  Voice.stop();
  showScreen("karada");
});

/* =========================================================
   3. コグニサイズ（運動＋頭の課題＝二重課題）
   ========================================================= */
const COGNI_MENU = [
  {
    id: "count3", name: "足ぶみ ＋ 3の倍数で手をたたく",
    desc: "足ぶみをしながら数を数え、3・6・9…のときだけ手をたたきます。",
    guide: "いすに座って（または立って）足ぶみをしながら、画面の数を声に出して数えます。3の倍数のときは、数を言わずに手をたたきましょう。",
    beat: 1400, count: 30, rule: n => n % 3 === 0
  },
  {
    id: "count4", name: "足ぶみ ＋ 4の倍数で手をたたく",
    desc: "少しむずかしい版。4・8・12…で手をたたきます。",
    guide: "足ぶみをしながら数を数えます。4の倍数のときは手をたたきます。慣れてきた方におすすめです。",
    beat: 1300, count: 32, rule: n => n % 4 === 0
  },
  {
    id: "count37", name: "足ぶみ ＋ 3と5の倍数で手をたたく",
    desc: "上級版。3の倍数と5の倍数の両方で手をたたきます。",
    guide: "足ぶみをしながら、3の倍数と5の倍数のときに手をたたきます。まちがえても笑って続けるのがコツです。",
    beat: 1500, count: 30, rule: n => n % 3 === 0 || n % 5 === 0
  }
];

addScreen("cogni-select", `
  <h2 class="page-title">👣 コグニサイズ</h2>
  <div class="card">
    <p><strong>コグニサイズ</strong>は、からだを動かしながら同時に頭を使う「二重課題」の運動です。
    国立長寿医療研究センターが考案し、介護予防教室などで広く行われています。</p>
    <p class="note" style="margin-top:8px;">※「まちがえるくらいの難しさ」がちょうどよいとされています。まちがえても気にせず続けましょう。<br>
    ※立って行う場合は、必ず支えのある場所で。ふらつくときは座って行ってください。</p>
  </div>
  <div id="cogni-list"></div>
`);
(function renderCogniList() {
  const box = el("cogni-list");
  COGNI_MENU.forEach(p => {
    const b = document.createElement("button");
    b.className = "menu-btn accent";
    b.innerHTML = `<span class="mi">👣</span><span><span class="mt">${p.name}</span>
      <span class="ms">${p.desc}</span></span>`;
    b.addEventListener("click", () => openCogni(p));
    box.appendChild(b);
  });
})();

addScreen("cogni-play", `
  <h2 class="page-title" id="cogni-title"></h2>
  <div class="card">
    <p id="cogni-guide" style="font-size:.98rem;"></p>
  </div>
  <div class="card center">
    <p class="timer-big" id="cogni-num" style="font-size:4.2rem;">−</p>
    <p style="font-size:1.6rem;font-weight:700;min-height:2.2rem;" id="cogni-cue"></p>
  </div>
  <button class="btn" id="cogni-start">はじめる</button>
  <button class="btn ghost small" id="cogni-quit">やめる</button>
`);

let cogni = null;
function openCogni(program) {
  cogni = { program, n: 0, timer: null, running: false };
  el("cogni-title").textContent = program.name;
  el("cogni-guide").textContent = program.guide;
  el("cogni-num").textContent = "−";
  el("cogni-cue").textContent = "";
  el("cogni-start").textContent = "はじめる";
  showScreen("cogni-play");
}
on("cogni-start", () => {
  if (!cogni) return;
  if (cogni.running) { stopCogni(false); return; }
  cogni.running = true;
  cogni.n = 0;
  el("cogni-start").textContent = "■ とちゅうでやめる";
  Voice.speak("はじめましょう。足ぶみを始めてください。", true);
  setTimeout(() => {
    cogni.timer = setInterval(cogniTick, cogni.program.beat);
    cogniTick();
  }, 2500);
});
function cogniTick() {
  cogni.n++;
  const p = cogni.program;
  if (cogni.n > p.count) return stopCogni(true);
  const clap = p.rule(cogni.n);
  el("cogni-num").textContent = cogni.n;
  el("cogni-num").style.color = clap ? "var(--coral)" : "var(--main)";
  el("cogni-cue").textContent = clap ? "👏 手をたたく！" : "";
  Voice.speak(clap ? "パン" : String(cogni.n), true);
}
function stopCogni(completed) {
  if (cogni.timer) clearInterval(cogni.timer);
  cogni.running = false;
  Voice.stop();
  el("cogni-start").textContent = "はじめる";
  if (completed) {
    logActivity("cogni", "コグニサイズ", { program: cogni.program.name, count: cogni.program.count });
    showResult("👣 コグニサイズ完了！", cogni.program.name,
      "からだと頭を同時に使えました。週に2〜3回できると理想的です。", "cogni-select");
  }
}
on("cogni-quit", () => { stopCogni(false); showScreen("karada"); });

/* =========================================================
   4. 今日の生活チェック
   ========================================================= */
const HABITS = [
  { id: "move",  icon: "🚶", label: "からだを動かした（散歩・体操など）" },
  { id: "talk",  icon: "💬", label: "人と話した・笑った" },
  { id: "eat",   icon: "🍚", label: "よく噛んで、3食たべた" },
  { id: "sleep", icon: "😴", label: "よく眠れた" },
  { id: "water", icon: "🥤", label: "水分をこまめにとった" },
  { id: "teeth", icon: "🪥", label: "歯みがき・お口の手入れをした" }
];

addScreen("habit", `
  <h2 class="page-title">✅ 今日の生活チェック</h2>
  <div class="card">
    <p style="margin-bottom:4px;">できたものをタップしてください。<br>
    <span class="note">全部そろわなくて大丈夫。記録することに意味があります。</span></p>
    <div class="habit-bar"><i id="habit-bar-fill" style="width:0%"></i></div>
    <p class="center" style="font-weight:700;color:var(--main);" id="habit-count"></p>
  </div>
  <div id="habit-list"></div>
  <div class="card" style="background:#FFF9E8;border:2px solid var(--gold);">
    <p style="font-size:.9rem;">この6つは、脳の健康と関わりが深いと言われている生活習慣です。
    「運動」「人とのつながり」「食事」「睡眠」「口の健康」を、毎日ゆるやかに見なおすためのチェックです。</p>
  </div>
  <button class="btn ghost" id="habit-back">もどる</button>
`);

(function renderHabitList() {
  const box = el("habit-list");
  HABITS.forEach(h => {
    const b = document.createElement("button");
    b.className = "hbtn";
    b.id = "habit-" + h.id;
    b.innerHTML = `<span class="hi">${h.icon}</span><span>${h.label}</span><span class="hcheck">✔</span>`;
    b.addEventListener("click", () => {
      const now = !getHabits()[h.id];
      setHabit(h.id, now);
      refreshHabits();
      if (now) Voice.speak("記録しました");
    });
    box.appendChild(b);
  });
})();

function refreshHabits() {
  const cur = getHabits();
  let n = 0;
  HABITS.forEach(h => {
    const b = el("habit-" + h.id);
    const on = !!cur[h.id];
    if (on) n++;
    if (b) b.classList.toggle("on", on);
  });
  const fill = el("habit-bar-fill");
  if (fill) fill.style.width = Math.round((n / HABITS.length) * 100) + "%";
  const c = el("habit-count");
  if (c) c.textContent = `${n} / ${HABITS.length} こ できました`;
  return n;
}
onScreen("habit", refreshHabits);
on("habit-back", () => showScreen("karada"));

/* =========================================================
   5. いきいき豆知識
   ========================================================= */
const MAME = [
  { t: "🚶 歩くことが、いちばん身近な脳の運動", b: "週に数回、少し早歩きを取り入れた散歩を続けている方は、認知機能の面でよい状態を保ちやすいという報告があります。1日10分の散歩からで十分です。" },
  { t: "💬 人と話すことは「脳の全身運動」", b: "会話は、聞く・考える・思い出す・言葉にする、を同時に行う活動です。人とのつながりが少ない状態は認知症のリスク要因のひとつとされています。週1回でも、誰かと会う予定をつくりましょう。" },
  { t: "👂 聞こえにくさを、そのままにしない", b: "難聴は、中年期以降の認知症リスク要因として国際的な研究（ランセット委員会）で大きく取り上げられています。聞き返しが増えたら、耳鼻科で相談を。補聴器の使用も選択肢です。" },
  { t: "🦷 噛むこと・口の健康を守る", b: "歯の本数が少ない、噛みにくいままにしていると、栄養や会話にも影響します。毎日の歯みがきと、定期的な歯科受診を。" },
  { t: "😴 睡眠は脳のおそうじの時間", b: "眠っている間に、脳は日中にたまった老廃物を片づけていると考えられています。夜7時間前後の睡眠と、朝に日光を浴びることが整えるコツです。" },
  { t: "🩺 血圧・血糖・体重を整える", b: "高血圧・糖尿病・肥満は、いずれも認知症のリスク要因に挙げられています。かかりつけ医とのつきあいを続けることが、脳を守ることにつながります。" },
  { t: "📚 新しいことに、少しだけ挑戦する", b: "同じ脳トレをずっと続けるより、少し新しいこと・少しむずかしいことに触れるほうが刺激になります。歌、手芸、料理、写真、何でもかまいません。" },
  { t: "🍚 いろいろな食品を、バランスよく", b: "魚・野菜・大豆製品・果物を組み合わせた食事がすすめられています。特定の食品だけで予防できるという証拠はありません。「いろいろ食べる」が合言葉です。" },
  { t: "🚭 たばこをやめる・お酒はほどほどに", b: "禁煙は年齢を問わず健康にプラスに働きます。飲酒は量が多いほどリスクが高まるとされています。" },
  { t: "🤝 「気づいたら早めに相談」がいちばん大切", b: "物忘れが増えた、道に迷う、同じ話をくり返す。気になることがあれば、市町村の地域包括支援センターやかかりつけ医に相談してください。早い相談は、その後の暮らしを大きく助けます。" }
];

addScreen("mame", `
  <h2 class="page-title">📖 いきいき豆知識</h2>
  <div class="card" style="background:#FFF9E8;border:2px solid var(--gold);">
    <p style="font-size:.92rem;">脳の健康を保つために、いま世界の研究でよいとされていることをやさしくまとめました。</p>
  </div>
  <div id="mame-list"></div>
  <div class="card">
    <p class="note">このアプリは脳トレ・生活習慣づくりの補助アプリです。病気の診断・治療を目的とするものではありません。
    体調やもの忘れが気になるときは、かかりつけ医や地域包括支援センターにご相談ください。</p>
  </div>
  <button class="btn ghost" id="mame-back">もどる</button>
`);
(function renderMame() {
  const box = el("mame-list");
  MAME.forEach(m => {
    const d = document.createElement("div");
    d.className = "talk-card";
    d.innerHTML = `<h3>${m.t}</h3><p style="font-size:.95rem;">${m.b}</p>`;
    box.appendChild(d);
  });
})();
on("mame-back", () => showScreen("karada"));
