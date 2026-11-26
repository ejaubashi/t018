import { labMotion } from "../lab/motion.js";
import { clamp } from "../exhibit/kinetics.js";
import { cleanBrief } from "./compose.js";
import { requestScore } from "./compose-client.js";
import { createScoreRenderer, loadStoryFonts, storyCanvas } from "./render.js?v=2";
import {
  frameRate, maxScenes, motions, normalizeScene, readScore, sceneAt, scoreAddress, scoreFromAddress,
  storyWord, timelineOf, transitionDuration, transitions, wordPattern,
} from "./spec.js?v=2";

const element = id => document.getElementById(id);
const form = element("story-form");
const fields = element("story-inputs");
const { first, second, caption, ink, motion, transition, duration } = form.elements;
const briefForm = element("brief-form");
const brief = element("brief");
const compose = element("compose");
const example = element("example");
const cancelCompose = element("cancel-compose");
const composeStatus = element("compose-status");
const endpoint = document.querySelector('meta[name="typefield-compose-endpoint"]').content;
const draftPanel = element("draft");
const draftScenes = element("draft-scenes");
const useDraft = element("use-draft");
const rail = element("scene-rail");
const add = element("add-scene");
const earlier = element("move-up");
const later = element("move-down");
const remove = element("remove-scene");
const recipeStatus = element("recipe-status");
const recipeFile = element("recipe-file");
const copy = element("story-copy");
const saveRecipe = element("save-recipe");
const openRecipe = element("open-recipe");
const back = element("back-exhibit");

const canvas = element("story-canvas");
const angle = element("story-angle");
const angleValue = element("angle-value");
const timeInput = element("story-time");
const timeValue = element("time-value");
const play = element("story-play");
const modes = [...document.querySelectorAll("[data-mode]")];
const stillTransport = element("still-transport");
const videoTransport = element("video-transport");
const exportButton = element("story-export");
const capture = element("capture-frame");
const progressArea = element("encode-progress");
const progress = element("story-progress");
const cancel = element("story-cancel");
const result = element("story-result");
const download = element("story-download");
const share = element("story-share");
const status = element("story-status");

let score = scoreFromAddress(location.href);
let timing = timelineOf(score);
let selected = 0;
let active = -1;
let mode = score.scenes.length > 1 ? "video" : "photo";
let renderer;
let time = 0;
let playingSince;
let paintedAt = 0;
let frame = 0;
let renderJob;
let composeJob;
let draft;
let seed = 0;
let previousBrief = "";
let file;
let fileURL;

function saveAddress() {
  const address = scoreAddress(location.href, score);
  if (address.href !== location.href) history.replaceState(history.state, "", address);
  return address.href;
}

function frameTime() {
  const lastFrame = Math.round(timing.duration * frameRate / 1000) - 1;
  return Math.min(lastFrame, Math.floor(time * frameRate / 1000)) / frameRate * 1000;
}

function paint() {
  if (!renderer) return;
  const video = mode === "video";
  const position = video ? frameTime() : undefined;
  renderer.paint(score, position, selected);
  const next = video ? sceneAt(timing.starts, position) : selected;
  if (active !== next) {
    rail.children[active]?.firstElementChild.removeAttribute("data-playing");
    rail.children[next]?.firstElementChild.toggleAttribute("data-playing", video);
    active = next;
  }
  if (video) rail.children[next].firstElementChild.style.setProperty("--clip-progress",
    clamp((position - timing.starts[next]) / score.scenes[next].durationMs));
  const { first, second } = score.scenes[next];
  const description = "Scene " + (next + 1) + ", " + first + " and " + second;
  if (canvas.getAttribute("aria-label") !== description) canvas.setAttribute("aria-label", description);
  const degrees = Number(angle.value);
  const sign = degrees < 0 ? "−" : degrees > 0 ? "+" : "";
  angleValue.value = sign + Math.abs(degrees).toFixed(1) + "°";
  angle.setAttribute("aria-valuetext", angleValue.value);
  timeInput.value = Math.round(time / 10) * 10;
  timeValue.value = (time / 1000).toFixed(2) + " / " + (timing.duration / 1000).toFixed(1) + " s";
  timeInput.setAttribute("aria-valuetext", (time / 1000).toFixed(2) + " seconds of " + timing.duration / 1000);
}

function stopPreview() {
  cancelAnimationFrame(frame);
  playingSince = undefined;
  play.textContent = "Play";
}

function animate(now) {
  if (playingSince === undefined) return;
  time = clamp(now - playingSince, 0, timing.duration);
  if (now - paintedAt >= 1000 / frameRate || time === timing.duration) {
    paintedAt = now;
    paint();
  }
  if (time === timing.duration) stopPreview();
  else frame = requestAnimationFrame(animate);
}

