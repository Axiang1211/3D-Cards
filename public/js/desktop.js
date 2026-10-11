/*
 * desktop.js
 * Only active inside the Windows app (Tauri). On the website it does nothing.
 *
 *  - window.HC_DESKTOP tells the rest of the site it runs in the app
 *  - links to other sites open in the normal browser
 *  - on start-up, compares the app version with the newest GitHub release
 *    and offers the update (the app keeps working if the user says no)
 */
(function () {
  "use strict";
  const T = window.__TAURI__;
  if (!T) return;

  const HC = (window.HC = window.HC || {});
  const REPO = "Axiang1211/3D-Cards";
  const RELEASE_API = "https://api.github.com/repos/" + REPO + "/releases/latest";
  const RELEASE_PAGE = "https://github.com/" + REPO + "/releases/latest";
  const SKIP_KEY = "hc:skip-version";

  const openUrl = (url) => {
    try {
      if (T.opener && T.opener.openUrl) return T.opener.openUrl(url);
      return T.core.invoke("plugin:opener|open_url", { url });
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const appVersion = () => (T.app && T.app.getVersion ? T.app.getVersion() : T.core.invoke("plugin:app|version"));

  /* Links to other sites open in the default browser, not inside the app. */
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.hasAttribute("download")) return;
      const url = new URL(a.getAttribute("href"), location.href);
      if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
      e.preventDefault();
      openUrl(url.href).catch(() => {});
    },
    true
  );

  /* 1.2.10 > 1.2.9 */
  function newer(a, b) {
    const pa = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
  }

  function setupFor(release) {
    const asset = (release.assets || []).find((x) => /setup\.exe$/i.test(x.name));
    return asset ? asset.browser_download_url : RELEASE_PAGE;
  }

  function askToUpdate(current, release) {
    const latest = String(release.tag_name).replace(/^v/, "");
    const h = HC.h;
    const dlg = h("dialog.share", { "aria-labelledby": "upd-title" });
    const skip = h("input", { type: "checkbox" });
    const close = () => {
      if (skip.checked) {
        try {
          localStorage.setItem(SKIP_KEY, latest);
        } catch (e) {}
      }
      dlg.close();
    };
    const body = h("div.share__body");
    const go = h("button.btn.btn--ink", { type: "button" }, HC.t("下載新版"));
    const later = h("button.btn.btn--quiet", { type: "button", onclick: close }, HC.t("稍後再說"));
    body.append(
      h("p.share__note", HC.t("3D Cards {latest} 已經推出，你目前使用的是 {current}。", { latest, current })),
      h("p.share__note", HC.t("更新後才能使用新功能。不更新也可以繼續使用目前的版本。")),
      h("div.share__actions", go, later),
      h("label.check", skip, h("span", HC.t("這個版本不再提醒")))
    );
    go.addEventListener("click", () => {
      openUrl(setupFor(release)).catch(() => openUrl(RELEASE_PAGE).catch(() => {}));
      body.replaceChildren(
        h("p.share__note", HC.t("新版安裝檔正在你的瀏覽器裡下載。")),
        h("p.share__note", HC.t("下載完成後，先關閉 3D Cards，再執行 3D-Cards-Setup.exe，就會更新成新版本。你做過的卡片都會保留。")),
        h("div.share__actions", h("button.btn.btn--ink", { type: "button", onclick: () => dlg.close() }, HC.t("知道了")))
      );
    });
    dlg.append(
      h(
        "div.share__head",
        h("h2.share__title", { id: "upd-title" }, HC.t("有新版本")),
        h("button.share__x", { type: "button", "aria-label": HC.t("關閉"), onclick: close }, "×")
      ),
      body
    );
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  async function checkForUpdates(manual) {
    let current;
    let release;
    try {
      current = await appVersion();
      const res = await fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
      if (!res.ok) throw new Error("http " + res.status);
      release = await res.json();
    } catch (e) {
      if (manual) HC.toast(HC.t("現在無法連上 GitHub 檢查更新，請確認網路後再試。"), "error");
      return;
    }
    const latest = String(release.tag_name || "").replace(/^v/, "");
    if (!latest || !newer(latest, current)) {
      if (manual) HC.toast(HC.t("你使用的 {current} 已經是最新版本。", { current }));
      return;
    }
    let skipped = null;
    try {
      skipped = localStorage.getItem(SKIP_KEY);
    } catch (e) {}
    if (!manual && skipped === latest) return;
    askToUpdate(current, release);
  }

  window.HC_DESKTOP = {
    version: appVersion,
    checkForUpdates: () => checkForUpdates(true),
  };

  /* .3dcard files double-clicked in Windows arrive here and are saved to My cards. */
  async function openCardFiles(texts) {
    let last = null;
    for (const text of texts || []) {
      try {
        const res = await HC.io.saveImported(text);
        last = res;
        HC.toast(res.existed ? HC.t("這張卡片之前已經加入過了") : HC.t("已加入「{title}」", { title: res.title || HC.t("未命名卡片") }));
      } catch (e) {
        HC.toast(e.message || HC.t("匯入失敗。"), "error");
      }
    }
    if (last) HC.go("#/card/" + last.id);
  }

  window.addEventListener("load", () => {
    try {
      T.core.invoke("take_opened_cards").then(openCardFiles).catch(() => {});
      if (T.event && T.event.listen) T.event.listen("open-cards", (e) => openCardFiles(e.payload));
    } catch (e) {}
    setTimeout(() => checkForUpdates(false), 2500);
  });
})();
