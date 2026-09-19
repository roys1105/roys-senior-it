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
//
// 受付組数の上限とキャンセル待ち（2026-09-11 ロイさんの指示）
//   - 上限は区分ごと（olive_limits）。数えるのは olive_applications の行数。
//   - 定員に達したら、フォームからキャンセル待ちに登録できる（olive_waitlist・E-mail必須）。
//     登録すると「キャンセル待ち番号」（例：県内-007）を発行する。
//   - 空きが出たら（申込みの削除・上限の変更）、その区分のキャンセル待ち全員に「空きが出ました」とメールする。
//     本人は番号と登録したE-mailで登録内容を呼び出し、必要なら直して申し込む（早い者勝ち）。
//     申し込んだら、キャンセル待ちの記録は消える。
//   - キャンセル待ちがいる区分は、空きがあっても、フォームからの通常の申込みは受け付けない（キャンセル待ちの方を優先）。
//   - 案内から3日たっても申し込まなかった方は、キャンセル待ちから外す（本人にメール）。見回りは1時間ごと（cron）。
//   - 空きが埋まったら、まだ申し込んでいない方の「案内済み」は取り消し、次の空きのときにあらためて案内する。

// ★事務局の情報の「最初の設定」（西原さん）。管理ページの「事務局の情報」で項目ごとに変えられる
//   （D1の olive_settings。欄を空にして保存すると、その項目はこの値に戻る）。担当の方が替わったら、管理ページで変更する。
//   notify_to：申込み通知メールの届け先（ロイさんへの控えは、管理ページの「CC宛先」）
//   reply_to ：申込者からの返信先。メール末尾と申込みページの連絡先の E-mail にもなる
//              （notify_to とは別に持つ。ロイさんに返信が来ると取り違えが起きるため）
//   person   ：メール末尾の「香川県バウンドテニス協会 事務局　○○」
//   tel・fax ：メール末尾と申込みページの連絡先
const OLIVE_OFFICE_DEFAULTS = {
  notify_to: "nisihara@kagawa-yakult.co.jp",
  reply_to: "nisihara@kagawa-yakult.co.jp",
  person: "西原 敏夫",
  tel: "0875-73-3458",
  fax: "0875-73-3457",
};

// 送信元。Resend で royschannel.com を認証ずみ(2026-09-02)なので、このドメインのアドレスなら送れる。
// 管理ページから変えられるのも、このドメインのアドレスだけにしている
// （認証していないアドレスにすると、申込みメールが1通も届かなくなるため）。
const OLIVE_MAIL_FROM_DEFAULT = "olive-uketsuke@royschannel.com";
const OLIVE_MAIL_FROM_DOMAIN = "@royschannel.com";

// 申込み人数の下限（上限は4名）。ページの「申込み人数」の選択肢と必ず同じにすること。
const OLIVE_PLAYERS_MIN = 1;

// 区分と締切。ページ側の AREA・DEADLINE と必ず同じにすること。
const OLIVE_AREAS = { "香川県内": "2026-10-23", "香川県外": "2026-11-17" };

// 区分ごとの申込みページ（キャンセル待ちの方への案内メールに載せる）と、キャンセル待ち番号の頭につける文字
const OLIVE_PAGES = {
  "香川県内": "https://royschannel.com/olive2-kennai",
  "香川県外": "https://royschannel.com/olive2-kengai",
};
const OLIVE_NUMBER_PREFIX = { "香川県内": "県内", "香川県外": "県外" };

// 空きの案内から、申し込みを待つ時間（3日。ロイさんの指示）
const OLIVE_OFFER_HOURS = 72;

// 協会の連絡先（申込者あてのメールの末尾に載せる）。管理ページの「事務局の情報」の値を使う
function oliveOfficeSignature(office) {
  const telFax = [office.tel ? `TEL ${office.tel}` : "", office.fax ? `FAX ${office.fax}` : ""]
    .filter(Boolean)
    .join(" ／ ");
  return (
    `香川県バウンドテニス協会 事務局${office.person ? "　" + office.person : ""}\n` +
    (telFax ? `${telFax}\n` : ``) +
    `E-mail ${office.reply_to}\n`
  );
}

const OLIVE_COLS =
  "area, applied_date, team_name, manager_no, leader_name, leader_kana, postal_code, address, tel, email, players";

// ---------- キャンセル待ち番号 ----------

// olive_waitlist の行 → 「県内-007」
function oliveWaitNumber(row) {
  return `${OLIVE_NUMBER_PREFIX[row.area] || ""}-${String(row.id).padStart(3, "0")}`;
}

// 「県内-007」「県内７」「県内ー007」なども受け付けて { area, id } にする。合わなければ null
function parseOliveWaitNumber(s) {
  const t = (s || "")
    .toString()
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\-－ー―‐−]/g, "");
  const m = t.match(/^(県内|県外)0*(\d{1,6})$/);
  if (!m) return null;
  return { area: m[1] === "県内" ? "香川県内" : "香川県外", id: parseInt(m[2], 10) };
}

// ---------- 受付組数の上限 ----------

