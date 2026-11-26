export const example = "I left the light on. It made the room look like it was waiting.";
const lengths = [180, 310, 150, 560, 350, 180, 260, 155, 500, 230, 230, 155, 210, 590];
const clamp = (value, low, high) => Math.min(high, Math.max(low, Math.round(value)));

export function scoreWords(text) {
  return (text.trim().slice(0, 240).match(/\S+/gu) ?? []).slice(0, 28);
}

export function makeScore(text, previous = []) {
  return scoreWords(text).map((word, index) => {
    const saved = previous[index];
    if (saved?.word === word) {
      return {
        word,
        duration: Number.isFinite(saved.duration) ? clamp(saved.duration, 100, 2500) : 275,
        silence: Number.isFinite(saved.silence) ? clamp(saved.silence, 0, 2000) : 0,
        emphasis: Boolean(saved.emphasis),
      };
    }
    const punctuation = /[.!?]$/u.test(word);
    return {
      word,
      duration: text === example ? lengths[index] ?? 275 : word.length <= 3 ? 185 : 330,
      silence: punctuation ? 420 : /[,;:]$/u.test(word) ? 205 : word === "light" ? 130 : 0,
      emphasis: word === "light" || word === "waiting.",
    };
  });
}

export function schedule(score) {
  let total = 0;
  const cues = score.map(item => {
    const start = total;
    const end = start + item.duration;
    total = end + item.silence;
    return { ...item, start, end, next: total };
  });
  return { cues, total };
}

export function atTime(cues, time) {
  const index = cues.findIndex(cue => time >= cue.start && time < cue.next);
  const cue = cues[index];
  return { index, speaking: Boolean(cue && time < cue.end), elapsed: cue ? time - cue.start : 0 };
}
