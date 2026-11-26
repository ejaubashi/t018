import { createStoryRenderer, loadStoryFonts, storyCanvas } from "./render.js";
import { frameRate, movieLength, normalizeStory, storySize } from "./spec.js";

const { width, height } = storySize;
const totalFrames = Math.round(movieLength * frameRate / 1000);
const bitrate = 6_000_000;
const softwareURL = new URL("./vendor/h264-mp4-encoder-1.0.12.js", import.meta.url);
let softwareReady;

async function nativeAVC() {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.42002a", width, height, bitrate, framerate: frameRate, avc: { format: "avc" },
    });
    return support.supported;
  } catch {
    return false;
  }
}

function loadSoftware() {
  if (globalThis.HME) return Promise.resolve(globalThis.HME);
  if (typeof importScripts === "function") {
    importScripts(softwareURL.href);
    return Promise.resolve(globalThis.HME);
  }
  softwareReady ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = softwareURL.href;
    script.onload = () => resolve(globalThis.HME);
    script.onerror = () => reject(new Error("The software video encoder could not load."));
    document.head.append(script);
  }).catch(error => {
    softwareReady = undefined;
    throw error;
  });
  return softwareReady;
}

async function renderFrames(story, renderer, addFrame, signal, progress) {
  for (let index = 0; index < totalFrames; index += 1) {
    signal?.throwIfAborted();
    const seconds = index / frameRate;
    renderer.paint(story, seconds * 1000);
    await addFrame(seconds);
    if (index % 4 === 0) {
      progress(index / totalFrames);
      if (typeof document !== "undefined") await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  signal?.throwIfAborted();
  progress(0.99);
}

async function encodeNative(story, signal, progress) {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output } = await import("./vendor/mediabunny-1.66.4.mjs");
  signal?.throwIfAborted();
  const canvas = storyCanvas();
  const renderer = createStoryRenderer(canvas);
  const target = new BufferTarget();
  const movie = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const track = new CanvasSource(canvas, { codec: "avc", keyFrameInterval: 1, bitrate });
  movie.addVideoTrack(track, { frameRate });
  try {
    await movie.start();
    await renderFrames(story, renderer, time => track.add(time, 1 / frameRate), signal, progress);
    track.close();
    await movie.finalize();
    signal?.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error("The video encoder returned an empty file.");
    return target.buffer;
  } catch (error) {
    await movie.cancel().catch(() => {});
    throw error;
  }
}

async function encodeSoftware(story, signal, progress) {
  const library = await loadSoftware();
  signal?.throwIfAborted();
  const encoder = await library.createH264MP4Encoder();
  try {
    signal?.throwIfAborted();
    encoder.width = width;
    encoder.height = height;
    encoder.frameRate = frameRate;
    encoder.kbps = bitrate / 1000;
    encoder.speed = 8;
    encoder.groupOfPictures = frameRate;
    encoder.initialize();
    const renderer = createStoryRenderer(storyCanvas(), { readPixels: true });
    await renderFrames(story, renderer, () => {
      encoder.addFrameRgba(renderer.ink.getImageData(0, 0, width, height).data);
    }, signal, progress);
    encoder.finalize();
    return encoder.FS.readFile(encoder.outputFilename).slice().buffer;
  } finally {
    encoder.delete();
  }
}

export async function encodeStory(value, { signal, progress }) {
  const story = normalizeStory(value);
  await loadStoryFonts();
  signal?.throwIfAborted();
  if (await nativeAVC()) {
    try {
      return await encodeNative(story, signal, progress);
    } catch {
      signal?.throwIfAborted();
      progress(0);
    }
  }
  return encodeSoftware(story, signal, progress);
}

function renderInWorker(story, signal, progress) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./video-worker.js", import.meta.url));
    function finish(callback, value) {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      callback(value);
    }
    function abort() { finish(reject, signal.reason); }
    signal.addEventListener("abort", abort, { once: true });
    worker.addEventListener("message", ({ data }) => {
      if (data.type === "progress") progress(data.value);
      else if (data.type === "complete") finish(resolve, data.buffer);
      else if (data.type === "error") finish(reject, new Error(data.message));
    });
    worker.addEventListener("error", error => {
      error.preventDefault();
      finish(reject, new Error(error.message));
    }, { once: true });
    worker.postMessage(story);
  });
}

export async function createVideo(story, { signal, progress }) {
  if (typeof Worker === "function" && typeof OffscreenCanvas === "function") {
    try {
      const buffer = await renderInWorker(story, signal, progress);
      return new Blob([buffer], { type: "video/mp4" });
    } catch {
      signal.throwIfAborted();
      progress(0);
    }
  }
  return new Blob([await encodeStory(story, { signal, progress })], { type: "video/mp4" });
}
