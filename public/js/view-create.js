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
            h("h1", HC.t("找不到要編輯的卡片")),
            h("p", HC.t("只有在這個瀏覽器裡做的卡片才能編輯。")),
            h("a.btn.btn--ink", { href: "#/create" }, HC.t("做一張新卡片"))
          )
        );
        return { title: HC.t("找不到卡片") };
      }
    }

    // edit: change the card itself.
    // copy: your card is in the public gallery (or waiting for review), so it's saved as a new card.
    // template: settings from someone else's public card, with your own photo; also a new card.
    let mode = editing ? "edit" : "new";
    let base = editing;
    let lockNote = "";
    if (HC.pub) {
      if (editing) {
        const lock = await HC.pub.lockOf(editing, true);
        if (lock && lock.reason === "copy") {
          mode = "template";
          base = HC.pub.settingsOf(editing);
          lockNote = HC.t("這張卡片來自公開展廳，照片屬於原作者，不能編輯。你可以沿用它的參數，換上自己的照片，儲存後會成為一張新卡片。");
        } else if (lock) {
          mode = "copy";
          base = Object.assign(HC.pub.settingsOf(editing), {
            title: editing.title,
            subtitle: editing.subtitle,
            serial: editing.serial,
            imageBlob: editing.imageBlob,
            fgBlob: editing.fgBlob,
          });
          lockNote =
            lock.reason === "pending"
              ? HC.t("這張卡片正在公開展廳審核中，不能直接修改。儲存後會成為一張新卡片，送審的那張不會改變。想修改原卡片，請先取消送審。")
              : HC.t("這張卡片已經公開在展廳，不能直接修改。儲存後會成為一張新卡片，公開的那張不會改變。想修改原卡片，請先從公開展廳下架。");
        }
      } else {
        const t = HC.pub.takeTemplate();
        if (t) {
          mode = "template";
          base = t.settings;
          lockNote = HC.t("已套用「{title}」的參數。公開作品的照片不能使用，請選擇你自己的照片。", { title: t.title || HC.t("未命名卡片") });
        }
      }
    }
    const isEdit = mode === "edit";
    const heading = isEdit ? HC.t("編輯卡片") : mode === "copy" ? HC.t("另存新卡片") : mode === "template" ? HC.t("用這組參數製作") : HC.t("製作卡片");
    const saveLabel = isEdit ? HC.t("儲存變更") : mode === "new" ? HC.t("儲存到展廳") : HC.t("儲存為新卡片");

    const draft = Object.assign({}, HC.DEFAULTS, { imageBlob: null, fgBlob: null }, base || {});
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
    const empty = h("div.maker__empty", h("strong", HC.t("拖一張照片到這裡")), h("span", HC.t("或使用右側的「選擇照片」")));
    const stage = h("div.maker__stage", h("div.maker__card", card.el, empty));
    var turnBtn = h("button.btn.btn--line.btn--sm.turn-btn", { type: "button", hidden: true, onclick: () => card.turn() }, HC.t("上下顛倒"));
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
      photoBtn.querySelector(".drop__cta").textContent = draft.imageBlob ? HC.t("更換照片") : HC.t("選擇照片");
      photoName.textContent = draft.imageBlob ? HC.t("已載入照片") : HC.t("JPG、PNG、WebP 或 HEIC，最大 30 MB");
      photoBtn.classList.toggle("has-file", !!draft.imageBlob);
      if (typeof autoBtn !== "undefined") autoBtn.disabled = !draft.imageBlob;
    };
    async function takePhoto(file) {
      if (!file) return;
      photoBtn.classList.add("is-busy");
      try {
        draft.imageBlob = await HC.io.processImage(file);
        setUrl("bg", draft.imageBlob);
        if (!isEdit && !draft.title) {
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
      slider("zoom", HC.t("縮放"), { min: 1, max: 3, step: 0.01, format: times }),
      slider("posX", HC.t("水平位置"), { min: 0, max: 100, step: 1, format: pct }),
      slider("posY", HC.t("垂直位置"), { min: 0, max: 100, step: 1, format: pct }),
    ];
    const blurF = slider("bgBlur", HC.t("背景模糊"), { min: 0, max: 100, step: 1, format: (v) => (v ? Math.round(v) : HC.t("不模糊")) });
    const blurNote = h("p.group__help", HC.t("加入前景圖層後才能模糊背景，讓前景更突出。"));

    /* Background foil -------------------------------------------------- */
    const foilF = segGroup("foil", HC.t("樣式"), HC.FOILS, draft.foil, (v) => {
      draft.foil = v;
      syncFoilFields();
      refresh();
    }, (o) => h("span.foil-pick__swatch", { "aria-hidden": "true", dataset: { foil: o.id } }));
    foilF.classList.add("field--foil");
    segs.foil = foilF;
    const areaF = segGroup("area", HC.t("範圍"), HC.AREAS, draft.area, (v) => {
      draft.area = v;
      refresh();
    });
    segs.area = areaF;
    const foilTune = h(
      "div.tune",
      slider("foilStrength", HC.t("強度"), { min: 0, max: 200, step: 1, format: pct }),
      slider("foilScale", HC.t("紋理大小"), { min: 50, max: 200, step: 1, format: pct }),
      slider("foilHue", HC.t("色調"), { min: 0, max: 360, step: 1, format: deg })
    );

    /* Foreground ------------------------------------------------------- */
    const fgInput = h("input.sr-only", { type: "file", accept: "image/png,image/webp", id: "fg-input" });
    const fgText = h("span");
    const fgLabel = h("label.btn.btn--line.btn--sm.file-btn", fgInput, fgText);
    const fgRemove = h("button.btn.btn--quiet.btn--sm", { type: "button" }, HC.t("移除前景"));
    const autoBtn = h("button.btn.btn--line.btn--sm", { type: "button" }, HC.t("從照片自動摳圖"));
    const autoStatus = h("p.group__help.auto-status", { hidden: true, role: "status" });
    autoBtn.addEventListener("click", async () => {
      if (!draft.imageBlob) {
        HC.toast(HC.t("請先選擇一張照片。"), "error");
        return;
      }
      autoBtn.disabled = true;
      autoStatus.hidden = false;
      autoStatus.classList.remove("share__warn");
      try {
        const cut = await HC.cutout.run(draft.imageBlob, (stage, p) => {
          autoStatus.textContent =
            stage === "download"
              ? HC.t("第一次使用要下載摳圖工具（約 8 MB）… {p}%", { p: Math.round(p * 100) })
              : HC.t("正在找出照片裡的主體…");
        });
        const file = new File([cut], "cutout.png", { type: "image/png" });
        draft.fgBlob = await HC.io.processImage(file, { keepAlpha: true });
        setUrl("fg", draft.fgBlob);
        refresh();
        syncFg();
        autoStatus.textContent = HC.t("摳好了。效果不理想的話，可以自己用其他工具去背後按「加入前景圖」上傳。");
      } catch (e) {
        autoStatus.textContent = e.message || HC.t("摳圖失敗，請換一張照片試試。");
        autoStatus.classList.add("share__warn");
      } finally {
        autoBtn.disabled = false;
      }
    });
    const fgFoilF = segGroup("fgFoil", HC.t("前景鐳射"), HC.FG_FOILS, draft.fgFoil, (v) => {
      draft.fgFoil = v;
      syncFoilFields();
      refresh();
    }, (o) => h("span.foil-pick__swatch", { "aria-hidden": "true", dataset: { foil: o.id } }));
    fgFoilF.classList.add("field--foil");
    segs.fgFoil = fgFoilF;
    const fgFoilTune = h(
      "div.tune",
      slider("fgFoilStrength", HC.t("前景鐳射強度"), { min: 0, max: 200, step: 1, format: pct }),
      slider("fgFoilHue", HC.t("前景鐳射色調"), { min: 0, max: 360, step: 1, format: deg })
    );
    /* Quicksand ------------------------------------------------------- */
    const SAND_COLORS = [
      { id: "#ffd26e", name: HC.t("金") },
      { id: "#ff9ccf", name: HC.t("粉") },
      { id: "#8fd3ff", name: HC.t("藍") },
      { id: "#c9a8ff", name: HC.t("紫") },
      { id: "#f4f6fa", name: HC.t("銀白") },
    ];
    const sandChk = h("input", { type: "checkbox", checked: !!draft.sand });
    const sandColor = h("input.sand-color", { type: "color", value: draft.sandColor || "#ffd26e", "aria-label": HC.t("自訂流沙顏色") });
    const sandSwatches = h("div.sand-swatches", { role: "radiogroup", "aria-label": HC.t("流沙顏色") });
    const syncSandSwatches = () =>
      sandSwatches.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.c === draft.sandColor)));
    SAND_COLORS.forEach((c) => {
      const b = h("button.sand-swatch", { type: "button", role: "radio", title: c.name, "aria-label": c.name, dataset: { c: c.id }, style: "--c:" + c.id });
      b.addEventListener("click", () => {
        draft.sandColor = c.id;
        sandColor.value = c.id;
        syncSandSwatches();
        refresh();
      });
      sandSwatches.appendChild(b);
    });
    sandColor.addEventListener("input", () => {
      draft.sandColor = sandColor.value.toLowerCase();
      syncSandSwatches();
      refresh();
    });
    const sandColorField = h("div.field", h("span.field__label", HC.t("流沙顏色")), h("div.sand-row", sandSwatches, sandColor));
    const sandAmountField = slider("sandAmount", HC.t("流沙數量"), { min: 10, max: 80, step: 1, format: pct });
    const sandGrainField = slider("sandGrain", HC.t("顆粒大小"), { min: 1, max: 4, step: 0.5, format: (v) => v.toFixed(1) + " px" });
    sandChk.addEventListener("change", () => {
      draft.sand = sandChk.checked;
      syncFoilFields();
      refresh();
    });
    syncSandSwatches();

    const fgControls = h(
      "div.fg-controls",
      slider("fgZoom", HC.t("前景大小"), { min: 0.5, max: 2, step: 0.01, format: times }),
      slider("fgX", HC.t("前景左右"), { min: -50, max: 50, step: 1, format: signed }),
      slider("fgY", HC.t("前景上下"), { min: -50, max: 50, step: 1, format: signed }),
      fgFoilF,
      fgFoilTune,
      h("label.check", sandChk, h("span", HC.t("流沙：在照片和前景之間流動"))),
      sandAmountField,
      sandGrainField,
      sandColorField,
      resetBtn(HC.t("重設前景"), ["fgZoom", "fgX", "fgY", "fgFoil", "fgFoilStrength", "fgFoilHue"])
    );

    function syncFoilFields() {
      const hasFg = !!draft.fgBlob;
      areaF.classList.toggle("is-off", draft.foil === "gloss");
      foilTune.classList.toggle("is-off", draft.foil === "gloss");
      fgFoilTune.classList.toggle("is-off", draft.fgFoil === "none");
      fgControls.hidden = !hasFg;
      blurF.classList.toggle("is-off", !hasFg);
      blurNote.hidden = hasFg;
      sandColorField.hidden = !draft.sand;
      sandAmountField.hidden = !draft.sand;
      sandGrainField.hidden = !draft.sand;
      if (typeof turnBtn !== "undefined") turnBtn.hidden = !(hasFg && draft.sand);
      areaF.disable("frame", draft.frame === "none");
    }
    const syncFg = () => {
      fgText.textContent = draft.fgBlob ? HC.t("更換前景圖") : HC.t("加入前景圖");
      autoBtn.disabled = !draft.imageBlob;
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
    const titleField = text(HC.t("標題"), { value: draft.title, max: 24, placeholder: HC.t("例如：夏天的海") }, (v) => {
      draft.title = v;
      refresh();
    });
    const subField = text(HC.t("副標"), { value: draft.subtitle, max: 40, placeholder: HC.t("地點、日期或一句話") }, (v) => {
      draft.subtitle = v;
      refresh();
    });
    const serialField = text(HC.t("編號"), { value: draft.serial, max: 12, placeholder: HC.t("例如：001/100") }, (v) => {
      draft.serial = v;
      refresh();
    });
    const showText = h("input", { type: "checkbox", checked: draft.showText !== false });
    showText.addEventListener("change", () => {
      draft.showText = showText.checked;
      refresh();
    });

    /* Frame ------------------------------------------------------------- */
    const frameF = segGroup("frame", HC.t("顏色"), HC.FRAMES, draft.frame, (v) => {
      draft.frame = v;
      if (v === "none" && draft.area === "frame") {
        draft.area = "full";
        areaF.set("full");
      }
      syncFoilFields();
      refresh();
    }, (o) => h("span.frame-chip", { "aria-hidden": "true", dataset: { frame: o.id } }));

    /* Back of the card ---------------------------------------------------- */
    let backTimer = 0;
    const backLogoF = segGroup("backLogo", HC.t("背面 Logo"), HC.BACK_LOGOS, draft.backLogo, (v) => {
      draft.backLogo = v;
      refresh();
      // Show the back for a moment, then turn on round to the front.
      clearTimeout(backTimer);
      card.flip(true);
      backTimer = setTimeout(() => card.flip(false), 1800);
    });

    /* Save -------------------------------------------------------------- */
    const saveBtn = h("button.btn.btn--ink.btn--wide", { type: "submit" }, saveLabel);
    const form = h(
      "form.maker__form",
      { novalidate: true },
      h("div.maker__head", h("h1.maker__title", heading), h("p.maker__lead", HC.t("照片在你的瀏覽器裡處理和儲存。只有按下「分享」的卡片才會上傳。"))),
      lockNote ? h("p.maker__lock", { role: "note" }, lockNote) : null,
      h(
        "fieldset.group",
        h("legend.group__title", HC.t("照片")),
        photoBtn
      ),
      h(
        "fieldset.group",
        h("legend.group__title", HC.t("背景照片")),
        ...bgFields,
        blurF,
        blurNote,
        resetBtn(HC.t("重設背景"), ["zoom", "posX", "posY", "bgBlur"])
      ),
      h(
        "fieldset.group",
        h("legend.group__title", HC.t("背景鐳射")),
        foilF,
        areaF,
        foilTune,
        resetBtn(HC.t("重設鐳射數值"), ["foilStrength", "foilScale", "foilHue"])
      ),
      h(
        "fieldset.group",
        h("legend.group__title", HC.t("前景圖層"), h("span.group__opt", HC.t("選用"))),
        h("p.group__help", HC.t("一張去背的 PNG（例如照片裡的人物），會浮在照片上方，傾斜時前後景分開移動，產生立體感。前景可以有自己的鐳射和位置。")),
        h("div.group__row", fgLabel, autoBtn, fgRemove),
        h("p.group__help", HC.t("「自動摳圖」會用電腦在你的裝置上找出照片裡的主體，照片不會上傳。主體清楚、背景單純的照片效果最好，不保證每張都摳得乾淨。")),
        autoStatus,
        fgControls
      ),
      h(
        "fieldset.group",
        h("legend.group__title", HC.t("文字")),
        titleField,
        subField,
        serialField,
        h("label.check", showText, h("span", HC.t("在卡片上顯示文字")))
      ),
      h("fieldset.group", h("legend.group__title", HC.t("邊框")), frameF, backLogoF),
      h(
        "div.maker__actions",
        saveBtn,
        h("a.btn.btn--quiet", { href: editing ? "#/card/" + editing.id : "#/" }, HC.t("取消"))
      )
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!draft.imageBlob) {
        HC.toast(HC.t("請先選擇一張照片。"), "error");
        photoInput.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        const id = await HC.store.put(Object.assign({}, draft, { title: draft.title.trim() }));
        HC.toast(isEdit ? HC.t("已儲存變更") : mode === "new" ? HC.t("已儲存到展廳") : HC.t("已另存成新卡片"));
        HC.go("#/card/" + id);
      } catch (err) {
        saveBtn.disabled = false;
        HC.toast(HC.t("儲存失敗：瀏覽器的儲存空間可能已滿。請刪除幾張舊卡片再試。"), "error");
      }
    });

    root.appendChild(
      h(
        "div.maker",
        h(
          "div.maker__preview",
          stage,
          h("p.maker__hint", h("span.hint-desk", HC.t("把滑鼠移到預覽上看看效果")), h("span.hint-touch", HC.t("拖曳預覽看看效果")), turnBtn)
        ),
        form
      )
    );
    syncPhoto();
    syncFg();
    refresh();

    return {
      title: heading,
      saveLabel,
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
