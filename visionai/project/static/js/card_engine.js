// ============================================================
// CARD STUDIO — rendering engine
// Pure-ish functions: render(ctx, w, h, state) draws one full card.
// Nothing here touches the DOM except reading an already-loaded photo Image.
// ============================================================

function resolveContent(typeId, group, fields) {
  const typeLabel = (CARD_TYPE_INDEX[typeId] && CARD_TYPE_INDEX[typeId].label) || "Card";
  const eyebrowByGroup = {
    greeting: "— A LITTLE NOTE FOR YOU —",
    event: "— YOU'RE INVITED —",
    promo: "— LIMITED TIME —",
    quote: "",
    social: typeLabel.toUpperCase(),
    seasonal: "— WARM WISHES —",
    announcement: "— ANNOUNCEMENT —",
    custom: "",
  };

  const heading = fields.title || fields.product || fields.quote || typeLabel;
  const sub = fields.name || fields.author || "";
  const body = fields.message || "";
  const meta = [fields.date, fields.time, fields.location, fields.website, fields.phone].filter(Boolean);
  const badge = fields.discount || fields.price || "";
  const ctaText = fields.cta || "";

  return {
    eyebrow: eyebrowByGroup[group] || "",
    heading, sub, body, meta, badge, ctaText,
    isQuote: group === "quote",
  };
}

// ---------------------------------------------------------- text helpers ---

