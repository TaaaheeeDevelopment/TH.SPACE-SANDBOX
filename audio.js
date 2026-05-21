// Cosmic Sound Synthesis Engine using Web Audio API
// Bound globally to window.spaceAudio to bypass browser file:// protocol module CORS restrictions.

class SpaceAudioEngine {
  constructor() {
    this.ctx = null;
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
    this.ambientLFO = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.isMuted = false; // Enabled automatically by default
    this.isInitialized = false;
  }

  // Initialize the Audio Context on first user interaction
  init() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Starts at 0 volume
      this.masterGain.connect(this.ctx.destination);

      // Ambient Gain (specifically for background drone)
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      this.startAmbientDrone();
      this.isInitialized = true;
      console.log("Space Audio Engine successfully initialized.");

      // Smooth fade-in of space ambient drone if unmuted
      if (!this.isMuted) {
        this.masterGain.gain.linearRampToValueAtTime(0.6, this.ctx.currentTime + 1.0);
      }
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser:", e);
    }
  }

  // Synthesize a continuous cosmic deep space drone
  startAmbientDrone() {
    if (!this.ctx) return;

    // Deep Drone Oscillator 1 (Low C)
    this.ambientOsc1 = this.ctx.createOscillator();
    this.ambientOsc1.type = 'triangle';
    this.ambientOsc1.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2 frequency

    // Deep Drone Oscillator 2 (Slightly detuned octave lower for richness)
    this.ambientOsc2 = this.ctx.createOscillator();
    this.ambientOsc2.type = 'sine';
    this.ambientOsc2.frequency.setValueAtTime(32.70, this.ctx.currentTime); // C1 frequency
    
    // Lowpass filter to make the drone warm and atmospheric
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(110, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    // LFO to slowly modulate volume (creates a breathing/pulsing effect)
    this.ambientLFO = this.ctx.createOscillator();
    this.ambientLFO.type = 'sine';
    this.ambientLFO.frequency.setValueAtTime(0.12, this.ctx.currentTime); // Very slow: 8.3s per cycle

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.02, this.ctx.currentTime); // Modulate amplitude slightly

    // Connect nodes
    this.ambientLFO.connect(lfoGain);
    lfoGain.connect(this.ambientGain.gain); // modulate volume

    this.ambientOsc1.connect(filter);
    this.ambientOsc2.connect(filter);
    filter.connect(this.ambientGain);

    // Start oscillators
    this.ambientOsc1.start(0);
    this.ambientOsc2.start(0);
    this.ambientLFO.start(0);
  }

  // Synthesize a futuristic sci-fi hover sound (subtle high-pitch sweep)
  playHover() {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    
    // Resume context if suspended (browser security)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, this.ctx.currentTime);
    // Quick upward slide
    osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.08);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    gainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.08);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(0);
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // Synthesize a futuristic UI click sound (dual crystal tone)
  playClick() {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;
    
    // Tone 1: Sci-fi high-pitch beep
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1200, t);
    osc1.frequency.setValueAtTime(1500, t + 0.03); // Instant octave interval step
    
    gain1.gain.setValueAtTime(0.0, t);
    gain1.gain.linearRampToValueAtTime(0.05, t + 0.005);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    
    osc1.start(t);
    osc1.stop(t + 0.16);

    // Tone 2: A warm sub click
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(200, t);
    osc2.frequency.exponentialRampToValueAtTime(80, t + 0.1);

    gain2.gain.setValueAtTime(0.0, t);
    gain2.gain.linearRampToValueAtTime(0.06, t + 0.005);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    osc2.connect(gain2);
    gain2.connect(this.masterGain);

    osc2.start(t);
    osc2.stop(t + 0.13);
  }

  // Synthesize a deep sweeping cinematic whoosh for planet focus transitions
  playTransition() {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;
    const duration = 1.2;

    const osc = this.ctx.createOscillator();
    const noiseGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    // Low frequency sweep
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + duration * 0.7);
    osc.frequency.exponentialRampToValueAtTime(50, t + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + duration * 0.5);
    filter.frequency.exponentialRampToValueAtTime(80, t + duration);
    filter.Q.setValueAtTime(5, t);

    noiseGain.gain.setValueAtTime(0.0, t);
    noiseGain.gain.linearRampToValueAtTime(0.08, t + duration * 0.3);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  // Toggle Mute
  toggleMute() {
    if (!this.isInitialized || !this.ctx) return true;

    this.isMuted = !this.isMuted;
    const targetVolume = this.isMuted ? 0 : 0.6;
    
    // Smoothly fade audio in/out to prevent clicks
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + 0.15);

    return this.isMuted;
  }
}

window.spaceAudio = new SpaceAudioEngine();
