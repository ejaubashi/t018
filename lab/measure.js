const controls = document.querySelector("#measure-controls");
const column = document.querySelector("#measure-column");
const copy = document.querySelector("#measure-copy");
const marks = document.querySelector("#measure-marks");
const lines = document.querySelector("#measure-lines");
const summary = document.querySelector("#measure-summary");
const width = document.querySelector("#measure-width");
const widthValue = document.querySelector("#measure-width-value");
const trim = document.querySelector("#measure-trim");
const text = document.querySelector("#measure-input");
const wrap = [...document.querySelectorAll("[data-wrap]")];
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : undefined;
let frame = 0;
let trimmed = false;

function characterOffsets(value) {
  if (segmenter) return segmenter.segment(value);
  let index = 0;
  return Array.from(value, segment => {
    const position = index;
    index += segment.length;
    return { segment, index: position };
  });
}

function readLayout() {
  const node = copy.firstChild;
  if (!node) return [];
  const value = node.textContent;
  const range = document.createRange();
  const rows = [];
  const tolerance = parseFloat(getComputedStyle(copy).lineHeight) / 2;

  for (const { segment, index } of characterOffsets(value)) {
    if (!/\S/u.test(segment)) continue;
    const end = index + segment.length;
    range.setStart(node, index);
    range.setEnd(node, end);
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      const center = (rect.top + rect.bottom) / 2;
      const row = rows.find(item => Math.abs(item.center - center) < tolerance);
      if (!row) {
        rows.push({ start: index, end, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, center });
      } else {
        row.start = Math.min(row.start, index);
        row.end = Math.max(row.end, end);
        row.left = Math.min(row.left, rect.left);
        row.right = Math.max(row.right, rect.right);
        row.bottom = Math.max(row.bottom, rect.bottom);
      }
    }
  }
  return rows.sort((a, b) => a.top - b.top);
}

function draw() {
  frame = 0;
  const bounds = column.getBoundingClientRect();
  const rtl = getComputedStyle(copy).direction === "rtl";
  const columns = readLayout();
  const labels = [];
  const annotations = [];
  const value = copy.textContent;

  for (const [index, row] of columns.entries()) {
    const space = Math.max(0, rtl ? row.left - bounds.left : bounds.right - row.right);
    const label = document.createElement("li");
    const number = document.createElement("span");
    const excerpt = document.createElement("span");
    const amount = document.createElement("span");
    const ending = value.slice(row.start, row.end).trim().split(/\s+/u);
    number.className = "line-number";
    number.textContent = String(index + 1).padStart(2, "0");
    excerpt.className = "line-end";
    excerpt.textContent = (ending.length > 3 ? "… " : "") + ending.slice(-3).join(" ");
    amount.className = "line-gap";
    amount.textContent = space.toFixed(1) + " px";
    amount.setAttribute("aria-label", amount.textContent + " unused");
    label.append(number, excerpt, amount);
    labels.push(label);

    if (space > 0.75) {
      const annotation = document.createElement("span");
      annotation.className = "rag-mark";
      annotation.style.top = Math.max(0, row.bottom - bounds.top - 4) + "px";
      annotation.style.left = (rtl ? 0 : Math.max(0, row.right - bounds.left)) + "px";
      annotation.style.width = space + "px";
      annotations.push(annotation);
    }
  }

  marks.replaceChildren(...annotations);
  lines.replaceChildren(...labels);
  summary.textContent = bounds.width.toFixed(1) + " px column · " + columns.length
    + (columns.length === 1 ? " line" : " lines") + " · unused width";
}

function queue() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function updateWidth() {
  column.style.setProperty("--measure-width", width.value + "ch");
  widthValue.value = width.value + " ch";
  width.setAttribute("aria-valuetext", width.value + " zero-character widths");
  queue();
}

width.addEventListener("input", updateWidth);

for (const button of wrap) {
  button.disabled = !CSS.supports("text-wrap", button.dataset.wrap);
  button.addEventListener("click", () => {
    column.style.setProperty("--measure-wrap", button.dataset.wrap);
    for (const other of wrap) other.setAttribute("aria-pressed", String(button === other));
    queue();
  });
}

trim.disabled = !(CSS.supports("text-box-trim", "trim-both") && CSS.supports("text-box-edge", "cap alphabetic"));
trim.addEventListener("click", () => {
  trimmed = !trimmed;
  copy.toggleAttribute("data-trim", trimmed);
  trim.setAttribute("aria-pressed", String(trimmed));
  queue();
});

text.addEventListener("input", () => {
  copy.textContent = text.value.trim().replace(/\s+/gu, " ");
  queue();
});

copy.dir = "auto";
controls.hidden = false;
document.querySelector("#measure-text").hidden = false;
updateWidth();
new ResizeObserver(queue).observe(column);
document.fonts.ready.then(queue);
