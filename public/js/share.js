/*
 * share.js
 * Share links: upload a card to the site's share API and get a short link
 * that anyone can open. Also the share dialog used by the detail page.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const h = (...a) => HC.h(...a);

  const CONFIG = () => window.HC_CONFIG || {};
  const isWeb = /^https?:$/.test(location.protocol);

  /** Where the share API lives: this site when served over http(s), otherwise siteUrl. */
  function apiBase() {
    if (isWeb && !window.HC_DESKTOP) return location.origin;
    return (CONFIG().siteUrl || "").replace(/\/+$/, "");
  }

  /** Public address of the site, for links to gallery cards. */
  function siteBase() {
    if (isWeb && !window.HC_DESKTOP) return location.origin + location.pathname.replace(/[^/]*$/, "");
    return (CONFIG().siteUrl || "").replace(/\/+$/, "") + "/";
  }

  async function call(method, path, body, token) {
    const base = apiBase();
    if (!base) throw new Error("沒有設定網站網址（config.js 的 siteUrl），無法分享。");
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: Object.assign(
          body ? { "Content-Type": "application/json" } : {},
          token ? { Authorization: "Bearer " + token } : {}
        ),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error("連不上分享伺服器。請確認網路連線後再試一次。");
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* not JSON: probably a static host without the share API */
    }
    if (!res.ok || !data) {
      if (!data && (res.status === 404 || res.status === 405 || res.status === 501)) {
        throw new Error("這個網站沒有開啟分享功能。");
      }
      throw new Error((data && data.error) || "分享失敗（錯誤 " + res.status + "）。請稍後再試。");
    }
    return data;
  }

  HC.share = {
    apiBase,
    siteBase,

    /** Link for a card from the public gallery. */
    galleryLink(card) {
      return siteBase() + "#/card/" + card.id;
    },

    /** Existing, still-current share link for one of your cards, or null. */
    current(card) {
      const s = card && card.share;
      if (!s || !s.url) return null;
      if (s.ver !== (card.updatedAt || card.createdAt)) return null; // edited since sharing
      return s;
    },

    /** Upload one of your cards and remember the link on the card. */
    async create(card) {
      const now = this.current(card);
      if (now) return now;
      const old = card.share;
      const payload = await HC.io.payload(card);
      const data = await call("POST", "/api/shares", { card: payload });
      const share = { id: data.id, url: data.url, token: data.deleteToken, at: Date.now(), ver: card.updatedAt || card.createdAt };
      await HC.store.patch(card.id, { share });
      card.share = share;
      // The card was edited after an earlier share: retire the old link.
      if (old && old.id && old.token) call("DELETE", "/api/shares/" + old.id, null, old.token).catch(() => {});
      return share;
    },

    /** Stop sharing: the link stops working for everyone. */
    async remove(card) {
      const s = card.share;
      if (s && s.id && s.token) await call("DELETE", "/api/shares/" + s.id, null, s.token);
      await HC.store.patch(card.id, { share: null });
      card.share = null;
    },

    /** Fetch a shared card by id. */
    async fetch(id) {
      const data = await call("GET", "/api/shares/" + encodeURIComponent(id));
      return Object.assign({}, HC.DEFAULTS, data.card, { id: "s-" + id, shareId: id, own: false, shared: true });
    },
  };

  /* ------------------------------------------------------------------ */
  /* Dialog                                                              */
  /* ------------------------------------------------------------------ */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = h("textarea", { readonly: true, style: "position:fixed;opacity:0" }, text);
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  /**
   * Opens the share dialog for a card.
   * Gallery cards get their page link right away; your own cards are uploaded first.
   */
  HC.openShare = function (card, onChange) {
    const dlg = h("dialog.share", { "aria-labelledby": "share-title" });
    const close = () => dlg.close();
    const body = h("div.share__body");
    dlg.append(
      h(
        "div.share__head",
        h("h2.share__title", { id: "share-title" }, "分享卡片"),
        h("button.share__x", { type: "button", "aria-label": "關閉", onclick: close }, "×")
      ),
      body
    );
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) close();
    });
    document.body.appendChild(dlg);
    dlg.showModal();

    function showLink(url, note, canStop) {
      const input = h("input.input.share__link", { type: "text", readonly: true, value: url, "aria-label": "分享連結" });
      input.addEventListener("focus", () => input.select());
      const copyBtn = h("button.btn.btn--ink", { type: "button" }, "複製連結");
      copyBtn.addEventListener("click", async () => {
        if (await copy(url)) {
          copyBtn.textContent = "已複製";
          setTimeout(() => (copyBtn.textContent = "複製連結"), 1800);
        } else {
          input.focus();
          HC.toast("無法自動複製，請手動選取連結。", "error");
        }
      });
      const actions = h("div.share__actions", copyBtn);
      if (navigator.share) {
        actions.appendChild(
          h(
            "button.btn.btn--line",
            {
              type: "button",
              onclick: () => navigator.share({ title: card.title || "3D Cards", url }).catch(() => {}),
            },
            "用其他 App 分享"
          )
        );
      }
      const open = h("a.btn.btn--quiet", { href: url, target: "_blank", rel: "noopener" }, "開啟連結");
      actions.appendChild(open);
      const parts = [h("p.share__note", note), input, actions];
      if (canStop) {
        const stop = h("button.btn.btn--quiet.share__stop", { type: "button" }, "停止分享");
        let armed = 0;
        stop.addEventListener("click", async () => {
          if (!armed) {
            stop.textContent = "再按一次，連結會失效";
            armed = setTimeout(() => {
              armed = 0;
              stop.textContent = "停止分享";
            }, 3500);
            return;
          }
          clearTimeout(armed);
          stop.disabled = true;
          try {
            await HC.share.remove(card);
            HC.toast("已停止分享，連結失效了");
            if (onChange) onChange();
            close();
          } catch (e) {
            stop.disabled = false;
            HC.toast(e.message, "error");
          }
        });
        parts.push(stop);
      }
      body.replaceChildren(...parts);
      input.focus();
    }

    if (!card.own) {
      const url = card.shared ? HC.share.siteBase().replace(/\/$/, "") + "/s/" + card.shareId : HC.share.galleryLink(card);
      showLink(url, "任何人打開這個連結，都能看到並轉動這張卡片。", false);
      return;
    }

    const existing = HC.share.current(card);
    if (existing) {
      showLink(existing.url, "這張卡片已經分享過了。任何人打開連結都能看到它。", true);
      return;
    }

    const go = h("button.btn.btn--ink", { type: "button" }, "建立分享連結");
    body.replaceChildren(
      h(
        "p.share__note",
        "建立連結時，卡片和照片會上傳到網站的伺服器，任何拿到連結的人都能看到。之後隨時可以停止分享，連結就會失效。"
      ),
      card.share ? h("p.share__note.share__warn", "你在上次分享後編輯過這張卡片。建立新連結後，舊連結會失效。") : null,
      h("div.share__actions", go, h("button.btn.btn--quiet", { type: "button", onclick: close }, "取消"))
    );
    go.focus();
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = "上傳中…";
      try {
        const s = await HC.share.create(card);
        if (onChange) onChange();
        showLink(s.url, "連結建立好了。任何人打開它都能看到並轉動這張卡片。", true);
      } catch (e) {
        go.disabled = false;
        go.textContent = "再試一次";
        HC.toast(e.message, "error");
      }
    });
  };
})();
