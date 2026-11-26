import { labMotion } from "../lab/motion.js";
import { projectWords, rows } from "./optics.js?v=2";
import { createLetterField, glyphPoint } from "./letter-field.js?v=2";
import { alignOpeningAnchor, recastProjection, writeFold } from "./chapters.js?v=2";
import { initializeProof } from "./proof.js";
import {
  carry, clamp, exposureLag, exposures, glide, lensPass, limit, mix,
  scoreAt, scoreDuration, waveDuration,
} from "./kinetics.js";

const legacy = new Set(["#playground", "#notes"]);
if (legacy.has(location.hash)) location.replace(new URL("playground/" + location.hash, location.href));

const stage = document.querySelector("#exhibit");
const poster = document.querySelector("#opening");
const scene = document.querySelector("#exhibit-scene");
const fallback = document.querySelector("#exhibit-fallback");
const view = document.querySelector("#exhibit-view");
const count = document.querySelector("#exhibit-count");
const reading = document.querySelector("#exhibit-reading");
const degrees = document.querySelector("#exhibit-angle");
const slider = document.querySelector("#angle");
const poseButtons = [...document.querySelectorAll("[data-pose]")];
const motion = document.querySelector("#motion");
const entrances = document.querySelector("#lab-entrances");
const form = document.querySelector("#word-form");
const firstInput = document.querySelector("#first-word");
const secondInput = document.querySelector("#second-word");
const draftImpression = document.querySelector("#draft-impression");
const message = document.querySelector("#word-note");
const studyButtons = [...document.querySelectorAll("[data-study]")];
const studyHint = document.querySelector("#study-hint");
const studyAction = document.querySelector("#study-action");
const playScore = document.querySelector("#sweep");
const scoreControls = document.querySelector("#score-controls");
const scoreTime = document.querySelector("#score-time");
const scoreClock = document.querySelector("#score-clock");
const scoreClose = document.querySelector("#score-close");

const defaults = ["READ", "MAKE"];
const valid = /^[A-Z]{2,6}$/u;
const studies = {
  momentum: {
    action: "Fling the type",
    hint: "Drag and release. The faster you move, the farther the letters coast.",
    still: "Drag the artwork for direct control, or jump to the other reading.",
    stillAction: "Turn to the other side",
  },
  lens: {
    action: "Pass the lens",
    hint: "Move across the letters, or drag a finger through them. The lens bends and splits the type.",
    still: "Click or tap the artwork to place a still lens.",
    stillAction: "Show a still lens",
  },
  resonance: {
    action: "Strike the type",
    hint: "Tap anywhere in the artwork. Strike it again before the first wave fades to cross two waves.",
    still: "Click or tap the artwork to place a still wave.",
    stillAction: "Show a still wave",
  },
  exposure: {
    action: "Turn with exposure",
    hint: "Turn the sculpture. Three earlier angles linger as separate impressions.",
    still: "Overlay three fixed angles on the present reading.",
    stillAction: "Show an exposure",
  },
};

let words = defaults;
let angle = -limit;
let sceneAngle = -limit;
let study = "momentum";
let bounds;
let renderer;
let frame = 0;
let rotation;
let gesture;
let lens = { x: 0.5, y: 0.5, power: 0 };
let lensTarget;
let lensStart;
let lastLensFrame;
let strikes = [];
let stillExposure = false;
let historyOfAngles = [];
let lastTurn = -Infinity;
let scoreOpen = false;
let scorePosition = 0;
let scoreOrigin;

function readingsFromAddress() {
  const params = new URLSearchParams(location.search);
  const first = params.get("first")?.toUpperCase();
  const second = params.get("second")?.toUpperCase();
  return valid.test(first ?? "") && valid.test(second ?? "") ? [first, second] : defaults;
}

function measure() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const artWidth = width * 0.86;
  const artHeight = Math.min(height * 0.59, width * 0.315);
  const fontSize = Math.max(5, Math.min(18, artHeight * 1.22 / rows));
  const maxPitch = Math.min(13, 23 * height / width);
  bounds = { width, height, artWidth, artHeight, fontSize, maxPitch };
  stage.style.setProperty("--world-width", artWidth + "px");
  stage.style.setProperty("--world-height", artHeight + "px");
  stage.style.setProperty("--glyph-size", fontSize + "px");
  stage.style.setProperty("--max-pitch", maxPitch + "deg");
  renderer?.measure(bounds);
  queueFrame();
}

