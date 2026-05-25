const canvas = document.getElementById("meshCanvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("inputVideo");
const centerButton = document.getElementById("centerButton");
const primaryButton = document.getElementById("primaryButton");
const statusLabel = document.getElementById("statusLabel");
const progressLabel = document.getElementById("progressLabel");
const captureStrip = document.getElementById("captureStrip");

const VIDEO_RADIUS = 282;
const RING_GAP = 10;
const RING_INNER_RADIUS = VIDEO_RADIUS + RING_GAP;
const RING_OUTER_RADIUS = 314;
const RING_SEGMENTS = 72;
// Half-width of the arc painted around each captured direction (~45°).
const CAPTURED_ARC_HALF = Math.PI / 4;

function postBridge(type, payload) {
  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload })); } catch {}
  }
}

const state = {
  camera: null,
  smoothYaw: 0,
  smoothPitch: 0,
  hasFace: false,
  running: false,
  neutralYaw: 0,
  neutralPitch: 0,
  calibrationFrames: 0,
  mode: "intro",
  latestRawYaw: 0,
  latestRawPitch: 0,
  latestYaw: 0,
  latestPitch: 0,
  capturedIds: new Set(),
  currentMatchedTargetId: null,
  targetHoldStartedAt: 0,
  litSegments: new Set(),
  doneImage: null,
  captures: [],
};

if (isIOS && !window.isSecureContext) {
  statusLabel.textContent = "iPhone camera needs HTTPS. Open this page with an https:// URL.";
}

function setUiMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  if (primaryButton) primaryButton.textContent = mode === "done" ? "Continue" : "Get Started";
}

function getHoldFraction() {
  if (!state.currentMatchedTargetId || !state.targetHoldStartedAt) return 0;
  return clamp((performance.now() - state.targetHoldStartedAt) / TARGET_HOLD_MS, 0, 1);
}

function getCaptureProgress() {
  return Math.min((state.capturedIds.size + getHoldFraction()) / captureTargets.length, 1);
}

function updateProgressLabel() {
  if (!progressLabel) return;
  progressLabel.textContent = `${Math.round(getCaptureProgress() * 100)}%`;
}

function targetMatchesGaze(target) {
  if (!state.hasFace || !target) return false;
  const magnitude = Math.hypot(state.smoothYaw, state.smoothPitch);
  if (target.id === 6) return magnitude < STRAIGHT_GAZE_THRESHOLD;
  if (magnitude < TARGET_MIN_MAGNITUDE) return false;
  const dot = (state.smoothYaw / magnitude) * target.vector.x
    + (state.smoothPitch / magnitude) * target.vector.y;
  return dot >= TARGET_DOT_THRESHOLD;
}

function findCurrentMatchingTarget() {
  for (const target of captureTargets) {
    if (state.capturedIds.has(target.id)) continue;
    if (targetMatchesGaze(target)) return target;
  }
  return null;
}

function drawRing(cx, cy, segmentColor) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  for (let i = 0; i < RING_SEGMENTS; i += 1) {
    const angle = -Math.PI / 2 - (i / RING_SEGMENTS) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * RING_INNER_RADIUS, cy + Math.sin(angle) * RING_INNER_RADIUS);
    ctx.lineTo(cx + Math.cos(angle) * RING_OUTER_RADIUS, cy + Math.sin(angle) * RING_OUTER_RADIUS);
    ctx.strokeStyle = segmentColor(i);
    ctx.stroke();
  }
  ctx.restore();
}

function angularDistance(a, b) {
  let diff = ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return Math.abs(diff);
}

function scanSegmentColor(i) {
  if (state.litSegments.has(i)) return themeColor("--ring-active", "#08bd79");
  return themeColor("--ring-idle", "#cac3b4");
}

function paintCapturedArc(target) {
  if (!target.vector) return;
  const angle = Math.atan2(target.vector.y, target.vector.x);
  for (let i = 0; i < RING_SEGMENTS; i += 1) {
    const segmentAngle = -Math.PI / 2 - (i / RING_SEGMENTS) * Math.PI * 2;
    if (angularDistance(segmentAngle, angle) <= CAPTURED_ARC_HALF) state.litSegments.add(i);
  }
}

