const stage = document.querySelector("#exchange-stage");
const people = document.querySelector("#people-word");
const verb = document.querySelector("#verb-word");
const city = document.querySelector("#city-word");
const reading = document.querySelector("#exchange-reading");
const buttons = [...document.querySelectorAll("[data-voice-choice]")];
const swap = document.querySelector("#swap-voice");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let voice = "we";
let transition;

const readings = {
  we: "We remember the city.",
  city: "The city remembers us.",
  none: "The city is remembered.",
};

function draw() {
  stage.dataset.voice = voice;
  people.hidden = voice === "none";
  people.textContent = voice === "city" ? "US." : "WE";
  people.dataset.role = voice === "we" ? "actor" : "object";
  city.textContent = voice === "we" ? "THE CITY." : "THE CITY";
  city.dataset.role = voice === "we" ? "object" : "actor";
  verb.textContent = { we: "REMEMBER", city: "REMEMBERS", none: "IS REMEMBERED." }[voice];

  reading.textContent = readings[voice];
  for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.voiceChoice === voice));
}

function choose(next) {
  if (voice === next) return;
  voice = next;
  transition?.skipTransition();
  const scope = typeof stage.startViewTransition === "function" ? stage : document;
  if (motion.matches || typeof scope.startViewTransition !== "function") {
    draw();
    return;
  }
  const change = scope.startViewTransition(draw);
  transition = change;
  change.ready.catch(() => {});
  change.finished.then(() => {
    if (transition === change) transition = undefined;
  });
}

for (const button of buttons) button.addEventListener("click", () => choose(button.dataset.voiceChoice));
swap.addEventListener("click", () => choose(voice === "we" ? "city" : "we"));
motion.addEventListener("change", () => {
  if (motion.matches) transition?.skipTransition();
});
