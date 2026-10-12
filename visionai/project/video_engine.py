import os
import shutil
import math

import numpy as np
from PIL import Image, ImageEnhance, ImageOps, ImageColor, ImageDraw, ImageFilter

from moviepy import (
    VideoClip,
    VideoFileClip,
    AudioFileClip,
    CompositeVideoClip,
    concatenate_videoclips,
    concatenate_audioclips,
    TextClip,
)
from moviepy.video.fx import FadeIn, Resize, Crop, BlackAndWhite, MultiplySpeed, CrossFadeIn, SlideIn
from moviepy.audio.fx import MultiplyVolume

import effects

try:
    from rembg import remove as rembg_remove, new_session as rembg_new_session
    _REMBG_AVAILABLE = True
except ImportError:
    _REMBG_AVAILABLE = False

# ---------------------------------------------------------------- canvas ---

ASPECTS = {
    "vertical": (1080, 1920),
    "square": (1080, 1080),
    "horizontal": (1920, 1080),
}
QUALITY_SCALE = {"draft": 0.55, "hd": 1.0}
QUALITY_PRESET = {"draft": "ultrafast", "hd": "medium"}
QUALITY_FPS = {"draft": 18, "hd": 24}

MAX_VIDEO_CLIP_SECONDS = 12  # safety cap per uploaded video clip

# --------------------------------------------------------- occasion themes ---

BACKGROUND_PRESETS = {
    "birthday": ("#FF6FA5", "#FFD36E"),
    "anniversary": ("#5C1A2B", "#D9A441"),
    "engagement": ("#0B3D3A", "#D4AF37"),
    "celebration": ("#3A0CA3", "#F72585"),
    "elegant": ("#111014", "#3A3A42"),
    "party": ("#00C2CB", "#FFEA00"),
}

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "fonts")
FONTS = {
    "poppins_bold": os.path.join(FONT_DIR, "Poppins-Bold.ttf"),
    "poppins_light": os.path.join(FONT_DIR, "Poppins-Light.ttf"),
    "lora": os.path.join(FONT_DIR, "Lora-Regular.ttf"),
    "lora_italic": os.path.join(FONT_DIR, "Lora-Italic.ttf"),
    "dejavu_sans_bold": os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"),
    "dejavu_serif": os.path.join(FONT_DIR, "DejaVuSerif.ttf"),
    "liberation_mono_bold": os.path.join(FONT_DIR, "LiberationMono-Bold.ttf"),
    "free_serif_bold_italic": os.path.join(FONT_DIR, "FreeSerifBoldItalic.ttf"),
}

TITLE_STYLES = {
    "bold": {"stroke_color": "#000000", "stroke_width": 4},
    "elegant": {"stroke_color": None, "stroke_width": 0},
    "neon": {"stroke_color": "#0d1a12", "stroke_width": 3},
    "minimal": {"stroke_color": None, "stroke_width": 0},
    "romantic": {"stroke_color": "#5c1330", "stroke_width": 3},
}

TITLE_POSITIONS = {
    "top-left": ("left", "top"), "top-center": ("center", "top"), "top-right": ("right", "top"),
    "middle-left": ("left", "center"), "middle-center": ("center", "center"), "middle-right": ("right", "center"),
    "bottom-left": ("left", "bottom"), "bottom-center": ("center", "bottom"), "bottom-right": ("right", "bottom"),
}

_REMBG_SESSION = None


def _get_rembg_session():
    global _REMBG_SESSION
    if _REMBG_SESSION is None:
        _REMBG_SESSION = rembg_new_session("u2net")
    return _REMBG_SESSION


def _even(n):
    n = int(n)
    return n if n % 2 == 0 else n - 1


def get_canvas_size(aspect, quality):
    base_w, base_h = ASPECTS.get(aspect, ASPECTS["vertical"])
    scale = QUALITY_SCALE.get(quality, 1.0)
    return (_even(base_w * scale), _even(base_h * scale))


