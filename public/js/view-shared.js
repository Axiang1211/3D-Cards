/*
 * view-shared.js
 * A card someone shared with a link (/s/<id>, routed as #/s/<id>).
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  HC.views = HC.views || {};
  const h = (...args) => HC.h(...args);

  HC.views.shared = async function (root, route) {
    let data;
    try {
      data = await HC.share.fetch(route.id);
    } catch (e) {
      root.appendChild(
        h(
          "section.room.room--missing",
          h("h1.room__missing-title", HC.t("看不到這張卡片")),
          h("p", e.message || HC.t("這張分享的卡片不存在，可能已被刪除。")),
          h("div.room__actions", h("a.btn.btn--light", { href: "#/" }, HC.t("去展廳看看")), h("a.btn.btn--light", { href: "#/create" }, HC.t("自己做一張")))
        )
      );
      return { title: HC.t("看不到這張卡片") };
    }

    const cleanups = [];
    const room = h("section.room");
    room.appendChild(h("div.room__bar", h("a.room__back", { href: "#/" }, h("span", { "aria-hidden": "true" }, "←"), HC.t("展廳"))));

    const card = new HC.HoloCard(data, { flippable: true, dragTilt: true, maxTilt: 18, restFoil: 0.4 });
    room.appendChild(h("div.room__stage", h("div.room__card", card.el)));

    const saveBtn = h("button.btn.btn--light", { type: "button" }, HC.t("存到我的卡片"));
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        const res = await HC.share.saveShared(data);
        HC.toast(res.existed ? HC.t("這張卡片之前已經存過了") : HC.t("已存到「我的卡片」"));
        HC.go("#/card/" + res.id);
      } catch (e) {
        saveBtn.disabled = false;
        HC.toast(HC.t("儲存失敗：儲存空間可能已滿。"), "error");
      }
    });

    const turnBtn = data.sand && data.fg ? h("button.btn.btn--light", { type: "button", onclick: () => card.turn() }, HC.t("上下顛倒")) : null;
    const flipBtn = h("button.btn.btn--light", { type: "button", onclick: () => card.flip() }, HC.t("翻到背面"));
    card.el.addEventListener("hc:flip", (e) => (flipBtn.textContent = e.detail ? HC.t("翻回正面") : HC.t("翻到背面")));
    const gyroBtn = HC.gyroButton("btn btn--light");
    cleanups.push(gyroBtn._cleanup);
    const shareBtn = h("button.btn.btn--share", { type: "button", onclick: () => HC.openShare(data) }, HC.t("分享"));
    const fsBtn = h("button.btn.btn--light", { type: "button", onclick: () => HC.openFullscreen(card.data) }, HC.t("全螢幕"));
    const dock = h(
      "div.room__dock",
      h("button.btn.btn--share", { type: "button", onclick: () => HC.openShare(data) }, HC.t("分享")),
      h("button.btn.btn--light", { type: "button", onclick: () => HC.openFullscreen(card.data) }, HC.t("全螢幕")),
      h("button.btn.btn--light", { type: "button", onclick: saveBtn.onclick || (() => saveBtn.click()) }, HC.t("收藏"))
    );

    room.appendChild(
      h(
        "div.room__info",
        h(
          "div.placard.placard--room",
          h("p.placard__from", HC.t("有人分享了一張卡片給你")),
          h("h1.placard__title", data.title || HC.t("未命名卡片")),
          data.subtitle ? h("p.placard__sub", data.subtitle) : null,
          h("p.placard__meta", HC.describe(data)),
          data.expiresAt ? h("p.placard__own", HC.t("這個分享連結會在 {date}失效。喜歡的話可以存到你的卡片。", { date: HC.share.expiryText(data.expiresAt) })) : null
        ),
        h("div.room__tools", h("div.room__actions", shareBtn, fsBtn, flipBtn, turnBtn, gyroBtn), h("div.room__actions", saveBtn, h("a.btn.btn--light", { href: "#/create" }, HC.t("自己做一張")))),
        h(
          "p.room__hint",
          h("span.hint-desk", HC.t("移動滑鼠或拖曳來傾斜卡片，點一下翻面。")),
          h("span.hint-touch", HC.t("用手指拖曳或轉動手機來傾斜卡片，點一下翻面。"))
        )
      )
    );
    root.appendChild(room);
    root.appendChild(dock);

    return {
      title: data.title || HC.t("分享的卡片"),
      destroy() {
        card.destroy();
        cleanups.forEach((f) => f && f());
      },
    };
  };
})();
