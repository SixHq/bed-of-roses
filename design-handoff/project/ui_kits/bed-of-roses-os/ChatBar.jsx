// ChatBar — frosted pill, sticky bottom. The send control is the persona.
function ChatBar({ value, onChange, onSubmit, color = "196,168,240", presetId = "nova", busy = false, speaking = false, placeholder = "Ask. Or describe what you need." }) {
  return (
    <form
      className={`chat-bar${busy ? " busy" : ""}${speaking ? " speaking" : ""}`}
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(); }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      <button className="chat-send" type="submit" disabled={!value.trim()} aria-label="Send">
        <MemojiCanvas size={30} color={color} presetId={presetId} />
        <span className="persona-loader" aria-hidden="true" />
      </button>
    </form>
  );
}

Object.assign(window, { ChatBar });