function syncMotionPreference() {
  play.hidden = labMotion.matches;
  if (labMotion.matches) stopPreview();
}

function showMode() {
  const video = mode === "video";
  stillTransport.hidden = video;
  videoTransport.hidden = !video;
  capture.hidden = !video;
  exportButton.textContent = video ? "Make MP4" : "Download PNG";
  for (const button of modes) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  active = -1;
  for (const button of rail.querySelectorAll("[data-playing]")) button.removeAttribute("data-playing");
  syncMotionPreference();
  paint();
}

function setSceneActionState() {
  add.disabled = !renderer || !!renderJob || score.scenes.length >= maxScenes;
  earlier.disabled = selected === 0;
  later.disabled = selected === score.scenes.length - 1;
  remove.disabled = score.scenes.length === 1;
  transition.disabled = selected === 0;
  transition.title = selected === 0 ? "Transitions start with the second scene." : "How this scene enters.";
}

function selectScene(index) {
  selected = index;
  const scene = score.scenes[index];
  first.value = scene.first;
  second.value = scene.second;
  caption.value = scene.caption;
  ink.value = scene.ink;
  motion.value = scene.motion;
  transition.value = scene.transition;
  duration.value = scene.durationMs / 1000;
  angle.value = scene.angle;
  element("scene-label").textContent = "Scene " + (index + 1);
  back.href = "../?" + new URLSearchParams({ first: scene.first, second: scene.second }) + "#exhibit";
  rail.querySelectorAll("button").forEach((button, position) => button.setAttribute("aria-pressed", String(position === index)));
  setSceneActionState();
}

function rebuildRail() {
  const items = score.scenes.map((scene, index) => {
    const item = document.createElement("li");
    item.style.setProperty("--scene-length", String(scene.durationMs));
    item.dataset.ink = scene.ink;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = index;
    button.disabled = !!renderJob;
    button.setAttribute("aria-label", "Scene " + (index + 1) + ", " + scene.first + " / " + scene.second);
    button.setAttribute("aria-pressed", String(selected === index));
    const meta = document.createElement("span");
    meta.className = "scene-timing";
    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const length = document.createElement("span");
    length.textContent = (scene.durationMs / 1000).toFixed(1) + " s";
    meta.append(number, length);
    const pair = document.createElement("span");
    pair.className = "scene-pair";
    pair.textContent = scene.first + " / " + scene.second;
    button.append(meta, pair);
    item.append(button);
    return item;
  });
  rail.replaceChildren(...items);
  element("sequence-name").textContent = score.title + " · " + (timing.duration / 1000).toFixed(1) + " s";
  timeInput.max = timing.duration;
  active = -1;
}

function readableStart(index) {
  const scene = score.scenes[index];
  return timing.starts[index] + (index && scene.transition !== "cut" ? transitionDuration : 0);
}

function showScene(index) {
  stopPreview();
  clearResult();
  status.textContent = "";
  selectScene(index);
  time = readableStart(index);
  paint();
}

function updateScene() {
  stopPreview();
  const previous = score.scenes[selected];
  const a = storyWord(first.value);
  const b = storyWord(second.value);
  const within = time - timing.starts[selected];
  const scene = normalizeScene({
    first: wordPattern.test(a) ? a : previous.first,
    second: wordPattern.test(b) ? b : previous.second,
    caption: caption.value,
    ink: ink.value,
    angle: angle.value,
    durationMs: duration.validity.valid ? duration.valueAsNumber * 1000 : previous.durationMs,
    motion: motion.value,
    transition: transition.value,
  });
  const scenes = score.scenes.with(selected, scene);
  score = { ...score, scenes };
  timing = timelineOf(score);
  const afterCut = readableStart(selected) - timing.starts[selected];
  time = timing.starts[selected] + clamp(within, afterCut, scene.durationMs - 10);
  back.href = "../?" + new URLSearchParams({ first: scene.first, second: scene.second }) + "#exhibit";
  rebuildRail();
  clearResult();
  status.textContent = "";
  paint();
}

function replaceScore(next, index, nextMode = mode) {
  score = next;
  timing = timelineOf(score);
  mode = nextMode;
  rebuildRail();
  showScene(index);
  showMode();
  saveAddress();
}

function clearResult() {
  if (fileURL) URL.revokeObjectURL(fileURL);
  file = undefined;
  fileURL = undefined;
  download.removeAttribute("href");
  result.hidden = true;
  share.hidden = true;
}

