// App — top-level state machine.
// stages: splash → welcome → name → presence → connect → home

const STAGE_LABELS = {
  splash:   "INIT · GREETING",
  welcome:  "INIT · GREETING",
  name:     "INIT · IDENTITY",
  presence: "INIT · MORPHOGENESIS",
  connect:  "INIT · COGNITION",
  home:     "RUNTIME · ACTIVE",
};

function App() {
  const [stage, setStage] = React.useState("splash");
  const [aiName, setAiName] = React.useState("");
  const [preset, setPreset] = React.useState("nova");
  const [color, setColor] = React.useState(PRESENCE_COLORS[5]); // frost default — feels neutral
  const [statuses, setStatuses] = React.useState({});
  const [error, setError] = React.useState(null);

  // Sync presence color → CSS var
  React.useEffect(() => {
    document.documentElement.style.setProperty("--avatar-color-rgb", color.rgb);
  }, [color]);

  // Splash → welcome
  React.useEffect(() => {
    if (stage === "splash") {
      const id = setTimeout(() => setStage("welcome"), 3000);
      return () => clearTimeout(id);
    }
  }, [stage]);

  const updateStatus = (id, val) => {
    setStatuses((s) => {
      const next = { ...s };
      if (val == null) delete next[id];
      else next[id] = val;
      return next;
    });
  };

  return (
    <>
      <div className="layer-wallpaper" />
      {stage !== "splash" && <AmbientCanvas />}
      <Hud stage={STAGE_LABELS[stage]} systemReady={stage === "home"} />

      {stage === "splash" && (
        <div className="splash">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s-7)" }}>
            <div className="mark"><HeroRose size={120} /></div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--label-3)" }}>
              The AI-Native Operating System
            </div>
          </div>
        </div>
      )}

      {stage === "welcome" && (
        <Welcome onContinue={() => setStage("name")} />
      )}

      {stage === "name" && (
        <NamePane
          value={aiName}
          onChange={setAiName}
          onContinue={() => setStage("presence")}
          onBack={() => setStage("welcome")}
        />
      )}

      {stage === "presence" && (
        <PresencePane
          preset={preset}
          color={color}
          onPreset={setPreset}
          onColor={setColor}
          onContinue={() => setStage("connect")}
          onBack={() => setStage("name")}
        />
      )}

      {stage === "connect" && (
        <ConnectPane
          statuses={statuses}
          onUpdate={updateStatus}
          error={error}
          onContinue={() => {
            const ok = Object.values(statuses).some((s) => s?.connected);
            if (!ok) {
              setError("Connect at least one provider to continue.");
              return;
            }
            setError(null);
            setStage("home");
          }}
          onBack={() => setStage("presence")}
        />
      )}

      {stage === "home" && (
        <Home ai={aiName || "Atlas"} color={color} presetId={preset} />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
