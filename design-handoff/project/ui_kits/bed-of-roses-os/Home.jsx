// Home — final destination after onboarding. Empty greeting, chat bar, avatar in corner,
// widgets accumulate as the user "asks" things.

const SAMPLE_WIDGETS = [
  { match: /weather|forecast|temp/i, kind: "weather", name: "Weather", span: 1 },
  { match: /flight|fly|airport|trip/i, kind: "flight", name: "Flight Tracker", span: 2 },
  { match: /calendar|schedule|today|meeting/i, kind: "calendar", name: "Today", span: 1 },
  { match: /note|remember|jot|idea/i, kind: "notes", name: "Notes", span: 2 },
];

function Home({ ai, color, presetId, onOpenSettings }) {
  const [widgets, setWidgets] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const [log, setLog] = React.useState([]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setLog((l) => [...l, { role: "user", text }]);
    setDraft("");

    const match = SAMPLE_WIDGETS.find((w) => w.match.test(text)) || SAMPLE_WIDGETS[3];
    setTimeout(() => {
      setLog((l) => [...l, { role: "ai", text: `Saved as ${match.name}.` }]);
      setWidgets((ws) => {
        if (ws.find((w) => w.kind === match.kind)) return ws;
        return [...ws, { ...match, id: Date.now() }];
      });
    }, 700);
  };

  const empty = widgets.length === 0;

  return (
    <div className="layer-screen" style={{ pointerEvents: empty ? "none" : "auto" }}>
      <div className="avatar-corner" style={{ pointerEvents: "auto" }}>
        <MemojiCanvas size={empty ? 220 : 84} color={color.rgb} presetId={presetId} />
      </div>

      {empty && (
        <div className="home-empty">
          <div className="home-greeting">I'm {ai}. Tell me what you need.</div>
          <div className="home-hint">Try: "Track my flight from Lagos to London"</div>
        </div>
      )}

      {!empty && (
        <div className="widget-grid" style={{ pointerEvents: "auto" }}>
          {widgets.map((w) => <WidgetTile key={w.id} widget={w} />)}
        </div>
      )}

      {log.length > 0 && (
        <div className="chat-log" style={{ pointerEvents: "auto" }}>
          {log.slice(-4).map((m, i) => (
            <div key={i} className={`bubble bubble-${m.role}`}>{m.text}</div>
          ))}
        </div>
      )}

      <div style={{ pointerEvents: "auto" }}>
        <ChatBar value={draft} onChange={setDraft} onSubmit={send} color={color.rgb} presetId={presetId} />
      </div>
    </div>
  );
}

Object.assign(window, { Home });