function drawFaceIdIcon(cx, cy) {
  ctx.save();
  ctx.strokeStyle = themeColor("--muted", "#918b81");
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeRect(cx - 24, cy - 24, 48, 48);
  ctx.clearRect(cx - 14, cy - 31, 28, 62);
  ctx.clearRect(cx - 31, cy - 14, 62, 28);
  ctx.beginPath();
  ctx.arc(cx - 10, cy - 2, 2, 0, Math.PI * 2);
  ctx.arc(cx + 10, cy - 2, 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 9, 13, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawDoneAvatar(cx, cy) {
  if (!state.doneImage) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(state.doneImage, cx - 38, cy - 38, 76, 76);
  ctx.restore();
}

function drawScene(yaw, pitch, hasFace, landmarks = null) {
  syncCanvasResolution();
  const w = CANVAS_LOGICAL_SIZE;
  const h = CANVAS_LOGICAL_SIZE;
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = themeColor("--bg", "#f5f3f0");
  ctx.fillRect(0, 0, w, h);
  updateProgressLabel();

  const idleColor = themeColor("--ring-idle", "#cac3b4");
  const activeColor = themeColor("--ring-active", "#08bd79");

  if (state.mode === "intro") {
    drawRing(cx, cy, () => idleColor);
    drawFaceIdIcon(cx, cy);
    return;
  }

  if (state.mode === "done") {
    drawRing(cx, cy, () => activeColor);
    drawDoneAvatar(cx, cy);
    return;
  }

  if (video.readyState >= 2) {
    const videoW = video.videoWidth || w;
    const videoH = video.videoHeight || h;
    const crop = getVideoCrop(videoW, videoH, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, VIDEO_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
    ctx.restore();
  }

  drawRing(cx, cy, scanSegmentColor);
}

function syncCanvasResolution() {
  const rect = canvas.getBoundingClientRect();
  const cssSize = Math.max(1, Math.round(rect.width || CANVAS_LOGICAL_SIZE));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const nextSize = Math.round(cssSize * dpr);

  if (canvas.width !== nextSize || canvas.height !== nextSize) {
    canvas.width = nextSize;
    canvas.height = nextSize;
  }

  const scale = canvas.width / CANVAS_LOGICAL_SIZE;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function renderCaptures() {
  captureStrip.replaceChildren(...state.captures.map((capture) => {
    const item = document.createElement("figure");
    const image = document.createElement("img");
    const label = document.createElement("span");
    item.className = "capture";
    image.src = capture.src;
    image.alt = `Capture ${capture.id}`;
    label.textContent = String(capture.id);
    item.append(image, label);
    return item;
  }));
}

function createCameraSnapshot() {
  const output = document.createElement("canvas");
  const size = 320;
  output.width = size;
  output.height = size;
  const outputCtx = output.getContext("2d");
  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, size, size);

  if (video.readyState >= 2) {
    const crop = getVideoCrop(video.videoWidth || size, video.videoHeight || size, size, size);
    outputCtx.translate(size, 0);
    outputCtx.scale(-1, 1);
    outputCtx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size, size);
  } else {
    outputCtx.drawImage(canvas, 0, 0, size, size);
  }

  return output.toDataURL("image/jpeg", 0.88);
}

function captureTarget(target) {
  const src = createCameraSnapshot();
  const capture = { id: target.id, direction: target.direction, name: target.name, src };
  state.captures.push(capture);
  state.capturedIds.add(target.id);
  state.currentMatchedTargetId = null;
  state.targetHoldStartedAt = 0;
  paintCapturedArc(target);
  renderCaptures();
  dispatchPhotoCapturedEvent(capture);
  postBridge("capture", {
    id: capture.id,
    name: capture.name,
    direction: capture.direction,
    src: capture.src,
    index: state.captures.length - 1,
    total: captureTargets.length,
  });
  const allDone = state.capturedIds.size === captureTargets.length;
  const onlyStraightLeft = state.capturedIds.size === captureTargets.length - 1 && !state.capturedIds.has(6);
  statusLabel.textContent = allDone ? "All done!" : onlyStraightLeft ? "Look straight into the camera" : "Move your head slowly around";
  if (allDone) {
    const image = new Image();
    image.onload = () => {
      state.doneImage = image;
      drawScene(state.smoothYaw, state.smoothPitch, state.hasFace, null);
    };
    image.src = capture.src;
    setUiMode("done");
    postBridge("complete", {
      captures: state.captures.map((c) => ({ id: c.id, name: c.name, direction: c.direction, src: c.src })),
    });
  }
}

function dispatchPhotoCapturedEvent(capture) {
  window.dispatchEvent(new CustomEvent(PHOTO_CAPTURED_EVENT, {
    detail: {
      direction: capture.direction, photoDataUrl: capture.src,
      targetId: capture.id,
      targetName: capture.name,
      captureIndex: state.captures.length - 1,
      totalCaptures: state.captures.length,
    },
  }));
}

function updateCaptureSequence() {
  const matched = findCurrentMatchingTarget();
  if (!matched) {
    state.currentMatchedTargetId = null;
    state.targetHoldStartedAt = 0;
    return;
  }
  if (matched.id !== state.currentMatchedTargetId) {
    state.currentMatchedTargetId = matched.id;
    state.targetHoldStartedAt = performance.now();
    return;
  }
  if (performance.now() - state.targetHoldStartedAt >= TARGET_HOLD_MS) {
    captureTarget(matched);
  }
}

drawScene(0, 0, false);

const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.55,
  minTrackingConfidence: 0.55,
});

