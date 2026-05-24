// Welcome — first onboarding pane.
function Welcome({ onContinue }) {
  return (
    <div className="pane">
      <div className="pane-inner" style={{ alignItems: "center", textAlign: "center", maxWidth: 540 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s-7)" }}>
          <HeroRose size={120} />
          <div className="pane-header" style={{ alignItems: "center", textAlign: "center" }}>
            <h1 className="pane-title"><Reveal text="Welcome." /></h1>
            <p className="pane-sub" style={{ textAlign: "center" }}>
              Your computer starts empty. Talk to it, and it builds itself around how you work.
            </p>
          </div>
          <button className="btn btn-primary" onClick={onContinue}>Get started</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Welcome });
