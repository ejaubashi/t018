import { inks, normalizeScene, storyText, storyWord, wordPattern } from "./spec.js?v=2";

export const maxBriefLength = 240;
const fillers = new Set("a an and are at as be by for from in is it into of on or our the to we with you your i am this that make want can shot using story about create new social reel video".split(" "));
const themes = [
  {
    match: /\b(night|dawn|neon|city|light|sunset|train|street|urban|midnight)\b/iu,
    pairs: [["NIGHT", "DAWN"], ["DRIFT", "GLOW"], ["SIGNAL", "TRACE"]],
    captions: ["Light travels further than the eye.", "Take the last light with you."],
  },
  {
    match: /\b(sea|ocean|rain|wave|river|water|tide|swim|coast|shore|surf)\b/iu,
    pairs: [["TIDE", "EBB"], ["BREAK", "FOAM"], ["FLOW", "SHORE"]],
    captions: ["The same water takes another shape.", "A line where the water was."],
  },
  {
    match: /\b(garden|nature|spring|forest|bloom|grow|plant|earth|wild|roots|flower)\b/iu,
    pairs: [["SEED", "BLOOM"], ["ROOT", "REACH"], ["FIELD", "STILL"]],
    captions: ["The smallest motion changes the field.", "Leave space for what grows next."],
  },
  {
    match: /\b(sound|music|beat|album|song|voice|rhythm|dance|set|band|club|listen)\b/iu,
    pairs: [["PULSE", "BEAT"], ["TEMPO", "ECHO"], ["TONE", "REST"]],
    captions: ["The second beat bends the first.", "The silence carries it home."],
  },
  {
    match: /\b(fashion|fabric|thread|textile|cloth|dress|runway|silk|lace|wear)\b/iu,
    pairs: [["SILK", "FOLD"], ["THREAD", "FORM"], ["SEAM", "DRAPE"]],
    captions: ["Watch the surface take a new form.", "The seam is a line to follow."],
  },
  {
    match: /\b(launch|release|product|brand|invite|event|opening|launches|reveal|drop)\b/iu,
    pairs: [["START", "OPEN"], ["FORM", "SHIFT"], ["HERE", "NEXT"]],
    captions: ["A first look changes the shape of what follows.", "The next move is yours."],
  },
  {
    match: /\b(print|type|paper|ink|gallery|poem|book|art|archive|design|exhibit)\b/iu,
    pairs: [["MARK", "TYPE"], ["PRESS", "INK"], ["TRACE", "PAPER"]],
    captions: ["One impression slips over the other.", "The page keeps a trace."],
  },
];
const openTheme = {
  pairs: [["FORM", "SHIFT"], ["SLANT", "ALIGN"], ["TRACE", "AGAIN"]],
  captions: ["One point of view folds into another.", "The last impression stays."],
};

export const composeInstructions = [
  "Compose a three-scene text-only Typefield film that interprets the user's creative brief.",
  "Use a short distinct title. Make the arc move from an opening image to a shift to a lingering last line.",
  "Each scene is an optical sculpture with two different English words of two to six uppercase Latin letters.",
  "Use brief, concrete captions that carry the idea forward. Keep captions within 64 characters.",
  "Pick a printing color and make motion part of the meaning. Turn changes reading, Prism refracts, Echo leaves traces, and Hold rests.",
  "Aperture opens the next scene through its own letters. Register joins scenes in strips. Hard cut is immediate.",
  "Use three different scene pairings. Use durationMs in steps of 100, typically between 2400 and 3800.",
  "The angle is the still photo viewpoint in half-degree increments. Use version 2 and only the fields in the schema.",
].join(" ");

export function cleanBrief(value) {
  return typeof value === "string" ? storyText(value, maxBriefLength) : "";
}

function hashBrief(text) {
  let hash = 2166136261;
  for (const letter of text) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
  return hash >>> 0;
}

export function composeScore(brief, seed = 0) {
  const clean = cleanBrief(brief);
  const theme = themes.find(option => option.match.test(clean)) ?? openTheme;
  const words = clean.toLowerCase().match(/\b[a-z]+\b/gu) ?? [];
  const keyword = storyWord(words.find(word => !fillers.has(word) && wordPattern.test(storyWord(word))));
  const variation = (hashBrief(clean.toLowerCase()) + seed) >>> 0;
  const order = variation % 3;
  const scenes = [0, 1, 2].map(index => {
    const [lead, reply] = theme.pairs[(index + order) % 3];
    const first = index === 0 && keyword && keyword !== reply ? keyword : lead;
    return normalizeScene({
      first,
      second: reply,
      caption: index === 0 ? clean : theme.captions[index - 1],
      ink: inks[(order + index) % inks.length],
      angle: index === 1 ? 45 : -45,
      durationMs: [3100, 2700, 3400][index] + ((variation >>> (index * 3)) % 4) * 100,
      motion: [order === 0 ? "turn" : "prism", "echo", "hold"][index],
      transition: index === 1 ? "aperture" : "register",
    });
  });
  return { version: 2, title: storyText(clean, 48) || "A shift in type", scenes };
}
