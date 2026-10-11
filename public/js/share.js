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
    if (!base) throw new Error(HC.t("沒有設定網站網址（config.js 的 siteUrl），無法分享。"));
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
      throw new Error(HC.t("連不上分享伺服器。請確認網路連線後再試一次。"));
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* not JSON: probably a static host without the share API */
    }
    if (!res.ok || !data) {
      if (!data && (res.status === 404 || res.status === 405 || res.status === 501)) {
        throw new Error(HC.t("這個網站沒有開啟分享功能。"));
      }
      throw new Error(data && data.error ? HC.t(data.error) : HC.t("分享失敗（錯誤 {code}）。請稍後再試。", { code: res.status }));
    }
    return data;
  }

  /** "10月25日" style date, plus how many days are left. */
  function expiryText(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const days = Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
    return HC.t("{m}月{d}日（還有 {n} 天）", { m: d.getMonth() + 1, d: d.getDate(), n: days });
  }

  HC.share = {
    expiryText,
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
      if (s.expiresAt && s.expiresAt <= Date.now()) return null; // expired
      return s;
    },

    /** Upload one of your cards and remember the link on the card. */
    async create(card) {
      const now = this.current(card);
      if (now) return now;
      const old = card.share;
      const payload = await HC.io.payload(card, { forUpload: true });
      const data = await call("POST", "/api/shares", { card: payload });
      const share = {
        id: data.id,
        url: data.url,
        token: data.deleteToken,
        at: Date.now(),
        expiresAt: data.expiresAt || 0,
        ver: card.updatedAt || card.createdAt,
      };
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
      return Object.assign({}, HC.DEFAULTS, data.card, { id: "s-" + id, shareId: id, own: false, shared: true, expiresAt: data.expiresAt || 0 });
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
        h("h2.share__title", { id: "share-title" }, HC.t("分享卡片")),
        h("button.share__x", { type: "button", "aria-label": HC.t("關閉"), onclick: close }, "×")
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
      const input = h("input.input.share__link", { type: "text", readonly: true, value: url, "aria-label": HC.t("分享連結") });
      input.addEventListener("focus", () => input.select());
      const copyBtn = h("button.btn.btn--ink", { type: "button" }, HC.t("複製連結"));
      copyBtn.addEventListener("click", async () => {
        if (await copy(url)) {
          copyBtn.textContent = HC.t("已複製");
          setTimeout(() => (copyBtn.textContent = HC.t("複製連結")), 1800);
        } else {
          input.focus();
          HC.toast(HC.t("無法自動複製，請手動選取連結。"), "error");
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
            HC.t("用其他 App 分享")
          )
        );
      }
      const open = h("a.btn.btn--quiet", { href: url, target: "_blank", rel: "noopener" }, HC.t("開啟連結"));
      actions.appendChild(open);
      const parts = [h("p.share__note", note), input, actions];
      if (canStop) {
        const stop = h("button.btn.btn--quiet.share__stop", { type: "button" }, HC.t("停止分享"));
        let armed = 0;
        stop.addEventListener("click", async () => {
          if (!armed) {
            stop.textContent = HC.t("再按一次，連結會失效");
            armed = setTimeout(() => {
              armed = 0;
              stop.textContent = HC.t("停止分享");
            }, 3500);
            return;
          }
          clearTimeout(armed);
          stop.disabled = true;
          try {
            await HC.share.remove(card);
            HC.toast(HC.t("已停止分享，連結失效了"));
            if (onChange) onChange();
            close();
          } catch (e) {
            stop.disabled = false;
            HC.toast(e.message, "error");
          }
        });
        parts.push(stop);
      }
      body.replaceChildren(...parts.filter(Boolean));
      input.focus();
    }

    if (!card.own) {
      const url = card.shared ? HC.share.siteBase().replace(/\/$/, "") + "/s/" + card.shareId : HC.share.galleryLink(card);
      const note = card.shared && card.expiresAt
        ? HC.t("任何人打開這個連結，都能看到並轉動這張卡片。") + HC.t("連結會在 {date}失效。", { date: expiryText(card.expiresAt) })
        : HC.t("任何人打開這個連結，都能看到並轉動這張卡片。");
      showLink(url, note, false);
      return;
    }

    const existing = HC.share.current(card);
    if (existing) {
      showLink(
        existing.url,
        HC.t("這張卡片已經分享過了。任何人打開連結都能看到它。") +
          (existing.expiresAt ? HC.t("連結會在 {date}失效。", { date: expiryText(existing.expiresAt) }) : ""),
        true
      );
      return;
    }

    const go = h("button.btn.btn--ink", { type: "button" }, HC.t("建立分享連結"));
    const err = h("p.share__note.share__warn", { hidden: true, role: "alert" });
    const parts = [
      h(
        "p.share__note",
        HC.t("建立連結時，卡片和照片會上傳到網站的伺服器，任何拿到連結的人都能看到。連結會保留 14 天，之後自動失效；你也可以隨時停止分享。")
      ),
      card.share && card.share.expiresAt && card.share.expiresAt <= Date.now()
        ? h("p.share__note.share__warn", HC.t("上次的分享連結已經過期了，可以建立一個新的。"))
        : card.share
          ? h("p.share__note.share__warn", HC.t("你在上次分享後編輯過這張卡片。建立新連結後，舊連結會失效。"))
          : null,
      err,
      h("div.share__actions", go, h("button.btn.btn--quiet", { type: "button", onclick: close }, HC.t("取消")))
    ];
    body.replaceChildren(...parts.filter(Boolean));
    go.focus();
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = HC.t("上傳中…");
      err.hidden = true;
      try {
        const s = await HC.share.create(card);
        if (onChange) onChange();
        showLink(
          s.url,
          HC.t("連結建立好了。任何人打開它都能看到並轉動這張卡片。") + (s.expiresAt ? HC.t("連結會在 {date}失效。", { date: expiryText(s.expiresAt) }) : ""),
          true
        );
      } catch (e) {
        go.disabled = false;
        go.textContent = HC.t("再試一次");
        // Shown inside the dialog: a toast would sit behind it.
        err.textContent = e.message || HC.t("分享失敗，請稍後再試。");
        err.hidden = false;
      }
    });
  };

  /* ------------------------------------------------------------------ */
  /* Add someone's shared card to your own cards, from its link          */
  /* ------------------------------------------------------------------ */
  /** Finds the share id in a link (…/s/AbCd1234, …#/s/AbCd1234, ?s=AbCd1234) or a bare id. */
  HC.share.parseLink = function (text) {
    const t = String(text || "").trim();
    let m = t.match(/(?:\/s\/|[?&]s=)([A-Za-z0-9]{8,12})\b/);
    if (m) return m[1];
    m = t.match(/^([A-Za-z0-9]{8,12})$/);
    return m ? m[1] : null;
  };

  /** Save a shared card into this browser / app. Returns the new card id. */
  HC.share.saveShared = async function (data) {
    const own = await HC.cards.own();
    const dup = own.find((c) => c.fromShare && c.fromShare === data.shareId);
    if (dup) return { id: dup.id, existed: true };
    const rec = await HC.io.recordFromCard(data);
    rec.fromShare = data.shareId;
    const id = await HC.store.put(rec);
    return { id, existed: false };
  };

  HC.openAddByLink = function () {
    const dlg = h("dialog.share", { "aria-labelledby": "add-title" });
    const close = () => dlg.close();
    const input = h("input.input.share__link", {
      type: "text",
      placeholder: HC.t("貼上分享連結，例如 https://…/s/AbCd1234"),
      "aria-label": HC.t("分享連結"),
      autocomplete: "off",
    });
    const go = h("button.btn.btn--ink", { type: "submit" }, HC.t("加入我的卡片"));
    const msg = h("p.share__note");
    const form = h(
      "form.share__body",
      h("p.share__note", HC.t("把別人傳給你的分享連結貼在這裡，卡片和照片會存進你的卡片，之後沒有網路、或連結過期了也看得到。")),
      input,
      msg,
      h("div.share__actions", go, h("button.btn.btn--quiet", { type: "button", onclick: close }, HC.t("取消")))
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = HC.share.parseLink(input.value);
      if (!id) {
        msg.textContent = HC.t("這看起來不是分享連結。分享連結的結尾會是 /s/ 加上一串英文和數字。");
        msg.className = "share__note share__warn";
        input.focus();
        return;
      }
      go.disabled = true;
      go.textContent = HC.t("加入中…");
      try {
        const data = await HC.share.fetch(id);
        const res = await HC.share.saveShared(data);
        close();
        HC.toast(res.existed ? HC.t("這張卡片之前已經加入過了") : HC.t("已加入「{title}」", { title: data.title || HC.t("未命名卡片") }));
        HC.go("#/card/" + res.id);
      } catch (err) {
        go.disabled = false;
        go.textContent = HC.t("加入我的卡片");
        msg.textContent = err.message || HC.t("加入失敗，請稍後再試。");
        msg.className = "share__note share__warn";
      }
    });
    dlg.append(
      h(
        "div.share__head",
        h("h2.share__title", { id: "add-title" }, HC.t("用連結加入卡片")),
        h("button.share__x", { type: "button", "aria-label": HC.t("關閉"), onclick: close }, "×")
      ),
      form
    );
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
    // Fill in a link that is already on the clipboard, when the browser allows reading it.
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard
          .readText()
          .then((t) => {
            if (!input.value && HC.share.parseLink(t)) input.value = t.trim();
          })
          .catch(() => {});
      }
    } catch (e) {}
    input.focus();
  };
})();
