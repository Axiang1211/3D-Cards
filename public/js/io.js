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
        throw new Error(HC.t("這不是圖片檔。請選擇 JPG、PNG 或 WebP。"));
      }
      if (file.size > MAX_FILE) {
        throw new Error(HC.t("圖片超過 30 MB。請先縮小再上傳。"));
      }
      let img;
      try {
        img = await decode(file);
      } catch (e) {
        throw new Error(HC.t("瀏覽器讀不出這張圖片。請換成 JPG 或 PNG 再試一次。"));
      }
      const w = img.width || img.naturalWidth;
      const h = img.height || img.naturalHeight;
      if (!w || !h) throw new Error(HC.t("瀏覽器讀不出這張圖片。請換成 JPG 或 PNG 再試一次。"));
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
      if (!blob) throw new Error(HC.t("圖片處理失敗。請換一張圖片再試一次。"));
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

    /**
     * Re-encode a picture no larger than maxSide, as small as reasonable.
     * Keeps transparency when alpha is true. Same aspect ratio, so layers stay aligned.
     */
    async shrink(blob, { maxSide = 1600, alpha = false, quality = 0.85 } = {}) {
      let img;
      try {
        img = await decode(blob);
      } catch (e) {
        return blob;
      }
      const w = img.width || img.naturalWidth;
      const h = img.height || img.naturalHeight;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      const type = webpOK ? "image/webp" : alpha ? "image/png" : "image/jpeg";
      const out = await toBlob(c, type, quality);
      return out && out.size < blob.size ? out : scale < 1 && out ? out : blob;
    },

    /** Smaller copies of the pictures for uploading a share (phones make big PNGs). */
    async forUpload(bgBlob, fgBlob) {
      const LIMIT = 5.5 * 1024 * 1024;
      let side = 1600;
      let bg = bgBlob, fg = fgBlob;
      for (let i = 0; i < 4; i++) {
        bg = bgBlob ? await this.shrink(bgBlob, { maxSide: side }) : null;
        fg = fgBlob ? await this.shrink(fgBlob, { maxSide: side, alpha: true }) : null;
        if ((bg ? bg.size : 0) + (fg ? fg.size : 0) <= LIMIT) break;
        side = Math.round(side * 0.75);
      }
      return [bg, fg];
    },

    /** The card as a plain object with its images as data URLs (for files and sharing). */
    async payload(card, { forUpload = false } = {}) {
      const raw = card.own ? await HC.store.raw(card.id) : null;
      let bgBlob = raw ? raw.imageBlob : card.image ? await this.urlToBlob(card.image) : null;
      let fgBlob = raw ? raw.fgBlob : card.fg ? await this.urlToBlob(card.fg) : null;
      if (forUpload) [bgBlob, fgBlob] = await this.forUpload(bgBlob, fgBlob);
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

    /**
     * Download any card as a .3dcard file.
     * It is JSON: the card with its pictures, plus where to get 3D Cards. The desktop app
     * registers .3dcard, so double-clicking the file opens the card there.
     */
    async exportCard(card) {
      const cfg = window.HC_CONFIG || {};
      const out = {
        format: "3d-cards",
        version: 2,
        app: "3D Cards",
        about: "用 3D Cards 開啟這張卡片 / Open this card with 3D Cards",
        site: cfg.siteUrl || "",
        download: cfg.downloadUrl || "",
        card: await this.payload(card),
      };
      const blob = new Blob([JSON.stringify(out)], { type: "application/x-3dcard" });
      const name = (card.title || "card").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40) || "card";
      this.download(blob, name + ".3dcard");
    },

    /** Turn a card object with data-URL images into a record for HC.store.put. */
    async recordFromCard(c) {
      if (!c || !/^data:image\//.test(c.image || "") || (c.fg && !/^data:image\//.test(c.fg))) {
        throw new Error(HC.t("卡片裡的圖片格式不正確。"));
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

    /** Read card file text (.3dcard, or the older .holocard.json) into a record for HC.store.put. */
    async importText(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(HC.t("這個檔案不是卡片檔。卡片檔的副檔名是 .3dcard。"));
      }
      const okFormat = data && (data.format === "3d-cards" || data.format === "holo-card");
      if (!okFormat || !data.card || !data.card.image) {
        throw new Error(HC.t("這個檔案不是卡片檔。卡片檔的副檔名是 .3dcard。"));
      }
      const rec = await this.recordFromCard(data.card);
      rec.fileHash = await this.fingerprint(data.card);
      return rec;
    },

    async importFile(file) {
      return this.importText(await file.text());
    },

    /** Same card file imported twice gives the same fingerprint. */
    async fingerprint(card) {
      const text = [card.title, card.subtitle, card.serial, card.image && card.image.length, (card.image || "").slice(-4096), (card.fg || "").slice(-2048)].join("|");
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
      } catch (e) {
        let h = 0;
        for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
        return "h" + h;
      }
    },

    /** Import card file text and save it, unless the same card is already saved. */
    async saveImported(text) {
      const rec = await this.importText(text);
      const own = await HC.cards.own();
      const dup = own.find((c) => c.fileHash && c.fileHash === rec.fileHash);
      if (dup) return { id: dup.id, title: dup.title, existed: true };
      const id = await HC.store.put(rec);
      return { id, title: rec.title, existed: false };
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
