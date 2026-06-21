import type { LLMJudgeInput, LLMJudgeInputClaim } from "../adapters/llm/types";
import type {
  CompressedEvidenceContext,
  CompressionMetadata,
  PreservedSignals,
} from "../adapters/compression/types";
import { estimateTokens } from "../lib/tokenEstimate";

const UNSAFE_WORDS = ["fake", "lying", "scam", "fraud", "deceptive"];

const RAW_TO_CODE: Record<string, string> = {
  source_file: "SRC",
  package_json: "DEP",
  file_tree: "PATH",
  readme: "README",
  absence: "MISS",
};

const CODE_PRIORITY: Record<string, number> = {
  SRC: 0,
  DEP: 1,
  PATH: 2,
  README: 3,
  MISS: 4,
};

const MAX_EVIDENCE_PER_CLAIM = 6;
const MAX_SRC_LINE_CHARS = 140;
const MAX_DEP_CHARS = 100;
const MAX_PATH_CHARS = 90;
const MAX_README_CHARS = 110;
const MAX_MISS_CHARS = 120;

interface EvidenceItem {
  text: string;
  source: string;
  positive: boolean;
}

function codeForSource(raw: string): string {
  return RAW_TO_CODE[raw] ?? raw.toUpperCase().slice(0, 6);
}

function safeText(text: string): string {
  let cleaned = text;
  for (const word of UNSAFE_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    cleaned = cleaned.replace(re, "[redacted]");
  }
  return cleaned;
}

const FILE_PATH_RE =
  /(?:[a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+|[a-zA-Z0-9_.-]+\.(?:ts|tsx|js|jsx|py|json|md|yml|yaml|toml|cfg|txt|sh|go|rs|java|kt|swift|rb|php|html|css)/g;

function extractFilePaths(text: string): string[] {
  const paths = new Set<string>();
  const matches = text.match(FILE_PATH_RE);
  if (matches) {
    for (const m of matches) paths.add(m);
  }
  return Array.from(paths);
}

function squashWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " | ").trim();
}

const FILLER_RE = /\b(?:has(?:\s+a)?|have|the|is|are|was|were|been|with|that|which|found(?:\s+in)?|present(?:\s+in)?|in\s+the|appears?\s+to\s+(?:be|have)|seems\s+to|looks?\s+like|appears?\s+in)\b/gi;
const REDUNDANT_PHRASES_RE = /\b(?:package\.json\s+(?:has|contains)|repository|repo)\s+/gi;

function stripFiller(text: string): string {
  return text.replace(REDUNDANT_PHRASES_RE, "").replace(FILLER_RE, "").replace(/\s{2,}/g, " ").trim();
}

function dedupeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface ClaimKeywordContext {
  keywords: string[];
  matchRe: RegExp | null;
}

function buildKeywordContext(claim: string, detector: string): ClaimKeywordContext {
  const keywords = `${claim} ${detector}`
    .toLowerCase()
    .split(/[^a-z0-9@]+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);

  const escaped = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter((k) => k.length > 0);
  const matchRe = escaped.length > 0 ? new RegExp(`(?:${escaped.join("|")})`, "i") : null;
  return { keywords, matchRe };
}

