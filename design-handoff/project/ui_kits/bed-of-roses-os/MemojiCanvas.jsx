// MemojiCanvas — CSS-only stand-in for shell/memoji.js.
// The real engine is parametric particle/petal rendering on <canvas>.
// This recreation uses radial gradients + breathing keyframes that match the visual register.

function MemojiCanvas({ size = 220, color = "232,232,238", presetId = "nova" }) {
  // 4 presets each have a distinct interior pattern. We approximate by stacking radial gradients.
  const presets = {
    nova: {
      // A field of light — diffuse, omnidirectional
      bg: `radial-gradient(circle at 50% 55%, rgba(${color},0.14), transparent 65%)`,
      core: { dotSize: 14, dotOpacity: 0.95, blur: 0 },
    },
    cipher: {
      // Quiet, attentive — small tight pinpoint
      bg: `radial-gradient(circle at 50% 50%, rgba(${color},0.10), transparent 55%)`,
      core: { dotSize: 8, dotOpacity: 1, blur: 0 },
    },
    aria: {
      // Flowing, fluid — elongated wash
      bg: `radial-gradient(ellipse 60% 80% at 50% 60%, rgba(${color},0.16), transparent 70%)`,
      core: { dotSize: 12, dotOpacity: 0.9, blur: 1 },
    },
    echo: {
      // Resonant rings — concentric
      bg: `radial-gradient(circle at 50% 55%, rgba(${color},0.04) 28%, rgba(${color},0.14) 32%, rgba(${color},0.04) 38%, rgba(${color},0.10) 50%, transparent 70%)`,
      core: { dotSize: 10, dotOpacity: 0.95, blur: 0 },
    },
  };
  const p = presets[presetId] || presets.nova;

  return (
    <div
      className="memoji-canvas"
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid rgba(${color}, 0.40)`,
        background: p.bg,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: p.core.dotSize,
          height: p.core.dotSize,
          marginLeft: -p.core.dotSize / 2,
          marginTop: -p.core.dotSize / 2,
          borderRadius: "50%",
          background: `rgba(${color}, ${p.core.dotOpacity})`,
          boxShadow: `0 0 30px rgba(${color},0.6), 0 0 60px rgba(${color},0.3)`,
          animation: "dot-pulse 3.4s ease-in-out infinite",
          filter: p.core.blur ? `blur(${p.core.blur}px)` : "none",
        }}
      />
    </div>
  );
}

Object.assign(window, { MemojiCanvas });
