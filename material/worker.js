// Roy's Channel サイト用バックエンド
// - /contact      : お問い合わせフォームの内容をメールで送信(Resend経由)
// - /bt-apply     : バウンドテニス教室の申込みをメールで送信(Resend経由)+ D1保存 + 受付完了メール
// - /bt-applications : バウンドテニス教室の申込み一覧の取得・削除(管理者用・要管理キー)
// - /bt-cc-recipients : 申込み通知メールのCC宛先一覧の取得・追加・削除(管理者用・要管理キー)
// - /bt-admin-key : 管理キーの変更(管理者用・要「現在の」管理キー)
// - /bt-mail-from : 申込みメールの送信元アドレスの取得・変更(管理者用・要管理キー)
// - /olive-apply ほか /olive-* : 第2回オリーブ杯（香川県バウンドテニス協会）の申込み受付と管理（bt-* と同じ形・別テーブル）
// - /track        : 動画の再生をカウント(既存・KV)
// - /stats        : 動画再生の集計結果を返す(既存・KV)
// - /track-page    : サイト訪問 / 教材ページ閲覧を日別にD1へ記録(新規)
// - /page-stats    : 訪問数・教材ページ閲覧数の日別集計を返す(新規・D1)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 日本時間(JST)の "YYYY-MM-DD" を返す
function todayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// お問い合わせフォームの送信元アドレス。
// Resend で royschannel.com を認証ずみ(2026-09-02)なので、独自ドメインで送れる。
// ★2サイト(Roy's Channel / ITシニアなんでも相談室)とも、この1つのアドレスから送る。
//   どちらから来たかは件名と本文で見分ける。
const CONTACT_MAIL_FROM = "otoiawase@royschannel.com";

async function handleContact(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const name = (body.name || "").toString().trim().slice(0, 200);
  const email = (body.email || "").toString().trim().slice(0, 200);
  const message = (body.message || "").toString().trim().slice(0, 5000);

  if (!name || !email || !message) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  if (!isValidEmail(email)) {
    return json({ ok: false, error: "invalid_email" }, 400);
  }

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Roy's Channel お問い合わせフォーム <${CONTACT_MAIL_FROM}>`,
      to: ["roy.s1105@gmail.com"],
      reply_to: email,
      subject: `【HPお問い合わせ】${name} 様より`,
      text: `お名前: ${name}\nメールアドレス: ${email}\n\n${message}`,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("resend error", resendRes.status, errText);
    return json({ ok: false, error: "send_failed" }, 502);
  }

  return json({ ok: true });
}

// ---- バウンドテニス教室 参加申込みフォーム ----
// ページ: dev/site/roys-channel/bt-kyoushitsu.html
//
// ★申込みメールの届け先は、次の1行だけ直せば変えられる。
//   複数の宛先に送りたいときは ["a@example.com", "b@example.com"] のように並べる。
const BT_MAIL_TO = ["roy.s1105@gmail.com"];

// 申込みを受け付ける開催日。ページのチェックボックスと必ず同じにすること。
// （知らない日付が送られてきたら捨てるので、いたずら対策にもなる）
const BT_DATES = ["10月10日(土)", "10月17日(土)", "10月24日(土)", "11月7日(土)"];

const BT_EXPERIENCES = ["初めて", "少し経験あり", "経験者"];

// 管理キー：最初は wrangler secret の ADMIN_KEY を使うが、
// 管理ページから変更すると D1（bt_admin_key テーブル・1行だけ）に上書きされ、
// 以後はそちらが優先される（記号が複雑で覚えにくい、という理由での自己変更に対応）。
async function getEffectiveAdminKey(env) {
  try {
    const row = await env.DB.prepare(`SELECT key_value FROM bt_admin_key WHERE id = 1`).first();
    if (row && row.key_value) return row.key_value;
  } catch (e) {
    console.error("d1 select error (bt_admin_key)", e);
  }
  return env.ADMIN_KEY || "";
}

async function checkAdminKey(key, env) {
  const effective = await getEffectiveAdminKey(env);
  return !!effective && key === effective;
}

// 申込みメールの送信元アドレス：最初は Resend のお試し用アドレス(onboarding@resend.dev)。
// お試し用アドレスは「アカウント本人のメールアドレス以外には送れない」という制限があるため、
// CC機能を実際に使うには、Resendで独自ドメインを認証し、管理ページからそのアドレスに
// 変更する必要がある（変更するとD1のbt_mail_fromに保存され、以後はそちらが使われる）。
const BT_MAIL_FROM_DEFAULT = "onboarding@resend.dev";

