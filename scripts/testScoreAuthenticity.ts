/**
 * Unit tests for scoreAuthenticity() weighted scoring.
 * Run with: npx tsx scripts/testScoreAuthenticity.ts
 */

import { scoreAuthenticity } from "../pipeline/scoreAuthenticity";
import type { ClaimWithEvidence, Evidence } from "../types/pipeline";

function makeEvidence(
  source: Evidence["source"],
  positive: boolean,
  text = "evidence",
): Evidence {
  return { text, source, positive };
}

function makeClaim(id: string, evidence: Evidence[]): ClaimWithEvidence {
  return { id, detector: "test", claim: "test claim", evidence };
}

type Case = {
  label: string;
  evidence: Evidence[];
  expectedScore: number; // exact expected score
  minScore?: number; // or use range check
  maxScore?: number;
};

const CASES: Case[] = [
  {
    label: "empty evidence → 0",
    evidence: [],
    expectedScore: 0,
  },
  {
    label: "only absence (no evidence found) → 0",
    evidence: [makeEvidence("absence", false, "No implementation evidence found")],
    expectedScore: 0,
  },
  {
    label: "source_file only (no negatives) → 100",
    evidence: [makeEvidence("source_file", true)],
    expectedScore: 100,
  },
  {
    label: "package_json only (no negatives) → 100",
    evidence: [makeEvidence("package_json", true)],
    expectedScore: 100,
  },
  {
    label: "readme only (no negatives) → 100 (no absences produced by detector)",
    evidence: [makeEvidence("readme", true)],
    expectedScore: 100,
  },
  {
    // Source code evidence with one absence should score much higher than readme-with-same-absence.
    label: "source_file + 1 absence scores higher than readme + 1 absence",
    evidence: [], // placeholder — handled by comparison test below
    expectedScore: -1, // sentinel: skip exact check, use comparison
  },
  {
    label: "readme + 2 absences → README-only range (26–50)",
    evidence: [
      makeEvidence("readme", true),
      makeEvidence("absence", false, "No package.json dependency"),
      makeEvidence("absence", false, "No source file usage"),
    ],
    expectedScore: 33,
  },
  {
    label: "package_json + 1 absence → strong range (≥70)",
    evidence: [
      makeEvidence("package_json", true),
      makeEvidence("absence", false, "No source file implementation found"),
    ],
    expectedScore: 80,
  },
  {
    label: "source_file + 1 absence → strong range (≥70)",
    evidence: [
      makeEvidence("source_file", true),
      makeEvidence("absence", false, "No package.json dependency"),
    ],
    expectedScore: 83,
  },
  {
    label: "file_tree + 1 absence → middle range (40–70)",
    evidence: [
      makeEvidence("file_tree", true),
      makeEvidence("absence", false, "No source usage"),
    ],
    expectedScore: 67,
  },
  {
    label: "package_json + source_file + readme (no absence) → 100",
    evidence: [
      makeEvidence("package_json", true),
      makeEvidence("source_file", true),
      makeEvidence("readme", true),
    ],
    expectedScore: 100,
  },
  {
    label: "source_file + readme + 3 absences → partial range (51–75)",
    evidence: [
      makeEvidence("source_file", true),
      makeEvidence("readme", true),
      makeEvidence("absence", false, "A"),
      makeEvidence("absence", false, "B"),
      makeEvidence("absence", false, "C"),
    ],
    expectedScore: 67,
  },
  {
    label: "multiple absences with no positive → 0",
    evidence: [
      makeEvidence("absence", false, "A"),
      makeEvidence("absence", false, "B"),
      makeEvidence("absence", false, "C"),
    ],
    expectedScore: 0,
  },
  {
    label: "package_json scores higher than readme alone (same 0 absences)",
    evidence: [], // comparison handled below
    expectedScore: -1,
  },
];

let passed = 0;
let failed = 0;

function check(label: string, actual: number, expected: number) {
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

function checkRange(label: string, actual: number, min: number, max: number) {
  if (actual >= min && actual <= max) {
    console.log(`  PASS  ${label} (${actual} in [${min}, ${max}])`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: value in [${min}, ${max}]`);
    console.error(`        actual:   ${actual}`);
    failed++;
  }
}

// Run exact-score cases (skip sentinels with expectedScore === -1)
for (const c of CASES) {
  if (c.expectedScore === -1) continue;
  const [result] = scoreAuthenticity([makeClaim("c1", c.evidence)]);
  check(c.label, result.score, c.expectedScore);
}

// Comparison test: source_file + 1 absence should score higher than readme + 1 absence
{
  const label = "source_file + 1 absence scores higher than readme + 1 absence";
  const [r1] = scoreAuthenticity([
    makeClaim("c1", [makeEvidence("source_file", true), makeEvidence("absence", false)]),
  ]);
  const [r2] = scoreAuthenticity([
    makeClaim("c2", [makeEvidence("readme", true), makeEvidence("absence", false)]),
  ]);
  if (r1.score > r2.score) {
    console.log(`  PASS  ${label} (${r1.score} > ${r2.score})`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        source_file+absence score: ${r1.score}`);
    console.error(`        readme+absence score:      ${r2.score}`);
    failed++;
  }
}

// Comparison test: dependency evidence scores higher than README-only (both with 1 absence)
{
  const label = "package_json + 1 absence scores higher than readme + 1 absence";
  const [r1] = scoreAuthenticity([
    makeClaim("c1", [makeEvidence("package_json", true), makeEvidence("absence", false)]),
  ]);
  const [r2] = scoreAuthenticity([
    makeClaim("c2", [makeEvidence("readme", true), makeEvidence("absence", false)]),
  ]);
  if (r1.score > r2.score) {
    console.log(`  PASS  ${label} (${r1.score} > ${r2.score})`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        package_json+absence score: ${r1.score}`);
    console.error(`        readme+absence score:       ${r2.score}`);
    failed++;
  }
}

// Range test: readme-only range (26–50)
{
  const label = "readme + 2 absences lands in README-only score range (26–50)";
  const [r] = scoreAuthenticity([
    makeClaim("c1", [
      makeEvidence("readme", true),
      makeEvidence("absence", false),
      makeEvidence("absence", false),
    ]),
  ]);
  checkRange(label, r.score, 26, 50);
}

// Range test: package_json + absence lands in strong range (≥70)
{
  const label = "package_json + 1 absence lands in strong range (≥70)";
  const [r] = scoreAuthenticity([
    makeClaim("c1", [makeEvidence("package_json", true), makeEvidence("absence", false)]),
  ]);
  checkRange(label, r.score, 70, 100);
}

// Test that adding absences to positive evidence strictly lowers the score
{
  const label = "adding absence items to positive evidence lowers score";
  const base = scoreAuthenticity([
    makeClaim("c1", [makeEvidence("source_file", true)]),
  ])[0].score;
  const withAbsence = scoreAuthenticity([
    makeClaim("c1", [makeEvidence("source_file", true), makeEvidence("absence", false)]),
  ])[0].score;
  if (base > withAbsence) {
    console.log(`  PASS  ${label} (${base} > ${withAbsence})`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        base score: ${base}, with absence: ${withAbsence}`);
    failed++;
  }
}

// Test overall score across multiple claims
{
  const label = "overallScore is average of per-claim scores";
  const claims = scoreAuthenticity([
    makeClaim("c1", [makeEvidence("source_file", true)]), // score=100
    makeClaim("c2", [makeEvidence("absence", false)]),    // score=0
  ]);
  const avg = Math.round(claims.reduce((s, c) => s + c.score, 0) / claims.length);
  check(label, avg, 50);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
