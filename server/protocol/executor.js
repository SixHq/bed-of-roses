// Executor — given a parsed tag block + a context object, invokes the
// registered handler and returns its result.
//
// The context object is built per-request by /api/chat and carries:
//   • saveWidget, editWidget, deleteWidget, renameWidget — widget IO from index.js
//   • loadConfig, saveConfig, mergeConfig, publicConfig — config IO from index.js
//   • audit — append-only audit logger
//   • autoBannerThumbnail — fallback banner SVG generator from ai.js
//   • lastUserMessage — the most recent user prompt (for sourcePrompt on widget creates)
//
// Handler results have the shape:
//   { ok, event, payload, llmEcho }
//
// `event` is the SSE event name to emit to the client. `llmEcho` is appended
// to the assistant turn's recorded history so the next LLM call has a
// structured tool_result for each action.

import { TAGS, isTopLevelTag } from './registry.js';
import { isRetryableFailureMessage, retryAttemptsEnv, retryDelayMs, sleep } from '../retry.js';

// 2 attempts max — one shot + one retry for truly transient errors (network
// blip, 5xx, rate limit). Permanent errors (ENOENT, 4xx, validation) skip
// retries entirely via isRetryableFailureMessage. 10 was the old default
// inherited from the chat-loop retry budget; for user-facing tool calls
// where the LLM is waiting on the result and will adapt, 10 retries just
// floods the log with `attempt N/10 failed: ENOENT...; retrying` lines.
const TOOL_MAX_ATTEMPTS = retryAttemptsEnv('BOR_TOOL_MAX_ATTEMPTS', 2);

function resultReason(result) {
  return result?.payload?.reason || result?.llmEcho || 'tool returned an error';
}

function shouldRetryToolResult(result) {
  return result?.ok === false && result?.event === 'tool_error' && isRetryableFailureMessage(resultReason(result));
}

export async function executeBlock(block, ctx) {
  if (block.kind !== 'tag' || !isTopLevelTag(block.name)) {
    return null; // ignore text blocks and structural-only tags
  }
  const def = TAGS[block.name];
  let lastError = null;
  for (let attempt = 0; attempt < TOOL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const out = await def.execute(block, ctx);
      if (!out) return null;
      if (!shouldRetryToolResult(out) || attempt >= TOOL_MAX_ATTEMPTS - 1) {
        return out;
      }
      const reason = resultReason(out);
      await ctx.audit({ kind: 'tool.retry', tag: block.name, reason, attempt: attempt + 1, maxAttempts: TOOL_MAX_ATTEMPTS });
      console.warn(`[tool] ${block.name} attempt ${attempt + 1}/${TOOL_MAX_ATTEMPTS} failed: ${reason}; retrying`);
      await sleep(retryDelayMs(attempt));
    } catch (e) {
      lastError = e;
      if (attempt >= TOOL_MAX_ATTEMPTS - 1 || !isRetryableFailureMessage(e)) {
        break;
      }
      await ctx.audit({ kind: 'tool.retry', tag: block.name, reason: e.message, attempt: attempt + 1, maxAttempts: TOOL_MAX_ATTEMPTS });
      console.warn(`[tool] ${block.name} attempt ${attempt + 1}/${TOOL_MAX_ATTEMPTS} crashed: ${e.message}; retrying`);
      await sleep(retryDelayMs(attempt));
    }
  }

  const reason = lastError?.message || 'tool failed after retries';
  // Handler should never throw, but if it does, surface it cleanly.
  await ctx.audit({ kind: 'tool.error', tag: block.name, reason, attempts: TOOL_MAX_ATTEMPTS });
  return {
    ok: false,
    event: 'tool_error',
    payload: { tag: block.name, reason },
    llmEcho: `${block.name} crashed: ${reason}`,
  };
}

/**
 * Format the accumulated llmEcho strings into a single <tool_results> block
 * to append to the assistant's recorded turn. Mirrors Sixth's
 * <function_results> wrapper.
 */
export function formatToolResults(echoes) {
  const cleaned = echoes.filter((s) => s && typeof s === 'string');
  if (cleaned.length === 0) return '';
  const inner = cleaned.map((s) => `<tool_result>${s}</tool_result>`).join('\n');
  return `<tool_results>\n${inner}\n</tool_results>`;
}
