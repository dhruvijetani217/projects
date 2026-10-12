import os
import shutil
import threading
import uuid
import json

from flask import Flask, jsonify, render_template, request, send_from_directory

from video_engine import generate_video, generate_card_animation, FONTS
from effects import EFFECTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500MB per request (video clips are heavier)

# In-memory job registry. Fine for a single-process demo/personal tool.
JOBS = {}

ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_AUDIO_EXT = {".mp3", ".wav", ".m4a"}
ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v"}

VALID_EFFECTS = set(EFFECTS.keys())
VALID_FONTS = set(FONTS.keys())


def _ext_ok(filename, allowed_set):
    return os.path.splitext(filename)[1].lower() in allowed_set


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/generate", methods=["POST"])
def api_generate():
    media_files = request.files.getlist("media")
    if not media_files:
        return jsonify({"error": "At least one photo or video clip is required."}), 400

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    media_dir = os.path.join(job_dir, "media")
    os.makedirs(media_dir, exist_ok=True)

    raw_kinds = request.form.getlist("kinds")
    raw_effects = request.form.getlist("effects")
    raw_remove_bg = request.form.getlist("remove_bg")
    raw_starts = request.form.getlist("clip_starts")      # video: seconds into original file
    raw_durations = request.form.getlist("durations")     # video: clip_duration seconds; image: per-item duration override
    raw_keep_audio = request.form.getlist("keep_audio")
    raw_crops = request.form.getlist("crops")               # JSON string per item, or "" for no crop
    raw_speed_segments = request.form.getlist("speed_segments")  # JSON array string per item, or ""

    media_items = []
    for idx, f in enumerate(media_files):
        if not (f and f.filename):
            continue
        kind = raw_kinds[idx] if idx < len(raw_kinds) else "image"
        ext = os.path.splitext(f.filename)[1].lower()

        if kind == "video" and ext in ALLOWED_VIDEO_EXT:
            path = os.path.join(media_dir, f"clip{idx:03d}{ext}")
            f.save(path)
            try:
                clip_start = float(raw_starts[idx]) if idx < len(raw_starts) and raw_starts[idx] else 0.0
            except ValueError:
                clip_start = 0.0
            try:
                clip_duration = float(raw_durations[idx]) if idx < len(raw_durations) and raw_durations[idx] else None
            except ValueError:
                clip_duration = None
            keep_audio = (raw_keep_audio[idx] if idx < len(raw_keep_audio) else "0") in ("1", "true", "True")

            crop_box = None
            if idx < len(raw_crops) and raw_crops[idx]:
                try:
                    crop_box = json.loads(raw_crops[idx])
                except (ValueError, TypeError):
                    crop_box = None

            speed_segments = None
            if idx < len(raw_speed_segments) and raw_speed_segments[idx]:
                try:
                    speed_segments = json.loads(raw_speed_segments[idx])
                    if not isinstance(speed_segments, list):
                        speed_segments = None
                except (ValueError, TypeError):
                    speed_segments = None

            media_items.append({
                "path": path, "kind": "video", "clip_start": clip_start, "clip_duration": clip_duration,
                "keep_audio": keep_audio, "crop": crop_box, "speed_segments": speed_segments,
            })
        elif kind != "video" and ext in ALLOWED_IMAGE_EXT:
            path = os.path.join(media_dir, f"img{idx:03d}{ext}")
            f.save(path)
            effect = raw_effects[idx] if idx < len(raw_effects) else "fade"
            effect = effect if effect in VALID_EFFECTS else "fade"
            remove_bg = (raw_remove_bg[idx] if idx < len(raw_remove_bg) else "0") in ("1", "true", "True")
            try:
                img_duration = float(raw_durations[idx]) if idx < len(raw_durations) and raw_durations[idx] else None
            except ValueError:
                img_duration = None
            media_items.append({"path": path, "kind": "image", "effect": effect, "remove_bg": remove_bg, "duration": img_duration})

    if not media_items:
        shutil.rmtree(job_dir, ignore_errors=True)
        return jsonify({"error": "No valid photos or video clips uploaded."}), 400

    audio_path = None
    audio_file = request.files.get("audio")
    if audio_file and audio_file.filename and _ext_ok(audio_file.filename, ALLOWED_AUDIO_EXT):
        ext = os.path.splitext(audio_file.filename)[1].lower()
        audio_path = os.path.join(job_dir, f"music{ext}")
        audio_file.save(audio_path)

    custom_bg_path = None
    bg_file = request.files.get("custom_background")
    if bg_file and bg_file.filename and _ext_ok(bg_file.filename, ALLOWED_IMAGE_EXT):
        ext = os.path.splitext(bg_file.filename)[1].lower()
        custom_bg_path = os.path.join(job_dir, f"bg{ext}")
        bg_file.save(custom_bg_path)

    title_text = request.form.get("title", "").strip()
    title_style = request.form.get("title_style", "bold")
    title_font = request.form.get("title_font", "poppins_bold")
    title_font = title_font if title_font in VALID_FONTS else "poppins_bold"
    title_color = request.form.get("title_color", "#FFFFFF")
    title_position = request.form.get("title_position", "top-center")

    title_x = request.form.get("title_x")
    title_y = request.form.get("title_y")
    try:
        title_x = float(title_x) if title_x not in (None, "") else None
        title_y = float(title_y) if title_y not in (None, "") else None
    except ValueError:
        title_x, title_y = None, None

    title_animation = request.form.get("title_animation", "fade")
    if title_animation not in ("none", "fade", "pop", "slide_up", "bounce", "typewriter"):
        title_animation = "fade"

    transition_type = request.form.get("transition_type", "none")
    if transition_type not in ("none", "dissolve", "slide_left", "slide_right", "slide_up", "slide_down"):
        transition_type = "none"
    try:
        transition_duration = float(request.form.get("transition_duration", 0.5))
    except ValueError:
        transition_duration = 0.5
    transition_duration = max(0.1, min(transition_duration, 2.0))

    filter_name = request.form.get("filter", "none")
    aspect = request.form.get("aspect", "vertical")
    quality = request.form.get("quality", "hd")
    bg_mode = request.form.get("bg_mode", "none")       # none | preset | custom | solid
    bg_preset = request.form.get("bg_preset", "elegant")
    bg_color = request.form.get("bg_color", "#17181d")

    try:
        duration = float(request.form.get("duration", 3))
    except ValueError:
        duration = 3.0
    duration = max(1.0, min(duration, 10.0))

    try:
        music_volume = float(request.form.get("music_volume", 0.8))
    except ValueError:
        music_volume = 0.8
    music_volume = max(0.0, min(music_volume, 1.5))

    if any(m.get("remove_bg") for m in media_items):
        try:
            import rembg  # noqa: F401
        except ImportError:
            shutil.rmtree(job_dir, ignore_errors=True)
            return jsonify({
                "error": "Background removal needs the 'rembg' package on the server. "
                         "Run: pip install rembg onnxruntime"
            }), 400

    output_path = os.path.join(OUTPUT_DIR, f"{job_id}.mp4")
    JOBS[job_id] = {"status": "processing", "error": None, "output": None}

    def worker():
        try:
            generate_video(
                media_items=media_items,
                audio_path=audio_path,
                title_text=title_text or None,
                title_style=title_style,
                title_font=title_font,
                title_color=title_color,
                title_position=title_position,
                title_x=title_x,
                title_y=title_y,
                title_animation=title_animation,
                transition_type=transition_type,
                transition_duration=transition_duration,
                filter_name=filter_name,
                duration_per_image=duration,
                music_volume=music_volume,
                aspect=aspect,
                quality=quality,
                bg_mode=bg_mode,
                bg_preset=bg_preset,
                bg_color=bg_color,
                custom_bg_path=custom_bg_path,
                output_path=output_path,
            )
            JOBS[job_id]["status"] = "done"
            JOBS[job_id]["output"] = f"{job_id}.mp4"
        except Exception as exc:  # noqa: BLE001
            JOBS[job_id]["status"] = "error"
            JOBS[job_id]["error"] = str(exc)
        finally:
            shutil.rmtree(job_dir, ignore_errors=True)

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>")
def api_status(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/preview/<job_id>")
def api_preview(job_id):
    job = JOBS.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Video not ready"}), 404
    return send_from_directory(OUTPUT_DIR, job["output"])


@app.route("/api/download/<job_id>")
def api_download(job_id):
    job = JOBS.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Video not ready"}), 404
    return send_from_directory(OUTPUT_DIR, job["output"], as_attachment=True, download_name="sprocket_video.mp4")


@app.route("/api/animate_card", methods=["POST"])
def api_animate_card():
    """Takes a rendered Card Studio PNG and animates it into a short MP4 using the effects library."""
    image_file = request.files.get("image")
    if not image_file or not image_file.filename:
        return jsonify({"error": "No card image provided."}), 400

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    image_path = os.path.join(job_dir, "card.png")
    image_file.save(image_path)

    effect = request.form.get("effect", "zoom_in")
    effect = effect if effect in VALID_EFFECTS else "zoom_in"
    try:
        width = int(float(request.form.get("width", 1080)))
        height = int(float(request.form.get("height", 1350)))
    except ValueError:
        width, height = 1080, 1350
    try:
        duration = float(request.form.get("duration", 4))
    except ValueError:
        duration = 4.0
    duration = max(2.0, min(duration, 8.0))

    output_path = os.path.join(OUTPUT_DIR, f"{job_id}.mp4")
    JOBS[job_id] = {"status": "processing", "error": None, "output": None}

    def worker():
        try:
            generate_card_animation(image_path, width, height, effect, duration, output_path)
            JOBS[job_id]["status"] = "done"
            JOBS[job_id]["output"] = f"{job_id}.mp4"
        except Exception as exc:  # noqa: BLE001
            JOBS[job_id]["status"] = "error"
            JOBS[job_id]["error"] = str(exc)
        finally:
            shutil.rmtree(job_dir, ignore_errors=True)

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({"job_id": job_id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