faceMesh.onResults((results) => {
  const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
  if (!landmarks) {
    state.hasFace = false;
    state.smoothYaw = lerp(state.smoothYaw, 0, 0.12);
    state.smoothPitch = lerp(state.smoothPitch, 0, 0.12);
    state.targetHoldStartedAt = 0;
    state.currentMatchedTargetId = null;
    drawScene(state.smoothYaw, state.smoothPitch, false, null);
    if (state.mode === "scan") statusLabel.textContent = "Face not detected.";
    return;
  }

  const nose = landmarks[1];
  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftFaceSide = landmarks[234];
  const rightFaceSide = landmarks[454];
  const eyeMidY = (leftEyeOuter.y + rightEyeOuter.y) * 0.5;
  const eyeDistance = Math.max(
    Math.hypot(rightEyeOuter.x - leftEyeOuter.x, rightEyeOuter.y - leftEyeOuter.y),
    0.0001,
  );
  const faceCenterX = (leftFaceSide.x + rightFaceSide.x) * 0.5;
  const faceWidth = Math.max(
    Math.hypot(rightFaceSide.x - leftFaceSide.x, rightFaceSide.y - leftFaceSide.y),
    0.0001,
  );
  const faceHeight = Math.max(chin.y - forehead.y, 0.0001);
  const faceCenterY = forehead.y + faceHeight * 0.5;
  const dx = nose.x - faceCenterX;
  const dy = nose.y - faceCenterY;
  const roll = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x);
  const alignedX = dx * Math.cos(-roll) - dy * Math.sin(-roll);
  const alignedY = dx * Math.sin(-roll) + dy * Math.cos(-roll);
  const rawYaw = alignedX / faceWidth;
  const rawPitchFromCenter = alignedY / faceHeight;
  const rawPitchFromEyes = (nose.y - eyeMidY) / eyeDistance;
  const rawPitch = rawPitchFromCenter * 0.62 + rawPitchFromEyes * 0.38;
  state.latestRawYaw = rawYaw;
  state.latestRawPitch = rawPitch;

  if (state.calibrationFrames < 30) {
    state.calibrationFrames += 1;
    state.neutralYaw = lerp(state.neutralYaw, rawYaw, 0.15);
    state.neutralPitch = lerp(state.neutralPitch, rawPitch, 0.15);
  }

  let yaw = -((rawYaw - state.neutralYaw) / 0.11) + STRAIGHT_GAZE_YAW_OFFSET;
  let pitch = (rawPitch - state.neutralPitch) / 0.13;
  if (pitch < 0) pitch *= 1.3;
  if (pitch > 0) pitch *= 1.12;
  pitch += STRAIGHT_GAZE_PITCH_OFFSET;
  if (Math.abs(yaw) > 0.7) pitch *= 0.85;
  if (Math.abs(pitch) > 0.35 && Math.abs(yaw) < 0.4) yaw *= 0.2;
  if (Math.abs(pitch) > 0.55 && Math.abs(yaw) < 0.28) yaw = 0;
  if (Math.abs(yaw) < 0.03) yaw = 0;
  if (Math.abs(pitch) < 0.03) pitch = 0;

  yaw = clamp(yaw, -1.2, 1.2);
  pitch = clamp(pitch, -1.2, 1.2);
  state.smoothYaw = lerp(state.smoothYaw, yaw, 0.22);
  state.smoothPitch = lerp(state.smoothPitch, pitch, 0.22);
  state.latestYaw = yaw;
  state.latestPitch = pitch;
  state.hasFace = true;

  drawScene(state.smoothYaw, state.smoothPitch, true, landmarks);
  updateCaptureSequence();

  if (state.capturedIds.size >= captureTargets.length) {
    statusLabel.textContent = "All done!";
  } else if (state.calibrationFrames < 30) {
    statusLabel.textContent = "Hold still for a moment";
  } else if (state.capturedIds.size === captureTargets.length - 1 && !state.capturedIds.has(6)) {
    statusLabel.textContent = "Look straight into the camera";
  } else {
    statusLabel.textContent = "Move your head slowly around";
  }
});

