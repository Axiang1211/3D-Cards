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
  // Text goes through the site's translator when there is one (js/i18n.js).
  const T = (str, params) =>
    HC.t ? HC.t(str, params) : str.replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? params[k] : m));

  HC.FOILS = [
    { id: "rainbow", name: T("彩虹") },
    { id: "stardust", name: T("星塵") },
    { id: "prism", name: T("稜鏡") },
    { id: "metal", name: T("流光") },
    { id: "gloss", name: T("亮面") },
  ];
  HC.AREAS = [
    { id: "full", name: T("整張") },
    { id: "art", name: T("只有照片") },
    { id: "frame", name: T("只有邊框") },
  ];
  HC.FRAMES = [
    { id: "none", name: T("無邊框") },
    { id: "white", name: T("白") },
    { id: "black", name: T("黑") },
    { id: "silver", name: T("銀") },
    { id: "gold", name: T("金") },
  ];
  HC.BACK_LOGOS = [
    { id: "color", name: T("原圖") },
    { id: "manga", name: T("黑白漫畫") },
  ];
  const BACK_LOGO_SRC = { color: "brand/logo-mark-192.png", manga: "brand/logo-mark-manga-192.png" };
  HC.foilName = (id) => (HC.FOILS.find((f) => f.id === id) || HC.FOILS[0]).name;

  HC.FG_FOILS = [{ id: "none", name: T("無") }].concat(HC.FOILS.filter((f) => f.id !== "gloss"));

  HC.DEFAULTS = {
    title: "",
    subtitle: "",
    serial: "",
    image: "",
    fg: "",
    showText: true,
    frame: "white",
    // background photo
    zoom: 1,
    posX: 50,
    posY: 50,
    bgBlur: 0, // 0..100, only used when there is a foreground
    // background foil
    foil: "rainbow",
    area: "full",
    foilStrength: 100, // %, 0..200
    foilScale: 100, // %, 50..200
    foilHue: 0, // degrees, 0..360
    // foreground layer
    fgZoom: 1,
    fgX: 0, // % offset, -50..50
    fgY: 0,
    fgFoil: "none",
    fgFoilStrength: 100,
    fgFoilHue: 0,
    // quicksand between the photo and the foreground (needs a foreground)
    sand: false,
    sandColor: "#ffd26e",
    sandAmount: 50, // % of the picture, 10..80
    sandGrain: 1.5, // grain size in CSS pixels, 1..4
    backLogo: "color", // logo on the back: "color" (original) or "manga" (black and white)
  };

  /** Clamp every numeric field into its valid range. */
  HC.normalize = function (c) {
    const n = (v, d, lo, hi) => (Number.isFinite(+v) && v !== "" && v != null ? Math.min(hi, Math.max(lo, +v)) : d);
    const pick = (v, list, d) => (list.some((x) => x.id === v) ? v : d);
    return {
      foil: pick(c.foil, HC.FOILS, "rainbow"),
      area: pick(c.area, HC.AREAS, "full"),
      frame: pick(c.frame, HC.FRAMES, "white"),
      zoom: n(c.zoom, 1, 1, 4),
      posX: n(c.posX, 50, 0, 100),
      posY: n(c.posY, 50, 0, 100),
      bgBlur: n(c.bgBlur, 0, 0, 100),
      foilStrength: n(c.foilStrength, 100, 0, 200),
      foilScale: n(c.foilScale, 100, 50, 200),
      foilHue: n(c.foilHue, 0, 0, 360),
      fgZoom: n(c.fgZoom, 1, 0.5, 3),
      fgX: n(c.fgX, 0, -50, 50),
      fgY: n(c.fgY, 0, -50, 50),
      fgFoil: pick(c.fgFoil, HC.FG_FOILS, "none"),
      fgFoilStrength: n(c.fgFoilStrength, 100, 0, 200),
      fgFoilHue: n(c.fgFoilHue, 0, 0, 360),
      sand: c.sand === true || c.sand === "true",
      sandColor: /^#[0-9a-f]{6}$/i.test(c.sandColor || "") ? String(c.sandColor).toLowerCase() : "#ffd26e",
      sandAmount: n(c.sandAmount, 50, 10, 80),
      sandGrain: n(c.sandGrain, 1.5, 1, 4),
      backLogo: pick(c.backLogo, HC.BACK_LOGOS, "color"),
    };
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
  /** Another half turn in the same direction; 360° is the same as 0°, so keep the numbers small. */
  const onward = (spring) => {
    if (spring.target >= 360) {
      spring.value -= 360;
      spring.target -= 360;
    }
    spring.set(spring.target + 180);
  };

  /* The quicksand simulation lives in sand-core.js and, where the browser */
  /* allows, runs on another CPU core (sand-worker.js); see SandHost below. */
  const Sand = self.HCSand.Sand;
  HC.Sand = Sand;

  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const SAND_BUDGET = COARSE ? 50000 : 90000; // cells
  /* One shared worker runs the sand of every card on its own core. */
  let sandWorker = null;
  let sandWorkerFailed = false;
  const sandHosts = new Map();
  let sandIds = 0;
  function getSandWorker() {
    if (sandWorker || sandWorkerFailed) return sandWorker;
    try {
      if (!("Worker" in window) || typeof OffscreenCanvas === "undefined") throw new Error("no offscreen canvas");
      sandWorker = new Worker(new URL("sand-worker.js", SCRIPT_SRC));
      sandWorker.onmessage = (e) => {
        const m = e.data || {};
        const host = sandHosts.get(m.id);
        if (host && m.t === "state") host.asleep = m.asleep;
      };
      sandWorker.onerror = () => {
        // The worker could not start: run every card's sand on the page instead.
        sandWorkerFailed = true;
        sandWorker = null;
        sandHosts.forEach((host) => host._fallback());
        sandHosts.clear();
      };
    } catch (e) {
      sandWorkerFailed = true;
      sandWorker = null;
    }
    return sandWorker;
  }

  /**
   * The card's handle on its quicksand: in a worker when possible, otherwise
   * right here on the page. Same calls either way.
   */
  class SandHost {
    constructor(canvas) {
      this.W = this.H = 0;
      this.asleep = false;
      this.canvas = canvas;
      const w = HC.sandInWorker === false ? null : getSandWorker();
      if (w && canvas.transferControlToOffscreen) {
        try {
          const off = canvas.transferControlToOffscreen();
          this.id = ++sandIds;
          this.worker = w;
          sandHosts.set(this.id, this);
          w.postMessage({ t: "init", id: this.id, canvas: off }, [off]);
        } catch (e) {
          this.worker = null;
        }
      }
      if (!this.worker) this.local = new Sand(canvas);
      this._g = [NaN, NaN];
      this._set = "";
    }
    get remote() {
      return !!this.worker;
    }
    /** The worker failed: a fresh canvas (the old one belongs to the worker) and local sand. */
    _fallback() {
      const old = this.canvas;
      const c = document.createElement("canvas");
      c.className = old.className;
      c.hidden = old.hidden;
      old.replaceWith(c);
      this.canvas = c;
      this.worker = null;
      this.local = new Sand(c);
      const [w, h] = [this.W, this.H];
      this.W = this.H = 0;
      if (w) this.resize(w, h);
      if (this._lookArgs) this.setLook(...this._lookArgs);
      if (this.onswap) this.onswap(c);
    }
    _post(m) {
      m.id = this.id;
      this.worker.postMessage(m);
    }
    resize(w, h) {
      if (w === this.W && h === this.H) return;
      this.W = w;
      this.H = h;
      this.asleep = false;
      if (this.local) this.local.resize(w, h);
      else this._post({ t: "size", w, h });
    }
    setLook(color, amount) {
      this._lookArgs = [color, amount];
      if (this.local) {
        this.local.setColor(color);
        this.local.setAmount(amount);
        return;
      }
      const key = color + "|" + amount;
      if (key === this._set) return;
      this._set = key;
      this.asleep = false;
      this._post({ t: "set", color, amount });
    }
    /** Returns true when the page must redraw (only when the sand runs here). */
    setLight(dx, dy) {
      if (this.local) return this.local.setLight(dx, dy);
      const l = Math.round((dx * 1.7 + dy * 1.1) * 32);
      if (l !== this._l) {
        this._l = l;
        this._post({ t: "light", dx, dy });
      }
      return false;
    }
    setGravity(gx, gy) {
      if (this.local) return this.local.setGravity(gx, gy);
      if (Math.abs(gx - this._g[0]) + Math.abs(gy - this._g[1]) < 0.004) return;
      this._g = [gx, gy];
      this.asleep = false;
      this._post({ t: "gravity", gx, gy });
    }
    /** Simulation steps and drawing (only when the sand runs here). */
    run(steps) {
      if (!this.local) return;
      for (let i = 0; i < Math.min(steps, 2); i++) this.local.step();
      this.local.draw();
      this.asleep = this.local.asleep;
    }
    draw() {
      if (this.local) this.local.draw();
    }
    get grid() {
      return this.local ? this.local.grid : null;
    }
    destroy() {
      if (this.worker) {
        this._post({ t: "drop" });
        sandHosts.delete(this.id);
      }
    }
  }

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
      this.turned = false;
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
        rot: new HC.Spring(0, { stiffness: 0.03, damping: 0.2 }),
      };

      this._sandTick = this._sandTick.bind(this);
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
      // Background foil inside the photo window, under the foreground.
      const artFoil = [el("div", "hc__foil hc__foil--art hc__foil--dodge", art), el("div", "hc__foil hc__foil--art hc__foil--screen", art)];
      // Quicksand, between the photo and the foreground.
      const sandCanvas = el("canvas", "hc__sand", art);
      sandCanvas.hidden = true;
      const fg = el("img", "hc__fg", art);
      // Foreground foil: same box as the foreground, masked to its shape.
      const fgFoil = [el("div", "hc__foil hc__foil--fg hc__foil--dodge", art), el("div", "hc__foil hc__foil--fg hc__foil--screen", art)];
      [bg, fg].forEach((img) => {
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
      });
      // Background foil on the frame.
      const frameFoil = [el("div", "hc__foil hc__foil--frame hc__foil--dodge", front), el("div", "hc__foil hc__foil--frame hc__foil--screen", front)];
      const text = el("div", "hc__text", front);
      const title = el("p", "hc__title", text);
      const meta = el("div", "hc__meta", text);
      const sub = el("span", "hc__sub", meta);
      const serial = el("span", "hc__serial", meta);
      el("div", "hc__glare", front);

      const back = el("div", "hc__face hc__back", flip);
      el("div", "hc__back-pattern", back);
      const mark = el("div", "hc__back-mark", back);
      const cfg = window.HC_CONFIG || {};
      const logo = el("img", "hc__back-logo", mark);
      logo.src = cfg.backLogo || BACK_LOGO_SRC.color;
      logo.alt = "";
      logo.draggable = false;
      logo.addEventListener("error", () => (logo.hidden = true));
      el("span", "", mark).textContent = (cfg.siteName || "3D Cards").toUpperCase();
      const backSerial = el("span", "hc__back-serial", back);
      const backFoil = [el("div", "hc__foil hc__foil--back", back)];
      el("div", "hc__glare", back);

      fg.addEventListener("error", () => (fg.hidden = true));
      // Chrome sometimes keeps showing an empty layer when a picture finishes loading inside a
      // 3D-turned card (seen in the full-screen viewer). A one-frame style change repaints it.
      [bg, fg].forEach((img) =>
        img.addEventListener("load", () => {
          img.style.opacity = "0.999";
          requestAnimationFrame(() => requestAnimationFrame(() => (img.style.opacity = "")));
        })
      );
      this.el = root;
      this.n = { shadow, tilt, flip, front, art, bg, fg, text, title, sub, serial, backSerial, backLogo: logo, artFoil, fgFoil, frameFoil, backFoil, sandCanvas };
    }

    /** Replace the card's content without rebuilding it. */
    setData(data) {
      const d = (this.data = Object.assign({}, HC.DEFAULTS, data));
      const n = this.n;
      const v = HC.normalize(d);
      Object.assign(d, v);
      const frame = v.frame;
      let area = v.area;
      if (frame === "none" && area === "frame") area = "full";
      const hasFg = !!d.fg;
      const st = this.el.style;

      this.el.dataset.foil = v.foil;
      this.el.dataset.frame = frame;
      this.el.dataset.area = area;
      this.el.classList.toggle("hc--fg", hasFg);
      st.setProperty("--zoom", v.zoom);
      st.setProperty("--px", v.posX + "%");
      st.setProperty("--py", v.posY + "%");
      const blur = hasFg ? v.bgBlur : 0;
      st.setProperty("--bgblur", (blur * 0.06).toFixed(2) + "cqw");
      st.setProperty("--blurscale", (1 + blur * 0.0016).toFixed(4));
      st.setProperty("--fzoom", v.fgZoom);
      st.setProperty("--fx", v.fgX + "%");
      st.setProperty("--fy", v.fgY + "%");

      const paint = (els, foil, strength, scale, hue, show) => {
        els.forEach((e) => {
          e.dataset.foil = foil;
          e.hidden = !show;
          e.style.setProperty("--k", (strength / 100).toFixed(3));
          e.style.setProperty("--sc", (scale / 100).toFixed(3));
          e.style.setProperty("--hue", hue + "deg");
        });
      };
      const bgOn = v.foil !== "gloss";
      paint(n.artFoil, v.foil, v.foilStrength, v.foilScale, v.foilHue, bgOn && (area === "full" || area === "art"));
      paint(n.frameFoil, v.foil, v.foilStrength, v.foilScale, v.foilHue, bgOn && frame !== "none" && (area === "full" || area === "frame"));
      paint(n.fgFoil, v.fgFoil, v.fgFoilStrength, v.foilScale, v.fgFoilHue, hasFg && v.fgFoil !== "none");
      paint(n.backFoil, v.foil === "gloss" ? "rainbow" : v.foil, 100, 100, v.foilHue, true);
      // Logo on the back: the original picture or a black-and-white manga version.
      const logoSrc = (window.HC_CONFIG || {}).backLogo || BACK_LOGO_SRC[v.backLogo] || BACK_LOGO_SRC.color;
      if (n.backLogo.getAttribute("src") !== logoSrc) {
        n.backLogo.hidden = false;
        n.backLogo.src = logoSrc;
      }
      this.el.dataset.backLogo = v.backLogo;
      // Quicksand needs a foreground to sit behind.
      const sandOn = hasFg && v.sand;
      this.el.classList.toggle("hc--sand", sandOn);
      n.sandCanvas.hidden = !sandOn;
      if (sandOn) {
        if (!this.sand) {
          this.sand = new SandHost(n.sandCanvas);
          this.sand.onswap = (c) => {
            this.n.sandCanvas = c;
            this._wakeSand();
          };
        }
        this.sand.setLook(v.sandColor, v.sandAmount);
        this._sandGrain = v.sandGrain;
        if (!this._unRaw && (this.opts.gyro || this.opts.worldGravity)) {
          this._unRaw = HC.gyro.subscribeRaw((tx, ty) => {
            this._tiltDeg = [tx, ty];
            this._wakeSand();
          });
        }
      }
      this._sandOn = sandOn;
      this._wakeSand();

      const mask = hasFg ? `url("${String(d.fg).replace(/"/g, "%22")}")` : "none";
      n.fgFoil.forEach((e) => {
        if (e._mask !== mask) {
          e._mask = mask;
          e.style.webkitMaskImage = mask;
          e.style.maskImage = mask;
        }
      });

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
        [d.title || T("未命名卡片"), d.subtitle, T("{foil}鐳射", { foil: HC.foilName(d.foil) })].filter(Boolean).join(T("，"))
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
            else this._wakeSand();
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
      // Light position is in the card's own coordinates: mirrored when the card is upside down.
      const r = this.turned ? -1 : 1;
      s.mx.set(50 + r * x * 50, fast);
      s.my.set(50 + r * y * 50, fast);
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

    /** Flip to the back and on round to the front: always the same way, two flips make a full turn. */
    flip(to) {
      const next = typeof to === "boolean" ? to : !this.flipped;
      if (next !== this.flipped) onward(this.s.flip);
      this.flipped = next;
      this.el.classList.toggle("hc--flipped", this.flipped);
      HC.ticker.add(this._tick);
      this.el.dispatchEvent(new CustomEvent("hc:flip", { detail: this.flipped }));
    }

    /** Turn the card upside down and on round the same way. Quicksand pours to the new bottom. */
    turn(to) {
      const next = typeof to === "boolean" ? to : !this.turned;
      if (next !== this.turned) onward(this.s.rot);
      this.turned = next;
      this.el.classList.toggle("hc--turned", this.turned);
      HC.ticker.add(this._tick);
      this._wakeSand();
      this.el.dispatchEvent(new CustomEvent("hc:turn", { detail: this.turned }));
    }

    /* ---------------------------------------------------------------- */
    /* Quicksand loop                                                    */
    /* ---------------------------------------------------------------- */
    _wakeSand() {
      if (this._sandOn && !this._dead) {
        this._sandWait = 0;
        HC.ticker.add(this._sandTick);
      }
    }

    _gravity() {
      // Gravity on screen: from the phone's tilt, or straight down.
      const useTilt = this._tiltDeg && HC.gyro.receiving && (this.opts.gyro || this.opts.worldGravity);
      let gx = 0, gy = 1, gz = 0;
      if (useTilt) {
        gx = Math.sin((this._tiltDeg[0] * Math.PI) / 180);
        gy = Math.sin((this._tiltDeg[1] * Math.PI) / 180);
        gz = -Math.sqrt(Math.max(0, 1 - gx * gx - gy * gy)); // the rest points into the screen
      }
      const R = Math.PI / 180;
      const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
      const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
      const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
      let g = [gx, gy, gz];
      if (this.opts.worldGravity) {
        // The card can be turned any way (full screen): undo rotateX, then rotateY, as in the CSS.
        g = rotX(g, -this.s.rx.value * R);
        g = rotY(g, -this.s.ry.value * R);
      }
      // Into the card's own coordinates (it may be upside down, or showing its back).
      g = rotZ(g, -this.s.rot.value * R);
      g = rotY(g, -this.s.flip.value * R);
      // Only the part along the card's face moves the sand; lying flat, it rests.
      return [g[0], g[1]];
    }

    _sandTick(steps) {
      if (this._dead || !this._sandOn || !this.sand) return false;
      if (this._visible === false) return false;
      const art = this.n.art;
      const w = art.offsetWidth, h = art.offsetHeight;
      if (!w || !h) {
        // Not laid out yet; try again for a moment.
        return ++this._sandWait < 120;
      }
      // Grain size in CSS pixels (chosen in the maker), within a budget of cells
      // (smaller on phones, which have less to spare).
      const budget = SAND_BUDGET;
      let cols = clamp(Math.round(w / (this._sandGrain || 1.5)), 40, 300);
      let rows = Math.max(8, Math.round((cols * h) / w));
      if (cols * rows > budget) {
        const k = Math.sqrt(budget / (cols * rows));
        cols = Math.round(cols * k);
        rows = Math.round(rows * k);
      }
      this.sand.resize(cols, rows);
      const [gx, gy] = this._gravity();
      this.sand.setGravity(gx, gy);
      this.sand.run(steps);
      // In a worker the sand runs by itself; here we only keep sending gravity while the card turns.
      if (this.sand.remote) return !this.s.rot.settled || !this.s.flip.settled;
      // Frames with no simulation step (fast screens) must not end the loop.
      return !this.sand.asleep || !this.s.rot.settled;
    }

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
      // Glints in the quicksand follow the light.
      if (this._sandOn && this.sand && this.sand.W && this.sand.setLight(dx, dy)) this.sand.draw();
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
      st.setProperty("--rot", s.rot.value.toFixed(2) + "deg");
    }

    destroy() {
      this._dead = true;
      HC.ticker.remove(this._tick);
      HC.ticker.remove(this._sandTick);
      if (this.sand) this.sand.destroy();
      if (this._unRaw) this._unRaw();
      if (this._unGyro) this._unGyro();
      if (this._io) this._io.disconnect();
      if (this._unbindPointer) this._unbindPointer();
      this.el.remove();
    }
  }

  HC.HoloCard = HoloCard;
})();