def _make_gradient(size, color1, color2):
    w, h = size
    c1 = np.array(ImageColor.getrgb(color1), dtype=np.float32)
    c2 = np.array(ImageColor.getrgb(color2), dtype=np.float32)
    t = np.linspace(0, 1, h).reshape(h, 1, 1)
    row = c1 * (1 - t) + c2 * t
    arr = np.repeat(row, w, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def _cover_resize(img, size):
    target_w, target_h = size
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    target_ratio = target_w / target_h

    if src_ratio > target_ratio:
        new_h = src_h
        new_w = int(src_h * target_ratio)
    else:
        new_w = src_w
        new_h = int(src_w / target_ratio)

    left = (src_w - new_w) // 2
    top = (src_h - new_h) // 2
    img = img.crop((left, top, left + new_w, top + new_h))
    return img.resize(size, Image.LANCZOS)


def _build_background(size, bg_mode, bg_preset, bg_color, custom_bg_path):
    if bg_mode == "custom" and custom_bg_path and os.path.exists(custom_bg_path):
        bg_img = Image.open(custom_bg_path).convert("RGB")
        return _cover_resize(bg_img, size)
    if bg_mode == "solid" and bg_color:
        return Image.new("RGB", size, ImageColor.getrgb(bg_color))
    c1, c2 = BACKGROUND_PRESETS.get(bg_preset, BACKGROUND_PRESETS["elegant"])
    return _make_gradient(size, c1, c2)


def _remove_background_and_composite(img, size, bg_mode, bg_preset, bg_color, custom_bg_path):
    if not _REMBG_AVAILABLE:
        raise RuntimeError(
            "Background removal needs the 'rembg' package. Install it with: "
            "pip install rembg onnxruntime"
        )
    cutout = rembg_remove(img, session=_get_rembg_session())  # RGBA
    background = _build_background(size, bg_mode, bg_preset, bg_color, custom_bg_path).convert("RGBA")

    canvas_w, canvas_h = size
    cw, ch = cutout.size
    max_w, max_h = int(canvas_w * 0.92), int(canvas_h * 0.92)
    scale = min(max_w / cw, max_h / ch)
    new_w, new_h = max(1, int(cw * scale)), max(1, int(ch * scale))
    cutout = cutout.resize((new_w, new_h), Image.LANCZOS)

    x = (canvas_w - new_w) // 2
    y = (canvas_h - new_h) // 2
    background.paste(cutout, (x, y), cutout)
    return background.convert("RGB")


def _apply_filter(img, filter_name):
    if filter_name == "grayscale":
        return ImageOps.grayscale(img).convert("RGB")
    if filter_name == "sepia":
        gray = ImageOps.grayscale(img)
        return ImageOps.colorize(gray, black="#2b1a0e", white="#e8d3a8")
    if filter_name == "vivid":
        img = ImageEnhance.Color(img).enhance(1.6)
        return ImageEnhance.Contrast(img).enhance(1.15)
    if filter_name == "vintage":
        img = ImageEnhance.Color(img).enhance(0.7)
        img = ImageEnhance.Contrast(img).enhance(0.9)
        overlay = Image.new("RGB", img.size, (255, 224, 170))
        return Image.blend(img, overlay, 0.12)
    if filter_name == "old_film":
        gray = ImageOps.grayscale(img)
        toned = ImageOps.colorize(gray, black="#1a1408", white="#d8c9a0")
        toned = ImageEnhance.Contrast(toned).enhance(1.1)
        w, h = toned.size
        noise = (np.random.rand(h, w, 1) * 40 - 20)
        arr = np.asarray(toned).astype("float32") + noise
        toned = Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))
        vignette = Image.new("L", (w, h), 0)
        vd = ImageDraw.Draw(vignette)
        vd.ellipse([-w * 0.25, -h * 0.2, w * 1.25, h * 1.2], fill=255)
        vignette = vignette.filter(ImageFilter.GaussianBlur(w * 0.12))
        black = Image.new("RGB", (w, h), (10, 8, 4))
        return Image.composite(toned, black, vignette)
    return img


