import { labMotion } from "../lab/motion.js";

const root = document.documentElement;
const masthead = document.querySelector(".masthead");
const sections = [...document.querySelectorAll("[data-chapter]")];
const links = [...masthead.querySelectorAll("[data-section]")];
const fold = document.querySelector("#type-fold");
const foldFirst = document.querySelector("#fold-first");
const foldSecond = document.querySelector("#fold-second");
const exhibit = document.querySelector("#exhibit");
const sourceWord = document.querySelector("#first-word");
const projectionWord = document.querySelector("#exhibit-reading");
const openingHash = location.hash;
const canUseNativeFold = "registerProperty" in CSS && CSS.supports("animation-timeline: view()")
  && CSS.supports("animation-range: entry 12% cover 58%");

let frame = 0;
let current;
let recast;
let revision = 0;

function refresh() {
  frame = 0;
  const height = window.innerHeight;
  const headerHeight = masthead.offsetHeight;
  const activationLine = Math.max(headerHeight + 25, height * 0.24);
  const end = root.scrollHeight - height;
  let active = sections[0];

  for (const section of sections) {
    if (section.getBoundingClientRect().top <= activationLine) active = section;
  }
  if (end > 0 && window.scrollY >= end - 2) active = sections.at(-1);
  if (active !== current) {
    current = active;
    const key = active.dataset.chapter;
    masthead.dataset.current = key;
    for (const link of links) {
      if (link.dataset.section === key) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  masthead.style.setProperty("--page-progress", end > 0 ? Math.max(0, Math.min(1, window.scrollY / end)) : 0);

  if (!canUseNativeFold && !labMotion.matches) {
    const rect = fold.getBoundingClientRect();
    const start = height - Math.min(height, rect.height) * 0.12;
    const finish = height - (height + rect.height) * 0.58;
    fold.style.setProperty("--fold", Math.max(0, Math.min(1, (start - rect.top) / (start - finish))));
  } else {
    fold.style.removeProperty("--fold");
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(refresh);
}

function measureHeader() {
  root.style.setProperty("--masthead-space", (masthead.offsetHeight + 14) + "px");
  schedule();
}

fold.toggleAttribute("data-native", canUseNativeFold);
document.addEventListener("click", event => {
  if (event.target.closest?.("a[href^='#']:not(.skip)")) root.setAttribute("data-anchor-motion", "");
});
window.addEventListener("scroll", schedule, { passive: true });
window.addEventListener("resize", schedule, { passive: true });
window.addEventListener("pageshow", schedule);
const headerObserver = new ResizeObserver(measureHeader);
headerObserver.observe(masthead);
new ResizeObserver(schedule).observe(document.querySelector("main"));
labMotion.addEventListener("change", () => {
  if (labMotion.matches) recast?.skipTransition();
  schedule();
});
measureHeader();

export function writeFold(words) {
  foldFirst.textContent = words[0];
  foldSecond.textContent = words[1];
  fold.toggleAttribute("data-long", Math.max(words[0].length, words[1].length) > 4);
}

export function alignOpeningAnchor() {
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
