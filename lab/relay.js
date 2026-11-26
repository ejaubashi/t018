import { labMotion } from "./motion.js";

import { openReading, openingWords, readingName, readings, samePages, words } from "./relay-store.js";

const stage = document.querySelector("#relay-stage");
const windowLinks = document.querySelector("#relay-windows");
const bothLink = document.querySelector("#relay-both");
const version = document.querySelector("#relay-revision");
const form = document.querySelector("#relay-form");
const destination = document.querySelector("#relay-destination");
const position = document.querySelector("#relay-position");
const move = document.querySelector("#relay-move");
const selectionLabel = document.querySelector("#relay-selection");
const undo = document.querySelector("#relay-undo");
const reset = document.querySelector("#relay-reset");
const notice = document.querySelector("#relay-notice");
const log = document.querySelector("#relay-events");
const reducedMotion = labMotion;
const panels = Object.fromEntries(readings.map(name => [name, stage.querySelector('[data-reading="' + name + '"]')]));
const view = new URLSearchParams(location.search).get("view");
const mime = "application/x-typefield-relay";
const storageSignal = "typefield-relay-revision";
let store;
let channel;
let snapshot;
let selected = [];
let source;
let selectionStart;
let transition;
let renderVersion = 0;
let committing = false;
let dropPanel;
let dropWord;

if (readings.includes(view)) {
  stage.dataset.view = view;
  panels[other(view)].hidden = true;
  bothLink.hidden = false;
  windowLinks.querySelector('a[href="?view=' + view + '"]').hidden = true;
}

function other(name) {
  return name === "first" ? "second" : "first";
}

function optionText(id, index) {
  return "Before “" + words[id] + "” · " + (index + 1);
}

function refreshControls() {
  const previous = position.value;
  const available = snapshot.pages[destination.value].filter(id => !selected.includes(id));
  const options = available.map((id, index) => new Option(optionText(id, index), id));
  position.replaceChildren(new Option("End of reading", ""), ...options);
  if (options.some(option => option.value === previous)) position.value = previous;

  move.disabled = !selected.length || committing;
  undo.disabled = !snapshot.undo.length || committing;
  reset.disabled = samePages(snapshot.pages, openingWords()) || committing;
  selectionLabel.value = selected.length ? selected.length + (selected.length === 1 ? " word selected" : " words selected")
    : "Select words to move";

  for (const node of stage.querySelectorAll(".relay-word")) {
    node.setAttribute("aria-pressed", String(selected.includes(Number(node.dataset.word))));
  }
}

function clearSelection() {
  selected = [];
  source = undefined;
  selectionStart = undefined;
}

function report(message, receipt = false) {
  notice.classList.toggle("sr-only", receipt);
  notice.textContent = message;
}

function draw() {
  const event = snapshot.events.at(-1);
  const focusWord = document.activeElement?.dataset.word;
  for (const name of readings) {
    const pane = panels[name];
    const content = pane.querySelector(".relay-words");
    const ids = snapshot.pages[name];
    const text = document.createDocumentFragment();
    for (const [index, id] of ids.entries()) {
      if (index) text.append(" ");
      const word = document.createElement("button");
      word.type = "button";
      word.className = "relay-word";
      word.dataset.word = id;
      word.draggable = true;
      word.textContent = words[id];
      word.style.viewTransitionName = "relay-word-" + id;
      word.toggleAttribute("data-arrived", Boolean(event?.affected.includes(id)));
      text.append(word);
    }
    if (!ids.length) {
      const empty = document.createElement("span");
      empty.className = "relay-empty";
      empty.textContent = "Move words here to begin this reading.";
      text.append(empty);
    }
    content.replaceChildren(text);
    pane.querySelector(".relay-count").textContent = ids.length + (ids.length === 1 ? " word" : " words");
  }

  version.textContent = "Revision " + snapshot.revision + (store.shared ? " · Shared in this browser" : " · This window only");
  log.replaceChildren(...snapshot.events.slice(-5).reverse().map(event => {
    const item = document.createElement("li");
    const number = document.createElement("span");
    number.className = "micro";
    number.textContent = "Revision " + event.revision;
    item.append(number, event.text);
    return item;
  }));

  refreshControls();
  if (focusWord !== undefined) {
    const onScreen = stage.querySelector('[data-reading]:not([hidden]) [data-word="' + focusWord + '"]');
    (onScreen ?? destination).focus({ preventScroll: true });
  }
}

function accept(state, animated) {
  if (snapshot && snapshot.revision >= state.revision) return;
  snapshot = state;
  if (source && selected.some(id => !state.pages[source].includes(id))) clearSelection();

  const ticket = ++renderVersion;
  transition?.skipTransition();
  transition = undefined;
  const scope = typeof stage.startViewTransition === "function" ? stage : document;
  const update = () => {
    if (ticket === renderVersion) draw();
  };
  if (!animated || reducedMotion.matches || typeof scope.startViewTransition !== "function") {
    update();
    return;
  }

  const type = state.events.at(-1)?.type;
  const hasTypes = "types" in (window.ViewTransition?.prototype ?? {});
  const next = scope.startViewTransition(hasTypes ? { update, types: [type] } : update);
  transition = next;
  next.ready.catch(() => {});
  next.finished.then(() => {
    if (transition === next) transition = undefined;
  });
}

