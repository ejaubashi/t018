import { clamp, limit, scoreDuration } from "../exhibit/kinetics.js";

export const storySize = Object.freeze({ width: 1080, height: 1920 });
export const frameRate = 30;
export const movieLength = scoreDuration;
export const defaultCaption = "Same letters. Different points of view.";
export const wordPattern = /^[A-Z]{2,6}$/u;
const inks = new Set(["amber", "violet", "paper"]);

export function storyWord(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeStory(value = {}) {
  const first = storyWord(value.first);
  const second = storyWord(value.second);
  const angle = Number(value.angle ?? -limit);
  const caption = typeof value.caption === "string"
    ? Array.from(value.caption.replace(/\s+/gu, " ").trim()).slice(0, 64).join("")
    : defaultCaption;
  return {
    version: 1,
    first: wordPattern.test(first) ? first : "READ",
    second: wordPattern.test(second) ? second : "MAKE",
    caption,
    ink: inks.has(value.ink) ? value.ink : "amber",
    angle: Number.isFinite(angle) ? clamp(Math.round(angle * 2) / 2, -limit, limit) : -limit,
  };
}

export function storyFromAddress(address) {
  return normalizeStory(Object.fromEntries(new URL(address).searchParams));
}

export function storyAddress(address, story) {
  const target = new URL(address);
  for (const key of ["first", "second", "caption", "ink", "angle"]) target.searchParams.set(key, story[key]);
  return target;
}
