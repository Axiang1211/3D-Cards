/*
 * app.js
 * Small shared helpers, the card repository and the hash router.
 * Routes:  #/            gallery
 *          #/card/<id>   card detail
 *          #/create      new card
 *          #/create/<id> edit one of your cards
 * Hash routing keeps the site working on any static host and from file://.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const CONFIG = window.HC_CONFIG || {};

  /* ------------------------------------------------------------------ */
  /* DOM helper: h("a.btn", { href: "#/" }, "text", childNode)           */
  /* ------------------------------------------------------------------ */
  HC.h = function h(sel, attrs, ...kids) {
    const [tag, ...cls] = sel.split(".");
    const n = document.createElement(tag || "div");
    if (cls.length) n.className = cls.join(" ");
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
        else if (k === "html") n.innerHTML = v;
        else if (k === "dataset") Object.assign(n.dataset, v);
        else if (k in n && typeof v !== "string") n[k] = v;
        else n.setAttribute(k, v === true ? "" : v);
      }
    }
    kids.flat().forEach((c) => {
      if (c == null || c === false) return;
      n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return n;
  };

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */
  let toastTimer = 0;
  HC.toast = function (msg, kind) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "info";
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), kind === "error" ? 5200 : 3200);
  };

  HC.describe = function (card) {
    const frame = (HC.FRAMES.find((f) => f.id === card.frame) || {}).name || "";
    const area = (HC.AREAS.find((a) => a.id === card.area) || {}).name || "";
    const frameText = frame === "無邊框" ? "無邊框" : frame + "框";
    let text;
    if (card.foil === "gloss") text = "亮面，" + frameText;
    else {
      const where = card.frame === "none" && card.area === "frame" ? "整張" : area;
      text = `${HC.foilName(card.foil)}鐳射在${where}，${frameText}`;
    }
    if (card.fg && card.fgFoil && card.fgFoil !== "none") text += `，前景${HC.foilName(card.fgFoil)}鐳射`;
    return text;
  };


  /* ------------------------------------------------------------------ */
  /* Card repository: gallery cards + the visitor's own cards            */
  /* ------------------------------------------------------------------ */
  const gallery = (window.HC_GALLERY || []).map((c) => Object.assign({}, HC.DEFAULTS, c, { own: false }));

  HC.cards = {
    gallery,
    async own() {
      try {
        return await HC.store.list();
      } catch (e) {
        return [];
      }
    },
    async all() {
      return [...(await this.own()), ...gallery];
    },
    async get(id) {
      const g = gallery.find((c) => c.id === id);
      if (g) return g;
      try {
        return await HC.store.get(id);
      } catch (e) {
        return null;
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Gyro button shared by the gallery and the detail page              */
  /* ------------------------------------------------------------------ */
  HC.gyroButton = function (className) {
    const g = HC.gyro;
    const btn = HC.h("button." + (className || "btn btn--line"), { type: "button" });
    const sync = () => {
      let label = null;
      if (!g.available || g.failed) label = null;
      else if (g.enabled && g.receiving) label = "重新校正水平";
      else if (!g.enabled) label = "用手機轉動卡片";
      btn.hidden = !label;
      if (label) btn.textContent = label;
      if (g.receiving) btn.setAttribute("aria-label", "以手機目前的角度作為卡片的水平位置");
      else btn.removeAttribute("aria-label");
    };
    btn.addEventListener("click", async () => {
      if (g.enabled && g.receiving) {
        g.recenter();
        HC.toast("已重新校正");
        return;
      }
      const ok = await g.enable();
      if (!ok) HC.toast("無法使用陀螺儀。請在瀏覽器設定中允許「動作與方向」存取。", "error");
      sync();
    });
    const off = g.onState(sync);
    sync();
    btn._cleanup = off;
    return btn;
  };

  /* ------------------------------------------------------------------ */
  /* Router                                                              */
  /* ------------------------------------------------------------------ */
  HC.views = HC.views || {};
  let current = null;
  let navToken = 0;

  function parse() {
    const hash = location.hash.replace(/^#/, "") || "/";
    let m;
    if ((m = hash.match(/^\/card\/([\w-]+)\/?$/))) return { name: "detail", id: m[1] };
    if ((m = hash.match(/^\/create(?:\/([\w-]+))?\/?$/))) return { name: "create", id: m[1] || null };
    if ((m = hash.match(/^\/s\/([A-Za-z0-9]+)\/?$/))) return { name: "shared", id: m[1] };
    return { name: "gallery" };
  }

  async function render() {
    const token = ++navToken;
    const r = parse();
    const view = document.getElementById("view");
    if (current && current.destroy) current.destroy();
    current = null;
    const next = HC.h("div.view.view--" + r.name);
    document.body.dataset.view = r.name === "shared" ? "detail" : r.name;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.toggleAttribute("aria-current", a.dataset.nav === r.name);
    });
    const ctl = await HC.views[r.name](next, r);
    if (token !== navToken) {
      if (ctl && ctl.destroy) ctl.destroy();
      return;
    }
    view.replaceChildren(next);
    current = ctl;
    if (!(ctl && ctl.keepScroll)) window.scrollTo(0, 0);
    if (ctl && ctl.title) document.title = ctl.title + " | " + (CONFIG.siteName || "Holo Card");
    else document.title = CONFIG.siteName || "Holo Card";
    if (ctl && ctl.focus) ctl.focus();
  }

  function navigate() {
    if (document.startViewTransition && !HC.reducedMotion) {
      document.startViewTransition(() => render());
    } else {
      render();
    }
  }

  HC.go = function (hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  };

  /* A share link (/s/<id> or ?s=<id>) becomes the #/s/<id> route. */
  function adoptShareUrl() {
    const m = location.pathname.match(/\/s\/([A-Za-z0-9]+)\/?$/);
    const q = new URLSearchParams(location.search).get("s");
    const id = m ? m[1] : q && /^[A-Za-z0-9]+$/.test(q) ? q : null;
    if (!id || location.hash) return;
    const base = m ? location.pathname.slice(0, m.index + 1) : location.pathname;
    try {
      history.replaceState(null, "", base + "#/s/" + id);
    } catch (e) {
      location.hash = "#/s/" + id;
    }
  }

  function boot() {
    adoptShareUrl();
    if (window.HC_DESKTOP) document.documentElement.classList.add("is-desktop");
    document.querySelectorAll("[data-site-name]").forEach((n) => (n.textContent = CONFIG.siteName || "Holo Card"));
    const D = window.HC_DESKTOP;
    const links = document.querySelector(".site-foot__links");
    if (D && typeof D.version === "function" && links) {
      const ver = HC.h("span.site-foot__ver", "電腦版");
      const upd = HC.h("button.site-foot__link.site-foot__btn", { type: "button", onclick: () => D.checkForUpdates() }, "檢查更新");
      links.prepend(ver, upd);
      D.version().then((v) => (ver.textContent = "電腦版 " + v)).catch(() => {});
    }
    const dl = document.getElementById("download-link");
    if (dl && CONFIG.downloadUrl && !window.HC_DESKTOP) {
      dl.href = CONFIG.downloadUrl;
      dl.hidden = false;
    }
    const repo = document.getElementById("repo-link");
    if (repo) {
      if (CONFIG.repoUrl) repo.href = CONFIG.repoUrl;
      else repo.hidden = true;
    }
    HC.gyro.autoStart();
    window.addEventListener("hashchange", navigate);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
