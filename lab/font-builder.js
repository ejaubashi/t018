// Each row is a five-bit mask, with the leftmost cell in the most significant bit.
const alphabet = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [15, 16, 16, 16, 16, 16, 15], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [15, 16, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 16, 30, 1, 1, 30],
  6: [14, 16, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 1, 14],
  ".": [0, 0, 0, 0, 0, 0, 4], ",": [0, 0, 0, 0, 0, 4, 8],
  ":": [0, 0, 4, 0, 0, 4, 0], "-": [0, 0, 0, 14, 0, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4],
};
const blank = [0, 0, 0, 0, 0, 0, 0];
const missing = [31, 17, 17, 17, 17, 17, 31];
const characters = [" ", ...Object.keys(alphabet)].sort();
const units = 1000;
const ascent = 820;
const descent = -180;
const step = 100;

class Binary {
  bytes = [];

  byte(...values) {
    for (const value of values) this.bytes.push(value & 255);
  }

  short(...values) {
    for (const value of values) this.byte(value >>> 8, value);
  }

  long(...values) {
    for (const value of values) this.byte(value >>> 24, value >>> 16, value >>> 8, value);
  }

  tag(value) {
    this.byte(...Array.from(value, char => char.charCodeAt(0)));
  }

  append(data) {
    for (const value of data) this.bytes.push(value);
  }

  align() {
    while (this.bytes.length % 4) this.byte(0);
  }

  toArray() {
    return Uint8Array.from(this.bytes);
  }
}

function cell(x, y, ink, roundness, lean) {
  const radius = Math.min(ink / 2, ink * roundness / 2);
  const right = x + ink;
  const top = y + ink;
  const points = radius
    ? [
        [x + radius, y, true], [x, y, false], [x, y + radius, true],
        [x, top - radius, true], [x, top, false], [x + radius, top, true],
        [right - radius, top, true], [right, top, false], [right, top - radius, true],
        [right, y + radius, true], [right, y, false], [right - radius, y, true],
      ]
    : [[x, y, true], [x, top, true], [right, top, true], [right, y, true]];
  return points.map(([px, py, on]) => ({ x: Math.round(px + lean * (py - 350)), y: Math.round(py), on }));
}

function glyph(rows, { ink, roundness, lean }) {
  const pixels = [];
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      if (rows[row] & (16 >> column)) pixels.push({ row, column });
    }
  }

  const data = new Binary();
  if (!pixels.length) {
    return { bytes: data.toArray(), advance: 292, bounds: [0, 0, 0, 0], points: 0, contours: 0 };
  }

  const first = Math.min(...pixels.map(point => point.column));
  const last = Math.max(...pixels.map(point => point.column));
  const inset = (step - ink) / 2;
  const contours = pixels.map(({ row, column }) => cell(
    58 + (column - first) * step + inset,
    (6 - row) * step + inset,
    ink, roundness, lean,
  ));
  const points = contours.flat();
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const advance = (last - first + 1) * step + 116;

  data.short(contours.length, ...bounds);
  let end = -1;
  for (const contour of contours) {
    end += contour.length;
    data.short(end);
  }
  data.short(0); // Instructions
  for (const [index, point] of points.entries()) data.byte(Number(point.on) | (index === 0 ? 0x40 : 0));
  for (const axis of ["x", "y"]) {
    let previous = 0;
    for (const point of points) {
      data.short(point[axis] - previous);
      previous = point[axis];
    }
  }

  return { bytes: data.toArray(), advance, bounds, points: points.length, contours: contours.length };
}

function characterMap() {
  const codes = characters.map(char => char.charCodeAt(0));
  const count = codes.length + 1;
  const power = 2 ** Math.floor(Math.log2(count));
  const table = new Binary();
  table.short(0, 1, 3, 1); // Windows BMP Unicode
  table.long(12);
  table.short(4, 16 + count * 8, 0, count * 2, power * 2, Math.log2(power), (count - power) * 2);
  table.short(...codes, 0xffff, 0); // End codes and reserved word
  table.short(...codes, 0xffff); // Start codes
  table.short(...codes.map((code, index) => index + 1 - code), 1);
  table.short(...Array(count).fill(0));
  return table;
}

