// PresencePane — preset grid + color swatches.
function PresencePane({ preset, color, onPreset, onColor, onContinue, onBack }) {
  return (
    <OnboardingPane
      title="Choose a presence."
      subtitle="Pick a personality and a color. Same intelligence — different feeling."
      footer={
        <>
          <button className="btn btn-text" onClick={onBack}>Back</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onContinue}>Continue</button>
        </>
      }
    >
      <div className="cards">
        {PRESENCE_PRESETS.map((p) => (
          <PresenceCard
            key={p.id}
            preset={p}
            color={color}
            selected={preset === p.id}
            onClick={() => onPreset(p.id)}
          />
        ))}
      </div>
      <div className="field">
        <span className="mono-label">Color</span>
        <div className="swatches">
          {PRESENCE_COLORS.map((c) => (
            <span
              key={c.id}
              className={`swatch${color.id === c.id ? " selected" : ""}`}
              style={{ background: c.hex, color: c.hex }}
              title={c.label}
              onClick={() => onColor(c)}
            />
          ))}
        </div>
      </div>
    </OnboardingPane>
  );
}

Object.assign(window, { PresencePane });