def _prepare_pil(src_path, filter_name, canvas_size, work_size, need_oversample,
                  remove_bg, bg_mode, bg_preset, bg_color, custom_bg_path):
    """Returns (canvas_img, over_img_or_None) both filtered and ready for the effect renderer."""
    img = Image.open(src_path).convert("RGB")

    if remove_bg:
        canvas_img = _remove_background_and_composite(img, canvas_size, bg_mode, bg_preset, bg_color, custom_bg_path)
        over_img = None
        if need_oversample:
            over_img = _remove_background_and_composite(img, work_size, bg_mode, bg_preset, bg_color, custom_bg_path)
    else:
        canvas_img = _cover_resize(img, canvas_size)
        over_img = _cover_resize(img, work_size) if need_oversample else None

    canvas_img = _apply_filter(canvas_img, filter_name)
    if over_img is not None:
        over_img = _apply_filter(over_img, filter_name)

    return canvas_img, over_img


def _make_image_clip(canvas_img, over_img, effect, duration, canvas_size, work_size, seed):
    def frame_function(t):
        frame = effects.render_frame(effect, canvas_img, over_img, t, duration, canvas_size, work_size, seed)
        return np.asarray(frame.convert("RGB"))

    return VideoClip(frame_function=frame_function, duration=duration)


def generate_card_animation(image_path, width, height, effect, duration, output_path):
    """Animates a single already-designed card image (from the Card Studio) using the effects library."""
    canvas_size = (_even(width), _even(height))
    need_oversample = effect in effects.NEEDS_OVERSAMPLE
    work_size = (
        (_even(canvas_size[0] * effects.OVERSAMPLE), _even(canvas_size[1] * effects.OVERSAMPLE))
        if need_oversample else canvas_size
    )
    img = Image.open(image_path).convert("RGB")
    canvas_img = _cover_resize(img, canvas_size)
    over_img = _cover_resize(img, work_size) if need_oversample else None

    clip = _make_image_clip(canvas_img, over_img, effect, duration, canvas_size, work_size, seed=1)
    clip.write_videofile(
        output_path, fps=24, codec="libx264", preset="fast",
        threads=os.cpu_count() or 4, logger=None,
    )


def _cover_fit_video(clip, canvas_size):
    cw, ch = canvas_size
    src_ratio = clip.w / clip.h
    target_ratio = cw / ch

    if src_ratio > target_ratio:
        clip = clip.with_effects([Resize(height=ch)])
        clip = clip.with_effects([Crop(x_center=clip.w / 2, width=cw, height=ch)])
    else:
        clip = clip.with_effects([Resize(width=cw)])
        clip = clip.with_effects([Crop(y_center=clip.h / 2, width=cw, height=ch)])
    return clip


def _apply_manual_crop(clip, crop_box):
    """crop_box: dict with x1,y1,x2,y2 as 0..1 ratios of the clip's native frame."""
    if not crop_box:
        return clip
    w, h = clip.w, clip.h
    x1 = max(0.0, min(0.98, crop_box.get("x1", 0.0)))
    y1 = max(0.0, min(0.98, crop_box.get("y1", 0.0)))
    x2 = max(x1 + 0.02, min(1.0, crop_box.get("x2", 1.0)))
    y2 = max(y1 + 0.02, min(1.0, crop_box.get("y2", 1.0)))
    px1, py1, px2, py2 = int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h)
    return clip.with_effects([Crop(x1=px1, y1=py1, x2=px2, y2=py2)])


