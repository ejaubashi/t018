const scroller = document.querySelector("#fold-scroll");
const slider = document.querySelector("#fold-angle");
const turn = document.querySelector("#fold-turn");
const reading = document.querySelector("#fold-reading");
const panels = [...scroller.querySelectorAll(".fold-flap")];
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const nativeTimeline = CSS.supports("animation-timeline: scroll()")
  && CSS.supports("animation-range: 0% 52%");
let frame = 0;

function sync() {
  frame = 0;
  const distance = scroller.scrollHeight - scroller.clientHeight;
  const progress = distance ? scroller.scrollTop / distance : 0;
  const reverse = progress >= 0.5;
  slider.value = Math.round(progress * 100);
  slider.setAttribute("aria-valuetext", Math.round(progress * 100) + "% folded");

  if (!nativeTimeline || motion.matches) {
    for (const [index, panel] of panels.entries()) {
      const amount = motion.matches ? Number(reverse) : Math.min(1, Math.max(0, (progress - index * 0.16) / 0.52));
      panel.style.setProperty("--turn", amount * 180 + "deg");
    }
  }

  const line = reverse ? "The city remembers the way I was." : "I remember the city the way it was.";
  if (reading.textContent !== line) reading.textContent = line;
  turn.textContent = reverse ? "Return to the first reading" : "Turn the sentence";
}

function configure() {
  scroller.toggleAttribute("data-native", nativeTimeline && !motion.matches);
  scroller.toggleAttribute("data-reduced", motion.matches);
  if (nativeTimeline && !motion.matches) {
    for (const panel of panels) panel.style.removeProperty("--turn");
  }
  sync();
}

scroller.addEventListener("scroll", () => {
  if (!frame) frame = requestAnimationFrame(sync);
}, { passive: true });

slider.addEventListener("input", () => {
  const fraction = Number(slider.value) / 100;
  scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * fraction;
});

turn.addEventListener("click", () => {
  const distance = scroller.scrollHeight - scroller.clientHeight;
  const target = scroller.scrollTop >= distance / 2 ? 0 : distance;
  scroller.scrollTo({ top: target, behavior: motion.matches ? "instant" : "smooth" });
});

motion.addEventListener("change", configure);
configure();
