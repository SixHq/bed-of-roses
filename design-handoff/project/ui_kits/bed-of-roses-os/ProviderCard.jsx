// ProviderCard — connected/expandable accordion row.
const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-sonnet-4-5",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
      </svg>
    ),
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-5",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "gemini",
    name: "Gemini",
    defaultModel: "gemini-2.5-pro",
    mark: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z" />
      </svg>
    ),
  },
  {
    id: "openai-compat",
    name: "OpenAI-compatible",
    defaultModel: "",
    needsBaseUrl: true,
    presets: ["Ollama (local)", "Groq", "LM Studio"],
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="2.4" fill="currentColor" />
        <circle cx="18" cy="6" r="2.4" fill="currentColor" />
        <circle cx="12" cy="18" r="2.4" fill="currentColor" />
        <line x1="6" y1="6" x2="18" y2="6" />
        <line x1="6" y1="6" x2="12" y2="18" />
        <line x1="18" y1="6" x2="12" y2="18" />
      </svg>
    ),
  },
];

function ProviderCard({ provider, status, expanded, onToggle, onSave, onClear }) {
  const [draft, setDraft] = React.useState({
    apiKey: status?.apiKey || "",
    model: status?.model || provider.defaultModel || "",
    baseUrl: status?.baseUrl || "",
  });
  const connected = !!status?.connected;

  return (
    <div className={`card${expanded ? " selected" : ""}`} style={{ cursor: "default" }}>
      <div
        className="card-row"
        style={{ cursor: "pointer", justifyContent: "space-between" }}
        onClick={onToggle}
      >
        <div className="card-row" style={{ gap: 12 }}>
          <div style={{ width: 28, height: 28, color: "var(--label)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {provider.mark}
          </div>
          <div>
            <div className="card-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {provider.name}
              {connected && (
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--label)", background: "rgba(255,255,255,.10)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "2px 8px" }}>Default</span>
              )}
            </div>
            <div className="card-desc" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#fff" : "rgba(235,235,245,.18)", boxShadow: connected ? "0 0 0 2px rgba(255,255,255,.10)" : "none" }} />
              {connected ? `Connected · ${status.model || provider.defaultModel}` : "Not connected"}
            </div>
          </div>
        </div>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ color: "var(--label-3)", transition: "transform .2s", transform: expanded ? "rotate(180deg)" : "none" }}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)", marginTop: "var(--s-5)", paddingTop: "var(--s-5)", borderTop: "1px solid var(--hairline-soft)" }}>
          {provider.needsBaseUrl && provider.presets && (
            <div className="field">
              <span className="mono-label">Quick presets</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {provider.presets.map((p) => (
                  <button
                    key={p}
                    className="btn btn-secondary"
                    style={{ height: 32, padding: "0 12px", fontSize: 13, fontWeight: 500, borderRadius: 999 }}
                    onClick={() => setDraft({ ...draft, baseUrl: p === "Ollama (local)" ? "http://localhost:11434/v1" : p === "Groq" ? "https://api.groq.com/openai/v1" : "http://localhost:1234/v1" })}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {provider.needsBaseUrl && (
            <div className="field">
              <span className="mono-label">Base URL</span>
              <input className="field-input" placeholder="https://api.example.com/v1" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
            </div>
          )}
          <div className="field">
            <span className="mono-label">Api key</span>
            <input className="field-input" type="password" placeholder="sk-…" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
          </div>
          <div className="field">
            <span className="mono-label">Model</span>
            <input className="field-input" placeholder={provider.defaultModel || "model-id"} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="btn btn-primary" style={{ height: 38, fontSize: 13 }} onClick={() => onSave(draft)}>{connected ? "Update" : "Connect"}</button>
            {connected && (
              <button className="btn btn-text" onClick={onClear}>Remove</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ProviderCard, PROVIDERS });
