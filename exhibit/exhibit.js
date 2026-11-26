import { labMotion } from "../lab/motion.js";
import { projectWords, rows } from "./optics.js";

const legacy = new Set(["#playground", "#notes"]);
if (legacy.has(location.hash)) location.replace(new URL("playground/" + location.hash, location.href));

const stage = document.querySelector("#exhibit");
const scene = document.querySelector("#exhibit-scene");
const fallback = document.querySelector("#exhibit-fallback");
const view = document.querySelector("#exhibit-view");
const count = document.querySelector("#exhibit-count");
const reading = document.querySelector("#exhibit-reading");
const degrees = document.querySelector("#exhibit-angle");
const slider = document.querySelector("#angle");
const buttons = [...document.querySelectorAll("[data-pose]")];
const sweep = document.querySelector("#sweep");
const motion = document.querySelector("#motion");
const entrances = document.querySelector("#lab-entrances");
const form = document.querySelector("#word-form");
const firstInput = document.querySelector("#first-word");
const secondInput = document.querySelector("#second-word");
const message = document.querySelector("#word-note");
const canAnimate = "registerProperty" in CSS && typeof stage.animate === "function";
const defaults = ["READ", "MAKE"];
const valid = /^[A-Z]{2,6}$/u;
let words = defaults;
let angle = -45;
let animation;
let frame = 0;
let drag;

function readingsFromAddress() {
  const params = new URLSearchParams(location.search);
  const a = params.get("first")?.toUpperCase();
  const b = params.get("second")?.toUpperCase();
  return valid.test(a ?? "") && valid.test(b ?? "") ? [a, b] : defaults;
}

function size() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const artWidth = width * 0.86;
  const artHeight = Math.min(height * 0.59, width * 0.315);
  const fontSize = Math.max(5, Math.min(18, artHeight * 1.22 / rows));
  stage.style.setProperty("--world-width", artWidth + "px");
  stage.style.setProperty("--world-height", artHeight + "px");
  stage.style.setProperty("--glyph-size", fontSize + "px");
  stage.style.setProperty("--max-pitch", Math.min(13, 23 * height / width) + "deg");
}

function shape() {
  fallback.hidden = false;
  stage.removeAttribute("data-points");
  scene.replaceChildren();
  count.textContent = "";
  try {
    const points = projectWords(...words);
    if (!points.length) return;
    const marks = words.join("");
    const fragment = document.createDocumentFragment();
    for (const [index, { x, y, z }] of points.entries()) {
      const node = document.createElement("span");
      node.className = "particle";
      node.textContent = marks[(index * 5 + Math.floor(index / 11)) % marks.length];
      node.style.setProperty("--x", x.toFixed(6));
      node.style.setProperty("--y", y.toFixed(6));
      node.style.setProperty("--z", z.toFixed(6));
      node.style.setProperty("--density", (0.62 + 0.38 * ((index * 19) % 31) / 30).toFixed(3));
      fragment.append(node);
    }
    scene.replaceChildren(fragment);
    count.textContent = points.length + " characters";
    stage.setAttribute("data-points", "");
    fallback.hidden = true;
  } catch {
    // The plain-text view preserves both readings on devices without text outlines.
  }
}

function controls(value) {
  const step = Math.round(value * 2) / 2;
  if (Number(slider.value) !== step) slider.value = step;
  const signed = (step < 0 ? "−" : step > 0 ? "+" : "") + Math.abs(step).toFixed(1);
  if (degrees.textContent !== signed + "°") {
    degrees.textContent = signed + "°";
    slider.setAttribute("aria-valuetext", signed + " degrees");
  }

  const side = step <= -45 ? "read" : step >= 45 ? "make" : "middle";
  const label = side === "read" ? "First projection" : side === "make" ? "Second projection" : "Between projections";
  if (view.textContent !== label) view.textContent = label;
  const line = side === "read" ? words[0] : side === "make" ? words[1] : words.join(" / ");
  if (reading.textContent !== line) reading.textContent = line;
  if (!fallback.hidden && fallback.textContent !== line) fallback.textContent = line;
  const palette = step < 1 ? "read" : "make";
  if (stage.dataset.palette !== palette) stage.dataset.palette = palette;
  if (entrances.dataset.facing !== side) entrances.dataset.facing = side;

  for (const button of buttons) {
    const pressed = String(Number(button.dataset.pose) === step);
    if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
  }
}

function camera(value) {
  return {
    "--yaw": value + "deg",
    "--depth": 1 - Math.abs(value) / 45,
    "--rotation-progress": (value + 45) / 90,
  };
}