// 区分ごとの状態。vacancy＝上限に対して空きがある、open＝フォームからの通常の申込みを受け付ける
// （キャンセル待ちがいるあいだは、空きがあっても通常の申込みは受け付けない。キャンセル待ちの方を優先するため）
async function getOliveLimitStatus(env, area) {
  const lim = await env.DB.prepare(`SELECT max_teams FROM olive_limits WHERE area = ?`).bind(area).first();
  const max = lim && lim.max_teams > 0 ? lim.max_teams : null;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM olive_applications WHERE area = ?`).bind(area).first();
  const count = row ? row.n : 0;
  const w = await env.DB.prepare(`SELECT COUNT(*) AS n FROM olive_waitlist WHERE area = ?`).bind(area).first();
  const waiting = w ? w.n : 0;
  const vacancy = max == null || count < max;
  return { max, count, waiting, vacancy, open: vacancy && waiting === 0 };
}

// 申込みフォームを開いたときに、その区分が通常の申込みを受け付けているかを返す（キー不要。組数・上限の数は出さない）
// reason: "full"（定員）／"waitlist"（空きはあるが、キャンセル待ちの方にご案内中）
async function handleOliveStatus(request, env) {
  const area = new URL(request.url).searchParams.get("area") || "";
  if (!Object.prototype.hasOwnProperty.call(OLIVE_AREAS, area)) {
    return json({ ok: false, error: "invalid_area" }, 400);
  }
  try {
    const st = await getOliveLimitStatus(env, area);
    return json({ ok: true, open: st.open, reason: st.open ? undefined : st.vacancy ? "waitlist" : "full" });
  } catch (e) {
    // 確かめられないときは受け付ける側に倒す（送信のときに、もう一度確かめる）
    console.error("olive status error", e);
    return json({ ok: true, open: true });
  }
}

// 受付組数の上限（管理者用）
// GET : 区分ごとの { max, count, waiting, vacancy, open } ／ POST {key, area, max} : 設定（max が空なら上限なし）
async function handleOliveLimits(request, env) {
  if (request.method === "GET") {
    if (!(await checkOliveAdmin(request, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const limits = {};
    for (const area of Object.keys(OLIVE_AREAS)) {
      limits[area] = await getOliveLimitStatus(env, area);
    }
    return json({ ok: true, limits });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (!(await checkOliveAdmin(request, env, (body.key || "").toString()))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const area = (body.area || "").toString();
    if (!Object.prototype.hasOwnProperty.call(OLIVE_AREAS, area)) {
      return json({ ok: false, error: "invalid_area" }, 400);
    }
    const raw = body.max == null ? "" : String(body.max).trim();
    try {
      if (raw === "") {
        await env.DB.prepare(`DELETE FROM olive_limits WHERE area = ?`).bind(area).run();
      } else {
        const max = parseInt(raw, 10);
        if (!(Number.isInteger(max) && max >= 1 && max <= 9999) || String(max) !== raw) {
          return json({ ok: false, error: "invalid_max" }, 400);
        }
        await env.DB.prepare(
          `INSERT INTO olive_limits (area, max_teams, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(area) DO UPDATE SET max_teams = excluded.max_teams, updated_at = excluded.updated_at`
        )
          .bind(area, max, new Date().toISOString())
          .run();
      }
    } catch (e) {
      console.error("d1 error (olive_limits)", e);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    // 上限を増やした・なくしたことで空きが出たら、キャンセル待ちの方に案内する（減らして空きが無くなったら案内を取り消す）
    let offered = 0;
    try {
      offered = await syncOliveOffers(env, area);
    } catch (e) {
      console.error("olive offer error (limits)", e);
    }
    return json({ ok: true, offered });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

// ---------- 管理キー・送信元 ----------

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

// 事務局の情報（管理ページで登録した値。登録の無い項目は OLIVE_OFFICE_DEFAULTS）
async function getOliveOffice(env) {
  const office = { ...OLIVE_OFFICE_DEFAULTS };
  try {
    const { results } = await env.DB.prepare(`SELECT key, value FROM olive_settings`).all();
    for (const r of results || []) {
      if (r.value && Object.prototype.hasOwnProperty.call(office, r.key)) office[r.key] = r.value;
    }
  } catch (e) {
    console.error("d1 select error (olive_settings)", e);
  }
  return office;
}

// 申込みページに載せる連絡先（キー不要。TEL・FAX・E-mail だけ返す。担当者名や通知の届け先は出さない）
async function handleOliveContact(env) {
  const o = await getOliveOffice(env);
  return json({ ok: true, tel: o.tel, fax: o.fax, email: o.reply_to });
}

// 事務局の情報の取得・変更（管理者用）
// GET  : { office（いまの値）, defaults（最初の設定） }
// POST : {key, office: {notify_to, reply_to, person, tel, fax}} … 空の項目は、最初の設定に戻す
async function handleOliveOffice(request, env) {
  if (request.method === "GET") {
    if (!(await checkOliveAdmin(request, env))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    return json({ ok: true, office: await getOliveOffice(env), defaults: OLIVE_OFFICE_DEFAULTS });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (!(await checkOliveAdmin(request, env, (body.key || "").toString()))) {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const input = body.office || {};
    const maxLen = { notify_to: 200, reply_to: 200, person: 40, tel: 30, fax: 30 };
    const values = {};
    for (const k of Object.keys(OLIVE_OFFICE_DEFAULTS)) {
      const v = (input[k] == null ? "" : String(input[k])).trim();
      if (v.length > maxLen[k] || /[<>]/.test(v)) {
        return json({ ok: false, error: `invalid_${k}` }, 400);
      }
      if ((k === "notify_to" || k === "reply_to") && v && !isValidEmail(v)) {
        return json({ ok: false, error: `invalid_${k}` }, 400);
      }
      values[k] = v;
    }
    const now = new Date().toISOString();
    try {
      for (const k of Object.keys(values)) {
        if (values[k]) {
          await env.DB.prepare(
            `INSERT INTO olive_settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          )
            .bind(k, values[k], now)
            .run();
        } else {
          await env.DB.prepare(`DELETE FROM olive_settings WHERE key = ?`).bind(k).run();
        }
      }
    } catch (e) {
      console.error("d1 error (olive_settings)", e);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    return json({ ok: true, office: await getOliveOffice(env) });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

// ---------- 日付の書き方 ----------

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

// Date → "2026年10月5日（日）18:00"（日本時間）
function fmtJPDateTime(date) {
  const j = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const wd = "日月火水木金土"[j.getUTCDay()];
  return (
    `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日（${wd}）` +
    `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`
  );
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

// ---------- 申込みの検査・保存 ----------

// 送られてきた申込みを検査して、保存する形（entry。キーは D1 の列名と同じ）にする。問題があれば { error } を返す。
function parseOliveEntry(body) {
  const s = (v, max) => (v || "").toString().trim().slice(0, max);

  const area = s(body.area, 10);
  if (!Object.prototype.hasOwnProperty.call(OLIVE_AREAS, area)) return { error: "invalid_area" };

  const leader = body.leader || {};
  const leaderKana = s(leader.kana, 100);
  const leaderName = s(leader.name, 100);
  const postalCode = s(leader.postalCode, 10); // 任意
  const address = s(leader.address, 300);
  // TELは「－」や「()」を取り除き、全角の数字は半角にして保存する（例：(0875)73-3458 → 0875733458）
  const tel = s(leader.tel, 40)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[-‐‑‒–—―−ー－ｰ()（）]/g, "");
  const email = s(leader.email, 200); // 任意（キャンセル待ちのときは必須。呼び出し側で確かめる）
  const teamName = s(body.teamName, 100);
  const managerNo = parseInt(body.managerNo, 10);
  // 申込み人数（1〜4名）。人数の欄が無かった頃の送信（playerCount なし）は4名として扱う
  const playerCount = body.playerCount == null ? 4 : parseInt(body.playerCount, 10);
  if (!(playerCount >= OLIVE_PLAYERS_MIN && playerCount <= 4)) return { error: "invalid_player_count" };

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

  if (!leaderKana || !leaderName || !address || !tel || !teamName) return { error: "missing_fields" };
  if (tel.replace(/[^0-9]/g, "").length < 9) return { error: "invalid_tel" };
  if (!(managerNo >= 1 && managerNo <= playerCount)) return { error: "invalid_manager" };
  for (const p of players) {
    if (!p.kana || !p.name) return { error: "missing_fields" };
    if (p.sex !== "男" && p.sex !== "女") return { error: "invalid_sex" };
  }

  // 郵便番号は7桁なら 766-0001 の形にそろえる（任意項目なので、それ以外はそのまま）
  const postalDigits = postalCode.replace(/[^0-9]/g, "");
  const postalShown =
    postalDigits.length === 7 ? `${postalDigits.slice(0, 3)}-${postalDigits.slice(3)}` : postalCode;

  return {
    entry: {
      area,
      applied_date: todayJST(),
      team_name: teamName,
      manager_no: managerNo,
      leader_name: leaderName,
      leader_kana: leaderKana,
      postal_code: postalShown,
      address,
      tel,
      email,
      players,
    },
  };
}

// D1 の行（players は JSON の文字列）を entry の形に戻す
function oliveRowToEntry(row) {
  let players = [];
  try {
    players = JSON.parse(row.players || "[]");
  } catch (e) {
    players = [];
  }
  return {
    area: row.area,
    applied_date: row.applied_date || todayJST(),
    team_name: row.team_name,
    manager_no: row.manager_no,
    leader_name: row.leader_name,
    leader_kana: row.leader_kana,
    postal_code: row.postal_code || "",
    address: row.address,
    tel: row.tel,
    email: row.email || "",
    players,
  };
}

// E-mail が入っていて書式も正しいときだけ、返信先の指定と本人あてのメールに使う
function oliveEmailOk(e) {
  return !!e.email && isValidEmail(e.email);
}

function oliveBindValues(e) {
  return [
    e.area,
    e.applied_date,
    e.team_name,
    e.manager_no,
    e.leader_name,
    e.leader_kana,
    e.postal_code,
    e.address,
    e.tel,
    e.email,
    JSON.stringify(e.players),
  ];
}

// table は olive_applications（申込み）か olive_waitlist（キャンセル待ち）
async function insertOliveRow(env, table, e) {
  return env.DB.prepare(
    `INSERT INTO ${table} (created_at, ${OLIVE_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(new Date().toISOString(), ...oliveBindValues(e))
    .run();
}

// 空きがあるときだけ申込みに入れる（数える・入れるを1つのSQLで行うので、2人が同時に押しても定員を超えない）。
// 入れられたら true
async function insertOliveApplicationIfVacant(env, e) {
  const st = await getOliveLimitStatus(env, e.area);
  if (st.max == null) {
    await insertOliveRow(env, "olive_applications", e);
    return true;
  }
  const r = await env.DB.prepare(
    `INSERT INTO olive_applications (created_at, ${OLIVE_COLS})
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM olive_applications WHERE area = ?) < ?`
  )
    .bind(new Date().toISOString(), ...oliveBindValues(e), e.area, st.max)
    .run();
  return !!(r && r.meta && r.meta.changes === 1);
}

// キャンセル待ちの行を、同じ番号（id）のまま元に戻す（申し込めなかったとき用）
async function restoreOliveWait(env, row) {
  await env.DB.prepare(
    `INSERT INTO olive_waitlist (id, created_at, ${OLIVE_COLS}, offered_at, offer_expires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.created_at,
      row.area,
      row.applied_date,
      row.team_name,
      row.manager_no,
      row.leader_name,
      row.leader_kana,
      row.postal_code,
      row.address,
      row.tel,
      row.email,
      row.players,
      row.offered_at || null,
      row.offer_expires || null
    )
    .run();
}

// ---------- メール ----------

// 通知メールと本人あてのメールで共通の、申込み内容のかたまり
function oliveDetailText(e) {
  const line = `────────────────────────────\n`;
  const manager = e.players[e.manager_no - 1] || { name: "" };
  return (
    line +
    `【申込責任者】\n` +
    `フリガナ　　　： ${e.leader_kana}\n` +
    `氏名　　　　　： ${e.leader_name}\n` +
    `郵便番号　　　： ${e.postal_code || "（未入力）"}\n` +
    `住所　　　　　： ${e.address}\n` +
    `TEL又は携帯　 ： ${e.tel}\n` +
    `E-mail　　　　： ${e.email || "（未入力）"}\n` +
    `\n` +
    line +
    `【申込チーム】\n` +
    `チーム名　　　： ${e.team_name}\n` +
    `申込み人数　　： ${e.players.length}名\n` +
    `チーム監督　　： No.${e.manager_no}　${manager.name}\n` +
    `\n` +
    e.players
      .map(
        (p) =>
          ` No.${p.no}　${p.name}（${p.kana}）${p.no === e.manager_no ? "　★チーム監督" : ""}\n` +
          `　　　　性別：${p.sex}　／　所属クラブ名：${p.club || "（未入力）"}\n` +
          `　　　　備考：${p.note || "（記入なし）"}\n`
      )
      .join("\n") +
    line
  );
}

async function getOliveCcList(env) {
  try {
    const { results } = await env.DB.prepare(`SELECT email FROM olive_cc_recipients ORDER BY id ASC`).all();
    return (results || []).map((r) => r.email);
  } catch (e) {
    console.error("d1 select error (olive_cc_recipients)", e);
    return [];
  }
}

// 協会（事務局）あてのメール。CC宛先が原因で拒否されたら、CCを外して1回だけ送り直す。送れたら true
async function sendOliveToOffice(env, subject, text, replyTo) {
  const ccList = await getOliveCcList(env);
  const mailFromAddress = await getOliveMailFrom(env);
  const office = await getOliveOffice(env);
  const mail = {
    from: `第2回オリーブ杯 申込みフォーム <${mailFromAddress}>`,
    to: [office.notify_to],
    reply_to: replyTo || undefined,
    subject,
    text,
  };
  let res = await sendResend(env, { ...mail, cc: ccList.length ? ccList : undefined });
  if (!res.ok && ccList.length) {
    console.error("resend error (olive office, with cc) — retrying without cc", res.status, await res.text());
    res = await sendResend(env, mail);
  }
  if (!res.ok) {
    console.error("resend error (olive office)", res.status, await res.text());
    return false;
  }
  return true;
}

// 申込み本人あてのメール。失敗しても処理は止めない
async function sendOliveToApplicant(env, to, subject, body) {
  try {
    const mailFromAddress = await getOliveMailFrom(env);
    const office = await getOliveOffice(env);
    const text =
      body +
      `\n` +
      `このメールにそのまま返信すると、協会の事務局に届きます。\n` +
      `\n` +
      `──\n` +
      oliveOfficeSignature(office) +
      `\n` +
      `※このメールは、申込みフォームから自動でお送りしています。\n` +
      `※お心当たりがない場合は、お手数ですが破棄してください。\n`;
    const res = await sendResend(env, {
      from: `香川県バウンドテニス協会 事務局 <${mailFromAddress}>`,
      to: [to],
      reply_to: office.reply_to,
      subject,
      text,
    });
    if (!res.ok) {
      console.error("resend error (olive applicant)", res.status, await res.text());
    }
  } catch (err) {
    console.error("applicant mail error (olive)", err);
  }
}

// 協会への申込み内容の通知。送れたら true
// kind: "entry"（申込み）／"waitlist"（キャンセル待ちの登録）／"claimed"（キャンセル待ちの方が番号で申し込んだ）
async function sendOliveNotice(env, e, kind, info) {
  info = info || {};
  const areaLabel = `${e.area}用`;
  const emailOk = oliveEmailOk(e);
  const head = {
    entry: `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）の参加申込みが届きました。\n`,
    waitlist:
      `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）は受付組数の上限に達しているため、\n` +
      `キャンセル待ちとして登録がありました。まだ申込みではありません。\n` +
      `キャンセル待ち番号：${info.number}（${e.area}のキャンセル待ち ${info.position} 組目）\n`,
    claimed:
      `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）で、キャンセル待ちの方が\n` +
      `空きの案内を受けて参加申込みをしました（キャンセル待ち番号：${info.number}）。\n`,
  }[kind];
  const foot = {
    entry: `※申込は先着順です。受付後、参加の可否のお返事をお願いします。\n`,
    waitlist: `※空きが出たら、キャンセル待ちの方全員に自動でメールでご案内します（早い者勝ち）。\n`,
    claimed: `※キャンセル待ちの記録は消えました。参加の可否のお返事をお願いします。\n`,
  }[kind];
  const tag = { entry: "申込み", waitlist: "キャンセル待ち登録", claimed: "キャンセル待ちから申込み" }[kind];

  const text =
    head +
    `\n` +
    `申込日　　　　： ${fmtJPDate(e.applied_date, false)}\n` +
    `締切　　　　　： ${fmtJPDate(OLIVE_AREAS[e.area], true)}\n` +
    `\n` +
    oliveDetailText(e) +
    `\n` +
    (emailOk ? `※このメールにそのまま返信すると、申込責任者ご本人（${e.leader_name} 様）に届きます。\n` : ``) +
    foot;

  return sendOliveToOffice(
    env,
    `【第2回オリーブ杯 ${tag}】${e.team_name}（${e.leader_name} 様／${e.area}）`,
    text,
    emailOk ? e.email : undefined
  );
}

// 申込責任者への控え（E-mail があるときだけ呼ぶ）
// kind: "entry"（申込み）／"waitlist"（キャンセル待ちの登録）／"claimed"（キャンセル待ちから申込み）
async function sendOliveConfirm(env, e, kind, info) {
  info = info || {};
  const areaLabel = `${e.area}用`;
  const intro = {
    entry:
      `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）への\n` +
      `参加申込みをいただき、ありがとうございます。\n` +
      `以下の内容で受け付けました。\n`,
    waitlist:
      `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）は、申込みが定員に達しているため、\n` +
      `以下の内容で「キャンセル待ち」として登録しました。（まだ参加申込みではありません）\n` +
      `\n` +
      `　　キャンセル待ち番号：${info.number}\n` +
      `\n` +
      `この番号は、空きが出たときのお申込みに使います。大切に保管してください。\n`,
    claimed:
      `第2回 オリーブ杯バウンドテニス大会（${areaLabel}）への\n` +
      `キャンセル待ちからの参加申込みをいただき、ありがとうございます。\n` +
      `以下の内容で受け付けました。（キャンセル待ち番号 ${info.number} の登録は、これで終わりです）\n`,
  }[kind];
  const after = {
    entry:
      `申込は先着順で受け付けております。\n` +
      `参加の可否は、あらためてお電話・FAX・E-mail にてお返事いたします。\n`,
    waitlist:
      `取り消しで空きが出た場合は、キャンセル待ちの方全員に、このアドレスあてにメールでご案内します。\n` +
      `ご案内のメールが届いたら、申込みページで「キャンセル待ち番号」と「このE-mail」を入れて呼び出し、\n` +
      `お申込みください。空きの数に限りがあるため、先にお申込みいただいた方から受け付けます。\n`,
    claimed: `参加の可否は、あらためてお電話・FAX・E-mail にてお返事いたします。\n`,
  }[kind];
  const subject = {
    entry: `【第2回オリーブ杯】参加申込みを受け付けました（${e.team_name}）`,
    waitlist: `【第2回オリーブ杯】キャンセル待ちに登録しました（番号 ${info.number}）`,
    claimed: `【第2回オリーブ杯】参加申込みを受け付けました（${e.team_name}）`,
  }[kind];

  const body =
    `${e.leader_name} 様\n` +
    `\n` +
    intro +
    `\n` +
    `申込日　　　　： ${fmtJPDate(e.applied_date, false)}\n` +
    `\n` +
    oliveDetailText(e) +
    `\n` +
    after;
  await sendOliveToApplicant(env, e.email, subject, body);
}

// キャンセル待ちの方への「空きが出ました」の案内
async function sendOliveOffer(env, row, expires) {
  const number = oliveWaitNumber(row);
  const url = `${OLIVE_PAGES[row.area]}?w=${String(row.id).padStart(3, "0")}`;
  const body =
    `${row.leader_name} 様\n` +
    `\n` +
    `第2回 オリーブ杯バウンドテニス大会（${row.area}用）で、取り消しにより空きが出ました。\n` +
    `キャンセル待ちにご登録の方みなさまに、このメールをお送りしています。\n` +
    `空きの数に限りがあるため、先にお申込みいただいた方から受け付けます（早い者勝ち）。\n` +
    `\n` +
    `■ お申込みのしかた\n` +
    `1. 下のページを開きます。\n` +
    `   ${url}\n` +
    `2. 「キャンセル待ち番号」と「ご登録の E-mail」を入れて「呼び出す」を押します。\n` +
    `     キャンセル待ち番号：${number}\n` +
    `     ご登録の E-mail　 ：${row.email}\n` +
    `3. ご登録の内容が表示されます。変更があれば直し、なければそのまま\n` +
    `   「この内容を確認する」→「この内容で申し込む」を押してください。\n` +
    `\n` +
    `■ 期限\n` +
    `${fmtJPDateTime(expires)} までにお申込みください。\n` +
    `期限を過ぎると、キャンセル待ちから外れますので、ご了承ください。\n` +
    `※先にほかの方のお申込みで空きが埋まった場合は、引き続きキャンセル待ちのまま（番号もそのまま）です。\n`;
  await sendOliveToApplicant(env, row.email, `【第2回オリーブ杯】空きが出ました（キャンセル待ち番号 ${number}）`, body);
}

// 期限までに申し込まなかった方への連絡
async function sendOliveExpired(env, row) {
  const number = oliveWaitNumber(row);
  const body =
    `${row.leader_name} 様\n` +
    `\n` +
    `第2回 オリーブ杯バウンドテニス大会（${row.area}用）のキャンセル待ち（番号 ${number}）について、\n` +
    `空きのご案内の期限（${fmtJPDateTime(new Date(row.offer_expires))}）までにお申込みがなかったため、\n` +
    `キャンセル待ちから外れました。\n` +
    `\n` +
    `ご参加を希望される場合は、お手数ですが協会の事務局までご連絡ください。\n`;
  await sendOliveToApplicant(env, row.email, `【第2回オリーブ杯】キャンセル待ちの期限が過ぎました（番号 ${number}）`, body);
}

// ---------- キャンセル待ちの案内・期限切れ ----------

// 案内の期限が過ぎた方をキャンセル待ちから外す（本人と協会に知らせる）。戻り値は外した組数
async function expireOliveOffers(env, area) {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM olive_waitlist WHERE area = ? AND offer_expires IS NOT NULL AND offer_expires < ? ORDER BY id ASC`
  )
    .bind(area, now)
    .all();
  const gone = [];
  for (const row of results || []) {
    const r = await env.DB.prepare(
      `DELETE FROM olive_waitlist WHERE id = ? AND offer_expires IS NOT NULL AND offer_expires < ?`
    )
      .bind(row.id, now)
      .run();
    if (!r || !r.meta || r.meta.changes !== 1) continue;
    gone.push(row);
    await sendOliveExpired(env, row);
  }
  if (gone.length) {
    await sendOliveToOffice(
      env,
      `【第2回オリーブ杯 期限切れ】${area}（キャンセル待ち ${gone.length} 組を外しました）`,
      `第2回 オリーブ杯バウンドテニス大会（${area}用）で、空きのご案内の期限までに申し込まなかった\n` +
        `キャンセル待ちの方を、キャンセル待ちから外しました（ご本人にはメールでお知らせ済み）。\n` +
        `\n` +
        gone.map((r) => `・${oliveWaitNumber(r)}　${r.team_name}（${r.leader_name} 様）`).join("\n") +
        `\n`
    );
  }
  return gone.length;
}

// 期限切れを外したうえで、空きがあれば、まだ案内していないキャンセル待ちの方全員に案内する。
// 空きが無ければ（埋まった・上限を減らした）、案内済みを取り消す（次の空きのときに、あらためて案内する）。
// 戻り値は、新しく案内した組数。呼ぶのは「申込みの削除」「上限の変更」「キャンセル待ちの登録・申込み」「1時間ごとの見回り」。
async function syncOliveOffers(env, area) {
  await expireOliveOffers(env, area);
  const st = await getOliveLimitStatus(env, area);
  if (!st.vacancy) {
    await env.DB.prepare(
      `UPDATE olive_waitlist SET offered_at = NULL, offer_expires = NULL WHERE area = ? AND offered_at IS NOT NULL`
    )
      .bind(area)
      .run();
    return 0;
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM olive_waitlist WHERE area = ? AND offered_at IS NULL ORDER BY id ASC`
  )
    .bind(area)
    .all();
  const rows = results || [];
  if (!rows.length) return 0;

  const now = new Date();
  const expires = new Date(now.getTime() + OLIVE_OFFER_HOURS * 60 * 60 * 1000);
  const sent = [];
  for (const row of rows) {
    const r = await env.DB.prepare(
      `UPDATE olive_waitlist SET offered_at = ?, offer_expires = ? WHERE id = ? AND offered_at IS NULL`
    )
      .bind(now.toISOString(), expires.toISOString(), row.id)
      .run();
    if (!r || !r.meta || r.meta.changes !== 1) continue; // ほかの処理が先に案内した
    sent.push(row);
    await sendOliveOffer(env, row, expires);
  }
  if (sent.length) {
    await sendOliveToOffice(
      env,
      `【第2回オリーブ杯 空きの案内】${area}（キャンセル待ち ${sent.length} 組に案内）`,
      `第2回 オリーブ杯バウンドテニス大会（${area}用）で空きが出たため、\n` +
        `キャンセル待ちの方に「空きが出ました」とメールで案内しました（先に申し込んだ方から受付）。\n` +
        `\n` +
        `空き　　　　　： ${st.max == null ? "上限なし" : st.max - st.count + " 組"}\n` +
        `申込みの期限　： ${fmtJPDateTime(expires)} まで\n` +
        `\n` +
        sent.map((r) => `・${oliveWaitNumber(r)}　${r.team_name}（${r.leader_name} 様）`).join("\n") +
        `\n\n` +
        `※期限までに申し込まなかった方は、キャンセル待ちから外れます（ご本人にメールでお知らせします）。\n`
    );
  }
  return sent.length;
}

