/*
 * sand-core.js
 * The quicksand simulation. Loaded by the page (fallback) and by
 * sand-worker.js, which runs it on another CPU core and draws straight into
 * the card's canvas (OffscreenCanvas), so turning a card stays smooth.
 */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------------ */
  /* Sand: a fine falling-sand grid for the quicksand layer.              */
  /* Each cell is empty (0) or a grain: 1..239 = its shade, 240..255 =    */
  /* a glinting grain (16 facets that catch the light at different tilts) */
  /* The sand sits in a clear, oily liquid: grains have their own speed,  */
  /* sink slowly towards gravity (any direction), keep drifting for a     */
  /* moment when the card turns, and pile up with gentle slopes.          */
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
      this.vx = new Float32Array(n); // speed, cells per step
      this.vy = new Float32Array(n);
      this.fx = new Float32Array(n); // how far into the next cell
      this.fy = new Float32Array(n);
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
      this.vx.fill(0);
      this.vy.fill(0);
      this.fx.fill(0);
      this.fy.fill(0);
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
      const ux = m ? gx / m : 0, uy = m ? gy / m : 1;
      // Any real change of direction wakes the sand up again.
      if (dir !== this.dir || (strength > 0) !== (this.strength > 0) || Math.abs(ux - (this.ux || 0)) + Math.abs(uy - (this.uy || 0)) > 0.03) {
        this.quiet = 0;
        if (dir !== this.dir) this.dirty = true;
      }
      this.dir = dir;
      this.strength = strength;
      this.ux = ux;
      this.uy = uy;
    }
    get asleep() {
      return this.quiet > 2;
    }
    step() {
      if (!this.W || this.strength === 0) {
        this.quiet = 3;
        return false;
      }
      const { W, H, grid, vx, vy, fx, fy, moved } = this;
      const stamp = (this.stamp = (this.stamp % 250) + 1);
      const [dx, dy] = DIRS[this.dir];
      const diagA = DIRS[(this.dir + 1) % 8];
      const diagB = DIRS[(this.dir + 7) % 8];
      const sideA = DIRS[(this.dir + 2) % 8];
      const sideB = DIRS[(this.dir + 6) % 8];
      // Oil: a slow pull, strong drag (top speed ACC / (1 - DRAG) ≈ 0.4 cells per step),
      // but enough memory that moving sand keeps drifting for a moment when the card turns.
      const ACC = 0.016 * this.strength;
      const DRAG = 0.96;
      const ax = this.ux * ACC, ay = this.uy * ACC;
      const px = -this.uy, py = this.ux; // across gravity, for a little wobble while sinking
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
          // Bigger grains (by their shade) sink a little faster, so falling sand spreads out.
          const g = 0.75 + ((v * 37) % 50) / 100;
          let svx = vx[k] * DRAG + ax * g;
          let svy = vy[k] * DRAG + ay * g;
          let sfx = fx[k], sfy = fy[k];
          let cx = x, cy = y;
          if (free(x + dx, y + dy)) {
            // Sinking through the liquid: a slight sideways wobble.
            const w = (Math.random() - 0.5) * 0.012;
            const u = (Math.random() - 0.5) * 0.012; // and uneven sinking, so layers break up
            svx += px * w + this.ux * u;
            svy += py * w + this.uy * u;
          }
          // Pressed against an edge: no speed builds up that way. Pressed against a grain: go no
          // faster than it does, so sand moves along together instead of one grain at a time.
          if (svx !== 0) {
            const sn = svx > 0 ? 1 : -1, xx = x + sn;
            if (xx < 0 || xx >= W) svx = sfx = 0;
            else if (grid[k + sn]) {
              const nv = vx[k + sn];
              if (nv * sn > 0) {
                if (svx * sn > nv * sn) svx = nv;
                if (sfx * sn > fx[k + sn] * sn) sfx = fx[k + sn];
              } else svx = sfx = 0;
            }
          }
          if (svy !== 0) {
            const sn = svy > 0 ? 1 : -1, yy = y + sn, t = k + sn * W;
            if (yy < 0 || yy >= H) svy = sfy = 0;
            else if (grid[t]) {
              const nv = vy[t];
              if (nv * sn > 0) {
                if (svy * sn > nv * sn) svy = nv;
                if (sfy * sn > fy[t] * sn) sfy = fy[t];
              } else svy = sfy = 0;
            }
          }
          sfx += svx;
          sfy += svy;
          for (let guard = 0; guard < 3 && (sfx >= 1 || sfx <= -1 || sfy >= 1 || sfy <= -1); guard++) {
            const sx = sfx >= 1 ? 1 : sfx <= -1 ? -1 : 0;
            const sy = sfy >= 1 ? 1 : sfy <= -1 ? -1 : 0;
            if (free(cx + sx, cy + sy)) {
              cx += sx;
              cy += sy;
              sfx -= sx;
              sfy -= sy;
            } else if (sx && sy && free(cx + sx, cy)) {
              cx += sx;
              sfx -= sx;
              sfy = 0;
              svy *= 0.4;
            } else if (sx && sy && free(cx, cy + sy)) {
              cy += sy;
              sfy -= sy;
              sfx = 0;
              svx *= 0.4;
            } else {
              // Ran into sand or the edge: the speed in that direction is soaked up.
              if (sx) {
                sfx = 0;
                svx = 0;
              }
              if (sy) {
                sfy = 0;
                svy = 0;
              }
              break;
            }
          }
          if (cx === x && cy === y && !free(x + dx, y + dy)) {
            // Resting on sand: slide gently down slopes (slower than in air).
            // Only moves that go downhill for the real (not rounded) gravity, so the pile always settles.
            let tx = -1, ty = -1;
            const first = Math.random() < 0.5 ? diagA : diagB;
            const second = first === diagA ? diagB : diagA;
            const ok = (d) => d[0] * this.ux + d[1] * this.uy > 0.02;
            if (ok(first) && free(x + first[0], y + first[1])) {
              tx = x + first[0];
              ty = y + first[1];
            } else if (ok(second) && free(x + second[0], y + second[1])) {
              tx = x + second[0];
              ty = y + second[1];
            } else {
              // Levelling: roll along the surface when the grain can then sink straight down.
              const side = Math.random() < 0.5 ? sideA : sideB;
              const up = side[0] * this.ux + side[1] * this.uy;
              const sx = x + side[0], sy = y + side[1];
              const then = (d) => d[0] * this.ux + d[1] * this.uy + up > 0.1 && free(sx + d[0], sy + d[1]);
              if (up > -0.1 && free(sx, sy) && then(DIRS[this.dir])) {
                if (Math.random() < 0.25) {
                  tx = x + side[0];
                  ty = y + side[1];
                } else count++; // will level out a little later
              }
            }
            if (tx >= 0) {
              if (Math.random() < 0.5) {
                cx = tx;
                cy = ty;
              } else count++; // slope still settling
            }
          }
          if (cx !== x || cy !== y) {
            const t = cy * W + cx;
            grid[t] = v;
            grid[k] = 0;
            vx[t] = svx;
            vy[t] = svy;
            fx[t] = sfx;
            fy[t] = sfy;
            vx[k] = vy[k] = fx[k] = fy[k] = 0;
            moved[t] = stamp;
            count++;
          } else {
            vx[k] = svx;
            vy[k] = svy;
            fx[k] = sfx;
            fy[k] = sfy;
            if (svx * svx + svy * svy > 0.0004) count++; // still drifting inside the cell
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
      const { W, H, grid, vx, vy, px, light } = this;
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
          const A = vx[k] * vx[k] + vy[k] * vy[k] > 0.04 ? 215 : 255; // sinking grains are a touch see-through
          px[k] = (A << 24) | (B << 16) | (G << 8) | R;
        }
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
  }

  root.HCSand = { Sand, clamp };
})(typeof self !== "undefined" ? self : this);
