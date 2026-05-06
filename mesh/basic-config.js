const CANVAS_LOGICAL_SIZE = 640;
const STRAIGHT_GAZE_THRESHOLD = 0.16;
const STRAIGHT_GAZE_YAW_OFFSET = -0.0676;
const STRAIGHT_GAZE_PITCH_OFFSET = 0.1049;
const TARGET_MIN_MAGNITUDE = 0.34;
const TARGET_DOT_THRESHOLD = 0.78;
const TARGET_HOLD_MS = 1000;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const formatDebugValue = (value) => value.toFixed(4).padStart(7, " ");
const themeColor = (name, fallback) => (
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
);

const normalize = ({ x, y }) => {
  const magnitude = Math.hypot(x, y) || 1;
  return { x: x / magnitude, y: y / magnitude };
};

const captureTargets = [
  { id: 1, name: "top left", vector: normalize({ x: -1, y: -1 }) },
  { id: 2, name: "up", vector: normalize({ x: 0, y: -1 }) },
  { id: 3, name: "top right", vector: normalize({ x: 1, y: -1 }) },
  { id: 4, name: "bottom right", vector: normalize({ x: 1, y: 1 }) },
  { id: 5, name: "bottom left", vector: normalize({ x: -1, y: 1 }) },
  { id: 6, name: "look straight", vector: null },
];

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function getCameraUnavailableMessage() {
  if (!window.isSecureContext) {
    return "Camera needs HTTPS on iPhone. Open this page with https:// on your phone.";
  }
  return isIOS
    ? "Camera API unavailable. On iPhone, open this page in Safari."
    : "Camera API unavailable in this browser.";
}

async function requestCameraStream(constraints) {
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  throw new Error(getCameraUnavailableMessage());
}

const cameraErrorMessages = {
  NotAllowedError: "Camera permission denied. Enable camera access for this site in Safari settings.",
  PermissionDeniedError: "Camera permission denied. Enable camera access for this site in Safari settings.",
  NotFoundError: "No camera was found on this device.",
  DevicesNotFoundError: "No camera was found on this device.",
  NotReadableError: "Camera is busy or unavailable. Close other camera apps and retry.",
  TrackStartError: "Camera is busy or unavailable. Close other camera apps and retry.",
  OverconstrainedError: "Requested camera settings are unsupported on this device.",
  ConstraintNotSatisfiedError: "Requested camera settings are unsupported on this device.",
};

function formatCameraError(error) {
  const name = error && error.name ? error.name : "";
  if (!window.isSecureContext) {
    return "Camera requires HTTPS on iPhone. Use an https:// URL.";
  }
  return cameraErrorMessages[name] || (error && error.message ? error.message : String(error));
}

function shortestAngularDistance(a, b) {
  const tau = Math.PI * 2;
  let diff = (a - b) % tau;
  if (diff > Math.PI) diff -= tau;
  if (diff < -Math.PI) diff += tau;
  return Math.abs(diff);
}

function getVideoCrop(videoWidth, videoHeight, canvasWidth, canvasHeight) {
  const canvasAspect = canvasWidth / canvasHeight;
  const videoAspect = videoWidth / videoHeight;
  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (videoAspect > canvasAspect) {
    sw = videoHeight * canvasAspect;
    sx = (videoWidth - sw) / 2;
  } else {
    sh = videoWidth / canvasAspect;
    sy = (videoHeight - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

function projectLandmark(landmark, crop, videoWidth, videoHeight, canvasWidth, canvasHeight) {
  const xPx = landmark.x * videoWidth;
  const yPx = landmark.y * videoHeight;
  return {
    x: ((xPx - crop.sx) / crop.sw) * canvasWidth,
    y: ((yPx - crop.sy) / crop.sh) * canvasHeight,
  };
}
