const colors = {
  paper: "#f2eee4", ink: "#23221c", rule: "#9d9a8b", blue: "#2432d2",
  studio: "#1a1925", lavender: "#c0c2ff", white: "#f2eee9",
  plum: "#75255a", blush: "#fff0e6", rose: "#ffc4d9", green: "#62722d",
};

function paint(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [{ type: "SOLID", color: {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  } }];
}

function place(node, parent, name, x, y) {
  parent.appendChild(node);
  node.name = name;
  node.x = x;
  node.y = y;
  return node;
}

function box(parent, name, x, y, width, height, color) {
  const node = place(figma.createRectangle(), parent, name, x, y);
  node.resize(width, height);
  node.fills = paint(color);
  return node;
}

function frame(parent, name, x, y, width, height, color) {
  const node = place(figma.createFrame(), parent, name, x, y);
  node.resize(width, height);
  node.fills = paint(color);
  node.clipsContent = true;
  return node;
}

const letterMasks = {
  A: [14, 17, 17, 31, 17, 17, 17], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], G: [14, 17, 16, 23, 17, 17, 15],
  I: [31, 4, 4, 4, 4, 4, 31], N: [17, 25, 25, 21, 19, 19, 17],
  O: [14, 17, 17, 17, 17, 17, 14], R: [30, 17, 17, 30, 20, 18, 17],
};

function specimen(word) {
  const rows = [];
  for (let line = 0; line < 14; line += 1) {
    const row = [...word].map((letter, index) => {
      const mask = letterMasks[letter][Math.floor(line / 2)];
      return Array.from({ length: 10 }, (_, column) => {
        const ink = mask & (16 >> Math.floor(column / 2));
        return ink ? word[(column + line * 3 + index) % word.length] : " ";
      }).join("");
    });
    rows.push(row.join("   "));
  }
  return rows.join("\n");
}

