export type ActiveProvider = "anthropic" | "tokenrouter" | "none";

export function selectProvider(): ActiveProvider {
  const configured = process.env.LLM_PROVIDER ?? "auto";
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasTokenRouter = !!process.env.TOKENROUTER_API_KEY;

  if (configured === "tokenrouter") return hasTokenRouter ? "tokenrouter" : "none";
  if (configured === "anthropic") return hasAnthropic ? "anthropic" : "none";
  // auto or unrecognized value (including "openai"): prefer TokenRouter, then Anthropic, then none
  if (hasTokenRouter) return "tokenrouter";
  if (hasAnthropic) return "anthropic";
  return "none";
}
