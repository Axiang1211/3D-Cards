/*
 * Update check for the desktop app.
 *
 * On every launch the app asks GitHub Releases for the newest version.
 * When GitHub has a newer version, the user is asked whether to update:
 *   - 立即更新   downloads the installer, then restarts into the new version
 *   - 稍後再說   keeps using this version (new features need the update)
 *   - 這個版本不再提醒 (checkbox) skips reminders until an even newer version appears
 */
const { app, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const RELEASES_URL = "https://github.com/Axiang1211/3D-Cards/releases/latest";

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (e) {
  autoUpdater = null;
}

const prefsFile = () => path.join(app.getPath("userData"), "update-prefs.json");
function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
  } catch (e) {
    return {};
  }
}
function writePrefs(p) {
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(p));
  } catch (e) {
    /* not important */
  }
}

let getWindow = () => null;
let busy = false;
let manual = false;

function setup(windowGetter) {
  getWindow = windowGetter;
  if (!autoUpdater) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-available", async (info) => {
    const prefs = readPrefs();
    if (!manual && prefs.skipVersion === info.version) {
      busy = false;
      return;
    }
    const win = getWindow();
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: "info",
      title: "有新版本",
      message: `3D Cards ${info.version} 已經推出`,
      detail:
        `你目前使用的是 ${app.getVersion()}。\n\n` +
        "更新後才能使用新功能。不更新也可以繼續使用目前的版本。",
      buttons: ["立即更新", "稍後再說"],
      defaultId: 0,
      cancelId: 1,
      checkboxLabel: "這個版本不再提醒",
      checkboxChecked: false,
      noLink: true,
    });
    if (checkboxChecked) writePrefs(Object.assign(prefs, { skipVersion: info.version }));
    if (response !== 0) {
      busy = false;
      return;
    }
    if (win) win.setTitle(`3D Cards｜正在下載 ${info.version}…`);
    autoUpdater.downloadUpdate().catch(onError);
  });

  autoUpdater.on("update-not-available", () => {
    busy = false;
    if (manual) {
      dialog.showMessageBox(getWindow(), {
        type: "info",
        title: "已是最新版本",
        message: `你使用的 ${app.getVersion()} 已經是最新版本。`,
        buttons: ["好"],
        noLink: true,
      });
    }
  });

  autoUpdater.on("download-progress", (p) => {
    const win = getWindow();
    if (!win) return;
    win.setProgressBar(p.percent / 100);
    win.setTitle(`3D Cards｜正在下載更新 ${Math.round(p.percent)}%`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    busy = false;
    const win = getWindow();
    if (win) {
      win.setProgressBar(-1);
      win.setTitle("3D Cards");
    }
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "更新已下載",
      message: `${info.version} 已經下載好了`,
      detail: "重新啟動後就會換成新版本。如果現在不想重新啟動，下次關閉 3D Cards 時會自動安裝。",
      buttons: ["現在重新啟動", "稍後"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  autoUpdater.on("error", onError);
}

function onError(err) {
  const wasManual = manual;
  busy = false;
  const win = getWindow();
  if (win) {
    win.setProgressBar(-1);
    win.setTitle("3D Cards");
  }
  console.error("update error:", err && err.message);
  // Automatic checks fail quietly (for example when offline).
  if (!wasManual) return;
  dialog
    .showMessageBox(win, {
      type: "warning",
      title: "無法檢查更新",
      message: "現在無法連上 GitHub 檢查更新。",
      detail: "請確認網路連線，或到 GitHub 下載最新版本手動安裝。",
      buttons: ["打開下載頁面", "關閉"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) shell.openExternal(RELEASES_URL);
    });
}

/** Check GitHub for a newer version. isManual: the user pressed 檢查更新. */
async function check(isManual) {
  if (busy) return;
  manual = !!isManual;
  if (!app.isPackaged || !autoUpdater) {
    if (manual) {
      dialog.showMessageBox(getWindow(), {
        type: "info",
        title: "檢查更新",
        message: "開發模式下不會檢查更新。",
        buttons: ["好"],
        noLink: true,
      });
    }
    return;
  }
  busy = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    onError(err);
  }
}

module.exports = { setup, check };
