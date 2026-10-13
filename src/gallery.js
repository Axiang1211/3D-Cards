/**
 * Public gallery, accounts and votes (Cloudflare D1 + KV).
 *
 * Signed-in users (Google, same sign-in as cloud sync) can submit their own
 * cards to the public gallery. The site owner reviews them; approved cards are
 * shown to everyone with the author's public name, likes and date. Signed-in
 * users can like or dislike other people's cards.
 *
 *   GET    /api/me                     who am I { uid, name, admin }          (signed in)
 *   POST   /api/me                     { name } set my public name            (signed in)
 *   GET    /api/public?sort=hot|top|new list of approved cards
 *   GET    /api/public/mine            my submissions with their status       (signed in)
 *   POST   /api/public                 { card, cardId, source } submit for review (signed in)
 *                                      source: "original" (own picture) | "repost" (shared, taken down on request)
 *   GET    /api/public/:id             one card (approved, or yours / admin)
 *   GET    /api/public/:id/bg|fg       its pictures
 *   POST   /api/public/:id/vote        { value: 1 | -1 | 0 }                  (signed in)
 *   POST   /api/public/:id/report      { reason, note } report someone else's card (signed in)
 *                                      REPORT_HIDE different people → hidden until reviewed again
 *   DELETE /api/public/:id             take it down (author or admin)
 *   GET    /api/admin/public?status=pending|approved|rejected|reported        (admin)
 *   POST   /api/admin/public/:id       { action: approve | reject | remove, note } (admin)
 *                                      approve also clears the card's reports (= keep it)
 *
 * Signing in: requests carry "Authorization: Bearer <Google access token>";
 * the token is checked with Google once and remembered for 10 minutes.
 * Admins: the Google e-mail addresses in the Worker variable ADMIN_EMAILS
 * (comma separated), set in the Cloudflare dashboard.
 *
 * Storage: D1 database bound as DB (created automatically on deploy) for
 * users, cards and votes; pictures in the SHARES KV namespace (pub:<id>:bg|fg).
 */

const PUB_ID = /^[A-Za-z0-9]{12}$/;
const MAX_PENDING = 10; // per user, waiting for review at the same time
const REPORT_HIDE = 3; // reports from different people that take a card off the gallery until reviewed
const REPORT_REASONS = ["sexual", "violence", "hate", "copyright", "spam", "other"];

