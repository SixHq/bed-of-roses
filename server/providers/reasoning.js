const DEFAULT_REASONING_EFFORT = 'high';
const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

// Effort resolution order: per-request override (the per-provider `reasoning`
// value saved from onboarding) → BOR_PROVIDER_REASONING_EFFORT env → default.
function configuredReasoningEffort(override) {
  const fromOverride = String(override || '').trim().toLowerCase();
  if (REASONING_EFFORTS.includes(fromOverride)) return fromOverride;
  const value = String(process.env.BOR_PROVIDER_REASONING_EFFORT || DEFAULT_REASONING_EFFORT).trim().toLowerCase();
  if (REASONING_EFFORTS.includes(value)) return value;
  return DEFAULT_REASONING_EFFORT;
}

export function providerReasoningEffort(effort) {
  return configuredReasoningEffort(effort);
}

function modelText(model) {
  return String(model || '').trim().toLowerCase();
}

function isOpenAiXhighModel(model) {
  const m = modelText(model);
  return /\bcodex\b/.test(m)
    || /^gpt-5\.[1-9]/.test(m)
    || /^gpt-5-[1-9]/.test(m)
    || /^gpt-5\.5/.test(m)
    || /^gpt-5\.4/.test(m)
    || /^chat-latest\b/.test(m);
}

function isDeepSeekMaxModel(model) {
  const m = modelText(model);
  return m.includes('deepseek') && (m.includes('v4') || m.includes('reason') || m.includes('thinking') || m.includes('r1'));
}

export function openAiMaxReasoningEffort(model, effort) {
  const configured = configuredReasoningEffort(effort);
  if (configured === 'max') return isOpenAiXhighModel(model) ? 'xhigh' : 'high';
  if (configured === 'xhigh') return 'xhigh';
  return configured;
}

export function openRouterMaxReasoningEffort(effort) {
  const configured = configuredReasoningEffort(effort);
  return configured === 'max' ? 'xhigh' : configured;
}

export function openAiCompatibleMaxReasoningEffort(model, effort) {
  const configured = configuredReasoningEffort(effort);
  if (isDeepSeekMaxModel(model) && (configured === 'max' || configured === 'xhigh')) return 'max';
  if (configured === 'max') return isOpenAiXhighModel(model) ? 'xhigh' : 'high';
  return configured;
}

export function anthropicMaxEffort(effort) {
  return configuredReasoningEffort(effort);
}

export function providerThinkingBudgetTokens(model) {
  const m = modelText(model);
  const defaultBudget = m.includes('2.5-pro') ? 32_768 : 24_576;
  const value = Number(process.env.BOR_PROVIDER_THINKING_BUDGET_TOKENS);
  if (!Number.isFinite(value) || value <= 0) return defaultBudget;
  return Math.max(1024, Math.round(value));
}

export function openAiReasoningParams(model, effort) {
  return { reasoning_effort: openAiMaxReasoningEffort(model, effort) };
}

export function openAiCompatibleReasoningParams(model, effort) {
  return { reasoning_effort: openAiCompatibleMaxReasoningEffort(model, effort) };
}

export function openRouterReasoningParams(model, effort) {
  return { reasoning: { effort: openRouterMaxReasoningEffort(effort) } };
}

export function anthropicReasoningParams(effort) {
  const level = configuredReasoningEffort(effort);
  if (level === 'none') return {};
  return {
    thinking: { type: 'adaptive' },
    output_config: { effort: level },
  };
}

export function geminiThinkingConfig(model, effort, { includeThoughts = false } = {}) {
  const m = modelText(model);
  const level = configuredReasoningEffort(effort);
  const thoughts = includeThoughts && level !== 'none' ? { includeThoughts: true } : {};
  if (/^gemini-3/.test(m)) {
    const thinkingLevel = ['none', 'minimal', 'low'].includes(level) ? 'low' : 'high';
    return { thinkingLevel, ...thoughts };
  }
  // 2.5 Pro cannot fully disable thinking — its minimum budget is 128.
  if (level === 'none') return { thinkingBudget: m.includes('2.5-pro') ? 128 : 0 };
  const budget = providerThinkingBudgetTokens(model);
  const scaled = level === 'minimal' || level === 'low'
    ? Math.min(budget, 8192)
    : level === 'medium'
    ? Math.min(budget, 16_384)
    : budget;
  return { thinkingBudget: scaled, ...thoughts };
}