async function syncOliveAllAreas(env) {
  let offered = 0;
  for (const area of Object.keys(OLIVE_AREAS)) {
    try {
      offered += await syncOliveOffers(env, area);
    } catch (e) {
      console.error("olive sync error", area, e);
    }
  }
  return offered;
}

// 番号と登録したE-mailの両方が合うキャンセル待ちの行。合わなければ null
async function findOliveWaitByClaim(env, claim) {
  const p = parseOliveWaitNumber(claim && claim.number);
  const email = ((claim && claim.email) || "").toString().trim().toLowerCase();
  if (!p || !email) return null;
  const row = await env.DB.prepare(`SELECT * FROM olive_waitlist WHERE id = ? AND area = ?`).bind(p.id, p.area).first();
  if (!row || (row.email || "").trim().toLowerCase() !== email) return null;
  return row;
}

// キャンセル待ち番号で登録内容を呼び出す（申込みページから。キー不要だが、番号とE-mailの両方が合わないと何も返さない）
// POST {number, email} → { ok, number, area, canApply, offerExpires, entry（canApply のときだけ） }
async function handleOliveClaimLookup(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const p = parseOliveWaitNumber(body.number);
  if (p) {
    try {
      await expireOliveOffers(env, p.area);
    } catch (e) {
      console.error("olive expire error (lookup)", e);
    }
  }
  const row = await findOliveWaitByClaim(env, body);
  if (!row) {
    return json({ ok: false, error: "claim_not_found" }, 400);
  }
  const st = await getOliveLimitStatus(env, row.area);
  const res = {
    ok: true,
    number: oliveWaitNumber(row),
    area: row.area,
    canApply: st.vacancy,
    offerExpires: row.offer_expires || null,
  };
  if (st.vacancy) {
    const e = oliveRowToEntry(row);
    res.entry = {
      leader: {
        kana: e.leader_kana,
        name: e.leader_name,
        postalCode: e.postal_code,
        address: e.address,
        tel: e.tel,
        email: e.email,
      },
      teamName: e.team_name,
      playerCount: e.players.length,
      managerNo: e.manager_no,
      players: e.players,
    };
  }
  return json(res);
}

