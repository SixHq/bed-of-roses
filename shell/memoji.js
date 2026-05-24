// Bed of Roses — Memoji (abstract canvas presence)
//
// The AI's "presence" is an abstract field of light — particles, flowing
// curves, or concentric rings — rendered on canvas at 60fps. State changes
// (idle / thinking / building / success / sleeping / error) modulate
// rotation speed, breath amplitude, jitter, and brightness. Color tints
// every primitive so the chosen palette colour drives the whole field.
//
// Personalities (preset key → visual identity):
//   nova    — Fibonacci sphere of particles. Pure presence.
//   cipher  — Sphere + two glow-bead "eyes" that blink slowly.
//   aria    — Lissajous flow lines, drifting like a dotted aurora.
//   echo    — Three concentric rings, no particles, breath-driven pulse.

export const COLORS = {
  pearl:   { hex: '#E8E8EE', label: 'Pearl' },
  amber:   { hex: '#F5C36B', label: 'Amber' },
  ember:   { hex: '#F88E66', label: 'Ember' },
  bloom:   { hex: '#F49EBA', label: 'Bloom' },
  aurora:  { hex: '#8FE5C5', label: 'Aurora' },
  frost:   { hex: '#A0CBF0', label: 'Frost' },
  lilac:   { hex: '#C4A8F0', label: 'Lilac' },
  onyx:    { hex: '#9B9BA5', label: 'Onyx' },
};
export const COLOR_NAMES = Object.keys(COLORS);

const PRESETS = {
  nova: {
    label: 'Nova',
    description: 'A field of light',
    layers: ['sphere'],
    count: 360,
    jitter: 0.35,
    rotation: 0.00018,
    radius: 0.42,
    breath: 0.05,
    showEyes: false,
    showRings: false,
  },
  cipher: {
    label: 'Cipher',
    description: 'Quiet, attentive',
    layers: ['sphere'],
    count: 280,
    jitter: 0.20,
    rotation: 0.00012,
    radius: 0.40,
    breath: 0.05,
    showEyes: true,
    showRings: false,
  },
  aria: {
    label: 'Aria',
    description: 'Flowing, fluid',
    layers: ['curves'],
    count: 240,
    jitter: 0.65,
    rotation: 0.00010,
    radius: 0.44,
    breath: 0.06,
    showEyes: false,
    showRings: false,
  },
  echo: {
    label: 'Echo',
    description: 'Resonant rings',
    layers: ['rings'],
    count: 0,
    jitter: 0,
    rotation: 0.00006,
    radius: 0.46,
    breath: 0.08,
    showEyes: false,
    showRings: true,
  },
};

const STATE_MODS = {
  idle:      { speed: 1.0,  breath: 1.0, jitter: 1.0, brightness: 1.00 },
  listening: { speed: 0.4,  breath: 0.7, jitter: 0.6, brightness: 1.05 },
  thinking:  { speed: 4.0,  breath: 0.5, jitter: 1.6, brightness: 1.00 },
  building:  { speed: 5.5,  breath: 1.2, jitter: 1.8, brightness: 1.10 },
  speaking:  { speed: 1.2,  breath: 1.4, jitter: 1.0, brightness: 1.00 },
  success:   { speed: 1.5,  breath: 1.0, jitter: 1.0, brightness: 1.00 }, // overridden by impulse
  error:     { speed: 1.0,  breath: 1.0, jitter: 4.5, brightness: 0.85 }, // brief shake
  sleeping:  { speed: 0.15, breath: 0.3, jitter: 0.3, brightness: 0.50 },
};

const TWO_PI = Math.PI * 2;

function hash(i) {
  return ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
}

function fibonacciSphere(count, radius) {
  const pts = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pts.push({
      x: Math.cos(theta) * r * radius,
      y: y * radius,
      z: Math.sin(theta) * r * radius,
      seed: hash(i + 1),
    });
  }
  return pts;
}

function lissajousField(count, radius) {
  const pts = [];
  const a = 3, b = 2, delta = Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts.push({
      x: Math.sin(a * t + delta) * radius,
      y: Math.sin(b * t) * radius,
      z: Math.cos(t) * radius * 0.6,
      seed: hash(i + 17),
    });
  }
  return pts;
}

