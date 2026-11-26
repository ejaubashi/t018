const width = 480;
const height = 144;
const padding = 5;
export const rows = 22;
const diagonal = Math.SQRT1_2;

function outline(word) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Text outlines unavailable");

  context.font = "900 128px Archivo, Arial, sans-serif";
  const metrics = context.measureText(word);
  const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
  const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const scaleX = (width - 2 * padding) / inkWidth;
  const scaleY = (height - 2 * padding) / inkHeight;
  context.setTransform(scaleX, 0, 0, scaleY,
    padding + metrics.actualBoundingBoxLeft * scaleX,
    padding + metrics.actualBoundingBoxAscent * scaleY);
  context.fillText(word, 0, 0);
  return context.getImageData(0, 0, width, height).data;
}

function scan(image, row) {
  const y = Math.floor(padding + (row + 0.5) * (height - 2 * padding) / rows);
  const pixels = [];
  for (let x = padding; x < width - padding; x += 1) {
    if (image[(y * width + x) * 4 + 3] >= 128) pixels.push(x);
  }
  return pixels;
}

function spread(ink, count) {
  return Array.from({ length: count }, (_, index) => {
    const at = Math.floor((index + 0.5) * ink.length / count);
    return ink[at] / width - 0.5;
  });
}

function shuffled(indices, seed) {
  for (let index = indices.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = seed % (index + 1);
    [indices[index], indices[other]] = [indices[other], indices[index]];
  }
  return indices;
}

export function projectWords(first, second) {
  const front = outline(first);
  const reverse = outline(second);
  const seed = [...first + second].reduce((value, letter) => (Math.imul(value, 31) + letter.charCodeAt(0)) >>> 0, 17);
  const points = [];

  for (let row = 0; row < rows; row += 1) {
    const one = scan(front, row);
    const two = scan(reverse, row);
    if (!one.length || !two.length) continue;
    const count = Math.max(1, Math.min(one.length, two.length, Math.round((one.length + two.length) / 12)));
    const a = spread(one, count);
    const b = shuffled(spread(two, count), seed + row * 337);
    const y = (row + 0.5) / rows - 0.5;

    for (let index = 0; index < count; index += 1) {
      // Orthogonal projections at -45° and +45° recover a and b from this position.
      points.push({ x: (a[index] + b[index]) * diagonal, y, z: (b[index] - a[index]) * diagonal });
    }
  }

  return points;
}
