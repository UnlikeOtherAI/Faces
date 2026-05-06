const canvas = document.getElementById("meshCanvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("inputVideo");
const startButton = document.getElementById("startButton");
const centerButton = document.getElementById("centerButton");
const copyDebugButton = document.getElementById("copyDebugButton");
const statusLabel = document.getElementById("statusLabel");
const debugLabel = document.getElementById("debugLabel");
const captureStrip = document.getElementById("captureStrip");

const state = {
  camera: null,
  smoothYaw: 0,
  smoothPitch: 0,
  hasFace: false,
  running: false,
  neutralYaw: 0,
  neutralPitch: 0,
  calibrationFrames: 0,
  latestRawYaw: 0,
  latestRawPitch: 0,
  latestYaw: 0,
  latestPitch: 0,
  latestNosePoint: null,
  activeTargetIndex: 0,
  targetHoldStartedAt: 0,
  captures: [],
};

if (isIOS && !window.isSecureContext) {
  statusLabel.textContent = "iPhone camera needs HTTPS. Open this page with an https:// URL.";
}

function getActiveTarget() {
  return captureTargets[state.activeTargetIndex] || null;
}

function updateDebugLabel() {
  debugLabel.textContent = getDebugText();
}

function getDebugText() {
  const target = getActiveTarget();
  const magnitude = Math.hypot(state.latestYaw, state.latestPitch);
  const holdMs = state.targetHoldStartedAt ? performance.now() - state.targetHoldStartedAt : 0;
  const rows = [
    ["target", target ? `${target.id} ${target.name}` : "complete"],
    ["rawYaw", state.latestRawYaw],
    ["neutralYaw", state.neutralYaw],
    ["yawDelta", state.latestRawYaw - state.neutralYaw],
    ["outputYaw", state.latestYaw],
    ["yawOffset", STRAIGHT_GAZE_YAW_OFFSET],
    ["rawPitch", state.latestRawPitch],
    ["neutralPitch", state.neutralPitch],
    ["pitchDelta", state.latestRawPitch - state.neutralPitch],
    ["outputPitch", state.latestPitch],
    ["pitchOffset", STRAIGHT_GAZE_PITCH_OFFSET],
    ["magnitude", magnitude],
    ["holdMs", holdMs],
  ];

  return rows.map(([label, value]) => {
    const formatted = typeof value === "number" ? formatDebugValue(value) : value;
    return `${label.padEnd(12)}${formatted}`;
  }).join("\n");
}

async function copyDebugValues() {
  const text = getDebugText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
  copyDebugButton.textContent = "Copied";
  window.setTimeout(() => {
    copyDebugButton.textContent = "Copy Debug Values";
  }, 1200);
}

function getMirroredProjectPoint(landmark, crop, videoWidth, videoHeight, canvasWidth, canvasHeight) {
  const point = projectLandmark(landmark, crop, videoWidth, videoHeight, canvasWidth, canvasHeight);
  return { x: canvasWidth - point.x, y: point.y };
}

function drawFaceMeshOverlay(landmarks, crop, videoWidth, videoHeight, canvasWidth, canvasHeight, cx, cy, radius) {
  if (!landmarks || !window.FACEMESH_TESSELATION) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(canvasWidth, 0);
  ctx.scale(-1, 1);
  ctx.strokeStyle = "rgba(57, 255, 20, 0.16)";
  ctx.lineWidth = 1;

  const connections = window.FACEMESH_TESSELATION;
  for (let i = 0; i < connections.length; i += 1) {
    const a = landmarks[connections[i][0]];
    const b = landmarks[connections[i][1]];
    if (!a || !b) continue;

    const p1 = projectLandmark(a, crop, videoWidth, videoHeight, canvasWidth, canvasHeight);
    const p2 = projectLandmark(b, crop, videoWidth, videoHeight, canvasWidth, canvasHeight);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.restore();
}

function getTargetCanvasPoint(target, cx, cy, radius) {
  if (target.id === 6) {
    return state.latestNosePoint || { x: cx, y: cy };
  }

  const distance = radius + 46;
  return {
    x: cx + target.vector.x * distance,
    y: cy + target.vector.y * distance,
  };
}

function drawCaptureTarget(target, cx, cy, radius, activeTarget, now) {
  const point = getTargetCanvasPoint(target, cx, cy, radius);
  const isActive = activeTarget && target.id === activeTarget.id;
  const isCaptured = state.captures.some((capture) => capture.id === target.id);
  const flash = isActive ? 0.62 + Math.sin(now * 0.012) * 0.28 : 0.42;
  const targetRadius = isActive ? 19 + Math.sin(now * 0.012) * 3 : 14;
  const targetColor = themeColor("--target", "#39ff14");
  const targetBackground = themeColor("--target-bg", "#172033");

  ctx.save();
  ctx.globalAlpha = isCaptured && !isActive ? 0.38 : 1;
  ctx.beginPath();
  ctx.arc(point.x, point.y, targetRadius, 0, Math.PI * 2);
  ctx.fillStyle = targetColor;
  ctx.fill();
  ctx.shadowColor = targetColor;
  ctx.shadowBlur = isActive ? 14 * flash : 0;
  ctx.lineWidth = isActive ? 5 : 3;
  ctx.strokeStyle = targetColor;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = targetBackground;
  ctx.font = "800 18px Avenir Next, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(target.id), point.x, point.y + 0.5);
  ctx.restore();
}

function drawCaptureTargets(cx, cy, radius) {
  const activeTarget = getActiveTarget();
  const now = performance.now();
  if (activeTarget) drawCaptureTarget(activeTarget, cx, cy, radius, activeTarget, now);
}

function drawDirectionLines(cx, cy, radius, yaw, pitch, hasFace) {
  const angle = Math.atan2(pitch, yaw);
  const directionMagnitude = Math.hypot(yaw, pitch);
  const hasDirection = hasFace && directionMagnitude >= STRAIGHT_GAZE_THRESHOLD;
  if (!hasDirection) return;

  const waveStrength = clamp((directionMagnitude - STRAIGHT_GAZE_THRESHOLD) / 0.45, 0, 1);
  const lineCount = 96;
  const baseLength = 3;
  const maxExtension = 34 * waveStrength;

  for (let i = 0; i < lineCount; i += 1) {
    const a = (i / lineCount) * Math.PI * 2;
    const diff = shortestAngularDistance(a, angle);
    const influence = Math.exp(-diff * 4.4);
    const shimmer = hasFace ? Math.sin((performance.now() * 0.006) + i * 0.23) * 0.75 * waveStrength : 0;
    const length = baseLength + influence * maxExtension + shimmer;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.lineTo(cx + Math.cos(a) * (radius + length), cy + Math.sin(a) * (radius + length));
    ctx.lineWidth = 5.4;
    ctx.strokeStyle = `rgba(57, 255, 20, ${0.24 + influence * 0.76 * waveStrength})`;
    ctx.stroke();
  }
}

function drawScene(yaw, pitch, hasFace, landmarks = null) {
  syncCanvasResolution();
  const w = CANVAS_LOGICAL_SIZE;
  const h = CANVAS_LOGICAL_SIZE;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.34;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (video.readyState >= 2) {
    const videoW = video.videoWidth || w;
    const videoH = video.videoHeight || h;
    const crop = getVideoCrop(videoW, videoH, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
    ctx.restore();

    if (hasFace && landmarks) {
      state.latestNosePoint = getMirroredProjectPoint(landmarks[1], crop, videoW, videoH, w, h);
      drawFaceMeshOverlay(landmarks, crop, videoW, videoH, w, h, cx, cy, radius);
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--ring").trim();
  ctx.lineWidth = 2;
  ctx.stroke();

  drawDirectionLines(cx, cy, radius, yaw, pitch, hasFace);
  drawCaptureTargets(cx, cy, radius);
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

function captureActiveTarget(target) {
  const src = createCameraSnapshot();
  const capture = { id: target.id, direction: target.direction, name: target.name, src };
  state.captures.push(capture);
  state.activeTargetIndex += 1;
  state.targetHoldStartedAt = 0;
  renderCaptures();
  dispatchPhotoCapturedEvent(capture);
  const nextTarget = getActiveTarget();
  statusLabel.textContent = nextTarget ? `Captured ${target.id}.` : "Capture sequence complete.";
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

function targetMatchesGaze(target) {
  if (!state.hasFace || !target) return false;
  const magnitude = Math.hypot(state.smoothYaw, state.smoothPitch);
  if (target.id === 6) return magnitude < STRAIGHT_GAZE_THRESHOLD;
  if (magnitude < TARGET_MIN_MAGNITUDE) return false;
  const dot = (state.smoothYaw / magnitude) * target.vector.x
    + (state.smoothPitch / magnitude) * target.vector.y;
  return dot >= TARGET_DOT_THRESHOLD;
}

function updateCaptureSequence() {
  const target = getActiveTarget();
  if (!target || !targetMatchesGaze(target)) {
    state.targetHoldStartedAt = 0;
    return;
  }

  if (!state.targetHoldStartedAt) state.targetHoldStartedAt = performance.now();
  if (performance.now() - state.targetHoldStartedAt >= TARGET_HOLD_MS) {
    captureActiveTarget(target);
  }
}

drawScene(0, 0, false);
updateDebugLabel();

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
    state.latestNosePoint = null;
    state.targetHoldStartedAt = 0;
    drawScene(state.smoothYaw, state.smoothPitch, false, null);
    updateDebugLabel();
    statusLabel.textContent = "Face not detected.";
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
  updateDebugLabel();

  const smoothMagnitude = Math.hypot(state.smoothYaw, state.smoothPitch);
  if (getActiveTarget()) {
    statusLabel.textContent = state.calibrationFrames < 30
      ? "Calibrating... keep head neutral."
      : `Target ${getActiveTarget().id}: ${getActiveTarget().name}`;
  } else if (smoothMagnitude < STRAIGHT_GAZE_THRESHOLD) {
    statusLabel.textContent = "Looking straight.";
  }
});

async function start() {
  if (state.running) return;
  startButton.disabled = true;
  statusLabel.textContent = "Requesting webcam permission...";

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
    state.activeTargetIndex = 0;
    state.targetHoldStartedAt = 0;
    renderCaptures();
    statusLabel.textContent = "Calibrating... keep head neutral.";
    startButton.textContent = "Webcam Started";
    centerButton.disabled = false;
  } catch (error) {
    statusLabel.textContent = `Webcam error: ${formatCameraError(error)}`;
    startButton.disabled = false;
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
  updateDebugLabel();
  drawScene(0, 0, state.hasFace, null);
}

startButton.addEventListener("click", start);
centerButton.addEventListener("click", setStraight);
copyDebugButton.addEventListener("click", copyDebugValues);
window.addEventListener("resize", () => drawScene(state.smoothYaw, state.smoothPitch, state.hasFace, null));
window.facesBasicDebug = {
  state,
  captureTargets,
  CaptureDirection,
  PHOTO_CAPTURED_EVENT,
  drawScene,
  captureActiveTarget,
  targetMatchesGaze,
  updateCaptureSequence,
  updateDebugLabel,
};
