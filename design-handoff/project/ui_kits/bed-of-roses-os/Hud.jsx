// Hud — diegetic four-corner telemetry, present everywhere except splash.
function Hud({ stage = "INIT · IDENTITY", time = "14:32:08", node = "N7-A1", systemReady = false }) {
  // Live clock
  const [now, setNow] = React.useState(time);
  React.useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      setNow(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="layer-hud">
      <div className="hud-cell hud-tl">
        <span className="tick" style={{ animationDelay: "0ms" }}>●</span>
        <span>Bed · Of · Roses</span>
        <span className="meta">{now}</span>
      </div>
      <div className="hud-cell hud-tr">
        <span>v0.3 · Brainstem</span>
        <span className="meta">{node}</span>
      </div>
      <div className="hud-cell hud-bl">
        <span>{stage}</span>
      </div>
      <div className="hud-cell hud-br">
        <span>{systemReady ? "System Ready" : "Awaiting Input"}</span>
        <span className="tick" style={{ animationDelay: "600ms" }}>◐</span>
      </div>
    </div>
  );
}

Object.assign(window, { Hud });
