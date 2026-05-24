// NamePane
function NamePane({ value, onChange, onContinue, onBack }) {
  const ref = React.useRef(null);
  React.useEffect(() => { setTimeout(() => ref.current?.focus(), 400); }, []);
  return (
    <OnboardingPane
      title="Name your AI."
      subtitle="You'll see this name everywhere they show up."
      footer={
        <>
          <button className="btn btn-text" onClick={onBack}>Back</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onContinue} disabled={!value.trim()}>Continue</button>
        </>
      }
    >
      <div className="field">
        <span className="mono-label">Name</span>
        <input
          ref={ref}
          className="field-input"
          placeholder="Atlas"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onContinue(); }}
          maxLength={40}
        />
      </div>
    </OnboardingPane>
  );
}

Object.assign(window, { NamePane });
