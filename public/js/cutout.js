/*
 * cutout.js
 * Automatic foreground cut-out, done entirely in the browser.
 *
 * Model: U²-Netp (Apache-2.0, https://github.com/xuebinqin/U-2-Net), ~4.6 MB,
 *        served from /models/u2netp.onnx.
 * Runtime: onnxruntime-web (MIT), loaded from jsDelivr the first time it is used.
 *
 * Works best on one clear subject (a person, a figure, a pet) against a simple
 * background. Busy pictures may come out rough.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});

  const ORT_VERSION = "1.26.0";
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const SIZE = 320;
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];

  let ortPromise = null;
  let sessionPromise = null;

  function modelUrl() {
    // The desktop app does not ship the model; it downloads it from the website.
    const cfg = window.HC_CONFIG || {};
    if (window.HC_DESKTOP && cfg.siteUrl) return cfg.siteUrl.replace(/\/+$/, "") + "/models/u2netp.onnx";
    return "models/u2netp.onnx";
  }

  function loadOrt() {
    if (window.ort) return Promise.resolve(window.ort);
    if (ortPromise) return ortPromise;
    ortPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ORT_BASE + "ort.wasm.min.js";
      s.crossOrigin = "anonymous";
      s.onload = () => (window.ort ? resolve(window.ort) : reject(new Error("ort")));
      s.onerror = () => reject(new Error("ort"));
      document.head.appendChild(s);
    }).catch((e) => {
      ortPromise = null;
      throw e;
    });
    return ortPromise;
  }

  async function fetchModel(onProgress) {
    const res = await fetch(modelUrl());
    if (!res.ok) throw new Error("model " + res.status);
    const total = +res.headers.get("content-length") || 4574861;
    if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (onProgress) onProgress(Math.min(1, got / total));
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  function getSession(onProgress) {
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const ort = await loadOrt();
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const model = await fetchModel(onProgress);
      return ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
    return sessionPromise;
  }

  async function decode(blob) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(blob);
      } catch (e) {}
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  HC.cutout = {
    /**
     * Cut the main subject out of a photo.
     * Returns a PNG Blob the same size as the photo, transparent around the subject.
     * onStatus(stage, progress): stage is "download" | "work".
     */
    async run(photoBlob, onStatus) {
      const status = onStatus || (() => {});
      status("download", 0);
      let session;
      try {
        session = await getSession((p) => status("download", p));
      } catch (e) {
        throw new Error(HC.t("無法下載摳圖工具。請確認網路連線後再試一次。"));
      }
      status("work", 0);
      const img = await decode(photoBlob);
      const w = img.width || img.naturalWidth;
      const h = img.height || img.naturalHeight;

      // 1. Model input: 320×320, normalised, channels first.
      const small = document.createElement("canvas");
      small.width = small.height = SIZE;
      const sg = small.getContext("2d", { willReadFrequently: true });
      sg.drawImage(img, 0, 0, SIZE, SIZE);
      const px = sg.getImageData(0, 0, SIZE, SIZE).data;
      const n = SIZE * SIZE;
      const input = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) input[c * n + i] = (px[i * 4 + c] / 255 - MEAN[c]) / STD[c];
      }
      const ort = window.ort;
      const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) };
      const out = await session.run(feeds);
      const pred = out[session.outputNames[0]].data;

      // 2. Normalise the prediction and sharpen it into an alpha mask.
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        if (pred[i] < lo) lo = pred[i];
        if (pred[i] > hi) hi = pred[i];
      }
      const range = hi - lo || 1;
      const maskImg = sg.createImageData(SIZE, SIZE);
      for (let i = 0; i < n; i++) {
        const a = smooth(0.32, 0.62, (pred[i] - lo) / range);
        maskImg.data[i * 4 + 3] = Math.round(a * 255);
      }
      sg.putImageData(maskImg, 0, 0);
      status("work", 0.6);

      // 3. Scale the mask to the photo and keep only the subject.
      const outCanvas = document.createElement("canvas");
      outCanvas.width = w;
      outCanvas.height = h;
      const og = outCanvas.getContext("2d");
      og.imageSmoothingQuality = "high";
      og.drawImage(small, 0, 0, w, h);
      og.globalCompositeOperation = "source-in";
      og.drawImage(img, 0, 0, w, h);
      if (img.close) img.close();

      const blob = await new Promise((r) => outCanvas.toBlob(r, "image/png"));
      status("work", 1);
      if (!blob) throw new Error(HC.t("摳圖失敗，請換一張照片試試。"));
      return blob;
    },
  };
})();
