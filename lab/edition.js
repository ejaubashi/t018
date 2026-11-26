import { atTime, example, makeScore, schedule } from "./score-timing.js";

const directory = document.querySelector(".directory-filters");
const filters = [...directory.querySelectorAll("[data-filter]")];
const entries = [...document.querySelectorAll(".catalog-entry")];
const count = document.querySelector(".directory-count");

function showCategory(category) {
  const choice = filters.some(filter => filter.dataset.filter === category) ? category : "all";
  for (const filter of filters) filter.setAttribute("aria-pressed", String(filter.dataset.filter === choice));
  const shown = entries.filter(entry => {
    const visible = choice === "all" || entry.dataset.category === choice;
    entry.closest("li").hidden = !visible;
    return visible;
  }).length;
  count.textContent = shown + " experiments";
}

for (const button of filters) {
  button.addEventListener("click", () => {
    const choice = button.dataset.filter;
    const url = new URL(location.href);
    if (choice === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", choice);
    history.replaceState(history.state, "", url);
    showCategory(choice);
  });
}
showCategory(new URLSearchParams(location.search).get("category"));
directory.hidden = false;

const sample = document.querySelector(".cover-score");
const line = document.querySelector("#cover-line");
const play = document.querySelector("#cover-play");
const { cues, total } = schedule(makeScore(example).slice(0, 5));
const words = cues.map(({ word }) => {
  const span = document.createElement("span");
  span.className = "cover-word";
  span.textContent = word;
  return span;
});
let frame = 0;
let started = 0;

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  sample.removeAttribute("data-playing");
  for (const word of words) word.removeAttribute("data-active");
  play.textContent = "Play the sentence";
}

function tick(now) {
  const time = now - started;
  if (time >= total) {
    stop();
    return;
  }
  const { index, speaking } = atTime(cues, time);
  for (const [position, word] of words.entries()) word.toggleAttribute("data-active", index === position && speaking);
  frame = requestAnimationFrame(tick);
}

play.addEventListener("click", () => {
  if (frame) {
    stop();
    return;
  }
  started = performance.now();
  sample.setAttribute("data-playing", "");
  play.textContent = "Stop preview";
  frame = requestAnimationFrame(tick);
});

line.replaceChildren(
  words[0], " ", words[1], " ", words[2], document.createElement("br"), words[3], " ", words[4],
);
play.hidden = false;