function shape() {
  fallback.hidden = false;
  stage.removeAttribute("data-points");
  scene.replaceChildren();
  count.textContent = "";
  renderer?.setGlyphs([]);
  try {
    const marks = words.join("");
    const points = projectWords(...words).map((point, index) => glyphPoint(
      point, marks[(index * 5 + Math.floor(index / 11)) % marks.length], index,
    ));
    if (!points.length) return;
    const fragment = document.createDocumentFragment();
    for (const glyph of points) {
      const node = document.createElement("span");
      node.className = "particle";
      node.textContent = glyph.letter;
      node.style.setProperty("--x", glyph.x.toFixed(6));
      node.style.setProperty("--y", glyph.y.toFixed(6));
      node.style.setProperty("--z", glyph.z.toFixed(6));
      node.style.setProperty("--density", glyph.density.toFixed(3));
      fragment.append(node);
    }
    renderer?.setGlyphs(points);
    scene.replaceChildren(fragment);
    count.textContent = points.length + " characters";
    stage.setAttribute("data-points", "");
    fallback.hidden = true;
  } catch {
    // Keep the two plain-text views when a browser cannot sample outlines.
  }
}

function syncAngle() {
  const step = Math.round(angle * 2) / 2;
  if (Number(slider.value) !== step) slider.value = step;
  const signed = (step < 0 ? "−" : step > 0 ? "+" : "") + Math.abs(step).toFixed(1);
  if (degrees.textContent !== signed + "°") {
    degrees.textContent = signed + "°";
    slider.setAttribute("aria-valuetext", signed + " degrees");
  }

  const first = angle <= -limit;
  const second = angle >= limit;
  const side = first ? "read" : second ? "make" : "middle";
  const label = first ? "First projection" : second ? "Second projection" : "Between projections";
  if (view.textContent !== label) view.textContent = label;
  const line = first ? words[0] : second ? words[1] : words.join(" / ");
  if (reading.textContent !== line) reading.textContent = line;
  if (!fallback.hidden && fallback.textContent !== line) fallback.textContent = line;
  const palette = angle < 0 ? "read" : "make";
  if (stage.dataset.palette !== palette) stage.dataset.palette = palette;
  if (entrances.dataset.facing !== side) entrances.dataset.facing = side;

  for (const button of poseButtons) {
    const pressed = String(Number(button.dataset.pose) === angle);
    if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
  }
}

function placeAngle(value) {
  const next = clamp(value, -limit, limit);
  if (next === angle) return;
  angle = next;
  const progress = (angle + limit) / (2 * limit);
  stage.style.setProperty("--rotation-progress", progress);
  poster.style.setProperty("--press-position", progress);
  syncAngle();
}

function placeScene() {
  // The text nodes only need camera updates when their layer is visible.
  if (sceneAngle === angle) return;
  sceneAngle = angle;
  stage.style.setProperty("--yaw", angle + "deg");
  stage.style.setProperty("--depth", 1 - Math.abs(angle) / limit);
}

function startTurn(path) {
  if (labMotion.matches) {
    placeAngle(path.target);
  } else {
    rotation = { ...path, start: performance.now() };
  }
  queueFrame();
}

function resetEffects() {
  rotation = undefined;
  lens = { x: 0.5, y: 0.5, power: 0 };
  lensTarget = undefined;
  lensStart = undefined;
  lastLensFrame = undefined;
  strikes = [];
  stillExposure = false;
  historyOfAngles = [{ time: performance.now() - exposureLag, angle }];
  lastTurn = -Infinity;
}

function recordAngle(now) {
  if (historyOfAngles.at(-1)?.angle !== angle) lastTurn = now;
  historyOfAngles.push({ time: now, angle });
  while (historyOfAngles.length > 2 && historyOfAngles[1].time < now - exposureLag) historyOfAngles.shift();
  return exposures(angle, lag => {
    const time = now - lag;
    const after = historyOfAngles.findIndex(record => record.time >= time);
    if (after <= 0) return historyOfAngles[0].angle;
    const previous = historyOfAngles[after - 1];
    const next = historyOfAngles[after];
    return mix(previous.angle, next.angle, (time - previous.time) / (next.time - previous.time));
  });
}

function traceLayers(now) {
  if (study !== "exposure") return [];
  if (!labMotion.matches) return recordAngle(now);
  if (!stillExposure) return [];
  const other = angle > 0 ? -limit : limit;
  return exposures(angle, lag => mix(angle, other, 0.82 * lag / exposureLag));
}