function hexToRgb(hex) {
  const m = (hex || '').replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function rgba([r, g, b], a) { return `rgba(${r},${g},${b},${a})`; }

export class Memoji {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ preset?: string, color?: string, fpsCap?: number }} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.preset = PRESETS[options.preset] ? options.preset : 'nova';
    this.state = 'idle';
    this.fpsCap = options.fpsCap || 60;
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    this._setColorRgb(options.color || 'lilac');

    this._size = 0;
    this._rotY = 0;
    this._rotX = 0;
    this._lastFrame = 0;
    this._raf = 0;
    this._impulse = null;
    this._eyeBlink = { nextBlink: 0 };
    this._parallaxX = 0;
    this._parallaxY = 0;

    this._buildField();
    this._tick = this._tick.bind(this);

    if ('ResizeObserver' in window) {
      this._ro = new ResizeObserver(() => this._syncSize());
      this._ro.observe(canvas);
    } else {
      window.addEventListener('resize', () => this._syncSize());
    }
    this._syncSize();
  }

  setPreset(name) {
    if (!PRESETS[name] || name === this.preset) return;
    this.preset = name;
    this._buildField();
  }

  setColor(name) {
    this._setColorRgb(name);
  }

  _setColorRgb(name) {
    const entry = COLORS[name] || COLORS.pearl;
    this._color = name in COLORS ? name : 'lilac';
    this._colorRgb = hexToRgb(entry.hex);
  }

  setState(name) {
    if (!STATE_MODS[name]) return;
    this.state = name;
    if (name === 'success') {
      this._impulse = { kind: 'success', start: performance.now(), ms: 1100 };
    } else if (name === 'error') {
      this._impulse = { kind: 'error', start: performance.now(), ms: 700 };
    } else {
      this._impulse = null;
    }
  }

  setParallax(x, y) {
    this._parallaxX = Math.max(-1, Math.min(1, x || 0));
    this._parallaxY = Math.max(-1, Math.min(1, y || 0));
  }

  start() {
    if (this._raf) return;
    this._syncSize();
    requestAnimationFrame(() => this._syncSize());
    this._lastFrame = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  destroy() {
    this.stop();
    if (this._ro) this._ro.disconnect();
  }

  // --- internals ---

  _buildField() {
    const cfg = PRESETS[this.preset];
    if (cfg.layers.includes('sphere')) {
      this._particles = fibonacciSphere(cfg.count, 1);
    } else if (cfg.layers.includes('curves')) {
      this._particles = lissajousField(cfg.count, 1);
    } else {
      this._particles = [];
    }
  }

  _syncSize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssSize = Math.max(1, Math.min(rect.width, rect.height));
    this._size = cssSize;
    const px = Math.round(cssSize * this.dpr);
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    const frameMs = 1000 / this.fpsCap;
    if (now - this._lastFrame < frameMs - 1) return;
    const dt = now - this._lastFrame;
    this._lastFrame = now;
    this._render(now, dt);
  }

  _impulseFactors(now) {
    const base = { speed: 1, breath: 1, jitter: 1, brightness: 1, t: 1 };
    if (!this._impulse) return base;
    const elapsed = now - this._impulse.start;
    const t = Math.min(1, elapsed / this._impulse.ms);
    if (t >= 1) { this._impulse = null; return base; }
    if (this._impulse.kind === 'success') {
      const ease = 1 - Math.pow(1 - t, 3);
      const remain = 1 - ease;
      return {
        speed: 1 + remain * 3,
        breath: 1 + remain * 2.4,
        jitter: 1 + remain * 1.0,
        brightness: 1 + remain * 0.4,
        t,
      };
    }
    if (this._impulse.kind === 'error') {
      const remain = 1 - t;
      return {
        speed: 1,
        breath: 1,
        jitter: 1 + remain * 3,
        brightness: 0.7 + 0.3 * Math.sin(elapsed * 0.04) * remain,
        t,
      };
    }
    return base;
  }

  _render(now, dt) {
    const ctx = this.ctx;
    const size = this._size;
    if (size <= 0) return;

    const cfg = PRESETS[this.preset];
    const baseMods = STATE_MODS[this.state] || STATE_MODS.idle;
    const impulse = this._impulseFactors(now);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * cfg.radius;

    this._rotY += cfg.rotation * dt * baseMods.speed * impulse.speed;
    this._rotX = Math.sin(now * 0.0003) * 0.05;

    const breath = 1 + Math.sin(now * 0.0014) * cfg.breath * baseMods.breath * impulse.breath;

    const errorShake = (this.state === 'error' && impulse.t < 1)
      ? Math.sin(now * 0.05) * 1.6 * (1 - impulse.t)
      : 0;

    const parallaxX = this._parallaxX * radius * 0.06;
    const parallaxY = this._parallaxY * radius * 0.04;

    ctx.clearRect(0, 0, size, size);

    // ---- Soft tinted glow under the densest area ----
    if (cfg.layers.includes('sphere') || cfg.layers.includes('curves')) {
      const glow = ctx.createRadialGradient(
        cx + parallaxX, cy + parallaxY, 0,
        cx + parallaxX, cy + parallaxY, radius * 1.6
      );
      const alpha = 0.08 * baseMods.brightness * impulse.brightness;
      glow.addColorStop(0, rgba(this._colorRgb, alpha));
      glow.addColorStop(1, rgba(this._colorRgb, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
    }

    // ---- Particle field (Nova/Cipher/Aria) ----
    if (this._particles.length > 0) {
      const sinY = Math.sin(this._rotY);
      const cosY = Math.cos(this._rotY);
      const sinX = Math.sin(this._rotX);
      const cosX = Math.cos(this._rotX);
      const jitterAmp = cfg.jitter * baseMods.jitter * impulse.jitter;

      const proj = new Array(this._particles.length);
      for (let i = 0; i < this._particles.length; i++) {
        const p = this._particles[i];
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        const dx = Math.sin(now * 0.0009 + p.seed * 11) * jitterAmp;
        const dy = Math.cos(now * 0.0011 + p.seed * 13) * jitterAmp;
        proj[i] = {
          x: cx + (x1 * radius + dx * radius * 0.05) * breath + errorShake + parallaxX,
          y: cy + (y2 * radius + dy * radius * 0.05) * breath + parallaxY,
          z: z2,
        };
      }
      proj.sort((a, b) => a.z - b.z);

      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        const depth = (p.z + 1) / 2;
        const alpha = (0.10 + depth * 0.70) * baseMods.brightness * impulse.brightness;
        const dotR = (0.6 + depth * 1.4) * (size / 96);
        ctx.fillStyle = rgba(this._colorRgb, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dotR, 0, TWO_PI);
        ctx.fill();
      }
    }

    // ---- Concentric rings (Echo) ----
    if (cfg.showRings) {
      const ringCount = 3;
      for (let i = 0; i < ringCount; i++) {
        const t = i / (ringCount - 1);
        const r = radius * (0.45 + t * 0.55) * breath;
        const phaseAlpha = 0.5 + Math.sin(now * 0.0018 + t * Math.PI) * 0.4;
        const alpha = (0.18 + t * 0.32) * phaseAlpha * baseMods.brightness * impulse.brightness;
        ctx.beginPath();
        ctx.arc(cx + errorShake + parallaxX, cy + parallaxY, r, 0, TWO_PI);
        ctx.strokeStyle = rgba(this._colorRgb, alpha);
        ctx.lineWidth = (1 + (1 - t) * 1) * (size / 120);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx + errorShake + parallaxX, cy + parallaxY, radius * 0.06 * breath, 0, TWO_PI);
      ctx.fillStyle = rgba(this._colorRgb, 0.85 * baseMods.brightness * impulse.brightness);
      ctx.fill();
    }

    // ---- Eye beads (Cipher) ----
    if (cfg.showEyes) {
      if (now > this._eyeBlink.nextBlink) {
        this._eyeBlink.nextBlink = now + 4200 + Math.random() * 2400;
      }
      const sinceBlink = now - (this._eyeBlink.nextBlink - 4200);
      const blinkPhase = Math.max(0, 1 - Math.abs(sinceBlink - 0) / 140);
      const open = 1 - blinkPhase * 0.95;

      const eyeOffsetX = radius * 0.34;
      const eyeOffsetY = -radius * 0.06;
      const eyeR = radius * 0.05 * breath;
      const eyeAlpha = 0.95 * baseMods.brightness * impulse.brightness;

      for (const sx of [-1, 1]) {
        const ex = cx + sx * eyeOffsetX + errorShake + parallaxX;
        const ey = cy + eyeOffsetY + parallaxY;
        const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeR * 5);
        halo.addColorStop(0, rgba(this._colorRgb, 0.35 * eyeAlpha));
        halo.addColorStop(1, rgba(this._colorRgb, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(ex, ey, eyeR * 5, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = rgba(this._colorRgb, eyeAlpha);
        ctx.beginPath();
        ctx.ellipse(ex, ey, eyeR, Math.max(0.4, eyeR * open), 0, 0, TWO_PI);
        ctx.fill();
      }
    }
  }
}

// Backwards-compatible alias
export { Memoji as MemojiRenderer };

export const PRESET_NAMES = Object.keys(PRESETS);
export const PRESET_LABELS = Object.fromEntries(
  Object.entries(PRESETS).map(([id, p]) => [id, { name: p.label, description: p.description }])
);
export const STATE_NAMES = Object.keys(STATE_MODS);

// No-op stubs so any lingering imports/calls in app.js don't crash —
// the abstract presence has no hair / gender to configure.
export const HAIR_STYLES = { none: { label: 'None', option: null } };
export const HAIR_NAMES = ['none'];
export const GENDERS = { neutral: { label: 'Neutral', defaultHair: 'none' } };
export const GENDER_NAMES = ['neutral'];
