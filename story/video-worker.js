self.addEventListener("message", async ({ data }) => {
  try {
    const { encodeStory } = await import("./video.js");
    const buffer = await encodeStory(data, {
      progress: value => self.postMessage({ type: "progress", value }),
    });
    self.postMessage({ type: "complete", buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
}, { once: true });
