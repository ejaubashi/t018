import { labMotion } from "./motion.js";
import { atTime, example, makeScore, schedule } from "./score-timing.js";

const workspace = document.querySelector("#score-workspace");
const stage = document.querySelector(".score-stage");
const line = document.querySelector("#score-line");
const phase = document.querySelector("#score-phase");
const play = document.querySelector("#score-play");
const slider = document.querySelector("#score-position");
const timeLabel = document.querySelector("#score-time");
const rail = document.querySelector("#score-cues");
const track = document.querySelector("#score-track");
const previousWord = document.querySelector("#score-previous");
const nextWord = document.querySelector("#score-next");
const currentEdit = document.querySelector("#score-current-edit");
const duration = document.querySelector("#score-duration");
const silence = document.querySelector("#score-rest");
const emphasis = document.querySelector("#score-emphasis");
const text = document.querySelector("#score-input");
const apply = document.querySelector("#score-apply");
const notice = document.querySelector("#score-notice");
const share = document.querySelector("#score-share");
const shareField = document.querySelector("#score-share-field");
const shareInput = document.querySelector("#score-link");
const storeKey = "typefield-score-draft";
const seconds = value => (value / 1000).toFixed(2);
let score;
let cues;
let total;
let selection;
let time = 0;
let frame = 0;
let playing = false;
let origin;
let current = -1;
let currentAnimation;
let words = [];
let buttons = [];

function parse(value) {
  if (!value) return;
  try {
    const saved = JSON.parse(value);
    if (typeof saved.text === "string" && Array.isArray(saved.cues)) {
      const marks = makeScore(saved.text, saved.cues);
      if (marks.length) return marks;
    }
  } catch {
    // Invalid links and storage values use the example.
  }
}

function fromLink() {
  return parse(new URLSearchParams(location.hash.slice(1)).get("score"));
}

function initialScore() {
  const shared = fromLink();
  if (shared) return shared;
  try {
    return parse(localStorage.getItem(storeKey)) ?? makeScore(example);
  } catch {
    return makeScore(example);
  }
}

function serialize() {
  return JSON.stringify({ text: score.map(item => item.word).join(" "), cues: score });
}

function save() {
  try {
    localStorage.setItem(storeKey, serialize());
  } catch {
    // The same draft can still be shared from the link.
  }
  shareField.hidden = true;
}

function writeStatus(value) {
  if (notice.textContent !== value) notice.textContent = value;
}

function setPhase(value) {
  if (phase.textContent !== value) phase.textContent = value;
}

function setAnimation(index) {
  currentAnimation?.cancel();
  currentAnimation = undefined;
  if (current >= 0) words[current].removeAttribute("data-current");
  current = index;
  if (index < 0) return;

  const word = words[index];
  word.setAttribute("data-current", "");
  if (labMotion.matches || typeof word.animate !== "function") return;
  const cue = cues[index];
  const peak = cue.emphasis ? 825 : 650;
  currentAnimation = word.querySelector(".score-ink").animate([
    { fontVariationSettings: "'wght' 530, 'opsz' 100, 'SOFT' 24", transform: "translateY(0)" },
    { offset: 0.34, fontVariationSettings: "'wght' " + peak + ", 'opsz' 100, 'SOFT' 34", transform: "translateY(-0.04em)" },
    { fontVariationSettings: "'wght' 530, 'opsz' 100, 'SOFT' 24", transform: "translateY(0)" },
  ], { duration: cue.duration, fill: "both", easing: "ease-in-out" });
  currentAnimation.pause();
}

function show() {
  const { index, speaking, elapsed } = atTime(cues, time);
  const active = speaking && (time > 0 || playing) ? index : -1;
  if (active !== current) {
    setAnimation(active);
    if (playing && active >= 0) revealCue(active);
  }
  if (currentAnimation) currentAnimation.currentTime = elapsed;

  stage.toggleAttribute("data-running", time > 0 && time < total);
  const value = Math.round(time);
  if (Number(slider.value) !== value) slider.value = value;
  const label = seconds(time) + " / " + seconds(total) + " s";
  if (timeLabel.value !== label) {
    timeLabel.value = label;
    slider.setAttribute("aria-valuetext", seconds(time) + " of " + seconds(total) + " seconds");
  }
  track.style.setProperty("--score-head", 100 * time / total + "%");

  if (time >= total) {
    setPhase("Finished");
  } else if (index < 0 || !playing && time === 0) {
    setPhase("Ready");
  } else if (speaking) {
    setPhase("“" + cues[index].word + "”");
  } else {
    setPhase("Silence after “" + cues[index].word + "”");
  }
}

function pause() {
  cancelAnimationFrame(frame);
  frame = 0;
  playing = false;
  play.textContent = "Play";
}

function tick(now) {
  time = Math.min(total, now - origin);
  if (time === total) pause();
  show();
  if (playing) frame = requestAnimationFrame(tick);
}

