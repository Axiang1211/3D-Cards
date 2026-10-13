/*
 * account.js
 * Who you are on 3D Cards: the Google sign-in from cloud sync, plus a public
 * name for the public gallery. Also decides whose name goes into a photo's
 * invisible watermark.
 *
 *   HC.account.me()              { uid, name, admin } or null (not signed in)
 *   HC.account.call(m, path, b)  API call with your sign-in
 *   HC.account.signIn()          when an action needs it: "this needs signing in, sign in?"
 *                                then Google; true when signed in, false if you said no
 *   HC.account.ensureName()      asks for a public name if you have none
 *   HC.account.markText()        "name #uid", or "unknown user"
 *   HC.account.markFor(blob)     the watermark a photo should carry when uploaded
 *   HC.account.adoptMark(blob)   on import: an "unknown user" photo gets your name
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const h = (...a) => HC.h(...a);
  const T = (s, p) => HC.t(s, p);

  // Your profile, kept between visits so pages (and watermarks) know you without asking Google.
  const K_ME = "hc:me";
  let meCache = null; // { at, value, email }
  try {
    const saved = JSON.parse(localStorage.getItem(K_ME) || "null");
    if (saved && saved.value) meCache = saved;
  } catch (e) {}
  function keepMe(value) {
    meCache = value ? { at: Date.now(), value, email: (HC.cloud && HC.cloud.email) || "" } : null;
    try {
      if (meCache) localStorage.setItem(K_ME, JSON.stringify(meCache));
      else localStorage.removeItem(K_ME);
    } catch (e) {}
  }
  const cachedMe = () => (meCache && HC.cloud && HC.cloud.signedIn && (!meCache.email || meCache.email === HC.cloud.email) ? meCache.value : null);

  const api = () => (HC.share ? HC.share.apiBase() : location.origin);

  /**
   * optional: works signed out too; sends your sign-in only if it's at hand.
   * quiet:    needs your sign-in, but never asks for it (background requests); fails with code "signin".
   * otherwise the person asked for this, so an expired sign-in gets the "sign in?" question.
   */
  async function call(method, path, body, { auth = true, optional = false, quiet = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && HC.cloud && HC.cloud.signedIn) {
      let access = null;
      try {
        access = await HC.cloud.token();
      } catch (e) {
        if (!optional && !quiet && (await signIn())) access = await HC.cloud.token().catch(() => null);
      }
      if (access) headers.Authorization = "Bearer " + access;
      else if (!optional) {
        const err = new Error(T("請先用 Google 登入。"));
        err.code = "signin";
        throw err;
      }
    }
    let res;
    try {
      res = await fetch(api() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error(T("連不上伺服器，請確認網路連線後再試。"));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || T("伺服器發生錯誤，請稍後再試。"));
      err.code = data.code || res.status;
      throw err;
    }
    return data;
  }

  /** Your profile, or null. Never asks you to sign in; uses the saved copy when Google can't be asked quietly. */
  async function me(force) {
    if (!HC.cloud || !HC.cloud.signedIn) return null;
    const saved = cachedMe();
    if (!force && saved && Date.now() - meCache.at < 5 * 60 * 1000) return saved;
    try {
      const value = await call("GET", "/api/me", null, { quiet: true });
      keepMe(value);
      return value;
    } catch (e) {
      return e.code === "signin" ? saved : saved || null;
    }
  }

  /** "This needs signing in. Sign in?" — resolves true when you said yes and finished. */
  function ask() {
    if (HC.cloud.preload) HC.cloud.preload();
    const opts = { title: T("需要登入"), text: T("此操作需要登入，是否登入？"), ok: T("是"), cancel: T("否") };
    if (HC.appConfirm) return HC.appConfirm(opts);
    return new Promise((resolve) => {
      const dlg = h("dialog.share.confirm", { "aria-labelledby": "si-title" });
      let answer = false;
      const yes = h("button.btn.btn--ink", { type: "button", onclick: () => ((answer = true), dlg.close()) }, opts.ok);
      dlg.append(
        h("div.share__head", h("h2.share__title", { id: "si-title" }, opts.title)),
        h("div.share__body", h("p.share__note", opts.text), h("div.share__actions.confirm__actions", h("button.btn.btn--quiet", { type: "button", onclick: () => dlg.close() }, opts.cancel), yes))
      );
      dlg.addEventListener("close", () => {
        dlg.remove();
        resolve(answer);
      });
      document.body.appendChild(dlg);
      dlg.showModal();
      yes.focus();
    });
  }

  /**
   * For actions that need you signed in. Signed in already: true, without asking.
   * Otherwise asks first; "yes" goes on to Google, "no" resolves false.
   */
  let asking = null;
  function signIn() {
    if (!HC.cloud || !HC.cloud.available) {
      HC.toast(T("這個版本沒有開啟 Google 登入。"), "error");
      return Promise.resolve(false);
    }
    if (HC.cloud.signedIn && HC.cloud.ready) return Promise.resolve(true);
    if (asking) return asking;
    asking = (async () => {
      if (!(await ask())) return false;
      // Signed in before, only the sign-in ran out: Google's pop-up, straight from the click.
      if (HC.cloud.signedIn) {
        try {
          await HC.cloud.token({ interactive: true });
          return true;
        } catch (e) {
          HC.toast(T("Google 登入沒有完成。"), "error");
          return false;
        }
      }
      return new Promise((resolve) => {
        let done = false;
        HC.openCloud(
          () => {
            if (!done && HC.cloud.signedIn) {
              done = true;
              keepMe(null);
              resolve(true);
            }
            if (HC.appShell) HC.appShell.refreshSync();
          },
          () => {
            if (!done) resolve(!!HC.cloud.signedIn);
          },
          { start: true }
        );
      });
    })().finally(() => (asking = null));
    return asking;
  }

  /** Asks for a public name (shown in the public gallery) if you have none. Resolves the profile, or null. */
  async function ensureName(force) {
    const who = await me(true);
    if (!who) return null;
    if (who.name && !force) return who;
    return new Promise((resolve) => {
      const dlg = h("dialog.share", { "aria-labelledby": "nm-title" });
      const input = h("input.input.share__link", { type: "text", maxlength: "24", value: who.name || "", placeholder: T("例如：阿翔"), "aria-label": T("公開名稱") });
      const msg = h("p.share__note");
      let result = null;
      const form = h(
        "form.share__body",
        h("p.share__note", T("公開展廳和水印會顯示這個名稱，不會顯示你的 Google 帳號或信箱。之後可以在設定裡修改。")),
        input,
        msg,
        h("div.share__actions", h("button.btn.btn--ink", { type: "submit" }, T("儲存")), h("button.btn.btn--quiet", { type: "button", onclick: () => dlg.close() }, T("取消")))
      );
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const v = await call("POST", "/api/me", { name: input.value });
          keepMe(v);
          result = v;
          dlg.close();
        } catch (err) {
          msg.textContent = err.message;
          msg.className = "share__note share__warn";
        }
      });
      dlg.append(h("div.share__head", h("h2.share__title", { id: "nm-title" }, T("公開名稱")), h("button.share__x", { type: "button", "aria-label": T("關閉"), onclick: () => dlg.close() }, "×")), form);
      dlg.addEventListener("close", () => {
        dlg.remove();
        resolve(result);
      });
      document.body.appendChild(dlg);
      dlg.showModal();
      input.focus();
    });
  }

  async function markText() {
    const who = await me();
    if (!who) return HC.watermark.UNKNOWN;
    return (who.name ? who.name + " " : "") + "#" + who.uid;
  }

  /** A photo keeps a named watermark it already has; otherwise it gets yours (or "unknown user"). */
  async function markFor(blob) {
    try {
      const existing = blob ? await HC.watermark.read(blob) : null;
      if (existing && existing !== HC.watermark.UNKNOWN) return existing;
    } catch (e) {}
    return markText();
  }

  /** Importing someone's card: an "unknown user" photo gets your name, any other watermark stays. */
  async function adoptMark(blob) {
    try {
      if (!blob || !HC.cloud || !HC.cloud.signedIn) return blob;
      const existing = await HC.watermark.read(blob);
      if (existing !== HC.watermark.UNKNOWN) return blob;
      const text = await markText();
      if (text === HC.watermark.UNKNOWN) return blob;
      return await HC.watermark.embed(blob, text, { type: blob.type === "image/webp" ? "image/webp" : "image/jpeg", quality: 0.92 });
    } catch (e) {
      return blob;
    }
  }

  HC.account = {
    me,
    call,
    signIn,
    ensureName,
    markText,
    markFor,
    adoptMark,
    forget() {
      keepMe(null);
    },
  };
})();
