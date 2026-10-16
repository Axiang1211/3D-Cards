/*
 * view-download.js
 * #/download — get 3D Cards for your device: Windows, Mac, Android, iPhone.
 * The device you are on comes first. Platforms without an app yet say so
 * and point to the closest thing that works today.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  HC.views = HC.views || {};
  const h = (...a) => HC.h(...a);
  const T = (s, p) => HC.t(s, p);

  function device() {
    const ua = navigator.userAgent;
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Macintosh|Mac OS X/.test(ua)) return "mac";
    if (/Windows/.test(ua)) return "windows";
    return "";
  }

  const GLYPH = {
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  };
  function glyph(name) {
    const s = h("span.dl__glyph", { "aria-hidden": "true" });
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${GLYPH[name]}</svg>`;
    return s;
  }

  const mb = (bytes) => (bytes ? (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + " MB" : "");

  HC.views.download = async function (root) {
    const cfg = window.HC_CONFIG || {};
    const mine = device();
    const pwa = HC.pwa;

    const platforms = [
      {
        id: "windows",
        glyph: "laptop",
        name: "Windows",
        needs: T("Windows 10、11"),
        open: !!cfg.downloadUrl,
        href: cfg.downloadUrl,
        file: T(".exe 安裝檔"),
        action: T("下載 Windows 版"),
        storeUrl: cfg.storeUrl !== undefined ? cfg.storeUrl : "https://apps.microsoft.com/detail/9NF04B59SKW3?hl=en-us&gl=MY&ocid=pdpshare",
        storeLabel: T("Microsoft Store 下載"),
        steps: [
          T("下載後雙擊 3D-Cards-Setup.exe，照著畫面安裝。"),
          T("如果出現「Windows 已保護您的電腦」，按「其他資訊」→「仍要執行」。這是因為程式沒有購買數位簽章。"),
          T("桌面會出現 3D Cards。之後有新版本，打開時會提示更新。"),
        ],
      },
      {
        id: "mac",
        glyph: "laptop",
        name: "macOS",
        needs: cfg.dmgUrl ? T("macOS 10.15 以上，Apple 晶片和 Intel 都可以") : T("Mac 版還在準備中"),
        open: !!cfg.dmgUrl,
        href: cfg.dmgUrl,
        file: T(".dmg 安裝檔"),
        action: T("下載 Mac 版"),
        steps: [
          T("下載後打開 3D-Cards.dmg，把 3D Cards 拖到「應用程式」資料夾。"),
          T("第一次打開時，如果出現「無法打開」或「無法驗證開發者」，到「系統設定」→「隱私權與安全性」，往下捲按「仍要打開」。這是因為程式沒有購買 Apple 的開發者簽章。"),
          T("之後從「應用程式」或 Launchpad 打開 3D Cards。有新版本時，打開時會提示更新。"),
        ],
        alt: T("現在可以用 Safari 或 Chrome 打開網站，或把網站安裝成 App，功能都一樣。"),
        altAction: { label: T("把網站安裝成 App"), run: () => pwa && pwa.howTo("desktop") },
      },
      {
        id: "android",
        glyph: "phone",
        name: "Android",
        needs: T("Android 7.0 以上"),
        open: !!cfg.apkUrl,
        href: cfg.apkUrl,
        file: T(".apk 安裝檔"),
        action: T("下載 APK"),
        note: T("目前只提供 APK，沒有在 Play 商店上架。"),
        steps: [
          T("用手機下載 3D-Cards.apk，再打開它。"),
          T("第一次會問要不要允許瀏覽器「安裝不明來源的應用程式」，允許後按「安裝」。"),
          T("主畫面會出現 3D Cards。之後有新版本，打開時會提示更新。"),
        ],
      },
      {
        id: "ios",
        glyph: "phone",
        name: "iPhone / iPad",
        needs: T("iOS 版還在準備中"),
        open: false,
        alt: T("現在可以把網站加入主畫面，打開後就像 App，沒有網路也能看卡片。"),
        altAction: { label: T("加入主畫面的方法"), run: () => pwa && pwa.howTo("ios") },
      },
    ];
    // Your own device first.
    platforms.sort((a, b) => (b.id === mine) - (a.id === mine));

    const sizes = {};
    const tiles = platforms.map((p) => {
      const meta = h("p.dl__meta", p.open ? p.file : "");
      sizes[p.id] = meta;
      const head = h(
        "div.dl__head",
        glyph(p.glyph),
        h("div.dl__name", h("h2", p.name), h("p.dl__needs", p.needs)),
        p.id === mine ? h("span.dl__you", T("你的裝置")) : null,
        !p.open ? h("span.dl__soon", T("即將推出")) : null
      );
      const body = p.open
        ? [
            meta,
            p.note ? h("p.dl__note", p.note) : null,
            h(
              "div.dl__actions",
              h("a.btn.btn--ink", { href: p.href, rel: "noopener", download: "" }, p.action),
              p.storeUrl ? h("a.dl__link", { href: p.storeUrl, rel: "noopener" }, p.storeLabel) : null,
              h("details.dl__steps", h("summary", T("安裝步驟")), h("ol", p.steps.map((s) => h("li", s))))
            ),
          ]
        : [
            h("p.dl__note", p.alt),
            h(
              "div.dl__actions",
              h("button.btn.btn--line", { type: "button", disabled: true }, T("尚未開放")),
              p.altAction ? h("button.btn.btn--quiet", { type: "button", onclick: p.altAction.run }, p.altAction.label) : null
            ),
          ];
      return h("li.dl__tile" + (p.open ? ".is-open" : ".is-soon") + (p.id === mine ? ".is-mine" : ""), { dataset: { platform: p.id } }, head, body);
    });

    const version = h("span.dl__version");
    root.appendChild(
      h(
        "section.dl",
        h(
          "header.dl__intro",
          h("h1.dl__title", T("下載 3D Cards")),
          h("p.dl__lead", T("安裝 App 後不用開瀏覽器，也能做卡片、整理收藏；卡片可以用 Google 雲端同步到每一台裝置。")),
          version
        ),
        h("ol.dl__grid", tiles),
        h(
          "div.dl__web",
          h(
            "div",
            h("h2.dl__web-title", T("不想安裝？")),
            h("p.dl__note", T("網頁版的功能和 App 一樣，打開就能用。也可以把網站安裝成 App，所有裝置都適用。"))
          ),
          h(
            "div.dl__actions",
            h("a.btn.btn--ink", { href: "#/create" }, T("直接在網頁製作")),
            pwa && pwa.offer ? h("button.btn.btn--line", { type: "button", onclick: () => pwa.install() }, T("把網站安裝成 App")) : null
          )
        ),
        cfg.repoUrl
          ? h("p.dl__foot", T("所有版本都放在 GitHub 的"), " ", h("a", { href: cfg.repoUrl + "/releases", rel: "noopener" }, T("Releases 頁面")), T("。"))
          : null
      )
    );

    // Newest version and file sizes: from the site, or straight from GitHub.
    const fromGitHub = () =>
      fetch("https://api.github.com/repos/" + String(cfg.repoUrl || "").replace(/^https:\/\/github\.com\//, "") + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return null;
          const assets = {};
          (d.assets || []).forEach((a) => {
            if (/setup\.exe$/i.test(a.name)) assets.windows = { size: a.size };
            if (/\.dmg$/i.test(a.name)) assets.mac = { size: a.size };
            if (/\.apk$/i.test(a.name)) assets.android = { size: a.size };
          });
          return { version: String(d.tag_name || "").replace(/^v/, ""), date: d.published_at, assets };
        });
    fetch("/api/release")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => (d && d.version ? d : cfg.repoUrl ? fromGitHub() : null))
      .then((d) => {
        if (!d || !d.version) return;
        const date = d.date ? new Date(d.date) : null;
        version.textContent = date
          ? T("最新版本 {v}，{y} 年 {m} 月 {d} 日發布", { v: d.version, y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() })
          : T("最新版本 {v}", { v: d.version });
        ["windows", "mac", "android"].forEach((k) => {
          const a = d.assets && d.assets[k];
          if (a && sizes[k] && sizes[k].textContent) sizes[k].textContent += T("，約 {s}", { s: mb(a.size) });
        });
      })
      .catch(() => {});

    return { title: T("下載 3D Cards") };
  };
})();