// 番号で呼び出した内容（直した内容）で申し込む
async function oliveClaimApply(env, e, claim) {
  try {
    await expireOliveOffers(env, e.area);
  } catch (err) {
    console.error("olive expire error (claim)", err);
  }
  const row = await findOliveWaitByClaim(env, claim);
  if (!row) {
    return json({ ok: false, error: "claim_not_found" }, 400);
  }
  if (row.area !== e.area) {
    return json({ ok: false, error: "claim_area" }, 400);
  }
  if (!oliveEmailOk(e)) {
    return json({ ok: false, error: "email_required" }, 400);
  }

  // 先にキャンセル待ちから消してから、空きがあるときだけ申込みに入れる（二重押し・同時の申込みでも定員を超えない）。
  // 入れられなかったら、キャンセル待ちに同じ番号のまま戻す。
  const del = await env.DB.prepare(`DELETE FROM olive_waitlist WHERE id = ?`).bind(row.id).run();
  if (!del || !del.meta || del.meta.changes !== 1) {
    return json({ ok: false, error: "claim_not_found" }, 400);
  }
  let inserted = false;
  try {
    inserted = await insertOliveApplicationIfVacant(env, e);
  } catch (err) {
    console.error("d1 insert error (olive claim)", err);
  }
  if (!inserted) {
    try {
      await restoreOliveWait(env, row);
    } catch (err) {
      console.error("d1 restore error (olive claim)", err, JSON.stringify(row));
    }
    return json({ ok: false, error: "claim_full" }, 409);
  }

  const number = oliveWaitNumber(row);
  await sendOliveNotice(env, e, "claimed", { number });
  await sendOliveConfirm(env, e, "claimed", { number });
  // 空きが埋まったら、ほかの方の案内済みを取り消す
  try {
    await syncOliveOffers(env, e.area);
  } catch (err) {
    console.error("olive sync error (claim)", err);
  }
  return json({ ok: true, claimed: true, number });
}

