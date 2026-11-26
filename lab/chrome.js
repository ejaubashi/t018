import { labMotion } from "./motion.js";

const bar = document.querySelector(".bar");
const catalog = new URL("./", import.meta.url);
const tools = document.createElement("div");
tools.className = "lab-tools";
const indexLink = document.createElement("a");
indexLink.className = "lab-tool";
indexLink.href = new URL("#experiments", catalog).href;
indexLink.textContent = "Index";
indexLink.setAttribute("aria-haspopup", "dialog");
const motionButton = document.createElement("button");
motionButton.type = "button";
motionButton.className = "lab-tool";
motionButton.textContent = "Reduce motion";
tools.append(indexLink, motionButton);
bar.insertBefore(tools, bar.querySelector(".room-nav"));

function showMotion() {
  motionButton.setAttribute("aria-pressed", String(labMotion.matches));
}

motionButton.addEventListener("click", () => labMotion.toggle());
labMotion.addEventListener("change", showMotion);
showMotion();

const dialog = document.createElement("dialog");
if (typeof dialog.showModal === "function") {
  dialog.className = "lab-index";
  dialog.setAttribute("aria-labelledby", "lab-index-title");
  dialog.innerHTML = `
    <div class="index-heading">
      <h2 id="lab-index-title">Experiment index</h2>
      <button class="lab-tool" type="button" id="index-close">Close</button>
    </div>
    <label for="index-query">Find an experiment</label>
    <input id="index-query" type="search" placeholder="Name or action" autocomplete="off">
    <p id="index-result-count" class="micro" role="status"></p>
    <ul id="index-results"></ul>
    <p id="index-fallback" hidden><a>Open the full directory</a></p>
  `;
  document.body.append(dialog);

  const close = dialog.querySelector("#index-close");
  const input = dialog.querySelector("#index-query");
  const count = dialog.querySelector("#index-result-count");
  const list = dialog.querySelector("#index-results");
  const fallback = dialog.querySelector("#index-fallback");
  fallback.querySelector("a").href = indexLink.href;
  let entries;
  let loading;

  function filter() {
    if (!entries) return;
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    for (const item of entries) {
      item.node.hidden = !item.text.includes(query);
      if (!item.node.hidden) shown += 1;
    }
    count.textContent = shown === 1 ? "1 experiment" : shown + " experiments";
  }

  async function load() {
    let source = document;
    if (!source.querySelector(".catalog-entry")) {
      const response = await fetch(new URL("index.html", catalog));
      if (!response.ok) throw new Error("Directory unavailable");
      source = new DOMParser().parseFromString(await response.text(), "text/html");
    }

    entries = [...source.querySelectorAll(".catalog-entry")].map(entry => {
      const link = document.createElement("a");
      const item = document.createElement("li");
      const title = document.createElement("span");
      const description = document.createElement("span");
      link.href = new URL(entry.getAttribute("href"), catalog).href;
      title.textContent = entry.querySelector(".entry-name").textContent;
      description.textContent = entry.querySelector(".entry-action").textContent;
      if (new URL(link.href).pathname === location.pathname) link.setAttribute("aria-current", "page");
      link.append(title, description);
      item.append(link);
      list.append(item);
      return { node: item, text: (title.textContent + " " + description.textContent + " " + entry.dataset.category).toLowerCase() };
    });
    filter();
  }

  input.addEventListener("input", filter);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dialog.close();
  });
  dialog.addEventListener("close", () => indexLink.focus({ preventScroll: true }));
  indexLink.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.showModal();
    (matchMedia("(pointer: coarse)").matches ? close : input).focus({ preventScroll: true });
    if (entries || loading) return;
    count.textContent = "Opening the index";
    fallback.hidden = true;
    loading = load().catch(() => {
      count.textContent = "The index could not load";
      fallback.hidden = false;
    }).finally(() => { loading = undefined; });
  });
} else {
  indexLink.removeAttribute("aria-haspopup");
}
