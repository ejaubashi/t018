class FrequencyMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.splits = [105, 205, 390, 740, 1400, 2700, 5400];
    this.coefficients = this.splits.map(freq => 1 - Math.exp(-2 * Math.PI * freq / sampleRate));
    this.lowPass = new Float32Array(this.splits.length);
    this.power = new Float32Array(this.splits.length + 1);
    this.frames = 0;
  }

  process(inputs, outputs) {
    // Silence is part of the contract, even when a microphone is connected.
    for (const channel of outputs[0]) channel.fill(0);
    const samples = inputs[0][0];
    if (!samples) return true;

    for (const sample of samples) {
      let previous = 0;
      for (let index = 0; index < this.lowPass.length; index += 1) {
        const value = this.lowPass[index] + (sample - this.lowPass[index]) * this.coefficients[index];
        this.lowPass[index] = value;
        const band = value - previous;
        this.power[index] += band * band;
        previous = value;
      }
      const top = sample - previous;
      this.power[this.power.length - 1] += top * top;
    }

    this.frames += samples.length;
    if (this.frames >= sampleRate / 32) {
      const envelopes = Array.from(this.power, power => Math.min(1, (power / this.frames) ** 0.27 * 2.18));
      this.port.postMessage(envelopes);
      this.frames = 0;
      this.power.fill(0);
    }
    return true;
  }
}

registerProcessor("frequency-meter", FrequencyMeter);
