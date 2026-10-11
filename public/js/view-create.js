/*
 * view-create.js
 * The card maker: upload a photo, frame it, pick a foil, save.
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});
  HC.views = HC.views || {};
  const h = (...args) => HC.h(...args);

  function segGroup(name, label, options, value, onChange, extra) {
    const wrap = h("div.field");
    const id = "f-" + name;
    wrap.appendChild(h("span.field__label", { id }, label));
    const group = h("div.seg.seg--form", { role: "radiogroup", "aria-labelledby": id });
    options.forEach((o) => {
      const b = h(
        "button.seg__btn",
        { type: "button", role: "radio", "aria-checked": String(o.id === value), dataset: { v: o.id } },
        extra ? extra(o) : null,
        o.name
      );
      b.addEventListener("click", () => {
        group.querySelectorAll(".seg__btn").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        onChange(o.id);
      });
      group.appendChild(b);
    });
    wrap.appendChild(group);
    wrap.set = (v) => group.querySelectorAll(".seg__btn").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.v === v)));
    wrap.disable = (v, off) => {
      const b = group.querySelector(`[data-v="${v}"]`);
      if (b) b.disabled = off;
    };
    return wrap;
  }

  function range(label, { min, max, step, value, format }, onInput) {
    const out = h("output.field__value");
    const input = h("input.range", { type: "range", min, max, step, value: String(value) });
    const show = () => (out.textContent = format(+input.value));
    input.addEventListener("input", () => {
      show();
      onInput(+input.value);
    });
    show();
    const wrap = h("label.field.field--range", h("span.field__row", h("span.field__label", label), out), input);
    wrap.set = (v) => {
      input.value = String(v);
      show();
    };
    return wrap;
  }

  function text(label, { value, max, placeholder }, onInput) {
    const input = h("input.input", { type: "text", maxlength: String(max), placeholder: placeholder || "", value: value || "" });
    input.addEventListener("input", () => onInput(input.value));
    return h("label.field", h("span.field__label", label), input);
  }

  HC.views.create = async function (root, route) {
    let editing = null;
    if (route.id) {
      editing = await HC.store.raw(route.id).catch(() => null);
      if (!editing) {
        root.appendChild(
          h(
            "section.maker-missing",
            h("h1", "找不到要編輯的卡片"),
            h("p", "只有在這個瀏覽器裡做的卡片才能編輯。"),
            h("a.btn.btn--ink", { href: "#/create" }, "做一張新卡片")
          )
        );
        return { title: "找不到卡片" };
      }
    }

    const draft = Object.assign({}, HC.DEFAULTS, { imageBlob: null, fgBlob: null }, editing || {});
    delete draft.image;
    delete draft.fg;
    const urls = { bg: "", fg: "" };
    const setUrl = (k, blob) => {
      if (urls[k]) URL.revokeObjectURL(urls[k]);
      urls[k] = blob ? URL.createObjectURL(blob) : "";
    };
    setUrl("bg", draft.imageBlob);
    setUrl("fg", draft.fgBlob);

    const previewData = () =>
      Object.assign({}, draft, {
        image: urls.bg,
        fg: urls.fg,
        title: draft.title,
        imageBlob: undefined,
        fgBlob: undefined,
      });

    /* Preview ----------------------------------------------------------- */
    const card = new HC.HoloCard(previewData(), { dragTilt: true, maxTilt: 16, restFoil: 0.4 });
    const empty = h("div.maker__empty", h("strong", "拖一張照片到這裡"), h("span", "或使用右側的「選擇照片」"));
    const stage = h("div.maker__stage", h("div.maker__card", card.el, empty));
    const refresh = () => {
      card.setData(previewData());
      empty.hidden = !!draft.imageBlob;
      stage.classList.toggle("is-empty", !draft.imageBlob);
    };

    /* Photo ------------------------------------------------------------- */
    const photoInput = h("input.sr-only", { type: "file", accept: "image/*", id: "photo-input" });
    const photoName = h("span.drop__name");
    const photoBtn = h("label.drop", photoInput, h("span.drop__cta"), photoName);
    const syncPhoto = () => {
      photoBtn.querySelector(".drop__cta").textContent = draft.imageBlob ? "更換照片" : "選擇照片";
      photoName.textContent = draft.imageBlob ? "已載入照片" : "JPG、PNG、WebP 或 HEIC，最大 30 MB";
      photoBtn.classList.toggle("has-file", !!draft.imageBlob);
    };
    async function takePhoto(file) {
      if (!file) return;
      photoBtn.classList.add("is-busy");
      try {
        draft.imageBlob = await HC.io.processImage(file);
        setUrl("bg", draft.imageBlob);
        if (!editing && !draft.title) {
          const base = file.name.replace(/\.[^.]+$/, "").slice(0, 24);
          if (base && !/^(img|dsc|pxl|image|photo)[\W_]?\d/i.test(base)) {
            draft.title = base;
            titleField.querySelector("input").value = base;
          }
        }
        refresh();
        syncPhoto();
      } catch (e) {
        HC.toast(e.message, "error");
      } finally {
        photoBtn.classList.remove("is-busy");
      }
    }
    photoInput.addEventListener("change", () => {
      takePhoto(photoInput.files[0]);
      photoInput.value = "";
    });

    /* Drag and drop anywhere on the page ------------------------------- */
    const onDragOver = (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      stage.classList.add("is-drop");
    };
    const onDragLeave = (e) => {
      if (e.relatedTarget == null) stage.classList.remove("is-drop");
    };
    const onDrop = (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      stage.classList.remove("is-drop");
      takePhoto(e.dataTransfer.files[0]);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);

    /* Sliders ----------------------------------------------------------- */
    const pct = (v) => Math.round(v) + "%";
    const signed = (v) => (v > 0 ? "+" : "") + Math.round(v) + "%";
    const times = (v) => v.toFixed(2) + "×";
    const deg = (v) => Math.round(v) + "°";
    const sliders = {};
    const slider = (key, label, opts) => {
      const f = range(label, Object.assign({ value: draft[key] }, opts), (v) => {
        draft[key] = v;
        refresh();
      });
      sliders[key] = f;
      return f;
    };
    const resetBtn = (label, keys) => {
      const b = h("button.btn.btn--quiet.btn--sm", { type: "button" }, label);
      b.addEventListener("click", () => {
        keys.forEach((key) => {
          draft[key] = HC.DEFAULTS[key];
          if (sliders[key]) sliders[key].set(HC.DEFAULTS[key]);
          if (segs[key]) segs[key].set(HC.DEFAULTS[key]);
        });
        syncFoilFields();
        refresh();
      });
      return h("div.group__foot", b);
    };
    const segs = {};

    /* Background photo ------------------------------------------------- */
    const bgFields = [
      slider("zoom", "縮放", { min: 1, max: 3, step: 0.01, format: times }),
      slider("posX", "水平位置", { min: 0, max: 100, step: 1, format: pct }),
      slider("posY", "垂直位置", { min: 0, max: 100, step: 1, format: pct }),
    ];
    const blurF = slider("bgBlur", "背景模糊", { min: 0, max: 100, step: 1, format: (v) => (v ? Math.round(v) : "不模糊") });
    const blurNote = h("p.group__help", "加入前景圖層後才能模糊背景，讓前景更突出。");

    /* Background foil -------------------------------------------------- */
    const foilF = segGroup("foil", "樣式", HC.FOILS, draft.foil, (v) => {
      draft.foil = v;
      syncFoilFields();
      refresh();
    }, (o) => h("span.foil-pick__swatch", { "aria-hidden": "true", dataset: { foil: o.id } }));
    foilF.classList.add("field--foil");
    segs.foil = foilF;
    const areaF = segGroup("area", "範圍", HC.AREAS, draft.area, (v) => {
      draft.area = v;
      refresh();
    });
    segs.area = areaF;
    const foilTune = h(
      "div.tune",
      slider("foilStrength", "強度", { min: 0, max: 200, step: 1, format: pct }),
      slider("foilScale", "紋理大小", { min: 50, max: 200, step: 1, format: pct }),
      slider("foilHue", "色調", { min: 0, max: 360, step: 1, format: deg })
    );

    /* Foreground ------------------------------------------------------- */
    const fgInput = h("input.sr-only", { type: "file", accept: "image/png,image/webp", id: "fg-input" });
    const fgText = h("span");
    const fgLabel = h("label.btn.btn--line.btn--sm.file-btn", fgInput, fgText);
    const fgRemove = h("button.btn.btn--quiet.btn--sm", { type: "button" }, "移除前景");
    const fgFoilF = segGroup("fgFoil", "前景鐳射", HC.FG_FOILS, draft.fgFoil, (v) => {
      draft.fgFoil = v;
      syncFoilFields();
      refresh();
    }, (o) => h("span.foil-pick__swatch", { "aria-hidden": "true", dataset: { foil: o.id } }));
    fgFoilF.classList.add("field--foil");
    segs.fgFoil = fgFoilF;
    const fgFoilTune = h(
      "div.tune",
      slider("fgFoilStrength", "前景鐳射強度", { min: 0, max: 200, step: 1, format: pct }),
      slider("fgFoilHue", "前景鐳射色調", { min: 0, max: 360, step: 1, format: deg })
    );
    const fgControls = h(
      "div.fg-controls",
      slider("fgZoom", "前景大小", { min: 0.5, max: 2, step: 0.01, format: times }),
      slider("fgX", "前景左右", { min: -50, max: 50, step: 1, format: signed }),
      slider("fgY", "前景上下", { min: -50, max: 50, step: 1, format: signed }),
      fgFoilF,
      fgFoilTune,
      resetBtn("重設前景", ["fgZoom", "fgX", "fgY", "fgFoil", "fgFoilStrength", "fgFoilHue"])
    );

    function syncFoilFields() {
      const hasFg = !!draft.fgBlob;
      areaF.classList.toggle("is-off", draft.foil === "gloss");
      foilTune.classList.toggle("is-off", draft.foil === "gloss");
      fgFoilTune.classList.toggle("is-off", draft.fgFoil === "none");
      fgControls.hidden = !hasFg;
      blurF.classList.toggle("is-off", !hasFg);
      blurNote.hidden = hasFg;
      areaF.disable("frame", draft.frame === "none");
    }
    const syncFg = () => {
      fgText.textContent = draft.fgBlob ? "更換前景圖" : "加入前景圖";
      fgRemove.hidden = !draft.fgBlob;
      syncFoilFields();
    };
    fgInput.addEventListener("change", async () => {
      const file = fgInput.files[0];
      fgInput.value = "";
      if (!file) return;
      try {
        draft.fgBlob = await HC.io.processImage(file, { keepAlpha: true });
        setUrl("fg", draft.fgBlob);
        refresh();
        syncFg();
      } catch (e) {
        HC.toast(e.message, "error");
      }
    });
    fgRemove.addEventListener("click", () => {
      draft.fgBlob = null;
      setUrl("fg", null);
      refresh();
      syncFg();
    });

    /* Text -------------------------------------------------------------- */
    const titleField = text("標題", { value: draft.title, max: 24, placeholder: "例如：夏天的海" }, (v) => {
      draft.title = v;
      refresh();
    });
    const subField = text("副標", { value: draft.subtitle, max: 40, placeholder: "地點、日期或一句話" }, (v) => {
      draft.subtitle = v;
      refresh();
    });
    const serialField = text("編號", { value: draft.serial, max: 12, placeholder: "例如：001/100" }, (v) => {
      draft.serial = v;
      refresh();
    });
    const showText = h("input", { type: "checkbox", checked: draft.showText !== false });
    showText.addEventListener("change", () => {
      draft.showText = showText.checked;
      refresh();
    });

    /* Frame ------------------------------------------------------------- */
    const frameF = segGroup("frame", "顏色", HC.FRAMES, draft.frame, (v) => {
      draft.frame = v;
      if (v === "none" && draft.area === "frame") {
        draft.area = "full";
        areaF.set("full");
      }
      syncFoilFields();
      refresh();
    }, (o) => h("span.frame-chip", { "aria-hidden": "true", dataset: { frame: o.id } }));

    /* Save -------------------------------------------------------------- */
    const saveBtn = h("button.btn.btn--ink.btn--wide", { type: "submit" }, editing ? "儲存變更" : "儲存到展廳");
    const form = h(
      "form.maker__form",
      { novalidate: true },
      h("div.maker__head", h("h1.maker__title", editing ? "編輯卡片" : "製作卡片"), h("p.maker__lead", "照片在你的瀏覽器裡處理和儲存。只有按下「分享」的卡片才會上傳。")),
      h(
        "fieldset.group",
        h("legend.group__title", "照片"),
        photoBtn
      ),
      h(
        "fieldset.group",
        h("legend.group__title", "背景照片"),
        ...bgFields,
        blurF,
        blurNote,
        resetBtn("重設背景", ["zoom", "posX", "posY", "bgBlur"])
      ),
      h(
        "fieldset.group",
        h("legend.group__title", "背景鐳射"),
        foilF,
        areaF,
        foilTune,
        resetBtn("重設鐳射數值", ["foilStrength", "foilScale", "foilHue"])
      ),
      h(
        "fieldset.group",
        h("legend.group__title", "前景圖層", h("span.group__opt", "選用")),
        h("p.group__help", "一張去背的 PNG（例如照片裡的人物），會浮在照片上方，傾斜時前後景分開移動，產生立體感。前景可以有自己的鐳射和位置。"),
        h("div.group__row", fgLabel, fgRemove),
        fgControls
      ),
      h(
        "fieldset.group",
        h("legend.group__title", "文字"),
        titleField,
        subField,
        serialField,
        h("label.check", showText, h("span", "在卡片上顯示文字"))
      ),
      h("fieldset.group", h("legend.group__title", "邊框"), frameF),
      h(
        "div.maker__actions",
        saveBtn,
        h("a.btn.btn--quiet", { href: editing ? "#/card/" + editing.id : "#/" }, "取消")
      )
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!draft.imageBlob) {
        HC.toast("請先選擇一張照片。", "error");
        photoInput.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        const id = await HC.store.put(Object.assign({}, draft, { title: draft.title.trim() }));
        HC.toast(editing ? "已儲存變更" : "已儲存到展廳");
        HC.go("#/card/" + id);
      } catch (err) {
        saveBtn.disabled = false;
        HC.toast("儲存失敗：瀏覽器的儲存空間可能已滿。請刪除幾張舊卡片再試。", "error");
      }
    });

    root.appendChild(
      h(
        "div.maker",
        h("div.maker__preview", stage, h("p.maker__hint", h("span.hint-desk", "把滑鼠移到預覽上看看效果"), h("span.hint-touch", "拖曳預覽看看效果"))),
        form
      )
    );
    syncPhoto();
    syncFg();
    refresh();

    return {
      title: editing ? "編輯卡片" : "製作卡片",
      destroy() {
        card.destroy();
        setUrl("bg", null);
        setUrl("fg", null);
        document.removeEventListener("dragover", onDragOver);
        document.removeEventListener("dragleave", onDragLeave);
        document.removeEventListener("drop", onDrop);
      },
    };
  };
})();
