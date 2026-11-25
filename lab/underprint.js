const stage = document.querySelector("#underprint-stage");
const surface = document.querySelector("#surface-copy");
const underprint = document.querySelector("#hidden-copy");
const reveal = document.querySelector("#reveal");
const radius = document.querySelector("#lens-radius");
let x = 33;
let y = 38;
let fullyVisible = false;

function position(nextX, nextY) {
  x = Math.min(100, Math.max(0, nextX));
  y = Math.min(100, Math.max(0, nextY));
  stage.style.setProperty("--lens-x", x + "%");
  stage.style.setProperty("--lens-y", y + "%");
}

function pointerPosition(event) {
  if (!event.isPrimary || fullyVisible) return;
  const bounds = stage.getBoundingClientRect();
  position(100 * (event.clientX - bounds.left) / bounds.width, 100 * (event.clientY - bounds.top) / bounds.height);
}

function showFull(visible) {
  fullyVisible = visible;
  stage.toggleAttribute("data-reveal", visible);
  reveal.setAttribute("aria-pressed", String(visible));
  surface.setAttribute("aria-hidden", String(visible));
  underprint.setAttribute("aria-hidden", String(!visible));
}

stage.addEventListener("pointermove", pointerPosition);
stage.addEventListener("pointerdown", pointerPosition);
stage.addEventListener("keydown", event => {
  const steps = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] };
  const step = steps[event.key];
  if (!step) return;
  event.preventDefault();
  if (fullyVisible) showFull(false);
  position(x + step[0], y + step[1]);
});

reveal.addEventListener("click", () => showFull(!fullyVisible));
radius.addEventListener("input", () => {
  radius.setAttribute("aria-valuetext", radius.value + "%");
  stage.style.setProperty("--lens-size", radius.value + "%");
  if (fullyVisible) showFull(false);
});
