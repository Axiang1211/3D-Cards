/*
 * holo-card.js
 * The card component: builds the DOM, follows the pointer or the gyroscope,
 * and drives every effect through CSS custom properties.
 *
 *   const card = new HC.HoloCard(data, { idle: true, flippable: true });
 *   parent.appendChild(card.el);
 *   card.destroy();
 *
 * data = { title, subtitle, serial, image, fg, foil, area, frame,
 *          zoom, posX, posY, showText }
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});

  HC.FOILS = [
    { id: "rainbow", name: "彩虹" },
    { id: "stardust", name: "星塵" },
    { id: "prism", name: "稜鏡" },
    { id: "metal", name: "流光" },
    { id: "gloss", name: "亮面" },
  ];
  HC.AREAS = [
    { id: "full", name: "整張" },
    { id: "art", name: "只有照片" },
    { id: "frame", name: "只有邊框" },
  ];
  HC.FRAMES = [
    { id: "none", name: "無邊框" },
    { id: "white", name: "白" },
    { id: "black", name: "黑" },
    { id: "silver", name: "銀" },
    { id: "gold", name: "金" },
  ];
  HC.foilName = (id) => (HC.FOILS.find((f) => f.id === id) || HC.FOILS[0]).name;

  HC.DEFAULTS = {
    title: "",
    subtitle: "",
    serial: "",
    image: "",
    fg: "",
    foil: "rainbow",
    area: "full",
    frame: "white",
    zoom: 1,
    posX: 50,
    posY: 50,
    showText: true,
  };

  /* Glitter texture for the stardust foil, generated once per page. */
  (function makeSparkle() {
    try {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      g.fillStyle = "rgb(64,64,64)";
      g.fillRect(0, 0, size, size);
      let seed = 1337;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 1100; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        const r = 0.4 + rnd() * rnd() * 1.6;
        const v = 150 + Math.floor(rnd() * 105);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      document.documentElement.style.setProperty("--hc-sparkle", `url(${c.toDataURL("image/png")})`);
    } catch (e) {
      /* canvas unavailable: stardust falls back to its gradient */
    }
  })();

  function el(tag, cls, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class HoloCard {
    /**
     * @param {object} data   card content (see top of file)
     * @param {object} opts
     *   interactive  follow pointer/gyro (default true)
     *   gyro         follow the gyroscope when available (default true)
     *   idle         slow ambient sway when nobody is interacting
     *   flippable    click / Enter / Space turns the card over
     *   dragTilt     touch-drag tilts the card (blocks page scroll on it)
     *   maxTilt      degrees (default 14)
     *   restFoil     foil strength at rest, 0..1 (default .32)
     */
    constructor(data, opts = {}) {
      this.opts = Object.assign(
        { interactive: true, gyro: true, idle: false, flippable: false, dragTilt: false, maxTilt: 14, restFoil: 0.32 },
        opts
      );
      this.data = Object.assign({}, HC.DEFAULTS, data);
      this.flipped = false;
      this.pointerActive = false;
      this.keyTilt = { x: 0, y: 0 };
      this._t0 = performance.now();

      const soft = { stiffness: 0.066, damping: 0.22 };
      this.s = {
        rx: new HC.Spring(0, soft),
        ry: new HC.Spring(0, soft),
        mx: new HC.Spring(50, soft),
        my: new HC.Spring(50, soft),
        o: new HC.Spring(this.opts.restFoil, { stiffness: 0.05, damping: 0.3 }),
        lift: new HC.Spring(1, { stiffness: 0.08, damping: 0.3 }),
        flip: new HC.Spring(0, { stiffness: 0.045, damping: 0.16 }),
      };

      this._build();
      this.setData(this.data);
      this._write();
      this._tick = this._tick.bind(this);

      if (this.opts.interactive) this._bindPointer();
      if (this.opts.flippable) this._bindFlip();
      if (this.opts.interactive && this.opts.gyro) this._bindGyro();
      if (this.opts.idle && !HC.reducedMotion) HC.ticker.add(this._tick);
    }

    /* ---------------------------------------------------------------- */
    _build() {
      const root = el("div", "hc");
      const shadow = el("div", "hc__shadow", root);
      const tilt = el("div", "hc__tilt", root);
      const flip = el("div", "hc__flip", tilt);

      const front = el("div", "hc__face hc__front", flip);
      const art = el("div", "hc__art", front);
      const bg = el("img", "hc__bg", art);
      const fg = el("img", "hc__fg", art);
      [bg, fg].forEach((img) => {
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
      });
      el("div", "hc__foil hc__foil--dodge", front);
      el("div", "hc__foil hc__foil--screen", front);
      const text = el("div", "hc__text", front);
      const title = el("p", "hc__title", text);
      const meta = el("div", "hc__meta", text);
      const sub = el("span", "hc__sub", meta);
      const serial = el("span", "hc__serial", meta);
      el("div", "hc__glare", front);

      const back = el("div", "hc__face hc__back", flip);
      el("div", "hc__back-pattern", back);
      const mark = el("div", "hc__back-mark", back);
      el("span", "hc__back-logo", mark).setAttribute("aria-hidden", "true");
      el("span", "", mark).textContent = ((window.HC_CONFIG && HC_CONFIG.siteName) || "Holo Card").toUpperCase();
      const backSerial = el("span", "hc__back-serial", back);
      el("div", "hc__foil hc__foil--back", back);
      el("div", "hc__glare", back);

      fg.addEventListener("error", () => (fg.hidden = true));
      this.el = root;
      this.n = { shadow, tilt, flip, front, art, bg, fg, text, title, sub, serial, backSerial };
    }

    /** Replace the card's content without rebuilding it. */
    setData(data) {
      const d = (this.data = Object.assign({}, HC.DEFAULTS, data));
      const n = this.n;
      const frame = d.frame || "white";
      let area = d.area || "full";
      if (frame === "none" && area === "frame") area = "full";

      this.el.dataset.foil = d.foil || "rainbow";
      this.el.dataset.frame = frame;
      this.el.dataset.area = area;
      this.el.style.setProperty("--zoom", clamp(+d.zoom || 1, 1, 4));
      this.el.style.setProperty("--px", clamp(+d.posX, 0, 100) + "%");
      this.el.style.setProperty("--py", clamp(+d.posY, 0, 100) + "%");

      if (d.image) {
        if (n.bg.getAttribute("src") !== d.image) n.bg.src = d.image;
        n.bg.hidden = false;
      } else {
        n.bg.removeAttribute("src");
        n.bg.hidden = true;
      }
      if (d.fg) {
        if (n.fg.getAttribute("src") !== d.fg) n.fg.src = d.fg;
        n.fg.hidden = false;
      } else {
        n.fg.removeAttribute("src");
        n.fg.hidden = true;
      }

      n.title.textContent = d.title || "";
      n.sub.textContent = d.subtitle || "";
      n.serial.textContent = d.serial ? "No. " + d.serial : "";
      n.backSerial.textContent = d.serial ? "No. " + d.serial : "";
      const hasText = d.showText !== false && (d.title || d.subtitle || d.serial);
      this.el.classList.toggle("hc--notext", !hasText);
      this.el.setAttribute("role", "img");
      this.el.setAttribute(
        "aria-label",
        [d.title || "未命名卡片", d.subtitle, HC.foilName(d.foil) + "鐳射"].filter(Boolean).join("，")
      );
    }

    /* ---------------------------------------------------------------- */
    _bindPointer() {
      const root = this.el;
      if (this.opts.dragTilt) root.classList.add("hc--drag");

      const move = (e) => {
        if (e.pointerType === "touch" && !this.opts.dragTilt) return;
        const r = root.getBoundingClientRect();
        const px = clamp((e.clientX - r.left) / r.width, 0, 1);
        const py = clamp((e.clientY - r.top) / r.height, 0, 1);
        this.pointerActive = true;
        this._aim(px * 2 - 1, py * 2 - 1, 1);
        this.s.lift.set(1.035);
      };
      const leave = (e) => {
        if (e && e.pointerType === "touch" && !this.opts.dragTilt) return;
        this.pointerActive = false;
        this._rest();
      };
      root.addEventListener("pointermove", move);
      root.addEventListener("pointerdown", move);
      root.addEventListener("pointerleave", leave);
      root.addEventListener("pointercancel", leave);
      root.addEventListener("pointerup", (e) => {
        if (e.pointerType === "touch") leave(e);
      });
      this._unbindPointer = () => {
        root.removeEventListener("pointermove", move);
        root.removeEventListener("pointerdown", move);
        root.removeEventListener("pointerleave", leave);
        root.removeEventListener("pointercancel", leave);
      };
    }

    _bindGyro() {
      this._gyroFn = (x, y) => {
        if (this.pointerActive || !this._visible) return;
        if (!HC.gyro.receiving) return;
        if (x === 0 && y === 0) {
          this._rest();
          return;
        }
        this._aim(x, y, 0.85);
      };
      this._visible = true;
      this._unGyro = HC.gyro.subscribe(this._gyroFn);
      if ("IntersectionObserver" in window) {
        this._io = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            this._visible = en.isIntersecting;
            if (!en.isIntersecting) this._rest();
          });
        });
        this._io.observe(this.el);
      }
    }

    _bindFlip() {
      const root = this.el;
      root.tabIndex = 0;
      root.classList.add("hc--flippable");
      let downAt = null;
      root.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY, t: performance.now() }));
      root.addEventListener("click", (e) => {
        // A drag is a tilt, not a flip.
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) return;
        this.flip();
      });
      root.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.flip();
        }
        const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (k) {
          e.preventDefault();
          e.stopPropagation();
          this.keyTilt = { x: k[0] * 0.8, y: k[1] * 0.8 };
          this._aim(this.keyTilt.x, this.keyTilt.y, 1);
        }
      });
      root.addEventListener("keyup", (e) => {
        if (e.key.startsWith("Arrow")) this._rest();
      });
    }

    /** x, y in -1..1 (pointer offset from the centre). */
    _aim(x, y, strength) {
      const s = this.s;
      const max = this.opts.maxTilt;
      const fast = { stiffness: 0.066, damping: 0.25 };
      s.ry.set(x * max * strength, fast);
      s.rx.set(-y * max * strength, fast);
      s.mx.set(50 + x * 50, fast);
      s.my.set(50 + y * 50, fast);
      s.o.set(0.55 + 0.45 * Math.min(1, Math.hypot(x, y)));
      HC.ticker.add(this._tick);
    }

    _rest() {
      const s = this.s;
      const slow = { stiffness: 0.035, damping: 0.18 };
      s.rx.set(0, slow);
      s.ry.set(0, slow);
      s.mx.set(50, slow);
      s.my.set(50, slow);
      s.o.set(this.opts.restFoil);
      s.lift.set(1);
      HC.ticker.add(this._tick);
    }

    flip(to) {
      this.flipped = typeof to === "boolean" ? to : !this.flipped;
      this.s.flip.set(this.flipped ? 180 : 0);
      this.el.classList.toggle("hc--flipped", this.flipped);
      HC.ticker.add(this._tick);
      this.el.dispatchEvent(new CustomEvent("hc:flip", { detail: this.flipped }));
    }

    /* ---------------------------------------------------------------- */
    _idleTargets(now) {
      if (!this.opts.idle || HC.reducedMotion) return false;
      if (this.pointerActive || (HC.gyro.receiving && this.opts.gyro)) return false;
      const t = (now - this._t0) / 1000;
      const x = Math.sin(t * 0.55) * 0.55;
      const y = Math.cos(t * 0.37) * 0.35;
      const s = this.s;
      const soft = { stiffness: 0.02, damping: 0.2 };
      s.ry.set(x * this.opts.maxTilt, soft);
      s.rx.set(-y * this.opts.maxTilt, soft);
      s.mx.set(50 + x * 50, soft);
      s.my.set(50 + y * 50, soft);
      s.o.set(0.5);
      return true;
    }

    _tick(steps, now) {
      if (this._dead) return false;
      const idle = this._idleTargets(now);
      const s = this.s;
      for (let i = 0; i < steps; i++) for (const k in s) s[k].step();
      this._write();
      let settled = true;
      for (const k in s) if (!s[k].settled) settled = false;
      if (settled && !idle) {
        HC.ticker.remove(this._tick);
        return false;
      }
      return true;
    }

    _write() {
      const s = this.s;
      const st = this.el.style;
      const dx = (s.mx.value - 50) / 50;
      const dy = (s.my.value - 50) / 50;
      const hyp = clamp(Math.hypot(dx, dy) / Math.SQRT2, 0, 1);
      st.setProperty("--rx", s.rx.value.toFixed(3) + "deg");
      st.setProperty("--ry", s.ry.value.toFixed(3) + "deg");
      st.setProperty("--mx", s.mx.value.toFixed(2) + "%");
      st.setProperty("--my", s.my.value.toFixed(2) + "%");
      st.setProperty("--dx", dx.toFixed(4));
      st.setProperty("--dy", dy.toFixed(4));
      st.setProperty("--hyp", hyp.toFixed(4));
      st.setProperty("--bgx", (50 + dx * 32).toFixed(2) + "%");
      st.setProperty("--bgy", (50 + dy * 32).toFixed(2) + "%");
      st.setProperty("--ang", (dx * 70 + dy * 40).toFixed(2) + "deg");
      st.setProperty("--o", clamp(s.o.value, 0, 1).toFixed(3));
      st.setProperty("--lift", s.lift.value.toFixed(4));
      st.setProperty("--flip", s.flip.value.toFixed(2) + "deg");
    }

    destroy() {
      this._dead = true;
      HC.ticker.remove(this._tick);
      if (this._unGyro) this._unGyro();
      if (this._io) this._io.disconnect();
      if (this._unbindPointer) this._unbindPointer();
      this.el.remove();
    }
  }

  HC.HoloCard = HoloCard;
})();
