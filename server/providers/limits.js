const DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS = 32768;

export function providerMaxOutputTokens() {
  const value = Number(process.env.BOR_PROVIDER_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS;
  return Math.max(1024, Math.round(value));
}
