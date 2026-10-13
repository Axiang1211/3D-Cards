/*
 * pwa.js
 * Installing the website as an app (PWA):
 *  - registers the offline service worker (sw.js)
 *  - HC.pwa.install(): the browser's own install prompt where there is one,
 *    otherwise a short how-to (iPhone: Share → Add to Home Screen)
 *  - .3dcard files opened with the installed app arrive here (launchQueue)
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const MODE = window.HC_MODE || {};
  let deferred = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  const web = /^https?:$/.test(location.protocol) && !MODE.tauri;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  if (web && "serviceWorker" in navigator && (location.protocol === "https:" || local)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
    if (HC.toast) HC.toast(HC.t("已安裝 3D Cards，可以從主畫面或桌面打開。"));
  });

  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  HC.pwa = {
    get installed() {
      return !!MODE.standalone;
    },
    /** The browser can show its own install prompt right now. */
    get promptReady() {
      return !!deferred;
    },
    /** Worth offering an "Install app" button: not inside the app already. */
    get offer() {
      return web && !MODE.standalone;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async install() {
      if (deferred) {
        const d = deferred;
        deferred = null;
        emit();
        try {
          await d.prompt();
          await d.userChoice;
        } catch (e) {}
        return;
      }
      howTo();
    },
    /** Steps for adding the website to a home screen / desktop: "ios", "android", "desktop" or this device. */
    howTo: (kind) => howTo(kind),
  };

  function howTo(kind) {
    kind = kind || (ios ? "ios" : MODE.android ? "android" : "desktop");
    const h = HC.h;
    const cfg = window.HC_CONFIG || {};
    const steps = kind === "ios"
      ? [HC.t("用 Safari 打開這個網站。"), HC.t("按下方的「分享」按鈕。"), HC.t("選「加入主畫面」，再按「新增」。")]
      : kind === "android"
      ? [HC.t("用 Chrome 打開這個網站。"), HC.t("按右上角的 ⋮ 選單。"), HC.t("選「安裝應用程式」或「加到主畫面」。")]
      : [HC.t("用 Chrome 或 Edge 打開這個網站。"), HC.t("按網址列右邊的「安裝」圖示，或選單裡的「安裝 3D Cards」。")];
    const dlg = h("dialog.share", { "aria-labelledby": "pwa-title" });
    const close = () => dlg.close();
    const body = h(
      "div.share__body",
      h("p.share__note", HC.t("安裝後，3D Cards 會像 App 一樣從主畫面或桌面打開，沒有網路也能看你的卡片。")),
      h("ol.howto", steps.map((s) => h("li", s))),
      kind === "android" && cfg.apkUrl
        ? h("p.share__note", HC.t("也可以直接下載 Android 安裝檔："), " ", h("a", { href: cfg.apkUrl, rel: "noopener" }, "3D-Cards.apk"))
        : null,
      h("div.share__actions", h("button.btn.btn--ink", { type: "button", onclick: close }, HC.t("知道了")))
    );
    dlg.append(
      h("div.share__head", h("h2.share__title", { id: "pwa-title" }, HC.t("安裝成 App")), h("button.share__x", { type: "button", "aria-label": HC.t("關閉"), onclick: close }, "×")),
      body
    );
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  /* .3dcard files opened with the installed app (Chrome / Edge on a computer). */
  if ("launchQueue" in window && window.launchQueue && typeof window.launchQueue.setConsumer === "function") {
    window.launchQueue.setConsumer(async (params) => {
      if (!params || !params.files || !params.files.length) return;
      let last = null;
      for (const handle of params.files) {
        try {
          const file = await handle.getFile();
          const res = await HC.io.saveImported(await file.text());
          last = res;
          HC.toast(res.existed ? HC.t("這張卡片之前已經加入過了") : HC.t("已加入「{title}」", { title: res.title || HC.t("未命名卡片") }));
        } catch (e) {
          HC.toast(e.message || HC.t("匯入失敗。"), "error");
        }
      }
      if (last) HC.go("#/card/" + last.id);
    });
  }
})();
