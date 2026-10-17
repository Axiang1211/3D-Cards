/*
 * app-shell.js
 * The app layout, used by the Windows, Mac and Android apps and by the website
 * once it is installed (see mode.js). The website keeps its own look.
 *
 * Designed with Vibe UI/UX principles:
 *   - Macro Grid Rail Alignment (--page-gutter: 32px desktop / 20px mobile)
 *   - Micro Optical Centering on asymmetric icons
 *   - Floating Island + Collapsible Sidebar (desktop) & Floating Glass Magnify Tab Bar (phone)
 *   - Custom Select with checkmark & Multi-select Filter Chips with spring check animation
 *   - Press Tilt cards with radial spotlight & Card Tray with 120ms delayed content fade-in
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const MODE = window.HC_MODE || {};
  if (!MODE.app) return;

  const h = (...a) => HC.h(...a);
  const T = (s, p) => HC.t(s, p);
  HC.appViews = {};

  /* ------------------------------------------------------------------ */
  /* Icons (24 × 24, with optical alignment classes)                     */
  /* ------------------------------------------------------------------ */
  const P = {
    cards: '<rect x="3.5" y="5" width="11" height="15" rx="2"/><path d="M17.5 7.2l1.6.5a2 2 0 0 1 1.3 2.5l-3 9.6"/><path d="M7 9.5h4"/>',
    sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18.5z"/>',
    share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    flip: '<path d="M12 3v18"/><path d="M8.5 7 4 12l4.5 5z"/><path d="M15.5 7 20 12l-4.5 5V7z" fill="currentColor" stroke="none" opacity=".35"/><path d="M15.5 7 20 12l-4.5 5z"/>',
    turn: '<path d="M7 4v13M3.5 13.5 7 17l3.5-3.5"/><path d="M17 20V7M20.5 10.5 17 7l-3.5 3.5"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
    import: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4.5 7h15M10 11v5.5M14 11v5.5"/><path d="M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12"/><path d="M9 7V4.5h6V7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    next: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/><path d="M3.5 9.5a8 8 0 0 0 0 5M20.5 9.5a8 8 0 0 1 0 5"/>',
    save: '<path d="M5 4.5h11l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z"/><path d="M8.5 4.5V9h6V4.5M8 20.5v-6h8v6"/>',
    heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.7 4.2 4.2 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.3 3.6 5.2 3.6 8.5s-1.1 6.2-3.6 8.5c-2.5-2.3-3.6-5.2-3.6-8.5S9.5 5.8 12 3.5z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    box: '<path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5 12 11l8-3.5M12 11v9"/>',
    check: '<path d="M5 12.5l4.5 4.5 9.5-9.5"/>',
    chevron: '<path d="M6.5 9.5L12 15l5.5-5.5"/>',
    sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>',
  };
  function icon(name) {
    const s = h("span.ico.ico--" + name, { "aria-hidden": "true" });
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
    return s;
  }
  HC.icon = icon;

  // The Android app's WebView can't save downloads; cards move between devices with sync or links there.
  const CAN_EXPORT = !(MODE.tauri && MODE.android);
  const narrow = () => matchMedia("(max-width: 860px)").matches;
  const COLLAPSE_KEY = "hc:side-collapsed";

  /* ------------------------------------------------------------------ */
  /* Micro-interactions: Press Tilt & Magnify Row                        */
  /* ------------------------------------------------------------------ */
  function attachPressTilt(el) {
    let pressed = false;
    const onDown = (e) => {
      if (e.button && e.button !== 0) return;
      pressed = true;
      el.classList.add("is-pressed");
      update(e);
    };
    const update = (e) => {
      if (!pressed) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const x = Math.max(0, Math.min(r.width, cx - r.left));
      const y = Math.max(0, Math.min(r.height, cy - r.top));
      const rotY = ((x / r.width) - 0.5) * 11;
      const rotX = (0.5 - (y / r.height)) * 11;
      el.style.transform = `perspective(700px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(0.97)`;
      el.style.setProperty("--spot-x", `${x.toFixed(0)}px`);
      el.style.setProperty("--spot-y", `${y.toFixed(0)}px`);
    };
    const reset = () => {
      if (!pressed) return;
      pressed = false;
      el.classList.remove("is-pressed");
      el.style.transform = "";
    };
    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointermove", update, { passive: true });
    el.addEventListener("pointerup", reset, { passive: true });
    el.addEventListener("pointercancel", reset, { passive: true });
    el.addEventListener("pointerleave", reset, { passive: true });
  }

  function attachMagnifyDock(dock) {
    const items = Array.from(dock.querySelectorAll(".tabs__item"));
    let active = false;
    const move = (clientX) => {
      const radius = 92;
      items.forEach((it) => {
        const r = it.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const dist = Math.abs(clientX - center);
        const ratio = Math.max(0, 1 - dist / radius);
        const scale = 1 + 0.18 * Math.pow(ratio, 1.5);
        const lift = -5 * ratio;
        it.style.transform = ratio > 0.02 ? `translateY(${lift.toFixed(1)}px) scale(${scale.toFixed(3)})` : "";
      });
    };
    const clear = () => {
      active = false;
      items.forEach((it) => (it.style.transform = ""));
    };
    dock.addEventListener(
      "pointerdown",
      (e) => {
        active = true;
        move(e.clientX);
      },
      { passive: true }
    );
    dock.addEventListener(
      "pointermove",
      (e) => {
        if (!active && e.pointerType === "touch") return;
        move(e.clientX);
      },
      { passive: true }
    );
    dock.addEventListener("pointerup", clear, { passive: true });
    dock.addEventListener("pointercancel", clear, { passive: true });
    dock.addEventListener("pointerleave", clear, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Shell: Floating Island Collapsible Sidebar + Floating Glass Tabs    */
  /* ------------------------------------------------------------------ */
  const NAV = [
    { id: "library", href: "#/", icon: "cards", label: () => T("我的卡片") },
    { id: "public", href: "#/public", icon: "globe", label: () => T("公開展廳") },
    { id: "samples", href: "#/samples", icon: "sparkle", label: () => T("示範作品") },
    { id: "create", href: "#/create", icon: "plus", label: () => T("製作卡片") },
  ];
  let side, tabs, counter, syncBtn, collapseBtn;

  function mount() {
    const view = document.getElementById("view");
    const cfg = window.HC_CONFIG || {};
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch (e) {}
    document.documentElement.classList.toggle("is-side-collapsed", collapsed);

    counter = h("span.side__count");
    const items = NAV.map((n) => {
      const lbl = n.label();
      return h(
        "a.side__item",
        { href: n.href, dataset: { nav: n.id }, title: lbl },
        icon(n.icon),
        h("span.side__label", lbl),
        n.id === "library" ? counter : null
      );
    });

    const syncCollapseLabel = () => {
      const isCol = document.documentElement.classList.contains("is-side-collapsed");
      const text = isCol ? T("展開側邊欄") : T("收起側邊欄");
      if (collapseBtn) {
        collapseBtn.title = text;
        collapseBtn.setAttribute("aria-label", text);
        collapseBtn.setAttribute("aria-expanded", String(!isCol));
      }
    };

    collapseBtn = h(
      "button.side__toggle",
      {
        type: "button",
        onclick: () => {
          const next = !document.documentElement.classList.contains("is-side-collapsed");
          document.documentElement.classList.toggle("is-side-collapsed", next);
          try {
            localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
          } catch (e) {}
          syncCollapseLabel();
        },
      },
      icon("sidebar")
    );
    syncCollapseLabel();

    syncBtn = h(
      "button.side__item.side__sync",
      { type: "button", onclick: () => HC.openCloud && HC.openCloud(() => refreshSync()) },
      icon("cloud"),
      h("span.side__label")
    );
    const settingsLabel = T("設定");
    side = h(
      "aside.side",
      { "aria-label": T("主要") },
      h(
        "div.side__top",
        h(
          "a.side__brand",
          { href: "#/", title: cfg.siteName || "3D Cards" },
          h("img", { src: "brand/logo-mark-64.png", srcset: "brand/logo-mark-128.png 2x", alt: "", width: 34, height: 34, draggable: false }),
          h("span", cfg.siteName || "3D Cards")
        ),
        collapseBtn
      ),
      h("nav.side__nav", items),
      h(
        "div.side__foot",
        syncBtn,
        h("a.side__item", { href: "#/settings", dataset: { nav: "settings" }, title: settingsLabel }, icon("gear"), h("span.side__label", settingsLabel))
      )
    );
    tabs = h(
      "nav.tabs",
      { "aria-label": T("主要") },
      h("a.tabs__item", { href: "#/", dataset: { nav: "library" } }, icon("cards"), h("span", T("我的卡片"))),
      h("a.tabs__item", { href: "#/public", dataset: { nav: "public" } }, icon("globe"), h("span", T("展廳"))),
      h("a.tabs__item.tabs__item--make", { href: "#/create", dataset: { nav: "create" } }, icon("plus"), h("span", T("製作"))),
      h("a.tabs__item", { href: "#/samples", dataset: { nav: "samples" } }, icon("sparkle"), h("span", T("示範"))),
      h("a.tabs__item", { href: "#/settings", dataset: { nav: "settings" } }, icon("gear"), h("span", T("設定")))
    );
    attachMagnifyDock(tabs);

    // Shrink-on-scroll state on top header bar
    view.addEventListener(
      "scroll",
      () => {
        const bar = view.querySelector(".bar");
        if (bar) bar.classList.toggle("is-scrolled", view.scrollTop > 8);
      },
      { passive: true }
    );

    const shell = h("div.shell", side, h("div.shell__main", view), tabs);
    document.body.prepend(shell);
    refreshSync();
    refreshCount();
  }

  function refreshSync() {
    if (!syncBtn) return;
    const c = HC.cloud;
    syncBtn.hidden = !(c && c.available);
    if (c && c.available) {
      const txt = c.signedIn ? T("雲端同步") : T("用 Google 同步");
      syncBtn.querySelector(".side__label").textContent = txt;
      syncBtn.title = txt;
      syncBtn.classList.toggle("is-on", !!c.signedIn);
    }
  }
  async function refreshCount() {
    if (!counter) return;
    const own = await HC.cards.own();
    counter.textContent = own.length ? String(own.length) : "";
  }
  HC.appShell = { refreshCount, refreshSync };

  /* Router hook: highlight the current page. */
  HC.appShellRoute = function (name) {
    const id = name === "detail" ? null : name === "gallery" ? "library" : name === "pubcard" ? "public" : name;
    document.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === id));
    document.documentElement.dataset.page = name;
  };

  /* Page header: title, count, actions. */
  function header({ title, count, back, actions, sub }) {
    const countEl = count != null ? h("span.bar__count", String(count)) : null;
    const el = h(
      "header.bar",
      back ? h("a.bar__back", { href: back.href, "aria-label": back.label }, icon("back"), h("span.bar__back-label", back.label)) : null,
      h("div.bar__title", h("h1", title), countEl, sub ? h("span.bar__sub", sub) : null),
      h("div.bar__actions", actions || [])
    );
    el._setCount = (n) => {
      if (!countEl) return;
      const s = String(n);
      if (countEl.textContent !== s) {
        countEl.textContent = s;
        countEl.classList.remove("is-bump");
        void countEl.offsetWidth;
        countEl.classList.add("is-bump");
      }
    };
    return el;
  }

  function toolButton(ic, label, onclick, extra) {
    return h("button.tool" + (extra ? "." + extra : ""), { type: "button", onclick, title: label, "aria-label": label }, icon(ic), h("span.tool__label", label));
  }

  /* ------------------------------------------------------------------ */
  /* Custom Single-Select Component (Section 3.1 of Vibe UI/UX Skill)    */
  /* ------------------------------------------------------------------ */
  function customSelect({ label, options, value, onChange }) {
    let cur = value;
    const curLabel = () => (options.find((o) => o.value === cur) || options[0]).label;
    const textEl = h("span.cselect__text", curLabel());
    const trigger = h(
      "button.cselect__btn",
      { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": label },
      textEl,
      icon("chevron")
    );
    const wrap = h("div.cselect", trigger);
    let pop = null;

    function close() {
      if (!pop) return;
      pop.remove();
      pop = null;
      trigger.setAttribute("aria-expanded", "false");
      wrap.classList.remove("is-open");
      document.removeEventListener("pointerdown", onOut, true);
      document.removeEventListener("keydown", onEsc, true);
    }
    function onOut(e) {
      if (!wrap.contains(e.target)) close();
    }
    function onEsc(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    trigger.addEventListener("click", () => {
      if (pop) {
        close();
        return;
      }
      pop = h(
        "div.cselect__menu",
        { role: "listbox", "aria-label": label },
        options.map((opt) => {
          const selected = opt.value === cur;
          return h(
            "button.cselect__opt" + (selected ? ".is-selected" : ""),
            {
              type: "button",
              role: "option",
              "aria-selected": String(selected),
              onclick: () => {
                cur = opt.value;
                textEl.textContent = opt.label;
                close();
                if (onChange) onChange(cur);
              },
            },
            h("span.cselect__opt-label", opt.label),
            icon("check")
          );
        })
      );
      wrap.appendChild(pop);
      wrap.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        document.addEventListener("pointerdown", onOut, true);
        document.addEventListener("keydown", onEsc, true);
      });
    });
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Menus and confirmations                                             */
  /* ------------------------------------------------------------------ */
  let openMenu = null;
  let openBackdrop = null;
  function closeMenu() {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
    }
    if (openBackdrop) {
      openBackdrop.remove();
      openBackdrop = null;
    }
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", menuKey, true);
  }
  function outside(e) {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  }
  function menuKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeMenu();
    }
  }
  /** items: [{ icon, label, run, danger, hidden }] or "-" for a divider. */
  HC.appMenu = function (items, at) {
    closeMenu();
    const list = items.filter((i) => i && !i.hidden);
    const sheet = narrow();
    if (sheet) {
      openBackdrop = h("div.menu-backdrop", { onclick: closeMenu });
      document.body.appendChild(openBackdrop);
    }
    const menu = h(sheet ? "div.menu.menu--sheet" : "div.menu", { role: "menu" });
    if (sheet) menu.appendChild(h("div.menu__grab", { "aria-hidden": "true" }));
    let idx = 0;
    list.forEach((it) => {
      if (it === "-") return menu.appendChild(h("hr.menu__rule"));
      const btn = h(
        "button.menu__item" + (it.danger ? ".is-danger" : ""),
        {
          type: "button",
          role: "menuitem",
          onclick: () => {
            closeMenu();
            it.run();
          },
        },
        icon(it.icon),
        h("span", it.label),
        it.key ? h("kbd", it.key) : null
      );
      btn.style.setProperty("--item-idx", String(idx++));
      menu.appendChild(btn);
    });
    if (sheet) menu.appendChild(h("button.menu__cancel", { type: "button", onclick: closeMenu }, T("取消")));
    document.body.appendChild(menu);
    openMenu = menu;
    if (!sheet) {
      let x = at.x, y = at.y;
      if (at.el) {
        const r = at.el.getBoundingClientRect();
        x = r.right;
        y = r.bottom + 6;
      }
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      if (at.el) x -= mw;
      menu.style.left = Math.max(8, Math.min(x, innerWidth - mw - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(y, innerHeight - mh - 8)) + "px";
    }
    const first = menu.querySelector("button");
    if (first) first.focus({ preventScroll: true });
    setTimeout(() => {
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", menuKey, true);
    });
  };

  HC.appConfirm = function ({ title, text, ok, cancel, danger }) {
    return new Promise((resolve) => {
      const dlg = h("dialog.share.confirm", { "aria-labelledby": "cf-title" });
      let answer = false;
      const okBtn = h("button.btn" + (danger ? ".btn--danger-solid" : ".btn--ink"), { type: "button", onclick: () => ((answer = true), dlg.close()) }, ok);
      dlg.append(
        h("div.share__head", h("h2.share__title", { id: "cf-title" }, title)),
        h("div.share__body", text ? h("p.share__note", text) : null, h("div.share__actions.confirm__actions", h("button.btn.btn--quiet", { type: "button", onclick: () => dlg.close() }, cancel || T("取消")), okBtn))
      );
      dlg.addEventListener("close", () => {
        dlg.remove();
        resolve(answer);
      });
      document.body.appendChild(dlg);
      dlg.showModal();
      okBtn.focus();
    });
  };

  /* ------------------------------------------------------------------ */
  /* Card actions shared by the library and the viewer                    */
  /* ------------------------------------------------------------------ */
  const actions = {
    open: (c) => HC.go("#/card/" + c.id),
    edit: (c) => HC.go("#/create/" + c.id),
    share: (c, onChange) => HC.openShare(c, onChange),
    fullscreen: (c) => HC.openFullscreen(c),
    async exportFile(c) {
      try {
        await HC.io.exportCard(c);
        HC.toast(T("已下載卡片檔。在任何一台裝置上按「匯入卡片檔」就能打開。"));
      } catch (e) {
        HC.toast(T("無法匯出這張卡片。"), "error");
      }
    },
    async remove(c, after) {
      const ok = await HC.appConfirm({
        title: T("刪除「{title}」？", { title: c.title || T("未命名卡片") }),
        text: T("卡片會從這台裝置刪除。有開雲端同步的話，下次同步時也會從雲端刪除。"),
        ok: T("刪除"),
        danger: true,
      });
      if (!ok) return;
      await HC.store.remove(c.id);
      if (HC.cloud) HC.cloud.noteDeleted(c.id);
      HC.toast(T("已刪除「{title}」", { title: c.title || T("未命名卡片") }));
      refreshCount();
      if (after) after();
    },
  };

  function cardMenu(c, at, reload) {
    HC.appMenu(
      [
        { icon: "cards", label: T("打開"), run: () => actions.open(c) },
        { icon: "expand", label: T("全螢幕"), run: () => actions.fullscreen(c) },
        { icon: "share", label: T("分享連結"), run: () => actions.share(c) },
        { icon: "download", label: T("匯出卡片檔"), run: () => actions.exportFile(c), hidden: !CAN_EXPORT },
        c.own ? "-" : null,
        { icon: "edit", label: T("編輯"), run: () => actions.edit(c), hidden: !c.own },
        { icon: "trash", label: T("刪除"), danger: true, run: () => actions.remove(c, reload), hidden: !c.own },
      ],
      at
    );
  }

  let importInput = null;
  function getImport() {
    if (importInput) return importInput;
    importInput = h("input", { type: "file", accept: ".3dcard,.json,application/json", hidden: true });
    importInput.addEventListener("change", async () => {
      const file = importInput.files[0];
      importInput.value = "";
      if (!file) return;
      try {
        const res = await HC.io.saveImported(await file.text());
        HC.toast(res.existed ? T("這張卡片之前已經加入過了") : T("已匯入「{title}」", { title: res.title || T("未命名卡片") }));
        refreshCount();
        HC.go("#/card/" + res.id);
      } catch (e) {
        HC.toast(e.message || T("匯入失敗。"), "error");
      }
    });
    document.body.appendChild(importInput);
    return importInput;
  }
  const pickImport = () => getImport().click();

  /* ------------------------------------------------------------------ */
  /* Library: my cards / samples                                         */
  /* ------------------------------------------------------------------ */
  const libState = { query: "", sort: "new", foils: new Set() };

  function dateText(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return HC.lang === "en"
      ? d.toLocaleDateString("en", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
      : `${d.getFullYear() === new Date().getFullYear() ? "" : d.getFullYear() + " 年 "}${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  }

  async function library(root, samples) {
    const own = samples ? [] : await HC.cards.own();
    const source = samples ? HC.cards.gallery : own;
    const cards = [];
    const search = h("input.search__input", {
      type: "search",
      placeholder: samples ? T("搜尋示範作品") : T("搜尋我的卡片"),
      value: libState.query,
      "aria-label": T("搜尋"),
    });
    const searchBox = h("label.search", icon("search"), search);
    const sortSel = samples
      ? null
      : customSelect({
          label: T("排序"),
          value: libState.sort,
          options: [
            { value: "new", label: T("最新的在前") },
            { value: "old", label: T("最舊的在前") },
            { value: "name", label: T("依名稱") },
          ],
          onChange: (val) => {
            libState.sort = val;
            fill();
          },
        });

    const addLink = toolButton("link", T("用連結加入"), () => HC.openAddByLink());
    const imp = toolButton("import", T("匯入卡片檔"), pickImport);
    const make = h("a.btn.btn--accent.bar__make", { href: "#/create" }, icon("plus"), h("span", T("製作卡片")));
    const headBar = header({
      title: samples ? T("示範作品") : T("我的卡片"),
      count: source.length,
      actions: samples ? [searchBox] : [searchBox, sortSel, imp, addLink, make],
    });
    root.appendChild(headBar);

    /* Multi-select Filter Chips (Section 7.01 of Vibe UI/UX Skill) */
    const chipDefs = [
      ...(HC.FOILS || []).map((f) => ({ id: f.id, label: f.name, swatch: f.id })),
      { id: "sand", label: T("流沙"), swatch: null },
    ];
    const clearChip = h(
      "button.filter-clear",
      {
        type: "button",
        hidden: !libState.foils.size,
        onclick: () => {
          libState.foils.clear();
          filterBar.querySelectorAll(".filter-chip").forEach((c) => {
            c.classList.remove("is-selected");
            c.setAttribute("aria-pressed", "false");
          });
          clearChip.hidden = true;
          fill();
        },
      },
      h("span", T("清除篩選")),
      h("span", { "aria-hidden": "true" }, "×")
    );
    const filterBar = h(
      "div.filter-bar",
      { role: "group", "aria-label": T("篩選卡片"), hidden: !source.length },
      chipDefs.map((cd) => {
        const on = libState.foils.has(cd.id);
        const btn = h(
          "button.filter-chip" + (on ? ".is-selected" : ""),
          {
            type: "button",
            "aria-pressed": String(on),
            dataset: { chip: cd.id },
            onclick: () => {
              if (libState.foils.has(cd.id)) libState.foils.delete(cd.id);
              else libState.foils.add(cd.id);
              const sel = libState.foils.has(cd.id);
              btn.classList.toggle("is-selected", sel);
              btn.setAttribute("aria-pressed", String(sel));
              clearChip.hidden = !libState.foils.size;
              fill();
            },
          },
          h("span.filter-chip__check", icon("check")),
          h("span.filter-chip__label", cd.label)
        );
        return btn;
      }),
      clearChip
    );
    root.appendChild(filterBar);

    const grid = h("ul.binder", { role: "list" });
    const empty = h("div.empty");
    root.appendChild(grid);
    root.appendChild(empty);

    function fill() {
      cards.splice(0).forEach((c) => c.destroy());
      grid.replaceChildren();
      const q = libState.query.trim().toLowerCase();
      let list = source.filter((c) => {
        if (q && ![c.title, c.subtitle, c.serial].some((v) => String(v || "").toLowerCase().includes(q))) return false;
        if (libState.foils.size) {
          const matchFoil = libState.foils.has(c.foil) || (c.fg && c.fgFoil && libState.foils.has(c.fgFoil));
          const matchSand = libState.foils.has("sand") && c.fg && c.sand;
          if (!matchFoil && !matchSand) return false;
        }
        return true;
      });
      if (!samples) {
        if (libState.sort === "old") list = list.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (libState.sort === "name") list = list.slice().sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), HC.lang === "en" ? "en" : "zh-Hant"));
      }
      if (headBar._setCount) headBar._setCount(list.length);
      empty.hidden = !!list.length;
      grid.hidden = !list.length;
      if (!list.length) {
        empty.replaceChildren(
          q || libState.foils.size
            ? h(
                "div.empty__box",
                h("p.empty__title", T("找不到「{q}」", { q: libState.query.trim() || "…" })),
                h("p.empty__text", T("換個關鍵字試試。"))
              )
            : h(
                "div.empty__box",
                h("img.empty__art", { src: "brand/logo-mark-192.png", alt: "", width: 120, height: 120, draggable: false }),
                h("p.empty__title", T("還沒有卡片")),
                h("p.empty__text", T("選一張照片，加上鐳射，就是你的第一張卡片。")),
                h(
                  "div.empty__actions",
                  h("a.btn.btn--accent", { href: "#/create" }, icon("plus"), h("span", T("製作第一張卡片"))),
                  h("button.btn.btn--soft", { type: "button", onclick: pickImport }, icon("import"), h("span", T("匯入卡片檔"))),
                  h("button.btn.btn--soft", { type: "button", onclick: () => HC.openAddByLink() }, icon("link"), h("span", T("用連結加入")))
                )
              )
        );
        return;
      }
      list.forEach((data) => {
        const card = new HC.HoloCard(data, { maxTilt: 10, gyro: false });
        cards.push(card);
        const open = h(
          "a.slot__card",
          { href: "#/card/" + data.id, "aria-label": T("打開「{title}」", { title: data.title || T("未命名卡片") }), draggable: false },
          h("span.slot__glow", { "aria-hidden": "true" }),
          card.el
        );
        attachPressTilt(open);

        const more = h("button.slot__more", { type: "button", "aria-label": T("更多動作"), title: T("更多動作") }, icon("more"));
        more.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          cardMenu(data, { el: more }, reload);
        });

        /* Card Tray underneath the main card sleeve (Section 6.04 of Vibe UI/UX Skill) */
        const trayToggle = h(
          "button.slot__tray-toggle",
          {
            type: "button",
            "aria-expanded": "false",
            onclick: (e) => {
              e.stopPropagation();
              const isOpen = tray.classList.toggle("is-open");
              trayToggle.setAttribute("aria-expanded", String(isOpen));
            },
          },
          h(
            "div.slot__text",
            h("p.slot__title", data.title || T("未命名卡片")),
            h(
              "p.slot__meta",
              samples ? HC.describe(data) : data.fromShare ? T("{d}從連結加入", { d: dateText(data.createdAt) }) : dateText(data.createdAt) || HC.describe(data)
            )
          ),
          icon("chevron")
        );

        const tray = h(
          "div.slot__tray",
          h("div.slot__label", trayToggle, more),
          h(
            "div.slot__tray-body",
            h(
              "div.slot__tray-inner",
              h("p.slot__tray-spec", HC.describe(data)),
              h(
                "div.slot__tray-actions",
                h("button.slot__pill", { type: "button", onclick: () => actions.open(data) }, icon("cards"), h("span", T("打開"))),
                h("button.slot__pill", { type: "button", onclick: () => actions.fullscreen(data) }, icon("expand"), h("span", T("全螢幕"))),
                h("button.slot__pill", { type: "button", onclick: () => actions.share(data) }, icon("share"), h("span", T("分享"))),
                data.own ? h("button.slot__pill", { type: "button", onclick: () => actions.edit(data) }, icon("edit"), h("span", T("編輯"))) : null
              )
            )
          )
        );

        const slot = h("li.slot", open, tray);
        slot.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          cardMenu(data, { x: e.clientX, y: e.clientY }, reload);
        });
        // Long press on a phone opens the same menu.
        let lp = 0;
        slot.addEventListener("touchstart", () => (lp = setTimeout(() => ((lp = -1), cardMenu(data, {}, reload)), 550)), { passive: true });
        ["touchend", "touchmove", "touchcancel"].forEach((ev) => slot.addEventListener(ev, () => lp > 0 && clearTimeout(lp), { passive: true }));
        open.addEventListener("click", (e) => {
          if (lp === -1) {
            e.preventDefault();
            lp = 0;
          }
        });
        grid.appendChild(slot);
      });
    }
    const reload = () => HC.go(samples ? "#/samples" : "#/");
    search.addEventListener("input", () => {
      libState.query = search.value;
      fill();
    });
    fill();
    refreshCount();

    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        search.focus();
        search.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return {
      title: samples ? T("示範作品") : T("我的卡片"),
      destroy() {
        cards.forEach((c) => c.destroy());
        document.removeEventListener("keydown", onKey);
      },
    };
  }
  HC.appViews.gallery = (root) => library(root, false);
  HC.appViews.samples = (root) => library(root, true);

  /* ------------------------------------------------------------------ */
  /* Viewer                                                              */
  /* ------------------------------------------------------------------ */
  HC.appViews.detail = async function (root, route) {
    const data = await HC.cards.get(route.id);
    if (!data) {
      root.appendChild(header({ title: T("找不到這張卡片"), back: { href: "#/", label: T("我的卡片") } }));
      root.appendChild(
        h(
          "div.empty",
          h(
            "div.empty__box",
            h("p.empty__title", T("找不到這張卡片")),
            h("p.empty__text", T("它可能已經被刪除，或是存在另一台裝置上。開啟雲端同步就能在每台裝置看到同樣的卡片。")),
            h("div.empty__actions", h("a.btn.btn--accent", { href: "#/" }, T("回到我的卡片")))
          )
        )
      );
      return { title: T("找不到卡片") };
    }
    const list = data.own ? await HC.cards.own() : HC.cards.gallery;
    const idx = Math.max(0, list.findIndex((c) => c.id === data.id));
    const prev = list[(idx - 1 + list.length) % list.length];
    const next = list[(idx + 1) % list.length];
    const backHref = data.own ? "#/" : "#/samples";
    const backLabel = data.own ? T("我的卡片") : T("示範作品");
    const cleanups = [];

    const card = new HC.HoloCard(data, { flippable: true, dragTilt: true, maxTilt: 18, restFoil: 0.4 });

    /* Stage */
    const pager =
      list.length > 1
        ? h(
            "div.stage__pager",
            h("a.round", { href: "#/card/" + prev.id, "aria-label": T("上一張"), title: T("上一張") + " (←)" }, icon("back")),
            h("span.stage__pos", `${idx + 1} / ${list.length}`),
            h("a.round", { href: "#/card/" + next.id, "aria-label": T("下一張"), title: T("下一張") + " (→)" }, icon("next"))
          )
        : null;
    const stage = h(
      "section.stage",
      h("div.stage__top", h("a.stage__back", { href: backHref }, icon("back"), h("span", backLabel)), pager),
      h("div.stage__card", card.el),
      h("p.stage__hint", h("span.hint-desk", T("拖曳傾斜，點一下翻面")), h("span.hint-touch", T("拖曳或轉動手機，點一下翻面")))
    );

    /* Inspector */
    const shareBtn = h("button.btn.btn--accent.btn--block", { type: "button" }, icon("share"), h("span"));
    const syncShare = () => {
      const cur = data.own && HC.share.current(data);
      shareBtn.querySelector("span:last-child").textContent = cur ? T("分享中・查看連結") : T("分享連結");
    };
    shareBtn.addEventListener("click", () => actions.share(data, syncShare));
    syncShare();

    const flipRow = row("flip", T("翻面"), () => card.flip(), T("空白鍵"));
    card.el.addEventListener("hc:flip", (e) => (flipRow.querySelector(".row__label").textContent = e.detail ? T("翻回正面") : T("翻面")));
    const rows = [
      row("expand", T("全螢幕"), () => actions.fullscreen(card.data), "F"),
      flipRow,
      data.sand && data.fg ? row("turn", T("上下顛倒"), () => card.turn(), "T") : null,
      CAN_EXPORT ? row("download", T("匯出卡片檔"), () => actions.exportFile(data)) : null,
      data.own ? row("edit", T("編輯"), () => actions.edit(data), "E") : null,
      data.own && HC.pub && HC.cloud && HC.cloud.available ? HC.pub.ownCardPanel(data, "row") : null,
      data.own ? row("trash", T("刪除"), () => actions.remove(data, () => HC.go("#/")), "Del", true) : null,
    ];

    const foils = h("div.swatches", { role: "radiogroup", "aria-label": T("試看其他鐳射") });
    const note = h("p.panel__note", { hidden: true }, T("只是試看，不會改動卡片。"));
    HC.FOILS.forEach((f) => {
      const b = h(
        "button.swatch",
        { type: "button", role: "radio", "aria-checked": String(f.id === data.foil), title: f.name, "aria-label": f.name, dataset: { foil: f.id } },
        h("span.foil-pick__swatch", { "aria-hidden": "true", dataset: { foil: f.id } })
      );
      b.addEventListener("click", () => {
        foils.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        card.setData(Object.assign({}, card.data, { foil: f.id }));
        note.hidden = f.id === data.foil;
      });
      foils.appendChild(b);
    });

    const badge = data.fromShare ? T("從連結加入") : data.own ? T("我的卡片") : T("示範作品");
    const panel = h(
      "aside.panel",
      h(
        "div.panel__head",
        h("p.panel__badge", badge),
        h("h1.panel__title", data.title || T("未命名卡片")),
        data.subtitle ? h("p.panel__sub", data.subtitle) : null,
        h("p.panel__meta", HC.describe(data)),
        data.own && data.createdAt ? h("p.panel__meta", T("建立於 {d}", { d: dateText(data.createdAt) })) : null
      ),
      shareBtn,
      h("div.rows", rows),
      h("div.panel__section", h("h2.panel__label", T("試看其他鐳射")), foils, note)
    );

    /* Phone: floating glass action dock at the bottom */
    const phoneBar = h(
      "div.actionbar",
      toolButton("share", T("分享"), () => actions.share(data, syncShare)),
      toolButton("expand", T("全螢幕"), () => actions.fullscreen(card.data)),
      toolButton("flip", T("翻面"), () => card.flip()),
      data.own ? toolButton("edit", T("編輯"), () => actions.edit(data)) : null,
      toolButton("more", T("更多"), (e) =>
        HC.appMenu(
          [
            { icon: "turn", label: T("上下顛倒"), run: () => card.turn(), hidden: !(data.sand && data.fg) },
            { icon: "download", label: T("匯出卡片檔"), run: () => actions.exportFile(data), hidden: !CAN_EXPORT },
            { icon: "globe", label: T("公開到展廳"), run: () => HC.pub.submit(data), hidden: !(data.own && HC.pub && HC.cloud && HC.cloud.available) },
            { icon: "phone", label: T("重新校正水平"), run: () => (HC.gyro.recenter(), HC.toast(T("已重新校正"))), hidden: !(HC.gyro && HC.gyro.receiving) },
            data.own ? "-" : null,
            { icon: "trash", label: T("刪除"), danger: true, run: () => actions.remove(data, () => HC.go("#/")), hidden: !data.own },
          ],
          { el: e.currentTarget }
        )
      )
    );

    root.appendChild(h("div.viewer", stage, panel));
    root.appendChild(phoneBar);

    const onKey = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open], .fs, .menu")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if ((k === "ArrowLeft" || k === "[" || k === "PageUp") && list.length > 1) HC.go("#/card/" + prev.id);
      else if ((k === "ArrowRight" || k === "]" || k === "PageDown") && list.length > 1) HC.go("#/card/" + next.id);
      else if (k === "Escape" || k === "Backspace") HC.go(backHref);
      else if (k === "f" || k === "F") actions.fullscreen(card.data);
      else if (k === " ") {
        e.preventDefault();
        card.flip();
      } else if ((k === "t" || k === "T") && data.sand && data.fg) card.turn();
      else if ((k === "e" || k === "E") && data.own) actions.edit(data);
      else if (k === "Delete" && data.own) actions.remove(data, () => HC.go("#/"));
      else return;
    };
    document.addEventListener("keydown", onKey);

    /* Swipe sideways on the empty part of the stage to change card. */
    let sx = null;
    stage.addEventListener("touchstart", (e) => (sx = e.target.closest(".hc") ? null : e.touches[0].clientX), { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (sx == null || list.length < 2) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) HC.go("#/card/" + (dx < 0 ? next.id : prev.id));
      sx = null;
    });

    return {
      title: data.title || T("未命名卡片"),
      destroy() {
        card.destroy();
        document.removeEventListener("keydown", onKey);
        cleanups.forEach((f) => f && f());
      },
    };
  };

  function row(ic, label, run, key, danger) {
    return h("button.row" + (danger ? ".is-danger" : ""), { type: "button", onclick: run }, icon(ic), h("span.row__label", label), key ? h("kbd", key) : null);
  }

  /* ------------------------------------------------------------------ */
  /* Maker and shared card: the website's pages inside the app frame       */
  /* ------------------------------------------------------------------ */
  HC.appViews.create = async function (root, route) {
    const inner = h("div.make");
    const saveBtn = h("button.btn.btn--accent", { type: "button" }, icon("save"), h("span", route.id ? T("儲存變更") : T("儲存卡片")));
    root.appendChild(
      header({
        title: route.id ? T("編輯卡片") : T("製作卡片"),
        back: { href: route.id ? "#/card/" + route.id : "#/", label: route.id ? T("返回") : T("我的卡片") },
        actions: [saveBtn],
      })
    );
    root.appendChild(inner);
    const ctl = await HC.views.create(inner, route);
    // A public card is saved as a new one; the maker says so.
    if (ctl && ctl.saveLabel) saveBtn.lastElementChild.textContent = ctl.saveLabel;
    if (ctl && ctl.title) {
      const t = root.querySelector(".bar__title h1");
      if (t) t.textContent = ctl.title;
    }
    const form = inner.querySelector("form");
    if (form) {
      saveBtn.addEventListener("click", () => (form.requestSubmit ? form.requestSubmit() : form.querySelector("[type=submit]").click()));
    } else saveBtn.hidden = true;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && form) {
        e.preventDefault();
        saveBtn.click();
      }
    };
    document.addEventListener("keydown", onKey);
    return Object.assign({}, ctl, {
      destroy() {
        document.removeEventListener("keydown", onKey);
        if (ctl && ctl.destroy) ctl.destroy();
        refreshCount();
      },
    });
  };

  HC.appViews.shared = async function (root, route) {
    root.appendChild(header({ title: T("分享的卡片"), back: { href: "#/", label: T("我的卡片") } }));
    const inner = h("div.shared");
    root.appendChild(inner);
    const ctl = await HC.views.shared(inner, route);
    return ctl;
  };

  /* ------------------------------------------------------------------ */
  /* Public gallery, one public card, review: the shared pages in the frame */
  /* ------------------------------------------------------------------ */
  HC.appViews.public = async function (root, route) {
    root.appendChild(header({ title: T("公開展廳") }));
    const inner = h("div.app-page");
    root.appendChild(inner);
    return HC.views.public(inner, route);
  };
  HC.appViews.pubcard = async function (root, route) {
    root.appendChild(header({ title: T("公開的卡片"), back: { href: "#/public", label: T("公開展廳") } }));
    const inner = h("div.shared");
    root.appendChild(inner);
    return HC.views.pubcard(inner, route);
  };
  HC.appViews.admin = async function (root, route) {
    root.appendChild(header({ title: T("審核"), back: { href: "#/settings", label: T("設定") } }));
    const inner = h("div.app-page");
    root.appendChild(inner);
    return HC.views.admin(inner, route);
  };

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */
  HC.appViews.settings = async function (root) {
    const cfg = window.HC_CONFIG || {};
    const D = window.HC_DESKTOP;
    const own = await HC.cards.own();
    root.appendChild(header({ title: T("設定") }));

    const lang = h(
      "div.seg",
      { role: "radiogroup", "aria-label": T("語言") },
      ["zh", "en"].map((l) =>
        h("button.seg__btn", { type: "button", role: "radio", "aria-checked": String(HC.lang === l), onclick: () => HC.setLang(l) }, l === "zh" ? "中文" : "English")
      )
    );

    const cloudText = h("p.set__value");
    const cloudBtn = h("button.btn.btn--soft", { type: "button" });
    const syncCloud = () => {
      const c = HC.cloud;
      if (!c || !c.available) {
        cloudText.textContent = T("這個版本沒有開啟雲端同步。");
        cloudBtn.hidden = true;
        return;
      }
      cloudText.textContent = c.signedIn ? T("已登入：{email}", { email: c.email || "Google" }) : T("登入 Google，把卡片存到你自己的雲端硬碟，換裝置也拿得回來。");
      cloudBtn.textContent = c.signedIn ? T("同步與帳號") : T("用 Google 同步");
      cloudBtn.hidden = false;
    };
    cloudBtn.addEventListener("click", () =>
      HC.openCloud(() => {
        syncCloud();
        refreshSync();
        refreshCount();
      })
    );
    syncCloud();

    const verText = h("p.set__value", "3D Cards");
    if (D && D.version) D.version().then((v) => (verText.textContent = "3D Cards " + v)).catch(() => {});
    const gyroBtn = HC.gyroButton("btn btn--soft");

    const sections = [
      set(T("語言"), T("介面顯示的語言。"), lang),
      set(T("雲端同步"), cloudText, cloudBtn),
      HC.cloud && HC.cloud.available ? publicNameRow() : null,
      HC.gyro && HC.gyro.available ? set(T("動作感應"), T("轉動手機時，卡片和流沙會跟著動。"), gyroBtn) : null,
      set(
        T("卡片"),
        T("這台裝置上有 {n} 張卡片。", { n: own.length }),
        h(
          "div.set__row",
          h("button.btn.btn--soft", { type: "button", onclick: pickImport }, icon("import"), h("span", T("匯入卡片檔"))),
          h("button.btn.btn--soft", { type: "button", onclick: () => HC.openAddByLink() }, icon("link"), h("span", T("用連結加入")))
        )
      ),
      set(
        T("版本"),
        verText,
        D && D.checkForUpdates ? h("button.btn.btn--soft", { type: "button", onclick: () => D.checkForUpdates() }, icon("refresh"), h("span", T("檢查更新"))) : null
      ),
      set(
        T("關於"),
        T("3D Cards 是開源專案，以 MIT 授權釋出。照片只在你的裝置上處理，按下「分享」的卡片才會上傳。"),
        h(
          "div.set__row",
          cfg.hubUrl ? h("a.btn.btn--soft", { href: cfg.hubUrl, rel: "noopener", target: "_blank" }, T("Dreamsworld App 主頁")) : null,
          cfg.repoUrl ? h("a.btn.btn--soft", { href: cfg.repoUrl, rel: "noopener", target: "_blank" }, T("原始碼")) : null,
          h("a.btn.btn--soft", { href: (cfg.siteUrl || "") + "/privacy.html", rel: "noopener", target: "_blank" }, T("隱私權政策")),
          h("a.btn.btn--soft", { href: (cfg.siteUrl || "") + "/terms.html", rel: "noopener", target: "_blank" }, T("服務條款")),
          cfg.siteUrl && MODE.tauri ? h("a.btn.btn--soft", { href: cfg.siteUrl, rel: "noopener", target: "_blank" }, T("網站")) : null
        )
      ),
      !MODE.android && cfg.apkUrl ? set(T("其他裝置"), T("Android 手機也能安裝 3D Cards。"), h("a.btn.btn--soft", { href: cfg.apkUrl, rel: "noopener", target: "_blank" }, icon("download"), h("span", T("下載 Android 版")))) : null,
    ];
    root.appendChild(h("div.settings", sections));
    return {
      title: T("設定"),
      destroy() {
        if (gyroBtn._cleanup) gyroBtn._cleanup();
      },
    };
  };

  /** Settings row: the name shown in the public gallery, and review for the site owner. */
  function publicNameRow() {
    const text = h("p.set__value", T("登入 Google 後，可以設定在公開展廳顯示的名稱。"));
    const btn = h("button.btn.btn--soft", { type: "button" }, T("設定名稱"));
    const admin = h("a.btn.btn--soft", { href: "#/admin", hidden: true }, T("審核"));
    const sync = async () => {
      const who = HC.account ? await HC.account.me() : null;
      if (who) {
        text.textContent = who.name ? T("公開展廳顯示為「{name}」。", { name: who.name }) : T("還沒有設定公開名稱。");
        btn.textContent = who.name ? T("修改名稱") : T("設定名稱");
        admin.hidden = !who.admin;
      }
    };
    btn.addEventListener("click", async () => {
      if (!(await HC.account.signIn())) return;
      await HC.account.ensureName(true);
      sync();
    });
    sync();
    return set(T("公開名稱"), text, h("div.set__row", btn, admin));
  }

  function set(title, text, control) {
    return h(
      "section.set",
      h("div.set__text", h("h2.set__title", title), typeof text === "string" ? h("p.set__value", text) : text),
      control ? h("div.set__control", control) : null
    );
  }

  /* ------------------------------------------------------------------ */
  /* App-wide behaviour                                                  */
  /* ------------------------------------------------------------------ */
  function boot() {
    mount();
    // Shortcuts that work everywhere.
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        HC.go("#/create");
      } else if (k === "o") {
        e.preventDefault();
        pickImport();
      } else if (k === ",") {
        e.preventDefault();
        HC.go("#/settings");
      }
    });
    // No browser right-click menu, except in text fields.
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest("input, textarea, [contenteditable]")) e.preventDefault();
    });
    // Pictures and links are not dragged around like in a browser.
    document.addEventListener("dragstart", (e) => {
      if (e.target.closest && e.target.closest("a, img")) e.preventDefault();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