let schemaReady = null;
function ready(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS users (sub TEXT PRIMARY KEY, uid TEXT, email TEXT, name TEXT, created_at INTEGER)"
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS public_cards (id TEXT PRIMARY KEY, owner_sub TEXT, owner_uid TEXT, owner_name TEXT, card_id TEXT, " +
          "title TEXT, subtitle TEXT, card_json TEXT, has_fg INTEGER, status TEXT, note TEXT, " +
          "created_at INTEGER, reviewed_at INTEGER, likes INTEGER DEFAULT 0, dislikes INTEGER DEFAULT 0)"
      ),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS public_cards_status ON public_cards (status, reviewed_at)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS public_cards_owner ON public_cards (owner_sub)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS votes (card TEXT, sub TEXT, value INTEGER, at INTEGER, PRIMARY KEY (card, sub))"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS reports (card TEXT, sub TEXT, reason TEXT, note TEXT, at INTEGER, PRIMARY KEY (card, sub))"),
    ])
      // Added later: "original" (the author's own picture) or "repost" (someone else's, shared).
      // Fails harmlessly when the column is already there.
      .then(() => env.DB.prepare("ALTER TABLE public_cards ADD COLUMN source TEXT").run().catch(() => {}))
      .catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export async function galleryApi(request, env, url, h) {
  const { json } = h;
  if (!env.DB || !env.SHARES) return json({ error: "這個網站沒有開啟公開展廳。" }, 501);
  await ready(env);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/me") {
    const me = await whoami(request, env, h);
    if (!me) return json({ error: "請先用 Google 登入。", code: "signin" }, 401);
    if (method === "GET") return json(publicMe(me));
    if (method === "POST") {
      const body = await readJson(request);
      const name = cleanName(body && body.name);
      if (!name) return json({ error: "名稱要 1 到 24 個字。" }, 400);
      await env.DB.prepare("UPDATE users SET name = ? WHERE sub = ?").bind(name, me.sub).run();
      me.name = name;
      return json(publicMe(me));
    }
  }

  if (path === "/api/public" && method === "GET") return list(request, env, url, h);
  if (path === "/api/public" && method === "POST") return submit(request, env, h);
  if (path === "/api/public/mine" && method === "GET") {
    const me = await whoami(request, env, h);
    if (!me) return json({ error: "請先用 Google 登入。", code: "signin" }, 401);
    const rows = await env.DB.prepare(
      "SELECT id, card_id, title, status, note, created_at, reviewed_at, likes, dislikes FROM public_cards WHERE owner_sub = ? AND status != 'removed' ORDER BY created_at DESC"
    )
      .bind(me.sub)
      .all();
    return json({ items: rows.results || [] });
  }

  let m = path.match(/^\/api\/public\/([A-Za-z0-9]+)(?:\/(bg|fg|vote|report))?$/);
  if (m && PUB_ID.test(m[1])) {
    const id = m[1];
    if (m[2] === "bg" || m[2] === "fg") return picture(env, id, m[2]);
    if (m[2] === "vote" && method === "POST") return vote(request, env, id, h);
    if (m[2] === "report" && method === "POST") return report(request, env, id, h);
    if (!m[2] && method === "GET") return one(request, env, id, h);
    if (!m[2] && method === "DELETE") return takeDown(request, env, id, h, false);
  }

  if (path === "/api/admin/public" && method === "GET") {
    const me = await whoami(request, env, h);
    if (!me || !me.admin) return json({ error: "只有管理員可以使用。" }, 403);
    const status = ["pending", "approved", "rejected", "reported"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "pending";
    const rows = await env.DB.prepare(
      "SELECT p.*, u.email AS owner_email, (SELECT COUNT(*) FROM reports r WHERE r.card = p.id) AS report_count FROM public_cards p LEFT JOIN users u ON u.sub = p.owner_sub " +
        (status === "reported"
          ? "WHERE p.status IN ('pending','approved') AND EXISTS (SELECT 1 FROM reports r WHERE r.card = p.id) ORDER BY report_count DESC, p.created_at DESC LIMIT 200"
          : "WHERE p.status = ? ORDER BY p.created_at DESC LIMIT 200")
    );
    const results = ((status === "reported" ? await rows.all() : await rows.bind(status).all()).results || []);
    // The reasons people gave, for the cards in this list.
    const why = {};
    const ids = results.filter((r) => r.report_count).map((r) => r.id);
    if (ids.length) {
      const rep = await env.DB.prepare(`SELECT card, reason, note FROM reports WHERE card IN (${ids.map(() => "?").join(",")}) ORDER BY at DESC`)
        .bind(...ids)
        .all();
      (rep.results || []).forEach((x) => (why[x.card] = why[x.card] || []).push({ reason: x.reason, note: x.note || "" }));
    }
    return json({
      items: results.map((r) =>
        Object.assign(item(r), { ownerEmail: r.owner_email || "", status: r.status, note: r.note || "", createdAt: r.created_at, reports: why[r.id] || [] })
      ),
    });
  }
  m = path.match(/^\/api\/admin\/public\/([A-Za-z0-9]+)$/);
  if (m && PUB_ID.test(m[1]) && method === "POST") {
    const me = await whoami(request, env, h);
    if (!me || !me.admin) return json({ error: "只有管理員可以使用。" }, 403);
    const body = await readJson(request);
    const action = body && body.action;
    const note = String((body && body.note) || "").slice(0, 200);
    if (action === "approve") {
      // Approving (again) means the card stays: its reports are dealt with.
      await env.DB.batch([
        env.DB.prepare("UPDATE public_cards SET status = 'approved', reviewed_at = COALESCE(NULLIF(reviewed_at, 0), ?), note = ? WHERE id = ?").bind(Date.now(), note, m[1]),
        env.DB.prepare("DELETE FROM reports WHERE card = ?").bind(m[1]),
      ]);
      return json({ ok: true });
    }
    if (action === "reject") {
      await env.DB.prepare("UPDATE public_cards SET status = 'rejected', reviewed_at = ?, note = ? WHERE id = ?").bind(Date.now(), note, m[1]).run();
      return json({ ok: true });
    }
    if (action === "remove") return takeDown(request, env, m[1], h, true);
    return json({ error: "不支援這個操作。" }, 400);
  }

  return json({ error: "找不到這個網址。" }, 404);
}

