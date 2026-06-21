/**
 * Inline smoke tests for selectProvider() — no network, no API keys.
 * Run with: npx tsx scripts/testProviderSelection.ts
 */

import { selectProvider } from "../adapters/llm/provider";

type Case = {
  label: string;
  env: Record<string, string | undefined>;
  expected: ReturnType<typeof selectProvider>;
};

const CASES: Case[] = [
  {
    label: "auto + TokenRouter key only → tokenrouter",
    env: { LLM_PROVIDER: "auto", TOKENROUTER_API_KEY: "tr-key", ANTHROPIC_API_KEY: undefined },
    expected: "tokenrouter",
  },
  {
    label: "auto + Anthropic key only → anthropic",
    env: { LLM_PROVIDER: "auto", ANTHROPIC_API_KEY: "ant-key", TOKENROUTER_API_KEY: undefined },
    expected: "anthropic",
  },
  {
    label: "auto + both keys → tokenrouter (TR preferred)",
    env: { LLM_PROVIDER: "auto", TOKENROUTER_API_KEY: "tr-key", ANTHROPIC_API_KEY: "ant-key" },
    expected: "tokenrouter",
  },
  {
    label: "auto + no keys → none",
    env: { LLM_PROVIDER: "auto", TOKENROUTER_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
    expected: "none",
  },
  {
    label: "explicit tokenrouter + key → tokenrouter",
    env: { LLM_PROVIDER: "tokenrouter", TOKENROUTER_API_KEY: "tr-key" },
    expected: "tokenrouter",
  },
  {
    label: "explicit tokenrouter + no key → none",
    env: { LLM_PROVIDER: "tokenrouter", TOKENROUTER_API_KEY: undefined },
    expected: "none",
  },
  {
    label: "explicit anthropic + key → anthropic",
    env: { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "ant-key" },
    expected: "anthropic",
  },
  {
    label: "explicit anthropic + no key → none",
    env: { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: undefined },
    expected: "none",
  },
  {
    label: "explicit openai (unsupported) + TR key → tokenrouter via auto fallback",
    env: { LLM_PROVIDER: "openai", TOKENROUTER_API_KEY: "tr-key", ANTHROPIC_API_KEY: undefined },
    expected: "tokenrouter",
  },
  {
    label: "explicit openai + no keys → none",
    env: { LLM_PROVIDER: "openai", TOKENROUTER_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
    expected: "none",
  },
  {
    label: "no LLM_PROVIDER set (defaults to auto) + TR key → tokenrouter",
    env: { LLM_PROVIDER: undefined, TOKENROUTER_API_KEY: "tr-key", ANTHROPIC_API_KEY: undefined },
    expected: "tokenrouter",
  },
];

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
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

let passed = 0;
let failed = 0;

for (const { label, env, expected } of CASES) {
  const actual = withEnv(env, () => selectProvider());
  if (actual === expected) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${expected}`);
    console.error(`        actual:   ${actual}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
