// Bed of Roses — Speech synthesis
//
// The AI can wrap spoken content in `<say tone="…" decibels="…">…</say>`.
// We parse the tags out of its response, map the attributes to Web Speech API
// settings (pitch / rate / volume), and queue SpeechSynthesisUtterances.
//
// Web Speech API is supported in every modern browser. iOS/Safari requires a
// user gesture before the first utterance — sendChat() is a click handler, so
// the first speak() call inside that handler will succeed.
//
// Browser TTS does NOT support SSML natively; tones map to numeric voice
// parameters that approximate the requested vibe. Anything outside `<say>`
// tags is treated as silent text (UI / widget / comment).

// Tone presets map an emotional adjective to (pitch, rate, volume) tuples.
// pitch:  0.5 (deep) ↔ 1.5 (high)
// rate:   0.7 (slow / deliberate) ↔ 1.2 (excited / fast)
// volume: 0.0 (silent) ↔ 1.0 (full)
//
// These are the defaults — explicit `decibels` / `rate` / `pitch` attributes
// on the <say> tag override the preset's value.
export const TONE_PRESETS = {
  neutral:    { pitch: 1.00, rate: 1.00, volume: 0.90 },
  warm:       { pitch: 1.00, rate: 0.95, volume: 0.90 },
  excited:    { pitch: 1.20, rate: 1.10, volume: 1.00 },
  delighted:  { pitch: 1.15, rate: 1.05, volume: 0.95 },
  playful:    { pitch: 1.15, rate: 1.05, volume: 0.92 },
  curious:    { pitch: 1.10, rate: 1.00, volume: 0.85 },
  calm:       { pitch: 0.95, rate: 0.90, volume: 0.80 },
  tender:     { pitch: 1.00, rate: 0.85, volume: 0.70 },
  serious:    { pitch: 0.85, rate: 0.95, volume: 0.95 },
  thoughtful: { pitch: 0.95, rate: 0.85, volume: 0.85 },
  mysterious: { pitch: 0.85, rate: 0.85, volume: 0.65 },
  whisper:    { pitch: 0.95, rate: 0.90, volume: 0.30 },
  commanding: { pitch: 0.85, rate: 1.00, volume: 1.00 },
  apologetic: { pitch: 0.95, rate: 0.85, volume: 0.70 },
  proud:      { pitch: 1.05, rate: 0.95, volume: 1.00 },
  surprised:  { pitch: 1.25, rate: 1.05, volume: 1.00 },
  sad:        { pitch: 0.90, rate: 0.85, volume: 0.65 },
  amused:     { pitch: 1.10, rate: 1.00, volume: 0.90 },
};

export const TONE_NAMES = Object.keys(TONE_PRESETS);

/** Map decibels (~20–90) linearly to the Web Speech 0–1 volume range. */
function decibelsToVolume(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return null;
  // 20 dB → 0.05 (barely audible) … 90 dB → 1.0 (full)
  return Math.max(0.05, Math.min(1.0, (n - 20) / 70));
}

/**
 * Parse a string into ordered segments:
 *   { kind: 'spoken' | 'silent', text, tone, pitch, rate, volume }
 *
 * Spoken segments come from `<say …>…</say>` tags. Silent segments are the
 * surrounding text (typically widget commentary or system messages — not
 * meant to be voiced).
 */
