const stage = document.querySelector("#echo-stage");
const textarea = document.querySelector("#echo-input");
const current = document.querySelector("#echo-current");
const ghosts = document.querySelector("#ghosts");
const trace = document.querySelector("#echo-deleted");
const replay = document.querySelector("#echo-play");
const example = document.querySelector("#echo-example");
const clear = document.querySelector("#echo-clear");
const status = document.querySelector("#echo-status");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : undefined;
const initial = { time: 0, text: "" };
const tape = [initial];
const sample = [
  initial,
  { time: 290, text: "I" },
  { time: 470, text: "I thought" },
  { time: 690, text: "I thought you" },
  { time: 980, text: "I thought you would stay." },
  { time: 2030, text: "I thought you would " },
  { time: 2370, text: "I thought you " },
  { time: 2780, text: "I thought you might come back." },
];
let timer = 0;
let started = 0;
let playing;
let traceAnimation;

function clusters(text) {
  return segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
}

function deletion(previous, text) {
  const before = clusters(previous);
  const after = clusters(text);
  let start = 0;
  let leftover = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  while (leftover < before.length - start && leftover < after.length - start
    && before[before.length - 1 - leftover] === after[after.length - 1 - leftover]) {
    leftover += 1;
  }
  return before.slice(start, before.length - leftover).join("").trim();
}

function draw(entry, history) {
  const text = entry.text;
  stage.dataset.density = clusters(text).length > 30 ? "long" : "short";
  current.textContent = text || "Your words go here.";
  ghosts.replaceChildren(...history.slice(-5).reverse().filter(item => item.text.trim()).map((item, index) => {
    const ghost = document.createElement("p");
    ghost.className = "ghost";
    ghost.style.setProperty("--age", index + 1);
    ghost.textContent = item.text;
    return ghost;
  }));

  const removed = deletion(history.at(-1)?.text ?? "", text);
  traceAnimation?.cancel();
  trace.textContent = removed;
  trace.hidden = !removed;
  if (removed && !motion.matches) {
    traceAnimation = trace.animate([
      { transform: "translateY(0.45em)", opacity: 0.5 },
      { transform: "translateY(0)", opacity: 1 },
    ], { duration: 520, easing: "cubic-bezier(.18,.75,.22,1)" });
  }
}

function controls() {
  replay.textContent = playing === "recording" ? "Stop replay" : "Replay typing";
  example.textContent = playing === "example" ? "Stop example" : "Play example";
  replay.disabled = tape.length < 2 || playing === "example";
  clear.disabled = tape.length < 2 && !playing;
}

function stop() {
  clearTimeout(timer);
  playing = undefined;
  controls();
}

function record(showOnly = false, inputType) {
  stop();
  let text = textarea.value;
  if (!showOnly) {
    text = clusters(text).slice(0, 80).join("");
    if (text !== textarea.value) textarea.value = text;
  }
  const previous = tape.at(-1);
  if (text === previous.text) {
    draw(previous, tape.slice(0, -1));
    return;
  }
  if (showOnly) {
    draw({ text }, tape);
    return;
  }
  started ||= performance.now();
  const entry = { text, time: performance.now() - started };
  tape.push(entry);
  if (tape.length > 150) tape.shift();
  draw(entry, tape.slice(0, -1));
  status.textContent = inputType?.startsWith("delete") ? "Deletion recorded" : "Edit recorded";
  controls();
}

function play(entries, kind) {
  stop();
  playing = kind;
  let index = 0;
  const span = entries.at(-1).time - entries[0].time;
  const scale = span > 8000 ? 8000 / span : 1;
  status.textContent = kind === "example" ? "Playing example" : "Replaying your edits";
  controls();

  function advance() {
    draw(entries[index], entries.slice(0, index));
    index += 1;
    if (index === entries.length) {
      stop();
      status.textContent = "Playback complete";
      return;
    }
    const delay = (entries[index].time - entries[index - 1].time) * scale;
    timer = setTimeout(advance, Math.max(18, delay));
  }

  advance();
}

textarea.addEventListener("input", event => record(event.isComposing, event.inputType));
textarea.addEventListener("compositionend", () => record());

replay.addEventListener("click", () => {
  if (playing === "recording") {
    stop();
    draw(tape.at(-1), tape.slice(0, -1));
    status.textContent = "Playback stopped";
  } else {
    play([...tape], "recording");
  }
});

example.addEventListener("click", () => {
  if (playing === "example") {
    stop();
    draw(tape.at(-1), tape.slice(0, -1));
    status.textContent = "Example stopped";
  } else {
    play(sample, "example");
  }
});

clear.addEventListener("click", () => {
  stop();
  tape.splice(0, tape.length, initial);
  textarea.value = "";
  started = 0;
  draw(initial, []);
  status.textContent = "Recording cleared";
  controls();
  textarea.focus();
});