async function getMailFromAddress(env) {
  try {
    const row = await env.DB.prepare(`SELECT email FROM bt_mail_from WHERE id = 1`).first();
    if (row && row.email) return row.email;
  } catch (e) {
    console.error("d1 select error (bt_mail_from)", e);
  }
  return BT_MAIL_FROM_DEFAULT;
}

// 生年月日(YYYY-MM-DD)の形式チェック
function isValidBirthdate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  // 未来日・現実的でない古すぎる日付は弾く
  const todayStr = todayJST();
  if (s > todayStr) return false;
  if (s < "1900-01-01") return false;
  return true;
}

// 生年月日から満年齢を計算する（日本時間基準）
function calcAgeJST(birthdate) {
  const todayStr = todayJST(); // "YYYY-MM-DD"
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

async function handleBtApply(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const s = (v, max) => (v || "").toString().trim().slice(0, max);

  const name = s(body.name, 100);
  const kana = s(body.kana, 100);
  const birthdate = s(body.birthdate, 10);
  const tel = s(body.tel, 40);
  const email = s(body.email, 200); // 任意
  const postalCode = s(body.postalCode, 10); // 任意
  const address = s(body.address, 300); // 任意
  const experience = s(body.experience, 40);
  const message = s(body.message, 3000);

  // 参加希望日は、こちらが用意した日付だけを受け取る
  const dates = Array.isArray(body.dates)
    ? body.dates.map((d) => s(d, 40)).filter((d) => BT_DATES.includes(d))
    : [];

  if (!name || !kana || !birthdate || !tel || !experience || !dates.length) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  if (!isValidBirthdate(birthdate)) {
    return json({ ok: false, error: "invalid_birthdate" }, 400);
  }
  // メール・郵便番号は任意項目のため、書式がおかしくても申込み自体は止めない
  // （メールが不正な形式のときは、あとで受付完了メールの送信だけをスキップする）。
  if (tel.replace(/[^0-9]/g, "").length < 9) {
    return json({ ok: false, error: "invalid_tel" }, 400);
  }
  if (!BT_EXPERIENCES.includes(experience)) {
    return json({ ok: false, error: "invalid_experience" }, 400);
  }

  // 申込み受付時点の満年齢（スポーツ保険の加入に使用）
  const age = calcAgeJST(birthdate);

  // 重複を消して、開催日の並び順にそろえる
  const pickedDates = BT_DATES.filter((d) => dates.includes(d));

  // 通知メールのCC宛先（管理者が登録した分・件数の上限なし）
  let ccList = [];
  try {
    const { results } = await env.DB.prepare(`SELECT email FROM bt_cc_recipients ORDER BY id ASC`).all();
    ccList = (results || []).map((r) => r.email);
  } catch (e) {
    console.error("d1 select error (bt_cc_recipients)", e);
  }

  const text =
    `バウンドテニス教室の参加申込みが届きました。\n` +
    `\n` +
    `──────────────────\n` +
    `お名前　　　： ${name}\n` +
    `フリガナ　　： ${kana}\n` +
    `生年月日　　： ${birthdate}（満${age}歳）\n` +
    `電話番号　　： ${tel}\n` +
    `メール　　　： ${email || "（未入力）"}\n` +
    `郵便番号　　： ${postalCode || "（未入力）"}\n` +
    `住所　　　　： ${address || "（未入力）"}\n` +
    `経験　　　　： ${experience}\n` +
    `参加希望日　： ${pickedDates.join(" / ")}\n` +
    `──────────────────\n` +
    `\n` +
    `【質問・ご要望】\n` +
    `${message || "（記入なし）"}\n` +
    `\n` +
    (email ? `※このメールにそのまま返信すると、申込者ご本人に届きます。\n` : ``);

  const mailFromAddress = await getMailFromAddress(env);
  const mailFrom = `バウンドテニス教室 申込みフォーム <${mailFromAddress}>`;

  let resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: BT_MAIL_TO,
      cc: ccList.length ? ccList : undefined,
      reply_to: email || undefined,
      subject: `【バウンドテニス教室 申込み】${name} 様（${pickedDates.join("・")}）`,
      text,
    }),
  });

  // CC宛先が原因で送信自体が失敗することがある(Resendのお試し用アドレスは、
  // アカウント本人以外への送信を許可しないため)。CCが原因の失敗で申込みそのものを
  // 止めてしまうのは避けたいので、CCを外してもう一度だけ送り直す。
  if (!resendRes.ok && ccList.length) {
    const errText = await resendRes.text();
    console.error("resend error (bt-apply, with cc) — retrying without cc", resendRes.status, errText);

    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom,
        to: BT_MAIL_TO,
        reply_to: email || undefined,
        subject: `【バウンドテニス教室 申込み】${name} 様（${pickedDates.join("・")}）`,
        text,
      }),
    });
  }

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("resend error (bt-apply)", resendRes.status, errText);
    return json({ ok: false, error: "send_failed" }, 502);
  }

  // D1へ保存（あとで管理ページから確認できるように）。
  // 失敗してもメール送信自体は成功しているので、申込み自体は失敗にしない。
  try {
    await env.DB.prepare(
      `INSERT INTO bt_applications (created_at, name, kana, birthdate, age, tel, email, postal_code, address, experience, dates, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        new Date().toISOString(),
        name,
        kana,
        birthdate,
        age,
        tel,
        email,
        postalCode,
        address,
        experience,
        pickedDates.join(" / "),
        message
      )
      .run();
  } catch (e) {
    console.error("d1 insert error (bt-apply)", e);
  }

  // 受付完了メール（申込者ご本人あて）。メールアドレスは任意項目なので、
  // 入っている場合だけ送る。失敗しても申込み自体は成功のまま。
  if (email && isValidEmail(email)) {
    try {
      const confirmText =
        `${name} 様\n` +
        `\n` +
        `バウンドテニス教室へのお申込み、ありがとうございます。\n` +
        `以下の内容で受け付けました。\n` +
        `\n` +
        `──────────────────\n` +
        `お名前　　　： ${name}\n` +
        `フリガナ　　： ${kana}\n` +
        `生年月日　　： ${birthdate}（満${age}歳）\n` +
        `電話番号　　： ${tel}\n` +
        (postalCode ? `郵便番号　　： ${postalCode}\n` : ``) +
        (address ? `住所　　　　： ${address}\n` : ``) +
        `経験　　　　： ${experience}\n` +
        `参加希望日　： ${pickedDates.join(" / ")}\n` +
        `──────────────────\n` +
        `\n` +
        `【質問・ご要望】\n` +
        `${message || "（記入なし）"}\n` +
        `\n` +
        `内容を確認のうえ、折り返しご連絡いたします。\n` +
        `当日、お会いできるのを楽しみにしています！\n` +
        `\n` +
        `※このメールに心当たりがない場合は、お手数ですが破棄してください。\n`;

      const confirmRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [email],
          reply_to: BT_MAIL_TO[0],
          subject: `【バウンドテニス教室】お申込みを受け付けました`,
          text: confirmText,
        }),
      });

      if (!confirmRes.ok) {
        const errText = await confirmRes.text();
        console.error("resend error (bt-apply confirm)", confirmRes.status, errText);
      }
    } catch (e) {
      console.error("confirm mail error (bt-apply)", e);
    }
  }

  return json({ ok: true });
}

// バウンドテニス教室の申込み一覧（管理者用）
// 認証: ヘッダー "X-Admin-Key" または ?key= に、現在の管理キーと一致する値が必要。
// 一致しなければ404を返す（存在を悟らせない）。
// GET    ?key=...                  : 一覧を返す
// DELETE ?key=...&ids=1,2,3        : 指定したID（1件でも複数でもよい）を削除する
async function handleBtApplications(request, env) {
  const url = new URL(request.url);
  const key = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";

  if (!(await checkAdminKey(key, env))) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (request.method === "DELETE") {
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (!ids.length) {
      return json({ ok: false, error: "missing_ids" }, 400);
    }

    try {
      const placeholders = ids.map(() => "?").join(",");
      await env.DB.prepare(`DELETE FROM bt_applications WHERE id IN (${placeholders})`)
        .bind(...ids)
        .run();
    } catch (e) {
      console.error("d1 delete error (bt_applications)", e);
      return json({ ok: false, error: "delete_failed" }, 500);
    }

    return json({ ok: true, deleted: ids.length });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, created_at, name, kana, birthdate, age, tel, email, postal_code, address, experience, dates, message
     FROM bt_applications ORDER BY id DESC LIMIT 500`
  ).all();

  return json({ ok: true, results });
}