/* ------------------------------------------------------------------ */
/* Who is calling                                                      */
/* ------------------------------------------------------------------ */
async function whoami(request, env, h) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token.length < 20 || token.length > 4096) return null;
  const key = "auth:" + (await h.sha256(token));
  let info = await env.SHARES.get(key, { type: "json" });
  // Local testing only (wrangler dev with AUTH_TEST in .dev.vars): "test:<id>:<email>" stands in for Google.
  const host = new URL(request.url).hostname;
  if (!info && env.AUTH_TEST === "local-only" && (host === "localhost" || host === "127.0.0.1") && token.startsWith("test:")) {
    const [, sub, email] = token.split(":");
    info = { sub: "test-" + sub, email: String(email || "").toLowerCase() };
  }
  if (!info) {
    let res;
    try {
      res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: "Bearer " + token } });
    } catch (e) {
      return null;
    }
    if (!res.ok) return null;
    const u = await res.json().catch(() => ({}));
    if (!u.sub) return null;
    info = { sub: String(u.sub), email: String(u.email || "").toLowerCase() };
    await env.SHARES.put(key, JSON.stringify(info), { expirationTtl: 600 });
  }
  const uid = (await h.sha256("3dcards-user:" + info.sub)).slice(0, 8);
  let row = await env.DB.prepare("SELECT name FROM users WHERE sub = ?").bind(info.sub).first();
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO users (sub, uid, email, name, created_at) VALUES (?, ?, ?, '', ?)")
      .bind(info.sub, uid, info.email, Date.now())
      .run();
    row = { name: "" };
  }
  const admins = String(env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  return { sub: info.sub, email: info.email, uid, name: row.name || "", admin: !!info.email && admins.includes(info.email) };
}

const publicMe = (me) => ({ uid: me.uid, name: me.name, admin: me.admin });

