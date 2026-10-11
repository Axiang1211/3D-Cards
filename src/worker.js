/**
 * 3D Cards — Cloudflare Worker
 *
 * Serves the static site from ./public and adds the share API:
 *
 *   POST   /api/shares             upload a card, returns { id, url, deleteToken }
 *   GET    /api/shares/:id         the card as JSON
 *   GET    /api/shares/:id/image   the card's photo (used for link previews)
 *   DELETE /api/shares/:id         remove a share (Authorization: Bearer <deleteToken or ADMIN_TOKEN>)
 *
 * Shared cards expire after SHARE_DAYS days: KV deletes them on its own.
 *
 *   GET    /s/:id                  the share page (index.html with link-preview tags)
 *
 * Storage: the KV namespace bound as SHARES (created automatically on first deploy).
 * Optional secret ADMIN_TOKEN lets the site owner delete any share.
 */

const SHARE_DAYS = 14; // shared cards are deleted automatically after this many days
const MAX_BODY = 12 * 1024 * 1024; // request size limit
const MAX_IMAGES = 8 * 1024 * 1024; // decoded photo + foreground
const ID_RE = /^[A-Za-z0-9]{8,12}$/;
const IMAGE_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const FOILS = ["rainbow", "stardust", "prism", "metal", "gloss"];
const AREAS = ["full", "art", "frame"];
const FRAMES = ["none", "white", "black", "silver", "gold"];
const FG_FOILS = ["none", "rainbow", "stardust", "prism", "metal"];

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(self), gyroscope=(self), magnetometer=(self), camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com; " +
    "frame-src https://accounts.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; " +
    "connect-src 'self' data: blob: https://cdn.jsdelivr.net https://accounts.google.com https://www.googleapis.com https://openidconnect.googleapis.com https://oauth2.googleapis.com; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) return await api(request, env, url);
      if (path === "/" || path === "/index.html") return await page(request, env, url, null);
      const m = path.match(/^\/s\/([A-Za-z0-9]+)\/?$/);
      if (m) return await page(request, env, url, m[1]);
    } catch (err) {
      console.error(err);
      if (path.startsWith("/api/")) return json({ error: "伺服器發生錯誤，請稍後再試。" }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */
async function api(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env.SHARES && !url.pathname.startsWith("/api/google/")) return json({ error: "這個網站沒有開啟分享功能。" }, 501);

  if (url.pathname.startsWith("/api/google/") && request.method === "POST") return google(request, env, url.pathname.slice(12));
  if (url.pathname === "/api/shares" && request.method === "POST") return createShare(request, env, url);

  const m = url.pathname.match(/^\/api\/shares\/([A-Za-z0-9]+)(\/image)?$/);
  if (!m || !ID_RE.test(m[1])) return json({ error: "找不到這個網址。" }, 404);
  const id = m[1];

  if (request.method === "GET" && m[2]) return shareImage(env, id);
  if (request.method === "GET") return getShare(env, id);
  if (request.method === "DELETE") return deleteShare(request, env, id);
  return json({ error: "不支援這個操作。" }, 405);
}

async function createShare(request, env, url) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return json({ error: "卡片太大了，請換小一點的照片。" }, 413);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "卡片太大了，請換小一點的照片。" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "資料格式不正確。" }, 400);
  }

  const c = body && body.card;
  if (!c || typeof c !== "object") return json({ error: "資料格式不正確。" }, 400);

  const img = IMAGE_RE.exec(c.image || "");
  if (!img) return json({ error: "缺少照片，或照片格式不是 JPG、PNG、WebP。" }, 400);
  let size = b64size(img[2]);
  let fg = "";
  if (c.fg) {
    const f = IMAGE_RE.exec(c.fg);
    if (!f) return json({ error: "前景圖的格式不正確。" }, 400);
    size += b64size(f[2]);
    fg = c.fg;
  }
  if (size > MAX_IMAGES) return json({ error: "卡片太大了，請換小一點的照片。" }, 413);

  const card = {
    title: str(c.title, 40),
    subtitle: str(c.subtitle, 60),
    serial: str(c.serial, 16),
    foil: pick(c.foil, FOILS, "rainbow"),
    area: pick(c.area, AREAS, "full"),
    frame: pick(c.frame, FRAMES, "white"),
    zoom: num(c.zoom, 1, 1, 4),
    posX: num(c.posX, 50, 0, 100),
    posY: num(c.posY, 50, 0, 100),
    bgBlur: num(c.bgBlur, 0, 0, 100),
    foilStrength: num(c.foilStrength, 100, 0, 200),
    foilScale: num(c.foilScale, 100, 50, 200),
    foilHue: num(c.foilHue, 0, 0, 360),
    fgZoom: num(c.fgZoom, 1, 0.5, 3),
    fgX: num(c.fgX, 0, -50, 50),
    fgY: num(c.fgY, 0, -50, 50),
    fgFoil: pick(c.fgFoil, FG_FOILS, "none"),
    fgFoilStrength: num(c.fgFoilStrength, 100, 0, 200),
    fgFoilHue: num(c.fgFoilHue, 0, 0, 360),
    sand: c.sand === true,
    sandColor: /^#[0-9a-fA-F]{6}$/.test(c.sandColor || "") ? String(c.sandColor).toLowerCase() : "#ffd26e",
    showText: c.showText !== false,
    image: c.image,
    fg,
  };

  let id = "";
  for (let i = 0; i < 5 && !id; i++) {
    const candidate = randomId(8);
    if (!(await env.SHARES.get("s:" + candidate, { type: "stream" }))) id = candidate;
  }
  if (!id) return json({ error: "伺服器忙碌中，請稍後再試。" }, 503);

  const deleteToken = randomId(32);
  const ttl = SHARE_DAYS * 24 * 60 * 60;
  const createdAt = Date.now();
  const expiresAt = createdAt + ttl * 1000;
  const record = { v: 1, createdAt, expiresAt, tokenHash: await sha256(deleteToken), card };
  await env.SHARES.put("s:" + id, JSON.stringify(record), {
    expirationTtl: ttl,
    metadata: { title: card.title, createdAt, expiresAt },
  });

  const origin = url.origin;
  return json({ id, url: `${origin}/s/${id}`, deleteToken, expiresAt }, 201);
}

