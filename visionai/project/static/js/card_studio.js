(() => {
  "use strict";

  const canvas = document.getElementById("cardCanvas");
  if (!canvas) return; // card tab not present
  const ctx = canvas.getContext("2d");

  const typeSelect = document.getElementById("cardTypeSelect");
  const fieldsContainer = document.getElementById("cardFieldsContainer");
  const photoDropzone = document.getElementById("cardPhotoDropzone");
  const photoInput = document.getElementById("cardPhotoInput");
  const photoLabel = document.getElementById("cardPhotoLabel");

  const styleSwatches = document.getElementById("cardStyleSwatches");
  const paletteRow = document.getElementById("cardPaletteRow");
  const layoutSelect = document.getElementById("cardLayoutSelect");
  const sizeSelect = document.getElementById("cardSizeSelect");
  const sizeHint = document.getElementById("cardSizeHint");

  const generateBtn = document.getElementById("cardGenerateBtn");
  const surpriseBtn = document.getElementById("cardSurpriseBtn");
  const remixBtn = document.getElementById("cardRemixBtn");
  const variationsRow = document.getElementById("variationsRow");
  const positionToggle = document.getElementById("cardPositionToggle");
  const positionReset = document.getElementById("cardPositionReset");

  const downloadPngBtn = document.getElementById("cardDownloadPng");
  const downloadJpgBtn = document.getElementById("cardDownloadJpg");
  const animEffectSelect = document.getElementById("cardAnimEffect");
  const animateBtn = document.getElementById("cardAnimateBtn");
  const animStatus = document.getElementById("cardAnimStatus");

  // ---------- persistent field values across type switches ----------
  const fieldsState = {};
  let photoImg = null;

  const state = {
    typeId: "birthday",
    group: "greeting",
    styleKey: "playful",
    layoutKey: "auto",
    paletteIdx: 0,
    seed: Math.floor(Math.random() * 1000),
    sizeKey: "portrait",
    textOffset: { x: 0, y: 0 },
  };

  // ---------- populate type select ----------
  function buildTypeOptions() {
    let html = "";
    for (const [cat, items] of Object.entries(CARD_CATEGORIES)) {
      html += `<optgroup label="${cat}">`;
      items.forEach(t => { html += `<option value="${t.id}" ${t.id === state.typeId ? "selected" : ""}>${t.label}</option>`; });
      html += `</optgroup>`;
    }
    typeSelect.innerHTML = html;
  }
  buildTypeOptions();

  function resolvedLayout() {
    if (state.layoutKey !== "auto") return state.layoutKey;
    const hints = GROUP_LAYOUT_HINTS[state.group] || ["center"];
    return hints[0];
  }

  // ---------- dynamic fields ----------
  function buildFields() {
    const type = CARD_TYPE_INDEX[state.typeId];
    state.group = type.group;
    const fieldNames = FIELD_GROUPS[state.group] || FIELD_GROUPS.custom;

    let html = "";
    fieldNames.forEach(fname => {
      const val = fieldsState[fname] || "";
      const isLong = fname === "message" || fname === "quote";
      html += `<div class="card-field-group">
        <label for="cf_${fname}">${FIELD_LABELS[fname] || fname}</label>
        ${isLong
          ? `<textarea id="cf_${fname}" data-field="${fname}" maxlength="180" placeholder="${FIELD_PLACEHOLDERS[fname] || ""}">${val}</textarea>`
          : `<input type="text" id="cf_${fname}" data-field="${fname}" maxlength="60" placeholder="${FIELD_PLACEHOLDERS[fname] || ""}" value="${val}" />`}
      </div>`;
    });
    fieldsContainer.innerHTML = html;

    fieldsContainer.querySelectorAll("[data-field]").forEach(el => {
      el.addEventListener("input", () => {
        fieldsState[el.dataset.field] = el.value;
        draw();
      });
    });
  }

  typeSelect.addEventListener("change", () => {
    state.typeId = typeSelect.value;
    buildFields();
    if (state.layoutKey === "auto") layoutSelect.value = "auto";
    draw();
  });

  // ---------- style swatches ----------
  function buildStyleSwatches() {
    let html = "";
    Object.entries(STYLE_PRESETS).forEach(([key, s]) => {
      const [c1, c2] = PALETTES[key][0];
      const active = key === state.styleKey ? "active" : "";
      html += `<button type="button" class="${active}" data-value="${key}">
        <span class="swatch" style="background:linear-gradient(135deg,${c1},${c2})"></span>${s.label}
      </button>`;
    });
    styleSwatches.innerHTML = html;
  }
  buildStyleSwatches();

  styleSwatches.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    styleSwatches.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.styleKey = btn.dataset.value;
    state.paletteIdx = 0;
    buildPaletteRow();
    draw();
  });

  // ---------- palette row ----------
  function buildPaletteRow() {
    const palettes = PALETTES[state.styleKey] || PALETTES.modern;
    let html = "";
    palettes.forEach((p, i) => {
      const active = i === state.paletteIdx ? "active" : "";
      html += `<button type="button" class="chip ${active}" data-idx="${i}" style="padding:4px 10px;">
        <span style="display:inline-flex; gap:3px; vertical-align:middle;">
          ${p.map(c => `<span style="width:12px;height:12px;border-radius:50%;background:${c};display:inline-block;"></span>`).join("")}
        </span>
      </button>`;
    });
    paletteRow.innerHTML = html;
  }
  buildPaletteRow();

  paletteRow.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    paletteRow.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.paletteIdx = parseInt(btn.dataset.idx, 10);
    draw();
  });

  // ---------- layout select ----------
  function buildLayoutOptions() {
    let html = `<option value="auto">Auto (smart pick)</option>`;
    Object.entries(LAYOUTS).forEach(([key, l]) => { html += `<option value="${key}">${l.label}</option>`; });
    layoutSelect.innerHTML = html;
  }
  buildLayoutOptions();
  layoutSelect.addEventListener("change", () => { state.layoutKey = layoutSelect.value; draw(); });

  // ---------- size select ----------
  function buildSizeOptions() {
    let html = "";
    Object.entries(SIZE_PRESETS).forEach(([key, sz]) => {
      const sel = key === state.sizeKey ? "selected" : "";
      html += `<option value="${key}" ${sel}>${sz.label} (${sz.w}×${sz.h})</option>`;
    });
    sizeSelect.innerHTML = html;
  }
  buildSizeOptions();
  sizeSelect.addEventListener("change", () => { state.sizeKey = sizeSelect.value; draw(); });

  // ---------- photo ----------
  photoDropzone.addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", e => setPhoto(e.target.files[0]));
  photoDropzone.addEventListener("drop", e => { e.preventDefault(); setPhoto(e.dataTransfer.files[0]); });
  ["dragover", "dragenter"].forEach(evt => photoDropzone.addEventListener(evt, e => { e.preventDefault(); photoDropzone.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach(evt => photoDropzone.addEventListener(evt, e => { e.preventDefault(); photoDropzone.classList.remove("drag-over"); }));

  function setPhoto(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const img = new Image();
    img.onload = () => { photoImg = img; photoLabel.textContent = file.name; draw(); };
    img.src = URL.createObjectURL(file);
  }

  // ---------- draw ----------
  async function ensureFontsLoaded() {
    const families = new Set();
    Object.values(FONT_PAIRS).forEach(p => { families.add(p.heading); families.add(p.body); });
    const jobs = [];
    families.forEach(f => {
      jobs.push(document.fonts.load(`bold 60px ${f}`).catch(() => {}));
      jobs.push(document.fonts.load(`30px ${f}`).catch(() => {}));
    });
    await Promise.all(jobs);
  }

  async function draw(targetCtx, targetCanvas) {
    const useCtx = targetCtx || ctx;
    const useCanvas = targetCanvas || canvas;
    const sz = SIZE_PRESETS[state.sizeKey];
    useCanvas.width = sz.w;
    useCanvas.height = sz.h;
    if (useCanvas === canvas) sizeHint.textContent = `${sz.w} × ${sz.h}`;

    await ensureFontsLoaded();

    renderCard(useCtx, sz.w, sz.h, {
      typeId: state.typeId, group: state.group, styleKey: state.styleKey,
      layoutKey: resolvedLayout(), paletteIdx: state.paletteIdx,
      fields: fieldsState, photoImg, seed: state.seed, textOffset: state.textOffset,
    });
  }

  // ---------- variations ----------
  function computeVariationCombos() {
    const styleHints = (GROUP_STYLE_HINTS[state.group] || Object.keys(STYLE_PRESETS)).slice(0, 4);
    while (styleHints.length < 4) styleHints.push(Object.keys(STYLE_PRESETS)[styleHints.length]);
    const layoutHints = GROUP_LAYOUT_HINTS[state.group] || ["center", "whitespace", "poster", "editorial"];
    return styleHints.map((styleKey, i) => ({
      styleKey,
      layoutKey: layoutHints[i % layoutHints.length],
      paletteIdx: 0,
    }));
  }

  async function renderVariations() {
    const combos = computeVariationCombos();
    variationsRow.innerHTML = "";
    const sz = SIZE_PRESETS[state.sizeKey];
    const thumbW = 220, thumbH = Math.round(220 * (sz.h / sz.w));

    for (const combo of combos) {
      const off = document.createElement("canvas");
      off.width = sz.w; off.height = sz.h;
      const offCtx = off.getContext("2d");
      await ensureFontsLoaded();
      renderCard(offCtx, sz.w, sz.h, {
        typeId: state.typeId, group: state.group, styleKey: combo.styleKey,
        layoutKey: combo.layoutKey, paletteIdx: combo.paletteIdx,
        fields: fieldsState, photoImg, seed: state.seed,
      });

      const thumb = document.createElement("div");
      thumb.className = "variation-thumb";
      const img = document.createElement("img");
      img.src = off.toDataURL("image/jpeg", 0.75);
      thumb.appendChild(img);
      thumb.addEventListener("click", () => {
        state.styleKey = combo.styleKey;
        state.layoutKey = combo.layoutKey;
        state.paletteIdx = combo.paletteIdx;
        buildStyleSwatches();
        buildPaletteRow();
        layoutSelect.value = "auto" === state.layoutKey ? "auto" : combo.layoutKey;
        variationsRow.querySelectorAll(".variation-thumb").forEach(t => t.classList.remove("active"));
        thumb.classList.add("active");
        draw();
      });
      variationsRow.appendChild(thumb);
    }
  }

  // ---------- manual text position (drag) ----------
  let positionDragEnabled = false;
  let dragState = null;

  positionToggle.addEventListener("click", () => {
    positionDragEnabled = !positionDragEnabled;
    positionToggle.classList.toggle("active", positionDragEnabled);
    canvas.classList.toggle("position-drag-mode", positionDragEnabled);
  });
  positionReset.addEventListener("click", () => {
    state.textOffset = { x: 0, y: 0 };
    draw();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (!positionDragEnabled) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    dragState = {
      startClientX: e.clientX, startClientY: e.clientY,
      startOffset: { ...state.textOffset }, scale,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    const dx = (e.clientX - dragState.startClientX) * dragState.scale;
    const dy = (e.clientY - dragState.startClientY) * dragState.scale;
    state.textOffset = { x: dragState.startOffset.x + dx, y: dragState.startOffset.y + dy };
    draw();
  });
  ["pointerup", "pointercancel"].forEach(evt => canvas.addEventListener(evt, () => { dragState = null; }));

  // ---------- generate / surprise / remix ----------
  generateBtn.addEventListener("click", async () => {
    state.seed = Math.floor(Math.random() * 1000);
    await draw();
    await renderVariations();
  });

  surpriseBtn.addEventListener("click", async () => {
    const styleHints = GROUP_STYLE_HINTS[state.group] || Object.keys(STYLE_PRESETS);
    const layoutHints = GROUP_LAYOUT_HINTS[state.group] || Object.keys(LAYOUTS);
    state.styleKey = styleHints[Math.floor(Math.random() * styleHints.length)];
    state.layoutKey = layoutHints[Math.floor(Math.random() * layoutHints.length)];
    const palettes = PALETTES[state.styleKey] || PALETTES.modern;
    state.paletteIdx = Math.floor(Math.random() * palettes.length);
    state.seed = Math.floor(Math.random() * 1000);

    buildStyleSwatches();
    buildPaletteRow();
    layoutSelect.value = state.layoutKey;
    await draw();
    await renderVariations();
  });

  remixBtn.addEventListener("click", async () => {
    const styleHints = (GROUP_STYLE_HINTS[state.group] || Object.keys(STYLE_PRESETS)).filter(s => s !== state.styleKey);
    const layoutHints = (GROUP_LAYOUT_HINTS[state.group] || Object.keys(LAYOUTS)).filter(l => l !== state.layoutKey);
    state.styleKey = styleHints.length ? styleHints[Math.floor(Math.random() * styleHints.length)] : state.styleKey;
    state.layoutKey = layoutHints.length ? layoutHints[Math.floor(Math.random() * layoutHints.length)] : state.layoutKey;
    const palettes = PALETTES[state.styleKey] || PALETTES.modern;
    state.paletteIdx = Math.floor(Math.random() * palettes.length);

    buildStyleSwatches();
    buildPaletteRow();
    layoutSelect.value = state.layoutKey;
    await draw();
  });

  // ---------- export ----------
  function downloadCanvas(mime, filename, quality) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, mime, quality);
  }
  downloadPngBtn.addEventListener("click", () => downloadCanvas("image/png", "card.png"));
  downloadJpgBtn.addEventListener("click", () => downloadCanvas("image/jpeg", "card.jpg", 0.92));

  // ---------- animate & export mp4 ----------
  animateBtn.addEventListener("click", () => {
    canvas.toBlob(async (blob) => {
      const fd = new FormData();
      fd.append("image", blob, "card.png");
      fd.append("effect", animEffectSelect.value);
      fd.append("width", String(canvas.width));
      fd.append("height", String(canvas.height));
      fd.append("duration", "4");

      animStatus.textContent = "Rendering animated video...";
      animateBtn.disabled = true;
      try {
        const res = await fetch("/api/animate_card", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to start render");
        pollAnim(data.job_id);
      } catch (err) {
        animStatus.textContent = "Error: " + (err.message || err);
        animateBtn.disabled = false;
      }
    }, "image/png");
  });

  function pollAnim(jobId) {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data = await res.json();
        if (data.status === "done") {
          clearInterval(timer);
          animStatus.innerHTML = `Ready — <a href="/api/download/${jobId}" download="card_animated.mp4" style="color:var(--gold);">download the video</a>`;
          animateBtn.disabled = false;
        } else if (data.status === "error") {
          clearInterval(timer);
          animStatus.textContent = "Render failed: " + (data.error || "unknown error");
          animateBtn.disabled = false;
        }
      } catch (e) {
        clearInterval(timer);
        animStatus.textContent = "Lost connection.";
        animateBtn.disabled = false;
      }
    }, 1500);
  }

  // ---------- init ----------
  buildFields();
  document.fonts.ready.then(() => { draw(); renderVariations(); });
})();
