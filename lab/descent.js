import { labMotion } from "./motion.js";

const stage = document.querySelector("#descent-stage");
const heading = document.querySelector("#descent-title");
const passage = document.querySelector("#descent-copy");
const back = document.querySelector("#descent-back");
const status = document.querySelector("#descent-status");
const motion = labMotion;
const address = new URL(location.href);
const nativeNavigation = window.navigation?.currentEntry && typeof window.NavigateEvent?.prototype.intercept === "function";
const spots = new Map();
let serial = 0;
let activeKey;
let transition;
let renderTicket = 0;

const chapters = {
  door: {
    title: "The door",
    copy: ["A room has two sides. The side you’re on decides what ", ["hinge", "the hinge"], " means. ",
      ["threshold", "The threshold"], " can be a line or a place to wait."],
  },
  hinge: {
    title: "The hinge",
    copy: ["The part that makes the opening possible stands still. Its leaves turn around ",
      ["pin", "the pin"], ". From the other side, it is simply ", ["door", "the door"], " opening."],
  },
  pin: {
    title: "The pin",
    copy: ["Take it out and the two leaves fall apart. A small thing can change a room without crossing ",
      ["threshold", "the threshold"], "."],
  },
  threshold: {
    title: "The threshold",
    copy: ["Stand on the line long enough and neither room feels like yours. You can feel ",
      ["draft", "the draft"], " before you decide which way to go."],
  },
  draft: {
    title: "The draft",
    copy: ["Air is the first thing through. It crosses ", ["threshold", "the threshold"],
      " even when the person holding ", ["door", "the door"], " is still deciding."],
  },
};

function currentChapter(url = new URL(location.href)) {
  const key = url.searchParams.get("chapter");
  return Object.hasOwn(chapters, key) ? key : "door";
}

function chapterAddress(url) {
  if (!url) return;
  const parsed = new URL(url, address);
  if (parsed.origin === address.origin && parsed.pathname === address.pathname) return parsed;
}

function linkFor(key) {
  return passage.querySelector('[data-chapter="' + key + '"]');
}

function updateBack() {
  if (nativeNavigation) {
    const parent = navigation.entries()[navigation.currentEntry.index - 1];
    back.disabled = !chapterAddress(parent?.url);
  } else {
    back.disabled = (history.state?.descentDepth ?? 0) === 0;
  }
}

function renderChapter(key) {
  const chapter = chapters[key];
  heading.textContent = chapter.title;
  const fragment = document.createDocumentFragment();
  for (const part of chapter.copy) {
    if (typeof part === "string") {
      fragment.append(part);
    } else {
      const [destination, label] = part;
      const anchor = document.createElement("a");
      anchor.href = "?chapter=" + destination;
      anchor.dataset.chapter = destination;
      anchor.textContent = label;
      fragment.append(anchor);
    }
  }
  passage.replaceChildren(fragment);
  document.title = chapter.title + " · Descent · Typefield Lab";
  status.value = "Reading " + chapter.title;
  updateBack();
}

function saveSpot(anchor) {
  spots.set(activeKey, {
    top: scrollY,
    link: anchor?.dataset.chapter ?? document.activeElement?.dataset.chapter,
  });
}

function show(key, entryKey, { anchor, traverse = false, signal } = {}) {
  const ticket = ++renderTicket;
  transition?.skipTransition();
  transition = undefined;
  const spot = traverse ? spots.get(entryKey) : undefined;
  const source = passage.contains(anchor) ? anchor : linkFor(key);
  const previous = source ?? heading;
  heading.style.viewTransitionName = "";
  for (const link of passage.querySelectorAll("a")) link.style.viewTransitionName = "";

  const update = () => {
    if (ticket !== renderTicket || signal?.aborted) return;
    activeKey = entryKey;
    renderChapter(key);
    heading.style.viewTransitionName = "the-chapter";
    (spot?.link && linkFor(spot.link) || heading).focus({ preventScroll: true });
    window.scrollTo(0, spot?.top ?? 0);
  };

  const scope = typeof stage.startViewTransition === "function" ? stage : document;
  if (motion.matches || typeof scope.startViewTransition !== "function") {
    update();
    return;
  }

  previous.style.viewTransitionName = "the-chapter";
  const next = scope.startViewTransition(update);
  transition = next;
  next.ready.catch(() => {});
  next.finished.then(() => {
    if (transition === next) transition = undefined;
  });
  return next.updateCallbackDone;
}

history.scrollRestoration = "manual";

if (nativeNavigation) {
  activeKey = navigation.currentEntry.key;
  navigation.addEventListener("navigate", event => {
    const destination = chapterAddress(event.destination.url);
    if (!destination || !event.canIntercept || event.downloadRequest !== null || event.hashChange) return;
    const anchor = event.sourceElement?.closest?.("a[data-chapter]");
    saveSpot(anchor);
    event.intercept({
      focusReset: "manual",
      scroll: "manual",
      handler: () => show(currentChapter(destination), navigation.currentEntry.key, {
        anchor,
        traverse: event.navigationType === "traverse",
        signal: event.signal,
      }),
    });
  });
} else {
  activeKey = history.state?.descentKey ?? "start";
  history.replaceState({ ...history.state, descentKey: activeKey, descentDepth: history.state?.descentDepth ?? 0 }, "");

  document.addEventListener("click", event => {
    const anchor = event.target.closest("a[data-chapter]");
    if (!anchor || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    const destination = chapterAddress(anchor.href);
    if (!destination) return;
    event.preventDefault();
    saveSpot(anchor);
    const key = "chapter-" + Date.now() + "-" + ++serial;
    history.pushState({ descentKey: key, descentDepth: history.state.descentDepth + 1 }, "", destination);
    show(currentChapter(destination), key, { anchor });
  });

  addEventListener("popstate", event => {
    saveSpot();
    show(currentChapter(), event.state?.descentKey ?? "start", { traverse: true });
  });
}

back.addEventListener("click", () => history.back());
motion.addEventListener("change", () => {
  if (motion.matches) transition?.skipTransition();
});
renderChapter(currentChapter());
