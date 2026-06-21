import type { AuditReport, ClaimVerdict, Evidence } from "../types/pipeline";

export const BAND_AGENT_HANDLES = {
  leadJudge: "BuildProofLeadJudge",
  claimProsecutor: "BuildProofClaimProsecutor",
  evidenceDefender: "BuildProofEvidenceDefender",
  repoForensics: "BuildProofRepoForensics",
} as const;

const BAND_STARTER_PREAMBLE = `@${BAND_AGENT_HANDLES.leadJudge} — please convene the BuildProof Audit Court for the packet below.

Required deliberation flow (do NOT skip steps):

1. @${BAND_AGENT_HANDLES.leadJudge} — your FIRST response must @mention all three specialists below by name and give each a concrete task. Do not issue a verdict in that first response. Do not stop to ask the user for more data — the packet below already contains project name, overall score, claims, and evidence. Work with what is in it.

2. Specialists, you must each reply in this room even if the evidence is partial or missing. Do not refuse to answer because evidence is thin — instead, state what is present, what is absent, and what that implies. Use only the evidence listed in the packet.

   @${BAND_AGENT_HANDLES.claimProsecutor} please identify unsupported or exaggerated claims.
   @${BAND_AGENT_HANDLES.evidenceDefender} please defend claims using the listed evidence.
   @${BAND_AGENT_HANDLES.repoForensics} please classify evidence quality and missing implementation signals.

3. @${BAND_AGENT_HANDLES.leadJudge} — after the three specialists have replied (or after a reasonable wait if one is silent), summarize each specialist's reply in one sentence, then post the Final Consensus Verdict using the structure in your system prompt.

Rules for every agent in this room:
- Use ONLY the evidence in the packet below. Do not invent evidence or fetch external URLs.
- Allowed verdict labels: Strongly supported / Partially supported / Unsupported by repository evidence / README-only claim / No implementation evidence found.
- Do not issue a final ruling immediately.
- Do not post placeholder text — every reply must reference concrete claims and evidence from the packet.
- Safe wording only: stick to the allowed verdict labels and evidence-based language. No accusatory or inflammatory wording.

(If your Band workspace named the four agents differently, adjust the @-handles before sending.)`;

function formatEvidence(ev: Evidence): string {
  return `  [${ev.source}] ${ev.text}`;
}

function formatClaim(v: ClaimVerdict): string {
  const lines: string[] = [];
  lines.push(`CLAIM: ${v.claim}`);
  lines.push(`Detector: ${v.detector}`);
  lines.push(`Verdict: ${v.verdict}`);
  lines.push(`Score: ${v.score}/100`);

  if (v.rationale) {
    lines.push(`Assessment: ${v.rationale}`);
  }

  const positive = v.evidence.filter((e) => e.positive);
  const absent = v.evidence.filter((e) => !e.positive);

  if (positive.length > 0) {
    lines.push("Supporting evidence:");
    positive.forEach((e) => lines.push(formatEvidence(e)));
  } else {
    lines.push("Supporting evidence: (none found)");
  }

  if (absent.length > 0) {
    lines.push("Missing evidence:");
    absent.forEach((e) => lines.push(formatEvidence(e)));
  }

  return lines.join("\n");
}

export function generateBandCourtPacket(report: AuditReport): string {
  const lines: string[] = [];

  lines.push("=== BUILDPROOF AUDIT COURT PACKET ===");
  lines.push("");
  lines.push(`Project: ${report.projectName}`);
  lines.push(`Audited: ${report.auditedAt}`);
  lines.push(`Overall Evidence Score: ${report.overallScore}/100`);
  lines.push("");

  lines.push("--- Ingestion & Scan Status ---");
  if (report.ingestMeta) {
    lines.push(`Ingestion source: ${report.ingestMeta.source}`);
    lines.push(`Ingestion status: ${report.ingestMeta.status}`);
    if (report.ingestMeta.title) {
      lines.push(`Project title: ${report.ingestMeta.title}`);
    }
    if (report.ingestMeta.builtWith.length > 0) {
      lines.push(`Built-with tags: ${report.ingestMeta.builtWith.join(", ")}`);
    }
  }
  lines.push(`GitHub scan source: ${report.scanSource}`);
  if (report.githubUrl) {
    lines.push(`Repository: ${report.githubUrl}`);
  }
  lines.push(`Claim extraction source: ${report.claimExtractionSource}`);
  lines.push(`Judge source: ${report.judgeSource}`);
  lines.push("");

  lines.push("--- Claims & Evidence ---");
  lines.push("");

  if (report.verdicts.length === 0) {
    lines.push("No tracked technical claims were detected in this project description.");
  } else {
    report.verdicts.forEach((v, i) => {
      if (i > 0) lines.push("");
      lines.push(formatClaim(v));
    });
  }

  lines.push("");
  lines.push("--- Agent Instructions ---");
  lines.push("");
  lines.push(
    "This packet is for the BuildProof Audit Court. Paste it into a Band room containing"
  );
  lines.push(
    `the four BuildProof agents and mention @${BAND_AGENT_HANDLES.leadJudge} to begin.`
  );
  lines.push("");
  lines.push("Four agents collaborate via @-mentions in this room:");
  lines.push(
    `  @${BAND_AGENT_HANDLES.leadJudge}        — coordinates the panel, posts the final consensus`
  );
  lines.push(
    `  @${BAND_AGENT_HANDLES.claimProsecutor}  — challenges weak or README-only claims`
  );
  lines.push(
    `  @${BAND_AGENT_HANDLES.evidenceDefender} — defends claims using only the evidence below`
  );
  lines.push(
    `  @${BAND_AGENT_HANDLES.repoForensics}    — classifies each repository signal`
  );
  lines.push("");
  lines.push("Rules for all agents:");
  lines.push("  - Use ONLY evidence listed in this packet. Do not invent repo evidence.");
  lines.push("  - Allowed verdicts: Strongly supported / Partially supported /");
  lines.push("    Unsupported by repository evidence / README-only claim /");
  lines.push("    No implementation evidence found");
  lines.push("  - No inflammatory language.");
  lines.push("");
  lines.push("=== END OF BUILDPROOF AUDIT COURT PACKET ===");

  return lines.join("\n");
}

export function generateBandStarterMessage(): string {
  return BAND_STARTER_PREAMBLE;
}

export function generateBandCombinedMessage(report: AuditReport): string {
  return `${BAND_STARTER_PREAMBLE}\n\n${generateBandCourtPacket(report)}`;
}

export function generateBandSelfTestMessage(): string {
  return `@${BAND_AGENT_HANDLES.leadJudge} @${BAND_AGENT_HANDLES.claimProsecutor} @${BAND_AGENT_HANDLES.evidenceDefender} @${BAND_AGENT_HANDLES.repoForensics} Please each reply READY with your role name.

This is a Band room presence check for BuildProof Audit Court. Every agent above is expected to post a single short line in this format:

  READY — BuildProofLeadJudge
  READY — BuildProofClaimProsecutor
  READY — BuildProofEvidenceDefender
  READY — BuildProofRepoForensics

If any of the four does not reply within ~30 seconds, that agent is not active in this room. Start that sidecar (see band_agents/README.md) and add it to this room before running the full court packet.`;
}