def _apply_speed_segments(clip, segments):
    """segments: list of {start, end, factor} in seconds, relative to clip's own timeline.
    Any gaps not covered by a segment play at normal (1x) speed. Overlapping segments are
    auto-resolved by trimming the later segment's start to the previous segment's end, so
    footage never plays twice."""
    if not segments:
        return clip
    segments = sorted(
        [s for s in segments if s.get("end", 0) > s.get("start", 0)],
        key=lambda s: s["start"],
    )
    if not segments:
        return clip

    pieces = []
    cursor = 0.0
    for seg in segments:
        start = max(0.0, min(clip.duration, seg["start"]))
        end = max(start, min(clip.duration, seg["end"]))
        if start < cursor:
            start = cursor  # resolve overlap with the previous segment
        if end <= start:
            continue  # this segment was fully consumed by the overlap fix, skip it
        if start > cursor + 0.02:
            pieces.append(clip.subclipped(cursor, start))
        factor = max(0.25, min(4.0, float(seg.get("factor", 1.0))))
        pieces.append(clip.subclipped(start, end).with_effects([MultiplySpeed(factor)]))
        cursor = end
    if cursor < clip.duration - 0.02:
        pieces.append(clip.subclipped(cursor, clip.duration))

    if not pieces:
        return clip
    return concatenate_videoclips(pieces, method="compose")


def _make_video_clip(src_path, clip_start, clip_duration, keep_audio, filter_name, canvas_size, crop_box=None, speed_segments=None):
    clip = VideoFileClip(src_path)
    start = max(0.0, min(clip.duration, clip_start or 0.0))
    dur = min(clip_duration or (clip.duration - start), clip.duration - start, MAX_VIDEO_CLIP_SECONDS)
    clip = clip.subclipped(start, start + max(0.3, dur))
    clip = _apply_manual_crop(clip, crop_box)
    clip = _apply_speed_segments(clip, speed_segments)
    clip = _cover_fit_video(clip, canvas_size)
    if not keep_audio:
        clip = clip.without_audio()
    if filter_name == "grayscale":
        clip = clip.with_effects([BlackAndWhite()])
    return clip


def _concatenate_with_transitions(clips, transition_type, transition_duration):
    if not clips:
        return None
    if transition_type == "none" or len(clips) < 2 or not transition_duration:
        return concatenate_videoclips(clips, method="compose")

    td = max(0.1, min(transition_duration, min(c.duration for c in clips) * 0.9))
    positioned = [clips[0]]
    t_cursor = clips[0].duration
    for i in range(1, len(clips)):
        c = clips[i]
        if transition_type == "dissolve":
            c = c.with_effects([CrossFadeIn(td)])
        elif transition_type in ("slide_left", "slide_right", "slide_up", "slide_down"):
            side_map = {"slide_left": "left", "slide_right": "right", "slide_up": "bottom", "slide_down": "top"}
            c = c.with_effects([SlideIn(td, side_map[transition_type])])
        start = max(0.0, t_cursor - td)
        c = c.with_start(start)
        positioned.append(c)
        t_cursor = start + c.duration

    return CompositeVideoClip(positioned, size=clips[0].size).with_duration(t_cursor)


def _title_position(position_key):
    return TITLE_POSITIONS.get(position_key, ("center", "top"))


def _grid_to_pixels(position_key, text_w, text_h, canvas_size, margin_ratio=0.06):
    cw, ch = canvas_size
    horiz, vert = TITLE_POSITIONS.get(position_key, ("center", "top"))
    margin = int(cw * margin_ratio)
    if horiz == "left":
        px = margin
    elif horiz == "right":
        px = cw - text_w - margin
    else:
        px = (cw - text_w) // 2
    if vert == "top":
        py = margin
    elif vert == "bottom":
        py = ch - text_h - margin
    else:
        py = (ch - text_h) // 2
    return px, py


