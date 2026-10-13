/*
 * cloud.js
 * Google sign-in and cloud sync.
 *
 * Cards are kept in the signed-in user's own Google Drive, in the hidden
 * app-data folder that only 3D Cards can see (scope drive.appdata). Nothing is
 * stored on the 3D Cards server.
 *
 *  - Website: Google Identity Services pop-up (needs HC_CONFIG.googleClientId).
 *  - Desktop app: Google does not allow sign-in inside an app window, so it uses
 *    the user's normal browser: the app opens the website's sign-in page, the user
 *    checks a code and signs in, and the app collects the result through the
 *    site's Worker (/api/google/*), which holds the client secret.
 *
 * Sync rules: the newer copy of each card wins; cards deleted here are deleted in
 * the cloud on the next sync.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const h = (...a) => HC.h(...a);
  const CFG = () => window.HC_CONFIG || {};

  const SCOPE = "https://www.googleapis.com/auth/drive.appdata openid email";
  const DRIVE = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const K_ON = "hc:cloud";
  const K_REFRESH = "hc:cloud-refresh";
  const K_EMAIL = "hc:cloud-email";
  const K_DELETED = "hc:cloud-deleted";
  const K_LAST = "hc:cloud-last";
  const K_TOKEN = "hc:cloud-token"; // the current access token (about an hour), so a reload needs no pop-up

  const ls = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch (e) {}
    },
  };

  let token = null; // { access, expires }
  try {
    const saved = JSON.parse(ls.get(K_TOKEN) || "null");
    if (saved && saved.access && saved.expires > Date.now()) token = saved;
  } catch (e) {}
  function keepToken(t) {
    token = t;
    ls.set(K_TOKEN, t ? JSON.stringify(t) : null);
    return t;
  }
  let gisPromise = null;

  const isDesktop = () => !!window.HC_DESKTOP;
  const apiBase = () => (HC.share ? HC.share.apiBase() : location.origin);

  /* ------------------------------------------------------------------ */
  /* Sign-in: website (Google Identity Services)                         */
  /* ------------------------------------------------------------------ */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error(HC.t("無法連上 Google，請確認網路連線後再試。")));
      };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  async function webSignIn(interactive) {
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CFG().googleClientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) return reject(new Error(HC.t("Google 登入沒有完成。")));
          resolve(keepToken({ access: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 }));
        },
        error_callback: () => reject(new Error(HC.t("Google 登入沒有完成。"))),
      });
      client.requestAccessToken({ prompt: interactive ? "select_account" : "" });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sign-in: desktop app (browser pairing, through the Worker)          */
  /* ------------------------------------------------------------------ */
  async function workerPost(path, body) {
    let res;
    try {
      res = await fetch(apiBase() + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      throw new Error(HC.t("連不上伺服器，請確認網路連線後再試。"));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) throw new Error(HC.t("Google 登入沒有完成。"));
    return data;
  }

  async function refreshDesktopToken() {
    const refresh = ls.get(K_REFRESH);
    if (!refresh) return null;
    const data = await workerPost("/api/google/refresh", { refresh_token: refresh });
    if (!data.access_token) {
      if (data.error === "invalid_grant") ls.set(K_REFRESH, null);
      return null;
    }
    return keepToken({ access: data.access_token, expires: Date.now() + ((data.expires_in || 3600) - 60) * 1000 });
  }

  /** Opens the website in the user's browser to sign in, shows the check code, waits for the result. */
  async function desktopSignIn(view) {
    const start = await workerPost("/api/google/pair", {});
    if (!start.id) throw new Error(HC.t(start.error_message || "電腦版的 Google 登入還沒設定好。"));
    view.showCode(start.code, start.url);
    if (window.HC_DESKTOP && window.HC_DESKTOP.openUrl) window.HC_DESKTOP.openUrl(start.url);
    const until = Date.now() + (start.expires_in || 600) * 1000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2500));
      if (view.cancelled) throw new Error("cancelled");
      const data = await workerPost("/api/google/claim", { id: start.id, secret: start.secret });
      if (data.access_token) {
        if (data.refresh_token) ls.set(K_REFRESH, data.refresh_token);
        return keepToken({ access: data.access_token, expires: Date.now() + ((data.expires_in || 3600) - 60) * 1000 });
      }
      if (data.error === "expired") break;
      if (data.error && data.error !== "authorization_pending") throw new Error(HC.t("Google 登入沒有完成。"));
    }
    throw new Error(HC.t("登入連結已經過期，請重新登入。"));
  }

  /* ------------------------------------------------------------------ */
  /* Drive                                                               */
  /* ------------------------------------------------------------------ */
  /**
   * A current access token. On the website, renewing it needs a Google pop-up, so that
   * only happens when the person asked for something that needs it (interactive);
   * otherwise this throws "signin". The desktop app renews quietly.
   */
  async function getToken({ interactive = false } = {}) {
    if (token && token.expires > Date.now()) return token.access;
    if (isDesktop()) {
      const t = await refreshDesktopToken();
      if (t) return t.access;
    } else if (ls.get(K_ON) && interactive) {
      try {
        const t = await webSignIn(false);
        return t.access;
      } catch (e) {}
    }
    throw new Error("signin");
  }

  async function drive(url, opts = {}) {
    const access = await getToken({ interactive: true });
    const res = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: "Bearer " + access }, opts.headers || {}) }));
    if (res.status === 401) {
      keepToken(null);
      throw new Error("signin");
    }
    if (!res.ok) throw new Error(HC.t("Google 雲端硬碟回應錯誤（{code}）。", { code: res.status }));
    return res;
  }

  async function listRemote() {
    const files = [];
    let page = "";
    do {
      const q = new URLSearchParams({
        spaces: "appDataFolder",
        fields: "nextPageToken, files(id, name, appProperties)",
        pageSize: "1000",
      });
      if (page) q.set("pageToken", page);
      const data = await (await drive(DRIVE + "/files?" + q)).json();
      files.push(...(data.files || []));
      page = data.nextPageToken || "";
    } while (page);
    return files.filter((f) => f.appProperties && f.appProperties.cardId);
  }

  function multipart(meta, text) {
    const boundary = "hc" + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
    return { body, type: "multipart/related; boundary=" + boundary };
  }

  async function upload(rec, remote) {
    const card = Object.assign({}, rec, { own: true });
    const payload = await HC.io.payload(card);
    const text = JSON.stringify({ format: "3d-cards", version: 2, app: "3D Cards", card: payload });
    const props = { cardId: rec.id, updatedAt: String(rec.updatedAt || rec.createdAt || 0), createdAt: String(rec.createdAt || 0) };
    if (remote) {
      const m = multipart({ appProperties: props }, text);
      await drive(`${UPLOAD}/files/${remote.id}?uploadType=multipart`, { method: "PATCH", headers: { "Content-Type": m.type }, body: m.body });
    } else {
      const m = multipart({ name: `card-${rec.id}.3dcard`, parents: ["appDataFolder"], appProperties: props }, text);
      await drive(`${UPLOAD}/files?uploadType=multipart`, { method: "POST", headers: { "Content-Type": m.type }, body: m.body });
    }
  }

  async function download(remote) {
    const text = await (await drive(`${DRIVE}/files/${remote.id}?alt=media`)).text();
    const rec = await HC.io.importText(text);
    rec.id = remote.appProperties.cardId;
    rec.createdAt = +remote.appProperties.createdAt || Date.now();
    rec.updatedAt = +remote.appProperties.updatedAt || rec.createdAt;
    await HC.store.putRaw(rec);
  }

  const deletedList = () => {
    try {
      return JSON.parse(ls.get(K_DELETED) || "[]");
    } catch (e) {
      return [];
    }
  };

  async function sync(progress) {
    const say = progress || (() => {});
    say(HC.t("正在讀取雲端的卡片…"));
    const remote = await listRemote();
    const byId = new Map(remote.map((f) => [f.appProperties.cardId, f]));
    const own = await HC.cards.own();
    const local = new Map(own.map((c) => [c.id, c]));
    let up = 0, downN = 0, removed = 0;

    // Cards deleted on this device: delete them in the cloud too.
    const deleted = deletedList();
    for (const id of deleted) {
      const f = byId.get(id);
      if (f) {
        await drive(`${DRIVE}/files/${f.id}`, { method: "DELETE" }).catch(() => {});
        byId.delete(id);
        removed++;
      }
    }
    ls.set(K_DELETED, null);

    for (const c of own) {
      const f = byId.get(c.id);
      const mine = c.updatedAt || c.createdAt || 0;
      if (!f || mine > (+f.appProperties.updatedAt || 0)) {
        say(HC.t("正在上傳「{title}」…", { title: c.title || HC.t("未命名卡片") }));
        await upload(await HC.store.raw(c.id), f);
        up++;
      }
    }
    for (const [id, f] of byId) {
      const c = local.get(id);
      if (!c || (+f.appProperties.updatedAt || 0) > (c.updatedAt || c.createdAt || 0)) {
        say(HC.t("正在下載卡片…"));
        await download(f);
        downN++;
      }
    }
    ls.set(K_LAST, String(Date.now()));
    return { up, down: downN, removed };
  }

  async function fetchEmail() {
    try {
      const res = await drive("https://openidconnect.googleapis.com/v1/userinfo");
      const info = await res.json();
      if (info.email) ls.set(K_EMAIL, info.email);
    } catch (e) {}
  }

  async function signOut() {
    if (HC.account) HC.account.forget();
    const access = token && token.access;
    keepToken(null);
    ls.set(K_ON, null);
    ls.set(K_EMAIL, null);
    ls.set(K_LAST, null);
    const refresh = ls.get(K_REFRESH);
    ls.set(K_REFRESH, null);
    const revoke = refresh || access;
    if (revoke) fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(revoke), { method: "POST" }).catch(() => {});
  }

  HC.cloud = {
    /** Whether sign-in can work here (the site owner has set it up). */
    get available() {
      return isDesktop() ? !!CFG().siteUrl : !!CFG().googleClientId && /^https?:$/.test(location.protocol);
    },
    get signedIn() {
      return !!ls.get(K_ON);
    },
    get email() {
      return ls.get(K_EMAIL) || "";
    },
    /** Remember a deleted card so the next sync removes it from the cloud too. */
    noteDeleted(id) {
      if (!this.signedIn) return;
      const list = deletedList();
      if (!list.includes(id)) list.push(id);
      ls.set(K_DELETED, JSON.stringify(list));
    },
    sync,
    signOut,
    /** A current Google access token; { interactive: true } may show Google's pop-up. Throws "signin". */
    token: getToken,
    /** Whether a token is at hand without asking Google again. */
    get ready() {
      return isDesktop() ? !!ls.get(K_REFRESH) || !!(token && token.expires > Date.now()) : !!(token && token.expires > Date.now());
    },
    /** Load Google's sign-in script early, so the pop-up opens straight from the click. */
    preload() {
      if (!isDesktop() && this.available) loadGis().catch(() => {});
    },
  };

  /* ------------------------------------------------------------------ */
  /* Dialog                                                              */
  /* ------------------------------------------------------------------ */
  HC.openCloud = function (onChange, onClose, { start = false } = {}) {
    const dlg = h("dialog.share", { "aria-labelledby": "cloud-title" });
    const body = h("div.share__body");
    const close = () => dlg.close();
    const status = h("p.share__note", { role: "status" });
    const view = { cancelled: false, showCode: null };

    dlg.append(
      h(
        "div.share__head",
        h("h2.share__title", { id: "cloud-title" }, HC.t("雲端同步")),
        h("button.share__x", { type: "button", "aria-label": HC.t("關閉"), onclick: close }, "×")
      ),
      body
    );
    dlg.addEventListener("close", () => {
      view.cancelled = true;
      dlg.remove();
      if (onClose) onClose();
    });
    document.body.appendChild(dlg);
    dlg.showModal();

    function fmtTime(ts) {
      const d = new Date(+ts);
      return d.toLocaleString(HC.lang === "en" ? "en" : "zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    async function runSync() {
      const btns = body.querySelectorAll("button");
      btns.forEach((b) => (b.disabled = true));
      status.classList.remove("share__warn");
      try {
        const r = await sync((msg) => (status.textContent = msg));
        status.textContent = HC.t("同步完成：上傳 {up} 張、下載 {down} 張。", { up: r.up, down: r.down });
        if (onChange) onChange();
      } catch (e) {
        if (e.message === "signin") {
          status.textContent = HC.t("登入已過期，請重新登入。");
          ls.set(K_ON, null);
          setTimeout(render, 1200);
        } else {
          status.textContent = e.message || HC.t("同步失敗，請稍後再試。");
        }
        status.classList.add("share__warn");
      } finally {
        btns.forEach((b) => (b.disabled = false));
      }
    }

    async function signIn() {
      status.classList.remove("share__warn");
      try {
        if (isDesktop()) {
          view.showCode = (code, url) => {
            const codeEl = h("p.cloud-code", code);
            body.replaceChildren(
              h("p.share__note", HC.t("已經用你的瀏覽器打開登入頁。請確認頁面上的確認碼和這裡一樣，再用 Google 登入：")),
              codeEl,
              h(
                "div.share__actions",
                h("a.btn.btn--ink", { href: url, target: "_blank", rel: "noopener" }, HC.t("重新打開登入頁")),
                h("button.btn.btn--quiet", { type: "button", onclick: close }, HC.t("取消"))
              ),
              status
            );
            status.textContent = HC.t("在瀏覽器登入後，這裡會自動完成…");
          };
          await desktopSignIn(view);
        } else {
          await webSignIn(true);
        }
        ls.set(K_ON, "1");
        await fetchEmail();
        if (HC.account) HC.account.forget();
        render();
        if (onChange) onChange();
        await runSync();
      } catch (e) {
        if (e.message === "cancelled") return;
        render();
        status.textContent = e.message || HC.t("Google 登入沒有完成。");
        status.classList.add("share__warn");
      }
    }

    function render() {
      if (!HC.cloud.signedIn) {
        // Signing in needs agreeing to the privacy policy and terms first.
        const agree = h("input", { type: "checkbox" });
        const go = h("button.btn.btn--ink", { type: "button", disabled: true, onclick: () => agree.checked && signIn() }, HC.t("用 Google 登入"));
        agree.addEventListener("change", () => (go.disabled = !agree.checked));
        const site = (isDesktop() ? CFG().siteUrl || "" : "").replace(/\/$/, "");
        const doc = (file, label) => h("a", { href: (site ? site + "/" : "") + file, target: "_blank", rel: "noopener" }, label);
        body.replaceChildren(
          h(
            "p.share__note",
            HC.t("登入 Google 後，你的卡片會存到你自己的 Google 雲端硬碟（一個只有 3D Cards 看得到的隱藏資料夾），換電腦或手機登入同一個帳號就能取回。")
          ),
          h(
            "label.check.check--top.cloud-agree",
            agree,
            h("span", HC.t("我已閱讀並同意"), doc("privacy.html", HC.lang === "en" ? "Privacy Policy" : HC.t("隱私權政策")), HC.t("和"), doc("terms.html", HC.t("服務條款")))
          ),
          h("div.share__actions", go, h("button.btn.btn--quiet", { type: "button", onclick: close }, HC.t("取消"))),
          status
        );
        status.textContent = "";
        agreeBox = agree;
        return;
      }
      const last = ls.get(K_LAST);
      body.replaceChildren(
        ...[
          h("p.share__note", HC.t("已登入：{email}", { email: HC.cloud.email || "Google" })),
          last ? h("p.share__note", HC.t("上次同步：{time}", { time: fmtTime(last) })) : null,
          h(
            "div.share__actions",
            h("button.btn.btn--ink", { type: "button", onclick: runSync }, HC.t("立即同步")),
            h(
              "button.btn.btn--quiet",
              {
                type: "button",
                onclick: async () => {
                  await signOut();
                  render();
                  if (onChange) onChange();
                },
              },
              HC.t("登出")
            )
          ),
          status,
        ].filter(Boolean)
      );
    }
    let agreeBox = null;
    render();
    if (start && agreeBox) agreeBox.focus();
  };
})();