async function getShare(env, id) {
  const rec = await env.SHARES.get("s:" + id, { type: "json", cacheTtl: 60 });
  if (!rec || (rec.expiresAt && rec.expiresAt < Date.now())) {
    return json({ error: "這張分享的卡片已經失效。分享連結只保留 " + SHARE_DAYS + " 天，或分享的人已經停止分享。" }, 404);
  }
  return json({ id, createdAt: rec.createdAt, expiresAt: rec.expiresAt, card: rec.card }, 200, { "Cache-Control": "no-cache" });
}

async function shareImage(env, id) {
  const rec = await env.SHARES.get("s:" + id, { type: "json", cacheTtl: 60 });
  const m = rec && IMAGE_RE.exec(rec.card.image);
  if (!m) return new Response("Not found", { status: 404, headers: CORS });
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300", ...CORS },
  });
}

async function deleteShare(request, env, id) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "缺少刪除權杖。" }, 401);
  const rec = await env.SHARES.get("s:" + id, { type: "json" });
  if (!rec) return json({ ok: true }, 200); // already gone
  const isOwner = (await sha256(token)) === rec.tokenHash;
  const isAdmin = env.ADMIN_TOKEN && safeEqual(token, env.ADMIN_TOKEN);
  if (!isOwner && !isAdmin) return json({ error: "沒有權限刪除這張卡片。" }, 403);
  await env.SHARES.delete("s:" + id);
  return json({ ok: true }, 200);
}

/* ------------------------------------------------------------------ */
/* Google sign-in for the desktop app (device code flow)               */
/* Google does not allow sign-in inside app windows, so the app shows  */
/* a code the user enters at google.com/device. The client secret of   */
/* the "TVs and Limited Input devices" client stays here, as Worker    */
/* secrets GOOGLE_DEVICE_CLIENT_ID and GOOGLE_DEVICE_CLIENT_SECRET.    */
/* ------------------------------------------------------------------ */
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.appdata openid email";

