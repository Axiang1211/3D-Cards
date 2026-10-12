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
      h("p.placard__title", card.title || HC.t("未命名卡片")),
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
      h("h1.hero__title", HC.t("把照片做成"), h("br"), HC.t("會反光的卡片")),
      h(
        "p.hero__lead",
        HC.t("上傳一張照片，選一種鐳射。卡片會跟著滑鼠傾斜、跟著手機轉動，光澤會一路流過畫面。")
      ),
      h(
        "div.hero__actions",
        h("a.btn.btn--ink", { href: "#/create" }, HC.t("上傳照片製作")),
        h(
          "button.btn.btn--line",
          {
            type: "button",
            onclick: () => wall.scrollIntoView({ behavior: HC.reducedMotion ? "auto" : "smooth", block: "start" }),
          },
          HC.t("看看展廳")
        )
      ),
      h("p.hero__note", HC.t("照片只在你的瀏覽器裡處理。只有在你按下「分享」時，那張卡片才會上傳。")),
      CONFIG.downloadUrl && !window.HC_DESKTOP
        ? h(
            "p.hero__download.only-desk",
            h("a", { href: CONFIG.downloadUrl, rel: "noopener" }, HC.t("下載 Windows 電腦版")),
            h("span", HC.t("安裝後不用開瀏覽器也能做卡片"))
          )
        : null,
      CONFIG.apkUrl && !window.HC_DESKTOP && /Android/i.test(navigator.userAgent)
        ? h(
            "p.hero__download",
            h("a", { href: CONFIG.apkUrl, rel: "noopener" }, HC.t("下載 Android App")),
            h("button.hero__install", { type: "button", onclick: () => HC.pwa && HC.pwa.install() }, HC.t("或直接安裝網頁版 App"))
          )
        : null
    );
    hero.appendChild(copy);

    if (featured) {
      const stage = h("div.hero__stage");
      const link = h("a.hero__card", { href: "#/card/" + featured.id, "aria-label": HC.t("查看「{title}」", { title: featured.title }) });
      const card = new HC.HoloCard(featured, { idle: true, maxTilt: 16 });
      link.appendChild(card.el);
      cards.push(card);
      stage.appendChild(link);
      const gyroBtn = HC.gyroButton("btn btn--ghost hero__gyro");
      cleanups.push(gyroBtn._cleanup);
      stage.appendChild(
        h(
          "div.hero__hint",
          h("span.hint-desk", HC.t("把滑鼠移到卡片上")),
          h("span.hint-touch", HC.t("轉動手機看看光澤")),
          gyroBtn
        )
      );
      hero.appendChild(stage);
    }
    root.appendChild(hero);

    /* Wall -------------------------------------------------------------- */
    const wall = h("section.exhibit", { "aria-labelledby": "exhibit-title" });
    const filters = [
      { id: "all", label: HC.t("全部"), count: own.length + gal.length },
      { id: "gallery", label: HC.t("示範作品"), count: gal.length },
      { id: "own", label: HC.t("我的卡片"), count: own.length },
    ];
    if (!own.length && lastFilter === "own") lastFilter = "all";
    const seg = h("div.seg", { role: "radiogroup", "aria-label": HC.t("篩選卡片") });
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

    const importInput = h("input", { type: "file", accept: ".3dcard,.json,application/json", hidden: true });
    importInput.addEventListener("change", async () => {
      const file = importInput.files[0];
      importInput.value = "";
      if (!file) return;
      try {
        const res = await HC.io.saveImported(await file.text());
        HC.toast(res.existed ? HC.t("這張卡片之前已經加入過了") : HC.t("已匯入「{title}」", { title: res.title || HC.t("未命名卡片") }));
        HC.go("#/card/" + res.id);
      } catch (e) {
        HC.toast(e.message || HC.t("匯入失敗。"), "error");
      }
    });

    wall.appendChild(
      h(
        "div.exhibit__head",
        h("h2.exhibit__title", { id: "exhibit-title" }, HC.t("展廳")),
        seg,
        HC.cloud && HC.cloud.available
          ? h("button.btn.btn--quiet", { type: "button", onclick: () => HC.openCloud(() => HC.go("#/")) }, HC.cloud.signedIn ? HC.t("雲端同步") : HC.t("用 Google 同步"))
          : null,
        h("button.btn.btn--quiet", { type: "button", onclick: () => HC.openAddByLink() }, HC.t("用連結加入")),
        h("button.btn.btn--quiet", { type: "button", onclick: () => importInput.click() }, HC.t("匯入卡片檔")),
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
            h("p", HC.t("你還沒有自己的卡片。上傳一張照片，一分鐘內就能做好。")),
            h("a.btn.btn--ink", { href: "#/create" }, HC.t("上傳照片製作")),
            !HC.store.persistent ? h("p.wall__warn", HC.t("這個瀏覽器不允許儲存資料，做好的卡片在關閉分頁後會消失。")) : null
          )
        );
        return;
      }
      list.forEach((data) => {
        const card = new HC.HoloCard(data, { maxTilt: 12 });
        wallCards.push(card);
        const link = h("a.piece__link", { href: "#/card/" + data.id, "aria-label": HC.t("查看「{title}」", { title: data.title || HC.t("未命名卡片") }) }, card.el);
        link.addEventListener("click", () => {
          lastScroll = window.scrollY;
          card.el.style.viewTransitionName = "hc-focus";
        });
        grid.appendChild(
          h("li.piece", data.own ? { dataset: { own: "" } } : null, link, placard(data), data.own ? h("span.piece__tag", HC.t("我的")) : null)
        );
      });
    }
    fill();

    if (own.length && !HC.store.persistent) {
      HC.toast(HC.t("這個瀏覽器不允許儲存資料，做好的卡片在關閉分頁後會消失。"));
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
