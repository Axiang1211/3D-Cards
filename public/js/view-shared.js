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
          h("h1.room__missing-title", "看不到這張卡片"),
          h("p", e.message || "這張分享的卡片不存在，可能已被刪除。"),
          h("div.room__actions", h("a.btn.btn--light", { href: "#/" }, "去展廳看看"), h("a.btn.btn--light", { href: "#/create" }, "自己做一張"))
        )
      );
      return { title: "看不到這張卡片" };
    }

    const cleanups = [];
    const room = h("section.room");
    room.appendChild(h("div.room__bar", h("a.room__back", { href: "#/" }, h("span", { "aria-hidden": "true" }, "←"), "展廳")));

    const card = new HC.HoloCard(data, { flippable: true, dragTilt: true, maxTilt: 18, restFoil: 0.4 });
    room.appendChild(h("div.room__stage", h("div.room__card", card.el)));

    const saveBtn = h("button.btn.btn--light", { type: "button" }, "存到我的卡片");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        const rec = await HC.io.recordFromCard(data);
        const id = await HC.store.put(rec);
        HC.toast("已存到「我的卡片」");
        HC.go("#/card/" + id);
      } catch (e) {
        saveBtn.disabled = false;
        HC.toast("儲存失敗：瀏覽器的儲存空間可能已滿。", "error");
      }
    });

    const flipBtn = h("button.btn.btn--light", { type: "button", onclick: () => card.flip() }, "翻到背面");
    card.el.addEventListener("hc:flip", (e) => (flipBtn.textContent = e.detail ? "翻回正面" : "翻到背面"));
    const gyroBtn = HC.gyroButton("btn btn--light");
    cleanups.push(gyroBtn._cleanup);
    const shareBtn = h("button.btn.btn--share", { type: "button", onclick: () => HC.openShare(data) }, "分享");

    room.appendChild(
      h(
        "div.room__info",
        h(
          "div.placard.placard--room",
          h("p.placard__from", "有人分享了一張卡片給你"),
          h("h1.placard__title", data.title || "未命名卡片"),
          data.subtitle ? h("p.placard__sub", data.subtitle) : null,
          h("p.placard__meta", HC.describe(data))
        ),
        h("div.room__tools", h("div.room__actions", shareBtn, flipBtn, gyroBtn), h("div.room__actions", saveBtn, h("a.btn.btn--light", { href: "#/create" }, "自己做一張"))),
        h(
          "p.room__hint",
          h("span.hint-desk", "移動滑鼠或拖曳來傾斜卡片，點一下翻面。"),
          h("span.hint-touch", "用手指拖曳或轉動手機來傾斜卡片，點一下翻面。")
        )
      )
    );
    root.appendChild(room);

    return {
      title: data.title || "分享的卡片",
      destroy() {
        card.destroy();
        cleanups.forEach((f) => f && f());
      },
    };
  };
})();
