/*
 * watermark.js
 * An invisible watermark in a card's photo: who uploaded it.
 *
 * The text (for example "阿翔 #d6886cc2", or "unknown user") is written into
 * the brightness of 8 × 8 pixel blocks: each block's average is nudged by at
 * most ±3 levels onto one of two grids (one for 0, one for 1). Every bit is
 * repeated across the whole picture in a scrambled order, and read back by
 * majority vote, so it survives JPEG / WebP saving at normal quality.
 * Resizing or cropping the picture removes it.
 *
 *   HC.watermark.embed(blob, text, { type, quality })  -> Promise<Blob>
 *   HC.watermark.read(blob)                            -> Promise<string | null>
 *   HC.watermark.UNKNOWN                               "unknown user"
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});

  const STEP = 6; // grid spacing in brightness levels (max nudge STEP / 2)
  const B = 8; // block size in pixels
  const MAGIC = [0x33, 0x44, 0x43]; // "3DC"
  const MAX_TEXT = 60; // bytes
  const FRAME = (3 + 1 + MAX_TEXT + 2) * 8; // magic, length, text, crc16 -> bits
  const MIN_REPEAT = 3;

  function crc16(bytes) {
    let c = 0xffff;
    for (const b of bytes) {
      c ^= b << 8;
      for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c;
  }

  function frameBits(text) {
    let bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_TEXT) {
      // cut on a character boundary
      let t = text;
      while (new TextEncoder().encode(t).length > MAX_TEXT) t = t.slice(0, -1);
      bytes = new TextEncoder().encode(t);
    }
    const body = new Uint8Array(3 + 1 + MAX_TEXT);
    body.set(MAGIC, 0);
    body[3] = bytes.length;
    body.set(bytes, 4);
    const crc = crc16(body.subarray(0, 4 + bytes.length));
    const all = new Uint8Array(body.length + 2);
    all.set(body);
    all[body.length] = crc >> 8;
    all[body.length + 1] = crc & 255;
    const bits = new Uint8Array(FRAME);
    for (let i = 0; i < FRAME; i++) bits[i] = (all[i >> 3] >> (7 - (i & 7))) & 1;
    return bits;
  }

  /** Which frame bit each block carries: a fixed scramble, the same for every picture of that size. */
  function layout(n) {
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    let seed = 0x3dc0 ^ n;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    const bitOf = new Uint16Array(n);
    for (let k = 0; k < n; k++) bitOf[order[k]] = k % FRAME;
    return bitOf;
  }

  async function pixels(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return { c, g, img: g.getImageData(0, 0, c.width, c.height) };
  }

  function blockMean(d, w, bx, by) {
    let s = 0;
    for (let y = by * B; y < by * B + B; y++) {
      for (let x = bx * B; x < bx * B + B; x++) {
        const i = (y * w + x) * 4;
        s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
    }
    return s / (B * B);
  }

  /** Nearest brightness on the grid for this bit: 0 → k·STEP, 1 → k·STEP + STEP/2. */
  function target(mean, bit) {
    const off = bit ? STEP / 2 : 0;
    let t = Math.round((mean - off) / STEP) * STEP + off;
    if (t < 6) t += STEP; // keep away from pure black / white, where the nudge would clip
    if (t > 249) t -= STEP;
    return t;
  }

  async function embed(blob, text, { type = "image/webp", quality = 0.9 } = {}) {
    const { c, g, img } = await pixels(blob);
    const w = c.width, h = c.height;
    const bw = Math.floor(w / B), bh = Math.floor(h / B);
    const n = bw * bh;
    if (n < FRAME * MIN_REPEAT) return blob; // too small to carry it
    const bits = frameBits(text);
    const bitOf = layout(n);
    const d = img.data;
    for (let by = 0, k = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++, k++) {
        const m = blockMean(d, w, bx, by);
        const delta = target(m, bits[bitOf[k]]) - m;
        if (Math.abs(delta) < 0.05) continue;
        for (let y = by * B; y < by * B + B; y++) {
          for (let x = bx * B; x < bx * B + B; x++) {
            const i = (y * w + x) * 4;
            d[i] = d[i] + delta;
            d[i + 1] = d[i + 1] + delta;
            d[i + 2] = d[i + 2] + delta;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
    const out = await new Promise((res) => c.toBlob(res, type, quality));
    return out || blob;
  }

  async function read(blob) {
    let p;
    try {
      p = await pixels(blob);
    } catch (e) {
      return null;
    }
    const { c, img } = p;
    const w = c.width;
    const bw = Math.floor(w / B), bh = Math.floor(c.height / B);
    const n = bw * bh;
    if (n < FRAME * MIN_REPEAT) return null;
    const bitOf = layout(n);
    const votes = new Float32Array(FRAME);
    for (let by = 0, k = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++, k++) {
        const m = blockMean(img.data, w, bx, by);
        // Distance to the 0-grid vs the 1-grid; a clear block votes harder.
        const r = ((m % STEP) + STEP) % STEP; // 0 … STEP
        const d0 = Math.min(r, STEP - r);
        const d1 = Math.abs(r - STEP / 2);
        votes[bitOf[k]] += d0 - d1; // > 0 means closer to 1
      }
    }
    const bytes = new Uint8Array(FRAME / 8);
    for (let i = 0; i < FRAME; i++) if (votes[i] > 0) bytes[i >> 3] |= 1 << (7 - (i & 7));
    if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) return null;
    const len = bytes[3];
    if (len > MAX_TEXT) return null;
    const crc = (bytes[4 + MAX_TEXT] << 8) | bytes[4 + MAX_TEXT + 1];
    if (crc16(bytes.subarray(0, 4 + len)) !== crc) return null;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(4, 4 + len));
    } catch (e) {
      return null;
    }
  }

  HC.watermark = { embed, read, UNKNOWN: "unknown user" };
})();
