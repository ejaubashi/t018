export const words = ["I", "thought", "the", "city", "had", "forgotten", "me.", "It", "was", "only", "waiting."];
export const readings = ["first", "second"];
export const readingName = { first: "First reading", second: "Second reading" };
const stateKey = "reading";
const maxReceipts = 32;

export function openingWords() {
  return { first: [0, 1, 2, 3, 4, 5, 6], second: [7, 8, 9, 10] };
}

function original() {
  return { revision: 0, pages: openingWords(), undo: [], events: [] };
}

export function samePages(a, b) {
  return readings.every(name => a[name].length === b[name].length && a[name].every((id, index) => id === b[name][index]));
}

function result(state, message) {
  return { state, message, changed: false };
}

function writeRevision(state, pages, undo, type, text, affected = []) {
  const event = { revision: state.revision + 1, type, text, affected };
  return {
    state: { revision: event.revision, pages, undo, events: [...state.events, event].slice(-maxReceipts) },
    message: text,
    changed: true,
  };
}

function positionsChanged(before, after) {
  return readings.flatMap(side => after[side].filter((id, index) => id !== before[side][index]));
}

export function applyChange(state, action) {
  if (action.type === "undo") {
    if (action.revision !== state.revision) return result(state, "The reading changed. Check the latest move before undoing.");
    const previous = state.undo.at(-1);
    if (!previous) return result(state, "There is no move to undo.");
    return writeRevision(state, previous, state.undo.slice(0, -1), "undo", "Restored the previous arrangement.",
      positionsChanged(state.pages, previous));
  }

  const undo = [...state.undo, state.pages].slice(-maxReceipts);
  if (action.type === "reset") {
    const pages = openingWords();
    if (samePages(state.pages, pages)) return result(state, "The opening words are already in place.");
    return writeRevision(state, pages, undo, "reset", "Restored the opening words.", positionsChanged(state.pages, pages));
  }

  const { from, to, before, ids } = action;
  if (action.type !== "move" || !readings.includes(from) || !readings.includes(to)
    || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) {
    return result(state, "Choose a word and its destination.");
  }

  const moving = state.pages[from].filter(id => ids.includes(id));
  if (moving.length !== ids.length) return result(state, "Those words already moved. Make a new selection.");
  const pages = { ...state.pages };
  pages[from] = pages[from].filter(id => !moving.includes(id));
  const target = pages[to];
  let anchor = before;
  if (from === to && moving.includes(anchor)) {
    const previous = state.pages[to];
    anchor = previous.slice(previous.indexOf(anchor)).find(id => !moving.includes(id)) ?? null;
  }
  const index = anchor === null ? target.length : target.indexOf(anchor);
  if (index < 0) return result(state, "That position changed. Choose a new position.");

  pages[to] = [...target.slice(0, index), ...moving, ...target.slice(index)];
  if (samePages(state.pages, pages)) return result(state, "Those words are already in that position.");

  const quote = moving.map(id => words[id]).join(" ");
  const receipt = "Moved “" + quote + "” to position " + (index + 1) + " in the " + readingName[to].toLowerCase() + ".";
  return writeRevision(state, pages, undo, from === to ? "reorder" : "handoff", receipt, moving);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("typefield-relay", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("readings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openReading() {
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
    const db = await openDatabase();
    db.onversionchange = () => db.close();

    function transact(action) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("readings", action ? "readwrite" : "readonly");
        const store = transaction.objectStore("readings");
        const request = store.get(stateKey);
        let value;
        request.onsuccess = () => {
          const previous = request.result ?? original();
          value = action ? applyChange(previous, action) : previous;
          if (value.changed) store.put(value.state, stateKey);
        };
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = () => reject(transaction.error);
      });
    }

    const initial = await transact();
    return { shared: true, initial, read: () => transact(), commit: action => transact(action) };
  } catch {
    let state = original();
    return {
      shared: false,
      initial: state,
      async read() { return state; },
      async commit(action) {
        const update = applyChange(state, action);
        state = update.state;
        return update;
      },
    };
  }
}
