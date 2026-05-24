// <say> handler — presence thought-bubble output.
//
// The handler doesn't synthesize speech. Its job is to hand the parsed
// (tone, decibels, rate, pitch, text) tuple to the client via SSE. The client
// displays it in the presence thought bubble; voice can be re-enabled there.

const ALLOWED_TONES = new Set([
  'neutral', 'warm', 'excited', 'delighted', 'playful', 'curious',
  'calm', 'tender', 'serious', 'thoughtful', 'mysterious', 'whisper',
  'commanding', 'apologetic', 'proud', 'surprised', 'sad', 'amused',
]);

function clamp(n, lo, hi) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;
}

export async function execute(block /* , ctx */) {
  const tone = (block.attrs.tone || 'warm').toLowerCase();
  const safeTone = ALLOWED_TONES.has(tone) ? tone : 'warm';
  const text = (block.body || '').trim();

  const payload = {
    tone: safeTone,
    text,
    decibels: clamp(block.attrs.decibels, 20, 90),
    rate: clamp(block.attrs.rate, 0.5, 2.0),
    pitch: clamp(block.attrs.pitch, 0.5, 1.5),
  };

  return {
    ok: true,
    event: 'say',
    payload,
    // Thought-bubble text is visible UI, not useful next-turn context — keep
    // the echo terse to save tokens. The text itself isn't worth re-quoting.
    llmEcho: text ? `said (${safeTone})` : null,
  };
}

function childBody(block, name) {
  const child = block.children?.find((item) => item.name === name);
  return String(child?.body || '').trim();
}

export async function executeAttemptCompletion(block /* , ctx */) {
  const result = childBody(block, 'result') || String(block.body || '').trim();
  const command = childBody(block, 'command');
  const safeResult = result || 'All set.';

  return {
    ok: true,
    event: 'task_done',
    payload: {
      status: 'complete',
      message: safeResult,
      command: command || null,
    },
    // This is a loop stop signal, not a tool result the model should consume.
    llmEcho: null,
  };
}
