/* =========================================================
   脳いきいき手帳 プラス ─ 合言葉ゲート
   ・買ってくださった方だけが使えるようにする（有料版だけに入れるファイル）
   ・一度合言葉を入れたら、その端末では次から聞かない
   ・合言葉の変え方は「合言葉のかえかた.md」を見ること
   ※ このファイルは js/ の中で「いちばん最初」に読み込むこと
   ========================================================= */
"use strict";

(function () {

  /* ---------------------------------------------------------
     合言葉（ここには合言葉そのものは書かない。計算した値だけを書く）
     いま登録されているのは
       ・ikiiki2026
       ・いきいき2026        ← どちらを入れても開く
     変えたいときは「合言葉ハッシュ.html」で新しい値を作って、この2つの配列を差し替える。
     --------------------------------------------------------- */
  const SHA256_LIST = [
    "cc4210373df777f26b824ab5b050d675e3a14407ac571155b9453462c189d21a",
    "a658d419cb8401b19836bf3fccc2636f7db2a6b1f86df07162451951ddda0206"
  ];
  /* 古い端末で SHA-256 が使えないときの予備 */
  const FNV_LIST = ["eabae4f9", "74a9f287"];

  const UNLOCK_KEY = "nouikiiki:plusUnlocked";

  /* --------------------------------------------------------- */

  function isUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) { return false; }
  }
  function saveUnlocked() {
    try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (e) {}
  }

  /* 入力のゆれを吸収する（全角/半角・大文字小文字・前後や間の空白） */
  function normalize(s) {
    let t = String(s || "");
    if (typeof t.normalize === "function") t = t.normalize("NFKC");
    return t.trim().toLowerCase().replace(/\s+/g, "");
  }

  function fnv1a(str) {
    const bytes = new TextEncoder().encode(str);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  async function sha256Hex(str) {
    if (!(window.crypto && window.crypto.subtle)) return null;
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => ("0" + b.toString(16)).slice(-2)).join("");
  }

  async function isCorrect(input) {
    const word = normalize(input);
    if (!word) return false;
    const hex = await sha256Hex(word);
    if (hex) return SHA256_LIST.indexOf(hex) >= 0;
    return FNV_LIST.indexOf(fnv1a(word)) >= 0;   // 予備
  }

  /* =========================================================
     入力画面（アプリ全体にふたをする）
     ========================================================= */
  function showGate() {
    document.documentElement.style.overflow = "hidden";

    const box = document.createElement("div");
    box.id = "plus-gate";
    box.innerHTML = `
      <div class="pg-inner">
        <img class="kuro" src="kuro.png" width="104" height="91" alt="黒猫のクロ">
        <h1>脳いきいき手帳 プラス</h1>
        <div class="pg-card">
          <p>お買い上げ、ありがとうございます。<br>
             ご案内した<strong>合言葉</strong>を入れてください。</p>
          <input type="text" id="pg-input" autocomplete="off" autocapitalize="off"
                 spellcheck="false" placeholder="ここに合言葉を入れます">
          <button type="button" id="pg-btn">はじめる</button>
          <p class="pg-msg" id="pg-msg" aria-live="polite"></p>
          <p class="pg-note">この端末では、次からは聞きません。</p>
        </div>
        <p class="pg-help">
          合言葉が分からないときは<br>
          <a href="../material/nouikiiki-tebo.html">こちらのご案内</a>をご覧ください。
        </p>
      </div>`;

    const css = document.createElement("style");
    css.textContent = `
      #plus-gate{position:fixed; inset:0; z-index:99999; background:#FAF6EC; overflow-y:auto;
        display:flex; align-items:flex-start; justify-content:center;
        font-family:'Zen Maru Gothic','Hiragino Sans','Noto Sans JP',sans-serif; color:#3A3A3A;}
      #plus-gate .pg-inner{width:100%; max-width:420px; padding:38px 22px 48px; text-align:center;}
      #plus-gate .kuro{display:block; margin:0 auto; height:auto;}
      #plus-gate h1{font-size:1.5rem; margin:10px 0 22px; color:#4F6E56; font-weight:700;}
      #plus-gate .pg-card{background:#fff; border-radius:18px; padding:24px 20px;
        box-shadow:0 3px 12px rgba(0,0,0,.08); text-align:left;}
      #plus-gate p{font-size:1.05rem; line-height:1.8; margin:0 0 14px;}
      #plus-gate input{width:100%; box-sizing:border-box; font-size:1.25rem; padding:14px 12px;
        border:2px solid #4F6E56; border-radius:12px; margin-bottom:14px;
        font-family:inherit; background:#fff; color:#3A3A3A;}
      #plus-gate button{width:100%; font-size:1.2rem; font-weight:700; padding:16px 12px;
        border:none; border-radius:12px; background:#4F6E56; color:#fff; cursor:pointer;
        font-family:inherit; min-height:60px;}
      #plus-gate button:active{background:#3E5744;}
      #plus-gate .pg-msg{margin:14px 0 0; font-size:1.05rem; font-weight:700; color:#C4622D; min-height:1.2em;}
      #plus-gate .pg-msg.ok{color:#4F6E56;}
      #plus-gate .pg-note{margin:12px 0 0; font-size:.9rem; color:#7A7A7A;}
      #plus-gate .pg-help{margin:22px 0 0; font-size:.95rem; color:#6B6B6B; line-height:1.9;}
      #plus-gate .pg-help a{color:#4F6E56;}
    `;

    document.head.appendChild(css);
    document.body.appendChild(box);

    const input = box.querySelector("#pg-input");
    const btn = box.querySelector("#pg-btn");
    const msg = box.querySelector("#pg-msg");

    async function tryOpen() {
      msg.className = "pg-msg";
      if (!normalize(input.value)) {
        msg.textContent = "合言葉を入れてください。";
        return;
      }
      btn.disabled = true;
      const ok = await isCorrect(input.value);
      btn.disabled = false;
      if (ok) {
        saveUnlocked();
        msg.className = "pg-msg ok";
        msg.textContent = "ありがとうございます。はじめましょう！";
        setTimeout(() => {
          box.remove();
          css.remove();
          document.documentElement.style.overflow = "";
        }, 700);
      } else {
        msg.textContent = "合言葉がちがうようです。もう一度お試しください。";
        input.select();
      }
    }

    btn.addEventListener("click", tryOpen);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryOpen(); });
    setTimeout(() => input.focus(), 100);
  }

  if (!isUnlocked()) {
    if (document.body) showGate();
    else document.addEventListener("DOMContentLoaded", showGate);
  }

})();
