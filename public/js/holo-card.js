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

  /* ------------------------------------------------------------------ */
  /* Sand: a fine falling-sand grid for the quicksand layer.              */
  /* Each cell is empty (0) or a grain: 1..239 = its shade, 240..255 =    */
  /* a glinting grain (16 facets that catch the light at different tilts) */
  /* Gravity can point in any of 8 directions. Grains speed up as they    */
  /* fall, slide down slopes and level out a little like sand in liquid.  */
  /* The pile is lit from the top and darker inside.                      */
  /* ------------------------------------------------------------------ */
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const DEPTH = [1, 2, 4, 7]; // cells looked at above a grain for its shading

  class Sand {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.W = this.H = 0;
      this.rgb = [255, 210, 110];
      this.amount = 0.5;
      this.dir = 2; // index into DIRS: straight down
      this.strength = 1;
      this.quiet = 0;
      this.stamp = 1;
      this.light = 0;
      this.dirty = true;
    }
    resize(w, h) {
      if (w === this.W && h === this.H) return;
      this.W = w;
      this.H = h;
      const n = w * h;
      this.grid = new Uint8Array(n);
      this.vel = new Uint8Array(n);
      this.moved = new Uint8Array(n);
      this.c.width = w;
      this.c.height = h;
      this.img = this.ctx.createImageData(w, h);
      this.px = new Uint32Array(this.img.data.buffer);
      this.fill();
    }
    /** Share of the window filled with sand (0.05..0.8). */
    setAmount(pct) {
      const a = clamp((+pct || 50) / 100, 0.05, 0.8);
      if (Math.abs(a - this.amount) < 0.001) return false;
      this.amount = a;
      if (this.W) this.fill();
      return true;
    }
    /** Fill the window up to `amount`, settled on the bottom. */
    fill() {
      const { W, H, grid } = this;
      grid.fill(0);
      this.vel.fill(0);
      let left = Math.floor(W * H * this.amount);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = H - 1; y >= 0 && left > 0; y--) {
        for (let x = 0; x < W && left > 0; x++) {
          const r = rnd();
          let v;
          if (r < 0.05) v = 240 + Math.floor(rnd() * 16); // glint
          else if (r < 0.11) v = 1 + Math.floor(rnd() * 50); // dark speck
          else v = 1 + Math.floor(((rnd() + rnd() + rnd()) / 3) * 238); // mostly mid tones
          grid[y * W + x] = v;
          left--;
        }
      }
      this.quiet = 0;
      this.dirty = true;
    }
    setColor(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
      const v = m ? parseInt(m[1], 16) : 0xffd26e;
      const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      if (rgb.join() !== this.rgb.join()) this.dirty = true;
      this.rgb = rgb;
    }
    /** dx, dy: where the light is (-1..1). Glints follow it. Returns true if a redraw is due. */
    setLight(dx, dy) {
      const l = (Math.round(((((dx * 1.7 + dy * 1.1) * 8) % 16) + 16) * 4) / 4) % 16;
      if (l === this.light) return false;
      this.light = l;
      this.dirty = true;
      return true;
    }
    /** gx, gy: gravity in grid space. */
    setGravity(gx, gy) {
      const m = Math.hypot(gx, gy);
      const dir = ((Math.round(Math.atan2(gy, gx) / (Math.PI / 4)) % 8) + 8) % 8;
      const strength = m < 0.22 ? 0 : Math.min(1, m);
      if (dir !== this.dir || (strength > 0) !== (this.strength > 0)) {
        this.quiet = 0;
        this.dirty = true;
      }
      this.dir = dir;
      this.strength = strength;
    }
    get asleep() {
      return this.quiet > 2;
    }
    step() {
      if (!this.W || this.strength === 0) {
        this.quiet = 3;
        return false;
      }
      const { W, H, grid, vel, moved } = this;
      const stamp = (this.stamp = (this.stamp % 250) + 1);
      const [dx, dy] = DIRS[this.dir];
      const diagA = DIRS[(this.dir + 1) % 8];
      const diagB = DIRS[(this.dir + 7) % 8];
      const sideA = DIRS[(this.dir + 2) % 8];
      const sideB = DIRS[(this.dir + 6) % 8];
      const p = 0.6 + 0.35 * this.strength; // grains in liquid start falling a bit lazily
      const maxV = 1 + Math.round(2 * this.strength); // terminal speed in cells per step
      const flipX = dx === 0 ? stamp & 1 : 0;
      const xs = dx > 0 || (dx === 0 && flipX) ? -1 : 1;
      const ys = dy > 0 ? -1 : 1;
      const x0 = xs < 0 ? W - 1 : 0;
      const y0 = ys < 0 ? H - 1 : 0;
      const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 0;
      let count = 0;
      for (let j = 0, y = y0; j < H; j++, y += ys) {
        for (let i = 0, x = x0; i < W; i++, x += xs) {
          const k = y * W + x;
          const v = grid[k];
          if (!v || moved[k] === stamp) continue;
          let tx = -1, ty = -1, sp = 0;
          if (free(x + dx, y + dy)) {
            const cur = vel[k];
            if (!cur && Math.random() > p) {
              count++; // about to fall
              continue;
            }
            // Falling: speeds up each step until it lands.
            sp = Math.min(maxV, cur + 1);
            tx = x + dx;
            ty = y + dy;
            for (let n = 1; n < sp && free(tx + dx, ty + dy); n++) {
              tx += dx;
              ty += dy;
            }
          } else {
            vel[k] = 0;
            if (Math.random() > p) continue;
            const first = Math.random() < 0.5 ? diagA : diagB;
            const second = first === diagA ? diagB : diagA;
            if (free(x + first[0], y + first[1])) {
              tx = x + first[0];
              ty = y + first[1];
            } else if (free(x + second[0], y + second[1])) {
              tx = x + second[0];
              ty = y + second[1];
            } else if (Math.random() < 0.3) {
              // Slide sideways only towards a spot it can then fall from: levels the surface, always settles.
              const side = Math.random() < 0.5 ? sideA : sideB;
              const sx = x + side[0], sy = y + side[1];
              if (free(sx, sy) && free(sx + dx, sy + dy)) {
                tx = sx;
                ty = sy;
              }
            }
          }
          if (tx >= 0) {
            const t = ty * W + tx;
            grid[t] = v;
            vel[t] = sp;
            grid[k] = 0;
            vel[k] = 0;
            moved[t] = stamp;
            count++;
          }
        }
      }
      if (count) {
        this.quiet = 0;
        this.dirty = true;
      } else this.quiet++;
      return !this.asleep;
    }
    draw() {
      if (!this.dirty || !this.W) return;
      this.dirty = false;
      const { W, H, grid, vel, px, light } = this;
      const [r, g, b] = this.rgb;
      const [ux, uy] = DIRS[(this.dir + 4) % 8]; // "up", against gravity
      const offs = DEPTH.map((d) => [ux * d, uy * d, (uy * W + ux) * d]);
      for (let y = 0, k = 0; y < H; y++) {
        for (let x = 0; x < W; x++, k++) {
          const v = grid[k];
          if (!v) {
            px[k] = 0;
            continue;
          }
          // How much sand lies above this grain: the top is lit, the inside is darker.
          let cover = 0;
          for (let i = 0; i < 4; i++) {
            const o = offs[i];
            const xx = x + o[0], yy = y + o[1];
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && grid[k + o[2]]) cover++;
          }
          let f;
          if (v >= 240) {
            // A facet that faces the light flashes white.
            let d = Math.abs(v - 240 - light);
            if (d > 8) d = 16 - d;
            if (d < 0.75) {
              px[k] = 0xff000000 | ((255 - ((255 - b) >> 3)) << 16) | ((255 - ((255 - g) >> 3)) << 8) | (255 - ((255 - r) >> 3));
              continue;
            }
            f = 1.08;
          } else {
            f = 0.74 + (v / 239) * 0.36;
          }
          f *= cover === 0 ? 1.14 : 1.02 - cover * 0.055;
          const R = Math.min(255, r * f) | 0;
          const G = Math.min(255, g * f) | 0;
          const B = Math.min(255, b * f) | 0;
          const A = vel[k] > 1 ? 200 : 255; // falling grains are a touch see-through
          px[k] = (A << 24) | (B << 16) | (G << 8) | R;
        }
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
  }
  HC.Sand = Sand;

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
      logo.src = cfg.backLogo || "brand/logo-mark-192.png";
      logo.alt = "";
      logo.draggable = false;
      logo.addEventListener("error", () => logo.remove());
      el("span", "", mark).textContent = (cfg.siteName || "3D Cards").toUpperCase();
      const backSerial = el("span", "hc__back-serial", back);
      const backFoil = [el("div", "hc__foil hc__foil--back", back)];
      el("div", "hc__glare", back);

      fg.addEventListener("error", () => (fg.hidden = true));
      this.el = root;
      this.n = { shadow, tilt, flip, front, art, bg, fg, text, title, sub, serial, backSerial, artFoil, fgFoil, frameFoil, backFoil, sandCanvas };
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
      // Quicksand needs a foreground to sit behind.
      const sandOn = hasFg && v.sand;
      this.el.classList.toggle("hc--sand", sandOn);
      n.sandCanvas.hidden = !sandOn;
      if (sandOn) {
        if (!this.sand) this.sand = new Sand(n.sandCanvas);
        this.sand.setColor(v.sandColor);
        this.sand.setAmount(v.sandAmount);
        if (!this._unRaw && this.opts.gyro) {
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

    flip(to) {
      this.flipped = typeof to === "boolean" ? to : !this.flipped;
      this.s.flip.set(this.flipped ? 180 : 0);
      this.el.classList.toggle("hc--flipped", this.flipped);
      HC.ticker.add(this._tick);
      this.el.dispatchEvent(new CustomEvent("hc:flip", { detail: this.flipped }));
    }

    /** Turn the card upside down (and back). Quicksand pours to the new bottom. */
    turn(to) {
      this.turned = typeof to === "boolean" ? to : !this.turned;
      this.s.rot.set(this.turned ? 180 : 0);
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
      let gx = 0, gy = 1;
      if (this._tiltDeg && HC.gyro.receiving && this.opts.gyro) {
        gx = Math.sin((this._tiltDeg[0] * Math.PI) / 180);
        gy = Math.sin((this._tiltDeg[1] * Math.PI) / 180);
      }
      // Into the card's own coordinates (the card may be turned upside down).
      const a = (-this.s.rot.value * Math.PI) / 180;
      return [gx * Math.cos(a) - gy * Math.sin(a), gx * Math.sin(a) + gy * Math.cos(a)];
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
      // Fine grains: about 1.5 CSS pixels each, within a budget of cells.
      let cols = clamp(Math.round(w / 1.5), 90, 240);
      let rows = Math.max(8, Math.round((cols * h) / w));
      if (cols * rows > 80000) {
        const k = Math.sqrt(80000 / (cols * rows));
        cols = Math.round(cols * k);
        rows = Math.round(rows * k);
      }
      this.sand.resize(cols, rows);
      const [gx, gy] = this._gravity();
      this.sand.setGravity(gx, gy);
      for (let i = 0; i < Math.min(steps, 2); i++) this.sand.step();
      this.sand.draw();
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
      if (this._unRaw) this._unRaw();
      if (this._unGyro) this._unGyro();
      if (this._io) this._io.disconnect();
      if (this._unbindPointer) this._unbindPointer();
      this.el.remove();
    }
  }

  HC.HoloCard = HoloCard;
})();