async function start() {
  if (state.running) return;
  setUiMode("scan");
  statusLabel.textContent = "Requesting camera permission...";

  try {
    const stream = await requestCameraStream({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    state.camera = new Camera(video, {
      width: 1280,
      height: 720,
      onFrame: async () => {
        await faceMesh.send({ image: video });
      },
    });

    state.camera.start();
    state.running = true;
    state.neutralYaw = 0;
    state.neutralPitch = 0;
    state.calibrationFrames = 0;
    state.smoothYaw = 0;
    state.smoothPitch = 0;
    state.captures = [];
    state.doneImage = null;
    state.capturedIds = new Set();
    state.currentMatchedTargetId = null;
    state.targetHoldStartedAt = 0;
    state.litSegments = new Set();
    renderCaptures();
    statusLabel.textContent = "Hold still for a moment";
    centerButton.disabled = false;
    postBridge("ready", {});
  } catch (error) {
    const message = formatCameraError(error);
    statusLabel.textContent = `Webcam error: ${message}`;
    postBridge("error", { message });
  }
}

function setStraight() {
  state.neutralYaw = state.latestRawYaw;
  state.neutralPitch = state.latestRawPitch;
  state.calibrationFrames = 30;
  state.smoothYaw = 0;
  state.smoothPitch = 0;
  state.latestYaw = 0;
  state.latestPitch = 0;
  statusLabel.textContent = "Looking straight.";
  drawScene(0, 0, state.hasFace, null);
}

primaryButton.addEventListener("click", () => {
  if (state.mode === "done") {
    postBridge("continue", {
      captures: state.captures.map((c) => ({ id: c.id, name: c.name, direction: c.direction, src: c.src })),
    });
    return;
  }
  start();
});
centerButton.addEventListener("click", setStraight);
window.addEventListener("resize", () => drawScene(state.smoothYaw, state.smoothPitch, state.hasFace, null));
setUiMode("intro");
window.facesBasicDebug = {
  state,
  captureTargets,
  CaptureDirection,
  PHOTO_CAPTURED_EVENT,
  drawScene,
  captureTarget,
  targetMatchesGaze,
  updateCaptureSequence,
};