function setAngle(value) {
  angle = Math.max(-45, Math.min(45, value));
  for (const [property, formatted] of Object.entries(camera(angle))) stage.style.setProperty(property, formatted);
  controls(angle);
}

function onScreen() {
  const value = parseFloat(getComputedStyle(stage).getPropertyValue("--yaw"));
  return Number.isFinite(value) ? value : angle;
}

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  if (!animation) return;
  const rendered = onScreen();
  animation.cancel();
  animation = undefined;
  setAngle(rendered);
}

function animate(points, duration) {
  stop();
  const target = points.at(-1).value;
  if (labMotion.matches) {
    setAngle(target);
    return;
  }

  const stops = [{ value: angle, offset: 0 }, ...points];
  if (canAnimate) {
    const next = stage.animate(stops.map(({ value, offset }) => ({
      ...camera(value),
      offset,
      easing: "cubic-bezier(.24,.72,.2,1)",
    })), { duration, fill: "both" });

    animation = next;
    next.onfinish = () => {
      if (animation !== next) return;
      stop();
      setAngle(target);
    };
    function monitor() {
      if (animation !== next) return;
      controls(onScreen());
      frame = requestAnimationFrame(monitor);
    }
    frame = requestAnimationFrame(monitor);
    return;
  }

  const started = performance.now();
  function interpolate(time) {
    const progress = Math.min(1, (time - started) / duration);
    const index = stops.findIndex(item => item.offset >= progress && item.offset > 0);
    const start = stops[index - 1];
    const end = stops[index];
    const part = Math.max(0, (progress - start.offset) / (end.offset - start.offset));
    const eased = part * part * (3 - 2 * part);
    setAngle(start.value + (end.value - start.value) * eased);
    frame = progress < 1 ? requestAnimationFrame(interpolate) : 0;
  }
  frame = requestAnimationFrame(interpolate);
}

function rotateTo(target) {
  const start = animation ? onScreen() : angle;
  const points = start * target < 0 ? [{ value: 0, offset: 0.47 }] : [];
  animate([...points, { value: target, offset: 1 }], 1040);
}

function showWords() {
  firstInput.value = words[0];
  secondInput.value = words[1];
  buttons[0].textContent = words[0] + " −45°";
  buttons[1].textContent = words[1] + " +45°";
  shape();
  setAngle(angle);
}

function showMotion() {
  motion.setAttribute("aria-pressed", String(labMotion.matches));
  sweep.hidden = labMotion.matches;
  if (labMotion.matches) stop();
}

motion.addEventListener("click", () => labMotion.toggle());
labMotion.addEventListener("change", showMotion);

for (const button of buttons) {
  button.addEventListener("click", () => rotateTo(Number(button.dataset.pose)));
}

sweep.addEventListener("click", () => animate([
  { value: -45, offset: 0.19 },
  { value: -45, offset: 0.27 },
  { value: 0, offset: 0.55 },
  { value: 45, offset: 1 },
], 2900));

slider.addEventListener("pointerdown", stop);
slider.addEventListener("input", () => {
  const value = Number(slider.value);
  stop();
  setAngle(value);
});

stage.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  stop();
  drag = { id: event.pointerId, x: event.clientX, angle };
  stage.setAttribute("data-grab", "");
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId) return;
  const value = drag.angle + (event.clientX - drag.x) * 135 / stage.clientWidth;
  setAngle(Math.round(value * 2) / 2);
});

function release(event) {
  if (drag?.id !== event.pointerId) return;
  drag = undefined;
  stage.removeAttribute("data-grab");
}

stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("lostpointercapture", release);

form.addEventListener("submit", event => {
  event.preventDefault();
  const next = [firstInput.value.trim().toUpperCase(), secondInput.value.trim().toUpperCase()];
  const invalid = next.findIndex(word => !valid.test(word));
  if (invalid >= 0) {
    message.textContent = "Use two to six letters A–Z in each word.";
    (invalid === 0 ? firstInput : secondInput).focus();
    return;
  }
  stop();
  const url = new URL(location.href);
  url.searchParams.set("first", next[0]);
  url.searchParams.set("second", next[1]);
  history.replaceState(history.state, "", url);
  words = next;
  angle = -45;
  showWords();
  message.textContent = "Projection built. This page’s address keeps both words.";
  stage.scrollIntoView({ block: "nearest" });
});

words = readingsFromAddress();
fallback.textContent = words[0];
size();
new ResizeObserver(size).observe(stage);
try {
  await document.fonts.load("900 128px Archivo");
} catch {
  // The outline can still be made with the browser’s fallback font.
}
showWords();
showMotion();
motion.hidden = false;
document.querySelector("#exhibit-controls").hidden = false;
document.querySelector("#change-words").hidden = false;