export function parseSay(input) {
  if (typeof input !== 'string' || !input.length) return [];
  const segments = [];
  // Match <say ...> ... </say> non-greedy. Attributes optional, any quote style.
  const re = /<say\b([^>]*)>([\s\S]*?)<\/say>/gi;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(input)) !== null) {
    if (m.index > lastIndex) {
      const silent = input.slice(lastIndex, m.index).trim();
      if (silent) segments.push({ kind: 'silent', text: silent });
    }
    segments.push({ kind: 'spoken', ...parseSayAttrs(m[1]), text: m[2].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < input.length) {
    const tail = input.slice(lastIndex).trim();
    if (tail) segments.push({ kind: 'silent', text: tail });
  }
  return segments;
}

function parseSayAttrs(attrStr) {
  const out = { tone: 'neutral', pitch: null, rate: null, volume: null };
  // Match name="value" | name='value' | name=value (no quotes)
  const re = /(\w+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(attrStr || '')) !== null) {
    const name = m[1].toLowerCase();
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim();
    if (name === 'tone' && TONE_PRESETS[value.toLowerCase()]) {
      out.tone = value.toLowerCase();
    } else if (name === 'decibels' || name === 'db') {
      const v = decibelsToVolume(value);
      if (v !== null) out.volume = v;
    } else if (name === 'volume') {
      const v = parseFloat(value);
      if (Number.isFinite(v)) out.volume = Math.max(0, Math.min(1, v));
    } else if (name === 'rate' || name === 'speed') {
      const v = parseFloat(value);
      if (Number.isFinite(v)) out.rate = Math.max(0.5, Math.min(2.0, v));
    } else if (name === 'pitch') {
      const v = parseFloat(value);
      if (Number.isFinite(v)) out.pitch = Math.max(0.5, Math.min(1.5, v));
    }
  }
  return out;
}

/** Resolve a spoken segment to concrete (pitch, rate, volume) values. */
function resolveVoiceParams(seg) {
  const preset = TONE_PRESETS[seg.tone] || TONE_PRESETS.neutral;
  return {
    pitch:  seg.pitch  ?? preset.pitch,
    rate:   seg.rate   ?? preset.rate,
    volume: seg.volume ?? preset.volume,
  };
}

/** Merge adjacent spoken segments that share identical voice params into a
 *  single utterance. Each utterance played as its own SpeechSynthesisUtterance
 *  introduces a small gap; coalescing eliminates those gaps where the AI
 *  intends a continuous beat. */
function coalesceSegments(segments) {
  const out = [];
  for (const seg of segments) {
    if (seg.kind !== 'spoken' || !seg.text) continue;
    const params = resolveVoiceParams(seg);
    const last = out[out.length - 1];
    if (
      last &&
      last.params.pitch === params.pitch &&
      last.params.rate === params.rate &&
      last.params.volume === params.volume
    ) {
      // Same voice — append. Collapse trailing punctuation + whitespace.
      last.text = `${last.text} ${seg.text}`.replace(/\s+/g, ' ').trim();
    } else {
      out.push({ text: seg.text.trim(), params, tone: seg.tone });
    }
  }
  return out;
}

/**
 * Choose the best available voice on this system. Preference tiers:
 *   1. Microsoft Edge "Natural" voices (e.g. "Aria Online (Natural)" — best
 *      quality available in any browser by a wide margin)
 *   2. Apple Siri voices on macOS/iOS (named "Voice 1..4", or known Siri
 *      voice names like "Ava", "Samantha", "Allison" with "Enhanced"/"Premium")
 *   3. Google network voices on Chrome ("Google US English" — much better
 *      than the basic system voices)
 *   4. Any "Premium" / "Enhanced" / "Neural" / "Online" voice we can find
 *   5. Any English voice
 *   6. The first voice the system offers
 *
 * Tier 1 is desktop Edge only. Tier 2 hits modern macOS / iOS. Tier 3 hits
 * Chrome on any platform with internet. The voice falls back gracefully on
 * older systems.
 */
