import { composeInstructions, composeScore } from "./compose.js";
import { readScore, scoreSchema } from "./spec.js?v=2";

async function localModel(brief, seed, signal) {
  const model = globalThis.LanguageModel;
  if (!model || await model.availability() !== "available") return null;
  signal.throwIfAborted();
  const session = await model.create({ signal });
  try {
    const reply = await session.prompt(composeInstructions + "\n" + JSON.stringify({ brief, seed }), {
      responseConstraint: scoreSchema, signal,
    });
    return readScore(JSON.parse(reply));
  } finally {
    session.destroy();
  }
}

export async function requestScore(brief, seed, { endpoint, signal }) {
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, seed }), signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The composition API is unavailable.");
    const score = readScore(result.score);
    if (!score) throw new Error("The composition API returned an invalid sequence.");
    return { score, source: result.source === "openai" ? "OpenAI API" : "Typefield API" };
  }

  try {
    const score = await localModel(brief, seed, signal);
    if (score) return { score, source: "On-device model" };
  } catch {
    signal.throwIfAborted();
  }
  return { score: composeScore(brief, seed), source: "Browser composer" };
}