// バウンドテニス教室の申込み通知メール・CC宛先の管理（管理者用）
// GET    ?key=...            : 一覧を返す
// POST   {key, email}        : 追加する（件数の上限なし）
// DELETE ?key=...&id=...     : 削除する
async function handleBtCcRecipients(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === "GET") {
    const key = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";
    if (!(await checkAdminKey(key, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const { results } = await env.DB.prepare(
      `SELECT id, email, created_at FROM bt_cc_recipients ORDER BY id ASC`
    ).all();
    return json({ ok: true, results });
  }

  if (method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    const key = (body.key || "").toString();
    if (!(await checkAdminKey(key, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const email = (body.email || "").toString().trim().slice(0, 200);
    if (!email || !isValidEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }
    try {
      await env.DB.prepare(
        `INSERT INTO bt_cc_recipients (email, created_at) VALUES (?, ?)
         ON CONFLICT(email) DO NOTHING`
      )
        .bind(email, new Date().toISOString())
        .run();
    } catch (e) {
      console.error("d1 insert error (bt_cc_recipients)", e);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    return json({ ok: true });
  }

  if (method === "DELETE") {
    const key = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";
    if (!(await checkAdminKey(key, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const id = parseInt(url.searchParams.get("id") || "", 10);
    if (!id) {
      return json({ ok: false, error: "missing_id" }, 400);
    }
    try {
      await env.DB.prepare(`DELETE FROM bt_cc_recipients WHERE id = ?`).bind(id).run();
    } catch (e) {
      console.error("d1 delete error (bt_cc_recipients)", e);
      return json({ ok: false, error: "delete_failed" }, 500);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

// 管理キーの変更（管理者用）
// POST {currentKey, newKey} : 現在の管理キーが一致すれば、新しい管理キーに切り替える。
// 以後の認証はすべて新しいキーで行う（D1の bt_admin_key に保存）。
async function handleBtAdminKeyChange(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const currentKey = (body.currentKey || "").toString();
  const newKey = (body.newKey || "").toString().trim();

  if (!(await checkAdminKey(currentKey, env))) {
    return json({ ok: false, error: "not_found" }, 404);
  }
  if (newKey.length < 4 || newKey.length > 100) {
    return json({ ok: false, error: "invalid_new_key" }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO bt_admin_key (id, key_value, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET key_value = excluded.key_value, updated_at = excluded.updated_at`
    )
      .bind(newKey, new Date().toISOString())
      .run();
  } catch (e) {
    console.error("d1 upsert error (bt_admin_key)", e);
    return json({ ok: false, error: "save_failed" }, 500);
  }

  return json({ ok: true });
}

// 申込みメールの送信元アドレスの管理（管理者用）
// GET  ?key=...          : 現在の送信元アドレスを返す
// POST {key, email}      : 送信元アドレスを変更する
async function handleBtMailFrom(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === "GET") {
    const key = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";
    if (!(await checkAdminKey(key, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const email = await getMailFromAddress(env);
    return json({ ok: true, email, isDefault: email === BT_MAIL_FROM_DEFAULT });
  }

  if (method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    const key = (body.key || "").toString();
    if (!(await checkAdminKey(key, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const email = (body.email || "").toString().trim().slice(0, 200);
    if (!email || !isValidEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }
    try {
      await env.DB.prepare(
        `INSERT INTO bt_mail_from (id, email, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`
      )
        .bind(email, new Date().toISOString())
        .run();
    } catch (e) {
      console.error("d1 upsert error (bt_mail_from)", e);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

// ---- 第2回オリーブ杯バウンドテニス大会 参加申込みフォーム（香川県バウンドテニス協会の依頼） ----
// ページ: dev/site/roys-channel/olive2-kennai.html（県内用）・olive2-kengai.html（県外用）
//         管理ページ: olive2-admin.html
// 教室フォーム（bt-*）とは、テーブル・管理キー・CC宛先・送信元をすべて別に持つ。
// 協会の方が管理ページで操作しても、教室のほうに影響しないようにするため。

// ★申込み通知メールの届け先（協会の事務局）。この1行だけ直せば変えられる。
//   ロイさんへの控えは、管理ページの「CC宛先」に登録してある（D1の olive_cc_recipients）。
const OLIVE_MAIL_TO = ["nisihara@kagawa-yakult.co.jp"];

// ★申込者あての受付メールに「返信」したときの行き先（協会の事務局）。
//   OLIVE_MAIL_TO を変えても動かないよう、別に持つ（ロイさんに返信が来ると取り違えが起きるため）。
const OLIVE_REPLY_TO = "nisihara@kagawa-yakult.co.jp";

// 送信元。Resend で royschannel.com を認証ずみ(2026-09-02)なので、このドメインのアドレスなら送れる。
// 管理ページから変えられるのも、このドメインのアドレスだけにしている
// （認証していないアドレスにすると、申込みメールが1通も届かなくなるため）。
const OLIVE_MAIL_FROM_DEFAULT = "olive-uketsuke@royschannel.com";
const OLIVE_MAIL_FROM_DOMAIN = "@royschannel.com";

// 申込み人数の下限（上限は4名）。ページの「申込み人数」の選択肢と必ず同じにすること。
const OLIVE_PLAYERS_MIN = 1;

// 区分と締切。ページ側の AREA・DEADLINE と必ず同じにすること。
const OLIVE_AREAS = { "香川県内": "2026-10-23", "香川県外": "2026-11-17" };

// 協会の連絡先（申込者あての受付メールの末尾に載せる）
const OLIVE_OFFICE_SIGNATURE =
  `香川県バウンドテニス協会 事務局　西原 敏夫\n` +
  `TEL 0875-73-3458 ／ FAX 0875-73-3457\n` +
  `E-mail nisihara@kagawa-yakult.co.jp\n`;

async function getOliveAdminKey(env) {
  try {
    const row = await env.DB.prepare(`SELECT key_value FROM olive_admin_key WHERE id = 1`).first();
    if (row && row.key_value) return row.key_value;
  } catch (e) {
    console.error("d1 select error (olive_admin_key)", e);
  }
  return env.OLIVE_ADMIN_KEY || "";
}

// 管理キーは X-Admin-Key ヘッダーだけで受け取る（URLに載せるとログに平文で残るため）
async function checkOliveAdmin(request, env, keyFromBody) {
  const key = keyFromBody != null ? keyFromBody : request.headers.get("X-Admin-Key") || "";
  const effective = await getOliveAdminKey(env);
  return !!effective && key === effective;
}

async function getOliveMailFrom(env) {
  try {
    const row = await env.DB.prepare(`SELECT email FROM olive_mail_from WHERE id = 1`).first();
    if (row && row.email) return row.email;
  } catch (e) {
    console.error("d1 select error (olive_mail_from)", e);
  }
  return OLIVE_MAIL_FROM_DEFAULT;
}

// "2026-10-23" → "2026年10月23日（金曜日）"
function fmtJPDate(iso, withWeekday) {
  const [y, m, d] = iso.split("-").map(Number);
  let s = `${y}年${m}月${d}日`;
  if (withWeekday) {
    const wd = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    s += `（${wd}曜日）`;
  }
  return s;
}

async function sendResend(env, payload) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function handleOliveApply(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const s = (v, max) => (v || "").toString().trim().slice(0, max);

  const area = s(body.area, 10);
  if (!Object.prototype.hasOwnProperty.call(OLIVE_AREAS, area)) {
    return json({ ok: false, error: "invalid_area" }, 400);
  }
  const deadline = OLIVE_AREAS[area];

  const leader = body.leader || {};
  const leaderKana = s(leader.kana, 100);
  const leaderName = s(leader.name, 100);
  const postalCode = s(leader.postalCode, 10); // 任意
  const address = s(leader.address, 300);
  const tel = s(leader.tel, 40);
  const email = s(leader.email, 200); // 任意
  const teamName = s(body.teamName, 100);
  const managerNo = parseInt(body.managerNo, 10);
  // 申込み人数（1〜4名）。人数の欄が無かった頃の送信（playerCount なし）は4名として扱う
  const playerCount = body.playerCount == null ? 4 : parseInt(body.playerCount, 10);
  if (!(playerCount >= OLIVE_PLAYERS_MIN && playerCount <= 4)) {
    return json({ ok: false, error: "invalid_player_count" }, 400);
  }

  const rawPlayers = Array.isArray(body.players) ? body.players : [];
  const players = [1, 2, 3, 4].slice(0, playerCount).map((n) => {
    const p = rawPlayers.find((x) => x && Number(x.no) === n) || {};
    return {
      no: n,
      kana: s(p.kana, 100),
      name: s(p.name, 100),
      // No.3・No.4 は申込書のとおり「女」で固定（注1：男子の代わりに女子は可、逆は不可）
      sex: n <= 2 ? s(p.sex, 2) : "女",
      club: s(p.club, 100), // 任意
      note: s(p.note, 500), // 任意
    };
  });

  if (!leaderKana || !leaderName || !address || !tel || !teamName) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  if (tel.replace(/[^0-9]/g, "").length < 9) {
    return json({ ok: false, error: "invalid_tel" }, 400);
  }
  if (!(managerNo >= 1 && managerNo <= playerCount)) {
    return json({ ok: false, error: "invalid_manager" }, 400);
  }
  for (const p of players) {
    if (!p.kana || !p.name) return json({ ok: false, error: "missing_fields" }, 400);
    if (p.sex !== "男" && p.sex !== "女") return json({ ok: false, error: "invalid_sex" }, 400);
  }

  // E-mail・郵便番号は任意項目なので、書式がおかしくても申込み自体は止めない。
  // E-mail が不正な形式のときは、返信先の指定と受付メールだけを省く。
  const emailOk = !!email && isValidEmail(email);
  const postalDigits = postalCode.replace(/[^0-9]/g, "");
  const postalShown = postalDigits.length === 7 ? `${postalDigits.slice(0, 3)}-${postalDigits.slice(3)}` : postalCode;
  const appliedDate = todayJST();
  const manager = players[managerNo - 1];
  const areaLabel = `${area}用`;

  // 通知メールと受付メールで共通の、申込み内容のかたまり
  const line = `────────────────────────────\n`;
  const detail =
    line +
    `【申込責任者】\n` +
    `フリガナ　　　： ${leaderKana}\n` +
    `氏名　　　　　： ${leaderName}\n` +
    `郵便番号　　　： ${postalShown || "（未入力）"}\n` +
    `住所　　　　　： ${address}\n` +
    `TEL又は携帯　 ： ${tel}\n` +
    `E-mail　　　　： ${email || "（未入力）"}\n` +
    `\n` +
    line +
    `【申込チーム】\n` +
    `チーム名　　　： ${teamName}\n` +
    `申込み人数　　： ${playerCount}名\n` +
    `チーム監督　　： No.${managerNo}　${manager.name}\n` +
    `\n` +
    players
      .map(
        (p) =>
          ` No.${p.no}　${p.name}（${p.kana}）${p.no === managerNo ? "　★チーム監督" : ""}\n` +
          `　　　　性別：${p.sex}　／　所属クラブ名：${p.club || "（未入力）"}\n` +
          `　　　　備考：${p.note || "（記入なし）"}\n`
      )
      .join("\n") +
    line;

  const text =
    `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）の参加申込みが届きました。\n` +
    `\n` +
    `申込日　　　　： ${fmtJPDate(appliedDate, false)}\n` +
    `締切　　　　　： ${fmtJPDate(deadline, true)}\n` +
    `\n` +
    detail +
    `\n` +
    (emailOk ? `※このメールにそのまま返信すると、申込責任者ご本人（${leaderName} 様）に届きます。\n` : ``) +
    `※申込は先着順です。受付後、参加の可否のお返事をお願いします。\n`;

  const subject = `【第2回オリーブ杯 申込み】${teamName}（${leaderName} 様／${area}）`;

  let ccList = [];
  try {
    const { results } = await env.DB.prepare(`SELECT email FROM olive_cc_recipients ORDER BY id ASC`).all();
    ccList = (results || []).map((r) => r.email);
  } catch (e) {
    console.error("d1 select error (olive_cc_recipients)", e);
  }

  const mailFromAddress = await getOliveMailFrom(env);
  const notice = {
    from: `第2回オリーブ杯 申込みフォーム <${mailFromAddress}>`,
    to: OLIVE_MAIL_TO,
    reply_to: emailOk ? email : undefined,
    subject,
    text,
  };

  let resendRes = await sendResend(env, { ...notice, cc: ccList.length ? ccList : undefined });

  // CC宛先が原因で送信そのものが拒否されたときは、CCを外して1回だけ送り直す（申込みを取りこぼさないため）
  if (!resendRes.ok && ccList.length) {
    const errText = await resendRes.text();
    console.error("resend error (olive-apply, with cc) — retrying without cc", resendRes.status, errText);
    resendRes = await sendResend(env, notice);
  }

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("resend error (olive-apply)", resendRes.status, errText);
    return json({ ok: false, error: "send_failed" }, 502);
  }

  // D1へ保存（管理ページの一覧・CSV用）。失敗しても通知メールは届いているので、申込みは成功のまま。
  try {
    await env.DB.prepare(
      `INSERT INTO olive_applications (created_at, area, applied_date, team_name, manager_no, leader_name, leader_kana, postal_code, address, tel, email, players)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        new Date().toISOString(),
        area,
        appliedDate,
        teamName,
        managerNo,
        leaderName,
        leaderKana,
        postalShown,
        address,
        tel,
        email,
        JSON.stringify(players)
      )
      .run();
  } catch (e) {
    console.error("d1 insert error (olive-apply)", e);
  }

  // 受付メール（申込責任者あて）。E-mail が入っているときだけ。失敗しても申込みは成功のまま。
  if (emailOk) {
    try {
      const confirmText =
        `${leaderName} 様\n` +
        `\n` +
        `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）への\n` +
        `参加申込みをいただき、ありがとうございます。\n` +
        `以下の内容で受け付けました。\n` +
        `\n` +
        `申込日　　　　： ${fmtJPDate(appliedDate, false)}\n` +
        `\n` +
        detail +
        `\n` +
        `申込は先着順で受け付けております。\n` +
        `参加の可否は、あらためてお電話・FAX・E-mail にてお返事いたします。\n` +
        `\n` +
        `このメールにそのまま返信すると、協会の事務局に届きます。\n` +
        `\n` +
        `──\n` +
        OLIVE_OFFICE_SIGNATURE +
        `\n` +
        `※このメールは、申込みフォームから自動でお送りしています。\n` +
        `※お心当たりがない場合は、お手数ですが破棄してください。\n`;

      const confirmRes = await sendResend(env, {
        from: `香川県バウンドテニス協会 事務局 <${mailFromAddress}>`,
        to: [email],
        reply_to: OLIVE_REPLY_TO,
        subject: `【第2回オリーブ杯】参加申込みを受け付けました（${teamName}）`,
        text: confirmText,
      });

      if (!confirmRes.ok) {
        const errText = await confirmRes.text();
        console.error("resend error (olive-apply confirm)", confirmRes.status, errText);
      }
    } catch (e) {
      console.error("confirm mail error (olive-apply)", e);
    }
  }

  return json({ ok: true });
}

// 申込み一覧（管理者用）。キー不一致は404（存在を悟らせない）
// GET              : 一覧を返す
// DELETE ?ids=1,2  : 指定したIDを削除する
async function handleOliveApplications(request, env) {
  if (!(await checkOliveAdmin(request, env))) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) {
      return json({ ok: false, error: "missing_ids" }, 400);
    }
    try {
      await env.DB.prepare(`DELETE FROM olive_applications WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .run();
    } catch (e) {
      console.error("d1 delete error (olive_applications)", e);
      return json({ ok: false, error: "delete_failed" }, 500);
    }
    return json({ ok: true, deleted: ids.length });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, created_at, area, applied_date, team_name, manager_no, leader_name, leader_kana, postal_code, address, tel, email, players
     FROM olive_applications ORDER BY id DESC LIMIT 1000`
  ).all();
  return json({ ok: true, results });
}

// CC宛先の管理（管理者用）
// GET : 一覧 ／ POST {key, email} : 追加 ／ DELETE ?id= : 削除
async function handleOliveCcRecipients(request, env) {
  const method = request.method;

  if (method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (!(await checkOliveAdmin(request, env, (body.key || "").toString()))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const email = (body.email || "").toString().trim().slice(0, 200);
    if (!email || !isValidEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }
    try {
      await env.DB.prepare(
        `INSERT INTO olive_cc_recipients (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`
      )
        .bind(email, new Date().toISOString())
        .run();
    } catch (e) {
      console.error("d1 insert error (olive_cc_recipients)", e);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    return json({ ok: true });
  }

  if (!(await checkOliveAdmin(request, env))) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, email, created_at FROM olive_cc_recipients ORDER BY id ASC`
    ).all();
    return json({ ok: true, results });
  }

  if (method === "DELETE") {
    const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
    if (!id) {
      return json({ ok: false, error: "missing_id" }, 400);
    }
    try {
      await env.DB.prepare(`DELETE FROM olive_cc_recipients WHERE id = ?`).bind(id).run();
    } catch (e) {
      console.error("d1 delete error (olive_cc_recipients)", e);
      return json({ ok: false, error: "delete_failed" }, 500);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

// 管理キーの変更（管理者用）。POST {currentKey, newKey}
async function handleOliveAdminKeyChange(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!(await checkOliveAdmin(request, env, (body.currentKey || "").toString()))) {
    return json({ ok: false, error: "not_found" }, 404);
  }
  const newKey = (body.newKey || "").toString().trim();
  if (newKey.length < 4 || newKey.length > 100) {
    return json({ ok: false, error: "invalid_new_key" }, 400);
  }
  try {
    await env.DB.prepare(
      `INSERT INTO olive_admin_key (id, key_value, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET key_value = excluded.key_value, updated_at = excluded.updated_at`
    )
      .bind(newKey, new Date().toISOString())
      .run();
  } catch (e) {
    console.error("d1 upsert error (olive_admin_key)", e);
    return json({ ok: false, error: "save_failed" }, 500);
  }
  return json({ ok: true });
}

// 送信元アドレスの取得・変更（管理者用）。GET : 現在の値 ／ POST {key, email} : 変更
async function handleOliveMailFrom(request, env) {
  const method = request.method;

  if (method === "GET") {
    if (!(await checkOliveAdmin(request, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const email = await getOliveMailFrom(env);
    return json({ ok: true, email, isDefault: email === OLIVE_MAIL_FROM_DEFAULT });
  }

  if (method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (!(await checkOliveAdmin(request, env, (body.key || "").toString()))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const email = (body.email || "").toString().trim().slice(0, 200);
    if (!email || !isValidEmail(email)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }
    if (!email.toLowerCase().endsWith(OLIVE_MAIL_FROM_DOMAIN)) {
      return json({ ok: false, error: "domain_not_allowed" }, 400);
    }
    try {
      await env.DB.prepare(
        `INSERT INTO olive_mail_from (id, email, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`
      )
        .bind(email, new Date().toISOString())
        .run();
    } catch (e) {
      console.error("d1 upsert error (olive_mail_from)", e);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

async function handleTrack(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }
  const video = (body.video || "unknown").toString().slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, "") || "unknown";

  const totalStr = await env.STATS.get("total");
  const total = (parseInt(totalStr || "0", 10) || 0) + 1;
  await env.STATS.put("total", String(total));

  const vKey = `video:${video}`;
  const vStr = await env.STATS.get(vKey);
  const vTotal = (parseInt(vStr || "0", 10) || 0) + 1;
  await env.STATS.put(vKey, String(vTotal));

  const firstDate = await env.STATS.get("first_date");
  if (!firstDate) {
    await env.STATS.put("first_date", new Date().toISOString().slice(0, 10));
  }

  return json({ ok: true });
}

async function handleStats(env) {
  const totalStr = await env.STATS.get("total");
  const total = parseInt(totalStr || "0", 10) || 0;
  const firstDate = await env.STATS.get("first_date");

  let days = 1;
  if (firstDate) {
    const first = new Date(firstDate + "T00:00:00Z");
    const now = new Date();
    days = Math.max(1, Math.ceil((now - first) / 86400000) + 1);
  }
  const avgPerDay = Math.round((total / days) * 10) / 10;

  return json({ ok: true, total, avgPerDay });
}

// 訪問 / 教材ページ閲覧を日別にD1へ記録
async function handleTrackPage(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }

  const type = (body.type || "").toString();
  if (type !== "visit" && type !== "material") {
    return json({ ok: false, error: "invalid_type" }, 400);
  }

  const page = (body.page || "unknown").toString().slice(0, 200);
  const date = todayJST();

  await env.DB.prepare(
    `INSERT INTO page_events (date, type, page, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(date, type, page) DO UPDATE SET count = count + 1`
  )
    .bind(date, type, page)
    .run();

  // 流入元(?from=...)があれば、type="ref" として別の行に記録する。
  // 例: note の記事末尾のリンクを ?from=note-mimamori-03 にしておくと、
  //     どの記事から来たかが日別で分かる。
  // ページ側の記録(上のINSERT)は今までどおりなので、過去の集計との連続性は保たれる。
  const from = (body.from || "")
    .toString()
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "")   // 想定外の文字は捨てる(半角英数と - _ のみ)
    .slice(0, 64);

  if (from) {
    await env.DB.prepare(
      `INSERT INTO page_events (date, type, page, count)
       VALUES (?, 'ref', ?, 1)
       ON CONFLICT(date, type, page) DO UPDATE SET count = count + 1`
    )
      .bind(date, from)
      .run();
  }

  return json({ ok: true });
}

// 訪問数・教材ページ閲覧数の集計を返す
// - results : 日別の生データ(最新500行まで)。「今日ぶん」を数えるのに使う
// - totals  : 全期間の合計(type,pageごと)。データベース側で合計しているので、
//             results の500行制限に関係なく、古い記録も落ちない
async function handlePageStats(env) {
  const { results } = await env.DB.prepare(
    `SELECT date, type, page, count FROM page_events ORDER BY date DESC LIMIT 500`
  ).all();
  const totals = await env.DB.prepare(
    `SELECT type, page, SUM(count) AS count FROM page_events GROUP BY type, page`
  ).all();
  return json({ ok: true, results, totals: totals.results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (url.pathname === "/contact" && request.method === "POST") {
      return handleContact(request, env);
    }
    if (url.pathname === "/bt-apply" && request.method === "POST") {
      return handleBtApply(request, env);
    }
    if (url.pathname === "/bt-applications" && (request.method === "GET" || request.method === "DELETE")) {
      return handleBtApplications(request, env);
    }
    if (url.pathname === "/bt-cc-recipients") {
      return handleBtCcRecipients(request, env);
    }
    if (url.pathname === "/bt-admin-key" && request.method === "POST") {
      return handleBtAdminKeyChange(request, env);
    }
    if (url.pathname === "/bt-mail-from") {
      return handleBtMailFrom(request, env);
    }
    if (url.pathname === "/olive-apply" && request.method === "POST") {
      return handleOliveApply(request, env);
    }
    if (url.pathname === "/olive-applications" && (request.method === "GET" || request.method === "DELETE")) {
      return handleOliveApplications(request, env);
    }
    if (url.pathname === "/olive-cc-recipients") {
      return handleOliveCcRecipients(request, env);
    }
    if (url.pathname === "/olive-admin-key" && request.method === "POST") {
      return handleOliveAdminKeyChange(request, env);
    }
    if (url.pathname === "/olive-mail-from") {
      return handleOliveMailFrom(request, env);
    }
    if (url.pathname === "/track" && request.method === "POST") {
      return handleTrack(request, env);
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      return handleStats(env);
    }
    if (url.pathname === "/track-page" && request.method === "POST") {
      return handleTrackPage(request, env);
    }
    if (url.pathname === "/page-stats" && request.method === "GET") {
      return handlePageStats(env);
    }
    return json({ ok: false, error: "not_found" }, 404);
  },
};
