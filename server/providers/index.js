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
import bor from './bor.js';

// `bor` (Bed of Roses credits) is first-class alongside the BYO providers
// (provider-parity rule). Onboarding surfaces it first as the credits option.
export const ALL_PROVIDERS = [bor, anthropic, openai, gemini, openaiCompatible];

const BY_ID = Object.fromEntries(ALL_PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id) {
  return BY_ID[id] || null;
}

/**
 * Public catalog — what the shell uses to render the provider grid.
 * No secrets, just metadata.
 */
export function publicCatalog() {
  // TEMPORARILY hide the `bor` (BOR credits) provider from the onboarding
  // grid and the model picker until the credits system ships. The provider
  // stays registered in ALL_PROVIDERS so getProvider() still resolves it for
  // any existing config. Restore by swapping the filtered line back to the
  // original below. Do not delete.
  // return ALL_PROVIDERS.map((p) => ({           // ← original (restore this)
  return ALL_PROVIDERS.filter((p) => !p.isBorCredits).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    defaultModel: p.defaultModel,
    models: p.models,
    signupUrl: p.signupUrl,
    needsBaseUrl: !!p.needsBaseUrl,
    keyHint: p.keyHint,
    presets: p.presets || null,
    isBorCredits: !!p.isBorCredits,
  }));
}
