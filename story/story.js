import { labMotion } from "../lab/motion.js";
import { clamp } from "../exhibit/kinetics.js";
import { createStoryRenderer, loadStoryFonts, storyCanvas } from "./render.js";
import { frameRate, movieLength, normalizeStory, storyAddress, storyFromAddress, storyWord, wordPattern } from "./spec.js";

const form = document.querySelector("#story-form");
const inputs = document.querySelector("#story-inputs");
const canvas = document.querySelector("#story-canvas");
const back = document.querySelector("#back-exhibit");
const first = form.elements.namedItem("first");
const second = form.elements.namedItem("second");
const caption = form.elements.namedItem("caption");
const ink = form.elements.namedItem("ink");
const format = form.elements.namedItem("format");
const angle = document.querySelector("#story-angle");
const angleValue = document.querySelector("#angle-value");
const timeInput = document.querySelector("#story-time");
const timeValue = document.querySelector("#time-value");
const play = document.querySelector("#story-play");
const stillTransport = document.querySelector("#still-transport");
const videoTransport = document.querySelector("#video-transport");
const exportButton = document.querySelector("#story-export");
const copy = document.querySelector("#story-copy");
const progressArea = document.querySelector("#encode-progress");
const progress = document.querySelector("#story-progress");
const cancel = document.querySelector("#story-cancel");
const result = document.querySelector("#story-result");
const download = document.querySelector("#story-download");
const share = document.querySelector("#story-share");
const status = document.querySelector("#story-status");

let story = storyFromAddress(location.href);
let renderer;
let time = 0;
let playingSince;
let paintedAt = 0;
let frame = 0;
let renderJob;
let file;
let fileURL;

function note(text) { status.textContent = text; }

function readForm() {
  const a = storyWord(first.value);
  const b = storyWord(second.value);
  story = normalizeStory({
    first: wordPattern.test(a) ? a : story.first,
    second: wordPattern.test(b) ? b : story.second,
    caption: caption.value,
    ink: ink.value,
    angle: angle.value,
  });
  back.href = "../?" + new URLSearchParams({ first: story.first, second: story.second }) + "#exhibit";
}

function saveAddress() {
  const address = storyAddress(location.href, story);
  if (address.href !== location.href) history.replaceState(history.state, "", address);
  return address.href;
}

function paint() {
  if (!renderer) return;
  const video = format.value === "video";
  renderer.paint(story, video ? time : undefined);
  const side = story.angle < 0 ? "−" : story.angle > 0 ? "+" : "";
  angleValue.value = side + Math.abs(story.angle).toFixed(1) + "°";
  angle.setAttribute("aria-valuetext", angleValue.value);
  const position = (time / 1000).toFixed(1);
  timeInput.value = Math.round(time / 10) * 10;
  timeValue.value = position + " s";
  timeInput.setAttribute("aria-valuetext", position + " of " + movieLength / 1000 + " seconds");
  const description = "Typefield story for " + story.first + " and " + story.second + (video ? ", motion preview" : " at " + angleValue.value);
  if (canvas.getAttribute("aria-label") !== description) canvas.setAttribute("aria-label", description);
}

function stopPreview() {
  cancelAnimationFrame(frame);
  playingSince = undefined;
  play.textContent = "Play preview";
}

function animate(now) {
  if (playingSince === undefined) return;
  time = clamp(now - playingSince, 0, movieLength);
  if (now - paintedAt >= 1000 / frameRate || time === movieLength) {
    paintedAt = now;
    paint();
  }
  if (time === movieLength) stopPreview();
  else frame = requestAnimationFrame(animate);
}

play.addEventListener("click", () => {
  if (playingSince !== undefined) {
    stopPreview();
    return;
  }
  if (time === movieLength) time = 0;
  playingSince = performance.now() - time;
  paintedAt = 0;
  play.textContent = "Pause preview";
  frame = requestAnimationFrame(animate);
});

function syncMotionPreference() {
  play.hidden = labMotion.matches;
  if (labMotion.matches) stopPreview();
}

function showFormat() {
  const video = format.value === "video";
  stillTransport.hidden = video;
  videoTransport.hidden = !video;
  exportButton.firstChild.textContent = video ? "Make MP4 " : "Download PNG ";
  syncMotionPreference();
  paint();
}

