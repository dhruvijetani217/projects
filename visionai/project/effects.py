"""
SPROCKET effect library.

Every effect is a function: render(canvas_img, over_img, t, duration, canvas_size, work_size, seed) -> PIL.Image (RGB, canvas_size)

- canvas_img: source already cover-fit to the exact output canvas_size (used by effects that don't need extra headroom)
- over_img:   source cover-fit to an oversized "work_size" (canvas * OVERSAMPLE), used by zoom/pan/spin/slide-type
              effects so we always CROP DOWN from a bigger image instead of upscaling -> no blur.
- seed:       per-image integer, used to give shake/flicker/pan_around slight per-image variation.

A few items on the user's wishlist aren't real per-pixel effects (true ripple/swirl distortion, video speed-ramps,
depth-based parallax) — those need either heavy per-pixel warping (too slow for a personal tool) or actual footage/
depth data a single flat photo doesn't have. Where a named effect maps to one of those, it's implemented as the
closest honest approximation using rotation/zoom/blend, and documented below.
"""

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OVERSAMPLE = 1.35  # canvas * OVERSAMPLE = buffer size for zoom/pan/spin/shake effects (avoids upscale-blur)


# ---------------------------------------------------------------- helpers ---

def _ease_in_out(x):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, x)))


def _ease_out_back(x):
    x = max(0.0, min(1.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def _progress(t, duration, window):
    """0..1 progress through the first `window` seconds of the clip."""
    if window <= 0:
        return 1.0
    return max(0.0, min(1.0, t / window))


def _crop_window(img, box_w, box_h, cx, cy):
    """Crop a box_w x box_h window centered at (cx, cy) pixel coords from img, clamped in-bounds."""
    iw, ih = img.size
    box_w = min(box_w, iw)
    box_h = min(box_h, ih)
    left = max(0, min(iw - box_w, cx - box_w / 2))
    top = max(0, min(ih - box_h, cy - box_h / 2))
    return img.crop((int(left), int(top), int(left) + box_w, int(top) + box_h))


def zoom_crop(over_img, work_size, canvas_size, zoom_ratio, cx_ratio=0.5, cy_ratio=0.5):
    """
    zoom_ratio in [0, 1]: 0 -> full oversized frame (most zoomed out we allow),
    1 -> exactly canvas-size crop (most zoomed in we allow).
    """
    ow, oh = work_size
    cw, ch = canvas_size
    box_w = ow + (cw - ow) * zoom_ratio
    box_h = oh + (ch - oh) * zoom_ratio
    cx = ow * cx_ratio
    cy = oh * cy_ratio
    win = _crop_window(over_img, box_w, box_h, cx, cy)
    if win.size != (cw, ch):
        win = win.resize((cw, ch), Image.LANCZOS)
    return win


def pan_crop(over_img, work_size, canvas_size, x_ratio, y_ratio):
    """x_ratio/y_ratio in [0,1]: position of the canvas-size crop window within the oversized source."""
    ow, oh = work_size
    cw, ch = canvas_size
    extra_w, extra_h = ow - cw, oh - ch
    left = extra_w * x_ratio
    top = extra_h * y_ratio
    return over_img.crop((int(left), int(top), int(left) + cw, int(top) + ch))


def _soft_mask(size, kind, progress, feather=44):
    """Build an 'L' mode mask for wipe/circle/clock reveal effects."""
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    p = max(0.0, min(1.0, progress))

    if kind in ("wipe_left", "wipe_right", "wipe_up", "wipe_down", "light_wipe"):
        edge = int(w * p) if kind in ("wipe_left", "wipe_right", "light_wipe") else int(h * p)
        if kind in ("wipe_left", "light_wipe"):
            draw.rectangle([0, 0, edge, h], fill=255)
        elif kind == "wipe_right":
            draw.rectangle([w - edge, 0, w, h], fill=255)
        elif kind == "wipe_up":
            draw.rectangle([0, h - edge, w, h], fill=255)
        elif kind == "wipe_down":
            draw.rectangle([0, 0, w, edge], fill=255)
    elif kind == "reveal":
        half = int((w / 2) * p)
        draw.rectangle([w // 2 - half, 0, w // 2 + half, h], fill=255)
    elif kind in ("circle_in", "circle_out"):
        max_r = math.hypot(w, h) / 2
        r = max_r * (p if kind == "circle_in" else (1 - p))
        cx, cy = w / 2, h / 2
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    elif kind == "clock_wipe":
        cx, cy = w / 2, h / 2
        max_r = math.hypot(w, h)
        angle = 360 * p
        draw.pieslice([cx - max_r, cy - max_r, cx + max_r, cy + max_r], -90, -90 + angle, fill=255)

    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


# ------------------------------------------------------------- core / zoom ---

def fx_none(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    return canvas_img


def fx_fade(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    fade_t = 0.5
    alpha = 1.0
    if t < fade_t:
        alpha = _ease_in_out(t / fade_t)
    elif t > duration - fade_t:
        alpha = _ease_in_out((duration - t) / fade_t)
    black = Image.new("RGB", canvas_size, (0, 0, 0))
    return Image.blend(black, canvas_img, alpha)


fx_dissolve = fx_fade  # smooth opacity dissolve (true adjacent-clip crossfade is handled at the timeline level)


ZOOM_TOTAL = 0.16  # fraction of the oversample buffer consumed by a full zoom sweep


def fx_zoom_in(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    zr = ZOOM_TOTAL * (t / duration)
    return zoom_crop(over_img, work_size, canvas_size, zr)


def fx_zoom_out(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    zr = ZOOM_TOTAL * (1 - t / duration)
    return zoom_crop(over_img, work_size, canvas_size, zr)


def fx_zoom_bounce(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    x = t / duration
    zr = ZOOM_TOTAL * _ease_out_back(x)
    zr = max(0.0, min(ZOOM_TOTAL * 1.15, zr))
    return zoom_crop(over_img, work_size, canvas_size, zr)


def fx_in_and_out(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    x = t / duration
    zr = ZOOM_TOTAL * math.sin(math.pi * x)
    return zoom_crop(over_img, work_size, canvas_size, max(0, zr))


def fx_pulse(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    cycles = 2.5
    zr = ZOOM_TOTAL * 0.5 * (1 + math.sin(2 * math.pi * cycles * t / duration))
    return zoom_crop(over_img, work_size, canvas_size, zr)


def fx_zoom_ripple(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    """Approximation: two zoom layers at slightly offset phase, blended -> a pulsing 'breathing' feel."""
    cycles = 3
    zr1 = ZOOM_TOTAL * 0.5 * (1 + math.sin(2 * math.pi * cycles * t / duration))
    zr2 = ZOOM_TOTAL * 0.5 * (1 + math.sin(2 * math.pi * cycles * t / duration + 0.9))
    a = zoom_crop(over_img, work_size, canvas_size, zr1)
    b = zoom_crop(over_img, work_size, canvas_size, zr2)
    return Image.blend(a, b, 0.35)


# ------------------------------------------------------------------- pan ---

PAN_TOTAL = 1.0  # fully traverse the oversample buffer


def fx_pan_left(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    return pan_crop(over_img, work_size, canvas_size, x_ratio=(t / duration), y_ratio=0.5)


def fx_pan_right(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    return pan_crop(over_img, work_size, canvas_size, x_ratio=1 - (t / duration), y_ratio=0.5)


def fx_pan_up(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    return pan_crop(over_img, work_size, canvas_size, x_ratio=0.5, y_ratio=(t / duration))


def fx_pan_down(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    return pan_crop(over_img, work_size, canvas_size, x_ratio=0.5, y_ratio=1 - (t / duration))


def fx_pan_around(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    x = 0.5 + 0.5 * math.cos(2 * math.pi * t / duration)
    y = 0.5 + 0.5 * math.sin(2 * math.pi * t / duration)
    return pan_crop(over_img, work_size, canvas_size, x_ratio=x, y_ratio=y)


# --------------------------------------------------------------- slide-in ---

def _slide_offset(t, duration, side, canvas_size, bounce=False):
    cw, ch = canvas_size
    window = min(0.7, duration * 0.4)
    p = _progress(t, duration, window)
    p = _ease_out_back(p) if bounce else _ease_in_out(p)
    if side == "left":
        return (int(-cw * (1 - p)), 0)
    if side == "right":
        return (int(cw * (1 - p)), 0)
    if side == "up":
        return (0, int(-ch * (1 - p)))
    return (0, int(ch * (1 - p)))


def _slide_base(canvas_img, over_img, t, duration, canvas_size, work_size, side, bounce):
    ox, oy = _slide_offset(t, duration, side, canvas_size, bounce)
    frame = Image.new("RGB", canvas_size, (10, 10, 12))
    frame.paste(canvas_img, (ox, oy))
    return frame


def fx_slide_left(c, o, t, d, cs, ws, seed):
    return _slide_base(c, o, t, d, cs, ws, "left", False)


def fx_slide_right(c, o, t, d, cs, ws, seed):
    return _slide_base(c, o, t, d, cs, ws, "right", False)


def fx_slide_up(c, o, t, d, cs, ws, seed):
    return _slide_base(c, o, t, d, cs, ws, "up", False)


def fx_slide_down(c, o, t, d, cs, ws, seed):
    return _slide_base(c, o, t, d, cs, ws, "down", False)


def fx_slide_bounce(c, o, t, d, cs, ws, seed):
    return _slide_base(c, o, t, d, cs, ws, "left", True)


# -------------------------------------------------------------- wipe/mask ---

def _wipe_base(canvas_img, kind, t, duration, canvas_size, feather=44):
    window = min(0.8, duration * 0.45)
    p = _ease_in_out(_progress(t, duration, window))
    mask = _soft_mask(canvas_size, kind, p, feather=feather)
    black = Image.new("RGB", canvas_size, (0, 0, 0))
    out = Image.composite(canvas_img, black, mask)
    if kind == "light_wipe" and p < 1.0:
        edge_x = int(canvas_size[0] * p)
        glow = Image.new("RGB", canvas_size, (0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rectangle([max(0, edge_x - 30), 0, edge_x + 30, canvas_size[1]], fill=(255, 250, 230))
        glow = glow.filter(ImageFilter.GaussianBlur(25))
        out = ImageChops.screen(out, glow)
    return out


def fx_wipe_left(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "wipe_left", t, d, cs)


def fx_wipe_right(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "wipe_right", t, d, cs)


def fx_wipe_up(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "wipe_up", t, d, cs)


def fx_wipe_down(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "wipe_down", t, d, cs)


def fx_light_wipe(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "light_wipe", t, d, cs)


def fx_reveal(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "reveal", t, d, cs, feather=60)


def fx_circle_in(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "circle_in", t, d, cs, feather=30)


def fx_circle_out(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "circle_out", t, d, cs, feather=30)


def fx_clock_wipe(c, o, t, d, cs, ws, seed):
    return _wipe_base(c, "clock_wipe", t, d, cs, feather=8)


def fx_scanner_vertical(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    cw, ch = canvas_size
    cycle = 1.6
    x = (t % cycle) / cycle * (cw + 200) - 100
    glow = Image.new("RGB", canvas_size, (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rectangle([x - 20, 0, x + 20, ch], fill=(200, 255, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    return ImageChops.screen(canvas_img, glow)


# ------------------------------------------------------------- camera fx ---

def fx_shake(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    amp_px = 14
    rnd = (seed % 7) * 0.6
    dx = amp_px * math.sin(9 * t + rnd)
    dy = amp_px * math.cos(7 * t + rnd * 1.3)
    extra_w = max(1, work_size[0] - canvas_size[0])
    extra_h = max(1, work_size[1] - canvas_size[1])
    x_ratio = 0.5 + dx / extra_w
    y_ratio = 0.5 + dy / extra_h
    return pan_crop(over_img, work_size, canvas_size, x_ratio=x_ratio, y_ratio=y_ratio)


def fx_shake_zoom(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    zr = ZOOM_TOTAL * (t / duration)
    base = zoom_crop(over_img, work_size, canvas_size, zr)
    amp = 6
    rnd = (seed % 7) * 0.6
    dx = int(amp * math.sin(9 * t + rnd))
    dy = int(amp * math.cos(7 * t + rnd * 1.3))
    shifted = ImageChops.offset(base, dx, dy)
    return shifted


def fx_spin(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    angle = 14 * (t / duration)
    rotated = over_img.rotate(angle, resample=Image.BICUBIC, expand=False)
    ow, oh = work_size
    cw, ch = canvas_size
    return _crop_window(rotated, cw, ch, ow / 2, oh / 2).resize(canvas_size, Image.LANCZOS)


def fx_rotate_warp(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    angle = 5 * math.sin(2 * math.pi * t / duration)
    zr = ZOOM_TOTAL * 0.6 * (0.5 - 0.5 * math.cos(2 * math.pi * t / duration))
    base = zoom_crop(over_img, work_size, canvas_size, zr)
    return base.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(10, 10, 12))


def fx_swirl(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    """Stylized approximation of a swirl using slow rotation + pulsing zoom (no true per-pixel vortex warp)."""
    angle = 10 * (t / duration)
    zr = ZOOM_TOTAL * 0.7 * (0.5 - 0.5 * math.cos(4 * math.pi * t / duration))
    rotated = over_img.rotate(angle, resample=Image.BICUBIC, expand=False)
    ow, oh = work_size
    box_w = ow * (1 - zr)
    box_h = oh * (1 - zr)
    win = _crop_window(rotated, box_w, box_h, ow / 2, oh / 2)
    return win.resize(canvas_size, Image.LANCZOS)


def fx_flare(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    cw, ch = canvas_size
    p = t / duration
    fx_pos = cw * (0.1 + 0.8 * p)
    fy_pos = ch * (0.15 + 0.5 * p)
    r = int(cw * 0.28)
    glow = Image.new("RGB", canvas_size, (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([fx_pos - r, fy_pos - r, fx_pos + r, fy_pos + r], fill=(255, 244, 214))
    glow = glow.filter(ImageFilter.GaussianBlur(int(r * 0.5)))
    return ImageChops.screen(canvas_img, glow)


def fx_exposure(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    window = min(0.6, duration * 0.35)
    p = _progress(t, duration, window)
    factor = 1.0 + 0.9 * (1 - p)
    arr = np.asarray(canvas_img).astype("float32") * factor
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))


def fx_blur(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    window = min(0.7, duration * 0.4)
    p = _progress(t, duration, window)
    radius = 16 * (1 - p)
    if radius < 0.3:
        return canvas_img
    return canvas_img.filter(ImageFilter.GaussianBlur(radius))


def fx_flicker(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    rnd = (seed % 5) * 1.7
    n = (
        math.sin(23 * t + rnd) * 0.5
        + math.sin(41 * t + rnd * 2) * 0.3
        + math.sin(7 * t + rnd * 0.5) * 0.2
    )
    factor = 1.0 + 0.10 * n
    arr = np.asarray(canvas_img).astype("float32") * factor
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))


def fx_horizontal_stretch(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    cw, ch = canvas_size
    amt = 0.08 * math.sin(math.pi * (t / duration))
    new_w = int(cw * (1 + amt))
    stretched = canvas_img.resize((max(1, new_w), ch), Image.LANCZOS)
    frame = Image.new("RGB", canvas_size, (10, 10, 12))
    frame.paste(stretched, ((cw - new_w) // 2, 0))
    return frame


def fx_vertical_stretch(canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    cw, ch = canvas_size
    amt = 0.08 * math.sin(math.pi * (t / duration))
    new_h = int(ch * (1 + amt))
    stretched = canvas_img.resize((cw, max(1, new_h)), Image.LANCZOS)
    frame = Image.new("RGB", canvas_size, (10, 10, 12))
    frame.paste(stretched, (0, (ch - new_h) // 2))
    return frame


# ---------------------------------------------------------------- registry ---

EFFECTS = {
    "none": fx_none,
    "fade": fx_fade,
    "dissolve": fx_dissolve,
    "zoom_in": fx_zoom_in,
    "zoom_out": fx_zoom_out,
    "zoom_bounce": fx_zoom_bounce,
    "in_and_out": fx_in_and_out,
    "pulse": fx_pulse,
    "zoom_ripple": fx_zoom_ripple,
    "pan_left": fx_pan_left,
    "pan_right": fx_pan_right,
    "pan_up": fx_pan_up,
    "pan_down": fx_pan_down,
    "pan_around": fx_pan_around,
    "slide_left": fx_slide_left,
    "slide_right": fx_slide_right,
    "slide_up": fx_slide_up,
    "slide_down": fx_slide_down,
    "slide_bounce": fx_slide_bounce,
    "wipe_left": fx_wipe_left,
    "wipe_right": fx_wipe_right,
    "wipe_up": fx_wipe_up,
    "wipe_down": fx_wipe_down,
    "light_wipe": fx_light_wipe,
    "reveal": fx_reveal,
    "circle_in": fx_circle_in,
    "circle_out": fx_circle_out,
    "clock_wipe": fx_clock_wipe,
    "scanner_vertical": fx_scanner_vertical,
    "shake": fx_shake,
    "shake_zoom": fx_shake_zoom,
    "spin": fx_spin,
    "rotate_warp": fx_rotate_warp,
    "swirl": fx_swirl,
    "flare": fx_flare,
    "exposure": fx_exposure,
    "blur": fx_blur,
    "flicker": fx_flicker,
    "horizontal_stretch": fx_horizontal_stretch,
    "vertical_stretch": fx_vertical_stretch,
}

# effects that need the oversampled work_img (headroom) to avoid blur when scaling/rotating/panning
NEEDS_OVERSAMPLE = {
    "zoom_in", "zoom_out", "zoom_bounce", "in_and_out", "pulse", "zoom_ripple",
    "pan_left", "pan_right", "pan_up", "pan_down", "pan_around",
    "shake", "shake_zoom", "spin", "rotate_warp", "swirl",
}

EFFECT_CATEGORIES = {
    "Basic": ["none", "fade", "dissolve"],
    "Zoom": ["zoom_in", "zoom_out", "zoom_bounce", "in_and_out", "pulse", "zoom_ripple"],
    "Pan": ["pan_left", "pan_right", "pan_up", "pan_down", "pan_around"],
    "Slide": ["slide_left", "slide_right", "slide_up", "slide_down", "slide_bounce"],
    "Wipe / Reveal": ["wipe_left", "wipe_right", "wipe_up", "wipe_down", "light_wipe", "reveal", "circle_in", "circle_out", "clock_wipe", "scanner_vertical"],
    "Camera": ["shake", "shake_zoom", "spin", "rotate_warp", "swirl", "flare", "exposure", "blur", "flicker"],
    "Stretch": ["horizontal_stretch", "vertical_stretch"],
}


def render_frame(effect, canvas_img, over_img, t, duration, canvas_size, work_size, seed):
    fn = EFFECTS.get(effect, fx_fade)
    return fn(canvas_img, over_img, t, duration, canvas_size, work_size, seed)