function paint(layers, inMotion = false) {
  const warp = layers.lens?.power > 0.008 || layers.waves?.length > 0;
  const trace = layers.ghosts?.length > 0;
  const solid = warp || inMotion;
  const available = renderer && fallback.hidden;
  if (!available || !solid) placeScene();
  if (!available || (!solid && !trace)) {
    stage.removeAttribute("data-effects");
    stage.removeAttribute("data-live-field");
    return;
  }
  renderer.paint(angle, { ...layers, solid });
  stage.toggleAttribute("data-live-field", solid);
  const effect = warp ? "warp" : trace ? "trace" : "turn";
  if (stage.dataset.effects !== effect) stage.dataset.effects = effect;
}

function aimLens(now) {
  if (lensStart !== undefined) {
    const elapsed = now - lensStart;
    if (elapsed < 1650) {
      lens = lensPass(elapsed / 1650);
      return true;
    }
    lensStart = undefined;
  }
  const target = lensTarget ?? { ...lens, power: 0 };
  const delta = clamp(now - (lastLensFrame ?? now - 16), 8, 55);
  const weight = labMotion.matches ? 1 : 1 - Math.exp(-delta / 44);
  lastLensFrame = now;
  lens.x = mix(lens.x, target.x, weight);
  lens.y = mix(lens.y, target.y, weight);
  lens.power = mix(lens.power, target.power, weight);
  return Math.abs(lens.x - target.x) + Math.abs(lens.y - target.y) + Math.abs(lens.power - target.power) > 0.005;
}

function render(now) {
  frame = 0;
  if (scoreOpen) {
    if (scoreOrigin !== undefined) scorePosition = clamp(now - scoreOrigin, 0, scoreDuration);
    const pose = scoreAt(scorePosition);
    const inMotion = scoreOrigin !== undefined && pose.angle !== angle && scorePosition < scoreDuration;
    placeAngle(pose.angle);
    paint(pose, inMotion);
    syncScoreTime(pose.title);
    if (scorePosition === scoreDuration) {
      scoreOrigin = undefined;
      showScore();
    }
    if (scoreOrigin !== undefined) queueFrame();
    return;
  }

  if (rotation) {
    const elapsed = now - rotation.start;
    placeAngle(elapsed >= rotation.duration ? rotation.target : rotation.sample(Math.max(0, elapsed)));
    if (elapsed >= rotation.duration) rotation = undefined;
  }

  const lensMoving = study === "lens" && aimLens(now);
  if (study === "resonance" && !labMotion.matches) {
    strikes = strikes.filter(strike => now - strike.time < waveDuration);
  }
  const waves = strikes.map(strike => ({ ...strike, age: labMotion.matches ? 275 : Math.max(0, now - strike.time) }));
  const ghosts = traceLayers(now);
  paint({ lens: study === "lens" && lens.power > 0.008 ? lens : undefined, waves, ghosts },
    Boolean(rotation || gesture?.turning));
  if (rotation || lensMoving || (!labMotion.matches && (waves.length > 0 || now - lastTurn < exposureLag + 30))) {
    queueFrame();
  }
}

function queueFrame() {
  if (!frame) frame = requestAnimationFrame(render);
}

function showStudy() {
  stage.dataset.study = study;
  const available = Boolean(renderer && fallback.hidden);
  for (const button of studyButtons) {
    button.setAttribute("aria-pressed", String(!scoreOpen && button.dataset.study === study));
    button.disabled = button.dataset.study !== "momentum" && !available;
  }
  const selected = studies[study];
  studyHint.hidden = scoreOpen;
  studyAction.hidden = scoreOpen;
  if (!scoreOpen) {
    studyHint.textContent = labMotion.matches ? selected.still : selected.hint;
    studyAction.textContent = labMotion.matches ? selected.stillAction : selected.action;
  }
  playScore.hidden = !available;
}

function showScore() {
  scoreControls.hidden = !scoreOpen;
  playScore.setAttribute("aria-expanded", String(scoreOpen));
  if (labMotion.matches) {
    playScore.textContent = scoreOpen ? "Reset score" : "Inspect motion score";
  } else if (scoreOrigin !== undefined) {
    playScore.textContent = "Pause score";
  } else if (scoreOpen && scorePosition === scoreDuration) {
    playScore.textContent = "Replay score";
  } else {
    playScore.textContent = scoreOpen ? "Resume score" : "Play motion score";
  }
}

