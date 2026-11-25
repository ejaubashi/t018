const witnesses = {
  a: document.querySelector("#witness-a"),
  b: document.querySelector("#witness-b"),
};
const quotes = {
  a: document.querySelector("#quote-a"),
  b: document.querySelector("#quote-b"),
};
const highlightNames = { a: "passenger-evidence", b: "cleaner-evidence" };
const placeholders = { a: "Choose a passenger fragment.", b: "Choose a cleaner fragment." };
const slots = { a: undefined, b: undefined };
const example = document.querySelector("#counter-example");
const clear = document.querySelector("#counter-reset");
const jump = document.querySelector("#counter-jump");
const status = document.querySelector("#counter-status");
const question = document.querySelector("#counter-question");
const ask = document.querySelector("#counter-ask");
const modelStatus = document.querySelector("#counter-model-status");
const buttons = [...document.querySelectorAll("[data-quote]")];
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const highlights = typeof Highlight === "function" ? CSS.highlights : undefined;
const model = globalThis.LanguageModel;
const modelOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};
let availability;
let request;
let selectionFrame = 0;

function describePair() {
  if (slots.a && slots.b) return "Two fragments paired";
  if (slots.a) return "Choose a fragment from the cleaner";
  if (slots.b) return "Choose a fragment from the passenger";
  return "Choose a fragment from each witness";
}

function writtenQuestion() {
  if (/nobody|alone|no one/i.test(slots.a.text) && /clean|saw|waiting|clock/i.test(slots.b.text)) {
    return "Where was the cleaner when the passenger thought the platform was empty?";
  }
  if (/display|blank/i.test(slots.a.text) && /clock|waiting|saw/i.test(slots.b.text)) {
    return "Could the person under the clock see the display the passenger describes?";
  }
  return "Which detail in these two accounts could both witnesses check?";
}

function displayModelStatus() {
  const usable = availability === "available" || availability === "downloadable" || availability === "downloading";
  ask.disabled = !slots.a || !slots.b || !usable || Boolean(request);
  ask.textContent = availability === "downloadable" ? "Download model and ask" : "Ask on this device";
  if (request) return;

  if (availability === "available") {
    modelStatus.value = "On-device model ready";
  } else if (availability === "downloadable" || availability === "downloading") {
    modelStatus.value = "Model download required";
  } else if (availability === "unavailable") {
    modelStatus.value = "Written questions available";
  }
}

function showPair() {
  for (const [id, node] of Object.entries(witnesses)) {
    const slot = slots[id];
    node.toggleAttribute("data-has-fragment", Boolean(slot));
    quotes[id].textContent = slot ? "“" + slot.text + "”" : placeholders[id];
    if (!highlights) continue;
    if (slot) {
      highlights.set(highlightNames[id], new Highlight(slot.range));
    } else {
      highlights.delete(highlightNames[id]);
    }
  }
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(slots[button.dataset.witness]?.text === button.dataset.quote));
  }

  const paired = Boolean(slots.a && slots.b);
  question.hidden = !paired;
  const answer = paired ? writtenQuestion() : "";
  if (question.textContent !== answer) question.textContent = answer;
  status.value = describePair();
  clear.disabled = !(slots.a || slots.b);
  jump.hidden = !paired;
  displayModelStatus();
}

function cancelFlight(element) {
  for (const animation of element.getAnimations()) {
    if (animation.id === "evidence-flight") animation.cancel();
  }
}

function flyFragment(id) {
  const destination = quotes[id];
  const start = slots[id].range.getClientRects()[0];
  if (motion.matches || !start) return;
  cancelFlight(destination);
  const { left, top } = destination.getBoundingClientRect();
  const dx = start.left - left;
  const dy = start.top - top;
  const flight = destination.animate([
    { transform: "translate(" + dx + "px, " + dy + "px) scale(0.82)", opacity: 0.25 },
    { offset: 0.54, transform: "translate(" + dx * 0.28 + "px, " + (dy * 0.32 - 14) + "px)", opacity: 1 },
    { transform: "none", opacity: 1 },
  ], { duration: 690, easing: "cubic-bezier(.22,.74,.2,1)" });
  flight.id = "evidence-flight";
}

