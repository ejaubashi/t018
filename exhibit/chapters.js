import { labMotion } from "../lab/motion.js";
import { clamp, mix } from "./kinetics.js";
import { wordMask } from "./optics.js?v=2";

const root = document.documentElement;
const masthead = document.querySelector(".masthead");
const index = masthead.querySelector("nav");
const links = [...index.querySelectorAll("[data-section]")];
const studio = document.querySelector('[data-chapter="studio"]');
const lab = document.querySelector("#lab");
const fold = document.querySelector("#type-fold");
const board = fold.querySelector(".fold-board");
const leaves = document.querySelector("#fold-leaves");
const foldControls = document.querySelector("#fold-controls");
const foldPosition = document.querySelector("#fold-position");
const foldPercent = document.querySelector("#fold-percent");
const foldFirst = document.querySelector("#fold-first");
const foldSecond = document.querySelector("#fold-second");
const overprint = document.querySelector("#fold-overprint");
const exhibit = document.querySelector("#exhibit");
const sourceWord = document.querySelector("#first-word");
const projectionWord = document.querySelector("#exhibit-reading");
const openingHash = location.hash;
const canUseNativeFold = "registerProperty" in CSS && CSS.supports("animation-timeline: scroll(root block)")
  && CSS.supports("animation-range: 10px 20px");
const leafCount = 9;

let frame = 0;
let current;
let recast;
let revision = 0;
let turnStart = 0;
let turnDistance = 0;
let indexPositions;

function foldWords() {
  const fragment = document.createDocumentFragment();
  leaves.style.setProperty("--leaf-count", leafCount);

  function plane(orientation) {
    const side = document.createElement("div");
    side.className = "fold-plane fold-" + orientation;
    const word = document.createElement("span");
    word.className = "fold-word";
    word.textContent = orientation === "departure" ? foldFirst.textContent : foldSecond.textContent;
    side.append(word);
    return side;
  }

  for (let position = 0; position < leafCount; position += 1) {
    const leaf = document.createElement("div");
    leaf.className = "fold-leaf";
    leaf.style.setProperty("--leaf-index", position);
    const hinge = document.createElement("div");
    hinge.className = "fold-hinge";
    hinge.append(plane("departure"), plane("arrival"));
    leaf.append(hinge);
    fragment.append(leaf);
  }
  leaves.append(fragment);
  return [leaves.querySelectorAll(".fold-departure span"), leaves.querySelectorAll(".fold-arrival span")];
}

const letters = foldWords();

function moveIndex(position) {
  const base = Math.floor(position);
  const from = indexPositions[base];
  const to = indexPositions[Math.min(base + 1, indexPositions.length - 1)];
  const amount = position - base;
  index.style.setProperty("--index-left", mix(from.left, to.left, amount) + "px");
  index.style.setProperty("--index-width", mix(from.width, to.width, amount) + "px");
}