function naming({ ink, roundness, lean }) {
  const variant = [ink, Math.round(roundness * 100), Math.round(lean * 100)].join("-");
  const family = "Typefield Cast " + variant;
  const postscript = "TypefieldCast-" + variant;
  const records = [
    [1, family],
    [2, "Regular"],
    [3, postscript],
    [4, family + " Regular"],
    [5, "Version 1.0"],
    [6, postscript],
  ];
  const table = new Binary();
  const text = new Binary();
  table.short(0, records.length, 6 + 12 * records.length);
  for (const [id, name] of records) {
    table.short(3, 1, 0x0409, id, name.length * 2, text.bytes.length);
    text.short(...Array.from(name, char => char.charCodeAt(0)));
  }
  table.append(text.bytes);
  return table;
}

function checksum(bytes) {
  let total = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    const word = (bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3];
    total = (total + word) >>> 0;
  }
  return total;
}

function pack(tables) {
  const tags = Object.keys(tables).sort();
  const count = tags.length;
  const power = 2 ** Math.floor(Math.log2(count));
  const header = new Binary();
  const payload = new Binary();
  let headOffset;
  header.long(0x00010000);
  header.short(count, power * 16, Math.log2(power), (count - power) * 16);

  for (const tag of tags) {
    const data = tables[tag].toArray();
    const offset = 12 + 16 * count + payload.bytes.length;
    if (tag === "head") headOffset = offset;
    header.tag(tag);
    header.long(checksum(data), offset, data.length);
    payload.append(data);
    payload.align();
  }

  header.append(payload.bytes);
  const bytes = header.toArray();
  new DataView(bytes.buffer).setUint32(headOffset + 8, (0xb1b0afba - checksum(bytes)) >>> 0);
  return bytes;
}

export function buildFont(parameters) {
  const glyphs = [missing, ...characters.map(char => alphabet[char] ?? blank)].map(rows => glyph(rows, parameters));
  const tables = Object.fromEntries(["head", "hhea", "hmtx", "maxp", "loca", "glyf", "OS/2", "post"]
    .map(tag => [tag, new Binary()]));
  const { head, hhea, hmtx, maxp, loca, glyf, post } = tables;
  const os2 = tables["OS/2"];
  const xMin = Math.min(...glyphs.map(item => item.bounds[0]));
  const yMin = Math.min(...glyphs.map(item => item.bounds[1]));
  const xMax = Math.max(...glyphs.map(item => item.bounds[2]));
  const yMax = Math.max(...glyphs.map(item => item.bounds[3]));
  const maxAdvance = Math.max(...glyphs.map(item => item.advance));
  const minRight = Math.min(...glyphs.map(item => item.advance - item.bounds[2]));

  for (const item of glyphs) {
    loca.long(glyf.bytes.length);
    glyf.append(item.bytes);
    glyf.align();
    hmtx.short(item.advance, item.bounds[0]);
  }
  loca.long(glyf.bytes.length);

  head.long(0x00010000, 0x00010000, 0, 0x5f0f3cf5);
  head.short(1, units);
  head.long(0, 3780000000, 0, 3780000000); // Stable creation and modification dates
  head.short(xMin, yMin, xMax, yMax, 0, 8, 2, 1, 0);

  hhea.long(0x00010000);
  hhea.short(ascent, descent, 0, maxAdvance, xMin, minRight, xMax, 1, 0, 0, 0, 0, 0, 0, 0, glyphs.length);

  maxp.long(0x00010000);
  maxp.short(glyphs.length, Math.max(...glyphs.map(item => item.points)),
    Math.max(...glyphs.map(item => item.contours)), 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

  const average = Math.round(glyphs.slice(1).reduce((total, item) => total + item.advance, 0) / characters.length);
  os2.short(0, average, 400, 5, 0);
  os2.short(650, 600, 0, 90, 650, 600, 0, 340, 50, 250, 0);
  os2.byte(0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // PANOSE
  os2.long(1, 0, 0, 0);
  os2.tag("TYPE");
  os2.short(0x40, characters[0].charCodeAt(0), characters.at(-1).charCodeAt(0), ascent, descent, 0, ascent, -descent);

  post.long(0x00030000, 0);
  post.short(-90, 48);
  post.long(0, 0, 0, 0, 0);

  tables.cmap = characterMap();
  tables.name = naming(parameters);
  return pack(tables);
}