function cleanName(v) {
  const s = String(v || "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length >= 1 && s.length <= 24 ? s : "";
}

async function readJson(request) {
  try {
    const text = await request.text();
    if (text.length > 12 * 1024 * 1024) return null;
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */
function item(r) {
  let card = {};
  try {
    card = JSON.parse(r.card_json || "{}");
  } catch (e) {}
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    author: r.owner_name,
    authorUid: r.owner_uid,
    source: r.source === "repost" ? "repost" : "original",
    likes: r.likes || 0,
    dislikes: r.dislikes || 0,
    date: r.reviewed_at || r.created_at,
    card: Object.assign(card, {
      image: `/api/public/${r.id}/bg`,
      fg: r.has_fg ? `/api/public/${r.id}/fg` : "",
    }),
  };
}

// Recommended: net likes, weighed down by age (hours), so new good cards rise.
const hot = (r, now) => (r.likes - r.dislikes + 1) / Math.pow((now - (r.reviewed_at || r.created_at)) / 3600000 + 2, 1.3);

async function list(request, env, url, h) {
  const sort = ["hot", "top", "new"].includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "hot";
  const rows = (await env.DB.prepare("SELECT * FROM public_cards WHERE status = 'approved' ORDER BY reviewed_at DESC LIMIT 500").all()).results || [];
  const now = Date.now();
  if (sort === "top") rows.sort((a, b) => b.likes - b.dislikes - (a.likes - a.dislikes) || b.likes - a.likes || b.reviewed_at - a.reviewed_at);
  if (sort === "hot") rows.sort((a, b) => hot(b, now) - hot(a, now));
  const me = await whoami(request, env, h);
  let mine = {};
  if (me && rows.length) {
    const votes = await env.DB.prepare("SELECT card, value FROM votes WHERE sub = ?").bind(me.sub).all();
    (votes.results || []).forEach((v) => (mine[v.card] = v.value));
  }
  return h.json({ sort, items: rows.map((r) => Object.assign(item(r), { myVote: mine[r.id] || 0, mine: !!me && r.owner_sub === me.sub })) }, 200, { "Cache-Control": "no-store" });
}

async function one(request, env, id, h) {
  const r = await env.DB.prepare("SELECT * FROM public_cards WHERE id = ?").bind(id).first();
  const me = await whoami(request, env, h);
  const visible = r && (r.status === "approved" || (me && (me.admin || me.sub === r.owner_sub)) ) && r.status !== "removed";
  if (!visible) return h.json({ error: "找不到這張公開的卡片，可能已經下架。" }, 404);
  let myVote = 0;
  if (me) {
    const v = await env.DB.prepare("SELECT value FROM votes WHERE card = ? AND sub = ?").bind(id, me.sub).first();
    myVote = v ? v.value : 0;
  }
  return h.json(Object.assign(item(r), { status: r.status, myVote, mine: !!me && r.owner_sub === me.sub }));
}

async function picture(env, id, which) {
  const { value, metadata } = await env.SHARES.getWithMetadata(`pub:${id}:${which}`, { type: "arrayBuffer", cacheTtl: 3600 });
  if (!value) return new Response("Not found", { status: 404 });
  return new Response(value, {
    // CORS: the apps load these from another origin, and CSS masks need it.
    headers: { "Content-Type": (metadata && metadata.type) || "image/webp", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" },
  });
}

async function submit(request, env, h) {
  const me = await whoami(request, env, h);
  if (!me) return h.json({ error: "請先用 Google 登入。", code: "signin" }, 401);
  if (!me.name) return h.json({ error: "請先設定公開名稱。", code: "name" }, 400);
  const body = await readJson(request);
  if (!body) return h.json({ error: "卡片太大了，請換小一點的照片。" }, 413);
  const checked = h.cleanCard(body.card);
  if (checked.error) return h.json({ error: checked.error }, checked.status || 400);
  const card = checked.card;
  const cardId = String(body.cardId || "").slice(0, 40);
  // Older apps only had the "my own picture" box.
  const source = body.source === undefined ? "original" : body.source;
  if (source !== "original" && source !== "repost") return h.json({ error: "請選擇這張卡片是原創還是轉載。" }, 400);

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM public_cards WHERE owner_sub = ? AND status = 'pending'").bind(me.sub).first();
  if (pending && pending.n >= MAX_PENDING) return h.json({ error: `你已經有 ${MAX_PENDING} 張卡片在等待審核，請等審核後再送出。` }, 429);
  if (cardId) {
    // The same card again: replace the earlier submission.
    const old = await env.DB.prepare("SELECT id FROM public_cards WHERE owner_sub = ? AND card_id = ? AND status IN ('pending','rejected')").bind(me.sub, cardId).first();
    if (old) await removeCard(env, old.id);
  }

  const id = h.randomId(12);
  const put = async (which, dataUrl) => {
    const m = h.IMAGE_RE.exec(dataUrl || "");
    if (!m) return false;
    const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    await env.SHARES.put(`pub:${id}:${which}`, bytes, { metadata: { type: m[1] } });
    return true;
  };
  await put("bg", card.image);
  const hasFg = card.fg ? await put("fg", card.fg) : false;
  const settings = Object.assign({}, card);
  delete settings.image;
  delete settings.fg;
  await env.DB.prepare(
    "INSERT INTO public_cards (id, owner_sub, owner_uid, owner_name, card_id, title, subtitle, card_json, has_fg, source, status, note, created_at, reviewed_at, likes, dislikes) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, 0, 0, 0)"
  )
    .bind(id, me.sub, me.uid, me.name, cardId, card.title, card.subtitle, JSON.stringify(settings), hasFg ? 1 : 0, source, Date.now())
    .run();
  return h.json({ id, status: "pending" }, 201);
}

async function vote(request, env, id, h) {
  const me = await whoami(request, env, h);
  if (!me) return h.json({ error: "請先用 Google 登入。", code: "signin" }, 401);
  const r = await env.DB.prepare("SELECT owner_sub, status FROM public_cards WHERE id = ?").bind(id).first();
  if (!r || r.status !== "approved") return h.json({ error: "找不到這張公開的卡片，可能已經下架。" }, 404);
  if (r.owner_sub === me.sub) return h.json({ error: "不能替自己的卡片投票。" }, 400);
  const body = await readJson(request);
  const value = body && (body.value === 1 || body.value === -1) ? body.value : 0;
  const stmts = [
    value
      ? env.DB.prepare("INSERT INTO votes (card, sub, value, at) VALUES (?, ?, ?, ?) ON CONFLICT (card, sub) DO UPDATE SET value = excluded.value, at = excluded.at").bind(id, me.sub, value, Date.now())
      : env.DB.prepare("DELETE FROM votes WHERE card = ? AND sub = ?").bind(id, me.sub),
    env.DB.prepare(
      "UPDATE public_cards SET likes = (SELECT COUNT(*) FROM votes WHERE card = ?1 AND value = 1), dislikes = (SELECT COUNT(*) FROM votes WHERE card = ?1 AND value = -1) WHERE id = ?1"
    ).bind(id),
  ];
  await env.DB.batch(stmts);
  const c = await env.DB.prepare("SELECT likes, dislikes FROM public_cards WHERE id = ?").bind(id).first();
  return h.json({ likes: c.likes, dislikes: c.dislikes, myVote: value });
}

async function report(request, env, id, h) {
  const me = await whoami(request, env, h);
  if (!me) return h.json({ error: "請先用 Google 登入。", code: "signin" }, 401);
  const r = await env.DB.prepare("SELECT owner_sub, status FROM public_cards WHERE id = ?").bind(id).first();
  if (!r || r.status !== "approved") return h.json({ error: "找不到這張公開的卡片，可能已經下架。" }, 404);
  if (r.owner_sub === me.sub) return h.json({ error: "不能檢舉自己的卡片。" }, 400);
  const body = await readJson(request);
  const reason = body && REPORT_REASONS.includes(body.reason) ? body.reason : "";
  if (!reason) return h.json({ error: "請選擇檢舉的原因。" }, 400);
  const note = String((body && body.note) || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 300);
  // One report per person per card; reporting again updates it.
  await env.DB.prepare(
    "INSERT INTO reports (card, sub, reason, note, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (card, sub) DO UPDATE SET reason = excluded.reason, note = excluded.note, at = excluded.at"
  )
    .bind(id, me.sub, reason, note, Date.now())
    .run();
  const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE card = ?").bind(id).first()).n;
  let hidden = false;
  if (n >= REPORT_HIDE) {
    // Off the gallery until the site owner looks at it again (it shows under 被檢舉).
    await env.DB.prepare("UPDATE public_cards SET status = 'pending', note = ? WHERE id = ? AND status = 'approved'").bind(`被 ${n} 人檢舉，暫時下架等待重新審核`, id).run();
    hidden = true;
  }
  return h.json({ ok: true, hidden });
}

async function takeDown(request, env, id, h, asAdmin) {
  const me = await whoami(request, env, h);
  if (!me) return h.json({ error: "請先用 Google 登入。", code: "signin" }, 401);
  const r = await env.DB.prepare("SELECT owner_sub FROM public_cards WHERE id = ?").bind(id).first();
  if (!r) return h.json({ ok: true });
  if (!(me.admin || (!asAdmin && r.owner_sub === me.sub))) return h.json({ error: "沒有權限下架這張卡片。" }, 403);
  await removeCard(env, id);
  return h.json({ ok: true });
}

async function removeCard(env, id) {
  await env.DB.batch([
    env.DB.prepare("UPDATE public_cards SET status = 'removed' WHERE id = ?").bind(id),
    env.DB.prepare("DELETE FROM votes WHERE card = ?").bind(id),
    env.DB.prepare("DELETE FROM reports WHERE card = ?").bind(id),
  ]);
  await Promise.all([env.SHARES.delete(`pub:${id}:bg`), env.SHARES.delete(`pub:${id}:fg`)]);
}
