import { labMotion } from "./motion.js";

const stage = document.querySelector("#gravity-stage");
const print = stage.querySelector(".gravity-print");
const pulseButton = document.querySelector("#pulse");
const forceButtons = [...document.querySelectorAll("[data-force]")];
const engineLabel = document.querySelector("#gravity-engine");
const motion = labMotion;
const particles = [];
const lines = [...print.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim());

print.replaceChildren(...lines.map(line => {
  const row = document.createElement("span");
  row.className = "gravity-line";
  for (const char of line) {
    if (char === " ") {
      row.append(" ");
      continue;
    }
    const slot = document.createElement("span");
    const letter = document.createElement("span");
    slot.className = "mass-slot";
    letter.className = "mass-letter";
    letter.textContent = char;
    slot.append(letter);
    row.append(slot);
    particles.push({ slot, letter });
  }
  return row;
}));
print.setAttribute("aria-hidden", "true");

const state = new Float32Array(particles.length * 4);
const homes = new Float32Array(particles.length * 2);
const forces = new Float32Array(8);
let bounds;
let center;
let pointer;
let force = 1;
let pulseEnds = 0;
let separated = false;
let solver;
let frame = 0;
let busy = false;
let lastTime = 0;

function showEngine(name) {
  if (engineLabel.value !== name) engineLabel.value = name;
}

function measure() {
  bounds = stage.getBoundingClientRect();
  let x = 0;
  let y = 0;
  for (const [index, { slot }] of particles.entries()) {
    const rect = slot.getBoundingClientRect();
    homes[index * 2] = rect.left - bounds.left + rect.width / 2;
    homes[index * 2 + 1] = rect.top - bounds.top + rect.height / 2;
    x += homes[index * 2];
    y += homes[index * 2 + 1];
  }
  center = { x: x / particles.length, y: y / particles.length };
}

const shader = `
  struct Parameters {
    field: vec4<f32>,
    time: vec4<f32>,
  }
  @group(0) @binding(0) var<storage, read_write> state: array<vec4<f32>>;
  @group(0) @binding(1) var<storage, read> home: array<vec2<f32>>;
  @group(0) @binding(2) var<uniform> parameters: Parameters;

  @compute @workgroup_size(64)
  fn step(@builtin(global_invocation_id) invocation: vec3<u32>) {
    let index = invocation.x;
    if (index >= arrayLength(&state)) { return; }
    let p = state[index];
    let field = parameters.field;
    let dt = parameters.time.x;
    let delta = field.xy - home[index] - p.xy;
    let distance = max(18.0, length(delta));
    let reach = clamp(1.0 - distance / field.z, 0.0, 1.0);
    let spring = -p.xy * 0.084;
    let gravity = delta / distance * (reach * reach * field.w);
    let velocity = (p.zw + (spring + gravity) * dt) * pow(0.8, dt);
    state[index] = vec4<f32>(p.xy + velocity * dt, velocity);
  }
`;

