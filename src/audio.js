// ─────────────────────────────────────────────
//  GOING UP  ·  Ambient Audio
//  Jazz piano shifts key as the week gets stranger.
// ─────────────────────────────────────────────

// Jazz chords for each day (root + major 7th voicing)
// Frequencies are for a soft chord pad: root, 3rd, 5th, 7th
const DAY_CHORDS = [
  // Monday — Bb major 7 (warm, ordinary)
  [233.08, 277.18, 349.23, 415.30],
  // Tuesday — F minor 7 (mild unease)
  [174.61, 207.65, 261.63, 311.13],
  // Wednesday — Eb major 7 (drifting)
  [155.56, 196.00, 233.08, 293.66],
  // Thursday — Ab major 7 (strange)
  [207.65, 261.63, 311.13, 369.99],
  // Friday — Db major 7 (unresolved)
  [138.59, 164.81, 207.65, 246.94],
];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.drones = [];
    this.ding = null;
    this.dayIndex = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      // Audio not supported — silent fallback
    }
  }

  _ensure() {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setDay(dayIndex) {
    this.dayIndex = Math.min(dayIndex, DAY_CHORDS.length - 1);
    if (this.drones.length > 0) {
      this._restartAmbient();
    }
  }

  startAmbient() {
    if (!this._ensure()) return;
    this._stopAmbient();

    const freqs = DAY_CHORDS[this.dayIndex];
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 3);
    masterGain.connect(this.ctx.destination);

    this.drones = freqs.map((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      // Subtle vibrato
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.4 + i * 0.1, this.ctx.currentTime);
      lfo.type = 'sine';
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.3 + i * 0.2, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(1 / (i + 1) * 0.8, this.ctx.currentTime);
      osc.connect(oscGain);
      oscGain.connect(masterGain);

      lfo.start();
      osc.start();

      return { osc, lfo };
    });

    this._masterGain = masterGain;

    // Mechanical hum — very low
    const hum = this.ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(55, this.ctx.currentTime);
    const humGain = this.ctx.createGain();
    humGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    hum.connect(humGain);
    humGain.connect(this.ctx.destination);
    hum.start();
    this._hum = { osc: hum, gain: humGain };
  }

  _stopAmbient() {
    const t = this.ctx?.currentTime ?? 0;
    for (const { osc, lfo } of this.drones) {
      try { osc.stop(t + 0.5); lfo.stop(t + 0.5); } catch (_) {}
    }
    if (this._hum) {
      try { this._hum.osc.stop(t + 0.5); } catch (_) {}
      this._hum = null;
    }
    if (this._masterGain) {
      this._masterGain.gain.linearRampToValueAtTime(0, t + 0.5);
    }
    this.drones = [];
  }

  _restartAmbient() {
    const wasRunning = this.drones.length > 0;
    this._stopAmbient();
    if (wasRunning) setTimeout(() => this.startAmbient(), 600);
  }

  /** Short elevator arrival ding */
  playDing() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, t); // C6
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  /** Low thud for complaints */
  playComplaint() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** Soft chime for a tip */
  playTip() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.06);
      gain.gain.setValueAtTime(0.06, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.6);
    });
  }

  /** Mechanical whir during movement */
  playMovement(durationSec) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(140, t + durationSec * 0.5);
    osc.frequency.linearRampToValueAtTime(100, t + durationSec);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.1);
    gain.gain.linearRampToValueAtTime(0.04, t + durationSec - 0.1);
    gain.gain.linearRampToValueAtTime(0, t + durationSec);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + durationSec);
  }

  /** Secret revealed chime */
  playSecret() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const freqs = [392, 466.16, 523.25]; // G4, Bb4, C5
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      gain.gain.setValueAtTime(0.04, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 1.0);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 1.0);
    });
  }

  stopAll() {
    this._stopAmbient();
  }
}
