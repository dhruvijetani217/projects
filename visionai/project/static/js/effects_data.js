// Mirrors effects.py — categories + labels for the picker, and a "previewKind" used to
// drive an approximate CSS @keyframes animation on the live canvas preview.
const EFFECT_CATEGORIES = {
  "Basic": [
    { v: "none", l: "None", k: "none" },
    { v: "fade", l: "Fade", k: "fade" },
    { v: "dissolve", l: "Dissolve", k: "fade" },
  ],
  "Zoom": [
    { v: "zoom_in", l: "Zoom In", k: "zoom-in" },
    { v: "zoom_out", l: "Zoom Out", k: "zoom-out" },
    { v: "zoom_bounce", l: "Zoom Bounce", k: "zoom-bounce" },
    { v: "in_and_out", l: "In & Out", k: "in-out" },
    { v: "pulse", l: "Pulse", k: "pulse" },
    { v: "zoom_ripple", l: "Zoom Ripple", k: "pulse" },
  ],
  "Pan": [
    { v: "pan_left", l: "Pan Left", k: "pan-left" },
    { v: "pan_right", l: "Pan Right", k: "pan-right" },
    { v: "pan_up", l: "Pan Up", k: "pan-up" },
    { v: "pan_down", l: "Pan Down", k: "pan-down" },
    { v: "pan_around", l: "Pan Around", k: "pan-around" },
  ],
  "Slide": [
    { v: "slide_left", l: "Slide from Left", k: "slide-left" },
    { v: "slide_right", l: "Slide from Right", k: "slide-right" },
    { v: "slide_up", l: "Slide from Bottom", k: "slide-up" },
    { v: "slide_down", l: "Slide from Top", k: "slide-down" },
    { v: "slide_bounce", l: "Slide Bounce", k: "slide-left" },
  ],
  "Wipe / Reveal": [
    { v: "wipe_left", l: "Wipe Left", k: "wipe-left" },
    { v: "wipe_right", l: "Wipe Right", k: "wipe-right" },
    { v: "wipe_up", l: "Wipe Up", k: "wipe-up" },
    { v: "wipe_down", l: "Wipe Down", k: "wipe-down" },
    { v: "light_wipe", l: "Light Wipe", k: "wipe-left" },
    { v: "reveal", l: "Reveal", k: "reveal" },
    { v: "circle_in", l: "Circle In", k: "circle-in" },
    { v: "circle_out", l: "Circle Out", k: "circle-out" },
    { v: "clock_wipe", l: "Clock Wipe", k: "spin" },
    { v: "scanner_vertical", l: "Scanner", k: "none" },
  ],
  "Camera": [
    { v: "shake", l: "Shake", k: "shake" },
    { v: "shake_zoom", l: "Shake + Zoom", k: "shake" },
    { v: "spin", l: "Spin", k: "spin" },
    { v: "rotate_warp", l: "Rotate Warp", k: "spin" },
    { v: "swirl", l: "Swirl (approx)", k: "spin" },
    { v: "flare", l: "Flare", k: "none" },
    { v: "exposure", l: "Exposure Flash", k: "exposure" },
    { v: "blur", l: "Blur to Focus", k: "blur" },
    { v: "flicker", l: "Flicker", k: "flicker" },
  ],
  "Stretch": [
    { v: "horizontal_stretch", l: "Horizontal Stretch", k: "hstretch" },
    { v: "vertical_stretch", l: "Vertical Stretch", k: "vstretch" },
  ],
};

const EFFECT_LABELS = {};
Object.values(EFFECT_CATEGORIES).flat().forEach(e => { EFFECT_LABELS[e.v] = e.l; });
