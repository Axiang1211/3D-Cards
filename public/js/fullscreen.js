/*
 * fullscreen.js
 * Full-screen viewer: one card on a dark stage.
 *   drag            rotate freely, all the way round, either way (with inertia,
 *                   settles on the front or back)
 *   360° button / R spin like a turntable
 *   mouse / phone   tilt a little on top, with the same 2.5D depth as the card page
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
      h("span.hint-desk", HC.t("拖曳 360° 旋轉 · 雙擊翻面 · 滾輪縮放")),
      h("span.hint-touch", HC.t("拖曳 360° 旋轉 · 點兩下翻面 · 雙指縮放"))
    );
    const spinBtn = h("button.btn.btn--light.btn--sm", { type: "button", "aria-pressed": "false" }, HC.t("360° 自動旋轉"));
    const tools = h("div.fs__tools", spinBtn);
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
    // rotY / rotX: where the card has been turned to (any angle, all the way round).
    // hx / hy: the extra tilt that follows the mouse or the phone, like on the card page.
    const TILT = 14; // degrees, same as the card page
    const SPIN = 0.75; // degrees per frame while spinning (about 45°/s)
    const DEPTH = 1 / Math.sin((TILT * Math.PI) / 180); // full parallax at the card page's tilt
    let rotY = -18, rotX = 6, velY = 0, velX = 0;
    let targetY = 0, targetX = 0, zoom = 1, targetZoom = 1;
    let hx = 0, hy = 0, thx = 0, thy = 0;
    let dragging = false, settling = false, spinning = false, alive = true;
    let last = null;
    const pointers = new Map();
    let pinchStart = 0, pinchZoom = 1;
    let lastTap = 0;

    function write() {
      const s = card.s;
      const ry = rotY + hx * TILT;
      const rx = rotX - hy * TILT;
      s.ry.jump(ry);
      s.rx.jump(rx);
      // Light, foil and the 2.5D depth follow the angle the card is turned to.
      const ay = (ry * Math.PI) / 180;
      const ax = (rx * Math.PI) / 180;
      const facing = Math.cos(ay) * Math.cos(ax) >= 0 ? 1 : -1; // mirrored on the back
      const dx = clamp(Math.sin(ay) * DEPTH, -1, 1) * facing;
      const dy = clamp(-Math.sin(ax) * DEPTH, -1, 1);
      s.mx.jump(50 + dx * 50);
      s.my.jump(50 + dy * 50);
      s.o.jump(0.45 + 0.55 * Math.min(1, Math.hypot(dx, dy)));
      s.lift.jump(1 + 0.035 * Math.min(1, Math.hypot(hx, hy) * 2));
      card._write();
      stage.style.transform = `scale(${zoom.toFixed(4)})`;
    }

    const near = (v, step) => Math.round(v / step) * step;

    // Time-based, so slow screens spin and settle at the same speed.
    let prev = performance.now();
    const ease = (a, k) => 1 - Math.pow(1 - a, k);

    function frame(now) {
      if (!alive) return;
      const k = Math.min(4, Math.max(0.25, (now - prev) / 16.667 || 1));
      prev = now;
      if (!dragging) {
        if (spinning) {
          // Turntable: keep going round, level out the up/down angle.
          velY += ((velY < 0 ? -SPIN : SPIN) - velY) * ease(0.04, k);
          velX *= Math.pow(0.9, k);
          rotY += velY * k;
          rotX += velX * k;
          rotX += (near(rotX, 360) - rotX) * ease(0.04, k);
        } else if (!settling) {
          rotY += velY * k;
          rotX += velX * k;
          velY *= Math.pow(0.94, k);
          velX *= Math.pow(0.94, k);
          if (Math.abs(velY) < 0.08 && Math.abs(velX) < 0.08) {
            settling = true;
            targetY = near(rotY, 180);
            targetX = near(rotX, 360);
          }
        } else {
          rotY += (targetY - rotY) * ease(0.08, k);
          rotX += (targetX - rotX) * ease(0.06, k);
        }
      }
      hx += (thx - hx) * ease(0.12, k);
      hy += (thy - hy) * ease(0.12, k);
      zoom += (targetZoom - zoom) * ease(0.2, k);
      write();
      requestAnimationFrame(frame);
    }

    function setSpin(on) {
      spinning = on;
      spinBtn.setAttribute("aria-pressed", String(on));
      spinBtn.textContent = on ? HC.t("停止旋轉") : HC.t("360° 自動旋轉");
      if (on) {
        settling = false;
        if (Math.abs(velY) < 0.2) velY = SPIN * 0.2;
      } else {
        settling = false; // coast to a stop, then settle on a face
      }
    }
    spinBtn.addEventListener("click", () => setSpin(!spinning));

    /* Hover / phone tilt on top of the turn ---------------------------- */
    root.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || dragging || pointers.size) return;
      const r = stage.getBoundingClientRect();
      thx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      thy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
    });
    root.addEventListener("pointerleave", () => {
      thx = thy = 0;
    });
    const unGyro = HC.gyro
      ? HC.gyro.subscribe((x, y) => {
          if (!HC.gyro.receiving || dragging || pointers.size) return;
          thx = clamp(x, -1, 1);
          thy = clamp(y, -1, 1);
        })
      : null;

    /* Pointer: rotate any way, pinch, double-tap ------------------------ */
    root.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      root.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      thx = thy = 0;
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
      // Upside down, left/right drags turn the other way so the card still follows the hand.
      const upright = Math.cos((rotX * Math.PI) / 180) >= 0 ? 1 : -1;
      rotY += dx * 0.45 * upright;
      rotX -= dy * 0.45;
      velY = dx * 0.45 * upright;
      velX = -dy * 0.45;
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
      if (spinning) setSpin(false);
      settling = true;
      velY = velX = 0;
      targetY = (Math.round(rotY / 180) + 1) * 180;
      targetX = near(rotX, 360);
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
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        settling = false;
        velX = e.key === "ArrowUp" ? 6 : -6;
      }
      if (e.key === "r" || e.key === "R") setSpin(!spinning);
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
      if (unGyro) unGyro();
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
