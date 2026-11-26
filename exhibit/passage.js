import { labMotion } from "../lab/motion.js";

const root = document.documentElement;
const labWord = document.querySelector("[data-lab-word]");
const landing = new URL("../", import.meta.url).pathname;
const catalog = new URL("../lab/", import.meta.url).pathname;

function route(address, path) {
  const url = new URL(address);
  return url.origin === location.origin && (url.pathname === path || url.pathname === path + "index.html");
}

if (route(location.href, catalog) && document.referrer && route(document.referrer, landing)) {
  const returnAddress = new URL(document.referrer);
  returnAddress.hash = "lab";
  document.querySelector(".lab-name").href = returnAddress.href;
}

function connects(from, to) {
  if (!from || !to) return false;
  if (route(from, landing) && route(to, catalog)) return !new URL(to).hash;
  return route(from, catalog) && route(to, landing) && new URL(to).hash === "#lab";
}

function nameLab(transition, activation, arriving = false) {
  if (!transition) return;
  transition.ready.catch(() => {});
  if (labMotion.matches || !labWord || !connects(activation?.from?.url, activation?.entry?.url)) {
    transition.skipTransition();
    return;
  }
  if (arriving && route(location.href, landing)) {
    document.querySelector("#lab").scrollIntoView({ block: "start", behavior: "instant" });
  }
  root.dataset.passage = "lab";
  labWord.style.viewTransitionName = "typefield-lab";
  function clear() {
    labWord.style.removeProperty("view-transition-name");
    if (root.dataset.passage === "lab") delete root.dataset.passage;
  }
  transition.finished.then(clear, clear);
}

window.addEventListener("pageswap", event => nameLab(event.viewTransition, event.activation));
window.addEventListener("pagereveal", event => nameLab(event.viewTransition, window.navigation?.activation, true));