function pickBestLine(text: string, ctx: ClaimKeywordContext): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return text.trim();
  if (lines.length === 1) return lines[0];

  let best = lines[0];
  let bestScore = -1;
  for (const line of lines) {
    let score = 0;
    const lower = line.toLowerCase();
    if (ctx.matchRe && ctx.matchRe.test(line)) score += 3;
    if (/import |from |require\(|@\w+\//.test(line)) score += 2;
    if (/agent|orchestrat|stream|embed|vector|mcp|whisper|deepgram|yolo|opencv|cv2|websocket|sse|model_context|tool_call/i.test(lower)) score += 2;
    if (line.length < 200) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best;
}

function shrinkSourceSnippet(text: string, ctx: ClaimKeywordContext): string {
  const filePaths = extractFilePaths(text);
  const headPath = filePaths[0];
  const body = pickBestLine(text, ctx);
  const squashed = squashWhitespace(body);
  const trimmedBody =
    squashed.length > MAX_SRC_LINE_CHARS ? squashed.slice(0, MAX_SRC_LINE_CHARS) + "…" : squashed;
  if (headPath && !trimmedBody.includes(headPath)) {
    return `${headPath}: ${trimmedBody}`;
  }
  return trimmedBody;
}

function shrinkDepText(text: string): string {
  const compact = stripFiller(squashWhitespace(text));
  return compact.length > MAX_DEP_CHARS ? compact.slice(0, MAX_DEP_CHARS) + "…" : compact;
}

function shrinkPathText(text: string): string {
  const paths = extractFilePaths(text);
  if (paths.length > 0) {
    const joined = paths.slice(0, 4).join(", ");
    return joined.length > MAX_PATH_CHARS ? joined.slice(0, MAX_PATH_CHARS) + "…" : joined;
  }
  const compact = stripFiller(squashWhitespace(text));
  return compact.length > MAX_PATH_CHARS ? compact.slice(0, MAX_PATH_CHARS) + "…" : compact;
}

function shrinkReadmeText(text: string, claim: string): string {
  let compact = stripFiller(squashWhitespace(text));
  compact = compact.replace(/^readme\s*(?:mentions?|says?|describes?|notes?)?\s*:?\s*/i, "");
  if (compact.length === 0) compact = squashWhitespace(text);
  if (compact.length > MAX_README_CHARS) {
    const claimLower = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const lowered = compact.toLowerCase();
    let bestIdx = -1;
    for (const k of claimLower) {
      const idx = lowered.indexOf(k);
      if (idx >= 0) {
        bestIdx = idx;
        break;
      }
    }
    if (bestIdx > 30) {
      const start = Math.max(0, bestIdx - 20);
      return "…" + compact.slice(start, start + MAX_README_CHARS) + "…";
    }
    return compact.slice(0, MAX_README_CHARS) + "…";
  }
  return compact;
}

function shrinkMissText(text: string): string {
  const compact = stripFiller(squashWhitespace(text)).replace(/^no\s+/i, "no ");
  return compact.length > MAX_MISS_CHARS ? compact.slice(0, MAX_MISS_CHARS) + "…" : compact;
}

function collapseReadmeItems(items: EvidenceItem[], claim: string): EvidenceItem[] {
  if (items.length === 0) return [];

  const positives: string[] = [];
  const negatives: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const shrunk = shrinkReadmeText(item.text, claim);
    const key = dedupeKey(shrunk);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (item.positive ? positives : negatives).push(shrunk);
  }

  const out: EvidenceItem[] = [];
  if (positives.length > 0) {
    const joined = positives.slice(0, 3).join(" | ");
    const text =
      positives.length > 1
        ? `mentions x${positives.length}: ${joined}`
        : positives[0];
    out.push({ source: "README", positive: true, text });
  }
  if (negatives.length > 0) {
    const joined = negatives.slice(0, 2).join(" | ");
    const text =
      negatives.length > 1
        ? `gaps x${negatives.length}: ${joined}`
        : negatives[0];
    out.push({ source: "README", positive: false, text });
  }
  return out;
}

function collapseMissItems(items: EvidenceItem[]): EvidenceItem[] {
  if (items.length === 0) return [];

  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const shrunk = shrinkMissText(item.text);
    const key = dedupeKey(shrunk);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    phrases.push(shrunk);
  }
  if (phrases.length === 0) return [];
  if (phrases.length === 1) {
    return [{ source: "MISS", positive: false, text: phrases[0] }];
  }
  const joined = phrases.slice(0, 4).join("; ");
  return [
    {
      source: "MISS",
      positive: false,
      text: `x${phrases.length}: ${joined}`,
    },
  ];
}

