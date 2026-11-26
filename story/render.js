import { createLetterField, projectGlyphs } from "../exhibit/letter-field.js?v=3";
import { clamp, exposures, lensPass, limit, mix, scoreAt, scoreDuration } from "../exhibit/kinetics.js";
import { sceneAt, storySize, timelineOf, transitionDuration } from "./spec.js?v=2";

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
    : Object.assign(document.createElement("canvas"), { width, height });
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

function smooth(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function scenePose(scene, time) {
  if (time === undefined) return { angle: scene.angle };
  const progress = clamp(time / scene.durationMs);
  if (scene.motion === "hold") return { angle: scene.angle };
  if (scene.motion === "prism") {
    return { angle: mix(-limit, limit, smooth(progress)), lens: lensPass(progress) };
  }
  if (scene.motion === "echo") {
    const turn = at => mix(limit, -limit, smooth(at / scene.durationMs));
    const angle = turn(time);
    return { angle, ghosts: exposures(angle, lag => turn(time - lag * 1.8)) };
  }
  return scoreAt(progress * scoreDuration);
}

function scenePainter(canvas) {
  const ink = canvas.getContext("2d", { alpha: false });
  if (!ink) throw new Error("Canvas is unavailable in this browser.");
  const artwork = storyCanvas();
  let theme;
  let field;
  let pair;
  let glyphs;

  function paint(scene, index, time) {
    const tones = themes[scene.ink];
    const nextPair = scene.first + "/" + scene.second;
    const changed = pair !== nextPair;
    if (changed) {
      glyphs = projectGlyphs([scene.first, scene.second]);
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

    const pose = scenePose(scene, time);
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
    ink.fillText("SCENE " + String(index + 1).padStart(2, "0"), width - margin, 305);
    ink.textAlign = "left";

    ink.font = "800 172px Bricolage, Archivo, sans-serif";
    ink.fillStyle = tones.text;
    ink.strokeStyle = accent;
    ink.lineWidth = 2.2;
    ink.globalAlpha = 0.42;
    ink.strokeText(scene.first, margin + 20 * progress, 525 - 12 * progress, plate.width - 25);
    ink.globalAlpha = 1;
    ink.fillText(scene.first, margin - 7, 520, plate.width - 25);
    ink.fillStyle = accent;
    ink.textAlign = "right";
    ink.fillText(scene.second, width - margin + 5, 668, plate.width);
    ink.textAlign = "left";
    ink.font = "450 39px Archivo, sans-serif";
    ink.fillStyle = tones.subtle;
    for (const [lineIndex, line] of captionLines(ink, scene.caption, plate.width).entries()) {
      ink.fillText(line, margin, 743 + lineIndex * 47, plate.width);
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
    ink.fillText(scene.first + "  /  " + scene.second, margin, 1537, plate.width * 0.76);
    const degrees = (pose.angle < 0 ? "−" : pose.angle > 0 ? "+" : "") + Math.abs(pose.angle).toFixed(1) + "°";
    ink.fillStyle = accent;
    ink.textAlign = "right";
    ink.fillText(degrees, width - margin, 1537);
    ink.textAlign = "left";
  }

  return paint;
}

function registerCut(ink, incoming, progress) {
  const strips = 12;
  ink.save();
  ink.beginPath();
  for (let strip = 0; strip < strips; strip += 1) {
    const reach = width * smooth(progress * 1.38 - strip / (strips - 1) * 0.38);
    ink.rect(strip % 2 ? width - reach : 0, strip * height / strips, reach, height / strips);
  }
  ink.clip();
  ink.drawImage(incoming, 0, 0);
  ink.restore();
}

function apertureCut(mask, incoming, scene, progress) {
  const ink = mask.getContext("2d");
  ink.clearRect(0, 0, width, height);
  ink.font = "800 " + Math.round(292 + 392 * progress) + "px Bricolage, Archivo, sans-serif";
  ink.textAlign = "center";
  ink.globalAlpha = smooth(progress * 4);
  const travel = mix(-width * 0.37, width * 0.18, progress);
  const rows = Array.from({ length: 4 }, (_, row) => [
    width / 2 + (row % 2 ? -travel : travel), (row + 0.65) * height / 3.56,
  ]);
  for (const [x, y] of rows) ink.fillText(scene.first, x, y, width * 1.3);

  // Widen the opening until the next scene completely fills the frame.
  const reach = smooth((progress - 0.38) / 0.62);
  ink.globalAlpha = 1;
  ink.fillRect(0, height / 2 - reach * height / 2, width, reach * height);
  ink.globalCompositeOperation = "source-in";
  ink.drawImage(incoming, 0, 0);
  ink.globalCompositeOperation = "source-over";
  ink.strokeStyle = themes[scene.ink].first;
  ink.lineWidth = 2.7;
  ink.globalAlpha = 0.38 * Math.sin(progress * Math.PI);
  for (const [x, y] of rows) ink.strokeText(scene.first, x, y, width * 1.3);
  ink.globalAlpha = 1;
}

export function createScoreRenderer(canvas, { readPixels = false } = {}) {
  const ink = canvas.getContext("2d", { alpha: false, willReadFrequently: readPixels });
  if (!ink) throw new Error("Canvas is unavailable in this browser.");
  const picture = storyCanvas();
  const paintScene = scenePainter(picture);
  let outgoing;
  let paintOutgoing;
  let mask;
  let frozenIndex = -1;
  let currentScore;
  let timing;

  function paint(score, time, stillIndex = 0) {
    if (score !== currentScore) {
      timing = timelineOf(score);
      currentScore = score;
      frozenIndex = -1;
    }
    const index = time === undefined ? stillIndex : sceneAt(timing.starts, clamp(time, 0, timing.duration));
    const scene = score.scenes[index];
    const within = time === undefined ? undefined : time - timing.starts[index];
    paintScene(scene, index, within);
    if (!index || within === undefined || within >= transitionDuration || scene.transition === "cut") {
      ink.drawImage(picture, 0, 0);
      return;
    }
    if (!outgoing) {
      outgoing = storyCanvas();
      paintOutgoing = scenePainter(outgoing);
    }
    if (frozenIndex !== index) {
      const prior = score.scenes[index - 1];
      paintOutgoing(prior, index - 1, prior.durationMs);
      frozenIndex = index;
    }
    ink.drawImage(outgoing, 0, 0);
    const progress = within / transitionDuration;
    if (scene.transition === "register") registerCut(ink, picture, progress);
    else {
      mask ??= storyCanvas();
      apertureCut(mask, picture, scene, progress);
      ink.drawImage(mask, 0, 0);
    }
  }

  return { paint, ink };
}
