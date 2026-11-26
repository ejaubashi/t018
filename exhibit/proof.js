import { labMotion } from "../lab/motion.js";
import { clamp, mix } from "./kinetics.js";

export function initializeProof(measureExhibit) {
  const root = document.documentElement;
  const toggle = document.querySelector("#proof-toggle");
  const title = document.querySelector("#proof-heading");
  const masthead = document.querySelector(".masthead");
  const labEntry = document.querySelector("#lab-title a");
  const links = [...document.querySelectorAll("[data-proof-link]")];
  const landmarks = ["opening", "exhibit", "type-fold", "studio", "lab"].map(id => document.getElementById(id));
  const parts = [
    [document.querySelector("#exhibit-title"), "proof-exhibit"],
    [document.querySelector("#exhibit"), "proof-plate"],
    [document.querySelector("#studio-title"), "proof-studio"],
    [document.querySelector("#lab-title"), "proof-lab"],
  ];
  let reading;
  let transition;
  let revision = 0;
  let desired = false;

  function position(node) {
    return node.getBoundingClientRect().top + window.scrollY - masthead.offsetHeight;
  }

  function rememberReading() {
    const y = window.scrollY;
    const anchor = Math.max(0, landmarks.findLastIndex(node => position(node) <= y + 1));
    const start = landmarks[anchor];
    const end = landmarks[anchor + 1];
    const from = position(start);
    const to = end ? position(end) : root.scrollHeight - window.innerHeight;
    return {
      y, start, end, part: clamp((y - from) / Math.max(1, to - from)),
      width: window.innerWidth, height: window.innerHeight, reduced: labMotion.matches,
    };
  }

  function restoreReading() {
    const { y, start, end, part, width, height, reduced } = reading;
    const resized = width !== window.innerWidth || height !== window.innerHeight || reduced !== labMotion.matches;
    const top = resized ? mix(position(start), end ? position(end) : root.scrollHeight - window.innerHeight, part) : y;
    window.scrollTo({ top, behavior: "instant" });
  }

  function nameVisibleParts() {
    for (const [node, name] of parts) {
      const rect = node.getBoundingClientRect();
      const visible = rect.bottom > masthead.offsetHeight && rect.top < window.innerHeight;
      node.style.viewTransitionName = visible ? name : "";
    }
  }

  function clearMotion() {
    for (const [node] of parts) node.style.removeProperty("view-transition-name");
    delete root.dataset.proofMotion;
  }

  function showLayout(show, destination) {
    root.toggleAttribute("data-proof", show);
    toggle.setAttribute("aria-pressed", String(show));
    title.hidden = !show;
    for (const link of links) link.hidden = !show;
    if (show) labEntry.tabIndex = -1;
    else labEntry.removeAttribute("tabindex");
    measureExhibit();

    const address = new URL(location.href);
    if (show) {
      address.searchParams.set("view", "proof");
      history.replaceState(history.state, "", address);
      window.scrollTo({ top: 0, behavior: "instant" });
      title.focus({ preventScroll: true });
      return;
    }

    address.searchParams.delete("view");
    history.replaceState(history.state, "", address);
    restoreReading();
    if (destination) {
      if (location.hash !== "#" + destination.id) {
        address.hash = destination.id;
        history.pushState(history.state, "", address);
      }
      const focus = destination.id === "opening" ? document.querySelector("#exhibit-title") : destination;
      focus.focus({ preventScroll: true });
      destination.scrollIntoView({ block: "start", behavior: "instant" });
    } else {
      toggle.focus({ preventScroll: true });
    }
  }

  function change(show, destination, animated = true) {
    const attempt = ++revision;
    desired = show;
    if (transition) {
      transition.skipTransition();
      clearMotion();
      transition = undefined;
    }
    if (show && !root.hasAttribute("data-proof")) reading = rememberReading();
    if (!animated || labMotion.matches || typeof document.startViewTransition !== "function" || root.dataset.passage) {
      showLayout(show, destination);
      return;
    }

    root.dataset.proofMotion = show ? "open" : "close";
    nameVisibleParts();
    transition = document.startViewTransition(() => {
      if (attempt !== revision) return;
      showLayout(show, destination);
      nameVisibleParts();
    });
    function finish() {
      if (attempt !== revision) return;
      clearMotion();
      transition = undefined;
    }
    transition.ready.catch(() => {});
    transition.finished.then(finish, finish);
  }

  toggle.addEventListener("click", () => change(!desired));
  document.addEventListener("keydown", event => {
    if (desired && event.key === "Escape") {
      event.preventDefault();
      change(false);
    }
  });
  document.addEventListener("click", event => {
    if (!desired || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[data-proof-link], .masthead a[href^='#']");
    if (!link) return;
    event.preventDefault();
    change(false, document.getElementById(link.hash.slice(1)));
  });
  labMotion.addEventListener("change", () => {
    if (labMotion.matches) transition?.skipTransition();
  });
  function proofAddress() {
    return new URLSearchParams(location.search).get("view") === "proof";
  }
  window.addEventListener("popstate", () => {
    const show = proofAddress();
    if (show !== desired) change(show, show ? undefined : document.getElementById(location.hash.slice(1)), false);
  });
  toggle.hidden = false;
  if (proofAddress()) change(true, undefined, false);
}
