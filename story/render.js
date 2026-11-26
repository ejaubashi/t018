import { createLetterField, projectGlyphs } from "../exhibit/letter-field.js?v=3";
import { clamp, limit, mix, scoreAt } from "../exhibit/kinetics.js";
import { movieLength, storySize } from "./spec.js";

const themes = {
  amber: {
    ground: "#181421", text: "#fff2d8", subtle: "#d6bfdb", line: "#5c4770",
    first: "#ffb477", last: "#c5b6ff", panel: "#2d2238", glyphs: ["#ffe1a7", "#ffad98", "#c8b0ff"],
  },
  violet: {
    ground: "#18112b", text: "#f4e8ff", subtle: "#d0baee", line: "#594573",
    first: "#c9b6ff", last: "#ffabbd", panel: "#292046", glyphs: ["#e6d4ff", "#ffabbd", "#a9b9ff"],
  },
  paper: {
    ground: "#f6eadd", text: "#2d1a33", subtle: "#513b5d", line: "#b299b5",
    first: "#6b3158", last: "#473381", panel: "#e9d8ed", glyphs: ["#3d2450", "#b0526c", "#6151ab"],
  },
};

const { width, height } = storySize;
const margin = 84;
const plate = { x: margin, y: 838, width: width - 2 * margin, height: 570 };
let fontsReady;

export function loadStoryFonts() {
  const fonts = typeof document === "undefined" ? globalThis.fonts : document.fonts;
  fontsReady ??= Promise.all([
    ["Archivo", "archivo-latin-variable.woff2", "100 900"],
    ["Bricolage", "bricolage-grotesque-latin-variable.woff2", "200 800"],
    ["IBM Plex Mono", "ibm-plex-mono-latin-400.woff2", "400"],
  ].map(async ([family, file, weight]) => {
    const address = new URL("../fonts/" + file, import.meta.url);
    const face = new FontFace(family, `url("${address.href}")`, { weight });
    fonts.add(await face.load());
  }));
  return fontsReady;
}

export function storyCanvas() {
  return typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : document.createElement("canvas");
}

function sweepColor(first, last, progress) {
  const read = hex => Number.parseInt(hex.slice(1), 16);
  const a = read(first);
  const b = read(last);
  const values = [16, 8, 0].map(shift => Math.round(mix((a >> shift) & 255, (b >> shift) & 255, progress)));
  return "rgb(" + values.join(",") + ")";
}

function captionLines(ink, caption, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of caption.split(" ")) {
    const joined = line ? line + " " + word : word;
    if (line && ink.measureText(joined).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = joined;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] += "…";
  }
  return lines;
}

export function storyPose(story, time) {
  return time === undefined ? { angle: story.angle } : scoreAt(clamp(time, 0, movieLength));
}

export function createStoryRenderer(canvas, { readPixels = false } = {}) {
  canvas.width = width;
  canvas.height = height;
  const ink = canvas.getContext("2d", { alpha: false, willReadFrequently: readPixels });
  if (!ink) throw new Error("Canvas is unavailable in this browser.");
  const artwork = storyCanvas();
  let theme;
  let field;
  let pair;
  let glyphs;

  function paint(story, time) {
    const tones = themes[story.ink];
    const nextPair = story.first + "/" + story.second;
    const changed = pair !== nextPair;
    if (changed) {
      glyphs = projectGlyphs([story.first, story.second]);
      pair = nextPair;
    }
    if (theme !== tones || changed) {
      if (theme !== tones) {
        field = createLetterField(artwork, { colors: tones.glyphs, pixelRatio: 1 });
        if (!field) throw new Error("The story artwork could not be rendered.");
        field.measure({ ...plate, artWidth: plate.width * 0.86, artHeight: 292, fontSize: 16.8, maxPitch: 10 });
        theme = tones;
      }
      field.setGlyphs(glyphs);
    }

    const pose = storyPose(story, time);
    const progress = (pose.angle + limit) / (2 * limit);
    const accent = sweepColor(tones.first, tones.last, progress);

    ink.fillStyle = tones.ground;
    ink.fillRect(0, 0, width, height);
    ink.fillStyle = tones.line;
    ink.fillRect(margin, 344, plate.width, 2);
    ink.fillRect(margin, 1457, plate.width, 2);
    ink.fillStyle = tones.subtle;
    ink.font = '30px "IBM Plex Mono", monospace';
    ink.fillText("TYPEFIELD", margin, 305);
    ink.textAlign = "right";
    ink.fillText(time === undefined ? "STILL" : "MOTION SCORE", width - margin, 305);
    ink.textAlign = "left";

    ink.font = "780 169px Bricolage, Archivo, sans-serif";
    ink.fillStyle = tones.text;
    ink.fillText("Two", margin - 7, 520, plate.width);
    ink.fillStyle = accent;
    ink.fillText("readings.", margin - 7, 665, plate.width);
    ink.font = "450 39px Archivo, sans-serif";
    ink.fillStyle = tones.subtle;
    for (const [index, line] of captionLines(ink, story.caption, plate.width).entries()) {
      ink.fillText(line, margin, 743 + index * 47, plate.width);
    }

    ink.fillStyle = tones.panel;
    ink.fillRect(plate.x, plate.y, plate.width, plate.height);
    const slit = plate.x + mix(plate.width * 0.77, plate.width * 0.28, progress);
    ink.save();
    ink.beginPath();
    ink.rect(plate.x, plate.y, plate.width, plate.height);
    ink.clip();
    ink.globalAlpha = 0.22;
    ink.fillStyle = accent;
    ink.beginPath();
    ink.moveTo(slit + 96, plate.y);
    ink.lineTo(slit + 186, plate.y);
    ink.lineTo(slit - 48, plate.y + plate.height);
    ink.lineTo(slit - 164, plate.y + plate.height);
    ink.closePath();
    ink.fill();
    ink.restore();
    field.paint(pose.angle, { ...pose, solid: true });
    ink.drawImage(artwork, plate.x, plate.y);

    ink.fillStyle = tones.text;
    ink.font = '32px "IBM Plex Mono", monospace';
    ink.fillText(story.first + "  /  " + story.second, margin, 1537, plate.width * 0.76);
    const degrees = (pose.angle < 0 ? "−" : pose.angle > 0 ? "+" : "") + Math.abs(pose.angle).toFixed(1) + "°";
    ink.fillStyle = accent;
    ink.textAlign = "right";
    ink.fillText(degrees, width - margin, 1537);
    ink.textAlign = "left";
  }

  return { paint, ink };
}