function pickBestVoice(voices) {
  if (!voices || !voices.length) return null;
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  const pool = en.length ? en : voices;

  const find = (re) => pool.find((v) => re.test(v.name));

  // Tier 1 — Edge Natural (these are *the* best web TTS voices)
  let v = find(/Natural/i);
  if (v) return v;

  // Tier 2 — macOS Siri voices. The system voices on modern macOS show up
  // anonymously as "Voice 1".."Voice 4" via Web Speech. Real Siri.
  v = pool.find((vv) => /^Voice \d+$/i.test(vv.name));
  if (v) return v;

  // Tier 2b — known macOS premium/enhanced voice names + iOS Siri-style names
  v = find(/(Ava|Samantha|Allison|Karen|Tom|Daniel|Serena|Moira|Kate|Susan)\s*(?:\(?(?:Enhanced|Premium|Neural)\)?)?/i);
  if (v && /Enhanced|Premium|Neural|Online/i.test(v.name)) return v;

  // Tier 3 — Google network voices on Chrome
  v = pool.find((vv) => /^Google /i.test(vv.name) && vv.localService === false);
  if (v) return v;

  // Tier 4 — anything labelled Premium / Enhanced / Neural / Online
  v = find(/(Premium|Enhanced|Neural|Online)/i);
  if (v) return v;

  // Tier 5 — any "Ava"/"Samantha"-style modern macOS voice (even non-enhanced)
  v = find(/(Ava|Samantha|Allison|Serena)/i);
  if (v) return v;

  // Tier 6 — first English / first voice
  return en[0] || voices[0] || null;
}

class Speaker {
  constructor() {
    this.enabled = true;
    this._voice = null;
    this._voicesLoaded = false;
    this._queue = [];
    this._speaking = false;
    this._current = null;
    this._generation = 0;
    this._loadVoicesWhenReady();
  }

  _loadVoicesWhenReady() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const tryLoad = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return false;
      this._voicesLoaded = true;
      this._voice = pickBestVoice(voices);
      // Log so we can tune — uncomment if you want to see what was available
      // console.log('[speak] voices:', voices.map(v => `${v.name} (${v.lang}${v.localService ? ' local' : ''})`));
      // console.log('[speak] picked:', this._voice?.name, this._voice?.lang);
      return true;
    };
    if (!tryLoad()) {
      window.speechSynthesis.addEventListener('voiceschanged', tryLoad, { once: true });
    }
  }

  /**
   * Speak the spoken segments of an AI response. New calls enqueue behind
   * the current utterance so streamed <say> tags never cut each other off.
   *
   * @param {ReturnType<typeof parseSay>} segments
   * @param {(seg) => void} [onSegmentStart] — called as each spoken seg begins
   * @param {() => void} [onAllDone] — called after the last spoken seg ends
   */
  speak(segments, { onSegmentStart, onAllDone } = {}) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    if (!this.enabled) return false;

    // Coalesce so adjacent same-tone segments don't introduce inter-utterance
    // pauses — Siri-style continuous flow instead of stop-start playback.
    const utterances = coalesceSegments(segments);
    if (utterances.length === 0) {
      onAllDone?.();
      return false;
    }

    this._queue.push({ utterances, index: 0, onSegmentStart, onAllDone });
    this._drainQueue();
    return true;
  }

  _drainQueue() {
    if (this._speaking) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const job = this._queue[0];
    if (!job) return;

    const u = job.utterances[job.index];
    if (!u) {
      this._queue.shift();
      job.onAllDone?.();
      this._drainQueue();
      return;
    }

    const generation = this._generation;
    const utterance = new SpeechSynthesisUtterance(u.text);
    utterance.pitch = u.params.pitch;
    utterance.rate = u.params.rate;
    utterance.volume = u.params.volume;
    if (this._voice) utterance.voice = this._voice;
    utterance.lang = this._voice?.lang || 'en-US';

    const finish = () => {
      if (generation !== this._generation) return;
      this._current = null;
      this._speaking = false;
      job.index += 1;

      if (job.index >= job.utterances.length) {
        this._queue.shift();
        job.onAllDone?.();
      }

      this._drainQueue();
    };

    this._current = utterance;
    this._speaking = true;
    utterance.onstart = () => {
      if (generation === this._generation) job.onSegmentStart?.(u);
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    window.speechSynthesis.speak(utterance);
  }

  isBusy() {
    return this._speaking || this._queue.length > 0;
  }

  cancel() {
    this._generation += 1;
    this._queue = [];
    this._current = null;
    this._speaking = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  setEnabled(on) { this.enabled = !!on; if (!on) this.cancel(); }
}

export const speaker = new Speaker();