async function gpuSolver() {
  if (!navigator.gpu) return;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return;
  const device = await adapter.requestDevice();
  const module = device.createShaderModule({ code: shader, label: "Text springs" });
  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "step" },
  });
  const particlesBuffer = device.createBuffer({
    size: state.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const homeBuffer = device.createBuffer({
    size: homes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const forceBuffer = device.createBuffer({
    size: forces.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const readBuffer = device.createBuffer({
    size: state.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const bindings = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [particlesBuffer, homeBuffer, forceBuffer].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });

  function stepOnGPU() {
    device.queue.writeBuffer(particlesBuffer, 0, state);
    device.queue.writeBuffer(homeBuffer, 0, homes);
    device.queue.writeBuffer(forceBuffer, 0, forces);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings);
    pass.dispatchWorkgroups(Math.ceil(particles.length / 64));
    pass.end();
    encoder.copyBufferToBuffer(particlesBuffer, 0, readBuffer, 0, state.byteLength);
    device.queue.submit([encoder.finish()]);
    return readBuffer.mapAsync(GPUMapMode.READ).then(() => {
      state.set(new Float32Array(readBuffer.getMappedRange()));
      readBuffer.unmap();
    });
  }

  device.lost.then(() => {
    if (solver === stepOnGPU) solver = undefined;
    if (!motion.matches) showEngine("CPU physics");
  });

  return stepOnGPU;
}

function stepOnCPU(direct) {
  const [x, y, radius, strength, dt] = forces;
  const damping = 0.8 ** dt;
  for (let index = 0; index < particles.length; index += 1) {
    const at = index * 4;
    const ox = direct ? 0 : state[at];
    const oy = direct ? 0 : state[at + 1];
    const dx = x - homes[index * 2] - ox;
    const dy = y - homes[index * 2 + 1] - oy;
    const distance = Math.max(18, Math.hypot(dx, dy));
    const pull = Math.max(0, 1 - distance / radius) ** 2 * strength / distance;
    let vx = 0;
    let vy = 0;
    if (!direct) {
      vx = (state[at + 2] + (-ox * 0.084 + dx * pull) * dt) * damping;
      vy = (state[at + 3] + (-oy * 0.084 + dy * pull) * dt) * damping;
    }
    state[at] = direct ? dx * pull * 2.6 : ox + vx * dt;
    state[at + 1] = direct ? dy * pull * 2.6 : oy + vy * dt;
    state[at + 2] = vx;
    state[at + 3] = vy;
  }
}

function paint() {
  for (const [index, { letter }] of particles.entries()) {
    const at = index * 4;
    const angle = Math.min(26, Math.max(-26, state[at + 2] * 1.6));
    letter.style.transform = "translate(" + state[at] + "px, " + state[at + 1] + "px) rotate(" + angle + "deg)";
  }
}

function schedule() {
  if (!frame && !busy) frame = requestAnimationFrame(tick);
}

async function tick(time) {
  frame = 0;
  busy = true;
  const dt = lastTime ? Math.min(1.7, Math.max(0.6, (time - lastTime) / 16.67)) : 1;
  lastTime = time;
  const activePulse = motion.matches ? separated : time < pulseEnds;
  const target = pointer ?? center;
  const radius = Math.max(125, bounds.width * 0.56);
  let strength = 0;
  if (activePulse) strength = motion.matches ? -18 : -22 * (pulseEnds - time) / 520;
  if (pointer) strength = 13 * force;
  forces.set([target.x, target.y, radius, strength, dt]);

  if (solver && !motion.matches) {
    try {
      await solver();
      showEngine("WebGPU compute");
    } catch {
      solver = undefined;
      stepOnCPU(false);
      showEngine("CPU physics");
    }
  } else {
    stepOnCPU(motion.matches);
    showEngine(motion.matches ? "Direct positioning" : "CPU physics");
  }

  busy = false;
  if (!motion.matches && (pointer || performance.now() < pulseEnds || state.some(value => Math.abs(value) > 0.15))) {
    paint();
    schedule();
  } else {
    lastTime = 0;
    if (motion.matches) {
      paint();
    } else {
      state.fill(0);
      for (const { letter } of particles) letter.style.removeProperty("transform");
    }
  }
}

function updatePointer(event) {
  const rect = stage.getBoundingClientRect();
  pointer = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
  schedule();
}

function release(event) {
  if (event.pointerId !== pointer?.id) return;
  pointer = undefined;
  schedule();
}

stage.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  stage.setPointerCapture(event.pointerId);
  updatePointer(event);
});
stage.addEventListener("pointermove", event => {
  if (event.pointerId === pointer?.id) updatePointer(event);
});
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("lostpointercapture", release);

pulseButton.addEventListener("click", () => {
  if (motion.matches) {
    separated = !separated;
    pulseButton.textContent = separated ? "Reassemble" : "Separate the letters";
  } else {
    pulseEnds = performance.now() + 520;
  }
  schedule();
});

for (const button of forceButtons) {
  button.addEventListener("click", () => {
    force = button.dataset.force === "pull" ? 1 : -1;
    for (const option of forceButtons) option.setAttribute("aria-pressed", String(option === button));
  });
}

motion.addEventListener("change", () => {
  pulseEnds = 0;
  separated = false;
  pulseButton.textContent = motion.matches ? "Separate the letters" : "Send a pulse";
  schedule();
});

measure();
new ResizeObserver(measure).observe(stage);
document.fonts.ready.then(measure);
if (motion.matches) pulseButton.textContent = "Separate the letters";
schedule();

gpuSolver().then(compute => {
  solver = compute;
  if (solver) schedule();
}).catch(() => {
  solver = undefined;
});
