import { clamp, limit, scoreDuration } from "../exhibit/kinetics.js";

export const storySize = Object.freeze({ width: 1080, height: 1920 });
export const frameRate = 30;
export const transitionDuration = 700;
export const maxScenes = 4;
export const minDuration = 1800;
export const maxDuration = 7800;
export const inks = ["amber", "violet", "paper"];
export const motions = { turn: "Turn", prism: "Prism", echo: "Echo", hold: "Hold" };
export const transitions = { aperture: "Aperture", register: "Register", cut: "Hard cut" };
export const wordPattern = /^[A-Z]{2,6}$/u;
const defaultCaption = "Same letters. Different points of view.";
const legacyKeys = ["first", "second", "caption", "ink", "angle"];

const sceneProperties = {
  first: { type: "string", pattern: wordPattern.source },
  second: { type: "string", pattern: wordPattern.source },
  caption: { type: "string", maxLength: 64 },
  ink: { type: "string", enum: inks },
  angle: { type: "number", minimum: -limit, maximum: limit, multipleOf: 0.5 },
  durationMs: { type: "integer", minimum: minDuration, maximum: maxDuration, multipleOf: 100 },
  motion: { type: "string", enum: Object.keys(motions) },
  transition: { type: "string", enum: Object.keys(transitions) },
};

export const scoreSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [2] },
    title: { type: "string", minLength: 1, maxLength: 48 },
    scenes: {
      type: "array", minItems: 1, maxItems: maxScenes,
      items: {
        type: "object", properties: sceneProperties,
        required: Object.keys(sceneProperties), additionalProperties: false,
      },
    },
  },
  required: ["version", "title", "scenes"],
  additionalProperties: false,
};

export function storyWord(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function storyText(value, size) {
  return Array.from(value.replace(/\s+/gu, " ").trim()).slice(0, size).join("");
}

export function normalizeScene(value = {}) {
  const first = storyWord(value.first);
  const second = storyWord(value.second);
  const angle = Number(value.angle ?? -limit);
  const duration = Number(value.durationMs ?? scoreDuration);
  return {
    first: wordPattern.test(first) ? first : "READ",
    second: wordPattern.test(second) ? second : "MAKE",
    caption: typeof value.caption === "string" ? storyText(value.caption, 64) : defaultCaption,
    ink: inks.includes(value.ink) ? value.ink : "amber",
    angle: Number.isFinite(angle) ? clamp(Math.round(angle * 2) / 2, -limit, limit) : -limit,
    durationMs: Number.isFinite(duration) ? clamp(Math.round(duration / 100) * 100, minDuration, maxDuration) : scoreDuration,
    motion: typeof value.motion === "string" && Object.hasOwn(motions, value.motion) ? value.motion : "turn",
    transition: typeof value.transition === "string" && Object.hasOwn(transitions, value.transition) ? value.transition : "aperture",
  };
}

// The API, file importer and address bar all use the same validation.
export function readScore(value) {
  if (!value || value.version !== 2 || typeof value.title !== "string"
    || Object.keys(value).length !== scoreSchema.required.length
    || !Array.isArray(value.scenes) || value.scenes.length < 1 || value.scenes.length > maxScenes) return null;
  const title = storyText(value.title, 48);
  if (!title || Array.from(value.title).length > 48) return null;
  const scenes = [];
  for (const scene of value.scenes) {
    if (!scene || Object.keys(scene).length !== Object.keys(sceneProperties).length
      || typeof scene.first !== "string" || !wordPattern.test(scene.first)
      || typeof scene.second !== "string" || !wordPattern.test(scene.second)
      || typeof scene.caption !== "string" || Array.from(scene.caption).length > 64
      || !inks.includes(scene.ink) || typeof scene.motion !== "string" || !Object.hasOwn(motions, scene.motion)
      || typeof scene.transition !== "string" || !Object.hasOwn(transitions, scene.transition)
      || !Number.isFinite(scene.angle) || Math.abs(scene.angle) > limit || !Number.isInteger(scene.angle * 2)
      || !Number.isInteger(scene.durationMs) || scene.durationMs < minDuration
      || scene.durationMs > maxDuration || scene.durationMs % 100 !== 0) return null;
    scenes.push(normalizeScene(scene));
  }
  return { version: 2, title, scenes };
}

export function oneScene(value) {
  const scene = normalizeScene(value);
  return { version: 2, title: scene.first + " / " + scene.second, scenes: [scene] };
}

function sampleScore() {
  return {
    version: 2,
    title: "The hour in between",
    scenes: [
      normalizeScene({ first: "NIGHT", second: "DAWN", caption: "The last train carries the first light.", durationMs: 3200, motion: "prism" }),
      normalizeScene({ first: "DRIFT", second: "GLOW", caption: "The city is a letter still being written.", durationMs: 3000, ink: "violet", motion: "echo" }),
      normalizeScene({ first: "TRACE", second: "PAPER", caption: "Leave a little light behind.", durationMs: 2800, ink: "paper", motion: "hold", transition: "register" }),
    ],
  };
}

export function scoreFromAddress(address) {
  const params = new URL(address).searchParams;
  const encoded = params.get("score");
  if (encoded && encoded.length < 5000) {
    try {
      const score = readScore(JSON.parse(encoded));
      if (score) return score;
    } catch {
      // A malformed link opens the default workspace.
    }
  }
  return legacyKeys.some(key => params.has(key)) ? oneScene(Object.fromEntries(params)) : sampleScore();
}

export function scoreAddress(address, score) {
  const target = new URL(address);
  for (const key of legacyKeys) target.searchParams.delete(key);
  target.searchParams.set("score", JSON.stringify(score));
  return target;
}

export function timelineOf(score) {
  let duration = 0;
  const starts = score.scenes.map(scene => {
    const start = duration;
    duration += scene.durationMs;
    return start;
  });
  return { starts, duration };
}

export function sceneAt(starts, time) {
  return starts.findLastIndex(start => time >= start);
}