async function refresh() {
  if (!store?.shared) return;
  try {
    accept(await store.read(), true);
  } catch {
    report("Could not update the shared reading.");
  }
}

function announce(revision) {
  if (!store.shared) return;
  if (channel) {
    channel.postMessage(revision);
  } else {
    try {
      localStorage.setItem(storageSignal, String(revision));
    } catch {
      // Focus and visibility checks also reconcile the reading.
    }
  }
}

async function commit(action) {
  if (!store || committing) return;
  committing = true;
  refreshControls();
  try {
    const update = await store.commit(action);
    if (update.changed) clearSelection();
    accept(update.state, update.changed);
    report(update.message, update.changed);
    if (update.changed) announce(update.state.revision);
  } catch {
    report("The move could not be saved. Try it again.");
  } finally {
    committing = false;
    refreshControls();
  }
}

function pick(word, range) {
  const pane = word.closest("[data-reading]").dataset.reading;
  const id = Number(word.dataset.word);
  if (!snapshot.pages[pane].includes(id)) return;
  if (source !== pane || !selected.length) {
    selected = [id];
    source = pane;
    selectionStart = id;
    destination.value = other(pane);
    position.value = "";
  } else if (range && selectionStart !== undefined) {
    const ids = snapshot.pages[pane];
    const first = ids.indexOf(selectionStart);
    const last = ids.indexOf(id);
    selected = ids.slice(Math.min(first, last), Math.max(first, last) + 1);
  } else {
    selected = selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
    selectionStart = selected.length ? id : undefined;
  }
  refreshControls();
}

function dropPosition(event, pane) {
  const word = event.target.closest(".relay-word");
  if (!word) return { before: null };
  const { left, width } = word.getBoundingClientRect();
  const after = event.clientX >= left + width / 2;
  const ordered = snapshot.pages[pane.dataset.reading];
  const id = Number(word.dataset.word);
  return { word, after, before: after ? ordered[ordered.indexOf(id) + 1] ?? null : id };
}

function clearDrop() {
  dropPanel?.removeAttribute("data-drop-panel");
  dropWord?.removeAttribute("data-slot");
  dropPanel = dropWord = undefined;
}

stage.addEventListener("click", event => {
  const word = event.target.closest(".relay-word");
  if (word && !committing) pick(word, event.shiftKey);
});

stage.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !selected.length) return;
  clearSelection();
  refreshControls();
});

stage.addEventListener("dragstart", event => {
  const word = event.target.closest(".relay-word");
  if (!word || !store || committing) return;
  const id = Number(word.dataset.word);
  const name = word.closest("[data-reading]").dataset.reading;
  if (!snapshot.pages[name].includes(id)) {
    event.preventDefault();
    return;
  }
  if (!selected.includes(id)) {
    clearSelection();
    pick(word, false);
  }
  const ordered = snapshot.pages[source].filter(item => selected.includes(item));
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(mime, JSON.stringify({ from: source, ids: ordered }));
  event.dataTransfer.setData("text/plain", ordered.map(item => words[item]).join(" "));
});

stage.addEventListener("dragover", event => {
  const pane = event.target.closest("[data-reading]");
  if (!pane || !event.dataTransfer.types.includes(mime)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const { word, after } = dropPosition(event, pane);
  clearDrop();
  dropPanel = pane;
  dropWord = word;
  pane.setAttribute("data-drop-panel", "");
  word?.setAttribute("data-slot", after ? "after" : "before");
});

stage.addEventListener("dragend", clearDrop);
stage.addEventListener("dragleave", event => {
  if (!stage.contains(event.relatedTarget)) clearDrop();
});

stage.addEventListener("drop", event => {
  const pane = event.target.closest("[data-reading]");
  if (!pane || !event.dataTransfer.types.includes(mime)) return;
  event.preventDefault();
  const { before } = dropPosition(event, pane);
  clearDrop();
  try {
    const { from, ids } = JSON.parse(event.dataTransfer.getData(mime));
    commit({ type: "move", from, to: pane.dataset.reading, before, ids });
  } catch {
    report("The dragged words could not be read.");
  }
});

destination.addEventListener("change", () => {
  position.value = "";
  refreshControls();
});

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!selected.length || !source) return;
  commit({ type: "move", from: source, to: destination.value, before: position.value === "" ? null : Number(position.value), ids: [...selected] });
});

undo.addEventListener("click", () => commit({ type: "undo", revision: snapshot.revision }));
reset.addEventListener("click", () => commit({ type: "reset" }));
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) transition?.skipTransition();
});

store = await openReading();
accept(store.initial, false);
form.hidden = false;
windowLinks.hidden = !store.shared && !readings.includes(view);
if (!store.shared) {
  for (const link of windowLinks.querySelectorAll("a[target]")) link.hidden = true;
}

if (store.shared) {
  if (typeof BroadcastChannel === "function") {
    try {
      channel = new BroadcastChannel("typefield-relay");
      channel.onmessage = event => {
        if (event.data > snapshot.revision) refresh();
      };
    } catch {
      channel = undefined;
    }
  }
  addEventListener("storage", event => {
    if (event.key === storageSignal && Number(event.newValue) > snapshot.revision) refresh();
  });
  addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  refresh();
}
