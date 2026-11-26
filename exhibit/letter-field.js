import { clamp, limit, waveDuration } from "./kinetics.js";
import { projectWords } from "./optics.js?v=3";

const cell = 64;
const atlasFontSize = 44;
const columns = 13;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const inks = ["#ffe1a7", "#ffae92", "#c4abff"];

function glyphAtlas(colors) {
  const width = cell * columns;
  const height = cell * 2 * colors.length;
  const atlas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const ink = atlas.getContext("2d");
  if (!ink) return null;
  ink.font = `400 ${atlasFontSize}px "IBM Plex Mono", monospace`;
  ink.textAlign = "center";
  const metrics = ink.measureText("H");
  const baseline = (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
  colors.forEach((color, tone) => {
    ink.fillStyle = color;
    for (let index = 0; index < alphabet.length; index += 1) {
      const x = (index % columns + 0.5) * cell;
      const y = (tone * 2 + Math.floor(index / columns) + 0.5) * cell;
      ink.fillText(alphabet[index], x, y + (Number.isFinite(baseline) ? baseline : 12));
    }
  });
  return atlas;
}

export function createLetterField(canvas, { colors = inks, pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1) } = {}) {
  const ink = canvas.getContext("2d");
  const atlas = ink && glyphAtlas(colors);
  if (!atlas) return null;

  let dimensions;
  let glyphs = [];

  function measure(next) {
    dimensions = next;
    const width = Math.round(next.width * pixelRatio);
    const height = Math.round(next.height * pixelRatio);
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    ink.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function setGlyphs(points) {
    glyphs = points;
  }

  function stamp(glyph, x, y, size, alpha, tone = 0) {
    ink.globalAlpha = clamp(alpha);
    ink.drawImage(atlas, glyph.column, glyph.row + tone * 2 * cell, cell, cell,
      x - size / 2, y - size / 2, size, size);
  }

  function draw(angle, { alpha, tint, lens, waves }) {
    const { width, height, artWidth, artHeight, fontSize, maxPitch } = dimensions;
    const depth = 1 - Math.abs(angle) / limit;
    const scale = 1 - 0.25 * depth;
    const yaw = angle * Math.PI / 180;
    const pitch = maxPitch * depth * Math.PI / 180;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const size = fontSize * cell / atlasFontSize;
    const radius = Math.min(width * 0.26, height * 0.44);
    const focusX = lens?.x * width;
    const focusY = lens?.y * height;
    const band = Math.max(17, Math.min(width, height) * 0.12);
    const crestHeight = Math.min(38, band * 0.9);
    const crests = waves?.map(wave => ({
      x: wave.x * width,
      y: wave.y * height,
      radius: wave.age * Math.max(width, height) * 0.00083,
      gain: Math.sqrt(1 - wave.age / waveDuration),
    })) ?? [];

    for (const glyph of glyphs) {
      const x = glyph.x * artWidth;
      const z = glyph.z * artWidth;
      const distance = z * cosYaw - x * sinYaw;
      let px = width / 2 + scale * (x * cosYaw + z * sinYaw);
      let py = height / 2 + scale * (glyph.y * artHeight * cosPitch - distance * sinPitch);
      let magnification = 1;

      if (lens) {
        const dx = px - focusX;
        const dy = py - focusY;
        const reach = clamp(1 - (dx * dx + dy * dy) / (radius * radius));
        const power = reach * reach * lens.power;
        px += power * (dx * 0.86 + distance * radius / artWidth * 0.76);
        py += power * dy * 0.9;
        magnification += power * 1.35;
        if (power > 0.12) {
          const split = (3 + radius * 0.05) * power;
          stamp(glyph, px - split, py, size * magnification, 0.6 * power, 1);
          stamp(glyph, px + split, py, size * magnification, 0.72 * power, 2);
        }
      }

      const restingX = px;
      const restingY = py;
      let displacement = 0;
      for (const crest of crests) {
        const dx = restingX - crest.x;
        const dy = restingY - crest.y;
        const range = Math.hypot(dx, dy);
        const offset = (range - crest.radius) / band;
        if (Math.abs(offset) > 2.5) continue;
        const amplitude = Math.cos(offset * 2.95) * Math.exp(-offset * offset) * crest.gain;
        px += amplitude * crestHeight * 0.9 * dx / Math.max(8, range);
        py += amplitude * crestHeight * (0.5 * dy / Math.max(8, range) - 0.56);
        displacement += amplitude;
      }

      magnification += Math.min(0.6, Math.abs(displacement) * 0.42);
      stamp(glyph, px, py, size * magnification, glyph.density * (1 + displacement * 0.16) * alpha, tint);
    }
  }

  return {
    measure,
    setGlyphs,
    paint(angle, { lens, waves, ghosts, solid }) {
      ink.clearRect(0, 0, dimensions.width, dimensions.height);
      for (const ghost of ghosts ?? []) draw(ghost.angle, { alpha: ghost.alpha, tint: ghost.tint });
      if (solid) draw(angle, { alpha: 1, tint: 0, lens, waves });
    },
  };
}

function glyphPoint(point, letter, index) {
  const code = alphabet.indexOf(letter);
  return {
    ...point,
    letter,
    column: (code % columns) * cell,
    row: Math.floor(code / columns) * cell,
    density: 0.62 + 0.38 * ((index * 19) % 31) / 30,
  };
}

export function projectGlyphs(words) {
  const marks = words.join("");
  return projectWords(...words).map((point, index) => glyphPoint(
    point, marks[(index * 5 + Math.floor(index / 11)) % marks.length], index,
  ));
}
