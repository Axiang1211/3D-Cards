/*
 * 3D Cards desktop app (Electron).
 * Shows the same website from ../public, packaged inside the app, so it works offline.
 * Shared links still use the online site (config.js → siteUrl).
 */
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require("electron");
const updater = require("./updater");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const WEB = path.join(__dirname, "web");
const ORIGIN = "app://3dcards";

// app:// behaves like a normal secure website (storage, fetch, clipboard all work).
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    title: "3D Cards",
    backgroundColor: "#dde0e3",
    icon: path.join(__dirname, "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Links to other sites (GitHub, shared links) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(ORIGIN + "/index.html");
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (p === "/" || p === "") p = "/index.html";
    const file = path.normalize(path.join(WEB, p));
    if (!file.startsWith(WEB + path.sep)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:check-updates", () => updater.check(true));

  Menu.setApplicationMenu(null);
  createWindow();

  // Look for a newer version on GitHub a few seconds after start-up.
  updater.setup(() => win);
  setTimeout(() => updater.check(false), 4000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
