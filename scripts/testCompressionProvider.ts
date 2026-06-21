/**
 * Tests for compression provider behavior — no network calls, no API keys.
 *
 * Covers:
 *   - isTokenCompanyRemoteReady(): placeholder URL / missing URL / real URL
 *   - selectCompressionMode(): all COMPRESSION_PROVIDER values
 *   - runCompression(): placeholder URL never triggers remote source; local is used
 *
 * Run with: npx tsx scripts/testCompressionProvider.ts
 */

import { isTokenCompanyRemoteReady } from "../adapters/compression/theTokenCompanyCompressor";
import { selectCompressionMode, runCompression } from "../adapters/compression/provider";
import type { LLMJudgeInput } from "../adapters/llm/types";

type AnyRecord = Record<string, string | undefined>;

function withEnv<T>(env: AnyRecord, fn: () => T): T {
  const saved: AnyRecord = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

async function withEnvAsync<T>(env: AnyRecord, fn: () => Promise<T>): Promise<T> {
  const saved: AnyRecord = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

const minimalJudgeInput: LLMJudgeInput = {
  scanSource: "github-api",
  repoUnavailable: false,
  claims: [
    {
      id: "mcp",
      detector: "MCP",
      claim: "Uses MCP",
      score: 40,
      evidence: [
        { source: "readme", positive: true, text: "README mentions MCP" },
        { source: "absence", positive: false, text: "No MCP SDK found" },
      ],
    },
  ],
};

// ── isTokenCompanyRemoteReady() ──────────────────────────────────────────────

console.log("\nisTokenCompanyRemoteReady()");

check(
  "no key, no URL → false",
  withEnv({ TOKEN_COMPANY_API_KEY: undefined, TOKEN_COMPANY_API_URL: undefined }, () =>
    isTokenCompanyRemoteReady()
  ),
  false,
);

check(
  "key set, no URL (blank) → false (placeholder URL in use)",
  withEnv({ TOKEN_COMPANY_API_KEY: "tc-key", TOKEN_COMPANY_API_URL: "" }, () =>
    isTokenCompanyRemoteReady()
  ),
  false,
);

check(
  "key set, URL unset → false",
  withEnv({ TOKEN_COMPANY_API_KEY: "tc-key", TOKEN_COMPANY_API_URL: undefined }, () =>
    isTokenCompanyRemoteReady()
  ),
  false,
);

check(
  "key set, .example placeholder URL → false",
  withEnv(
    {
      TOKEN_COMPANY_API_KEY: "tc-key",
      TOKEN_COMPANY_API_URL: "https://api.thetokencompany.example/v1/compress",
    },
    () => isTokenCompanyRemoteReady()
  ),
  false,
);

check(
  "key set, arbitrary .example URL → false",
  withEnv(
    {
      TOKEN_COMPANY_API_KEY: "tc-key",
      TOKEN_COMPANY_API_URL: "https://something.example/compress",
    },
    () => isTokenCompanyRemoteReady()
  ),
  false,
);

check(
  "no key, real URL → false (key required)",
  withEnv(
    { TOKEN_COMPANY_API_KEY: undefined, TOKEN_COMPANY_API_URL: "https://api.real-company.com/v1/compress" },
    () => isTokenCompanyRemoteReady()
  ),
  false,
);

check(
  "key set, real HTTPS URL → true",
  withEnv(
    {
      TOKEN_COMPANY_API_KEY: "tc-key",
      TOKEN_COMPANY_API_URL: "https://api.real-company.com/v1/compress",
    },
    () => isTokenCompanyRemoteReady()
  ),
  true,
);

check(
  "key set, localhost URL → true (localhost is a valid dev override, not a placeholder)",
  withEnv(
    {
      TOKEN_COMPANY_API_KEY: "tc-key",
      TOKEN_COMPANY_API_URL: "http://localhost:8080/compress",
    },
    () => isTokenCompanyRemoteReady()
  ),
  true,
);

// ── selectCompressionMode() ──────────────────────────────────────────────────

console.log("\nselectCompressionMode()");

const modeTable: Array<{ label: string; env: string | undefined; expected: string }> = [
  { label: "unset → auto", env: undefined, expected: "auto" },
  { label: '"auto" → auto', env: "auto", expected: "auto" },
  { label: '"off" → off', env: "off", expected: "off" },
  { label: '"disabled" → off', env: "disabled", expected: "off" },
  { label: '"none" → off', env: "none", expected: "off" },
  { label: '"local" → local', env: "local", expected: "local" },
  { label: '"token-company" → token-company', env: "token-company", expected: "token-company" },
  { label: '"the-token-company" → token-company', env: "the-token-company", expected: "token-company" },
  { label: '"OFF" (uppercase) → off', env: "OFF", expected: "off" },
  { label: '"AUTO" (uppercase) → auto', env: "AUTO", expected: "auto" },
];

for (const { label, env, expected } of modeTable) {
  check(
    label,
    withEnv({ COMPRESSION_PROVIDER: env }, () => selectCompressionMode()),
    expected,
  );
}

// ── runCompression(): placeholder URL never produces remote source ────────────

async function runAsyncTests(): Promise<void> {
  console.log("\nrunCompression() — no remote calls with placeholder URL");

  check(
    "mode=auto, key set, no real URL → local-claim-aware (no remote call)",
    await withEnvAsync(
      {
        COMPRESSION_PROVIDER: "auto",
        TOKEN_COMPANY_API_KEY: "tc-key",
        TOKEN_COMPANY_API_URL: undefined,
      },
      async () => {
        const result = await runCompression(minimalJudgeInput);
        return result.context.metadata.source;
      }
    ),
    "local-claim-aware",
  );

  check(
    "mode=token-company, key set, placeholder URL → fallback local (fallbackUsed=true)",
    await withEnvAsync(
      {
        COMPRESSION_PROVIDER: "token-company",
        TOKEN_COMPANY_API_KEY: "tc-key",
        TOKEN_COMPANY_API_URL: "https://api.thetokencompany.example/v1/compress",
      },
      async () => {
        const result = await runCompression(minimalJudgeInput);
        // remote returns null (placeholder) → provider falls back to local, marks fallbackUsed=true
        return { source: result.context.metadata.source, fallbackUsed: result.fallbackUsed };
      }
    ),
    { source: "fallback", fallbackUsed: true },
  );

  check(
    "mode=local, any key/URL → local-claim-aware, fallbackUsed=false",
    await withEnvAsync(
      {
        COMPRESSION_PROVIDER: "local",
        TOKEN_COMPANY_API_KEY: "tc-key",
        TOKEN_COMPANY_API_URL: "https://api.real-company.com/compress",
      },
      async () => {
        const result = await runCompression(minimalJudgeInput);
        return { source: result.context.metadata.source, fallbackUsed: result.fallbackUsed };
      }
    ),
    { source: "local-claim-aware", fallbackUsed: false },
  );

  check(
    "mode=off → disabled source, fallbackUsed=false",
    await withEnvAsync(
      { COMPRESSION_PROVIDER: "off" },
      async () => {
        const result = await runCompression(minimalJudgeInput);
        return { source: result.context.metadata.source, fallbackUsed: result.fallbackUsed };
      }
    ),
    { source: "disabled", fallbackUsed: false },
  );

  check(
    "mode=auto, no key → local-claim-aware, fallbackUsed=false",
    await withEnvAsync(
      { COMPRESSION_PROVIDER: "auto", TOKEN_COMPANY_API_KEY: undefined, TOKEN_COMPANY_API_URL: undefined },
      async () => {
        const result = await runCompression(minimalJudgeInput);
        return { source: result.context.metadata.source, fallbackUsed: result.fallbackUsed };
      }
    ),
    { source: "local-claim-aware", fallbackUsed: false },
  );

  check(
    "mode=auto, no key → token count reduced (local compressor ran)",
    await withEnvAsync(
      { COMPRESSION_PROVIDER: "auto", TOKEN_COMPANY_API_KEY: undefined },
      async () => {
        const result = await runCompression(minimalJudgeInput);
        return result.context.metadata.compressedEstimatedTokens > 0;
      }
    ),
    true,
  );

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runAsyncTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