function refresh() {
  frame = 0;
  if (root.hasAttribute("data-proof")) return;
  const height = window.innerHeight;
  const headerHeight = masthead.offsetHeight;
  const activationLine = Math.max(headerHeight + 25, height * 0.24);
  const end = root.scrollHeight - height;
  const scroll = window.scrollY;
  const progress = turnDistance ? clamp((scroll - turnStart) / turnDistance) : 1;
  const labTop = lab.getBoundingClientRect().top;
  const studioActive = turnDistance ? progress >= 0.5 : studio.getBoundingClientRect().top <= activationLine;
  const labActive = labTop <= activationLine || (end > 0 && scroll >= end - 2);
  const active = labActive ? 2 : studioActive ? 1 : 0;

  if (active !== current) {
    current = active;
    masthead.dataset.current = links[active].dataset.section;
    for (const [position, link] of links.entries()) {
      if (position === active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  masthead.style.setProperty("--page-progress", end > 0 ? clamp(scroll / end) : 0);

  const labApproach = clamp((height - labTop) / Math.max(1, height - activationLine));
  moveIndex(turnDistance ? progress + labApproach : active);

  if (turnDistance) {
    if (!canUseNativeFold) fold.style.setProperty("--fold", progress);
    const value = Math.round(progress * 100);
    const label = value === 0 ? "Exhibit side" : value === 100 ? "Studio side" : value + " percent turned";
    if (Number(foldPosition.value) !== value) foldPosition.value = value;
    if (foldPercent.value !== value + "%") foldPercent.value = value + "%";
    if (foldPosition.getAttribute("aria-valuetext") !== label) foldPosition.setAttribute("aria-valuetext", label);
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(refresh);
}

function measure() {
  const headerHeight = masthead.offsetHeight;
  root.style.setProperty("--masthead-edge", headerHeight + "px");
  root.style.setProperty("--masthead-space", (headerHeight + 14) + "px");
  if (root.hasAttribute("data-proof")) return;
  turnStart = Math.round(window.scrollY + fold.getBoundingClientRect().top - headerHeight);
  turnDistance = fold.offsetHeight - board.offsetHeight;
  fold.style.setProperty("--turn-start", turnStart + "px");
  fold.style.setProperty("--turn-end", (turnStart + turnDistance) + "px");
  indexPositions = links.map(link => ({ left: link.offsetLeft, width: link.offsetWidth }));
  schedule();
}

function updateMotion() {
  const enabled = !labMotion.matches;
  fold.toggleAttribute("data-turn", enabled);
  foldControls.hidden = !enabled;
  if (!enabled) {
    fold.style.removeProperty("--fold");
    recast?.skipTransition();
  }
  measure();
}

fold.toggleAttribute("data-native", canUseNativeFold);
foldPosition.addEventListener("input", () => {
  window.scrollTo({ top: turnStart + Number(foldPosition.value) / 100 * turnDistance, behavior: "instant" });
  schedule();
});
document.addEventListener("click", event => {
  if (event.target.closest?.("a[href^='#']:not(.skip)")) root.setAttribute("data-anchor-motion", "");
});
window.addEventListener("scroll", schedule, { passive: true });
window.addEventListener("resize", measure, { passive: true });
window.addEventListener("pageshow", measure);
const sizeObserver = new ResizeObserver(measure);
sizeObserver.observe(masthead);
sizeObserver.observe(document.querySelector("main"));
labMotion.addEventListener("change", updateMotion);
updateMotion();

export function writeFold(words) {
  foldFirst.textContent = words[0];
  foldSecond.textContent = words[1];
  letters.forEach((faces, index) => faces.forEach(face => { face.textContent = words[index]; }));
  fold.toggleAttribute("data-long", Math.max(words[0].length, words[1].length) > 4);
  overprint.textContent = words[1];
  try {
    overprint.style.setProperty("--impression", wordMask(words[0]));
    overprint.setAttribute("data-registered", "");
  } catch {
    overprint.removeAttribute("data-registered");
  }
}

export function alignOpeningAnchor() {
  measure();
  if (!openingHash || location.hash !== openingHash || root.hasAttribute("data-anchor-motion")) return;
  // The controls above the target gain height when the sculpture is ready.
  const target = document.getElementById(openingHash.slice(1));
  target?.scrollIntoView({ block: "start", behavior: "instant" });
}

export function recastProjection(update) {
  const attempt = ++revision;
  function reveal(behavior) {
    if (attempt !== revision) return;
    update();
    if (root.hasAttribute("data-proof")) return;
    exhibit.focus({ preventScroll: true });
    exhibit.scrollIntoView({ block: "start", behavior });
    schedule();
  }

  const field = sourceWord.getBoundingClientRect();
  const visible = field.bottom > masthead.offsetHeight && field.top < window.innerHeight;
  if (labMotion.matches || !document.startViewTransition || !visible || recast) {
    recast?.skipTransition();
    reveal(labMotion.matches ? "instant" : "smooth");
    return;
  }

  root.dataset.passage = "projection";
  sourceWord.style.viewTransitionName = "typefield-projection";
  recast = document.startViewTransition(() => {
    if (attempt !== revision) return;
    sourceWord.style.removeProperty("view-transition-name");
    projectionWord.style.viewTransitionName = "typefield-projection";
    reveal("instant");
  });
  function clear() {
    sourceWord.style.removeProperty("view-transition-name");
    projectionWord.style.removeProperty("view-transition-name");
    if (root.dataset.passage === "projection") delete root.dataset.passage;
    recast = undefined;
  }
  recast.ready.catch(() => {});
  recast.finished.then(clear, clear);
}
