# Typefield Story Studio

Story Studio renders a 1080 × 1920 PNG from the chosen viewing angle or a silent 7.8-second H.264 MP4 at 30 fps. Both exports use the same word geometry and typography as the preview. The video follows Typefield’s motion score from beginning to end. The editor and exports run in the browser. [Open Story Studio](https://ejaubashi.github.io/t018/story/)

The video encoder runs in a worker where available. WebCodecs and Mediabunny produce the MP4 when the browser can encode H.264. A bundled software encoder covers browsers without native H.264 encoding. The editor exposes file sharing when the device supports it. [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder) · [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)

## Content generation API

Use a server-side content endpoint to generate the words, caption, and ink. Have it return the same versioned data the editor uses, validate that data, and let the user review the preview before exporting. The decoder and defaults are in `spec.js`.

```json
{
  "version": 1,
  "first": "READ",
  "second": "MAKE",
  "caption": "Same letters. Different points of view.",
  "ink": "amber",
  "angle": -45
}
```

The words take two to six letters A–Z each. Captions may be empty and have a limit of 64 characters. Ink is `amber`, `violet`, or `paper`. Angle runs from −45 to +45 degrees in half-degree steps and controls the PNG.

Keep generation credentials on the server. GitHub Pages can continue to host the editor. For automated batches, add an export job that accepts this same story and a file format, runs the renderer with the bundled fonts in headless Chromium, and returns the file when it is ready.