function syncScoreTime(title) {
  const step = Math.round(scorePosition / 10) * 10;
  const seconds = (step / 1000).toFixed(2);
  const visible = title + " · " + seconds + " / " + (scoreDuration / 1000).toFixed(2) + " s";
  if (Number(scoreTime.value) !== step) scoreTime.value = step;
  if (scoreClock.textContent !== visible) {
    scoreClock.textContent = visible;
    scoreTime.setAttribute("aria-valuetext", seconds + " seconds, " + title);
  }
}

function finishScore() {
  if (!scoreOpen) return;
  scoreOpen = false;
  scoreOrigin = undefined;
  resetEffects();
  showScore();
  showStudy();
  queueFrame();
}

function pauseScore() {
  if (scoreOrigin === undefined) return;
  scoreOrigin = undefined;
  showScore();
  queueFrame();
}

function motionChoice() {
  motion.setAttribute("aria-pressed", String(labMotion.matches));
  if (labMotion.matches) {
    pauseScore();
    resetEffects();
  }
  showStudy();
  showScore();
  queueFrame();
}

function chooseStudy(next) {
  finishScore();
  study = next;
  resetEffects();
  showStudy();
  queueFrame();
}

function strike(point) {
  const mark = { ...point, time: performance.now() };
  strikes = labMotion.matches ? [mark] : [...strikes.slice(-3), mark];
  queueFrame();
}

function demonstrate() {
  if (study === "lens") {
    if (labMotion.matches) lensTarget = { x: 0.43, y: 0.48, power: 1 };
    else lensStart = performance.now();
  } else if (study === "resonance") {
    strike({ x: 0.43, y: 0.52 });
  } else if (study === "exposure") {
    if (labMotion.matches) stillExposure = !stillExposure;
    else startTurn(glide(angle, angle >= 0 ? -limit : limit, 1850));
  } else {
    const direction = angle >= 0 ? -1 : 1;
    if (labMotion.matches) placeAngle(direction * limit);
    else startTurn(carry(angle, direction * 0.57));
  }
  queueFrame();
}

function effectPosition(event) {
  const rect = stage.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
}

function trackPointer(samples, event) {
  const batch = event.getCoalescedEvents?.() ?? [];
  for (const point of batch.concat(event)) {
    const sample = { x: point.clientX, time: point.timeStamp };
    const previous = samples.at(-1);
    if (previous && (sample.time < previous.time || (sample.time === previous.time && sample.x === previous.x))) continue;
    samples.push(sample);
  }
  while (samples.length > 2 && samples[0].time < event.timeStamp - 88) samples.shift();
}

function release(event) {
  if (gesture?.id !== event.pointerId) return;
  const { samples, startX, startY, kind, angleScale, turning } = gesture;
  gesture = undefined;
  stage.removeAttribute("data-grab");
  if (event.type === "pointerup") {
    if (kind === "resonance" && Math.hypot(event.clientX - startX, event.clientY - startY) < 18) {
      strike(effectPosition(event));
    }
    if (!labMotion.matches && turning) {
      if (event.clientX !== samples.at(-1)?.x) trackPointer(samples, event);
      const first = samples[0];
      const last = samples.at(-1);
      const pause = clamp((event.timeStamp - last.time - 40) / 120);
      const speed = (last.x - first.x) * angleScale * (1 - pause) / Math.max(8, last.time - first.time);
      if (Math.abs(speed) > 0.016) startTurn(carry(angle, speed));
    }
  }
  if (turning) queueFrame();
  if (kind === "lens" && event.pointerType !== "mouse" && !labMotion.matches) {
    lensTarget = undefined;
    queueFrame();
  }
}

motion.addEventListener("click", () => labMotion.toggle());
labMotion.addEventListener("change", motionChoice);
for (const button of studyButtons) button.addEventListener("click", () => chooseStudy(button.dataset.study));
studyAction.addEventListener("click", demonstrate);

playScore.addEventListener("click", () => {
  if (scoreOrigin !== undefined) {
    pauseScore();
    return;
  }
  if (!scoreOpen || labMotion.matches || scorePosition >= scoreDuration) scorePosition = 0;
  scoreOpen = true;
  resetEffects();
  if (!labMotion.matches) scoreOrigin = performance.now() - scorePosition;
  showScore();
  showStudy();
  queueFrame();
});

scoreClose.addEventListener("click", () => {
  finishScore();
  playScore.focus();
});

