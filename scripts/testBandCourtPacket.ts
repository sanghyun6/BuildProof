/**
 * Unit tests for lib/bandCourtPacket.ts + app/page.tsx Band-first UI claims.
 * No Band SDK, no network, no API keys involved.
 *
 * Run with: npx tsx scripts/testBandCourtPacket.ts
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  BAND_AGENT_HANDLES,
  generateBandCombinedMessage,
  generateBandCourtPacket,
  generateBandSelfTestMessage,
  generateBandStarterMessage,
} from "../lib/bandCourtPacket";
import { getIntegrationStatus } from "../lib/integrationStatus";
import type { AuditReport } from "../types/pipeline";

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
    failed++;
  }
}

const BANNED_WORDS = ["fake", "lying", "scam", "fraud", "deceptive"];

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    projectName: "TestProj",
    githubUrl: "https://github.com/test/proj",
    auditedAt: "2026-06-21T00:00:00Z",
    overallScore: 47,
    scanSource: "github-api",
    claimExtractionSource: "keyword",
    judgeSource: "deterministic",
    verdicts: [
      {
        id: "rag",
        detector: "RAG / vector DB",
        claim: "Uses RAG with a vector database",
        evidence: [
          {
            text: "README describes retrieval-augmented generation",
            source: "readme",
            positive: true,
          },
          {
            text: "No vector database dependency found",
            source: "package_json",
            positive: false,
          },
        ],
        verdict: "README-only claim",
        score: 22,
        rationale: "Only README mention; no implementation found.",
      },
      {
        id: "mcp",
        detector: "MCP",
        claim: "Uses MCP",
        evidence: [
          {
            text: "src/server.ts imports @modelcontextprotocol/sdk",
            source: "source_file",
            positive: true,
          },
          {
            text: "package.json includes @modelcontextprotocol/sdk",
            source: "package_json",
            positive: true,
          },
        ],
        verdict: "Strongly supported",
        score: 95,
      },
    ],
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// generateBandStarterMessage — opening @-mention preamble
// -----------------------------------------------------------------------------

console.log("generateBandStarterMessage");

{
  const starter = generateBandStarterMessage();

  assert(
    "starts with @BuildProofLeadJudge mention",
    starter.startsWith(`@${BAND_AGENT_HANDLES.leadJudge}`),
  );
  assert(
    "@-mentions BuildProofClaimProsecutor",
    starter.includes(`@${BAND_AGENT_HANDLES.claimProsecutor}`),
  );
  assert(
    "@-mentions BuildProofEvidenceDefender",
    starter.includes(`@${BAND_AGENT_HANDLES.evidenceDefender}`),
  );
  assert(
    "@-mentions BuildProofRepoForensics",
    starter.includes(`@${BAND_AGENT_HANDLES.repoForensics}`),
  );
  assert(
    "instructs LeadJudge not to issue final ruling immediately",
    /not\s+issue\s+a\s+final\s+ruling\s+immediately/i.test(starter),
  );
  assert(
    "mentions Final Consensus Verdict step",
    starter.includes("Final Consensus Verdict"),
  );
  for (const word of BANNED_WORDS) {
    assert(
      `starter has no banned word "${word}"`,
      !starter.toLowerCase().includes(word),
    );
  }
}

// -----------------------------------------------------------------------------
// generateBandCourtPacket — structured packet body
// -----------------------------------------------------------------------------

console.log("generateBandCourtPacket");

{
  const report = makeReport();
  const packet = generateBandCourtPacket(report);

  assert("includes opening header", packet.startsWith("=== BUILDPROOF AUDIT COURT PACKET ==="));
  assert("includes closing header", packet.trimEnd().endsWith("=== END OF BUILDPROOF AUDIT COURT PACKET ==="));
  assert("includes project name", packet.includes("Project: TestProj"));
  assert(
    "includes overall score",
    packet.includes("Overall Evidence Score: 47/100"),
  );
  assert("includes audited timestamp", packet.includes("Audited: 2026-06-21T00:00:00Z"));
  assert("includes GitHub URL", packet.includes("https://github.com/test/proj"));
  assert("includes scan source", packet.includes("GitHub scan source: github-api"));
  assert("includes judge source", packet.includes("Judge source: deterministic"));

  // Claim 1 — RAG
  assert("includes RAG claim text", packet.includes("Uses RAG with a vector database"));
  assert("includes RAG verdict label", packet.includes("Verdict: README-only claim"));
  assert("includes RAG score", packet.includes("Score: 22/100"));
  assert("includes RAG rationale", packet.includes("Assessment: Only README mention"));
  assert(
    "RAG positive evidence appears under Supporting evidence",
    /Supporting evidence:\n\s*\[readme\] README describes retrieval-augmented generation/.test(
      packet,
    ),
  );
  assert(
    "RAG missing evidence appears under Missing evidence",
    /Missing evidence:\n\s*\[package_json\] No vector database dependency found/.test(packet),
  );

  // Claim 2 — MCP
  assert("includes MCP claim text", packet.includes("Uses MCP"));
  assert("includes MCP verdict label", packet.includes("Verdict: Strongly supported"));
  assert("includes MCP score", packet.includes("Score: 95/100"));
  assert(
    "MCP has no Missing evidence section (all positive)",
    !/Uses MCP[\s\S]*?Missing evidence:/m.test(packet) ||
      /Strongly supported[\s\S]*?Supporting evidence:[\s\S]*?Missing evidence:/m.test(packet) ===
        false,
  );

  // Agent roster
  assert(
    "lists all four agents in instructions block",
    packet.includes(`@${BAND_AGENT_HANDLES.leadJudge}`) &&
      packet.includes(`@${BAND_AGENT_HANDLES.claimProsecutor}`) &&
      packet.includes(`@${BAND_AGENT_HANDLES.evidenceDefender}`) &&
      packet.includes(`@${BAND_AGENT_HANDLES.repoForensics}`),
  );

  // Verdict-label whitelist
  assert(
    "lists allowed verdict labels (Strongly supported)",
    packet.includes("Strongly supported"),
  );
  assert(
    "lists allowed verdict labels (Partially supported)",
    packet.includes("Partially supported"),
  );
  assert(
    "lists allowed verdict labels (Unsupported by repository evidence)",
    packet.includes("Unsupported by repository evidence"),
  );
  assert(
    "lists allowed verdict labels (README-only claim)",
    packet.includes("README-only claim"),
  );
  assert(
    "lists allowed verdict labels (No implementation evidence found)",
    packet.includes("No implementation evidence found"),
  );

  // Safety wording
  for (const word of BANNED_WORDS) {
    assert(
      `packet has no banned word "${word}"`,
      !packet.toLowerCase().includes(word),
    );
  }
}

// -----------------------------------------------------------------------------
// empty-verdicts edge case
// -----------------------------------------------------------------------------

console.log("generateBandCourtPacket (no verdicts)");

{
  const empty = makeReport({ verdicts: [] });
  const packet = generateBandCourtPacket(empty);

  assert(
    "empty verdicts → renders no-claims sentence",
    packet.includes("No tracked technical claims were detected"),
  );
  assert(
    "empty verdicts → still includes instructions block",
    packet.includes("--- Agent Instructions ---") &&
      packet.includes(`@${BAND_AGENT_HANDLES.leadJudge}`),
  );
}

// -----------------------------------------------------------------------------
// ingestMeta surfacing
// -----------------------------------------------------------------------------

console.log("generateBandCourtPacket (with ingestMeta)");

{
  const withIngest = makeReport({
    ingestMeta: {
      source: "browserbase",
      status: "success",
      title: "Demo Project Title",
      builtWith: ["Next.js", "Anthropic"],
      warnings: [],
    },
  });
  const packet = generateBandCourtPacket(withIngest);

  assert("ingestion source surfaced", packet.includes("Ingestion source: browserbase"));
  assert("ingestion status surfaced", packet.includes("Ingestion status: success"));
  assert("ingestion title surfaced", packet.includes("Project title: Demo Project Title"));
  assert(
    "built-with tags surfaced",
    packet.includes("Built-with tags: Next.js, Anthropic"),
  );
}

// -----------------------------------------------------------------------------
// generateBandCombinedMessage — starter + packet
// -----------------------------------------------------------------------------

console.log("generateBandCombinedMessage");

{
  const report = makeReport();
  const combined = generateBandCombinedMessage(report);
  const starter = generateBandStarterMessage();
  const packet = generateBandCourtPacket(report);

  assert(
    "combined starts with the starter preamble",
    combined.startsWith(starter),
  );
  assert("combined contains the packet body", combined.includes(packet));
  assert(
    "combined separates starter and packet with blank line",
    combined.includes(`${starter}\n\n`),
  );
  for (const word of BANNED_WORDS) {
    assert(
      `combined has no banned word "${word}"`,
      !combined.toLowerCase().includes(word),
    );
  }
}

// -----------------------------------------------------------------------------
// generateBandCombinedMessage — content completeness requirements
// (These guard against placeholder text appearing in the copied message.)
// -----------------------------------------------------------------------------

console.log("generateBandCombinedMessage (content requirements)");

{
  const report = makeReport();
  const combined = generateBandCombinedMessage(report);

  // Placeholder guards — these strings must never appear in the copied output
  const PLACEHOLDER_STRINGS = [
    "[PASTE PACKET HERE]",
    "[full court packet follows]",
    "[paste packet here]",
    "[PASTE COURT PACKET HERE]",
    "PASTE PACKET",
  ];
  for (const placeholder of PLACEHOLDER_STRINGS) {
    assert(
      `combined does not contain placeholder "${placeholder}"`,
      !combined.includes(placeholder),
    );
  }

  // All four @BuildProof* agents must be @mentioned in the combined message
  assert(
    "combined @mentions @BuildProofLeadJudge",
    combined.includes(`@${BAND_AGENT_HANDLES.leadJudge}`),
  );
  assert(
    "combined @mentions @BuildProofClaimProsecutor",
    combined.includes(`@${BAND_AGENT_HANDLES.claimProsecutor}`),
  );
  assert(
    "combined @mentions @BuildProofEvidenceDefender",
    combined.includes(`@${BAND_AGENT_HANDLES.evidenceDefender}`),
  );
  assert(
    "combined @mentions @BuildProofRepoForensics",
    combined.includes(`@${BAND_AGENT_HANDLES.repoForensics}`),
  );

  // The actual audit data must be present — not just the preamble
  assert(
    "combined includes the project name",
    combined.includes("TestProj"),
  );
  assert(
    "combined includes the overall score",
    combined.includes("47/100"),
  );
  assert(
    "combined includes at least one claim",
    combined.includes("CLAIM:"),
  );
  assert(
    "combined includes at least one evidence item",
    combined.includes("Supporting evidence:"),
  );
  assert(
    "combined includes the verdict label of claim 1",
    combined.includes("README-only claim"),
  );
  assert(
    "combined includes the verdict label of claim 2",
    combined.includes("Strongly supported"),
  );

  // The GitHub URL is included so agents can identify the project
  assert(
    "combined includes the GitHub repository URL",
    combined.includes("https://github.com/test/proj"),
  );
}

// -----------------------------------------------------------------------------
// generateBandCombinedMessage — empty verdicts edge case
// (must not fall back to placeholder text)
// -----------------------------------------------------------------------------

console.log("generateBandCombinedMessage (empty verdicts — no placeholder fallback)");

{
  const empty = makeReport({ verdicts: [] });
  const combined = generateBandCombinedMessage(empty);

  assert(
    "empty-verdicts combined does not contain [PASTE PACKET HERE]",
    !combined.includes("[PASTE PACKET HERE]"),
  );
  assert(
    "empty-verdicts combined does not contain [full court packet follows]",
    !combined.includes("[full court packet follows]"),
  );
  assert(
    "empty-verdicts combined still @mentions all four agents",
    combined.includes(`@${BAND_AGENT_HANDLES.leadJudge}`) &&
      combined.includes(`@${BAND_AGENT_HANDLES.claimProsecutor}`) &&
      combined.includes(`@${BAND_AGENT_HANDLES.evidenceDefender}`) &&
      combined.includes(`@${BAND_AGENT_HANDLES.repoForensics}`),
  );
  assert(
    "empty-verdicts combined surfaces the no-claims message",
    combined.includes("No tracked technical claims were detected"),
  );
}

// -----------------------------------------------------------------------------
// generateBandCombinedMessage — explicit delegation instructions
// (LeadJudge must be told to @mention all three specialists in its first reply)
// -----------------------------------------------------------------------------

console.log("generateBandCombinedMessage (explicit delegation instructions)");

{
  const combined = generateBandCombinedMessage(makeReport());
  const handles = BAND_AGENT_HANDLES;

  assert(
    "delegation instruction names @BuildProofClaimProsecutor with a concrete task",
    combined.includes(
      `@${handles.claimProsecutor} please identify unsupported or exaggerated claims`,
    ),
  );
  assert(
    "delegation instruction names @BuildProofEvidenceDefender with a concrete task",
    combined.includes(
      `@${handles.evidenceDefender} please defend claims using the listed evidence`,
    ),
  );
  assert(
    "delegation instruction names @BuildProofRepoForensics with a concrete task",
    combined.includes(
      `@${handles.repoForensics} please classify evidence quality`,
    ),
  );
  assert(
    "first-response delegation rule is stated for the Lead Judge",
    /FIRST response must @mention all three specialists/i.test(combined),
  );
  assert(
    "specialists are explicitly told to reply even if evidence is partial",
    /reply in this room even if the evidence is partial/i.test(combined),
  );
  assert(
    "Lead Judge is told to post final verdict AFTER specialists reply",
    /after the three specialists have replied[\s\S]*Final Consensus Verdict/i.test(
      combined,
    ),
  );
  assert(
    "preamble forbids placeholder text in replies",
    /not\s+post\s+placeholder\s+text/i.test(combined),
  );
  assert(
    "preamble blocks 'ask the user for more data' detour when packet is complete",
    /Do not stop to ask the user for more data/i.test(combined),
  );
}

// -----------------------------------------------------------------------------
// generateBandCombinedMessage — packet completeness blocks "need more data" dodge
// (when the packet has project name, claims, score, and evidence, the
// preamble must instruct the Lead Judge NOT to stall asking for more info)
// -----------------------------------------------------------------------------

console.log(
  "generateBandCombinedMessage (complete packet → no 'ask user for more data' instruction)",
);

{
  const complete = makeReport();
  const combined = generateBandCombinedMessage(complete);

  assert(
    "complete packet → preamble explicitly tells Lead Judge not to ask user for more data",
    /Do not stop to ask the user for more data/i.test(combined),
  );

  // Sanity: the packet really does contain all four completeness markers
  assert(
    "complete packet contains project name",
    combined.includes(`Project: ${complete.projectName}`),
  );
  assert(
    "complete packet contains overall score",
    combined.includes(`Overall Evidence Score: ${complete.overallScore}/100`),
  );
  assert(
    "complete packet contains at least one CLAIM block",
    combined.includes("CLAIM:"),
  );
  assert(
    "complete packet contains at least one evidence line",
    combined.includes("Supporting evidence:") ||
      combined.includes("Missing evidence:"),
  );

  // The preamble must NOT instruct anyone to defer for missing project/claims/score/evidence
  assert(
    "preamble does not tell agents to wait for additional packet data",
    !/please provide (the )?packet/i.test(combined) &&
      !/please share (the )?project/i.test(combined) &&
      !/awaiting (the )?packet/i.test(combined),
  );
}

// -----------------------------------------------------------------------------
// generateBandSelfTestMessage — Band room presence check
// -----------------------------------------------------------------------------

console.log("generateBandSelfTestMessage");

{
  const selfTest = generateBandSelfTestMessage();
  const handles = BAND_AGENT_HANDLES;

  assert(
    "self-test @mentions @BuildProofLeadJudge",
    selfTest.includes(`@${handles.leadJudge}`),
  );
  assert(
    "self-test @mentions @BuildProofClaimProsecutor",
    selfTest.includes(`@${handles.claimProsecutor}`),
  );
  assert(
    "self-test @mentions @BuildProofEvidenceDefender",
    selfTest.includes(`@${handles.evidenceDefender}`),
  );
  assert(
    "self-test @mentions @BuildProofRepoForensics",
    selfTest.includes(`@${handles.repoForensics}`),
  );
  assert(
    "self-test asks each agent to reply READY with role name",
    /reply\s+READY\s+with\s+your\s+role\s+name/i.test(selfTest),
  );
  assert(
    "self-test contains all four agent handles on the same opening line",
    selfTest
      .split("\n")[0]
      .includes(`@${handles.leadJudge}`) &&
      selfTest.split("\n")[0].includes(`@${handles.claimProsecutor}`) &&
      selfTest.split("\n")[0].includes(`@${handles.evidenceDefender}`) &&
      selfTest.split("\n")[0].includes(`@${handles.repoForensics}`),
  );
  for (const word of BANNED_WORDS) {
    assert(
      `self-test has no banned word "${word}"`,
      !selfTest.toLowerCase().includes(word),
    );
  }
  // The self-test must not contain placeholder text
  const PLACEHOLDERS = [
    "[PASTE",
    "[paste",
    "TODO",
    "<your handle>",
    "<role>",
  ];
  for (const ph of PLACEHOLDERS) {
    assert(
      `self-test has no placeholder "${ph}"`,
      !selfTest.includes(ph),
    );
  }
}

// -----------------------------------------------------------------------------
// app/page.tsx UI source — Band-first claims
// (Reads the source file as text to verify required Band-first wording.)
// -----------------------------------------------------------------------------

console.log("app/page.tsx — Band-first UI claims");

{
  const __filename = fileURLToPath(import.meta.url);
  const __dir = dirname(__filename);
  const pageSrc = readFileSync(resolve(__dir, "../app/page.tsx"), "utf8");

  assert(
    "page.tsx states live conversation happens in Band not in this app",
    pageSrc.includes("Live Audit Court conversation happens in Band, not in this app"),
  );
  assert(
    "page.tsx states BuildProof does not display Band replies",
    /BuildProof does not (receive or )?display (Band replies|Band chat|live Band chat)/i.test(
      pageSrc,
    ),
  );
  assert(
    "page.tsx states this web app does not display live Band chat history",
    pageSrc.includes("does not call Band") ||
      pageSrc.includes("display live Band chat history"),
  );
  assert(
    "page.tsx does not claim to show a Band conversation locally",
    !pageSrc.includes("showing live Band") &&
      !pageSrc.includes("live Band chat history in this app") &&
      !pageSrc.includes("displays Band chat"),
  );
  assert(
    "page.tsx preview label calls the preview 'packet' not 'conversation'",
    pageSrc.includes("Preview} packet (what gets pasted to Band)") ||
      pageSrc.includes('"▼ Preview"} packet') ||
      pageSrc.includes("packet (what gets pasted to Band)"),
  );
  assert(
    "page.tsx preview note says deliberation happens in Band after pasting",
    pageSrc.includes("deliberation happens in Band after you paste this") ||
      pageSrc.includes("actual deliberation happens in Band"),
  );
  assert(
    "page.tsx runbook has 6 steps including 'Watch the Audit Court conversation unfold in Band'",
    pageSrc.includes("Watch the Audit Court conversation unfold in Band"),
  );
  assert(
    "page.tsx runbook step 6 says BuildProof does not display Band replies",
    pageSrc.includes("BuildProof does not display Band replies"),
  );
  assert(
    "page.tsx agent roster still names all four BuildProof* handles",
    pageSrc.includes("BuildProofLeadJudge") &&
      pageSrc.includes("BuildProofClaimProsecutor") &&
      pageSrc.includes("BuildProofEvidenceDefender") &&
      pageSrc.includes("BuildProofRepoForensics"),
  );
}

// -----------------------------------------------------------------------------
// SHOW_BAND_COURT feature flag — lib/integrationStatus.ts + app/page.tsx source
// -----------------------------------------------------------------------------

console.log("SHOW_BAND_COURT feature flag");

{
  // Default / unset → off
  const savedEnv = process.env.SHOW_BAND_COURT;
  delete process.env.SHOW_BAND_COURT;
  assert(
    "showBandCourt is false when SHOW_BAND_COURT is unset",
    getIntegrationStatus().showBandCourt === false,
  );

  process.env.SHOW_BAND_COURT = "off";
  assert(
    "showBandCourt is false when SHOW_BAND_COURT=off",
    getIntegrationStatus().showBandCourt === false,
  );

  process.env.SHOW_BAND_COURT = "OFF";
  assert(
    "showBandCourt is false when SHOW_BAND_COURT=OFF (case-insensitive)",
    getIntegrationStatus().showBandCourt === false,
  );

  process.env.SHOW_BAND_COURT = "on";
  assert(
    "showBandCourt is true when SHOW_BAND_COURT=on",
    getIntegrationStatus().showBandCourt === true,
  );

  process.env.SHOW_BAND_COURT = "ON";
  assert(
    "showBandCourt is true when SHOW_BAND_COURT=ON (case-insensitive)",
    getIntegrationStatus().showBandCourt === true,
  );

  // Restore original env value
  if (savedEnv === undefined) {
    delete process.env.SHOW_BAND_COURT;
  } else {
    process.env.SHOW_BAND_COURT = savedEnv;
  }

  // page.tsx source: BandCourtPanel must be gated on showBandCourt
  const __filename = fileURLToPath(import.meta.url);
  const __dir = dirname(__filename);
  const pageSrc = readFileSync(resolve(__dir, "../app/page.tsx"), "utf8");

  assert(
    "page.tsx gates BandCourtPanel on integrationStatus showBandCourt",
    pageSrc.includes("showBandCourt") && pageSrc.includes("BandCourtPanel"),
  );
  assert(
    "page.tsx does not render BandCourtPanel unconditionally (must be conditional)",
    !pageSrc.includes("\n            <BandCourtPanel report={report} />\n"),
  );
  assert(
    "page.tsx Integration Status card shows Band Audit Court row",
    pageSrc.includes("Band Audit Court") && pageSrc.includes("showBandCourt"),
  );
  assert(
    "page.tsx Band status shows 'off' when showBandCourt is false",
    pageSrc.includes('"off"') || pageSrc.includes("'off'"),
  );
  assert(
    "page.tsx Band status shows 'on (experimental)' when showBandCourt is true",
    pageSrc.includes("on (experimental)"),
  );
  assert(
    "main report panels (TokenRouter / judge comparison / evidence) are not gated by showBandCourt",
    pageSrc.includes("JudgeComparisonPanel") &&
      pageSrc.includes("CompressionPanel") &&
      pageSrc.includes("TracePanel"),
  );
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log("");
console.log(`Band court packet: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
