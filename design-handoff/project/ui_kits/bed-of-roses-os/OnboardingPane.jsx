// OnboardingPane — shared shell. Title is per-character revealed.

function Reveal({ text }) {
  return (
    <span className="reveal" aria-label={text}>
      {[...text].map((c, i) => (
        <span key={i} style={{ animationDelay: `${i * 32}ms` }}>{c === " " ? "\u00A0" : c}</span>
      ))}
    </span>
  );
}

function OnboardingPane({ title, subtitle, children, footer, error }) {
  return (
    <div className="pane">
      <div className="pane-inner">
        <div className="pane-header">
          <h1 className="pane-title"><Reveal text={title} /></h1>
          {subtitle && <p className="pane-sub">{subtitle}</p>}
        </div>
        {children}
        <div className="pane-footer">
          {error && <span className="pane-error">{error}</span>}
          {footer}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingPane, Reveal });
