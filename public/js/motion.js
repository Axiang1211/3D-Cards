/*
 * motion.js
 * Spring physics, a shared animation ticker and the gyroscope manager.
 * No dependencies. Exposes window.HC.Spring, HC.ticker, HC.gyro.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});

  /* ------------------------------------------------------------------ */
  /* Spring: a damped harmonic oscillator integrated at a fixed 60 Hz.   */
  /* ------------------------------------------------------------------ */
  class Spring {
    constructor(value, { stiffness = 0.08, damping = 0.24 } = {}) {
      this.value = value;
      this.target = value;
      this.velocity = 0;
      this.stiffness = stiffness;
      this.damping = damping;
    }
    set(target, opts) {
      this.target = target;
      if (opts) {
        if (opts.stiffness != null) this.stiffness = opts.stiffness;
        if (opts.damping != null) this.damping = opts.damping;
      }
    }
    jump(value) {
      this.value = this.target = value;
      this.velocity = 0;
    }
    step() {
      const force = (this.target - this.value) * this.stiffness;
      this.velocity = (this.velocity + force) * (1 - this.damping);
      this.value += this.velocity;
    }
    get settled() {
      return Math.abs(this.velocity) < 0.002 && Math.abs(this.target - this.value) < 0.002;
    }
  }
  HC.Spring = Spring;

  /* ------------------------------------------------------------------ */
  /* Ticker: one requestAnimationFrame loop for every animated card.     */
  /* A subscriber returns true while it still needs frames.              */
  /* ------------------------------------------------------------------ */
  const STEP = 1000 / 60;
  const subs = new Set();
  let raf = 0;
  let last = 0;
  let acc = 0;

  function frame(now) {
    raf = 0;
    if (!last) last = now;
    acc += Math.min(now - last, 100);
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      acc -= STEP;
      steps++;
    }
    let busy = false;
    subs.forEach((fn) => {
      if (fn(steps, now)) busy = true;
    });
    if (busy) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  HC.ticker = {
    add(fn) {
      subs.add(fn);
      this.wake();
    },
    remove(fn) {
      subs.delete(fn);
    },
    wake() {
      if (!raf) raf = requestAnimationFrame(frame);
    },
  };

  /* ------------------------------------------------------------------ */
  /* Gyro: turns deviceorientation into a normalised tilt (-1..1).       */
  /* The neutral pose slowly follows how the phone is being held, so the */
  /* card always rests flat in the hand. Double tap / recenter() resets. */
  /* ------------------------------------------------------------------ */
  const listeners = new Set();
  const RANGE = 22; // degrees of tilt that map to a full card tilt
  const DRIFT = 0.006; // how fast the neutral pose follows the hand
  let base = null;
  let receiving = false;
  let probeTimer = 0;

  const mq = (q) => !!(window.matchMedia && matchMedia(q).matches);
  const isTouch = mq("(pointer: coarse)") || mq("(hover: none)") || (navigator.maxTouchPoints || 0) > 0;
  const hasEvent = "DeviceOrientationEvent" in window;
  const needsPermission =
    hasEvent && typeof window.DeviceOrientationEvent.requestPermission === "function";

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === "number") return screen.orientation.angle;
    if (typeof window.orientation === "number") return window.orientation;
    return 0;
  }

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!receiving) {
      receiving = true;
      clearTimeout(probeTimer);
      gyro._emitState();
    }
    const b = e.beta;
    const g = e.gamma;
    let tx, ty;
    switch (((screenAngle() % 360) + 360) % 360) {
      case 90: tx = b; ty = -g; break;
      case 180: tx = -g; ty = -b; break;
      case 270: tx = -b; ty = g; break;
      default: tx = g; ty = b;
    }
    if (!base) base = { x: tx, y: ty };
    let dx = tx - base.x;
    let dy = ty - base.y;
    base.x += dx * DRIFT;
    base.y += dy * DRIFT;
    const x = Math.max(-1, Math.min(1, dx / RANGE));
    const y = Math.max(-1, Math.min(1, dy / RANGE));
    gyro.x = x;
    gyro.y = y;
    listeners.forEach((fn) => fn(x, y));
  }

  const gyro = {
    x: 0,
    y: 0,
    /** Device can probably report orientation (phones, tablets). */
    get available() {
      return hasEvent && isTouch;
    },
    /** iOS needs a tap before it will report orientation. */
    get needsPermission() {
      return needsPermission;
    },
    get enabled() {
      return this._enabled;
    },
    /** True once real orientation data has arrived. */
    get receiving() {
      return receiving;
    },
    _enabled: false,
    /** Enabled, but no data ever arrived: this device has no gyroscope. */
    failed: false,
    _stateFns: new Set(),
    _emitState() {
      this._stateFns.forEach((fn) => fn(this));
    },
    onState(fn) {
      this._stateFns.add(fn);
      return () => this._stateFns.delete(fn);
    },
    async enable() {
      if (!hasEvent) return false;
      if (this._enabled) return true;
      if (needsPermission) {
        try {
          const res = await window.DeviceOrientationEvent.requestPermission();
          if (res !== "granted") return false;
        } catch (err) {
          return false;
        }
      }
      window.addEventListener("deviceorientation", onOrientation);
      this._enabled = true;
      base = null;
      clearTimeout(probeTimer);
      this.failed = false;
      probeTimer = setTimeout(() => {
        // Touch laptops expose the event but never send data.
        if (!receiving) {
          this.failed = true;
          this._emitState();
        }
      }, 1500);
      try { localStorage.setItem("hc:gyro", "on"); } catch (e) {}
      this._emitState();
      return true;
    },
    disable() {
      window.removeEventListener("deviceorientation", onOrientation);
      this._enabled = false;
      receiving = false;
      this.x = this.y = 0;
      listeners.forEach((fn) => fn(0, 0));
      try { localStorage.setItem("hc:gyro", "off"); } catch (e) {}
      this._emitState();
    },
    recenter() {
      base = null;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Start automatically where no permission prompt is needed. */
    autoStart() {
      let pref = null;
      try { pref = localStorage.getItem("hc:gyro"); } catch (e) {}
      if (!this.available || pref === "off") return;
      if (!needsPermission) this.enable();
    },
  };
  HC.gyro = gyro;

  HC.reducedMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
})();
