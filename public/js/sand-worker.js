/*
 * sand-worker.js
 * Runs the quicksand of every card on its own CPU core. Each card hands over
 * its canvas (OffscreenCanvas); the page only sends what changed: size,
 * colour, amount, gravity and where the light is.
 *
 *   page → worker   { t: "init", id, canvas }      { t: "size", id, w, h }
 *                   { t: "set", id, color, amount } { t: "gravity", id, gx, gy }
 *                   { t: "light", id, dx, dy }       { t: "drop", id }
 *   worker → page   { t: "state", id, asleep }
 */
/* global importScripts, HCSand */
importScripts("sand-core.js");

const sims = new Map(); // id -> { sand, asleep }
let running = false;

const raf =
  typeof self.requestAnimationFrame === "function"
    ? (fn) => self.requestAnimationFrame(fn)
    : (fn) => setTimeout(() => fn(performance.now()), 16);

let last = 0;
function loop(now) {
  // Same pace as the page: two simulation steps per 60 Hz frame.
  const frames = last ? Math.min(3, Math.max(1, Math.round((now - last) / 16.667))) : 1;
  last = now;
  let busy = false;
  for (const [id, sim] of sims) {
    const s = sim.sand;
    if (!s.W) continue;
    if (!s.asleep) {
      for (let i = 0; i < Math.min(2 * frames, 4); i++) s.step();
    }
    s.draw();
    const asleep = s.asleep;
    if (asleep !== sim.asleep) {
      sim.asleep = asleep;
      self.postMessage({ t: "state", id, asleep });
    }
    if (!asleep || s.dirty) busy = true;
  }
  if (busy) raf(loop);
  else {
    running = false;
    last = 0;
  }
}
function wake() {
  if (!running) {
    running = true;
    raf(loop);
  }
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.t === "init") {
    sims.set(m.id, { sand: new HCSand.Sand(m.canvas), asleep: false });
    return;
  }
  const sim = sims.get(m.id);
  if (!sim) return;
  const s = sim.sand;
  if (m.t === "size") s.resize(m.w, m.h);
  else if (m.t === "set") {
    s.setColor(m.color);
    s.setAmount(m.amount);
  } else if (m.t === "gravity") s.setGravity(m.gx, m.gy);
  else if (m.t === "light") s.setLight(m.dx, m.dy);
  else if (m.t === "drop") {
    sims.delete(m.id);
    return;
  }
  wake();
};