function clearResult() {
  if (fileURL) URL.revokeObjectURL(fileURL);
  file = undefined;
  fileURL = undefined;
  download.removeAttribute("href");
  result.hidden = true;
  share.hidden = true;
}

function presentFile(blob, video) {
  const extension = video ? "mp4" : "png";
  const name = `typefield-${story.first.toLowerCase()}-${story.second.toLowerCase()}.${extension}`;
  file = new File([blob], name, { type: blob.type });
  fileURL = URL.createObjectURL(file);
  download.href = fileURL;
  download.download = name;
  download.textContent = video ? "Download MP4" : "Save PNG again";
  result.hidden = false;
  share.hidden = !navigator.canShare?.({ files: [file] });
  note(video ? "MP4 ready to download." : "PNG ready to download.");
}

async function stillFile(snapshot) {
  const surface = storyCanvas();
  createStoryRenderer(surface).paint(snapshot);
  if (typeof surface.convertToBlob === "function") return surface.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => surface.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error("The image could not be saved."));
  }, "image/png"));
}

function setExporting(active, video) {
  inputs.disabled = active;
  angle.disabled = active;
  timeInput.disabled = active;
  play.disabled = active;
  progressArea.hidden = !active || !video;
  if (active && video) cancel.focus({ preventScroll: true });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!renderer || renderJob || !form.reportValidity()) return;
  stopPreview();
  readForm();
  const snapshot = { ...story };
  const video = format.value === "video";
  const job = new AbortController();
  renderJob = job;
  clearResult();
  progress.value = 0;
  setExporting(true, video);
  saveAddress();
  note(video ? "Rendering the full motion score…" : "Preparing the PNG…");

  try {
    const blob = video
      ? await (await import("./video.js")).createVideo(snapshot, {
        signal: job.signal,
        progress: value => { progress.value = Math.round(value * 100); },
      })
      : await stillFile(snapshot);
    job.signal.throwIfAborted();
    presentFile(blob, video);
  } catch {
    if (job.signal.aborted) note("Export cancelled.");
    else note(video ? "The video could not be rendered. Try again or save a PNG." : "The PNG could not be saved. Try again.");
  } finally {
    renderJob = undefined;
    setExporting(false, video);
    if (file) {
      if (video) download.focus({ preventScroll: true });
      else download.click();
    } else {
      exportButton.focus({ preventScroll: true });
    }
  }
});

function changeStory() {
  readForm();
  clearResult();
  note("");
  paint();
}

form.addEventListener("input", event => {
  if (event.target.name === "format") {
    stopPreview();
    clearResult();
    note("");
    showFormat();
  } else if (event.target.matches("input, textarea")) {
    changeStory();
  }
});
form.addEventListener("change", event => {
  if (event.target.matches("input, textarea") && form.checkValidity()) saveAddress();
});
angle.addEventListener("input", changeStory);
angle.addEventListener("change", saveAddress);
timeInput.addEventListener("input", () => {
  stopPreview();
  time = Number(timeInput.value);
  paint();
});
cancel.addEventListener("click", () => renderJob?.abort());

copy.addEventListener("click", async () => {
  if (!form.reportValidity()) return;
  const address = saveAddress();
  try {
    await navigator.clipboard.writeText(address);
    note("Story link copied.");
  } catch {
    note("Copy the story link from the address bar.");
  }
});

share.addEventListener("click", async () => {
  if (!file) return;
  try {
    await navigator.share({ files: [file] });
  } catch (error) {
    if (error.name !== "AbortError") note("Use the download link to save and share your file.");
  }
});

labMotion.addEventListener("change", syncMotionPreference);
window.addEventListener("pagehide", () => {
  stopPreview();
  renderJob?.abort();
  clearResult();
});

first.value = story.first;
second.value = story.second;
caption.value = story.caption;
ink.value = story.ink;
angle.value = story.angle;
timeInput.max = movieLength;
try {
  await loadStoryFonts();
  renderer = createStoryRenderer(canvas);
  inputs.disabled = false;
  copy.hidden = !navigator.clipboard?.writeText;
  readForm();
  showFormat();
  note("");
} catch {
  note("The story preview could not load. Reload this page to try again.");
}