scoreTime.addEventListener("pointerdown", pauseScore);
scoreTime.addEventListener("input", () => {
  const chosen = Number(scoreTime.value);
  pauseScore();
  scorePosition = chosen;
  showScore();
  queueFrame();
});

for (const button of poseButtons) {
  button.addEventListener("click", () => {
    finishScore();
    startTurn(glide(angle, Number(button.dataset.pose)));
  });
}

slider.addEventListener("pointerdown", () => { rotation = undefined; });
slider.addEventListener("input", () => {
  const value = Number(slider.value);
  finishScore();
  rotation = undefined;
  placeAngle(value);
  queueFrame();
});

stage.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  finishScore();
  rotation = undefined;
  gesture = {
    id: event.pointerId,
    kind: study,
    startX: event.clientX,
    startY: event.clientY,
    angle,
    angleScale: 135 / bounds.width,
    samples: [],
  };
  trackPointer(gesture.samples, event);
  stage.setPointerCapture(event.pointerId);
  if (study === "lens") {
    lensStart = undefined;
    lensTarget = { ...effectPosition(event), power: 1 };
    queueFrame();
  } else if (study !== "resonance") {
    stage.setAttribute("data-grab", "");
  }
});

stage.addEventListener("pointermove", event => {
  if (scoreOpen) return;
  if (study === "lens" && !labMotion.matches && (event.pointerType === "mouse" || gesture?.id === event.pointerId)) {
    lensStart = undefined;
    lensTarget = { ...effectPosition(event), power: 1 };
    queueFrame();
  }
  if (gesture?.id !== event.pointerId || (gesture.kind !== "momentum" && gesture.kind !== "exposure")) return;
  trackPointer(gesture.samples, event);
  gesture.turning = true;
  placeAngle(gesture.angle + (event.clientX - gesture.startX) * gesture.angleScale);
  queueFrame();
});

stage.addEventListener("pointerleave", () => {
  if (study !== "lens" || labMotion.matches) return;
  lensTarget = undefined;
  queueFrame();
});

stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("lostpointercapture", release);

function printDraft(field) {
  const text = field.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  draftImpression.textContent = text;
  draftImpression.parentElement.dataset.side = field === firstInput ? "first" : "second";
  draftImpression.parentElement.toggleAttribute("data-long", text.length > 4);
}

function showWords() {
  firstInput.value = words[0];
  secondInput.value = words[1];
  printDraft(secondInput);
  writeFold(words);
  poseButtons[0].textContent = words[0] + " −45°";
  poseButtons[1].textContent = words[1] + " +45°";
  shape();
  if (!fallback.hidden) study = "momentum";
  syncAngle();
  showStudy();
  queueFrame();
}

for (const input of [firstInput, secondInput]) {
  input.addEventListener("input", () => printDraft(input));
  input.addEventListener("focus", () => printDraft(input));
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const next = [firstInput.value.trim().toUpperCase(), secondInput.value.trim().toUpperCase()];
  const invalid = next.findIndex(word => !valid.test(word));
  if (invalid >= 0) {
    message.textContent = "Use two to six letters A–Z in each word.";
    (invalid === 0 ? firstInput : secondInput).focus();
    return;
  }
  recastProjection(() => {
    finishScore();
    const url = new URL(location.href);
    url.searchParams.set("first", next[0]);
    url.searchParams.set("second", next[1]);
    url.hash = "exhibit";
    history.replaceState(history.state, "", url);
    words = next;
    placeAngle(-limit);
    resetEffects();
    stage.removeAttribute("data-effects");
    stage.removeAttribute("data-live-field");
    placeScene();
    showWords();
    message.textContent = "Projection built. This page’s address keeps both words.";
  });
});

words = readingsFromAddress();
fallback.textContent = words[0];
await Promise.allSettled([
  document.fonts.load("900 128px Archivo"),
  document.fonts.load('400 44px "IBM Plex Mono"'),
]);
try {
  renderer = createLetterField(document.querySelector("#effect-surface"));
} catch {
  // The DOM still renders both unwarped projections.
}
measure();
new ResizeObserver(measure).observe(stage);
resetEffects();
showWords();
motionChoice();
motion.hidden = false;
document.querySelector("#exhibit-controls").hidden = false;
document.querySelector("#motion-controls").hidden = false;
document.querySelector("#change-words").hidden = false;
alignOpeningAnchor();
initializeProof(measure);