async function build() {
  const available = (await figma.listAvailableFontsAsync()).map(font => font.fontName);
  function findFont(families, styles) {
    for (const family of families) {
      const faces = available.filter(face => face.family === family);
      if (faces.length) return styles.map(style => faces.find(face => face.style === style)).find(Boolean) ?? faces[0];
    }
    return available[0];
  }
  const fonts = {
    serif: findFont(["Fraunces", "Georgia", "Inter"], ["SemiBold", "Bold", "Regular"]),
    sans: findFont(["Archivo", "Inter"], ["ExtraBold", "Bold", "Regular"]),
    mono: findFont(["IBM Plex Mono", "Roboto Mono", "Courier New", "Inter"], ["Regular"]),
  };
  await Promise.all(Object.values(fonts).map(font => figma.loadFontAsync(font)));

  const sheet = figma.createPage();
  sheet.name = "Typefield / Section motion";
  await figma.setCurrentPageAsync(sheet);
  const reactions = [];

  function type(parent, name, content, x, y, size, color, face = "serif", width) {
    const node = place(figma.createText(), parent, name, x, y);
    node.fontName = fonts[face];
    node.fontSize = size;
    node.characters = content;
    node.fills = paint(color);
    node.textAutoResize = "WIDTH_AND_HEIGHT";
    if (width) {
      node.textAutoResize = "HEIGHT";
      node.resize(width, node.height);
    }
    return node;
  }

  function navigate(control, to, duration = 0.68) {
    reactions.push(control.setReactionsAsync([{
      trigger: { type: "ON_CLICK" },
      actions: [{ type: "NODE", destinationId: to.id, navigation: "NAVIGATE", transition: {
        type: "SMART_ANIMATE", duration, easing: { type: "EASE_IN_AND_OUT" },
      } }],
    }]));
  }

  function compose(width, top, label) {
    const mobile = width < 500;
    const height = mobile ? 844 : 950;
    const gutter = mobile ? 20 : 70;
    const makeFrame = (index, name, color) => frame(sheet, label + " / " + name,
      index * (width + 94), top, width, height, color);
    const exhibit = makeFrame(0, "Exhibit", colors.paper);
    const faces = ["Exhibit face", "Half turn", "Studio face"].map((name, index) => makeFrame(index + 1, name, colors.studio));
    const studio = makeFrame(4, "Studio", colors.studio);
    const recast = makeFrame(5, "Projection returned", colors.paper);
    const lab = makeFrame(6, "Lab entrance", colors.plum);
    const catalog = makeFrame(7, "Lab index", colors.paper);

    function header(parent, selected) {
      const bar = frame(parent, "Section navigation", 0, 0, width, mobile ? 86 : 64, colors.paper);
      type(bar, "Typefield", "typefield.", gutter, 17, 24, colors.ink, "sans");
      const x = mobile ? gutter : width / 2 - 101;
      ["Exhibit", "Studio", "Lab"].forEach((title, index) => {
        const tab = type(bar, title, title, x + index * 82, mobile ? 55 : 24, 13,
          title === selected ? colors.blue : colors.ink, "mono");
        navigate(tab, [exhibit, studio, lab][index], 0.48);
      });
      const progress = { Exhibit: 0.07, Studio: 0.59, Lab: 0.94 }[selected];
      box(bar, "Scroll progress", 0, bar.height - 2, width * progress, 2,
        selected === "Lab" ? colors.plum : colors.blue);
      const active = ["Exhibit", "Studio", "Lab"].indexOf(selected);
      box(bar, "Current chapter", x + active * 82, mobile ? 74 : 44, [53, 45, 24][active], 1, colors.blue);
    }

    function opening(parent, word, second) {
      const top = mobile ? 109 : 148;
      const plateX = mobile ? gutter : Math.round(width * 0.39);
      const plateY = mobile ? 284 : top;
      const plateHeight = mobile ? 282 : 511;
      const plateWidth = width - plateX - gutter;
      const title = type(parent, "Title", mobile ? "Two readings." : "Two\nreadings.", gutter, top + 14, mobile ? 46 : 106, colors.ink);
      title.lineHeight = { unit: "PERCENT", value: 80 };
      title.letterSpacing = { unit: "PERCENT", value: -6 };
      type(parent, "Viewing instructions", "One cloud of characters. Two readable angles. Drag the type to turn it.",
        gutter, mobile ? 176 : 377, mobile ? 16 : 20, colors.ink, "sans", mobile ? 266 : 249);
      const turn = type(parent, "Turn the page", "Turn the page ↓", gutter, mobile ? 247 : 617, 14, colors.ink, "mono");
      navigate(turn, faces[0]);
      box(parent, "Projection plate", plateX, plateY, plateWidth, plateHeight, colors.blue);
      type(parent, "Projection caption", "First projection", plateX + 16, plateY + 17, 12, colors.paper, "mono");
      const marks = type(parent, "Editable specimen", specimen(word), 0, 0,
        mobile ? (word.length > 4 ? 6.5 : 10) : (word.length > 4 ? 16 : 22), colors.paper, "mono");
      marks.lineHeight = { unit: "PERCENT", value: 80 };
      marks.x = plateX + (plateWidth - marks.width) / 2;
      marks.y = plateY + (plateHeight - marks.height) / 2;
      type(parent, "Projection word", word, plateX + 16, plateY + plateHeight - 34, 13, colors.paper, "mono");
      type(parent, "Angle control", word + " −45°   ───────────   " + second + " +45°", gutter, plateY + plateHeight + 18,
        mobile ? 10 : 13, colors.ink, "mono");
      type(parent, "Motion studies", "Momentum   Lens   Resonance   Exposure", gutter, plateY + plateHeight + 55,
        mobile ? 11 : 13, colors.ink, "mono");
      const next = type(parent, "Make your own projection", "Make your own projection ↓", gutter, plateY + plateHeight + 106,
        mobile ? 17 : 21, colors.ink, "sans");
      navigate(next, studio);
      header(parent, "Exhibit");
    }

    opening(exhibit, "READ", "MAKE");
    opening(recast, "ORIGIN", "FUTURE");

    faces.forEach((face, index) => {
      const progress = [0, 0.53, 1][index];
      const travelProgress = Math.max(0, Math.min(1, (progress - 0.02) / 0.96));
      const artY = mobile ? 128 : 152;
      const artHeight = mobile ? 220 : 497;
      const crease = frame(face, "Fold", 0, artY, width, artHeight, "#15141e");
      const stripWidth = width / 9;
      for (let strip = 0; strip < 9; strip += 1) {
        const turn = Math.max(0, Math.min(1, (travelProgress - strip / 16) * 2));
        const back = turn >= 0.5;
        const projected = stripWidth * Math.max(0.024, Math.abs(Math.cos(turn * Math.PI)));
        const panel = frame(crease, "Panel " + (strip + 1), strip * stripWidth + (stripWidth - projected) / 2,
          0, projected, artHeight, back ? "#222035" : colors.blue);
        const ink = type(panel, "Word", back ? "MAKE" : "READ", 0, 0, mobile ? 80 : 300,
          back ? colors.lavender : colors.paper, "sans");
        ink.letterSpacing = { unit: "PERCENT", value: -8 };
        ink.x = (width - ink.width) / 2 - strip * stripWidth - (stripWidth - projected) / 2;
        ink.y = (artHeight - ink.height) / 2;
      }
      const y = artY + artHeight + 22;
      const travel = width - 2 * gutter - 208;
      const scrubber = frame(face, "Page fold control", gutter + 103, y - 6, travel, 42, colors.studio);
      type(scrubber, "Page fold", "Page fold", 0, 0, 11, colors.white, "mono");
      const percentage = type(scrubber, "Fold position", Math.round(progress * 100) + "%", 0, 0, 11, colors.white, "mono");
      percentage.x = travel - percentage.width;
      box(scrubber, "Track", 0, 29, travel, 1, colors.lavender);
      box(scrubber, "Playhead", progress * (travel - 7), 25, 7, 9, colors.lavender);
      navigate(scrubber, faces[(index + 1) % faces.length]);
      navigate(type(face, "Exhibit plate", "Exhibit ↑", gutter, y, 13, colors.lavender, "mono"), exhibit);
      navigate(type(face, "Studio workbench", "Studio ↓", width - gutter - 65, y, 13, colors.lavender, "mono"), studio);
      header(face, progress >= 0.5 ? "Studio" : "Exhibit");
    });

    const studioY = mobile ? 144 : 196;
    type(studio, "Studio title", mobile ? "Make the\nnext reading." : "Make the next\nreading.", gutter,
      studioY, mobile ? 53 : 115, colors.white);
    type(studio, "Studio description", "Put two words into one sculpture. The first becomes readable from the left, the second from the right.", gutter,
      mobile ? 325 : 495, mobile ? 17 : 21, colors.white, "sans", mobile ? 330 : 410);
    const formX = mobile ? gutter : 825;
    const formY = mobile ? 450 : 400;
    const formGap = mobile ? 180 : 245;
    type(studio, "First word label", "First word", formX, formY, 13, colors.white, "mono");
    type(studio, "Second word label", "Second word", formX + formGap, formY, 13, colors.white, "mono");
    type(studio, "Projection word", "ORIGIN", formX, formY + 29, mobile ? 35 : 58, colors.white, "sans");
    type(studio, "Second word", "FUTURE", formX + formGap, formY + 29, mobile ? 35 : 58, colors.white, "sans");
    box(studio, "First word rule", formX, formY + 102, formGap - 24, 1, colors.lavender);
    box(studio, "Second word rule", formX + formGap, formY + 102, formGap - 24, 1, colors.lavender);
    const submit = frame(studio, "Build the object", formX, formY + 127, 175, 45, colors.lavender);
    type(submit, "Action", "Build the object ↑", 16, 14, 13, colors.studio, "mono");
    navigate(submit, recast);
    header(studio, "Studio");

    type(lab, "Experiment count", "13 experiments with live text", gutter, mobile ? 162 : 170, 13, colors.blush, "mono");
    const word = type(lab, "Lab title", "Lab.", gutter, mobile ? 230 : 197, mobile ? 146 : 368, colors.blush);
    navigate(word, catalog);
    navigate(type(lab, "Enter Lab", "↗", width - gutter - (mobile ? 45 : 95), mobile ? 294 : 346,
      mobile ? 44 : 94, colors.rose, "mono"), catalog);
    type(lab, "Experiment categories", "Read ↗     Compose ↗     Shape ↗", gutter, mobile ? 472 : 648,
      mobile ? 18 : 29, colors.blush, "sans");
    header(lab, "Lab");

    const toLab = type(catalog, "Return to Typefield", "← Typefield", gutter, 25, 15, colors.ink, "mono");
    navigate(toLab, lab);
    type(catalog, "Catalog title", "Typefield", gutter, mobile ? 115 : 125, mobile ? 65 : 138, colors.ink);
    type(catalog, "Lab title", "Lab.", gutter, mobile ? 182 : 248, mobile ? 65 : 138, colors.ink);
    type(catalog, "Catalog description", "Experiments in reading, composing, and shaping text in the browser.", gutter,
      mobile ? 286 : 414, mobile ? 17 : 23, colors.ink, "sans", mobile ? 330 : 495);
    type(catalog, "Directory", "Experiments", gutter, mobile ? 409 : 563, mobile ? 45 : 78, colors.ink);
    type(catalog, "Experiment list", "Score\nMeasure\nRelay\nFacet", gutter, mobile ? 507 : 686, mobile ? 24 : 32, colors.ink, "sans");
    return exhibit;
  }

  const desktop = compose(1440, 0, "Desktop");
  const mobile = compose(390, 1080, "Mobile");
  await Promise.all(reactions);
  sheet.flowStartingPoints = [
    { nodeId: desktop.id, name: "Desktop section flow" },
    { nodeId: mobile.id, name: "Mobile section flow" },
  ];
  sheet.selection = [desktop];
  figma.viewport.scrollAndZoomIntoView([desktop]);
  figma.closePlugin("Created editable desktop and mobile section flows.");
}

build().catch(error => figma.closePlugin(error instanceof Error ? error.message : String(error)));
