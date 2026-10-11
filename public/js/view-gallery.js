/*
 * view-gallery.js
 * Home page: one large live card, then the exhibition wall.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  HC.views = HC.views || {};
  const h = (...args) => HC.h(...args);

  let lastFilter = "all";
  let lastScroll = 0;

  function placard(card) {
    return h(
      "div.placard",
      h("p.placard__title", card.title || "未命名卡片"),
      card.subtitle && card.showText === false ? h("p.placard__sub", card.subtitle) : null,
      h("p.placard__meta", HC.describe(card))
    );
  }

  HC.views.gallery = async function (root) {
    const CONFIG = window.HC_CONFIG || {};
    const cards = [];
    const wallCards = [];
    const cleanups = [];
    const own = await HC.cards.own();
    const gal = HC.cards.gallery;

    /* Hero -------------------------------------------------------------- */
    const featured = gal.find((c) => c.id === CONFIG.featured) || gal[0];
    const hero = h("section.hero");
    const copy = h(
      "div.hero__copy",
      h("h1.hero__title", "把照片做成", h("br"), "會反光的卡片"),
      h(
        "p.hero__lead",
        "上傳一張照片，選一種鐳射。卡片會跟著滑鼠傾斜、跟著手機轉動，光澤會一路流過畫面。"
      ),
      h(
        "div.hero__actions",
        h("a.btn.btn--ink", { href: "#/create" }, "上傳照片製作"),
        h(
          "button.btn.btn--line",
          {
            type: "button",
            onclick: () => wall.scrollIntoView({ behavior: HC.reducedMotion ? "auto" : "smooth", block: "start" }),
          },
          "看看展廳"
        )
      ),
      h("p.hero__note", "照片只在你的瀏覽器裡處理，不會上傳到任何伺服器。")
    );
    hero.appendChild(copy);

    if (featured) {
      const stage = h("div.hero__stage");
      const link = h("a.hero__card", { href: "#/card/" + featured.id, "aria-label": "查看「" + featured.title + "」" });
      const card = new HC.HoloCard(featured, { idle: true, maxTilt: 16 });
      link.appendChild(card.el);
      cards.push(card);
      stage.appendChild(link);
      const gyroBtn = HC.gyroButton("btn btn--ghost hero__gyro");
      cleanups.push(gyroBtn._cleanup);
      stage.appendChild(
        h(
          "div.hero__hint",
          h("span.hint-desk", "把滑鼠移到卡片上"),
          h("span.hint-touch", "轉動手機看看光澤"),
          gyroBtn
        )
      );
      hero.appendChild(stage);
    }
    root.appendChild(hero);

    /* Wall -------------------------------------------------------------- */
    const wall = h("section.exhibit", { "aria-labelledby": "exhibit-title" });
    const filters = [
      { id: "all", label: "全部", count: own.length + gal.length },
      { id: "gallery", label: "示範作品", count: gal.length },
      { id: "own", label: "我的卡片", count: own.length },
    ];
    if (!own.length && lastFilter === "own") lastFilter = "all";
    const seg = h("div.seg", { role: "radiogroup", "aria-label": "篩選卡片" });
    filters.forEach((f) => {
      const b = h(
        "button.seg__btn",
        { type: "button", role: "radio", "aria-checked": String(f.id === lastFilter), dataset: { f: f.id } },
        f.label,
        h("span.seg__count", String(f.count))
      );
      b.addEventListener("click", () => {
        lastFilter = f.id;
        seg.querySelectorAll(".seg__btn").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        fill();
      });
      seg.appendChild(b);
    });

    const importInput = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    importInput.addEventListener("change", async () => {
      const file = importInput.files[0];
      importInput.value = "";
      if (!file) return;
      try {
        const rec = await HC.io.importFile(file);
        const id = await HC.store.put(rec);
        HC.toast("已匯入「" + (rec.title || "未命名卡片") + "」");
        HC.go("#/card/" + id);
      } catch (e) {
        HC.toast(e.message || "匯入失敗。", "error");
      }
    });

    wall.appendChild(
      h(
        "div.exhibit__head",
        h("h2.exhibit__title", { id: "exhibit-title" }, "展廳"),
        seg,
        h("button.btn.btn--quiet", { type: "button", onclick: () => importInput.click() }, "匯入卡片檔"),
        importInput
      )
    );
    const grid = h("ol.wall");
    wall.appendChild(grid);
    root.appendChild(wall);

    function fill() {
      wallCards.splice(0).forEach((c) => c.destroy());
      grid.replaceChildren();
      const list = lastFilter === "own" ? own : lastFilter === "gallery" ? gal : [...own, ...gal];
      if (!list.length) {
        grid.appendChild(
          h(
            "li.wall__empty",
            h("p", "你還沒有自己的卡片。上傳一張照片，一分鐘內就能做好。"),
            h("a.btn.btn--ink", { href: "#/create" }, "上傳照片製作"),
            !HC.store.persistent ? h("p.wall__warn", "這個瀏覽器不允許儲存資料，做好的卡片在關閉分頁後會消失。") : null
          )
        );
        return;
      }
      list.forEach((data) => {
        const card = new HC.HoloCard(data, { maxTilt: 12 });
        wallCards.push(card);
        const link = h("a.piece__link", { href: "#/card/" + data.id, "aria-label": "查看「" + (data.title || "未命名卡片") + "」" }, card.el);
        link.addEventListener("click", () => {
          lastScroll = window.scrollY;
          card.el.style.viewTransitionName = "hc-focus";
        });
        grid.appendChild(
          h("li.piece", data.own ? { dataset: { own: "" } } : null, link, placard(data), data.own ? h("span.piece__tag", "我的") : null)
        );
      });
    }
    fill();

    if (own.length && !HC.store.persistent) {
      HC.toast("這個瀏覽器不允許儲存資料，做好的卡片在關閉分頁後會消失。");
    }

    const restore = lastScroll;
    lastScroll = 0;
    return {
      keepScroll: !!restore,
      focus() {
        if (restore) requestAnimationFrame(() => window.scrollTo(0, restore));
      },
      destroy() {
        cards.concat(wallCards).forEach((c) => c.destroy());
        cleanups.forEach((f) => f && f());
      },
    };
  };
})();
