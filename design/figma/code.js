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
    const fold = makeFrame(1, "Fold between sections", colors.studio);
    const studio = makeFrame(2, "Studio", colors.studio);
    const recast = makeFrame(3, "Projection returned", colors.paper);
    const lab = makeFrame(4, "Lab entrance", colors.plum);
    const catalog = makeFrame(5, "Lab index", colors.paper);

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
    }

    function opening(parent, word, second) {
      const top = mobile ? 103 : 106;
      type(parent, "Title", "Two readings.", gutter, top, mobile ? 49 : 150, colors.ink);
      type(parent, "Viewing instructions", "One cloud of characters. Two readable angles. Drag the type or choose a motion study below.",
        mobile ? gutter : width - 300, mobile ? 174 : 143, mobile ? 16 : 19, colors.ink, "sans", mobile ? 275 : 235);
      const plateY = mobile ? 272 : 294;
      const plateHeight = mobile ? 294 : 437;
      box(parent, "Projection plate", gutter, plateY, width - 2 * gutter, plateHeight, colors.blue);
      type(parent, "Projection caption", "First projection", gutter + 16, plateY + 17, 12, colors.paper, "mono");
      const marks = type(parent, "Editable specimen", specimen(word), 0, 0,
        mobile ? (word.length > 4 ? 6.5 : 10) : (word.length > 4 ? 23 : 31), colors.paper, "mono");
      marks.lineHeight = { unit: "PERCENT", value: 80 };
      marks.x = (width - marks.width) / 2;
      marks.y = plateY + (plateHeight - marks.height) / 2;
      type(parent, "Projection word", word, gutter + 16, plateY + plateHeight - 34, 13, colors.paper, "mono");
      type(parent, "Angle control", word + " −45°   ───────────   " + second + " +45°", gutter, plateY + plateHeight + 18,
        mobile ? 10 : 13, colors.ink, "mono");
      type(parent, "Motion studies", "Momentum   Lens   Resonance   Exposure", gutter, plateY + plateHeight + 55,
        mobile ? 11 : 13, colors.ink, "mono");
      const next = type(parent, "Make your own projection", "Make your own projection ↓", gutter, plateY + plateHeight + 106,
        mobile ? 17 : 21, colors.ink, "sans");
      navigate(next, fold);
      header(parent, "Exhibit");
    }

    opening(exhibit, "READ", "MAKE");
    opening(recast, "ORIGIN", "FUTURE");

    const crease = frame(fold, "Two papers at the fold", 0, mobile ? 180 : 218, width, mobile ? 303 : 465, colors.studio);
    type(crease, "Incoming word", "MAKE", mobile ? 20 : 202, mobile ? 132 : 190, mobile ? 103 : 318, colors.lavender, "sans");
    const departure = box(crease, "Outgoing paper", -50, -111, width + 120, mobile ? 260 : 336, colors.blue);
    departure.rotation = 5;
    type(crease, "Outgoing word", "READ", mobile ? 30 : 240, mobile ? 7 : -40, mobile ? 105 : 302, colors.paper, "sans");
    navigate(type(fold, "Continue to Studio", "Continue to Studio ↓", gutter, mobile ? 537 : 737, 20, colors.lavender, "sans"), studio);
    header(fold, "Studio");

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