function fileName() {
  return "typefield-" + (score.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sequence");
}

function presentFile(blob, video) {
  const name = fileName() + (video ? ".mp4" : ".png");
  file = new File([blob], name, { type: blob.type });
  fileURL = URL.createObjectURL(file);
  download.href = fileURL;
  download.download = name;
  download.textContent = video ? "Download MP4" : "Save PNG again";
  result.hidden = false;
  share.hidden = !navigator.canShare?.({ files: [file] });
  status.textContent = video ? "MP4 ready." : "PNG ready.";
}

async function stillFile(score, position, index) {
  const surface = storyCanvas();
  createScoreRenderer(surface).paint(score, position, index);
  if (typeof surface.convertToBlob === "function") return surface.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => surface.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error("The image could not be saved."));
  }, "image/png"));
}

function updateLocks() {
  const exporting = !!renderJob;
  const composing = !!composeJob;
  const ready = !!renderer;
  fields.disabled = !ready || exporting;
  for (const member of [angle, timeInput, play, capture, exportButton, saveRecipe, openRecipe, copy, ...modes]) {
    member.disabled = !ready || exporting;
  }
  for (const button of rail.querySelectorAll("button")) button.disabled = exporting;
  setSceneActionState();
  for (const member of [compose, example, brief]) member.disabled = !ready || exporting || composing;
  cancelCompose.hidden = !composing;
  useDraft.disabled = exporting || composing;
}

async function exportFile(video, position, trigger) {
  if (!renderer || renderJob || !form.reportValidity()) return;
  stopPreview();
  const job = new AbortController();
  const snapshot = score;
  const index = selected;
  renderJob = job;
  clearResult();
  saveAddress();
  progress.value = 0;
  progressArea.hidden = !video;
  updateLocks();
  if (video) cancel.focus({ preventScroll: true });
  status.textContent = video ? "Rendering the sequence…" : "Preparing the PNG…";
  try {
    const blob = video
      ? await (await import("./video.js?v=2")).createVideo(snapshot, {
        signal: job.signal,
        progress: value => { progress.value = Math.round(value * 100); },
      })
      : await stillFile(snapshot, position, index);
    job.signal.throwIfAborted();
    presentFile(blob, video);
  } catch {
    status.textContent = job.signal.aborted ? "Export cancelled." : "The export failed. Try again.";
  } finally {
    renderJob = undefined;
    progressArea.hidden = true;
    updateLocks();
    if (file && video) download.focus({ preventScroll: true });
    else {
      if (file) download.click();
      trigger.focus({ preventScroll: true });
    }
  }
}

function clearDraft() {
  draft = undefined;
  draftPanel.hidden = true;
  draftScenes.replaceChildren();
}

function showDraft(result) {
  draft = result.score;
  element("draft-source").textContent = result.source;
  const pairs = draft.scenes.map(scene => {
    const item = document.createElement("li");
    item.dataset.ink = scene.ink;
    item.textContent = scene.first + " / " + scene.second;
    return item;
  });
  draftScenes.replaceChildren(...pairs);
  draftPanel.hidden = false;
}

briefForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (renderJob || composeJob) return;
  const text = cleanBrief(brief.value);
  if (!text) {
    composeStatus.textContent = "Enter a creative brief.";
    return;
  }
  seed = text === previousBrief ? seed + 1 : 0;
  previousBrief = text;
  const job = new AbortController();
  composeJob = job;
  clearDraft();
  updateLocks();
  composeStatus.textContent = "Composing…";
  try {
    const result = await requestScore(text, seed, { endpoint, signal: job.signal });
    job.signal.throwIfAborted();
    showDraft(result);
    composeStatus.textContent = "Draft ready.";
  } catch (error) {
    composeStatus.textContent = job.signal.aborted ? "Composition cancelled." : error.message;
  } finally {
    composeJob = undefined;
    updateLocks();
    (draft ? useDraft : compose).focus({ preventScroll: true });
  }
});
example.addEventListener("click", () => {
  brief.value = "A night train arriving at dawn. The city changes color as it wakes.";
  briefForm.requestSubmit();
});
cancelCompose.addEventListener("click", () => composeJob?.abort());
element("discard-draft").addEventListener("click", () => {
  clearDraft();
  composeStatus.textContent = "";
  compose.focus();
});
useDraft.addEventListener("click", () => {
  if (!draft || renderJob) return;
  replaceScore(draft, 0, "video");
  clearDraft();
  composeStatus.textContent = "Draft loaded.";
  rail.firstElementChild.firstElementChild.focus({ preventScroll: true });
});

