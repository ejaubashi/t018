export const limit = 45;
export const waveDuration = 1450;
export const scoreDuration = 7800;
export const exposureLag = 245;

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

export function carry(from, velocity) {
  const speed = clamp(velocity, -0.6, 0.6);
  const destination = clamp(from + speed * 165, -limit, limit);
  const target = Math.abs(destination) >= 42 ? Math.sign(destination) * limit : destination;
  const distance = from - target;
  const damping = 0.011;

  return {
    duration: 700,
    target,
    sample(time) {
      const travel = (distance + (speed + damping * distance) * time) * Math.exp(-damping * time);
      return clamp(target + travel, -limit, limit);
    },
  };
}

export function glide(from, target, duration = 980) {
  return { duration, target, sample: time => mix(from, target, ease(time / duration)) };
}

export function lensPass(time) {
  const progress = clamp(time);
  return {
    x: mix(0.12, 0.88, ease(progress)),
    y: 0.49 + 0.13 * Math.sin(progress * Math.PI * 2),
    power: Math.sin(progress * Math.PI) ** 0.62,
  };
}

export function exposures(angle, readPast) {
  return [
    { angle: readPast(exposureLag), alpha: 0.19, tint: 1 },
    { angle: readPast(152), alpha: 0.25, tint: 2 },
    { angle: readPast(68), alpha: 0.25, tint: 1 },
  ].filter(pose => Math.abs(pose.angle - angle) > 1.1);
}

const lensAt = 1750;
const waveAt = 3500;
const exposeAt = 5270;

function scoreAngle(time) {
  if (time < lensAt) {
    const travel = time <= 835 ? ease(time / 835) : 1 - ease((time - 835) / 915);
    return mix(-limit, 29, travel);
  }
  return mix(-limit, limit, ease((time - exposeAt) / 2190));
}

export function scoreAt(time) {
  const angle = scoreAngle(time);
  if (time < lensAt) return { angle, title: "Momentum" };
  if (time < waveAt) return { angle, title: "Lens", lens: lensPass((time - lensAt) / (waveAt - lensAt)) };
  if (time < exposeAt) {
    const waves = [
      { x: 0.29, y: 0.51, age: time - waveAt - 80 },
      { x: 0.73, y: 0.43, age: time - waveAt - 510 },
    ].filter(wave => wave.age >= 0 && wave.age < waveDuration);
    return { angle, title: "Resonance", waves };
  }
  return {
    angle,
    title: "Exposure",
    ghosts: exposures(angle, lag => scoreAngle(Math.max(exposeAt, time - lag))),
  };
}
