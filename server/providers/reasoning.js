const DEFAULT_REASONING_EFFORT = 'max';

function configuredReasoningEffort() {
  const value = String(process.env.BOR_PROVIDER_REASONING_EFFORT || DEFAULT_REASONING_EFFORT).trim().toLowerCase();
  if (['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)) return value;
  return DEFAULT_REASONING_EFFORT;
}

export function providerReasoningEffort() {
  return configuredReasoningEffort();
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

export function openAiMaxReasoningEffort(model) {
  const configured = configuredReasoningEffort();
  if (configured === 'max') return isOpenAiXhighModel(model) ? 'xhigh' : 'high';
  if (configured === 'xhigh') return 'xhigh';
  return configured;
}

export function openRouterMaxReasoningEffort() {
  const configured = configuredReasoningEffort();
  return configured === 'max' ? 'xhigh' : configured;
}

export function openAiCompatibleMaxReasoningEffort(model) {
  const configured = configuredReasoningEffort();
  if (isDeepSeekMaxModel(model) && (configured === 'max' || configured === 'xhigh')) return 'max';
  if (configured === 'max') return isOpenAiXhighModel(model) ? 'xhigh' : 'high';
  return configured;
}

export function anthropicMaxEffort() {
  return configuredReasoningEffort();
}

export function providerThinkingBudgetTokens(model) {
  const m = modelText(model);
  const defaultBudget = m.includes('2.5-pro') ? 32_768 : 24_576;
  const value = Number(process.env.BOR_PROVIDER_THINKING_BUDGET_TOKENS);
  if (!Number.isFinite(value) || value <= 0) return defaultBudget;
  return Math.max(1024, Math.round(value));
}

export function openAiReasoningParams(model) {
  return { reasoning_effort: openAiMaxReasoningEffort(model) };
}

export function openAiCompatibleReasoningParams(model) {
  return { reasoning_effort: openAiCompatibleMaxReasoningEffort(model) };
}

export function openRouterReasoningParams() {
  return { reasoning: { effort: openRouterMaxReasoningEffort() } };
}

export function anthropicReasoningParams() {
  return {
    thinking: { type: 'adaptive' },
    output_config: { effort: anthropicMaxEffort() },
  };
}

export function geminiThinkingConfig(model) {
  const m = modelText(model);
  if (/^gemini-3/.test(m)) return { thinkingLevel: 'high' };
  return { thinkingBudget: providerThinkingBudgetTokens(model) };
}