rail.addEventListener("click", event => {
  const button = event.target.closest("button[data-index]");
  if (button && form.reportValidity()) showScene(Number(button.dataset.index));
});
function focusSelection() { rail.children[selected].firstElementChild.focus(); }

add.addEventListener("click", () => {
  if (!form.reportValidity()) return;
  const scene = normalizeScene({ durationMs: 3000, ink: "violet", motion: "prism" });
  const scenes = [...score.scenes, scene];
  replaceScore({ ...score, scenes }, scenes.length - 1, "video");
  focusSelection();
});
remove.addEventListener("click", () => {
  const scenes = score.scenes.filter((_, index) => index !== selected);
  replaceScore({ ...score, scenes }, Math.min(selected, scenes.length - 1));
  focusSelection();
});
function moveScene(offset) {
  if (!form.reportValidity()) return;
  const scenes = [...score.scenes];
  const destination = selected + offset;
  [scenes[selected], scenes[destination]] = [scenes[destination], scenes[selected]];
  replaceScore({ ...score, scenes }, destination);
  focusSelection();
}
earlier.addEventListener("click", () => moveScene(-1));
later.addEventListener("click", () => moveScene(1));
form.addEventListener("submit", event => event.preventDefault());
form.addEventListener("input", updateScene);
form.addEventListener("change", () => { if (form.checkValidity()) saveAddress(); });
angle.addEventListener("input", updateScene);
angle.addEventListener("change", saveAddress);

for (const button of modes) {
  button.addEventListener("click", () => {
    if (mode === button.dataset.mode) return;
    mode = button.dataset.mode;
    stopPreview();
    clearResult();
    status.textContent = "";
    showMode();
  });
}
play.addEventListener("click", () => {
  if (playingSince !== undefined) {
    stopPreview();
    return;
  }
  if (time === timing.duration) time = 0;
  playingSince = performance.now() - time;
  paintedAt = 0;
  play.textContent = "Pause";
  frame = requestAnimationFrame(animate);
});
timeInput.addEventListener("input", () => {
  stopPreview();
  time = Number(timeInput.value);
  paint();
});
element("guides").addEventListener("change", event => { element("story-guides").hidden = !event.target.checked; });
exportButton.addEventListener("click", () => exportFile(mode === "video", undefined, exportButton));
capture.addEventListener("click", () => {
  paint();
  exportFile(false, frameTime(), capture);
});
cancel.addEventListener("click", () => renderJob?.abort());
share.addEventListener("click", async () => {
  if (!file) return;
  try {
    await navigator.share({ files: [file] });
  } catch (error) {
    if (error.name !== "AbortError") status.textContent = "Save the downloaded file to share it.";
  }
});

copy.addEventListener("click", async () => {
  if (!form.reportValidity()) return;
  const address = saveAddress();
  try {
    await navigator.clipboard.writeText(address);
    recipeStatus.textContent = "Sequence link copied.";
  } catch {
    recipeStatus.textContent = "Copy the sequence link from the address bar.";
  }
});
saveRecipe.addEventListener("click", () => {
  if (!form.reportValidity()) return;
  const content = new Blob([JSON.stringify(score, null, 2) + "\n"], { type: "application/json" });
  const link = document.createElement("a");
  const href = URL.createObjectURL(content);
  link.href = href;
  link.download = fileName() + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 3000);
});
openRecipe.addEventListener("click", () => recipeFile.click());
recipeFile.addEventListener("change", async () => {
  const recipe = recipeFile.files[0];
  recipeFile.value = "";
  if (!recipe || renderJob) return;
  try {
    const contents = recipe.size <= 12000 ? JSON.parse(await recipe.text()) : null;
    const next = readScore(contents?.score ?? contents);
    if (!next || renderJob) throw new Error("Invalid score");
    replaceScore(next, 0, next.scenes.length > 1 ? "video" : "photo");
    recipeStatus.textContent = "Score opened.";
  } catch {
    recipeStatus.textContent = "Choose a valid Typefield score JSON file.";
  }
});

labMotion.addEventListener("change", syncMotionPreference);
window.addEventListener("pagehide", () => {
  stopPreview();
  composeJob?.abort();
  renderJob?.abort();
  clearResult();
});

function loadChoices(control, choices) {
  for (const [key, name] of Object.entries(choices)) control.add(new Option(name, key));
}
loadChoices(motion, motions);
loadChoices(transition, transitions);
try {
  await loadStoryFonts();
  renderer = createScoreRenderer(canvas);
  rebuildRail();
  selectScene(0);
  showMode();
  updateLocks();
  copy.hidden = !navigator.clipboard?.writeText;
  status.textContent = "";
} catch {
  status.textContent = "The story preview could not load. Reload to try again.";
}