// ---------- 申込み ----------

async function handleOliveApply(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = parseOliveEntry(body);
  if (parsed.error) {
    return json({ ok: false, error: parsed.error }, 400);
  }
  const e = parsed.entry;

  // キャンセル待ち番号で呼び出して申し込む場合
  if (body.claim) {
    return oliveClaimApply(env, e, body.claim);
  }

  // 通常の申込みを受け付けているか（定員・キャンセル待ちの有無）。フォームを開いたあとに変わった場合のため、送信のときにも確かめる。
  // （確かめられないときは受け付ける。申込みを取りこぼさない側に倒す）
  let st = null;
  try {
    st = await getOliveLimitStatus(env, e.area);
  } catch (err) {
    console.error("olive limit check error", err);
  }

  if (st && !st.open) {
    // 受け付けていないときは、キャンセル待ちの登録として送られてきた場合だけ受け付ける。
    // E-mail は必須（空きが出たときに案内するため）。
    if (!body.waitlist) {
      return json({ ok: false, error: "full", reason: st.vacancy ? "waitlist" : "full" }, 409);
    }
    if (!oliveEmailOk(e)) {
      return json({ ok: false, error: "email_required" }, 400);
    }
    let id = null;
    try {
      const r = await insertOliveRow(env, "olive_waitlist", e);
      id = r && r.meta ? r.meta.last_row_id : null;
    } catch (err) {
      console.error("d1 insert error (olive waitlist)", err);
      return json({ ok: false, error: "save_failed" }, 500);
    }
    const number = oliveWaitNumber({ area: e.area, id });
    let position = 1;
    try {
      const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM olive_waitlist WHERE area = ? AND id <= ?`)
        .bind(e.area, id)
        .first();
      position = r ? r.n : 1;
    } catch (err) {
      console.error("d1 count error (olive waitlist)", err);
    }
    await sendOliveNotice(env, e, "waitlist", { number, position }); // 失敗しても登録は済んでいる
    await sendOliveConfirm(env, e, "waitlist", { number, position });
    // 登録した時点で空きがあれば（ほかの方が申し込まずに空いている等）、すぐに案内する
    try {
      await syncOliveOffers(env, e.area);
    } catch (err) {
      console.error("olive sync error (waitlist)", err);
    }
    return json({ ok: true, waitlisted: true, number, position });
  }

  // 通常の申込み（キャンセル待ちのつもりで送られても、受け付けていれば申込みとして受け付ける）
  if (!(await sendOliveNotice(env, e, "entry"))) {
    return json({ ok: false, error: "send_failed" }, 502);
  }

  // D1へ保存（管理ページの一覧・CSV用）。失敗しても通知メールは届いているので、申込みは成功のまま。
  try {
    await insertOliveRow(env, "olive_applications", e);
  } catch (err) {
    console.error("d1 insert error (olive-apply)", err);
  }

  if (oliveEmailOk(e)) {
    await sendOliveConfirm(env, e, "entry");
  }
  return json({ ok: true });
}

// 申込み一覧（管理者用）。キー不一致は404（存在を悟らせない）
// GET              : 一覧を返す
// DELETE ?ids=1,2  : 指定したIDを削除する。空きが出たら、キャンセル待ちの方に案内する
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
    const offered = await syncOliveAllAreas(env);
    return json({ ok: true, deleted: ids.length, offered });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, created_at, ${OLIVE_COLS} FROM olive_applications ORDER BY id DESC LIMIT 1000`
  ).all();
  return json({ ok: true, results });
}

// キャンセル待ちの一覧（管理者用）
// GET          : 区分ごと・登録順（番号 number と、案内の状態 offered_at・offer_expires 付き）
// DELETE ?id=  : 削除（本人には知らせない）
async function handleOliveWaitlist(request, env) {
  if (!(await checkOliveAdmin(request, env))) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (request.method === "DELETE") {
    // ?ids=1,2,3（管理ページで選択した行をまとめて）か、?id=1（1件）
    const sp = new URL(request.url).searchParams;
    const ids = (sp.get("ids") || sp.get("id") || "")
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) {
      return json({ ok: false, error: "missing_ids" }, 400);
    }
    try {
      await env.DB.prepare(`DELETE FROM olive_waitlist WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .run();
    } catch (e) {
      console.error("d1 delete error (olive_waitlist)", e);
      return json({ ok: false, error: "delete_failed" }, 500);
    }
    return json({ ok: true });
  }

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, created_at, ${OLIVE_COLS}, offered_at, offer_expires FROM olive_waitlist ORDER BY area ASC, id ASC LIMIT 1000`
    ).all();
    return json({
      ok: true,
      results: (results || []).map((r) => ({ ...r, number: oliveWaitNumber(r) })),
    });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}

// ---------- CC宛先・管理キー・送信元（管理者用） ----------

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
    if (url.pathname === "/olive-status" && request.method === "GET") {
      return handleOliveStatus(request, env);
    }
    if (url.pathname === "/olive-limits") {
      return handleOliveLimits(request, env);
    }
    if (url.pathname === "/olive-waitlist") {
      return handleOliveWaitlist(request, env);
    }
    if (url.pathname === "/olive-claim" && request.method === "POST") {
      return handleOliveClaimLookup(request, env);
    }
    if (url.pathname === "/olive-office") {
      return handleOliveOffice(request, env);
    }
    if (url.pathname === "/olive-contact" && request.method === "GET") {
      return handleOliveContact(env);
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

  // 1時間ごとの見回り（wrangler.toml の [triggers]）。
  // オリーブ杯のキャンセル待ちの、空きの案内の期限切れを外し、空きがあれば案内する。
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncOliveAllAreas(env));
  },
};
