const device = matchMedia("(prefers-reduced-motion: reduce)");
const key = "typefield-lab-motion";
const changes = new EventTarget();
let preference;
let reduced;

try {
  preference = localStorage.getItem(key);
} catch {
  // A storage restriction still allows the current page to honor the preference.
}

function sync() {
  const next = preference === "reduce" || (preference !== "full" && device.matches);
  document.documentElement.dataset.labMotion = next ? "reduce" : "full";
  if (next === reduced) return;
  reduced = next;
  changes.dispatchEvent(new Event("change"));
}

export const labMotion = {
  get matches() { return reduced; },
  addEventListener: changes.addEventListener.bind(changes),
  toggle() {
    preference = reduced ? "full" : "reduce";
    try {
      localStorage.setItem(key, preference);
    } catch {
      // Keep the choice for the current page.
    }
    sync();
  },
};

device.addEventListener("change", sync);
addEventListener("storage", event => {
  if (event.key !== key) return;
  preference = event.newValue;
  sync();
});
sync();