def _ease_out_back(x):
    c1, c3 = 1.70158, 2.70158
    x = max(0.0, min(1.2, x))
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def _build_typewriter_clip(text, font_path, font_size, color, stroke_color, stroke_width, duration, canvas_size, px, py):
    """Custom PIL-rendered typewriter reveal, since TextClip renders a fixed bitmap per instance."""
    from PIL import ImageFont

    try:
        font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    reveal_window = min(duration * 0.7, max(0.6, len(text) * 0.05))
    n_chars = len(text)

    tmp = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(tmp)
    bbox = tdraw.textbbox((0, 0), text, font=font, stroke_width=stroke_width or 0)
    full_w, full_h = bbox[2] - bbox[0] + 20, bbox[3] - bbox[1] + 20

    def frame_function(t):
        shown = text if t >= reveal_window else text[: max(1, int(n_chars * (t / reveal_window)))]
        img = Image.new("RGBA", (full_w, full_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        kwargs = {"fill": color}
        if stroke_color:
            kwargs["stroke_fill"] = stroke_color
            kwargs["stroke_width"] = stroke_width
        draw.text((10, 10), shown, font=font, **kwargs)
        return np.asarray(img.convert("RGB"))

    def mask_function(t):
        shown = text if t >= reveal_window else text[: max(1, int(n_chars * (t / reveal_window)))]
        img = Image.new("L", (full_w, full_h), 0)
        draw = ImageDraw.Draw(img)
        draw.text((10, 10), shown, font=font, fill=255, stroke_width=stroke_width or 0, stroke_fill=255)
        return np.asarray(img).astype("float32") / 255.0

    clip = VideoClip(frame_function=frame_function, duration=duration)
    mask_clip = VideoClip(frame_function=mask_function, duration=duration, is_mask=True)
    clip = clip.with_mask(mask_clip)
    return clip.with_position((px, py))


def _build_title_clip(text, title_style, title_font, title_color, title_position, title_x, title_y,
                       animation, duration, canvas_size):
    style = TITLE_STYLES.get(title_style, TITLE_STYLES["bold"])
    font_path = FONTS.get(title_font)
    font_size = int(canvas_size[0] * 0.07)
    color = title_color or "#FFFFFF"
    stroke_color = style["stroke_color"]
    stroke_width = style["stroke_width"]

    # measure the rendered text once (via a throwaway TextClip) to resolve pixel position
    probe_kwargs = dict(text=text, font_size=font_size, color=color)
    if font_path and os.path.exists(font_path):
        probe_kwargs["font"] = font_path
    if stroke_color:
        probe_kwargs["stroke_color"] = stroke_color
        probe_kwargs["stroke_width"] = stroke_width
    probe = TextClip(**probe_kwargs)
    tw, th = probe.size

    if title_x is not None and title_y is not None:
        px = int(canvas_size[0] * title_x - tw / 2)
        py = int(canvas_size[1] * title_y - th / 2)
    else:
        px, py = _grid_to_pixels(title_position, tw, th, canvas_size)
    px = max(0, min(canvas_size[0] - tw, px))
    py = max(0, min(canvas_size[1] - th, py))

    if animation == "typewriter":
        return _build_typewriter_clip(
            text, font_path if (font_path and os.path.exists(font_path)) else None,
            font_size, color, stroke_color, stroke_width, duration, canvas_size, px, py,
        )

    clip = probe.with_duration(duration)

    if animation == "pop":
        window = min(0.5, duration * 0.3)
        def scale_fn(t, w=window):
            if t >= w:
                return 1.0
            return max(0.05, _ease_out_back(t / w))
        clip = clip.with_effects([Resize(scale_fn)]).with_position((px, py)).with_effects([FadeIn(0.15)])
    elif animation == "slide_up":
        window = min(0.5, duration * 0.3)
        def pos_fn(t, w=window, px=px, py=py):
            if t >= w:
                return (px, py)
            prog = _ease_out_back(t / w) if t / w < 1 else 1.0
            offset = int(canvas_size[1] * 0.12 * (1 - min(1.0, t / w)))
            return (px, py + offset)
        clip = clip.with_position(pos_fn).with_effects([FadeIn(min(0.4, window))])
    elif animation == "bounce":
        window = min(0.6, duration * 0.35)
        def pos_fn(t, w=window, px=px, py=py):
            if t >= w:
                return (px, py)
            bounce = abs(math.sin((t / w) * math.pi * 2.2)) * (1 - t / w)
            return (px, py - int(canvas_size[1] * 0.05 * bounce))
        clip = clip.with_position(pos_fn).with_effects([FadeIn(min(0.3, window))])
    elif animation == "none":
        clip = clip.with_position((px, py))
    else:  # "fade" default
        clip = clip.with_position((px, py)).with_effects([FadeIn(0.4)])

    return clip


def generate_video(
    media_items,          # list of dicts: {path, kind, effect, remove_bg, clip_start, clip_duration, keep_audio, duration}
    audio_path,
    title_text,
    title_style,
    title_font,
    title_color,
    title_position,       # 9-grid key, used when title_x/title_y are None
    title_x,              # 0..1 ratio, or None -> use title_position
    title_y,               # 0..1 ratio, or None
    title_animation,      # "none" | "fade" | "pop" | "slide_up" | "typewriter" | "bounce"
    transition_type,      # "none" | "dissolve" | "slide_left" | "slide_right" | "slide_up" | "slide_down"
    transition_duration,
    filter_name,
    duration_per_image,
    music_volume,
    aspect,
    quality,
    bg_mode,
    bg_preset,
    bg_color,
    custom_bg_path,
    output_path,
):
    canvas_size = get_canvas_size(aspect, quality)
    work_size = (_even(canvas_size[0] * effects.OVERSAMPLE), _even(canvas_size[1] * effects.OVERSAMPLE))

    work_dir = os.path.join(
        os.path.dirname(output_path), "_frames_tmp_" + os.path.splitext(os.path.basename(output_path))[0]
    )
    os.makedirs(work_dir, exist_ok=True)

    try:
        clips = []
        for i, item in enumerate(media_items):
            if item.get("kind") == "video":
                clip = _make_video_clip(
                    item["path"], item.get("clip_start", 0.0), item.get("clip_duration"),
                    item.get("keep_audio", False), filter_name, canvas_size,
                    crop_box=item.get("crop"), speed_segments=item.get("speed_segments"),
                )
            else:
                effect = item.get("effect", "fade")
                remove_bg = item.get("remove_bg", False)
                need_oversample = effect in effects.NEEDS_OVERSAMPLE
                this_duration = item.get("duration") or duration_per_image

                canvas_img, over_img = _prepare_pil(
                    item["path"], filter_name, canvas_size, work_size, need_oversample,
                    remove_bg, bg_mode, bg_preset, bg_color, custom_bg_path,
                )
                clip = _make_image_clip(canvas_img, over_img, effect, this_duration, canvas_size, work_size, seed=i)

            clips.append(clip)

        video = _concatenate_with_transitions(clips, transition_type or "none", transition_duration)

        layers = [video]
        if title_text:
            title_clip = _build_title_clip(
                title_text, title_style, title_font, title_color,
                title_position, title_x, title_y, title_animation,
                video.duration, canvas_size,
            )
            layers.append(title_clip)

        final = CompositeVideoClip(layers, size=canvas_size)

        if audio_path and os.path.exists(audio_path):
            audio = AudioFileClip(audio_path)
            if audio.duration < final.duration:
                loops = int(final.duration // audio.duration) + 1
                audio = concatenate_audioclips([audio] * loops)
            audio = audio.subclipped(0, final.duration)
            audio = audio.with_effects([MultiplyVolume(music_volume)])
            if final.audio is not None:
                from moviepy import CompositeAudioClip
                final = final.with_audio(CompositeAudioClip([final.audio, audio]))
            else:
                final = final.with_audio(audio)

        final.write_videofile(
            output_path,
            fps=QUALITY_FPS.get(quality, 24),
            codec="libx264",
            audio_codec="aac",
            preset=QUALITY_PRESET.get(quality, "medium"),
            threads=os.cpu_count() or 4,
            logger=None,
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
