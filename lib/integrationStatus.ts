import { selectProvider } from "../adapters/llm/provider";
import { selectCompressionMode } from "../adapters/compression/provider";
import { isTokenCompanyRemoteReady } from "../adapters/compression/theTokenCompanyCompressor";
import { tokenRouterModel } from "./tokenRouterClient";

export type IntegrationLabel = "enabled" | "fallback mode" | "not configured" | "missing keys";
export type LLMProviderLabel = "anthropic" | "tokenrouter" | "auto" | "fallback";
export type CompressionStatusLabel =
  | "enabled"
  | "local mode"
  | "fallback mode"
  | "disabled";
export type JudgeComparisonStatusLabel = "enabled" | "disabled" | "not eligible";

export interface IntegrationStatus {
  github: IntegrationLabel;
  anthropic: IntegrationLabel;
  tokenrouter: IntegrationLabel;
  tokenrouterModel: string;
  browserbase: IntegrationLabel;
  sentry: IntegrationLabel;
  tokenCompany: CompressionStatusLabel;
  judgeComparison: JudgeComparisonStatusLabel;
  llmProvider: LLMProviderLabel;
  showBandCourt: boolean;
}

export function getIntegrationStatus(): IntegrationStatus {
  const hasGithub = !!process.env.GITHUB_TOKEN;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasTokenRouter = !!process.env.TOKENROUTER_API_KEY;
  const hasBBKey = !!process.env.BROWSERBASE_API_KEY;
  const hasBBProject = !!process.env.BROWSERBASE_PROJECT_ID;
  const hasSentry = !!process.env.SENTRY_DSN;

  let browserbase: IntegrationLabel;
  if (hasBBKey && hasBBProject) {
    browserbase = "enabled";
  } else if (hasBBKey || hasBBProject) {
    browserbase = "missing keys";
  } else {
    browserbase = "fallback mode";
  }

  const activeProvider = selectProvider();
  let llmProvider: LLMProviderLabel;
  if (activeProvider === "anthropic") {
    llmProvider = "anthropic";
  } else if (activeProvider === "tokenrouter") {
    llmProvider = "tokenrouter";
  } else {
    const configured = process.env.LLM_PROVIDER ?? "auto";
    // No active provider — show "auto" if user intended auto, else "fallback"
    llmProvider = configured === "auto" || !configured ? "auto" : "fallback";
  }

  const compressionMode = selectCompressionMode();
  const remoteReady = isTokenCompanyRemoteReady();
  let tokenCompany: CompressionStatusLabel;
  if (compressionMode === "off") {
    tokenCompany = "disabled";
  } else if (compressionMode === "local") {
    tokenCompany = "local mode";
  } else if ((compressionMode === "token-company" || compressionMode === "auto") && remoteReady) {
    // Key + real (non-placeholder) API URL configured — remote will actually be attempted.
    tokenCompany = "enabled";
  } else if (compressionMode === "token-company" && !remoteReady) {
    // Explicitly requested remote but key or real URL is missing — local fallback runs.
    tokenCompany = "fallback mode";
  } else {
    // auto without a real remote configured — local claim-aware compressor runs.
    tokenCompany = "local mode";
  }

  const comparisonOn = (process.env.JUDGE_COMPARISON ?? "off").toLowerCase() === "on";
  let judgeComparison: JudgeComparisonStatusLabel;
  if (!comparisonOn) {
    judgeComparison = "disabled";
  } else if (hasAnthropic && hasTokenRouter) {
    judgeComparison = "enabled";
  } else {
    judgeComparison = "not eligible";
  }

  const showBandCourt = (process.env.SHOW_BAND_COURT ?? "off").toLowerCase() === "on";

  return {
    github: hasGithub ? "enabled" : "fallback mode",
    anthropic: hasAnthropic ? "enabled" : "fallback mode",
    tokenrouter: hasTokenRouter ? "enabled" : "fallback mode",
    tokenrouterModel: tokenRouterModel(),
    browserbase,
    sentry: hasSentry ? "enabled" : "not configured",
    tokenCompany,
    judgeComparison,
    llmProvider,
    showBandCourt,
  };
}
