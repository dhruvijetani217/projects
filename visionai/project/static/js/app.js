(() => {
  "use strict";

  // ---------- state ----------
  let frames = [];       // { id, file, url, kind, effect, removeBg, trim, keepAudio, thumb }
  let audioFile = null;
  let bgFile = null;
  let dragSrcId = null;
  let selectedFrameId = null;
  let pollTimer = null;
  let logTimer = null;

  let defaultEffect = "fade";
  let selectedFilter = "none";
  let selectedAspect = "vertical";
  let selectedQuality = "hd";
  let selectedTitleStyle = "bold";
  let selectedTitleFont = "poppins_bold";
  let selectedTitleColor = "#ffffff";
  let titleXRatio = 0.5;
  let titleYRatio = 0.15;

  let selectedBgMode = "preset";
  let selectedBgPreset = "birthday";
  let selectedBgColor = "#17181d";

  let activeTemplate = "none";
  let templateEffectCycle = null;
  let templateCycleIndex = 0;

  const TEMPLATE_PRESETS = {
    birthday: { bgPreset: "birthday", titleStyle: "bold", cycle: ["zoom_in", "pulse", "shake_zoom"], label: "🎂 Birthday" },
    anniversary: { bgPreset: "anniversary", titleStyle: "romantic", cycle: ["pan_left", "fade", "in_and_out"], label: "💍 Anniversary" },
    engagement: { bgPreset: "engagement", titleStyle: "elegant", cycle: ["fade", "circle_in", "dissolve"], label: "💎 Engagement" },
    celebration: { bgPreset: "celebration", titleStyle: "neon", cycle: ["shake_zoom", "flare", "wipe_left"], label: "🎉 Celebration" },
    elegant: { bgPreset: "elegant", titleStyle: "elegant", cycle: ["fade", "zoom_out", "dissolve"], label: "✨ Elegant" },
    party: { bgPreset: "party", titleStyle: "bold", cycle: ["pulse", "spin", "slide_bounce"], label: "🎈 Party" },
  };

  // ---------- elements ----------
  const tabSwitch = document.getElementById("tabSwitch");
  const videoTab = document.getElementById("videoTab");
  const cardTab = document.getElementById("cardTab");

  const imageDropzone = document.getElementById("imageDropzone");
  const imageInput = document.getElementById("imageInput");
  const filmstrip = document.getElementById("filmstrip");
  const filmstripEmpty = document.getElementById("filmstripEmpty");
  const frameCount = document.getElementById("frameCount");
  const defaultEffectSelect = document.getElementById("defaultEffectSelect");
  const templateChips = document.getElementById("templateChips");

  const audioDropzone = document.getElementById("audioDropzone");
  const audioInput = document.getElementById("audioInput");
  const audioLabel = document.getElementById("audioLabel");
  const volumeRow = document.getElementById("volumeRow");
  const volumeSlider = document.getElementById("volumeSlider");

  const canvasPreview = document.getElementById("canvasPreview");
  const canvasImg = document.getElementById("canvasImg");
  const canvasVideo = document.getElementById("canvasVideo");
  const canvasEmpty = document.getElementById("canvasEmpty");
  const canvasTitleOverlay = document.getElementById("canvasTitleOverlay");
  const canvasEffectNote = document.getElementById("canvasEffectNote");

  const titleInput = document.getElementById("titleInput");
  const titleExtrasField = document.getElementById("titleExtrasField");
  const titleFontSelect = document.getElementById("titleFontSelect");
  const titleColorInput = document.getElementById("titleColorInput");
  const titleStyleSelect = document.getElementById("titleStyleSelect");

  const filterSwatches = document.getElementById("filterSwatches");
  const aspectSegmented = document.getElementById("aspectSegmented");
  const qualitySegmented = document.getElementById("qualitySegmented");
  const durationSlider = document.getElementById("durationSlider");
  const durationReadout = document.getElementById("durationReadout");

  const bgModeSegmented = document.getElementById("bgModeSegmented");
  const bgPresetSwatches = document.getElementById("bgPresetSwatches");
  const bgDropzone = document.getElementById("bgDropzone");
  const bgInput = document.getElementById("bgInput");
  const bgLabel = document.getElementById("bgLabel");
  const bgColorRow = document.getElementById("bgColorRow");
  const bgColorInput = document.getElementById("bgColorInput");

  const renderBtn = document.getElementById("renderBtn");
  const consoleEl = document.getElementById("console");
  const resultArea = document.getElementById("resultArea");
  const resultVideo = document.getElementById("resultVideo");
  const downloadLink = document.getElementById("downloadLink");
  const topbarStatus = document.getElementById("topbarStatus");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  const ASPECT_RATIO_CSS = { vertical: "9/16", square: "1/1", horizontal: "16/9" };

  // ---------- tabs ----------
  tabSwitch.addEventListener("click", e => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    tabSwitch.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    videoTab.style.display = tab === "video" ? "grid" : "none";
    cardTab.style.display = tab === "card" ? "grid" : "none";
  });

  // ---------- helpers ----------
  function uid() { return Math.random().toString(36).slice(2, 10); }

  function log(msg, cls) {
    const line = document.createElement("div");
    line.className = "console-line" + (cls ? " " + cls : "");
    line.textContent = "> " + msg;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function setStatus(state, text) {
    const dotClass = { idle: "dot-idle", busy: "dot-busy", done: "dot-done", error: "dot-error" }[state] || "dot-idle";
    topbarStatus.innerHTML = `<span class="dot ${dotClass}"></span> ${text}`;
  }

  function buildEffectOptionsHTML(selectedValue) {
    let html = "";
    for (const [category, items] of Object.entries(EFFECT_CATEGORIES)) {
      html += `<optgroup label="${category}">`;
      items.forEach(item => {
        const sel = item.v === selectedValue ? "selected" : "";
        html += `<option value="${item.v}" ${sel}>${item.l}</option>`;
      });
      html += `</optgroup>`;
    }
    return html;
  }

  function previewKindFor(effectValue) {
    for (const items of Object.values(EFFECT_CATEGORIES)) {
      const found = items.find(i => i.v === effectValue);
      if (found) return found.k;
    }
    return "none";
  }

  defaultEffectSelect.innerHTML = buildEffectOptionsHTML(defaultEffect);
  defaultEffectSelect.addEventListener("change", () => { defaultEffect = defaultEffectSelect.value; });

  function updateFrameCount() {
    const dur = parseFloat(durationSlider.value);
    let total = 0;
    frames.forEach(f => { total += f.kind === "video" ? (f.trim || 2) : dur; });
    frameCount.textContent = `${frames.length} item${frames.length === 1 ? "" : "s"} · ${total.toFixed(1)}s`;
  }

  // ---------- video thumbnail capture ----------
  function makeVideoThumb(file) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.src = URL.createObjectURL(file);
      v.muted = true;
      v.playsInline = true;
      v.addEventListener("loadedmetadata", () => {
        v.currentTime = Math.min(0.2, v.duration / 2);
      });
      v.addEventListener("seeked", () => {
        const c = document.createElement("canvas");
        c.width = 160; c.height = 280;
        const ctx = c.getContext("2d");
        try {
          const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
          const w = v.videoWidth * scale, h = v.videoHeight * scale;
          ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
        } catch (e) { /* ignore */ }
        resolve({ thumb: c.toDataURL("image/jpeg", 0.8), duration: v.duration || 4 });
      }, { once: true });
      v.addEventListener("error", () => resolve({ thumb: null, duration: 4 }));
    });
  }

  // ---------- preview ----------
  function updateCanvasPreview() {
    canvasPreview.style.aspectRatio = ASPECT_RATIO_CSS[selectedAspect] || "9/16";
    canvasPreview.className = "canvas-9x16 filter-" + selectedFilter;

    const selected = frames.find(f => f.id === selectedFrameId) || frames[0];
    if (selected && selected.kind === "video") {
      canvasVideo.src = selected.url;
      canvasVideo.style.display = "block";
      canvasImg.style.display = "none";
      canvasEmpty.style.display = "none";
      canvasVideo.play().catch(() => {});
      canvasEffectNote.textContent = `Previewing video clip "${selected.file.name}" — plays as-is, no photo effect applied.`;
    } else if (selected) {
      canvasVideo.pause();
      canvasVideo.style.display = "none";
      canvasImg.src = selected.url;
      canvasImg.style.display = "block";
      canvasEmpty.style.display = "none";
      const kind = previewKindFor(selected.effect);
      canvasPreview.classList.add("preview-" + kind);
      canvasEffectNote.textContent = `Previewing "${EFFECT_LABELS[selected.effect] || selected.effect}" on ${selected.file.name} (approximate). Drag the title to place it.`;
    } else {
      canvasVideo.style.display = "none";
      canvasImg.style.display = "none";
      canvasEmpty.style.display = "flex";
      canvasEffectNote.textContent = "Select a frame in the Bin to preview its effect here.";
    }

    const t = titleInput.value.trim();
    if (t) {
      canvasTitleOverlay.textContent = t;
      canvasTitleOverlay.style.display = "block";
      positionTitleOverlay();
      applyTitleStyleCSS();
    } else {
      canvasTitleOverlay.style.display = "none";
    }
  }

  function positionTitleOverlay() {
    canvasTitleOverlay.style.left = (titleXRatio * 100) + "%";
    canvasTitleOverlay.style.top = (titleYRatio * 100) + "%";
    canvasTitleOverlay.style.transform = "translate(-50%, -50%)";
    canvasTitleOverlay.style.right = "auto";
    canvasTitleOverlay.style.bottom = "auto";
    canvasTitleOverlay.style.width = "auto";
    canvasTitleOverlay.style.textAlign = "center";
  }

  const TITLE_STYLE_CSS = {
    bold: (c) => ({ color: c, textShadow: "0 2px 0 #000, 0 0 8px rgba(0,0,0,0.6)" }),
    elegant: (c) => ({ color: c, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }),
    neon: (c) => ({ color: c, textShadow: `0 0 8px ${c}, 0 0 16px #0d1a12` }),
    minimal: (c) => ({ color: c, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }),
    romantic: (c) => ({ color: c, textShadow: "0 2px 6px #5c1330" }),
  };
  const FONT_CSS_MAP = {
    poppins_bold: "'SProcket Poppins Bold', sans-serif",
    poppins_light: "'SProcket Poppins Light', sans-serif",
    lora: "'SProcket Lora', serif",
    lora_italic: "'SProcket Lora Italic', serif",
    dejavu_sans_bold: "'SProcket DejaVu Sans Bold', sans-serif",
    dejavu_serif: "'SProcket DejaVu Serif', serif",
    liberation_mono_bold: "'SProcket Liberation Mono Bold', monospace",
    free_serif_bold_italic: "'SProcket FreeSerif Bold Italic', serif",
  };
  function applyTitleStyleCSS() {
    const fn = TITLE_STYLE_CSS[selectedTitleStyle] || TITLE_STYLE_CSS.bold;
    Object.assign(canvasTitleOverlay.style, fn(selectedTitleColor));
    canvasTitleOverlay.style.fontFamily = FONT_CSS_MAP[selectedTitleFont] || FONT_CSS_MAP.poppins_bold;
  }

  // ---------- draggable title ----------
  let dragging = false;
  canvasTitleOverlay.addEventListener("pointerdown", (e) => {
    dragging = true;
    canvasTitleOverlay.classList.add("dragging");
    canvasTitleOverlay.setPointerCapture(e.pointerId);
  });
  canvasTitleOverlay.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = canvasPreview.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    titleXRatio = Math.max(0.03, Math.min(0.97, x));
    titleYRatio = Math.max(0.03, Math.min(0.97, y));
    positionTitleOverlay();
  });
  ["pointerup", "pointercancel"].forEach(evt =>
    canvasTitleOverlay.addEventListener(evt, () => { dragging = false; canvasTitleOverlay.classList.remove("dragging"); })
  );

  // ---------- filmstrip ----------
  function renderFilmstrip() {
    filmstrip.querySelectorAll(".frame-row").forEach(el => el.remove());
    filmstripEmpty.style.display = frames.length ? "none" : "block";

    frames.forEach((f, idx) => {
      const row = document.createElement("div");
      row.className = "frame-row" + (f.id === selectedFrameId ? " selected" : "");
      row.draggable = true;
      row.dataset.id = f.id;

      const thumbSrc = f.kind === "video" ? (f.thumb || "") : f.url;
      const badge = f.kind === "video" ? `<span class="frame-type-badge">clip</span><br/>` : "";
      const metaControls = f.kind === "video"
        ? `<p class="frame-trim-readout">${(f.clipStart || 0).toFixed(1)}s – ${((f.clipStart || 0) + (f.trim || 3)).toFixed(1)}s <span class="optional">(${(f.trim || 3).toFixed(1)}s)</span></p>
           <label class="frame-bg-toggle">
             <input type="checkbox" class="frame-keepaudio" ${f.keepAudio ? "checked" : ""} /> Keep original sound
           </label>
           <div class="frame-video-actions">
             <button type="button" class="frame-trim-btn has-value">✂ Trim</button>
             <button type="button" class="frame-crop-btn ${f.crop ? "has-value" : ""}">🖼 Crop</button>
             <button type="button" class="frame-speed-btn ${(f.speedSegments && f.speedSegments.length) ? "has-value" : ""}">⚡ Speed</button>
             <button type="button" class="frame-split-btn">✂ Split</button>
           </div>`
        : `<select class="frame-fx-select">${buildEffectOptionsHTML(f.effect)}</select>
           <div class="frame-trim-row">
             <input type="number" class="frame-duration-input" min="1" max="10" step="0.5" placeholder="auto" value="${f.duration != null ? f.duration.toFixed(1) : ""}" title="Override duration (sec), blank = use global slider" />
             <span>sec (blank = default)</span>
           </div>
           <label class="frame-bg-toggle">
             <input type="checkbox" class="frame-removebg" ${f.removeBg ? "checked" : ""} /> Remove background
           </label>`;

      row.innerHTML = `
        <div class="frame-thumb-wrap">${thumbSrc ? `<img src="${thumbSrc}" alt="">` : ""}</div>
        <div class="frame-meta">
          ${badge}
          <div class="frame-index">F${String(idx + 1).padStart(3, "0")}</div>
          <div class="frame-name">${f.file.name}</div>
          ${metaControls}
        </div>
        <button type="button" class="frame-remove" aria-label="Remove" data-id="${f.id}">×</button>
      `;

      row.addEventListener("click", (e) => {
        if (e.target.closest("select,input,.frame-remove")) return;
        selectedFrameId = f.id;
        renderFilmstrip();
        updateCanvasPreview();
      });

      const fxSelect = row.querySelector(".frame-fx-select");
      if (fxSelect) fxSelect.addEventListener("change", (e) => {
        pushHistory();
        f.effect = e.target.value;
        selectedFrameId = f.id;
        renderFilmstrip();
        updateCanvasPreview();
      });

      const bgToggle = row.querySelector(".frame-removebg");
      if (bgToggle) bgToggle.addEventListener("change", (e) => {
        pushHistory();
        f.removeBg = e.target.checked;
        if (f.removeBg) log(`background removal on for ${f.file.name} (needs rembg on the server)`);
      });

      const durationInput = row.querySelector(".frame-duration-input");
      if (durationInput) durationInput.addEventListener("change", (e) => {
        pushHistory();
        const v = parseFloat(e.target.value);
        f.duration = (e.target.value === "" || isNaN(v)) ? null : Math.max(1, Math.min(10, v));
        updateFrameCount();
      });

      const keepAudio = row.querySelector(".frame-keepaudio");
      if (keepAudio) keepAudio.addEventListener("change", (e) => { pushHistory(); f.keepAudio = e.target.checked; });

      const trimBtn = row.querySelector(".frame-trim-btn");
      if (trimBtn) trimBtn.addEventListener("click", (e) => { e.stopPropagation(); openTrimModal(f); });

      const cropBtn = row.querySelector(".frame-crop-btn");
      if (cropBtn) cropBtn.addEventListener("click", (e) => { e.stopPropagation(); openCropModal(f); });

      const speedBtn = row.querySelector(".frame-speed-btn");
      if (speedBtn) speedBtn.addEventListener("click", (e) => { e.stopPropagation(); openSpeedModal(f); });

      const splitBtn = row.querySelector(".frame-split-btn");
      if (splitBtn) splitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        splitVideoFrame(f);
      });

      row.addEventListener("dragstart", () => { dragSrcId = f.id; row.classList.add("dragging"); });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      row.addEventListener("dragover", e => e.preventDefault());
      row.addEventListener("drop", e => {
        e.preventDefault();
        if (!dragSrcId || dragSrcId === f.id) return;
        pushHistory();
        const srcIdx = frames.findIndex(x => x.id === dragSrcId);
        const dstIdx = frames.findIndex(x => x.id === f.id);
        const [moved] = frames.splice(srcIdx, 1);
        frames.splice(dstIdx, 0, moved);
        renderFilmstrip();
        updateFrameCount();
      });

      filmstrip.appendChild(row);
    });

    filmstrip.querySelectorAll(".frame-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        pushHistory();
        const id = btn.dataset.id;
        frames = frames.filter(f => f.id !== id);
        if (selectedFrameId === id) selectedFrameId = frames.length ? frames[0].id : null;
        renderFilmstrip();
        updateCanvasPreview();
        updateFrameCount();
      });
    });
  }

  function nextTemplateEffect() {
    if (!templateEffectCycle) return defaultEffect;
    const v = templateEffectCycle[templateCycleIndex % templateEffectCycle.length];
    templateCycleIndex++;
    return v;
  }

  async function addFiles(fileList) {
    const list = Array.from(fileList);
    if (list.length) pushHistory();
    for (const file of list) {
      if (/^image\/(png|jpe?g|webp)/.test(file.type)) {
        const f = {
          id: uid(), file, url: URL.createObjectURL(file), kind: "image",
          effect: nextTemplateEffect(), removeBg: false, duration: null,
        };
        frames.push(f);
        if (!selectedFrameId) selectedFrameId = f.id;
        renderFilmstrip(); updateCanvasPreview(); updateFrameCount();
      } else if (/^video\//.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
        const f = {
          id: uid(), file, url: URL.createObjectURL(file), kind: "video",
          clipStart: 0, trim: 3, sourceDuration: null, keepAudio: false, thumb: null, crop: null, speedSegments: [],
        };
        frames.push(f);
        if (!selectedFrameId) selectedFrameId = f.id;
        renderFilmstrip(); updateCanvasPreview(); updateFrameCount();
        makeVideoThumb(file).then(({ thumb, duration }) => {
          f.thumb = thumb;
          f.sourceDuration = duration;
          f.trim = Math.max(0.5, Math.min(6, duration));
          renderFilmstrip();
          updateFrameCount();
        });
      } else {
        log(`skipped unsupported file: ${file.name}`, "console-line-err");
      }
    }
  }

  // ---------- image/video dropzone ----------
  imageDropzone.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", e => addFiles(e.target.files));
  ["dragover", "dragenter"].forEach(evt =>
    imageDropzone.addEventListener(evt, e => { e.preventDefault(); imageDropzone.classList.add("drag-over"); })
  );
  ["dragleave", "drop"].forEach(evt =>
    imageDropzone.addEventListener(evt, e => { e.preventDefault(); imageDropzone.classList.remove("drag-over"); })
  );
  imageDropzone.addEventListener("drop", e => addFiles(e.dataTransfer.files));

  // ---------- audio dropzone ----------
  audioDropzone.addEventListener("click", () => audioInput.click());
  audioInput.addEventListener("change", e => setAudio(e.target.files[0]));
  audioDropzone.addEventListener("drop", e => { e.preventDefault(); setAudio(e.dataTransfer.files[0]); });
  ["dragover", "dragenter"].forEach(evt => audioDropzone.addEventListener(evt, e => { e.preventDefault(); audioDropzone.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach(evt => audioDropzone.addEventListener(evt, e => { e.preventDefault(); audioDropzone.classList.remove("drag-over"); }));

  function setAudio(file) {
    if (!file) return;
    if (!/audio\//.test(file.type) && !/\.(mp3|wav|m4a)$/i.test(file.name)) {
      log("unsupported audio type", "console-line-err");
      return;
    }
    audioFile = file;
    audioLabel.textContent = file.name;
    volumeRow.style.display = "flex";
    log(`music track added: ${file.name} (loops automatically to fill the video)`);
  }

  // ---------- background dropzone ----------
  bgDropzone.addEventListener("click", () => bgInput.click());
  bgInput.addEventListener("change", e => setBgFile(e.target.files[0]));
  bgDropzone.addEventListener("drop", e => { e.preventDefault(); setBgFile(e.dataTransfer.files[0]); });
  ["dragover", "dragenter"].forEach(evt => bgDropzone.addEventListener(evt, e => { e.preventDefault(); bgDropzone.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach(evt => bgDropzone.addEventListener(evt, e => { e.preventDefault(); bgDropzone.classList.remove("drag-over"); }));

  function setBgFile(file) {
    if (!file) return;
    bgFile = file;
    bgLabel.textContent = file.name;
    log(`custom background set: ${file.name}`);
  }

  // ---------- occasion templates (one-click, applies to ALL current + future frames) ----------
  templateChips.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    templateChips.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const key = btn.dataset.value;
    activeTemplate = key;

    if (key === "none") {
      templateEffectCycle = null;
      renderBtn.querySelector(".render-label").textContent = "RENDER VIDEO";
      return;
    }
    const preset = TEMPLATE_PRESETS[key];
    if (!preset) return;

    if (frames.some(f => f.kind === "image")) pushHistory();

    selectedBgMode = "preset";
    selectedBgPreset = preset.bgPreset;
    selectedTitleStyle = preset.titleStyle;
    templateEffectCycle = preset.cycle;
    templateCycleIndex = 0;

    // apply to frames already in the Bin too, so "select template -> upload -> generate" and
    // "upload -> select template -> generate" both work in one click
    frames.filter(f => f.kind === "image").forEach(f => { f.effect = nextTemplateEffect(); });

    bgModeSegmented.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.value === "preset"));
    bgPresetSwatches.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.value === preset.bgPreset));
    titleStyleSelect.value = preset.titleStyle;
    syncBgSectionVisibility();

    renderBtn.querySelector(".render-label").textContent = `GENERATE ${preset.label.replace(/^\S+\s/, "").toUpperCase()} VIDEO`;

    log(`applied "${key}" template — background, title style & motion set for all frames`);
    renderFilmstrip();
    updateCanvasPreview();
  });

  // ---------- title ----------
  titleInput.addEventListener("input", () => {
    const has = titleInput.value.trim().length > 0;
    titleExtrasField.style.display = has ? "block" : "none";
    updateCanvasPreview();
  });
  titleFontSelect.addEventListener("change", () => { selectedTitleFont = titleFontSelect.value; updateCanvasPreview(); });
  titleColorInput.addEventListener("input", () => { selectedTitleColor = titleColorInput.value; updateCanvasPreview(); });
  titleStyleSelect.addEventListener("change", () => { selectedTitleStyle = titleStyleSelect.value; updateCanvasPreview(); });

  // ---------- filter ----------
  filterSwatches.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filterSwatches.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFilter = btn.dataset.value;
    updateCanvasPreview();
  });

  // ---------- aspect / quality ----------
  aspectSegmented.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    aspectSegmented.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedAspect = btn.dataset.value;
    updateCanvasPreview();
  });
  qualitySegmented.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    qualitySegmented.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedQuality = btn.dataset.value;
  });

  // ---------- duration ----------
  durationSlider.addEventListener("input", () => {
    durationReadout.textContent = parseFloat(durationSlider.value).toFixed(1) + "s";
    updateFrameCount();
  });

  // ---------- background section ----------
  function syncBgSectionVisibility() {
    bgPresetSwatches.style.display = selectedBgMode === "preset" ? "flex" : "none";
    bgDropzone.style.display = selectedBgMode === "custom" ? "block" : "none";
    bgColorRow.style.display = selectedBgMode === "solid" ? "flex" : "none";
  }
  bgModeSegmented.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    bgModeSegmented.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedBgMode = btn.dataset.value;
    syncBgSectionVisibility();
  });
  bgPresetSwatches.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    bgPresetSwatches.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedBgPreset = btn.dataset.value;
  });
  bgColorInput.addEventListener("input", () => { selectedBgColor = bgColorInput.value; });
  syncBgSectionVisibility();

  // ---------- render log ticker ----------
  const TICKER_MESSAGES = [
    "compositing frames...", "running background removal...", "baking filter pass...",
    "applying per-frame motion...", "cover-fitting video clips...", "compositing title overlay...",
    "muxing audio track...", "encoding h.264 stream...", "writing output file...",
  ];
  function startTicker() {
    let i = 0;
    logTimer = setInterval(() => { log(TICKER_MESSAGES[i % TICKER_MESSAGES.length], "console-line-busy"); i++; }, 2200);
  }
  function stopTicker() { clearInterval(logTimer); logTimer = null; }

  // ---------- generate ----------
  renderBtn.addEventListener("click", async () => {
    if (frames.length === 0) {
      log("add at least one photo or video clip before rendering", "console-line-err");
      return;
    }

    renderBtn.disabled = true;
    renderBtn.classList.add("busy");
    const originalLabel = renderBtn.querySelector(".render-label").textContent;
    renderBtn.querySelector(".render-label").textContent = "RENDERING…";
    resultArea.classList.remove("show");
    setStatus("busy", "RENDERING");
    log(`queued render — ${frames.length} item(s), filter=${selectedFilter}`);
    startTicker();

    const fd = new FormData();
    frames.forEach(f => {
      fd.append("media", f.file, f.file.name);
      fd.append("kinds", f.kind);
      fd.append("effects", f.kind === "image" ? f.effect : "");
      fd.append("remove_bg", f.kind === "image" && f.removeBg ? "1" : "0");
      fd.append("trims", f.kind === "video" ? String(f.trim || 3) : "");
      fd.append("keep_audio", f.kind === "video" && f.keepAudio ? "1" : "0");
      fd.append("crops", f.kind === "video" && f.crop ? JSON.stringify(f.crop) : "");
      fd.append("speed_segments", f.kind === "video" && f.speedSegments && f.speedSegments.length ? JSON.stringify(f.speedSegments) : "");
    });
    if (audioFile) fd.append("audio", audioFile, audioFile.name);
    if (bgFile) fd.append("custom_background", bgFile, bgFile.name);

    fd.append("title", titleInput.value.trim());
    fd.append("title_style", selectedTitleStyle);
    fd.append("title_font", selectedTitleFont);
    fd.append("title_color", selectedTitleColor);
    fd.append("title_x", String(titleXRatio));
    fd.append("title_y", String(titleYRatio));
    fd.append("filter", selectedFilter);
    fd.append("duration", durationSlider.value);
    fd.append("music_volume", volumeSlider.value);
    fd.append("aspect", selectedAspect);
    fd.append("quality", selectedQuality);
    fd.append("bg_mode", selectedBgMode);
    fd.append("bg_preset", selectedBgPreset);
    fd.append("bg_color", selectedBgColor);

    try {
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      log(`job accepted — id ${data.job_id}`);
      pollStatus(data.job_id, originalLabel);
    } catch (err) {
      stopTicker();
      log(String(err.message || err), "console-line-err");
      resetRenderBtn(originalLabel);
      setStatus("error", "FAILED");
    }
  });

  function pollStatus(jobId, originalLabel) {
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data = await res.json();
        if (data.status === "done") {
          clearInterval(pollTimer);
          stopTicker();
          log("render complete", "console-line-ok");
          setStatus("done", "DONE");
          resultVideo.src = `/api/preview/${jobId}`;
          downloadLink.href = `/api/download/${jobId}`;
          resultArea.classList.add("show");
          resetRenderBtn(originalLabel);
        } else if (data.status === "error") {
          clearInterval(pollTimer);
          stopTicker();
          log("render failed: " + (data.error || "unknown error"), "console-line-err");
          setStatus("error", "FAILED");
          resetRenderBtn(originalLabel);
        }
      } catch (err) {
        clearInterval(pollTimer);
        stopTicker();
        log("lost connection to server", "console-line-err");
        setStatus("error", "FAILED");
        resetRenderBtn(originalLabel);
      }
    }, 1600);
  }

  function resetRenderBtn(label) {
    renderBtn.disabled = false;
    renderBtn.classList.remove("busy");
    renderBtn.querySelector(".render-label").textContent = label;
  }

  // ==================== SPLIT ====================
  function splitVideoFrame(f) {
    const idx = frames.findIndex(x => x.id === f.id);
    if (idx === -1) return;
    const totalDur = f.trim || 3;
    if (totalDur < 1) { log("clip too short to split", "console-line-err"); return; }
    const splitAt = totalDur / 2;

    pushHistory();

    const partA = { ...f, id: uid(), trim: splitAt, crop: f.crop ? { ...f.crop } : null, speedSegments: [] };
    const partB = {
      ...f, id: uid(), clipStart: (f.clipStart || 0) + splitAt, trim: totalDur - splitAt,
      crop: f.crop ? { ...f.crop } : null, speedSegments: [],
    };
    frames.splice(idx, 1, partA, partB);
    selectedFrameId = partA.id;
    renderFilmstrip();
    updateCanvasPreview();
    updateFrameCount();
    log(`split "${f.file.name}" into two clips at ${splitAt.toFixed(1)}s`);
  }

  // ==================== UNDO / REDO ====================
  let historyStack = [];
  let redoStack = [];
  const MAX_HISTORY = 50;

  function cloneFrames(arr) {
    return arr.map(f => ({
      ...f,
      crop: f.crop ? { ...f.crop } : null,
      speedSegments: (f.speedSegments || []).map(s => ({ ...s })),
    }));
  }

  function pushHistory() {
    historyStack.push(cloneFrames(frames));
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    undoBtn.disabled = historyStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function undo() {
    if (!historyStack.length) return;
    redoStack.push(cloneFrames(frames));
    frames = historyStack.pop();
    if (!frames.find(f => f.id === selectedFrameId)) selectedFrameId = frames.length ? frames[0].id : null;
    renderFilmstrip();
    updateCanvasPreview();
    updateFrameCount();
    updateUndoRedoButtons();
    log("undo");
  }

  function redo() {
    if (!redoStack.length) return;
    historyStack.push(cloneFrames(frames));
    frames = redoStack.pop();
    if (!frames.find(f => f.id === selectedFrameId)) selectedFrameId = frames.length ? frames[0].id : null;
    renderFilmstrip();
    updateCanvasPreview();
    updateFrameCount();
    updateUndoRedoButtons();
    log("redo");
  }

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  // ==================== TRIM MODAL (filmstrip) ====================
  const trimModalBackdrop = document.getElementById("trimModalBackdrop");
  const trimModalClose = document.getElementById("trimModalClose");
  const trimStage = document.getElementById("trimStage");
  const trimFilmstrip = document.getElementById("trimFilmstrip");
  const trimRange = document.getElementById("trimRange");
  const trimReadout = document.getElementById("trimReadout");
  const trimResetBtn = document.getElementById("trimResetBtn");
  const trimSaveBtn = document.getElementById("trimSaveBtn");

  let trimTargetFrame = null;
  let trimSourceDuration = 0;
  let trimDrag = null;

  function setTrimRangePct(leftPct, rightPct) {
    trimRange.style.left = (leftPct * 100) + "%";
    trimRange.style.right = ((1 - rightPct) * 100) + "%";
    updateTrimReadout(leftPct, rightPct);
  }

  function updateTrimReadout(leftPct, rightPct) {
    const start = leftPct * trimSourceDuration;
    const end = rightPct * trimSourceDuration;
    trimReadout.textContent = `${start.toFixed(1)}s – ${end.toFixed(1)}s (${(end - start).toFixed(1)}s of ${trimSourceDuration.toFixed(1)}s)`;
  }

  function getTrimRangePct() {
    const stageRect = trimStage.getBoundingClientRect();
    const rangeRect = trimRange.getBoundingClientRect();
    return {
      left: Math.max(0, (rangeRect.left - stageRect.left) / stageRect.width),
      right: Math.min(1, (rangeRect.right - stageRect.left) / stageRect.width),
    };
  }

  async function openTrimModal(f) {
    trimTargetFrame = f;
    trimFilmstrip.innerHTML = "";
    trimReadout.textContent = "Loading filmstrip...";
    trimModalBackdrop.style.display = "flex";

    const v = document.createElement("video");
    v.src = f.url;
    v.muted = true;
    await new Promise(resolve => {
      v.addEventListener("loadedmetadata", resolve, { once: true });
    });
    const duration = f.sourceDuration || v.duration || 6;
    trimSourceDuration = duration;
    f.sourceDuration = duration;

    const FRAME_COUNT = 12;
    const c = document.createElement("canvas");
    const cctx = c.getContext("2d");

    for (let i = 0; i < FRAME_COUNT; i++) {
      const t = (i / (FRAME_COUNT - 1)) * Math.max(0.01, duration - 0.05);
      await new Promise(resolve => {
        v.currentTime = t;
        v.addEventListener("seeked", function onSeek() {
          v.removeEventListener("seeked", onSeek);
          c.width = 120; c.height = 200;
          const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
          const w = v.videoWidth * scale, h = v.videoHeight * scale;
          cctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
          const img = document.createElement("img");
          img.src = c.toDataURL("image/jpeg", 0.7);
          trimFilmstrip.appendChild(img);
          resolve();
        }, { once: true });
      });
    }

    const leftPct = Math.max(0, Math.min(1, (f.clipStart || 0) / duration));
    const rightPct = Math.max(leftPct + 0.05, Math.min(1, ((f.clipStart || 0) + (f.trim || 3)) / duration));
    setTrimRangePct(leftPct, rightPct);
  }

  function closeTrimModal() { trimModalBackdrop.style.display = "none"; trimTargetFrame = null; }
  trimModalClose.addEventListener("click", closeTrimModal);
  trimModalBackdrop.addEventListener("click", (e) => { if (e.target === trimModalBackdrop) closeTrimModal(); });

  trimResetBtn.addEventListener("click", () => setTrimRangePct(0, 1));

  trimSaveBtn.addEventListener("click", () => {
    if (!trimTargetFrame) return;
    pushHistory();
    const { left, right } = getTrimRangePct();
    trimTargetFrame.clipStart = left * trimSourceDuration;
    trimTargetFrame.trim = Math.max(0.3, (right - left) * trimSourceDuration);
    log(`trim saved for ${trimTargetFrame.file.name}: ${trimTargetFrame.clipStart.toFixed(1)}s \u2013 ${(trimTargetFrame.clipStart + trimTargetFrame.trim).toFixed(1)}s`);
    closeTrimModal();
    renderFilmstrip();
    updateFrameCount();
  });

  trimRange.addEventListener("pointerdown", (e) => {
    const handle = e.target.dataset.handle;
    const stageRect = trimStage.getBoundingClientRect();
    trimDrag = {
      mode: handle || "move",
      startClientX: e.clientX,
      startPct: getTrimRangePct(),
      stageRect,
    };
    trimRange.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  trimRange.addEventListener("pointermove", (e) => {
    if (!trimDrag) return;
    const dxPct = (e.clientX - trimDrag.startClientX) / trimDrag.stageRect.width;
    let { left, right } = trimDrag.startPct;
    const minGap = 0.03;

    if (trimDrag.mode === "move") {
      const w = right - left;
      left = Math.max(0, Math.min(1 - w, left + dxPct));
      right = left + w;
    } else if (trimDrag.mode === "left") {
      left = Math.max(0, Math.min(right - minGap, left + dxPct));
    } else if (trimDrag.mode === "right") {
      right = Math.min(1, Math.max(left + minGap, right + dxPct));
    }
    setTrimRangePct(left, right);
  });

  ["pointerup", "pointercancel"].forEach(evt => trimRange.addEventListener(evt, () => { trimDrag = null; }));

  // ==================== CROP MODAL ====================
  const cropModalBackdrop = document.getElementById("cropModalBackdrop");
  const cropModalClose = document.getElementById("cropModalClose");
  const cropStage = document.getElementById("cropStage");
  const cropSourceCanvas = document.getElementById("cropSourceCanvas");
  const cropBox = document.getElementById("cropBox");
  const cropResetBtn = document.getElementById("cropResetBtn");
  const cropSaveBtn = document.getElementById("cropSaveBtn");

  let cropTargetFrame = null;
  let cropDrag = null; // { mode: 'move'|'nw'|'ne'|'sw'|'se', startX, startY, startBox }

  function setCropBoxPct(x1, y1, x2, y2) {
    cropBox.style.left = (x1 * 100) + "%";
    cropBox.style.top = (y1 * 100) + "%";
    cropBox.style.width = ((x2 - x1) * 100) + "%";
    cropBox.style.height = ((y2 - y1) * 100) + "%";
  }

  function getCropBoxPct() {
    const stageRect = cropStage.getBoundingClientRect();
    const boxRect = cropBox.getBoundingClientRect();
    return {
      x1: (boxRect.left - stageRect.left) / stageRect.width,
      y1: (boxRect.top - stageRect.top) / stageRect.height,
      x2: (boxRect.right - stageRect.left) / stageRect.width,
      y2: (boxRect.bottom - stageRect.top) / stageRect.height,
    };
  }

  function openCropModal(f) {
    cropTargetFrame = f;
    const v = document.createElement("video");
    v.src = f.url;
    v.muted = true;
    v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(0.3, v.duration / 2); });
    v.addEventListener("seeked", () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / v.videoWidth);
      cropSourceCanvas.width = v.videoWidth * scale;
      cropSourceCanvas.height = v.videoHeight * scale;
      const sctx = cropSourceCanvas.getContext("2d");
      sctx.drawImage(v, 0, 0, cropSourceCanvas.width, cropSourceCanvas.height);

      const c = f.crop || { x1: 0.06, y1: 0.06, x2: 0.94, y2: 0.94 };
      setCropBoxPct(c.x1, c.y1, c.x2, c.y2);
      cropModalBackdrop.style.display = "flex";
    }, { once: true });
  }

  function closeCropModal() { cropModalBackdrop.style.display = "none"; cropTargetFrame = null; }
  cropModalClose.addEventListener("click", closeCropModal);
  cropModalBackdrop.addEventListener("click", (e) => { if (e.target === cropModalBackdrop) closeCropModal(); });

  cropResetBtn.addEventListener("click", () => setCropBoxPct(0.02, 0.02, 0.98, 0.98));

  cropSaveBtn.addEventListener("click", () => {
    if (!cropTargetFrame) return;
    pushHistory();
    cropTargetFrame.crop = getCropBoxPct();
    log(`crop saved for ${cropTargetFrame.file.name}`);
    closeCropModal();
    renderFilmstrip();
  });

  cropBox.addEventListener("pointerdown", (e) => {
    const handle = e.target.dataset.handle;
    const stageRect = cropStage.getBoundingClientRect();
    cropDrag = {
      mode: handle || "move",
      startClientX: e.clientX, startClientY: e.clientY,
      startBox: getCropBoxPct(), stageRect,
    };
    cropBox.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  cropBox.addEventListener("pointermove", (e) => {
    if (!cropDrag) return;
    const dxPct = (e.clientX - cropDrag.startClientX) / cropDrag.stageRect.width;
    const dyPct = (e.clientY - cropDrag.startClientY) / cropDrag.stageRect.height;
    let { x1, y1, x2, y2 } = cropDrag.startBox;
    const minSize = 0.08;

    if (cropDrag.mode === "move") {
      const w = x2 - x1, h = y2 - y1;
      x1 = Math.max(0, Math.min(1 - w, x1 + dxPct));
      y1 = Math.max(0, Math.min(1 - h, y1 + dyPct));
      x2 = x1 + w; y2 = y1 + h;
    } else if (cropDrag.mode === "nw") {
      x1 = Math.max(0, Math.min(x2 - minSize, x1 + dxPct));
      y1 = Math.max(0, Math.min(y2 - minSize, y1 + dyPct));
    } else if (cropDrag.mode === "ne") {
      x2 = Math.min(1, Math.max(x1 + minSize, x2 + dxPct));
      y1 = Math.max(0, Math.min(y2 - minSize, y1 + dyPct));
    } else if (cropDrag.mode === "sw") {
      x1 = Math.max(0, Math.min(x2 - minSize, x1 + dxPct));
      y2 = Math.min(1, Math.max(y1 + minSize, y2 + dyPct));
    } else if (cropDrag.mode === "se") {
      x2 = Math.min(1, Math.max(x1 + minSize, x2 + dxPct));
      y2 = Math.min(1, Math.max(y1 + minSize, y2 + dyPct));
    }
    setCropBoxPct(x1, y1, x2, y2);
  });

  ["pointerup", "pointercancel"].forEach(evt => cropBox.addEventListener(evt, () => { cropDrag = null; }));

  // ==================== SPEED MODAL ====================
  const speedModalBackdrop = document.getElementById("speedModalBackdrop");
  const speedModalClose = document.getElementById("speedModalClose");
  const speedSegmentsList = document.getElementById("speedSegmentsList");
  const speedAddSegmentBtn = document.getElementById("speedAddSegmentBtn");
  const speedResetBtn = document.getElementById("speedResetBtn");
  const speedSaveBtn = document.getElementById("speedSaveBtn");

  let speedTargetFrame = null;
  let speedWorkingSegments = [];

  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

  function renderSpeedSegmentsList() {
    speedSegmentsList.innerHTML = "";
    speedWorkingSegments.forEach((seg, i) => {
      const row = document.createElement("div");
      row.className = "speed-segment-row";
      row.innerHTML = `
        <input type="number" class="seg-start" min="0" step="0.1" value="${seg.start}" /> <span>to</span>
        <input type="number" class="seg-end" min="0" step="0.1" value="${seg.end}" /> <span>sec at</span>
        <select class="seg-factor">
          ${SPEED_OPTIONS.map(v => `<option value="${v}" ${v === seg.factor ? "selected" : ""}>${v}x${v < 1 ? " (slow)" : v > 1 ? " (fast)" : ""}</option>`).join("")}
        </select>
        <button type="button" class="frame-remove" data-i="${i}">×</button>
      `;
      row.querySelector(".seg-start").addEventListener("input", e => { seg.start = parseFloat(e.target.value) || 0; });
      row.querySelector(".seg-end").addEventListener("input", e => { seg.end = parseFloat(e.target.value) || 0; });
      row.querySelector(".seg-factor").addEventListener("change", e => { seg.factor = parseFloat(e.target.value); });
      row.querySelector(".frame-remove").addEventListener("click", () => {
        speedWorkingSegments.splice(i, 1);
        renderSpeedSegmentsList();
      });
      speedSegmentsList.appendChild(row);
    });
    if (speedWorkingSegments.length === 0) {
      speedSegmentsList.innerHTML = `<p class="field-note">No portions yet — the whole clip plays at normal speed.</p>`;
    }
  }

  function openSpeedModal(f) {
    speedTargetFrame = f;
    speedWorkingSegments = (f.speedSegments || []).map(s => ({ ...s }));
    renderSpeedSegmentsList();
    speedModalBackdrop.style.display = "flex";
  }
  function closeSpeedModal() { speedModalBackdrop.style.display = "none"; speedTargetFrame = null; }
  speedModalClose.addEventListener("click", closeSpeedModal);
  speedModalBackdrop.addEventListener("click", (e) => { if (e.target === speedModalBackdrop) closeSpeedModal(); });

  speedAddSegmentBtn.addEventListener("click", () => {
    const trim = (speedTargetFrame && speedTargetFrame.trim) || 3;
    const lastEnd = speedWorkingSegments.length ? speedWorkingSegments[speedWorkingSegments.length - 1].end : 0;
    speedWorkingSegments.push({ start: lastEnd, end: Math.min(trim, lastEnd + 1), factor: 2 });
    renderSpeedSegmentsList();
  });

  speedResetBtn.addEventListener("click", () => { speedWorkingSegments = []; renderSpeedSegmentsList(); });

  speedSaveBtn.addEventListener("click", () => {
    if (!speedTargetFrame) return;
    pushHistory();
    speedTargetFrame.speedSegments = speedWorkingSegments.filter(s => s.end > s.start);
    log(`speed plan saved for ${speedTargetFrame.file.name} (${speedTargetFrame.speedSegments.length} portion${speedTargetFrame.speedSegments.length === 1 ? "" : "s"})`);
    closeSpeedModal();
    renderFilmstrip();
  });

  // ---------- init ----------
  positionTitleOverlay();
  updateCanvasPreview();
  updateFrameCount();
})();