function select(index, seek = true) {
  if (index < 0 || index >= score.length) return;
  selection = index;
  const chosen = score[index];
  currentEdit.textContent = "Editing “" + chosen.word + "”";
  duration.value = chosen.duration;
  silence.value = chosen.silence;
  emphasis.setAttribute("aria-pressed", String(chosen.emphasis));
  previousWord.disabled = index === 0;
  nextWord.disabled = index === score.length - 1;
  for (const [position, button] of buttons.entries()) {
    button.setAttribute("aria-pressed", String(position === index));
    words[position].toggleAttribute("data-editing", position === index);
  }
  revealCue(index);
  if (seek) {
    pause();
    time = cues[index].start;
    show();
  }
}

function revealCue(index) {
  const element = buttons[index];
  if (!element) return;
  const left = element.offsetLeft;
  const right = left + element.offsetWidth;
  if (left < rail.scrollLeft) rail.scrollLeft = left;
  if (right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = right - rail.clientWidth;
}

function fitTrack() {
  const shortest = Math.min(...cues.map(cue => cue.next - cue.start));
  track.style.width = Math.max(rail.clientWidth, Math.ceil(total * 44 / shortest)) + "px";
}

function build() {
  currentAnimation?.cancel();
  currentAnimation = undefined;
  current = -1;
  ({ cues, total } = schedule(score));
  slider.max = total;
  words = cues.map(({ word }) => {
    const slot = document.createElement("span");
    const ink = document.createElement("span");
    slot.className = "score-word";
    slot.dataset.text = word;
    ink.className = "score-ink";
    ink.textContent = word;
    slot.append(ink);
    return slot;
  });
  line.replaceChildren(...words.flatMap((word, index) => index ? [" ", word] : [word]));

  buttons = cues.map((cue, index) => {
    const button = document.createElement("button");
    const name = document.createElement("span");
    const timing = document.createElement("span");
    const interval = cue.next - cue.start;
    button.className = "score-cue";
    button.type = "button";
    button.style.setProperty("--cue-width", 100 * interval / total + "%");
    button.style.setProperty("--word-share", 100 * cue.duration / interval + "%");
    button.setAttribute("aria-label", cue.word + ", " + cue.duration + " milliseconds, " + cue.silence + " milliseconds silence");
    name.textContent = cue.word;
    timing.textContent = cue.duration + " ms";
    timing.setAttribute("aria-hidden", "true");
    button.append(name, timing);
    button.addEventListener("click", () => select(index));
    return button;
  });
  track.replaceChildren(...buttons);

  time = Math.min(total, time);
  fitTrack();
  select(Math.min(selection, score.length - 1), false);
  show();
}

function editCue(changes) {
  pause();
  const index = selection;
  score[index] = { ...score[index], ...changes };
  const updated = makeScore(score.map(item => item.word).join(" "), score);
  score = updated;
  time = schedule(score).cues[index].start;
  build();
  save();
  writeStatus("Updated “" + score[index].word + "”.");
}

function updateNumber(input, key) {
  input.addEventListener("change", () => {
    const value = input.valueAsNumber;
    editCue({ [key]: Number.isFinite(value) ? value : score[selection][key] });
  });
}

play.addEventListener("click", () => {
  if (playing) {
    pause();
    return;
  }
  if (time >= total) time = 0;
  origin = performance.now() - time;
  playing = true;
  play.textContent = "Pause";
  frame = requestAnimationFrame(tick);
});

slider.addEventListener("input", () => {
  const value = Number(slider.value);
  pause();
  time = value;
  show();
});

updateNumber(duration, "duration");
updateNumber(silence, "silence");
previousWord.addEventListener("click", () => select(selection - 1));
nextWord.addEventListener("click", () => select(selection + 1));
emphasis.addEventListener("click", () => editCue({ emphasis: !score[selection].emphasis }));

apply.addEventListener("click", () => {
  const next = makeScore(text.value, score);
  if (!next.length) {
    writeStatus("Enter a line first.");
    text.focus();
    return;
  }
  pause();
  time = 0;
  score = next;
  selection = 0;
  text.value = score.map(entry => entry.word).join(" ");
  build();
  save();
  writeStatus("Text set. Select a word cue to edit its timing.");
});

share.addEventListener("click", async () => {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ score: serialize() }).toString();
  shareInput.value = url.href;
  shareField.hidden = false;
  try {
    await navigator.clipboard.writeText(url.href);
    writeStatus("Score link copied.");
  } catch {
    shareInput.focus();
    shareInput.select();
    writeStatus("Copy the score link below.");
  }
});

labMotion.addEventListener("change", () => {
  setAnimation(-1);
  show();
});

addEventListener("hashchange", () => {
  const shared = fromLink();
  if (!shared) return;
  pause();
  time = 0;
  score = shared;
  selection = 0;
  text.value = score.map(item => item.word).join(" ");
  build();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

score = initialScore();
selection = Math.max(0, score.findIndex(item => item.word === "light"));
text.value = score.map(item => item.word).join(" ");
workspace.hidden = false;
build();
new ResizeObserver(fitTrack).observe(rail);
