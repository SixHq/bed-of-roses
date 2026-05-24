// Bed of Roses — Ambient field
//
// A full-viewport canvas at the back of the z-stack that holds two layers:
//
//   1. Drifting MOTES — ~140 faint points of light that drift slowly upward
//      and respond to the cursor with parallax (motes nearer "you" shift
//      more, motes farther shift less — sells dimensional space).
//
//   2. A SUN — one large soft radial gradient blob that traces a slow path
//      across the screen over ~120s, suggesting there's a light source
//      somewhere in this world.
//
// Both layers are tinted by the user's chosen avatar color, so the whole
// atmosphere shifts when you change presence color. Restraint over spectacle.

export class AmbientField {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ count?: number }} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.color = [255, 255, 255];
    this.targetColor = [255, 255, 255];
    this.particleCount = options.count || 140;
    this.particles = [];
    this._raf = 0;
    this._lastFrame = 0;
    this._w = 0;
    this._h = 0;

    // Mouse parallax — eased toward target each frame
    this._mouseTargetX = 0;
    this._mouseTargetY = 0;
    this._mouseX = 0;
    this._mouseY = 0;

    // Sun phase — advances over ~120s for one full orbit
    this._sunPhase = Math.random() * Math.PI * 2;

    this._resize();
    this._initParticles();
    window.addEventListener('resize', () => {
      this._resize();
      this._initParticles();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
    this._tick = this._tick.bind(this);
  }

  setColor(rgb) {
    if (Array.isArray(rgb) && rgb.length === 3) {
      this.targetColor = [...rgb];
    }
  }

  /** Mouse parallax in normalized [-1, 1]. Eased toward target each frame. */
  setParallax(x, y) {
    this._mouseTargetX = Math.max(-1, Math.min(1, x || 0));
    this._mouseTargetY = Math.max(-1, Math.min(1, y || 0));
  }

  start() {
    if (this._raf) return;
    this._lastFrame = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this._w = w;
    this._h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        x: Math.random() * this._w,
        y: Math.random() * this._h,
        z: Math.random(), // depth: 0 (back) → 1 (near)
        // Mostly drift up; tiny lateral wander. Slow.
        vx: (Math.random() - 0.5) * 0.018,
        vy: -0.012 - Math.random() * 0.030,
        seed: Math.random() * 1000,
      });
    }
  }

  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(64, now - this._lastFrame);
    this._lastFrame = now;

    // Ease color toward target — palette changes feel atmospheric, not flicker
    for (let i = 0; i < 3; i++) {
      this.color[i] += (this.targetColor[i] - this.color[i]) * 0.04;
    }

    // Ease mouse position toward target (sense of inertia)
    const ease = 0.08;
    this._mouseX += (this._mouseTargetX - this._mouseX) * ease;
    this._mouseY += (this._mouseTargetY - this._mouseY) * ease;

    // Advance sun (very slow — full orbit ~120s)
    this._sunPhase += dt * 0.000050;

    this._update(dt);
    this._render(now);
  }

  _update(dt) {
    const w = this._w, h = this._h;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; }
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
    }
  }

  /**
   * Draw a thin diagonal light streak across the viewport. The streak is
   * positioned by `phase` (0 → 2π drifts it from one edge to the other) and
   * angled by `slope` (rise over run, e.g. 0.35 for a gentle diagonal).
   */
  _drawStreak(ctx, w, h, r, g, b, phase, slope) {
    const diag = Math.hypot(w, h);
    // Center of the streak drifts perpendicular to its axis
    const drift = Math.sin(phase) * diag * 0.35;
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan(slope));
    ctx.translate(0, drift);

    // Linear gradient along the perpendicular — bright in the middle, fades out
    const grad = ctx.createLinearGradient(0, -diag * 0.05, 0, diag * 0.05);
    grad.addColorStop(0,   `rgba(${r|0},${g|0},${b|0},0)`);
    grad.addColorStop(0.5, `rgba(${r|0},${g|0},${b|0},0.05)`);
    grad.addColorStop(1,   `rgba(${r|0},${g|0},${b|0},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-diag, -diag * 0.05, diag * 2, diag * 0.10);
    ctx.restore();
  }

  _render(now) {
    const ctx = this.ctx;
    const w = this._w, h = this._h;
    const [r, g, b] = this.color;

    ctx.clearRect(0, 0, w, h);

    // ---- Sun: slow-drifting radial gradient blob ----
    const sunR = Math.max(w, h) * 0.55;
    const sunCx = w / 2 + Math.cos(this._sunPhase) * w * 0.35;
    const sunCy = h / 2 + Math.sin(this._sunPhase * 1.3) * h * 0.25;
    const sunGrad = ctx.createRadialGradient(sunCx, sunCy, 0, sunCx, sunCy, sunR);
    sunGrad.addColorStop(0,    `rgba(${r|0},${g|0},${b|0},0.10)`);
    sunGrad.addColorStop(0.35, `rgba(${r|0},${g|0},${b|0},0.04)`);
    sunGrad.addColorStop(1,    `rgba(${r|0},${g|0},${b|0},0)`);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);

    // ---- Light streaks: two slow diagonal sweeps that suggest light cutting
    //      through this space. Drawn with a long thin linear gradient that
    //      drifts perpendicular to its axis over a ~60s cycle. ----
    const streakPhase1 = (this._sunPhase * 4) % (Math.PI * 2);
    const streakPhase2 = (this._sunPhase * 4 + Math.PI) % (Math.PI * 2);
    this._drawStreak(ctx, w, h, r, g, b, streakPhase1, 0.35);   // 35° from horizontal
    this._drawStreak(ctx, w, h, r, g, b, streakPhase2, -0.55);  // counter-diagonal

    // ---- Motes: with mouse parallax (depth-scaled) ----
    const px = this._mouseX;
    const py = this._mouseY;
    for (const p of this.particles) {
      // Closer particles (higher z) shift more with the cursor
      const shiftX = px * (8 + p.z * 18);
      const shiftY = py * (5 + p.z * 12);

      const twinkle = 0.5 + Math.sin(now * 0.0008 + p.seed) * 0.5;
      const baseAlpha = 0.030 + p.z * 0.10;
      const alpha = baseAlpha * (0.55 + twinkle * 0.45);
      const size = 0.4 + p.z * 1.5;

      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x + shiftX, p.y + shiftY, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
