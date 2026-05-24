// AmbientCanvas — drifting motes + soft sun. Tinted by the presence color.
// Lightweight version of shell/ambient.js.

function AmbientCanvas() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let w = 0, h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = canvas.clientWidth * dpr;
      h = canvas.height = canvas.clientHeight * dpr;
      ctx.scale(1, 1);
    };
    resize();
    window.addEventListener("resize", resize);

    // Read presence color from CSS var
    const getRgb = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--avatar-color-rgb").trim();
      const [r, g, b] = v.split(",").map((n) => parseFloat(n) || 232);
      return { r, g, b };
    };

    const N = 80;
    const motes = Array.from({ length: N }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.4,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08,
      depth: Math.random(),
    }));

    let t0 = performance.now();
    const draw = (now) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      const { r, g, b } = getRgb();

      // Sun — slow orbit
      const sunX = w * 0.5 + Math.cos(t / 30) * w * 0.25;
      const sunY = h * 0.4 + Math.sin(t / 30) * h * 0.2;
      const grd = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(w, h) * 0.5);
      grd.addColorStop(0, `rgba(${r},${g},${b},0.10)`);
      grd.addColorStop(0.4, `rgba(${r},${g},${b},0.04)`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      // Motes
      for (const m of motes) {
        m.x += m.vx + Math.sin(t * 0.15 + m.depth * 6) * 0.05;
        m.y += m.vy + Math.cos(t * 0.12 + m.depth * 6) * 0.05;
        if (m.x < 0) m.x = w; if (m.x > w) m.x = 0;
        if (m.y < 0) m.y = h; if (m.y > h) m.y = 0;
        const a = 0.3 + m.depth * 0.5;
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * (0.6 + m.depth), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="layer-ambient" style={{ width: "100%", height: "100%" }} />;
}

Object.assign(window, { AmbientCanvas });