function shrinkAndDedupe(
  items: EvidenceItem[],
  shrink: (e: EvidenceItem) => string,
  source: string,
): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const item of items) {
    const text = shrink(item);
    const key = `${item.positive ? "+" : "-"}|${dedupeKey(text)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ source, positive: item.positive, text });
  }
  return out;
}

interface CompressedClaim {
  evidence: EvidenceItem[];
  filePaths: string[];
}

function ensureBalance(items: EvidenceItem[], original: EvidenceItem[]): EvidenceItem[] {
  const hasOriginalPositive = original.some((e) => e.positive);
  const hasOriginalNegative = original.some((e) => !e.positive);
  const hasCompressedPositive = items.some((e) => e.positive);
  const hasCompressedNegative = items.some((e) => !e.positive);

  const out = [...items];

  if (hasOriginalPositive && !hasCompressedPositive) {
    const first = original.find((e) => e.positive);
    if (first) {
      out.push({
        source: codeForSource(first.source),
        positive: true,
        text:
          first.text.length > MAX_DEP_CHARS
            ? first.text.slice(0, MAX_DEP_CHARS) + "…"
            : first.text,
      });
    }
  }
  if (hasOriginalNegative && !hasCompressedNegative) {
    const first = original.find((e) => !e.positive);
    if (first) {
      out.push({
        source: codeForSource(first.source),
        positive: false,
        text:
          first.text.length > MAX_MISS_CHARS
            ? first.text.slice(0, MAX_MISS_CHARS) + "…"
            : first.text,
      });
    }
  }
  return out;
}

function compressClaimEvidence(claim: LLMJudgeInputClaim): CompressedClaim {
  const original = claim.evidence;
  const ctx = buildKeywordContext(claim.claim, claim.detector);
  const filePaths = new Set<string>();

  const bySource: Record<string, EvidenceItem[]> = {
    source_file: [],
    package_json: [],
    file_tree: [],
    readme: [],
    absence: [],
  };
  for (const e of original) {
    const bucket = bySource[e.source];
    if (bucket) bucket.push(e);
    else (bySource[e.source] ||= []).push(e);
  }

  const srcItems = shrinkAndDedupe(
    bySource.source_file ?? [],
    (e) => {
      extractFilePaths(e.text).forEach((p) => filePaths.add(p));
      return shrinkSourceSnippet(e.text, ctx);
    },
    "SRC",
  );

  const depItems = shrinkAndDedupe(
    bySource.package_json ?? [],
    (e) => shrinkDepText(e.text),
    "DEP",
  );

  const pathItems = shrinkAndDedupe(
    bySource.file_tree ?? [],
    (e) => {
      extractFilePaths(e.text).forEach((p) => filePaths.add(p));
      return shrinkPathText(e.text);
    },
    "PATH",
  );

  const readmeItems = collapseReadmeItems(bySource.readme ?? [], claim.claim);
  const missItems = collapseMissItems(bySource.absence ?? []);

  const ordered: EvidenceItem[] = [...srcItems, ...depItems, ...pathItems, ...readmeItems, ...missItems];
  ordered.sort((a, b) => (CODE_PRIORITY[a.source] ?? 9) - (CODE_PRIORITY[b.source] ?? 9));

  const capped: EvidenceItem[] = [];
  let positiveKept = 0;
  let negativeKept = 0;
  const originalHasPositive = original.some((e) => e.positive);
  const originalHasNegative = original.some((e) => !e.positive);

  for (const item of ordered) {
    if (capped.length >= MAX_EVIDENCE_PER_CLAIM) break;
    capped.push(item);
    if (item.positive) positiveKept++;
    else negativeKept++;
  }

  // If cap kicked in and dropped the only positive/negative item, swap one back in
  if (originalHasPositive && positiveKept === 0) {
    const candidate = ordered.find((e) => e.positive);
    if (candidate) {
      capped.pop();
      capped.push(candidate);
    }
  }
  if (originalHasNegative && negativeKept === 0) {
    const candidate = ordered.find((e) => !e.positive);
    if (candidate) {
      capped.pop();
      capped.push(candidate);
    }
  }

  const balanced = ensureBalance(capped, original);

  if (balanced.length === 0) {
    return {
      evidence: [
        {
          source: "MISS",
          positive: false,
          text: "no evidence recorded",
        },
      ],
      filePaths: Array.from(filePaths),
    };
  }

  return { evidence: balanced, filePaths: Array.from(filePaths) };
}

function buildPreservedSignals(
  compressedClaims: LLMJudgeInputClaim[],
  filePathSet: Set<string>,
): PreservedSignals {
  let positive = 0;
  let negative = 0;
  let sourceFiles = 0;
  let packageJsonItems = 0;
  let readmeItems = 0;
  let absenceItems = 0;
  let fileTreeItems = 0;

  for (const c of compressedClaims) {
    for (const e of c.evidence) {
      if (e.positive) positive++;
      else negative++;
      if (e.source === "SRC") sourceFiles++;
      else if (e.source === "DEP") packageJsonItems++;
      else if (e.source === "README") readmeItems++;
      else if (e.source === "MISS") absenceItems++;
      else if (e.source === "PATH") fileTreeItems++;
    }
  }

  return {
    claims: compressedClaims.length,
    positiveEvidence: positive,
    negativeEvidence: negative,
    sourceFiles,
    packageJsonItems,
    readmeItems,
    absenceItems,
    fileTreeItems,
    uniqueFilePaths: filePathSet.size,
  };
}

export function compressEvidenceContextLocal(input: LLMJudgeInput): CompressedEvidenceContext {
  const rawText = JSON.stringify(input);
  const raw = estimateTokens(rawText);

  const filePathSet = new Set<string>();

  const compressedClaims: LLMJudgeInputClaim[] = input.claims.map((c) => {
    const { evidence, filePaths } = compressClaimEvidence(c);
    filePaths.forEach((p) => filePathSet.add(p));

    const safeEvidence: EvidenceItem[] = evidence.map((e) => ({
      source: e.source,
      positive: e.positive,
      text: safeText(e.text),
    }));

    return {
      id: c.id,
      detector: c.detector,
      claim: c.claim,
      score: c.score,
      evidence: safeEvidence,
    };
  });

  const compressedInput: LLMJudgeInput = {
    claims: compressedClaims,
    scanSource: input.scanSource,
    repoUnavailable: input.repoUnavailable,
  };

  const compressedText = JSON.stringify(compressedInput);
  const compressed = estimateTokens(compressedText);

  const compressionRatio =
    raw.estimatedTokens === 0
      ? 1
      : Number((compressed.estimatedTokens / raw.estimatedTokens).toFixed(3));
  const percentReduction =
    raw.estimatedTokens === 0
      ? 0
      : Math.max(
          0,
          Math.round(((raw.estimatedTokens - compressed.estimatedTokens) / raw.estimatedTokens) * 100),
        );

  const metadata: CompressionMetadata = {
    source: "local-claim-aware",
    rawEstimatedTokens: raw.estimatedTokens,
    compressedEstimatedTokens: compressed.estimatedTokens,
    rawChars: raw.chars,
    compressedChars: compressed.chars,
    compressionRatio,
    percentReduction,
    preservedSignals: buildPreservedSignals(compressedClaims, filePathSet),
    fallbackUsed: false,
  };

  return { compressedInput, compressedText, metadata };
}

export function disabledCompressionContext(input: LLMJudgeInput): CompressedEvidenceContext {
  const text = JSON.stringify(input);
  const est = estimateTokens(text);
  return {
    compressedInput: input,
    compressedText: text,
    metadata: {
      source: "disabled",
      rawEstimatedTokens: est.estimatedTokens,
      compressedEstimatedTokens: est.estimatedTokens,
      rawChars: est.chars,
      compressedChars: est.chars,
      compressionRatio: 1,
      percentReduction: 0,
      preservedSignals: {
        claims: input.claims.length,
        positiveEvidence: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => e.positive).length,
          0,
        ),
        negativeEvidence: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => !e.positive).length,
          0,
        ),
        sourceFiles: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => e.source === "source_file").length,
          0,
        ),
        packageJsonItems: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => e.source === "package_json").length,
          0,
        ),
        readmeItems: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => e.source === "readme").length,
          0,
        ),
        absenceItems: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => e.source === "absence").length,
          0,
        ),
        fileTreeItems: input.claims.reduce(
          (n, c) => n + c.evidence.filter((e) => e.source === "file_tree").length,
          0,
        ),
        uniqueFilePaths: 0,
      },
      fallbackUsed: false,
    },
  };
}
