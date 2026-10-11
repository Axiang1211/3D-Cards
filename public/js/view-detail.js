/*
 * view-detail.js
 * A darkened viewing room for one card: drag to tilt, tap to flip,
 * try other foils, step through the collection.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  HC.views = HC.views || {};
  const h = (...args) => HC.h(...args);

  HC.views.detail = async function (root, route) {
    const data = await HC.cards.get(route.id);

    if (!data) {
      root.appendChild(
        h(
          "section.room.room--missing",
          h("h1.room__missing-title", HC.t("找不到這張卡片")),
          h(
            "p",
            HC.t("自己做的卡片只存在建立它的瀏覽器裡。若你換了瀏覽器、清除了網站資料，或連結裡的編號打錯了，就會看到這個畫面。")
          ),
          h("a.btn.btn--light", { href: "#/" }, HC.t("回到展廳"))
        )
      );
      return { title: HC.t("找不到卡片") };
    }

    const all = await HC.cards.all();
    const idx = all.findIndex((c) => c.id === data.id);
    const prev = all[(idx - 1 + all.length) % all.length];
    const next = all[(idx + 1) % all.length];
    const cleanups = [];

    const room = h("section.room");

    /* Top bar ----------------------------------------------------------- */
    room.appendChild(
      h(
        "div.room__bar",
        h("a.room__back", { href: "#/" }, h("span", { "aria-hidden": "true" }, "←"), HC.t("展廳")),
        all.length > 1
          ? h(
              "nav.room__pager",
              { "aria-label": HC.t("切換卡片") },
              h("a.room__step", { href: "#/card/" + prev.id, "aria-label": HC.t("上一張：{title}", { title: prev.title || HC.t("未命名") }) }, "‹"),
              h("span.room__pos", `${idx + 1} / ${all.length}`),
              h("a.room__step", { href: "#/card/" + next.id, "aria-label": HC.t("下一張：{title}", { title: next.title || HC.t("未命名") }) }, "›")
            )
          : null
      )
    );

    /* Card -------------------------------------------------------------- */
    const card = new HC.HoloCard(data, { flippable: true, dragTilt: true, maxTilt: 18, restFoil: 0.4 });
    card.el.style.viewTransitionName = "hc-focus";
    const stage = h("div.room__stage", h("div.room__card", card.el));
    room.appendChild(stage);

    /* Info + tools ------------------------------------------------------ */
    const foilPick = h("div.foil-pick", { role: "radiogroup", "aria-label": HC.t("鐳射樣式") });
    HC.FOILS.forEach((f) => {
      const b = h(
        "button.foil-pick__btn",
        { type: "button", role: "radio", "aria-checked": String(f.id === data.foil), dataset: { foil: f.id } },
        h("span.foil-pick__swatch", { "aria-hidden": "true" }),
        f.name
      );
      b.addEventListener("click", () => {
        foilPick.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        card.setData(Object.assign({}, card.data, { foil: f.id }));
        meta.textContent = HC.describe(card.data);
        note.hidden = f.id === data.foil;
      });
      foilPick.appendChild(b);
    });
    const note = h("p.room__note", { hidden: true }, HC.t("只是試看，不會改動卡片。"));

    const turnBtn = data.sand && data.fg ? h("button.btn.btn--light", { type: "button", onclick: () => card.turn() }, HC.t("上下顛倒")) : null;
    const flipBtn = h("button.btn.btn--light", { type: "button", onclick: () => card.flip() }, HC.t("翻到背面"));
    card.el.addEventListener("hc:flip", (e) => (flipBtn.textContent = e.detail ? HC.t("翻回正面") : HC.t("翻到背面")));

    const gyroBtn = HC.gyroButton("btn btn--light");
    cleanups.push(gyroBtn._cleanup);

    const exportBtn = h("button.btn.btn--light", { type: "button" }, HC.t("下載卡片檔"));
    exportBtn.addEventListener("click", async () => {
      exportBtn.disabled = true;
      try {
        await HC.io.exportCard(data);
        HC.toast(HC.t("已下載卡片檔。在任何一台裝置上按「匯入卡片檔」就能打開。"));
      } catch (e) {
        HC.toast(HC.t("無法下載這張卡片。若你是直接開啟本機檔案，請改用本機伺服器瀏覽。"), "error");
      } finally {
        exportBtn.disabled = false;
      }
    });

    const shareBtn = h("button.btn.btn--share", { type: "button" }, HC.t("分享"));
    const syncShare = () => {
      const cur = data.own && HC.share.current(data);
      shareBtn.textContent = cur ? HC.t("分享中・查看連結") : HC.t("分享");
      shareBtn.title = cur && cur.expiresAt ? HC.t("連結會在 {date}失效。", { date: HC.share.expiryText(cur.expiresAt) }) : "";
    };
    shareBtn.addEventListener("click", () => HC.openShare(data, syncShare));
    syncShare();

    const fsBtn = h("button.btn.btn--light", { type: "button", onclick: () => HC.openFullscreen(card.data) }, HC.t("全螢幕"));
    // Phone: the main actions stay reachable at the bottom of the screen.
    const dockShare = h("button.btn.btn--share", { type: "button", onclick: () => HC.openShare(data, syncShare) }, HC.t("分享"));
    const dock = h(
      "div.room__dock",
      dockShare,
      h("button.btn.btn--light", { type: "button", onclick: () => HC.openFullscreen(card.data) }, HC.t("全螢幕")),
      h("button.btn.btn--light", { type: "button", onclick: () => card.flip() }, HC.t("翻面")),
      data.sand && data.fg ? h("button.btn.btn--light", { type: "button", onclick: () => card.turn() }, HC.t("顛倒")) : null
    );

    let ownTools = null;
    if (data.own) {
      const del = h("button.btn.btn--danger", { type: "button" }, HC.t("刪除"));
      let armed = 0;
      del.addEventListener("click", async () => {
        if (!armed) {
          del.textContent = HC.t("再按一次刪除");
          del.classList.add("is-armed");
          armed = setTimeout(() => {
            armed = 0;
            del.textContent = HC.t("刪除");
            del.classList.remove("is-armed");
          }, 3500);
          return;
        }
        clearTimeout(armed);
        await HC.store.remove(data.id);
        if (HC.cloud) HC.cloud.noteDeleted(data.id);
        HC.toast(HC.t("已刪除「{title}」", { title: data.title || HC.t("未命名卡片") }));
        HC.go("#/");
      });
      ownTools = h("div.room__own", h("a.btn.btn--light", { href: "#/create/" + data.id }, HC.t("編輯")), del);
    }

    const meta = h("p.placard__meta", HC.describe(data));
    room.appendChild(
      h(
        "div.room__info",
        h(
          "div.placard.placard--room",
          h("h1.placard__title", data.title || HC.t("未命名卡片")),
          data.subtitle ? h("p.placard__sub", data.subtitle) : null,
          meta,
          data.own
            ? h("p.placard__own", data.fromShare ? HC.t("從分享連結加入的卡片，已經存在你這裡，連結過期也看得到。") : window.HC_DESKTOP ? HC.t("你做的卡片，存在這台電腦的 3D Cards 裡。") : HC.t("你做的卡片，只存在這個瀏覽器裡。"))
            : null
        ),
        h("div.room__tools", foilPick, note, h("div.room__actions", shareBtn, fsBtn, flipBtn, turnBtn, gyroBtn, exportBtn), ownTools),
        h(
          "p.room__hint",
          h("span.hint-desk", HC.t("移動滑鼠或拖曳來傾斜卡片，點一下翻面。方向鍵也能傾斜。")),
          h("span.hint-touch", HC.t("用手指拖曳或轉動手機來傾斜卡片，點一下翻面。"))
        )
      )
    );
    root.appendChild(room);
    root.appendChild(dock);

    /* Keyboard: [ and ] or PageUp/PageDown step through the collection. */
    const onKey = (e) => {
      if (e.target.closest("input, textarea, select")) return;
      if (document.querySelector("dialog[open]")) return;
      if (all.length < 2) return;
      if (e.key === "[" || e.key === "PageUp") HC.go("#/card/" + prev.id);
      if (e.key === "]" || e.key === "PageDown") HC.go("#/card/" + next.id);
      if (e.key === "Escape") HC.go("#/");
    };
    document.addEventListener("keydown", onKey);

    /* Swipe sideways on the empty part of the stage to change card. */
    let sx = null;
    stage.addEventListener("touchstart", (e) => {
      sx = e.target.closest(".hc") ? null : e.touches[0].clientX;
    }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (sx == null || all.length < 2) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) HC.go("#/card/" + (dx < 0 ? next.id : prev.id));
      sx = null;
    });

    return {
      title: data.title || HC.t("未命名卡片"),
      destroy() {
        card.destroy();
        document.removeEventListener("keydown", onKey);
        cleanups.forEach((f) => f && f());
      },
    };
  };
})();
