import { buildFont } from "./font-builder.js";

const specimen = document.querySelector("#cast-specimen");
const text = document.querySelector("#cast-text");
const weight = document.querySelector("#cast-weight");
const round = document.querySelector("#cast-round");
const slant = document.querySelector("#cast-slant");
const download = document.querySelector("#cast-download");
const status = document.querySelector("#cast-status");
let currentFont;
let currentBytes;
let generation = 0;
let pending = 0;

function drawText() {
  const value = text.value.trim().toUpperCase();
  specimen.textContent = value && value !== text.defaultValue ? value : "FORM\nIN FLUX.";
  specimen.dataset.density = value.length > 18 ? "long" : "short";
}

async function drawFont() {
  pending = 0;
  const revision = generation;
  const bytes = buildFont({
    ink: Number(weight.value),
    roundness: Number(round.value) / 100,
    lean: Number(slant.value) / 100,
  });

  try {
    const font = await new FontFace("Cast-" + revision, bytes).load();
    if (revision !== generation) return;
    document.fonts.add(font);
    specimen.style.fontFamily = "'" + font.family + "', var(--display)";
    specimen.setAttribute("data-font-ready", "");
    if (currentFont) document.fonts.delete(currentFont);
    currentFont = font;
    currentBytes = bytes;
    download.disabled = false;
    if (status.value !== "Font ready") status.value = "Font ready";
  } catch {
    if (revision === generation) status.value = "The generated font could not load";
  }
}

text.addEventListener("input", drawText);
for (const slider of [weight, round, slant]) {
  slider.addEventListener("input", () => {
    generation += 1;
    download.disabled = true;
    if (!pending) pending = requestAnimationFrame(drawFont);
  });
}

download.addEventListener("click", () => {
  if (!currentBytes) return;
  const url = URL.createObjectURL(new Blob([currentBytes], { type: "font/ttf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "typefield-cast.ttf";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

drawText();
drawFont();
