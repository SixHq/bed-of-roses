// PresenceCard — single picker tile in the presence grid.
const PRESENCE_COLORS = [
  { id: "pearl",  hex: "#E8E8EE", rgb: "232,232,238", label: "Pearl" },
  { id: "amber",  hex: "#F5C36B", rgb: "245,195,107", label: "Amber" },
  { id: "ember",  hex: "#F88E66", rgb: "248,142,102", label: "Ember" },
  { id: "bloom",  hex: "#F49EBA", rgb: "244,158,186", label: "Bloom" },
  { id: "aurora", hex: "#8FE5C5", rgb: "143,229,197", label: "Aurora" },
  { id: "frost",  hex: "#A0CBF0", rgb: "160,203,240", label: "Frost" },
  { id: "lilac",  hex: "#C4A8F0", rgb: "196,168,240", label: "Lilac" },
  { id: "onyx",   hex: "#9B9BA5", rgb: "155,155,165", label: "Onyx" },
];

const PRESENCE_PRESETS = [
  { id: "nova",   label: "Nova",   description: "A field of light" },
  { id: "cipher", label: "Cipher", description: "Quiet, attentive" },
  { id: "aria",   label: "Aria",   description: "Flowing, fluid" },
  { id: "echo",   label: "Echo",   description: "Resonant rings" },
];

function PresenceCard({ preset, selected, color, onClick }) {
  return (
    <div className={`card${selected ? " selected" : ""}`} onClick={onClick}>
      <div className="card-row">
        <MemojiCanvas size={68} color={color.rgb} presetId={preset.id} />
        <div>
          <div className="card-name">{preset.label}</div>
          <div className="card-desc">{preset.description}</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PresenceCard, PRESENCE_COLORS, PRESENCE_PRESETS });
