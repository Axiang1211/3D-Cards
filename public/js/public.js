/*
 * public.js
 * The public gallery: cards people chose to show everyone, after review.
 *
 *   #/public       the gallery, sorted by recommended / most liked / newest
 *   #/p/<id>       one card: author, date, likes and dislikes, take-down notice
 *   #/admin        review (site owner only)
 *
 * Also: HC.pub.submit(card) — "show in the public gallery" from your own card,
 * and HC.pub.mine() — your submissions and where they stand.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  HC.views = HC.views || {};
  const h = (...a) => HC.h(...a);
  const T = (s, p) => HC.t(s, p);
  const CFG = () => window.HC_CONFIG || {};
  const base = () => (HC.share ? HC.share.apiBase() : location.origin);

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  function dateText(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return HC.lang === "en"
      ? d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })
      : `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  }

  /** A public item as card data for HC.HoloCard. */
  function cardData(it) {
    const c = it.card || {};
    return Object.assign({}, HC.DEFAULTS, c, {
      id: "p-" + it.id,
      pubId: it.id,
      title: it.title || c.title || "",
      subtitle: it.subtitle || c.subtitle || "",
      image: c.image ? base() + c.image : "",
      fg: c.fg ? base() + c.fg : "",
      own: false,
      public: true,
    });
  }

  const ICON = {
    up: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7"/>',
    down: '<path d="M7 13V4H4v9z"/><path d="M7 13l4 7a2 2 0 0 0 3-2l-1-4h5.5a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.3 4H7"/>',
  };
  function ico(name) {
    const s = h("span.vote__ico", { "aria-hidden": "true" });
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
    return s;
  }

  /** 原創 / 轉載 label. */
  function sourceTag(it) {
    const repost = it.source === "repost";
    return h(
      "span.pub-tag" + (repost ? ".pub-tag--repost" : ".pub-tag--original"),
      { title: repost ? T("作者分享的公開照片，版權方要求時會下架。") : T("作者自己拍攝或創作的照片。") },
      repost ? T("轉載") : T("原創")
    );
  }

  function notice() {
    const url = CFG().contactUrl;
    return h(
      "p.pub-notice",
      T("展出的作品由使用者分享，版權屬於原作者。若有版權爭議，請聯繫我們刪除。"),
      url
        ? /^mailto:/i.test(url)
          ? [" ", T("聯繫信箱："), h("a", { href: url }, decodeURIComponent(url.slice(7).split("?")[0]))]
          : [" ", h("a", { href: url, rel: "noopener", target: "_blank" }, T("聯繫刪除"))]
        : null
    );
  }

  /** Like / dislike buttons. Signed-out visitors are asked to sign in first. */
  function votes(it, onChange) {
    const up = h("button.vote.vote--up", { type: "button" }, ico("up"), h("span.vote__n"));
    const down = h("button.vote.vote--down", { type: "button" }, ico("down"), h("span.vote__n"));
    const wrap = h("div.votes", { role: "group", "aria-label": T("評價") }, up, down);
    const sync = () => {
      up.querySelector(".vote__n").textContent = String(it.likes || 0);
      down.querySelector(".vote__n").textContent = String(it.dislikes || 0);
      up.setAttribute("aria-pressed", String(it.myVote === 1));
      down.setAttribute("aria-pressed", String(it.myVote === -1));
      up.setAttribute("aria-label", T("讚（{n}）", { n: it.likes || 0 }));
      down.setAttribute("aria-label", T("倒讚（{n}）", { n: it.dislikes || 0 }));
      up.disabled = down.disabled = !!it.mine;
      wrap.title = it.mine ? T("不能替自己的卡片投票。") : "";
    };
    async function cast(v) {
      if (!(await HC.account.signIn())) return;
      const value = it.myVote === v ? 0 : v;
      up.disabled = down.disabled = true;
      try {
        const r = await HC.account.call("POST", `/api/public/${it.id}/vote`, { value });
        Object.assign(it, r);
        if (onChange) onChange(it);
      } catch (e) {
        HC.toast(e.message, "error");
      } finally {
        sync();
      }
    }
    up.addEventListener("click", () => cast(1));
    down.addEventListener("click", () => cast(-1));
    sync();
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Submitting your own card                                            */
  /* ------------------------------------------------------------------ */
  let mineCache = null;
  async function mine(force) {
    if (!HC.cloud || !HC.cloud.signedIn) return [];
    if (mineCache && !force) return mineCache;
    try {
      mineCache = (await HC.account.call("GET", "/api/public/mine")).items || [];
    } catch (e) {
      mineCache = [];
    }
    return mineCache;
  }

  /** Where one of your cards stands: null, or { status, id, likes, note }. */
  async function statusOf(card) {
    const list = await mine();
    return list.find((x) => x.card_id === card.id) || null;
  }

  function statusText(s) {
    if (!s) return "";
    if (s.status === "pending") return T("公開展廳：審核中");
    if (s.status === "approved") return T("公開展廳：已公開，{n} 個讚", { n: s.likes || 0 });
    if (s.status === "rejected") return T("公開展廳：沒有通過審核") + (s.note ? T("（{note}）", { note: s.note }) : "");
    return "";
  }

  async function submit(card) {
    if (!card || !card.own) return;
    if (!(await HC.account.signIn())) return;
    const who = await HC.account.ensureName();
    if (!who || !who.name) return;
    const done = await new Promise((resolve) => {
      const dlg = h("dialog.share", { "aria-labelledby": "pub-title" });
      // Either statement is enough; the choice is shown on the card as 原創 / 轉載.
      const original = h("input", { type: "radio", name: "pub-source", value: "original" });
      const repost = h("input", { type: "radio", name: "pub-source", value: "repost" });
      const go = h("button.btn.btn--ink", { type: "submit", disabled: true }, T("送出審核"));
      const msg = h("p.share__note", { role: "status" });
      [original, repost].forEach((r) => r.addEventListener("change", () => (go.disabled = !(original.checked || repost.checked))));
      let ok = false;
      const form = h(
        "form.share__body",
        h("p.share__note", T("「{title}」會以「{name}」的名義送出。管理員審核通過後，所有人都能在公開展廳看到它，並按讚或倒讚。", { title: card.title || T("未命名卡片"), name: who.name })),
        h("p.share__note", T("照片會加上看不見的浮水印，記錄是誰上傳的。")),
        h(
          "fieldset.pub-source",
          h("legend.pub-source__legend", T("選一個符合的說明：")),
          h("label.check.check--top", original, h("span", h("b.pub-tag.pub-tag--original", T("原創")), T("這張卡片的照片是我拍攝或創作的，或我有權公開它，沒有侵犯別人的版權。"))),
          h("label.check.check--top", repost, h("span", h("b.pub-tag.pub-tag--repost", T("轉載")), T("這張卡片是我分享的公開照片。若版權方要求下架，我願意接受下架要求。")))
        ),
        msg,
        h("div.share__actions", go, h("button.btn.btn--quiet", { type: "button", onclick: () => dlg.close() }, T("取消")))
      );
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        go.disabled = true;
        msg.className = "share__note";
        msg.textContent = T("正在上傳…");
        try {
          const payload = await HC.io.payload(card, { forUpload: true });
          await HC.account.call("POST", "/api/public", { card: payload, cardId: card.id, source: repost.checked ? "repost" : "original" });
          ok = true;
          dlg.close();
        } catch (err) {
          go.disabled = false;
          msg.textContent = err.message;
          msg.className = "share__note share__warn";
        }
      });
      dlg.append(h("div.share__head", h("h2.share__title", { id: "pub-title" }, T("公開到展廳")), h("button.share__x", { type: "button", "aria-label": T("關閉"), onclick: () => dlg.close() }, "×")), form);
      dlg.addEventListener("close", () => {
        dlg.remove();
        resolve(ok);
      });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
    if (done) {
      mineCache = null;
      HC.toast(T("已送出審核。通過後會出現在公開展廳。"));
    }
    return done;
  }

  async function withdraw(id) {
    const ok = HC.appConfirm
      ? await HC.appConfirm({ title: T("從公開展廳下架？"), text: T("卡片會從公開展廳移除，讚和倒讚也會一起清除。你自己的卡片不受影響。"), ok: T("下架"), danger: true })
      : confirm(T("從公開展廳下架？"));
    if (!ok) return false;
    try {
      await HC.account.call("DELETE", "/api/public/" + id);
      mineCache = null;
      HC.toast(T("已下架"));
      return true;
    } catch (e) {
      HC.toast(e.message, "error");
      return false;
    }
  }

  /** A line for your own card's page: its public gallery status, and the button. */
  function ownCardPanel(card, cls) {
    const line = h("p.pub-status", { hidden: true });
    const btn = h("button." + (cls || "btn btn--light"), { type: "button" }, T("公開到展廳"));
    const wrap = h("div.pub-own", btn, line);
    async function sync() {
      const s = await statusOf(card).catch(() => null);
      line.hidden = !s;
      line.textContent = statusText(s);
      if (s && s.status === "approved") {
        btn.textContent = T("在公開展廳查看");
        btn.onclick = () => HC.go("#/p/" + s.id);
      } else if (s && s.status === "pending") {
        btn.textContent = T("取消送審");
        btn.onclick = async () => (await withdraw(s.id)) && sync();
      } else {
        btn.textContent = s && s.status === "rejected" ? T("修改後重新送審") : T("公開到展廳");
        btn.onclick = async () => (await submit(card)) && sync();
      }
    }
    if (HC.cloud && HC.cloud.available) sync();
    else wrap.hidden = true;
    return wrap;
  }

  HC.pub = { submit, mine, statusOf, ownCardPanel, cardData, votes, notice, dateText, sourceTag };

  /* ------------------------------------------------------------------ */
  /* Gallery page                                                        */
  /* ------------------------------------------------------------------ */
  let lastSort = "hot";
  const SORTS = [
    { id: "hot", label: () => T("綜合推薦") },
    { id: "top", label: () => T("最高讚") },
    { id: "new", label: () => T("最新") },
  ];

  HC.views.public = async function (root) {
    const app = !!(window.HC_MODE && window.HC_MODE.app);
    const cards = [];
    const seg = h("div.seg", { role: "radiogroup", "aria-label": T("排序") });
    SORTS.forEach((s) => {
      const b = h("button.seg__btn", { type: "button", role: "radio", "aria-checked": String(s.id === lastSort) }, s.label());
      b.addEventListener("click", () => {
        lastSort = s.id;
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        load();
      });
      seg.appendChild(b);
    });
    const shareBtn = h("button.btn.btn--ink.btn--sm", { type: "button", onclick: pickOwn }, T("公開我的卡片"));
    const grid = h("ol.wall.pub-wall");
    const status = h("p.pub-empty", { hidden: true });
    const minePanel = h("div.pub-mine", { hidden: true });

    const intro = h(
      "header.pub-head",
      h("div.pub-head__text", h(app ? "h2.pub-title" : "h1.pub-title", T("公開展廳")), h("p.pub-lead", T("大家分享的 3D 卡片，經過審核後展出。登入後可以按讚、倒讚，也能公開你自己的卡片。"))),
      h("div.pub-head__tools", seg, shareBtn)
    );
    root.appendChild(h("section.pub", intro, minePanel, grid, status, notice()));

    async function load() {
      cards.splice(0).forEach((c) => c.destroy());
      grid.replaceChildren();
      status.hidden = false;
      status.textContent = T("載入中…");
      let data;
      try {
        data = await HC.account.call("GET", "/api/public?sort=" + lastSort, null, { optional: true });
      } catch (e) {
        status.textContent = e.message || T("現在無法載入公開展廳，請稍後再試。");
        return;
      }
      const items = data.items || [];
      status.hidden = !!items.length;
      status.textContent = T("還沒有公開的卡片。成為第一個分享的人吧！");
      items.forEach((it) => {
        const data = cardData(it);
        const card = new HC.HoloCard(data, { maxTilt: 12, gyro: false });
        cards.push(card);
        const likes = h("span.pub-likes", ico("up"), h("span", String(it.likes || 0)));
        grid.appendChild(
          h(
            "li.piece",
            h("a.piece__link", { href: "#/p/" + it.id, "aria-label": T("查看「{title}」", { title: it.title || T("未命名卡片") }) }, card.el),
            h(
              "div.placard",
              h("p.placard__title", it.title || T("未命名卡片")),
              h("p.placard__meta.pub-meta", sourceTag(it), h("span", T("來自 {name}", { name: it.author || "?" }))),
              h("p.placard__meta.pub-meta", likes, h("span", dateText(it.date)))
            )
          )
        );
      });
    }

    async function loadMine() {
      const list = (await mine(true)).filter((x) => x.status !== "approved");
      minePanel.hidden = !list.length;
      if (!list.length) return;
      minePanel.replaceChildren(
        h("p.pub-mine__title", T("我送出的卡片")),
        h(
          "ul.pub-mine__list",
          list.map((x) =>
            h(
              "li",
              h("span.pub-mine__name", x.title || T("未命名卡片")),
              h("span.pub-mine__state", { dataset: { state: x.status } }, x.status === "pending" ? T("審核中") : T("沒有通過") + (x.note ? T("（{note}）", { note: x.note }) : ""))
            )
          )
        )
      );
    }

    async function pickOwn() {
      const own = await HC.cards.own();
      if (!own.length) {
        HC.toast(T("你還沒有自己的卡片。先做一張吧！"));
        HC.go("#/create");
        return;
      }
      const dlg = h("dialog.share.pick", { "aria-labelledby": "pick-title" });
      const list = h(
        "ul.pick__list",
        own.map((c) =>
          h(
            "li",
            h(
              "button.pick__item",
              {
                type: "button",
                onclick: async () => {
                  dlg.close();
                  if (await submit(c)) loadMine();
                },
              },
              h("img", { src: c.image, alt: "", loading: "lazy" }),
              h("span", c.title || T("未命名卡片"))
            )
          )
        )
      );
      dlg.append(
        h("div.share__head", h("h2.share__title", { id: "pick-title" }, T("選一張要公開的卡片")), h("button.share__x", { type: "button", "aria-label": T("關閉"), onclick: () => dlg.close() }, "×")),
        h("div.share__body", list)
      );
      dlg.addEventListener("close", () => dlg.remove());
      document.body.appendChild(dlg);
      dlg.showModal();
    }

    load();
    loadMine();
    return {
      title: T("公開展廳"),
      destroy() {
        cards.forEach((c) => c.destroy());
      },
    };
  };

  /* ------------------------------------------------------------------ */
  /* One public card                                                     */
  /* ------------------------------------------------------------------ */
  HC.views.pubcard = async function (root, route) {
    let it;
    try {
      it = await HC.account.call("GET", "/api/public/" + encodeURIComponent(route.id), null, { optional: true });
    } catch (e) {
      root.appendChild(
        h(
          "section.room.room--missing",
          h("h1.room__missing-title", T("找不到這張卡片")),
          h("p", e.message || T("找不到這張公開的卡片，可能已經下架。")),
          h("a.btn.btn--light", { href: "#/public" }, T("回到公開展廳"))
        )
      );
      return { title: T("找不到卡片") };
    }
    const data = cardData(it);
    const card = new HC.HoloCard(data, { flippable: true, dragTilt: true, maxTilt: 18, restFoil: 0.4 });
    const room = h("section.room");
    room.appendChild(h("div.room__bar", h("a.room__back", { href: "#/public" }, h("span", { "aria-hidden": "true" }, "←"), T("公開展廳"))));
    room.appendChild(h("div.room__stage", h("div.room__card", card.el)));

    const link = (HC.share ? HC.share.siteBase() : location.origin + "/") + "#/p/" + it.id;
    const shareBtn = h("button.btn.btn--share", { type: "button" }, T("複製連結"));
    shareBtn.addEventListener("click", async () => {
      try {
        if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) await navigator.share({ title: it.title || "3D Cards", url: link });
        else {
          await navigator.clipboard.writeText(link);
          HC.toast(T("已複製連結"));
        }
      } catch (e) {}
    });
    const saveBtn = h("button.btn.btn--light", { type: "button" }, T("存到我的卡片"));
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        const own = await HC.cards.own();
        const dup = own.find((c) => c.fromPublic === it.id);
        if (dup) return HC.go("#/card/" + dup.id);
        const payload = await HC.io.payload(Object.assign({}, data, { own: false }));
        const rec = await HC.io.recordFromCard(payload);
        rec.fromPublic = it.id;
        const id = await HC.store.put(rec);
        HC.toast(T("已存到「我的卡片」"));
        HC.go("#/card/" + id);
      } catch (e) {
        saveBtn.disabled = false;
        HC.toast(T("儲存失敗：儲存空間可能已滿。"), "error");
      }
    });
    const tools = [
      shareBtn,
      h("button.btn.btn--light", { type: "button", onclick: () => HC.openFullscreen(card.data) }, T("全螢幕")),
      h("button.btn.btn--light", { type: "button", onclick: () => card.flip() }, T("翻面")),
      it.card && it.card.sand && it.card.fg ? h("button.btn.btn--light", { type: "button", onclick: () => card.turn() }, T("上下顛倒")) : null,
      saveBtn,
    ];
    const who = await HC.account.me();
    const takeDown =
      it.mine || (who && who.admin)
        ? h("button.btn.btn--danger", { type: "button", onclick: async () => (await withdraw(it.id)) && HC.go("#/public") }, it.mine ? T("從公開展廳下架") : T("下架（管理員）"))
        : null;

    room.appendChild(
      h(
        "div.room__info",
        h(
          "div.placard.placard--room",
          it.status && it.status !== "approved" ? h("p.placard__from", it.status === "pending" ? T("審核中，只有你和管理員看得到") : T("沒有通過審核")) : null,
          h("h1.placard__title", it.title || T("未命名卡片")),
          it.subtitle ? h("p.placard__sub", it.subtitle) : null,
          h("p.placard__meta.pub-meta", sourceTag(it), h("span", T("來自 {name}", { name: it.author || "?" }))),
          h("p.placard__meta", T("{date}公開", { date: dateText(it.date) })),
          it.source === "repost" ? h("p.placard__meta.pub-repost-note", T("這是作者分享的公開照片，版權屬於原作者。版權方要求時會下架。")) : null,
          it.status === "approved" ? votes(it) : null
        ),
        h("div.room__tools", h("div.room__actions", tools), takeDown ? h("div.room__own", takeDown) : null),
        notice()
      )
    );
    root.appendChild(room);
    return {
      title: it.title || T("公開展廳"),
      destroy() {
        card.destroy();
      },
    };
  };

  /* ------------------------------------------------------------------ */
  /* Review (site owner)                                                 */
  /* ------------------------------------------------------------------ */
  HC.views.admin = async function (root) {
    const who = await HC.account.me(true);
    if (!who || !who.admin) {
      root.appendChild(
        h(
          "section.adm",
          h("h1.adm__title", T("審核")),
          h("p.adm__lead", who ? T("這個帳號不是管理員。") : T("請先用 Google 登入管理員帳號。")),
          !who ? h("button.btn.btn--ink", { type: "button", onclick: async () => (await HC.account.signIn()) && HC.go("#/admin") }, T("用 Google 登入")) : null
        )
      );
      return { title: T("審核") };
    }
    let tab = "pending";
    const cards = [];
    const seg = h("div.seg", { role: "radiogroup", "aria-label": T("狀態") });
    [
      ["pending", T("待審核")],
      ["approved", T("已公開")],
      ["rejected", T("未通過")],
    ].forEach(([id, label]) => {
      const b = h("button.seg__btn", { type: "button", role: "radio", "aria-checked": String(id === tab) }, label);
      b.addEventListener("click", () => {
        tab = id;
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        load();
      });
      seg.appendChild(b);
    });
    const listEl = h("div.adm__list");

    // Read the invisible watermark from any picture.
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    const wmOut = h("p.adm__wm", T("選一張照片，讀出裡面的隱形水印。"));
    file.addEventListener("change", async () => {
      const f = file.files[0];
      file.value = "";
      if (!f) return;
      wmOut.textContent = T("讀取中…");
      const text = await HC.watermark.read(f);
      wmOut.textContent = text ? T("水印：{text}", { text }) : T("這張照片沒有水印，或已經被縮放、裁切。");
    });

    root.appendChild(
      h(
        "section.adm",
        h("div.adm__head", h("h1.adm__title", T("公開展廳審核")), seg),
        listEl,
        h("div.adm__tool", h("h2", T("讀取隱形水印")), h("button.btn.btn--line.btn--sm", { type: "button", onclick: () => file.click() }, T("選擇照片")), wmOut, file)
      )
    );

    async function act(it, action) {
      let note = "";
      if (action === "reject") {
        note = prompt(T("不通過的原因（會讓作者看到，可留空）")) || "";
      }
      if (action === "remove" && !confirm(T("從公開展廳下架？"))) return;
      try {
        await HC.account.call("POST", "/api/admin/public/" + it.id, { action, note });
        HC.toast(action === "approve" ? T("已公開") : action === "reject" ? T("已退回") : T("已下架"));
        load();
      } catch (e) {
        HC.toast(e.message, "error");
      }
    }

    async function load() {
      cards.splice(0).forEach((c) => c.destroy());
      listEl.replaceChildren(h("p.adm__lead", T("載入中…")));
      let items = [];
      try {
        items = (await HC.account.call("GET", "/api/admin/public?status=" + tab)).items || [];
      } catch (e) {
        listEl.replaceChildren(h("p.adm__lead", e.message));
        return;
      }
      if (!items.length) {
        listEl.replaceChildren(h("p.adm__lead", T("沒有卡片。")));
        return;
      }
      listEl.replaceChildren();
      items.forEach((it) => {
        const data = cardData(it);
        const card = new HC.HoloCard(data, { maxTilt: 10, gyro: false });
        cards.push(card);
        const wm = h("p.adm__meta", T("水印：讀取中…"));
        fetch(data.image)
          .then((r) => r.blob())
          .then((b) => HC.watermark.read(b))
          .then((t) => (wm.textContent = T("水印：{text}", { text: t || T("沒有") })))
          .catch(() => (wm.textContent = T("水印：無法讀取")));
        listEl.appendChild(
          h(
            "article.adm__item",
            h("a.adm__card", { href: "#/p/" + it.id }, card.el),
            h(
              "div.adm__info",
              h("h2", it.title || T("未命名卡片")),
              it.subtitle ? h("p.adm__meta", it.subtitle) : null,
              h("p.adm__meta", sourceTag(it), " ", it.source === "repost" ? T("作者表示是分享的公開照片，願意接受下架要求") : T("作者表示是自己拍攝或創作的")),
              h("p.adm__meta", T("作者：{name}（{email}）", { name: it.author, email: it.ownerEmail || "?" })),
              h("p.adm__meta", T("送出：{date}", { date: dateText(it.createdAt) })),
              wm,
              it.note ? h("p.adm__meta", T("備註：{note}", { note: it.note })) : null,
              tab === "approved" ? h("p.adm__meta", T("{up} 個讚，{down} 個倒讚", { up: it.likes, down: it.dislikes })) : null,
              h(
                "div.adm__actions",
                tab !== "approved" ? h("button.btn.btn--ink.btn--sm", { type: "button", onclick: () => act(it, "approve") }, T("通過並公開")) : null,
                tab === "pending" ? h("button.btn.btn--line.btn--sm", { type: "button", onclick: () => act(it, "reject") }, T("不通過")) : null,
                h("button.btn.btn--quiet.btn--sm", { type: "button", onclick: () => act(it, "remove") }, T("下架並刪除"))
              )
            )
          )
        );
      });
    }
    load();
    return {
      title: T("審核"),
      destroy() {
        cards.forEach((c) => c.destroy());
      },
    };
  };
})();