function cancelRequest() {
  request?.abort();
  request = undefined;
}

function rangeFor(id, start, end) {
  const node = witnesses[id].firstChild;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function namedFragment(id, text) {
  const start = witnesses[id].textContent.indexOf(text);
  return { range: rangeFor(id, start, start + text.length), text };
}

function setFragment(id, range) {
  const text = range.toString().trim();
  if (text.length < 2 || slots[id]?.range.startOffset === range.startOffset && slots[id]?.range.endOffset === range.endOffset) return;
  cancelRequest();
  slots[id] = { range, text };
  showPair();
  flyFragment(id);
}

function readSelection() {
  selectionFrame = 0;
  const selection = document.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  for (const [id, node] of Object.entries(witnesses)) {
    if (range.startContainer === node.firstChild && range.endContainer === node.firstChild) {
      setFragment(id, range.cloneRange());
      return;
    }
  }
}

function locateFragment(event) {
  if (!highlights?.highlightsFromPoint || !document.getSelection().isCollapsed) return;
  const hits = highlights.highlightsFromPoint(event.clientX, event.clientY);
  for (const [id, slot] of Object.entries(slots)) {
    if (slot && hits.some(hit => hit.ranges.includes(slot.range))) {
      quotes[id].focus();
      return;
    }
  }
}

document.addEventListener("selectionchange", () => {
  if (!selectionFrame) selectionFrame = requestAnimationFrame(readSelection);
});
for (const node of Object.values(witnesses)) node.addEventListener("click", locateFragment);

for (const button of buttons) {
  button.addEventListener("click", () => {
    document.getSelection().removeAllRanges();
    const id = button.dataset.witness;
    setFragment(id, namedFragment(id, button.dataset.quote).range);
  });
}

example.addEventListener("click", () => {
  cancelRequest();
  document.getSelection().removeAllRanges();
  slots.a = namedFragment("a", "Nobody else was there");
  slots.b = namedFragment("b", "I was cleaning the platform");
  showPair();
  flyFragment("a");
  flyFragment("b");
});

clear.addEventListener("click", () => {
  cancelRequest();
  document.getSelection().removeAllRanges();
  slots.a = slots.b = undefined;
  for (const quote of Object.values(quotes)) cancelFlight(quote);
  showPair();
  example.focus();
});

ask.addEventListener("click", async () => {
  if (ask.disabled || !slots.a || !slots.b) return;
  const excerpts = [slots.a.text, slots.b.text];
  const pending = new AbortController();
  request = pending;
  modelStatus.value = availability === "available" ? "Preparing on-device question" : "Preparing browser model";
  displayModelStatus();

  let session;
  try {
    session = await model.create({
      ...modelOptions,
      signal: pending.signal,
      initialPrompts: [{
        role: "system",
        content: "Write one short, neutral question about two excerpts from fictional witness statements. Use only the supplied text. Do not present a guess as a fact. Respond with the question only.",
      }],
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", event => {
          if (request === pending) modelStatus.value = "Downloading model · " + Math.round(event.loaded * 100) + "%";
        });
      },
    });

    const prompt = "Passenger: " + JSON.stringify(excerpts[0]) + "\nCleaner: " + JSON.stringify(excerpts[1]);
    const response = await session.prompt(prompt, { signal: pending.signal });
    if (request !== pending) return;
    const line = response.trim().slice(0, 330);
    if (!line) throw new Error("Empty response");
    question.textContent = line;
    availability = "available";
    request = undefined;
    displayModelStatus();
    modelStatus.value = "Question generated on this device";
  } catch {
    if (request !== pending) return;
    request = undefined;
    displayModelStatus();
    modelStatus.value = "Model unavailable. Showing the written question.";
  } finally {
    session?.destroy();
  }
});

async function checkModel() {
  try {
    availability = await model?.availability(modelOptions) ?? "unavailable";
  } catch {
    availability = "unavailable";
  }
  displayModelStatus();
}

showPair();
checkModel();
