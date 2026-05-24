// Provider registry — central index that the AI core dispatches through.
//
// To add another provider, drop a module in this directory exporting the same
// shape (id, label, defaultModel, models, signupUrl, needsBaseUrl, async chat),
// then import it here and add to ALL_PROVIDERS. The shell, validator, and
// config code are all driven from this list.

import anthropic from './anthropic.js';
import openai from './openai.js';
import gemini from './gemini.js';
import openaiCompatible from './openai-compatible.js';

export const ALL_PROVIDERS = [anthropic, openai, gemini, openaiCompatible];

const BY_ID = Object.fromEntries(ALL_PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id) {
  return BY_ID[id] || null;
}

/**
 * Public catalog — what the shell uses to render the provider grid.
 * No secrets, just metadata.
 */
export function publicCatalog() {
  return ALL_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    defaultModel: p.defaultModel,
    models: p.models,
    signupUrl: p.signupUrl,
    needsBaseUrl: !!p.needsBaseUrl,
    keyHint: p.keyHint,
    presets: p.presets || null,
  }));
}
