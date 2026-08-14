// Roy's Channel サイト用バックエンド
// - /contact      : お問い合わせフォームの内容をメールで送信(Resend経由)
// - /track        : 動画の再生をカウント(既存・KV)
// - /stats        : 動画再生の集計結果を返す(既存・KV)
// - /track-page    : サイト訪問 / 教材ページ閲覧を日別にD1へ記録(新規)
// - /page-stats    : 訪問数・教材ページ閲覧数の日別集計を返す(新規・D1)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
      from: "Roy's Channel お問い合わせフォーム <onboarding@resend.dev>",
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
