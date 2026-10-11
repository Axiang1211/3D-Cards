/*
 * fullscreen.js
 * Full-screen viewer: one card on a dark stage.
 *   drag            rotate freely (with inertia, settles on the front or back)
 *   double-click    flip
 *   wheel / pinch   zoom
 *   Esc / ×         close
 * Uses the browser's real full-screen mode where available (not on iPhone,
 * where it falls back to covering the page).
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  const h = (...a) => HC.h(...a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  HC.openFullscreen = function (data) {
    const card = new HC.HoloCard(data, { interactive: false, gyro: false, maxTilt: 0 });
    const stage = h("div.fs__card", card.el);
    const close = h("button.fs__close", { type: "button", "aria-label": HC.t("關閉全螢幕") }, "×");
    const hint = h(
      "p.fs__hint",
      h("span.hint-desk", HC.t("拖曳旋轉 · 雙擊翻面 · 滾輪縮放")),
      h("span.hint-touch", HC.t("拖曳旋轉 · 點兩下翻面 · 雙指縮放"))
    );
    const tools = h("div.fs__tools");
    if (data.sand && data.fg) {
      tools.appendChild(h("button.btn.btn--light.btn--sm", { type: "button", onclick: () => card.turn() }, HC.t("上下顛倒")));
    }
    const root = h(
      "div.fs",
      { role: "dialog", "aria-modal": "true", "aria-label": data.title || HC.t("未命名卡片"), tabindex: "-1" },
      h("div.fs__floor"),
      stage,
      close,
      tools,
      hint
    );
    document.body.appendChild(root);
    document.documentElement.classList.add("is-fs");

    /* State ------------------------------------------------------------ */
    let rotY = -18, rotX = 6, velY = 0, velX = 0;
    let targetY = 0, zoom = 1, targetZoom = 1;
    let dragging = false, settling = false, alive = true;
    let last = null;
    const pointers = new Map();
    let pinchStart = 0, pinchZoom = 1;
    let lastTap = 0;

    function write() {
      const s = card.s;
      s.ry.jump(rotY);
      s.rx.jump(rotX);
      // Light and foil follow the angle the card is turned to.
      const ay = (rotY * Math.PI) / 180;
      const ax = (rotX * Math.PI) / 180;
      const facing = Math.cos(ay) >= 0 ? 1 : -1; // mirror the light on the back
      s.mx.jump(50 + Math.sin(ay) * 55 * facing);
      s.my.jump(50 - Math.sin(ax) * 70);
      s.o.jump(0.45 + 0.55 * Math.min(1, Math.abs(Math.sin(ay)) * 1.6 + Math.abs(Math.sin(ax))));
      card._write();
      stage.style.transform = `scale(${zoom.toFixed(4)})`;
    }

    function frame() {
      if (!alive) return;
      if (!dragging) {
        if (!settling) {
          rotY += velY;
          rotX += velX;
          velY *= 0.94;
          velX *= 0.9;
          if (Math.abs(velY) < 0.08 && Math.abs(velX) < 0.08) {
            settling = true;
            targetY = Math.round(rotY / 180) * 180;
          }
        } else {
          rotY += (targetY - rotY) * 0.08;
        }
        rotX += (0 - rotX) * 0.05;
      }
      zoom += (targetZoom - zoom) * 0.2;
      write();
      requestAnimationFrame(frame);
    }

    /* Pointer: rotate, pinch, double-tap -------------------------------- */
    root.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      root.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = targetZoom;
        dragging = false;
        return;
      }
      const now = performance.now();
      if (now - lastTap < 300) {
        flip();
        lastTap = 0;
        return;
      }
      lastTap = now;
      dragging = true;
      settling = false;
      velY = velX = 0;
      last = { x: e.clientX, y: e.clientY, t: now };
    });
    root.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        targetZoom = clamp((pinchZoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinchStart, 0.6, 2.4);
        return;
      }
      if (!dragging || !last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      rotY += dx * 0.45;
      rotX = clamp(rotX - dy * 0.3, -40, 40);
      velY = dx * 0.45;
      velX = -dy * 0.3;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      if (pointers.size === 0) {
        dragging = false;
        if (last && performance.now() - last.t > 80) velY = velX = 0; // held still before letting go
      }
    };
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);

    root.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        targetZoom = clamp(targetZoom * Math.exp(-e.deltaY * 0.0015), 0.6, 2.4);
      },
      { passive: false }
    );

    function flip() {
      settling = true;
      velY = velX = 0;
      targetY = (Math.round(rotY / 180) + 1) * 180;
    }

    /* Keyboard -------------------------------------------------------- */
    function onKey(e) {
      if (e.key === "Escape") return exit();
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        flip();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        settling = false;
        velY = e.key === "ArrowLeft" ? -6 : 6;
      }
      if (e.key === "+" || e.key === "=") targetZoom = clamp(targetZoom * 1.15, 0.6, 2.4);
      if (e.key === "-") targetZoom = clamp(targetZoom / 1.15, 0.6, 2.4);
    }
    document.addEventListener("keydown", onKey, true);

    /* Real full-screen where the browser allows it ---------------------- */
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(root);
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
    const onFsChange = () => {
      if (!fsEl() && alive && root.dataset.wasFs) exit();
      if (fsEl()) root.dataset.wasFs = "1";
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    function exit() {
      if (!alive) return;
      alive = false;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      if (fsEl()) {
        const ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) {
          try {
            const p = ex.call(document);
            if (p && p.catch) p.catch(() => {});
          } catch (e) {}
        }
      }
      card.destroy();
      root.remove();
      document.documentElement.classList.remove("is-fs");
    }
    close.addEventListener("click", exit);

    root.focus();
    write();
    requestAnimationFrame(frame);
    return { close: exit };
  };
})();
