export interface TokenEstimate {
  estimatedTokens: number;
  chars: number;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): TokenEstimate {
  const chars = text.length;
  const estimatedTokens = chars === 0 ? 0 : Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN));
  return { estimatedTokens, chars };
}

export function estimateTokensFromValue(value: unknown): TokenEstimate {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value ?? "");
  return estimateTokens(serialized ?? "");
}
