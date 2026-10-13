/*
 * account.js
 * Who you are on 3D Cards: the Google sign-in from cloud sync, plus a public
 * name for the public gallery. Also decides whose name goes into a photo's
 * invisible watermark.
 *
 *   HC.account.me()              { uid, name, admin } or null (not signed in)
 *   HC.account.call(m, path, b)  API call with your sign-in
 *   HC.account.signIn()          asks you to sign in if needed; true when signed in
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

  let meCache = null; // { at, value }

  const api = () => (HC.share ? HC.share.apiBase() : location.origin);

  async function call(method, path, body, { auth = true, optional = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && HC.cloud && HC.cloud.signedIn) {
      try {
        headers.Authorization = "Bearer " + (await HC.cloud.token());
      } catch (e) {
        if (!optional) throw new Error(T("登入已過期，請重新用 Google 登入。"));
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

  async function me(force) {
    if (!HC.cloud || !HC.cloud.signedIn) return null;
    if (!force && meCache && Date.now() - meCache.at < 5 * 60 * 1000) return meCache.value;
    try {
      const value = await call("GET", "/api/me");
      meCache = { at: Date.now(), value };
      return value;
    } catch (e) {
      return null;
    }
  }

  /** Signs you in with Google (same as cloud sync). Resolves true once signed in. */
  function signIn() {
    if (HC.cloud && HC.cloud.signedIn) return Promise.resolve(true);
    if (!HC.cloud || !HC.cloud.available) {
      HC.toast(T("這個版本沒有開啟 Google 登入。"), "error");
      return Promise.resolve(false);
    }
    HC.toast(T("請先用 Google 登入。"));
    return new Promise((resolve) => {
      let done = false;
      HC.openCloud(() => {
        if (!done && HC.cloud.signedIn) {
          done = true;
          meCache = null;
          resolve(true);
        }
        if (HC.appShell) HC.appShell.refreshSync();
      }, () => {
        if (!done) resolve(!!HC.cloud.signedIn);
      });
    });
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
          meCache = { at: Date.now(), value: v };
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
      meCache = null;
    },
  };
})();
