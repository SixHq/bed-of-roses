// ConnectPane — list of provider accordions.
function ConnectPane({ statuses, onUpdate, onContinue, onBack, error }) {
  const [expanded, setExpanded] = React.useState("anthropic");
  const anyConnected = Object.values(statuses).some((s) => s?.connected);

  return (
    <OnboardingPane
      title="Connect a model."
      subtitle="Choose your provider. You can add more — and switch between them anytime."
      error={error && !anyConnected ? error : null}
      footer={
        <>
          <button className="btn btn-text" onClick={onBack}>Back</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onContinue} disabled={!anyConnected}>Continue</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            status={statuses[p.id]}
            expanded={expanded === p.id}
            onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
            onSave={(draft) => onUpdate(p.id, { connected: !!(draft.apiKey || draft.baseUrl), ...draft })}
            onClear={() => onUpdate(p.id, null)}
          />
        ))}
      </div>
    </OnboardingPane>
  );
}

Object.assign(window, { ConnectPane });
