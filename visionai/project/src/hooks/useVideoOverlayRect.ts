import { useState, useEffect, useCallback, RefObject, CSSProperties } from 'react';

export interface VideoOverlayRect {
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  ready: boolean;
}

const EMPTY: VideoOverlayRect = { offsetX: 0, offsetY: 0, displayWidth: 0, displayHeight: 0, ready: false };

/**
 * A <video> element renders its content centered and letterboxed/pillarboxed
 * to fit its box while preserving aspect ratio (the browser's built-in
 * "contain" behavior) - unless the video's intrinsic aspect ratio exactly
 * matches the container's, there are black bars on two sides.
 *
 * Bounding boxes from the backend are percentages of the SOURCE FRAME, not
 * of the container element. Without this correction, overlay boxes get
 * squeezed into whatever fraction of the container the video visually
 * occupies, and end up in the wrong place - which is exactly the bug this
 * hook fixes: it computes the real on-screen rectangle the video pixels
 * occupy, so callers can convert a bbox percentage into an accurate pixel
 * position within that rectangle.
 */
export function useVideoOverlayRect(
  videoRef: RefObject<HTMLVideoElement>,
  containerRef: RefObject<HTMLElement>
): VideoOverlayRect {
  const [rect, setRect] = useState<VideoOverlayRect>(EMPTY);

  const recompute = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth || !video.videoHeight) {
      setRect(EMPTY);
      return;
    }
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = containerWidth / containerHeight;

    let displayWidth: number, displayHeight: number, offsetX: number, offsetY: number;
    if (videoAspect > containerAspect) {
      // Video is relatively wider than the container -> full width, letterboxed top/bottom
      displayWidth = containerWidth;
      displayHeight = containerWidth / videoAspect;
      offsetX = 0;
      offsetY = (containerHeight - displayHeight) / 2;
    } else {
      // Video is relatively taller than the container -> full height, pillarboxed left/right
      displayHeight = containerHeight;
      displayWidth = containerHeight * videoAspect;
      offsetY = 0;
      offsetX = (containerWidth - displayWidth) / 2;
    }
    setRect({ offsetX, offsetY, displayWidth, displayHeight, ready: true });
  }, [videoRef, containerRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'resize'];
    events.forEach((ev) => video.addEventListener(ev, recompute));
    window.addEventListener('resize', recompute);
    recompute();
    // Also retry a few times shortly after mount - covers the case where the
    // video src loads asynchronously and no event fires before first paint.
    const retryTimers = [100, 300, 800, 1500].map((ms) => window.setTimeout(recompute, ms));
    return () => {
      events.forEach((ev) => video.removeEventListener(ev, recompute));
      window.removeEventListener('resize', recompute);
      retryTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [videoRef, recompute]);

  return rect;
}

/** Converts a [x%, y%, w%, h%] bbox (relative to the source frame) into real pixel
 *  left/top/width/height within the container, using the video's actual on-screen rect. */
export function bboxToPixelStyle(bboxPct: number[], rect: VideoOverlayRect): CSSProperties {
  const [x, y, w, h] = bboxPct;
  if (!rect.ready) {
    // Fallback: percentage-of-container positioning. Not pixel-perfect if the video's
    // aspect ratio differs from the container's, but guarantees the box is visible
    // instead of disappearing while we wait for real video metadata to load.
    return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` };
  }
  return {
    left: rect.offsetX + (x / 100) * rect.displayWidth,
    top: rect.offsetY + (y / 100) * rect.displayHeight,
    width: (w / 100) * rect.displayWidth,
    height: (h / 100) * rect.displayHeight,
  };
}
