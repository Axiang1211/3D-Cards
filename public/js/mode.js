/*
 * mode.js — loaded in <head>, before anything is drawn.
 * Decides whether 3D Cards shows as the website or as the app:
 *   the Windows / Android app (Tauri), or the website installed to the
 *   home screen / desktop (PWA, "standalone"), get the app layout.
 * ?app=1 / ?app=0 in the address forces one or the other (handy for testing).
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var q = /[?&]app=([01])/.exec(location.search);
  var forced = null;
  try {
    if (q) localStorage.setItem("hc:app", q[1]);
    forced = localStorage.getItem("hc:app");
  } catch (e) {}
  var tauri = !!window.__TAURI__ || !!window.__TAURI_INTERNALS__;
  var standalone = false;
  try {
    standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone === true;
  } catch (e) {}
  var android = /Android/i.test(navigator.userAgent);
  var app = forced === "1" ? true : forced === "0" ? false : tauri || standalone;
  window.HC_MODE = { app: app, tauri: tauri, standalone: standalone, android: android };
  if (app) root.classList.add("is-app");
  if (tauri) root.classList.add("is-tauri");
  if (android) root.classList.add("is-android");
})();
