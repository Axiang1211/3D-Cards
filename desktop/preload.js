// Lets the website know it is running inside the desktop app
// (hides the download links, sends shares to the online site, shows the version).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("HC_DESKTOP", {
  version: () => ipcRenderer.invoke("app:version"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-updates"),
});
