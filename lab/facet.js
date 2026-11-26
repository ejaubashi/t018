import { labMotion } from "./motion.js";

const stage = document.querySelector("#facet-stage");
const optic = stage.querySelector(".facet-optic");
const scene = document.querySelector("#facet-scene");
const fallback = document.querySelector("#facet-fallback");
const slider = document.querySelector("#facet-angle");
const degrees = document.querySelector("#facet-degrees");
const reading = document.querySelector("#facet-reading");
const sweep = document.querySelector("#facet-sweep");
const presets = [...document.querySelectorAll("[data-angle]")];
const reducedMotion = labMotion;
const supportsAngleAnimation = "registerProperty" in CSS && CSS.supports("transform: scaleX(calc(1 / cos(45deg)))");
const print = {
  first: { lines: ["I STAYED", "TO LISTEN."], reading: "I stayed to listen." },
  second: { lines: ["I LEFT", "TO SPEAK."], reading: "I left to speak." },
};
const ridgeCount = 24;
let angle = Number(slider.value);
let animation;
let frame = 0;
let drag;

function face(name) {
  const surface = document.createElement("div");
  surface.className = "facet-face";
  surface.dataset.print = name;

  const copy = document.createElement("div");
  copy.className = "facet-copy";
  for (const text of print[name].lines) {
    const line = document.createElement("span");
    line.textContent = text;
    copy.append(line);
  }

  surface.append(copy);
  return surface;
}

const ridges = document.createDocumentFragment();
for (let index = 0; index < ridgeCount; index += 1) {
  const ridge = document.createElement("div");
  ridge.className = "facet-ridge";
  ridge.style.setProperty("--fallback-index", index);
  ridge.append(face("second"), face("first"));
  ridges.append(ridge);
}
scene.append(ridges);

function measure() {
  const width = optic.clientWidth;
  const pitch = width / ridgeCount;
  const faceSpan = pitch * Math.SQRT1_2;
  const copyWidth = faceSpan * ridgeCount;

  scene.style.setProperty("--pitch", pitch + "px");
  scene.style.setProperty("--face-span", faceSpan + "px");
  scene.style.setProperty("--print-width", copyWidth + "px");
  scene.style.setProperty("--print-size", Math.min(copyWidth * 0.176, 170) + "px");
}

function updateControls(value) {
  const step = Math.round(value * 2) / 2;
  if (Number(slider.value) !== step) slider.value = step;
  const label = (step < 0 ? "−" : step > 0 ? "+" : "") + Math.abs(step).toFixed(1);
  if (degrees.value !== label + "°") {
    degrees.value = label + "°";
    slider.setAttribute("aria-valuetext", label + " degrees");
  }

  for (const button of presets) button.setAttribute("aria-pressed", String(step === Number(button.dataset.angle)));
  const text = step <= -44.5 ? print.first.reading : step >= 44.5 ? print.second.reading : "Both readings overlap";
  if (text !== reading.textContent) reading.textContent = text;
}

function setAngle(value) {
  angle = Math.max(-45, Math.min(45, value));
  scene.style.setProperty("--facet-angle", angle + "deg");
  scene.style.setProperty("--facet-scale", 1 / Math.cos(angle * Math.PI / 180));
  updateControls(angle);
}

function currentNativeAngle() {
  const value = parseFloat(getComputedStyle(scene).getPropertyValue("--facet-angle"));
  return Number.isFinite(value) ? value : angle;
}

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  if (!animation) return;
  const rendered = currentNativeAngle();
  animation.cancel();
  animation = undefined;
  setAngle(rendered);
}

function animateAngle(points, duration) {
  stop();
  const keyframes = [{ value: angle, offset: 0 }, ...points];
  const last = points.at(-1).value;

  if (reducedMotion.matches) {
    setAngle(last);
    return;
  }

  if (supportsAngleAnimation && typeof scene.animate === "function") {
    const next = scene.animate(keyframes.map(({ value, offset }) => ({
      "--facet-angle": value + "deg",
      offset,
      easing: "cubic-bezier(.32,.05,.21,.98)",
    })), { duration, fill: "both" });
    animation = next;
    next.onfinish = () => {
      if (animation !== next) return;
      stop();
      setAngle(last);
    };
    function monitor() {
      if (animation !== next) return;
      updateControls(currentNativeAngle());
      frame = requestAnimationFrame(monitor);
    }
    frame = requestAnimationFrame(monitor);
    return;
  }

  const start = performance.now();
  function interpolate(time) {
    const progress = Math.min(1, (time - start) / duration);
    const index = keyframes.findIndex(point => point.offset >= progress && point.offset > 0);
    const from = keyframes[index - 1];
    const to = keyframes[index];
    const portion = Math.max(0, (progress - from.offset) / (to.offset - from.offset));
    const eased = portion * portion * (3 - 2 * portion);
    setAngle(from.value + (to.value - from.value) * eased);
    frame = progress < 1 ? requestAnimationFrame(interpolate) : 0;
  }
  frame = requestAnimationFrame(interpolate);
}

for (const button of presets) {
  button.addEventListener("click", () => animateAngle([{ value: Number(button.dataset.angle), offset: 1 }], 720));
}

sweep.addEventListener("click", () => animateAngle([
  { value: -45, offset: 0.22 },
  { value: -45, offset: 0.34 },
  { value: 45, offset: 0.86 },
  { value: 45, offset: 1 },
], 3100));

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
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId) return;
  const next = drag.angle + 135 * (event.clientX - drag.x) / optic.clientWidth;
  setAngle(Math.round(next * 2) / 2);
});

function endDrag(event) {
  if (drag?.id === event.pointerId) drag = undefined;
}

stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("lostpointercapture", endDrag);
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) stop();
  sweep.hidden = reducedMotion.matches;
});

stage.setAttribute("data-ready", "");
fallback.hidden = true;
document.querySelector("#facet-controls").hidden = false;
document.querySelector("#facet-axis").hidden = false;
sweep.hidden = reducedMotion.matches;
measure();
setAngle(angle);
new ResizeObserver(measure).observe(optic);
