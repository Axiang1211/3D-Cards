/*
 * io.js
 * Image processing and the .holocard.json file format.
 * Everything runs in the browser; nothing is uploaded.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});

  const MAX_FILE = 30 * 1024 * 1024;

  const webpOK = (() => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      return c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch (e) {
      return false;
    }
  })();

  function loadImageEl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = src;
    });
  }

  async function decode(file) {
    if (window.createImageBitmap && file.type !== "image/svg+xml") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (e) {
        /* fall through to <img> */
      }
    }
    const url = URL.createObjectURL(file);
    try {
      return await loadImageEl(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function toBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  HC.io = {
    /**
     * Validate, downscale and re-encode an image file.
     * keepAlpha: true for the transparent foreground layer.
     * Throws an Error whose message is ready to show to the visitor.
     */
    async processImage(file, { max = 1800, keepAlpha = false } = {}) {
      if (!file || !/^image\//.test(file.type)) {
        throw new Error("這不是圖片檔。請選擇 JPG、PNG 或 WebP。");
      }
      if (file.size > MAX_FILE) {
        throw new Error("圖片超過 30 MB。請先縮小再上傳。");
      }
      let img;
      try {
        img = await decode(file);
      } catch (e) {
        throw new Error("瀏覽器讀不出這張圖片。請換成 JPG 或 PNG 再試一次。");
      }
      const w = img.width || img.naturalWidth;
      const h = img.height || img.naturalHeight;
      if (!w || !h) throw new Error("瀏覽器讀不出這張圖片。請換成 JPG 或 PNG 再試一次。");
      const scale = Math.min(1, max / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      let blob;
      if (keepAlpha) blob = await toBlob(c, webpOK ? "image/webp" : "image/png", 0.92);
      else blob = await toBlob(c, webpOK ? "image/webp" : "image/jpeg", 0.9);
      if (!blob) throw new Error("圖片處理失敗。請換一張圖片再試一次。");
      return blob;
    },

    blobToDataURL(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
    },

    async dataURLToBlob(url) {
      const res = await fetch(url);
      return res.blob();
    },

    async urlToBlob(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch");
      return res.blob();
    },

    /** The card as a plain object with its images as data URLs (for files and sharing). */
    async payload(card) {
      const raw = card.own ? await HC.store.raw(card.id) : null;
      const bgBlob = raw ? raw.imageBlob : card.image ? await this.urlToBlob(card.image) : null;
      const fgBlob = raw ? raw.fgBlob : card.fg ? await this.urlToBlob(card.fg) : null;
      return Object.assign(
        {
          title: card.title || "",
          subtitle: card.subtitle || "",
          serial: card.serial || "",
          showText: card.showText !== false,
        },
        HC.normalize(card),
        {
          image: bgBlob ? await this.blobToDataURL(bgBlob) : "",
          fg: fgBlob ? await this.blobToDataURL(fgBlob) : "",
        }
      );

    },

    /** Download any card (gallery, own or shared) as a .holocard.json file. */
    async exportCard(card) {
      const out = { format: "holo-card", version: 1, card: await this.payload(card) };
      const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
      const name = (card.title || "card").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40) || "card";
      this.download(blob, name + ".holocard.json");
    },

    /** Turn a card object with data-URL images into a record for HC.store.put. */
    async recordFromCard(c) {
      if (!c || !/^data:image\//.test(c.image || "") || (c.fg && !/^data:image\//.test(c.fg))) {
        throw new Error("卡片裡的圖片格式不正確。");
      }
      return Object.assign(
        {
          title: String(c.title || "").slice(0, 40),
          subtitle: String(c.subtitle || "").slice(0, 60),
          serial: String(c.serial || "").slice(0, 16),
          showText: c.showText !== false,
        },
        HC.normalize(c),
        {
          imageBlob: await this.dataURLToBlob(c.image),
          fgBlob: c.fg ? await this.dataURLToBlob(c.fg) : null,
        }
      );

    },

    /** Read a .holocard.json file into a record ready for HC.store.put. */
    async importFile(file) {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (e) {
        throw new Error("這個檔案不是卡片檔。卡片檔的副檔名是 .holocard.json。");
      }
      if (!data || data.format !== "holo-card" || !data.card || !data.card.image) {
        throw new Error("這個檔案不是卡片檔。卡片檔的副檔名是 .holocard.json。");
      }
      return this.recordFromCard(data.card);
    },

    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
})();
