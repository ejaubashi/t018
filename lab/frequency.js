import { labMotion } from "./motion.js";

const lines = document.querySelector("#frequency-lines");
const demo = document.querySelector("#frequency-demo");
const mic = document.querySelector("#frequency-mic");
const stop = document.querySelector("#frequency-stop");
const status = document.querySelector("#frequency-status");
const indicators = [...document.querySelectorAll(".frequency-bands span")];
const motion = labMotion;
const Audio = window.AudioContext ?? window.webkitAudioContext;
const glyphs = [];
const target = new Float32Array(8);
const smoothed = new Float32Array(8);
const edges = [0, 105, 205, 390, 740, 1400, 2700, 5400, 12000];
let current;
let frame = 0;

const sourceLines = [...lines.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim());
lines.setAttribute("aria-label", sourceLines.join(" "));
lines.replaceChildren(...sourceLines.map(source => {
  const line = document.createElement("span");
  line.className = "frequency-line";
  line.setAttribute("aria-hidden", "true");
  const readable = [...source].filter(char => char !== " ").length;
  let index = 0;

  for (const character of source) {
    if (character === " ") {
      line.append(" ");
      continue;
    }
    const slot = document.createElement("span");
    const glyph = document.createElement("span");
    slot.className = "frequency-slot";
    slot.dataset.character = character;
    glyph.className = "frequency-glyph";
    glyph.textContent = character;
    slot.append(glyph);
    line.append(slot);
    glyphs.push({ glyph, band: Math.round(index * 7 / (readable - 1)) });
    index += 1;
  }
  return line;
}));

function updateStatus(value) {
  if (status.value !== value) status.value = value;
  stop.disabled = !current;
  demo.disabled = current?.mode === "demo" || !Audio;
  mic.disabled = current?.mode === "mic" || !Audio || !navigator.mediaDevices?.getUserMedia;
}

function finish(message = "Signal stopped") {
  const session = current;
  current = undefined;
  if (session) {
    clearTimeout(session.timeout);
    for (const track of session.stream?.getTracks() ?? []) track.stop();
    session.context.close().catch(() => {});
  }
  target.fill(0);
  updateStatus(message);
  schedule();
}

function fromAnalyser(session) {
  session.analyser.getByteFrequencyData(session.spectrum);
  const binWidth = session.context.sampleRate / session.analyser.fftSize;
  for (let band = 0; band < target.length; band += 1) {
    const start = Math.max(0, Math.floor(edges[band] / binWidth));
    const end = Math.min(session.spectrum.length, Math.ceil(edges[band + 1] / binWidth));
    let peak = 0;
    for (let index = start; index < end; index += 1) peak = Math.max(peak, session.spectrum[index]);
    target[band] = peak / 255;
  }
}

function draw() {
  frame = 0;
  if (current?.analyser) fromAnalyser(current);
  for (let index = 0; index < target.length; index += 1) {
    smoothed[index] += (target[index] - smoothed[index]) * 0.29;
    if (smoothed[index] < 0.005) smoothed[index] = 0;
  }

  const reduced = motion.matches;
  for (const { glyph, band } of glyphs) {
    const energy = smoothed[band];
    glyph.style.setProperty("--pitch-weight", Math.round(730 - 330 * energy));
    glyph.style.setProperty("--pitch-width", (84 + 26 * energy).toFixed(2));
    glyph.style.setProperty("--pitch-height", reduced ? 1 : (1 + 0.26 * energy).toFixed(3));
    glyph.style.setProperty("--pitch-lift", reduced ? "0px" : (-0.46 * energy).toFixed(3) + "em");
    glyph.style.setProperty("--pitch-color", Math.round(energy * 60) + "%");
  }

  for (const [index, indicator] of indicators.entries()) {
    const from = index === 0 ? 0 : index * 3 - 1;
    const energy = Math.max(...smoothed.slice(from, index === 2 ? 8 : from + 3));
    indicator.style.setProperty("--band-intensity", reduced ? 0 : energy.toFixed(3));
  }
  if (current?.active || smoothed.some(value => value > 0)) schedule();
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}

async function meter(session) {
  const context = session.context;
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);
  if (context.audioWorklet && typeof AudioWorkletNode === "function") {
    try {
      await context.audioWorklet.addModule(new URL("./frequency-meter.js", import.meta.url));
      if (current !== session) return;
      const worklet = new AudioWorkletNode(context, "frequency-meter", { outputChannelCount: [1] });
      worklet.port.onmessage = event => {
        if (current === session) target.set(event.data);
      };
      worklet.connect(mute);
      return worklet;
    } catch {
      if (current !== session) return;
    }
  }

  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.42;
  analyser.connect(mute);
  session.analyser = analyser;
  session.spectrum = new Uint8Array(analyser.frequencyBinCount);
  return analyser;
}

function playTestSignal(context, destination) {
  const start = context.currentTime + 0.08;
  const notes = [72, 142, 285, 565, 1100, 2300, 4300, 7200, 96, 565, 1100, 275, 4300, 142];
  for (const [index, hertz] of notes.entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const onset = start + index * 0.29;
    oscillator.frequency.value = hertz;
    gain.gain.setValueAtTime(0, onset);
    gain.gain.linearRampToValueAtTime(index % 3 === 0 ? 0.56 : 0.39, onset + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, onset + 0.37);
    oscillator.connect(gain).connect(destination);
    oscillator.start(onset);
    oscillator.stop(onset + 0.39);
  }
}

async function begin(mode) {
  finish();
  if (!Audio) return;
  let session;
  try {
    const context = new Audio();
    session = { context, mode };
    current = session;
    updateStatus(mode === "mic" ? "Waiting for microphone permission" : "Starting the silent signal");
    const ready = context.resume().then(() => true, () => false);
    if (mode === "mic") {
      // Request input only after the microphone control is pressed.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== session) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      session.stream = stream;
    }

    if (!await ready) throw new Error("Audio context did not resume");
    if (current !== session) return;
    const input = await meter(session);
    if (!input || current !== session) return;

    if (mode === "mic") {
      context.createMediaStreamSource(session.stream).connect(input);
    } else {
      playTestSignal(context, input);
      session.timeout = setTimeout(() => finish("Test signal finished"), 4600);
    }
    const engine = session.analyser ? "Analyser" : "AudioWorklet";
    session.active = true;
    updateStatus(mode === "mic" ? "Microphone on · " + engine : "Silent signal · " + engine);
    schedule();
  } catch (error) {
    if (current !== session) return;
    finish(mode === "mic" ? "Microphone unavailable. Try the test signal." : "Audio could not start");
  }
}

demo.addEventListener("click", () => begin("demo"));
mic.addEventListener("click", () => begin("mic"));
stop.addEventListener("click", () => finish());
addEventListener("pagehide", () => finish());
updateStatus(Audio ? "Waiting for a signal" : "Web Audio unavailable");
