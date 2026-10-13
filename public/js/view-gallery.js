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
      !window.HC_DESKTOP
        ? h(
            "p.hero__download",
            h("a", { href: "#/download" }, HC.t("下載 App")),
            h("span", HC.t("Windows、Mac、Android，安裝後不用開瀏覽器也能做卡片"))
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
    // Public gallery cards load in the background; until then they count as "…".
    let pub = null;
    let pubFailed = false;
    let alive = true;
    const pubCount = () => (pub ? String(pub.length) : "…");
    const filters = [
      { id: "all", label: HC.t("全部"), count: () => (pub ? String(own.length + gal.length + pub.length) : String(own.length + gal.length)) },
      { id: "gallery", label: HC.t("示範"), count: () => String(gal.length) },
      { id: "public", label: HC.t("公開"), count: pubCount },
      { id: "own", label: HC.t("我的"), count: () => String(own.length) },
    ];
    if (!own.length && lastFilter === "own") lastFilter = "all";
    const seg = h("div.seg", { role: "radiogroup", "aria-label": HC.t("篩選卡片") });
    const counts = {};
    filters.forEach((f) => {
      counts[f.id] = h("span.seg__count", f.count());
      const b = h(
        "button.seg__btn",
        { type: "button", role: "radio", "aria-checked": String(f.id === lastFilter), dataset: { f: f.id } },
        f.label,
        counts[f.id]
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

    const PUB_MAX = 24; // the rest is on the public gallery page
    function fill() {
      wallCards.splice(0).forEach((c) => c.destroy());
      grid.replaceChildren();
      const pubList = (pub || []).slice(0, PUB_MAX);
      const list = lastFilter === "own" ? own : lastFilter === "gallery" ? gal : lastFilter === "public" ? pubList : [...own, ...gal, ...pubList];
      const more = (lastFilter === "public" || lastFilter === "all") && pub && pub.length > PUB_MAX;
      if (lastFilter === "public" && !list.length) {
        grid.appendChild(
          h(
            "li.wall__empty",
            h("p", pub ? HC.t("還沒有公開的卡片。成為第一個分享的人吧！") : pubFailed ? HC.t("現在無法載入公開展廳，請稍後再試。") : HC.t("載入中…")),
            pub ? h("a.btn.btn--ink", { href: "#/public" }, HC.t("前往公開展廳")) : null
          )
        );
        return;
      }
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
        const it = data._pub;
        const card = new HC.HoloCard(data, { maxTilt: 12 });
        wallCards.push(card);
        const link = h(
          "a.piece__link",
          { href: it ? "#/p/" + it.id : "#/card/" + data.id, "aria-label": HC.t("查看「{title}」", { title: data.title || HC.t("未命名卡片") }) },
          card.el
        );
        link.addEventListener("click", () => {
          lastScroll = window.scrollY;
          if (!it) card.el.style.viewTransitionName = "hc-focus";
        });
        const tag = data.own ? h("span.piece__tag", HC.t("我的")) : it ? h("span.piece__tag.piece__tag--pub", HC.t("公開")) : null;
        grid.appendChild(h("li.piece", data.own ? { dataset: { own: "" } } : null, link, it ? pubPlacard(it) : placard(data), tag));
      });
      if (more) {
        grid.appendChild(h("li.wall__more", h("a.btn.btn--line", { href: "#/public" }, HC.t("在公開展廳看全部 {n} 張", { n: pub.length }))));
      }
    }

    function pubPlacard(it) {
      return h(
        "div.placard",
        h("p.placard__title", it.title || HC.t("未命名卡片")),
        h("p.placard__meta.pub-meta", HC.pub.sourceTag(it), h("span", HC.t("來自 {name}", { name: it.author || "?" }))),
        h("p.placard__meta", HC.t("{n} 個讚", { n: it.likes || 0 }))
      );
    }

    fill();

    if (HC.pub && HC.account) {
      HC.account
        .call("GET", "/api/public?sort=hot", null, { optional: true })
        .then((d) => {
          pub = (d.items || []).map((it) => Object.assign(HC.pub.cardData(it), { _pub: it }));
        })
        .catch(() => {
          pubFailed = true;
          pub = null;
        })
        .then(() => {
          if (!alive) return;
          filters.forEach((f) => (counts[f.id].textContent = f.count()));
          if (pubFailed) counts.public.textContent = "–";
          if (lastFilter === "public" || (lastFilter === "all" && pub && pub.length)) {
            // Keep the reader's place when the wall grows under them.
            const y = window.scrollY;
            fill();
            window.scrollTo(0, y);
          }
        });
    } else {
      counts.public.closest(".seg__btn").hidden = true;
    }

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
        alive = false;
        cards.concat(wallCards).forEach((c) => c.destroy());
        cleanups.forEach((f) => f && f());
      },
    };
  };
})();