async function google(request, env, action) {
  const id = env.GOOGLE_DEVICE_CLIENT_ID;
  const secret = env.GOOGLE_DEVICE_CLIENT_SECRET;
  if (!id || !secret) return json({ error: "not_configured", error_message: "電腦版的 Google 登入還沒設定好。" }, 501);
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const form = (o) => new URLSearchParams(o);
  let endpoint, params;
  if (action === "device") {
    endpoint = "https://oauth2.googleapis.com/device/code";
    params = form({ client_id: id, scope: GOOGLE_SCOPE });
  } else if (action === "token") {
    if (typeof body.device_code !== "string") return json({ error: "invalid_request" }, 400);
    endpoint = "https://oauth2.googleapis.com/token";
    params = form({
      client_id: id,
      client_secret: secret,
      device_code: body.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
  } else if (action === "refresh") {
    if (typeof body.refresh_token !== "string") return json({ error: "invalid_request" }, 400);
    endpoint = "https://oauth2.googleapis.com/token";
    params = form({ client_id: id, client_secret: secret, refresh_token: body.refresh_token, grant_type: "refresh_token" });
  } else {
    return json({ error: "not_found" }, 404);
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json().catch(() => ({ error: "bad_response" }));
  // Pass Google's answer through (authorization_pending etc. are normal while waiting).
  return json(data, res.ok ? 200 : 200);
}

/* ------------------------------------------------------------------ */
/* Pages: index.html with link-preview tags                            */
/* ------------------------------------------------------------------ */
async function page(request, env, url, shareId) {
  const assetReq = new Request(new URL("/index.html", url), request);
  let res = await env.ASSETS.fetch(assetReq);
  if (res.status >= 300 && res.status < 400) {
    res = await env.ASSETS.fetch(new Request(new URL("/", url), request));
  }
  if (!res.ok) return res;

  let title = "3D Cards：把照片做成會反光的 3D 卡片";
  let desc = "上傳照片，選一種鐳射，做成會跟著滑鼠和手機轉動的 3D 卡片。";
  let image = `${url.origin}/brand/og-image.png`;
  let large = true;

  if (shareId && ID_RE.test(shareId) && env.SHARES) {
    const rec = await env.SHARES.get("s:" + shareId, { type: "json", cacheTtl: 60 });
    if (rec) {
      const c = rec.card;
      title = (c.title || "一張 3D 鐳射卡片") + "｜3D Cards";
      desc = [c.subtitle, "點開就能轉動這張會反光的卡片。"].filter(Boolean).join(" · ");
      image = `${url.origin}/api/shares/${shareId}/image`;
    }
  }

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  headers.delete("ETag");

  const setMeta = (attr, key, value) => ({
    element(el) {
      el.setAttribute("content", value);
    },
  });

  let rewriter = new HTMLRewriter()
    .on('meta[property="og:title"]', setMeta("property", "og:title", title))
    .on('meta[property="og:description"]', setMeta("property", "og:description", desc))
    .on('meta[property="og:image"]', setMeta("property", "og:image", image))
    .on('meta[property="og:url"]', setMeta("property", "og:url", url.origin + url.pathname))
    .on('meta[name="twitter:card"]', setMeta("name", "twitter:card", large ? "summary_large_image" : "summary"))
    .on('meta[name="description"]', setMeta("name", "description", desc));

  if (shareId) {
    // The share page lives at /s/<id>; make the relative asset paths resolve from the root.
    rewriter = rewriter.on("head", {
      element(el) {
        el.prepend('<base href="/">', { html: true });
      },
    });
    rewriter = rewriter.on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    });
  }

  return rewriter.transform(new Response(res.body, { status: 200, headers }));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...extra },
  });
}
const str = (v, max) => String(v == null ? "" : v).slice(0, max);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, d, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const b64size = (b64) => Math.floor((b64.length * 3) / 4);

function randomId(len) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
