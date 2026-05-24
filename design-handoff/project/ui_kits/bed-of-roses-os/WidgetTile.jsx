// WidgetTile — generated widget on the home grid. Each tile has a synthetic body.

function WeatherBody() {
  return (
    <div className="tile-body">
      <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>18°</div>
      <div style={{ fontSize: 13, color: "var(--label-2)" }}>Partly cloudy · Lagos</div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        {["M","T","W","T","F"].map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--label-3)", fontFamily: "var(--font-mono)", letterSpacing: ".12em" }}>{d}</span>
            <span style={{ fontSize: 13 }}>{[19,21,18,17,20][i]}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlightBody() {
  return (
    <div className="tile-body">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.014em" }}>LOS</div>
          <div style={{ fontSize: 11, color: "var(--label-3)", fontFamily: "var(--font-mono)", letterSpacing: ".16em", marginTop: 2 }}>14:30</div>
        </div>
        <div style={{ flex: 1, position: "relative", margin: "10px 14px 0", height: 18 }}>
          <div style={{ position: "absolute", inset: "8px 0 8px 0", borderTop: "1px dashed var(--hairline-strong)" }} />
          <div style={{ position: "absolute", left: "55%", top: "50%", transform: "translate(-50%,-50%) rotate(45deg)", color: "var(--label)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5C13 2.7 12.3 2 11.5 2S10 2.7 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1L15 22v-1.5L13 19v-5.5l8 2.5z"/></svg>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.014em" }}>LHR</div>
          <div style={{ fontSize: 11, color: "var(--label-3)", fontFamily: "var(--font-mono)", letterSpacing: ".16em", marginTop: 2 }}>20:45</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--label-2)", marginTop: "auto" }}>BA76 · On time · Gate D7</div>
    </div>
  );
}

function CalendarBody() {
  return (
    <div className="tile-body">
      <div style={{ fontSize: 13, color: "var(--label-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { t: "10:00", n: "Standup" },
          { t: "13:00", n: "Lunch · Maya" },
          { t: "16:30", n: "Design review" },
        ].map((e) => (
          <div key={e.t} style={{ display: "flex", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", color: "var(--label-3)", width: 48 }}>{e.t}</span>
            <span style={{ color: "var(--label)" }}>{e.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesBody() {
  return (
    <div className="tile-body" style={{ justifyContent: "flex-end" }}>
      <div style={{ fontSize: 14, color: "var(--label)", lineHeight: 1.5, letterSpacing: "-.005em" }}>
        Plant the seed of the system, then let it grow. Each widget is the trace of a question.
      </div>
    </div>
  );
}

const WIDGET_BODIES = { weather: WeatherBody, flight: FlightBody, calendar: CalendarBody, notes: NotesBody };

function WidgetTile({ widget, onClick }) {
  const Body = WIDGET_BODIES[widget.kind] || NotesBody;
  return (
    <div className="tile" style={{ gridColumn: widget.span === 2 ? "span 2" : undefined }} onClick={onClick}>
      <div className="tile-name">{widget.name}</div>
      <div className="tile-meta">{widget.kind}</div>
      <Body />
    </div>
  );
}

Object.assign(window, { WidgetTile, WIDGET_BODIES });