function wrapLines(ctx, text, maxWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach(word => {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx, text, fontFamily, weight, maxWidth, maxHeight, maxFontSize, minFontSize) {
  let fontSize = maxFontSize;
  let lines = [], lineHeight = 0;
  while (fontSize >= minFontSize) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    lines = wrapLines(ctx, text, maxWidth);
    lineHeight = fontSize * 1.22;
    if (lines.length * lineHeight <= maxHeight) break;
    fontSize -= 2;
  }
  return { fontSize, lines, lineHeight };
}

function drawLines(ctx, lines, x, y, lineHeight, align) {
  ctx.textAlign = align;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

// ------------------------------------------------------------ background ---

function seededRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function hexAlpha(hex, alpha) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawBackground(ctx, w, h, style, palette) {
  const [c1, c2, c3] = palette;
  ctx.clearRect(0, 0, w, h);

  if (style.backgroundType === "solid") {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
  } else if (style.backgroundType === "radial") {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, c2);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (style.backgroundType === "pattern") {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hexAlpha(c3, 0.08);
    ctx.lineWidth = 1;
    for (let x = -h; x < w + h; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// -------------------------------------------------------------- decor fx ---

function drawStar(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    const midAng = ang + Math.PI / 4;
    ctx.lineTo(cx + Math.cos(midAng) * r * 0.28, cy + Math.sin(midAng) * r * 0.28);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDecor(ctx, kind, w, h, palette, seed) {
  const rng = seededRng(seed || 7);
  const [c1, c2, c3] = palette;

  if (kind === "geometric") {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = c3;
    ctx.beginPath(); ctx.arc(w * 0.88, h * 0.1, w * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.10;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * 0.28, h); ctx.lineTo(0, h * 0.7); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (kind === "frame") {
    ctx.save();
    ctx.strokeStyle = hexAlpha(c2, 0.8);
    ctx.lineWidth = 2;
    const m = w * 0.045;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.lineWidth = 1;
    ctx.strokeRect(m + 10, m + 10, w - (m + 10) * 2, h - (m + 10) * 2);
    const cornerSize = w * 0.03;
    [[m, m], [w - m, m], [m, h - m], [w - m, h - m]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, cornerSize * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = c2;
      ctx.fill();
    });
    ctx.restore();
  } else if (kind === "shapes") {
    ctx.save();
    ctx.fillStyle = hexAlpha(c3, 0.9);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w * 0.4, 0); ctx.lineTo(0, h * 0.28); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexAlpha(c2, 0.55);
    ctx.beginPath();
    ctx.moveTo(w, h); ctx.lineTo(w * 0.6, h); ctx.lineTo(w, h * 0.72); ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (kind === "confetti") {
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const x = rng() * w, y = rng() * h * 0.4;
      const size = 6 + rng() * 12;
      const color = [c1, c2, c3][Math.floor(rng() * 3)];
      ctx.fillStyle = hexAlpha(color, 0.75);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      if (rng() > 0.5) ctx.fillRect(-size / 2, -size / 4, size, size / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, size / 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  } else if (kind === "floral") {
    ctx.save();
    ctx.globalAlpha = 0.5;
    [[w * 0.1, h * 0.12], [w * 0.9, h * 0.9]].forEach(([cx, cy]) => {
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(ang) * 20, cy + Math.sin(ang) * 20, 16, 9, ang, 0, Math.PI * 2);
        ctx.fillStyle = hexAlpha(c2, 0.5);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fillStyle = c3; ctx.fill();
    });
    ctx.restore();
  } else if (kind === "sparkle") {
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const x = rng() * w, y = rng() * h;
      const s = 4 + rng() * 8;
      ctx.fillStyle = hexAlpha(c2, 0.85);
      drawStar(ctx, x, y, s);
    }
    ctx.restore();
  } else if (kind === "blob") {
    ctx.save();
    try { ctx.filter = "blur(40px)"; } catch (e) {}
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.ellipse(w * 0.2, h * 0.15, w * 0.28, w * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c3;
    ctx.beginPath(); ctx.ellipse(w * 0.85, h * 0.85, w * 0.24, w * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawAccent(ctx, kind, x, y, width, palette) {
  const c2 = palette[1];
  if (kind === "line") {
    ctx.strokeStyle = hexAlpha(c2, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - width / 2, y); ctx.lineTo(x + width / 2, y); ctx.stroke();
  } else if (kind === "gold-line") {
    ctx.strokeStyle = c2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - width / 2, y); ctx.lineTo(x + width / 2, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill();
  } else if (kind === "block") {
    ctx.fillStyle = c2;
    ctx.fillRect(x - width / 2, y - 3, width, 6);
  } else if (kind === "glow") {
    ctx.save();
    try { ctx.shadowBlur = 20; ctx.shadowColor = c2; } catch (e) {}
    ctx.strokeStyle = c2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - width / 2, y); ctx.lineTo(x + width / 2, y); ctx.stroke();
    ctx.restore();
  }
}

// -------------------------------------------------------- photo placement ---

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPhotoCover(ctx, img, x, y, w, h, radius) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  const iw = img.width, ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// ------------------------------------------------------------- CTA / badge --

function drawBadge(ctx, text, cx, cy, palette, fontFamily) {
  if (!text) return 0;
  ctx.font = `bold 30px ${fontFamily}`;
  const tw = ctx.measureText(text).width;
  const padX = 26;
  const bw = tw + padX * 2, bh = 60;
  roundRectPath(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = palette[1];
  ctx.fill();
  ctx.fillStyle = "#15131a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 2);
  ctx.textBaseline = "alphabetic";
  return bh;
}

function drawCtaAndBadge(ctx, w, h, cx, y, content, fonts, palette, align) {
  if (content.ctaText) {
    ctx.font = `bold 30px ${fonts.body}`;
    const tw = ctx.measureText(content.ctaText).width;
    const bw = tw + 64, bh = 62;
    const bx = align === "left" ? cx : cx - bw / 2;
    roundRectPath(ctx, bx, y - bh / 2, bw, bh, bh / 2);
    ctx.fillStyle = palette[1];
    ctx.fill();
    ctx.fillStyle = "#15131a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(content.ctaText, bx + bw / 2, y + 2);
    ctx.textBaseline = "alphabetic";
  } else if (content.badge) {
    drawBadge(ctx, content.badge, cx, y, palette, fonts.body);
  }
}

// -------------------------------------------------------------- layouts ---

function pickTextColor(palette) {
  const c = palette[0].replace("#", "");
  const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#15131a" : "#F7F5F0";
}

function drawHeadingBlock(ctx, x, y, maxWidth, align, content, fonts, textColor, palette, style, maxHeadingSize) {
  let cursorY = y;

  if (content.eyebrow) {
    ctx.font = `26px ${fonts.body}`;
    ctx.fillStyle = hexAlpha(textColor, 0.75);
    ctx.textAlign = align;
    ctx.fillText(content.eyebrow, x, cursorY);
    cursorY += 44;
  }

  const headingPrefix = content.isQuote ? "\u201C" : "";
  const headingSuffix = content.isQuote ? "\u201D" : "";
  const fit = fitText(ctx, headingPrefix + content.heading + headingSuffix, fonts.heading, "bold", maxWidth, maxHeadingSize * 3.2, maxHeadingSize, 34);
  ctx.font = `bold ${fit.fontSize}px ${fonts.heading}`;
  ctx.fillStyle = textColor;
  cursorY += fit.fontSize * 0.9;
  cursorY += drawLines(ctx, fit.lines, x, cursorY, fit.lineHeight, align) - fit.lineHeight + fit.fontSize * 0.35;

  drawAccent(ctx, style.accent, x, cursorY + 14, Math.min(140, maxWidth * 0.35), palette);
  cursorY += 40;

  if (content.sub) {
    ctx.font = `32px ${fonts.body}`;
    ctx.fillStyle = hexAlpha(textColor, 0.92);
    ctx.textAlign = align;
    ctx.fillText(content.sub, x, cursorY);
    cursorY += 46;
  }

  return cursorY;
}

function drawBodyAndMeta(ctx, x, y, maxWidth, align, content, fonts, textColor) {
  let cursorY = y;
  if (content.body) {
    const fit = fitText(ctx, content.body, fonts.body, "", maxWidth, 220, 30, 18);
    ctx.font = `${fit.fontSize}px ${fonts.body}`;
    ctx.fillStyle = hexAlpha(textColor, 0.9);
    cursorY += fit.fontSize;
    cursorY += drawLines(ctx, fit.lines, x, cursorY, fit.lineHeight, align);
    cursorY += 16;
  }
  if (content.meta.length) {
    ctx.font = `24px ${fonts.body}`;
    ctx.fillStyle = hexAlpha(textColor, 0.8);
    ctx.textAlign = align;
    content.meta.forEach(m => { cursorY += 34; ctx.fillText(m, x, cursorY); });
  }
  return cursorY;
}

const LAYOUT_FUNCS = {
  center(ctx, w, h, s) {
    const { content, photoImg, palette, fonts, style, textColor } = s;
    const cx = w / 2;
    let y = h * 0.14;
    if (photoImg) {
      const size = w * 0.36;
      drawPhotoCover(ctx, photoImg, cx - size / 2, y, size, size, size / 2);
      y += size + 60;
    } else {
      y += 40;
    }
    y = drawHeadingBlock(ctx, cx, y, w * 0.8, "center", content, fonts, textColor, palette, style, w * 0.09);
    y = drawBodyAndMeta(ctx, cx, y, w * 0.72, "center", content, fonts, textColor);
    drawCtaAndBadge(ctx, w, h, cx, h * 0.9, content, fonts, palette);
  },

  whitespace(ctx, w, h, s) {
    const { content, palette, fonts, style, textColor } = s;
    const cx = w / 2;
    let y = h * 0.38;
    y = drawHeadingBlock(ctx, cx, y, w * 0.62, "center", content, fonts, textColor, palette, style, w * 0.075);
    drawBodyAndMeta(ctx, cx, y, w * 0.55, "center", content, fonts, textColor);
  },

  split(ctx, w, h, s) {
    const { content, photoImg, palette, fonts, style, textColor } = s;
    const half = w * 0.46;
    if (photoImg) {
      drawPhotoCover(ctx, photoImg, 0, 0, half, h, 0);
      ctx.fillStyle = hexAlpha(palette[0], 0.18);
      ctx.fillRect(0, 0, half, h);
    } else {
      ctx.fillStyle = hexAlpha(palette[1], 0.22);
      ctx.fillRect(0, 0, half, h);
    }
    const x = half + (w - half) * 0.12;
    let y = h * 0.28;
    y = drawHeadingBlock(ctx, x, y, w - half - 90, "left", content, fonts, textColor, palette, style, w * 0.075);
    y = drawBodyAndMeta(ctx, x, y, w - half - 90, "left", content, fonts, textColor);
    drawCtaAndBadge(ctx, w, h, x, h * 0.88, content, fonts, palette, "left");
  },

  fullbleed(ctx, w, h, s) {
    const { content, photoImg, palette, fonts, style } = s;
    if (photoImg) {
      drawPhotoCover(ctx, photoImg, 0, 0, w, h, 0);
    } else {
      drawBackground(ctx, w, h, style, palette);
    }
    const scrim = ctx.createLinearGradient(0, h * 0.35, 0, h);
    scrim.addColorStop(0, "rgba(0,0,0,0)");
    scrim.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    let y = h * 0.68;
    y = drawHeadingBlock(ctx, cx, y, w * 0.82, "center", content, fonts, "#F7F5F0", palette, style, w * 0.08);
    y = drawBodyAndMeta(ctx, cx, y, w * 0.7, "center", content, fonts, "#F7F5F0");
    drawCtaAndBadge(ctx, w, h, cx, h * 0.94, content, fonts, palette);
  },

  poster(ctx, w, h, s) {
    const { content, photoImg, palette, fonts, style, textColor } = s;
    const cx = w / 2;
    let y = h * 0.1;
    if (content.badge) {
      drawBadge(ctx, content.badge, cx, y + 20, palette, fonts.body);
      y += 90;
    }
    y = drawHeadingBlock(ctx, cx, y + 20, w * 0.84, "center", content, fonts, textColor, palette, style, w * 0.1);

    if (photoImg) {
      const pw = w * 0.7, ph = h * 0.32;
      drawPhotoCover(ctx, photoImg, cx - pw / 2, y + 10, pw, ph, 22);
      y += ph + 50;
    }
    y = drawBodyAndMeta(ctx, cx, y, w * 0.72, "center", content, fonts, textColor);
    drawCtaAndBadge(ctx, w, h, cx, h * 0.92, content, fonts, palette);
  },

  editorial(ctx, w, h, s) {
    const { content, photoImg, palette, fonts, style, textColor } = s;
    const marginX = w * 0.09;
    ctx.strokeStyle = hexAlpha(textColor, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(marginX, h * 0.08); ctx.lineTo(w - marginX, h * 0.08); ctx.stroke();

    let y = h * 0.15;
    if (photoImg) {
      const pw = w * 0.42, ph = h * 0.4;
      drawPhotoCover(ctx, photoImg, w - marginX - pw, y, pw, ph, 6);
      y = drawHeadingBlock(ctx, marginX, y + 40, w - marginX * 2 - pw - 40, "left", content, fonts, textColor, palette, style, w * 0.075);
      drawBodyAndMeta(ctx, marginX, y, w - marginX * 2 - pw - 40, "left", content, fonts, textColor);
    } else {
      y = drawHeadingBlock(ctx, marginX, y, w - marginX * 2, "left", content, fonts, textColor, palette, style, w * 0.09);
      drawBodyAndMeta(ctx, marginX, y, w * 0.62, "left", content, fonts, textColor);
    }
    ctx.beginPath(); ctx.moveTo(marginX, h * 0.93); ctx.lineTo(w - marginX, h * 0.93); ctx.stroke();
  },
};

// ------------------------------------------------------------- main render --

function renderCard(ctx, w, h, state) {
  const { typeId, group, styleKey, layoutKey, paletteIdx, fields, photoImg, seed, textOffset } = state;
  const style = STYLE_PRESETS[styleKey] || STYLE_PRESETS.modern;
  const palettesForStyle = PALETTES[styleKey] || PALETTES.modern;
  const palette = palettesForStyle[paletteIdx % palettesForStyle.length];
  const fonts = FONT_PAIRS[style.fonts] || FONT_PAIRS.modern;
  const content = resolveContent(typeId, group, fields);
  const textColor = pickTextColor(palette);

  drawBackground(ctx, w, h, style, palette);
  drawDecor(ctx, style.decor, w, h, palette, seed);

  const layoutFn = LAYOUT_FUNCS[layoutKey] || LAYOUT_FUNCS.center;
  const offset = textOffset || { x: 0, y: 0 };
  ctx.save();
  ctx.translate(offset.x, offset.y);
  layoutFn(ctx, w, h, { content, photoImg, palette, fonts, style, textColor });
  ctx.restore();
}
