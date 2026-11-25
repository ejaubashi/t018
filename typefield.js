const stage = document.querySelector("#type-stage");
const motionToggle = document.querySelector("#motion-toggle");
const weight = document.querySelector("#weight");
const width = document.querySelector("#width");
const hint = document.querySelector("#mode-hint");
const action = document.querySelector("#mode-action");
const actionLabel = document.querySelector("#action-label");
const modeButtons = [...document.querySelectorAll(".mode-buttons button")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const preferenceKey = "typefield-motion";

const experiments = {
  field: {
    hint: "Hover or drag across the letters to push their weight.",
    quietHint: "Use the sliders to change the weight and width.",
    action: "Send a pulse",
  },
  scramble: {
    hint: "Watch the phrase resolve one character at a time.",
    quietHint: "Enable motion to play the scramble.",
    action: "Replay scramble",
  },
  morph: {
    hint: "Recompose the same phrase in a different rhythm.",
    action: "Swap composition",
  },
};

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;
const glyphs = [];
for (const line of stage.querySelectorAll(".type-line")) {
  const text = line.textContent;
  const characters = segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
  const fragment = document.createDocumentFragment();

  for (const character of characters) {
    if (character === " ") {
      fragment.append(character);
      continue;
    }

    const slot = document.createElement("span");
    const ink = document.createElement("span");
    slot.className = "glyph";
    slot.dataset.character = character;
    ink.className = "glyph-ink";
    ink.textContent = character;
    slot.append(ink);
    fragment.append(slot);
    glyphs.push({ slot, ink, character });
  }
  line.replaceChildren(fragment);
}

let mode = "field";
let motionPreference;
let motionEnabled;
let alternateLayout = false;
let layoutTransition;
let pointerFrame = 0;
let scrambleFrame = 0;
let pulseAnimations = [];
let pointer;

try {
  motionPreference = localStorage.getItem(preferenceKey);
} catch {
  // The page also works in a local file or when storage is unavailable.
}

function updateGuide() {
  const experiment = experiments[mode];
  hint.textContent = motionEnabled ? experiment.hint : experiment.quietHint ?? experiment.hint;
  actionLabel.textContent = experiment.action;
  action.disabled = !motionEnabled && mode !== "morph";
}

function updateMotion() {
  motionEnabled = motionPreference === "on" || (motionPreference !== "off" && !reducedMotion.matches);
  document.documentElement.dataset.motion = motionEnabled ? "on" : "off";
  motionToggle.textContent = motionEnabled ? "Motion on" : "Motion off";
  motionToggle.setAttribute("aria-pressed", String(motionEnabled));
  if (!motionEnabled) stopAnimations();
  updateGuide();
}

motionToggle.addEventListener("click", () => {
  motionPreference = motionEnabled ? "off" : "on";
  try {
    localStorage.setItem(preferenceKey, motionPreference);
  } catch {
    // Keep the preference for this page when storage is unavailable.
  }
  updateMotion();
});
reducedMotion.addEventListener("change", updateMotion);

function bindAxis(input, label, unit) {
  const update = () => {
    const value = Number(input.value);
    const fraction = (value - Number(input.min)) / (Number(input.max) - Number(input.min));
    stage.style.setProperty(`--specimen-${input.id}`, value);
    label.value = `${value}${unit}`;
    if (unit) input.setAttribute("aria-valuetext", label.value);
    input.style.setProperty("--progress", `${fraction * 100}%`);
  };
  input.addEventListener("input", () => {
    stopPulse();
    layoutTransition?.skipTransition();
    update();
  });
  update();
}

bindAxis(weight, document.querySelector("#weight-value"), "");
bindAxis(width, document.querySelector("#width-value"), "%");

function drawField() {
  pointerFrame = 0;
  const radius = Math.min(190, Math.max(75, stage.clientWidth * 0.26));
  const headroom = Math.min(240, 900 - Number(weight.value));

  // Measure the static glyph slots before changing any of the visible letters.
  const distances = glyphs.map(({ slot }) => {
    const rect = slot.getBoundingClientRect();
    return Math.hypot(pointer.x - (rect.left + rect.width / 2), pointer.y - (rect.top + rect.height / 2));
  });

  glyphs.forEach(({ ink }, index) => {
    const pressure = Math.max(0, 1 - distances[index] / radius) ** 2;
    ink.style.setProperty("--field-weight", (pressure * headroom).toFixed(1));
    ink.style.setProperty("--lift", `${(-0.1 * pressure).toFixed(4)}em`);
  });
}

function moveField(event) {
  if (mode !== "field" || !motionEnabled || !event.isPrimary) return;
  pointer = { x: event.clientX, y: event.clientY };
  if (!pointerFrame) pointerFrame = requestAnimationFrame(drawField);
}

function clearField() {
  cancelAnimationFrame(pointerFrame);
  pointerFrame = 0;
  for (const { ink } of glyphs) {
    ink.style.removeProperty("--field-weight");
    ink.style.removeProperty("--lift");
  }
}

stage.addEventListener("pointermove", moveField);
stage.addEventListener("pointerdown", moveField);
stage.addEventListener("pointerleave", clearField);
stage.addEventListener("pointercancel", clearField);
stage.addEventListener("pointerup", event => {
  if (event.pointerType === "touch") clearField();
});

function stopPulse() {
  for (const animation of pulseAnimations) animation.cancel();
  pulseAnimations = [];
}

function playPulse() {
  stopPulse();
  clearField();
  const axisSettings = wght => `"wght" ${wght}, "wdth" ${width.value}`;
  const rest = { transform: "translateY(0)", fontVariationSettings: axisSettings(weight.value) };
  const crest = { offset: 0.32, transform: "translateY(-0.09em)", fontVariationSettings: axisSettings(900) };
  pulseAnimations = glyphs.map(({ ink }, index) => ink.animate([rest, crest, rest], {
    duration: 510,
    delay: index * 32,
    easing: "cubic-bezier(.32, .72, .35, 1)",
  }));
}

function stopScramble() {
  if (!scrambleFrame) return;
  cancelAnimationFrame(scrambleFrame);
  scrambleFrame = 0;
  for (const { ink, character } of glyphs) ink.textContent = character;
}

function playScramble() {
  stopScramble();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+?/#";
  let start;
  let lastChange = -Infinity;

  function tick(time) {
    start ??= time;
    const elapsed = time - start;
    if (elapsed >= 260 + (glyphs.length - 1) * 35) {
      stopScramble();
      return;
    }
    if (elapsed - lastChange >= 45) {
      glyphs.forEach(({ ink, character }, index) => {
        const next = elapsed >= 260 + index * 35 ? character : alphabet[Math.floor(Math.random() * alphabet.length)];
        if (ink.textContent !== next) ink.textContent = next;
      });
      lastChange = elapsed;
    }
    scrambleFrame = requestAnimationFrame(tick);
  }

  scrambleFrame = requestAnimationFrame(tick);
}

function applyLayout() {
  stage.dataset.layout = alternateLayout ? "alternate" : "default";
}

function swapLayout() {
  alternateLayout = !alternateLayout;
  layoutTransition?.skipTransition();
  const scope = typeof stage.startViewTransition === "function" ? stage : document;
  if (!motionEnabled || typeof scope.startViewTransition !== "function") {
    applyLayout();
    return;
  }

  const transition = scope.startViewTransition(applyLayout);
  layoutTransition = transition;
  // The layout still updates when the user interrupts the snapshot animation.
  transition.ready.catch(() => {});
  transition.finished.then(() => {
    if (layoutTransition === transition) layoutTransition = undefined;
  });
}

function stopAnimations() {
  clearField();
  stopPulse();
  stopScramble();
  layoutTransition?.skipTransition();
}

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.mode;
    if (mode === nextMode) return;
    stopAnimations();
    mode = nextMode;
    stage.dataset.mode = mode;
    alternateLayout = false;
    applyLayout();
    for (const item of modeButtons) item.setAttribute("aria-pressed", String(item === button));
    updateGuide();

    if (mode === "morph") swapLayout();
    if (mode === "scramble" && motionEnabled) playScramble();
  });
}

action.addEventListener("click", () => {
  if (mode === "morph") swapLayout();
  if (mode === "field" && motionEnabled) playPulse();
  if (mode === "scramble" && motionEnabled) playScramble();
});

if (!("showPopover" in HTMLElement.prototype)) {
  for (const term of document.querySelectorAll(".term")) term.disabled = true;
}

updateMotion();
document.querySelector("#specimen-guide").hidden = false;
document.querySelector("#specimen-controls").hidden = false;
motionToggle.hidden = false;
