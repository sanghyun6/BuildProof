# BuildProof — Implementation Review

Audit performed read-only against the source tree at `/Users/sanghyun/BuildProof` on 2026-06-20. No source files, env files, or configuration were modified. Verification commands and forbidden-word scans run with the project's own scripts; no API calls executed against any sponsor service.

---

## 1. Executive Summary

- **Overall depth: medium-to-deep for a hackathon project.** The core pipeline is genuinely implemented end-to-end (no mock-only paths in the main flow), the GitHub scanner does real REST calls with sensible quotas, six static detectors are non-trivial, and there are two real LLM providers with clean parsing and fallbacks.
- **Demo-ready: yes, with one caveat (see Risks).** `npm run build` and `npx tsc --noEmit` both pass clean. The integration-status card and run-trace panel make every fallback visible to the judge.
- **Adapter discipline is the standout strength.** Every external service (GitHub, OpenAI, Anthropic, Browserbase, Sentry) is behind a typed adapter, env-gated, and degrades to a deterministic local path. A judge can yank any key and the app still runs.
- **Band integration is real, not theatre.** The four Python agents use the actual installed Band SDK (`band.Agent.create(...)`, `band.adapters.anthropic.AnthropicAdapter(...)`) with signatures that match the installed package, and the web app deterministically generates a sanitized court packet from the live audit result.
- **The Band ↔ web bridge is a manual copy-paste.** The packet is generated automatically; sending it to Band is a clipboard copy + paste. This is acceptable for a hackathon demo, but it is the single biggest "shallow seam" in the otherwise-tight pipeline.
- **Safety wording enforcement is real and double-layered.** `applySafety` strips banned words from claim/evidence/rationale text, AND both LLM judge prompts and all four Band agent prompts explicitly forbid the same word list. No user-facing component contains accusatory language.
- **Browserbase ingestion is functional but fragile.** Real CDP connection via Playwright with selector chains that match Devpost's current DOM (`#built-with`, `#app-details-left p`), wrapped in a 45s overall timeout and a mock-fallback path. Selectors are the single point of failure if Devpost changes markup.
- **Biggest technical risk: REAL credentials are committed in `band_agents/agent_config.example.yaml`.** The file labeled "example" contains what look like four live Band agent UUIDs and `band_a_...` API keys, and is identical (byte-for-byte) to the gitignored `agent_config.yaml`. Anyone with repo access has working Band credentials. **Treat these as compromised** and rotate before public sharing; this is independent of the demo working.

---

## 2. Architecture Map

### 2.1 Main data flow (manual mode and project-URL mode)

```
                ┌──────────────────────────────────────────────────────────┐
   browser  ──▶ │  app/page.tsx (client, "use client")                     │
   POST    ──▶  │   • Manual tab → { projectText, githubUrl }              │
                │   • Project URL tab → { projectUrl }                     │
                └────────────────────────┬─────────────────────────────────┘
                                         │ fetch /api/audit
                                         ▼
                ┌──────────────────────────────────────────────────────────┐
                │  app/api/audit/route.ts (server)                         │
                │   • URL mode: browserbaseProjectIngestor → mock fallback │
                │   • Manual mode: skips ingestion                         │
                │   • On thrown error: captureSentryError(err)             │
                └────────────────────────┬─────────────────────────────────┘
                                         ▼
                ┌──────────────────────────────────────────────────────────┐
                │  pipeline/index.ts → runPipeline(input, { ingestMeta? })│
                │                                                          │
                │  TraceCollector records every step                       │
                │                                                          │
                │  ingestProject (trim)                                    │
                │   → extractClaims  (LLM Anthropic | OpenAI | keyword)    │
                │   → scanRepo       (GitHub REST | invalid-url | unavail) │
                │   → runDetectors   (six static detectors)                │
                │   → matchEvidence  (join claims ↔ evidence)              │
                │   → scoreAuthenticity (positive/total → 0-100)           │
                │   → judgeClaims    (LLM judge | deterministic threshold) │
                │   → applySafety    (banned-word sanitizer)               │
                │   → generateReport (assemble AuditReport)                │
                │                                                          │
                │   trace.externalExport ← sentryTraceAdapter.exportTrace  │
                └────────────────────────┬─────────────────────────────────┘
                                         │ AuditReport JSON
                                         ▼
                ┌──────────────────────────────────────────────────────────┐
                │  app/page.tsx renders:                                   │
                │   IngestMetaCard · ScoreBar · DetectorSummary · cards    │
                │   TracePanel · BandCourtPanel                            │
                └──────────────────────────────────────────────────────────┘
```

### 2.2 Key files & responsibilities

| File | Responsibility |
|---|---|
| `app/page.tsx` | Single-page UI, tab switcher (manual / URL), report rendering, integration-status card, trace panel, **BandCourtPanel** with three copy buttons |
| `app/api/audit/route.ts` | Server entry: routes manual vs URL request, runs Browserbase → mock fallback, wraps pipeline with Sentry error capture |
| `app/api/status/route.ts` | GET returns `IntegrationStatus` (read-only env presence flags) |
| `pipeline/index.ts` | Orchestrator; builds `TraceCollector`, records every stage, exports trace to Sentry |
| `pipeline/extractClaims.ts` | Provider-routed: Anthropic → OpenAI → keyword. Keyword path uses word-boundary regex for single tokens (prevents "rag"→"storage" false hit) |
| `pipeline/scanRepo.ts` | URL parse + real scanner; clean `invalid-url` signalling |
| `pipeline/runDetectors.ts` | Dispatches each claim to its detector; uniform absence fallback |
| `pipeline/judgeClaims.ts` | Provider-routed judge with `repoUnavailable` gating |
| `pipeline/scoreAuthenticity.ts` | Pure positive/total ratio scoring |
| `pipeline/applySafety.ts` | Banned-word substitution on claim, evidence text, rationale |
| `pipeline/generateReport.ts` | Final assembly; falls back to URL-derived project name |
| `adapters/github/realScanner.ts` | GitHub REST: repo info → recursive tree → README/package.json/Python dep files in parallel → up to 15 source files (≤8 KB each, ≤200 KB pre-filter). Caps at ~24 requests/audit |
| `adapters/github/mockScanner.ts` | Unused at runtime (no codepath imports it); kept for reference |
| `adapters/ingest/browserbaseProjectIngestor.ts` | CDP-connects to a Browserbase session via Playwright, runs `page.evaluate` to extract Devpost-shaped title/description/built-with/GitHub link |
| `adapters/ingest/mockProjectIngestor.ts` | Fixed fictional "MediScan AI" fixture that triggers all six detectors |
| `adapters/llm/provider.ts` | `selectProvider()` from `LLM_PROVIDER` env (`auto` prefers Anthropic) |
| `adapters/llm/{openai,anthropic}ClaimExtractor.ts` | Same system prompt, strict JSON validation, `null` on any failure |
| `adapters/llm/{openai,anthropic}ClaimJudge.ts` | Same system prompt, validates verdict labels + all expected claim IDs present, `null` on any failure |
| `adapters/trace/sentryTraceAdapter.ts` | Lazy `Sentry.init` (server-only), captures audit-trace as `captureEvent` with safe metadata; also exposes `captureSentryError` |
| `lib/trace.ts` | Tiny TraceCollector; total-duration only (no per-step duration) |
| `lib/bandCourtPacket.ts` | Pure function that turns an `AuditReport` into a sanitized text packet + combined Band starter message |
| `lib/integrationStatus.ts` | Env-presence labels (`enabled` / `fallback mode` / `missing keys` / `not configured`) |
| `detectors/scan.ts` | Shared helpers: `findMatchingDependency`, `findMatchingPythonDep` (handles requirements.txt / pyproject quote styles), `matchingFilePaths`, `sourceMatchingTerms`, `readmeMatchingTerms` |
| `detectors/{mcp,rag,realtime,voice,multiAgent,computerVision}.ts` | Each ~150 LOC, all follow the same pattern: dep → file-tree → README → source-snippet, plus targeted absence evidence |
| `utils/parseGitHubUrl.ts` | HTTPS + SSH variants; per-segment regex; trims `.git`; returns normalized URL |
| `types/pipeline.ts` | All shared types; strict union for `VerdictLabel`, `ScanSource`, `ClaimExtractionSource`, `JudgeSource`, `IngestSource`, `IngestStatus`, `TraceExportStatus` |

### 2.3 Band Audit Court flow (sidecar, parallel to step 2.2)

```
  AuditReport (from /api/audit) ──▶ lib/bandCourtPacket.ts
                                         │
                                         │ generateBandStarterMessage()  (@BuildProofLeadJudge preamble)
                                         │ generateBandCourtPacket(report)  (sanitized packet)
                                         │ generateBandCombinedMessage(report)  (preamble + packet)
                                         ▼
                          BandCourtPanel (app/page.tsx)
                            ┌──────────────────────────────┐
                            │ [Copy starter message]       │
                            │ [Copy full court packet]     │
                            │ [Copy combined Band message] │  ← clipboard.writeText
                            └──────────┬───────────────────┘
                                       │ user paste
                                       ▼
                            Band room (4 agents joined)
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
  @BuildProofLeadJudge      @BuildProofClaimProsecutor   @BuildProofEvidenceDefender
  (lead_judge.py)           (claim_prosecutor.py)        (evidence_defender.py)
            │                                                     │
            │                       @BuildProofRepoForensics      │
            │                       (repo_forensics.py)           │
            │                                                     │
            └───────────── Phase 2 → Final Consensus Verdict ◀────┘
```

Each Python agent: loads `.env` → reads `agent_config.yaml` block → reads its `prompts/*.md` system prompt → `AnthropicAdapter(provider_key, prompt)` → `Agent.create(adapter, agent_id, api_key)` → `await agent.run()` indefinitely. Verified against the installed SDK: `band.Agent.create` and `band.adapters.anthropic.AnthropicAdapter` both accept these kwargs (full signatures introspected in Section 10).

---

## 3. External Integration Depth Scorecard

### 3.1 Browserbase

- **Depth: moderate.** Real session creation, real CDP connection, real DOM extraction. Not just a sponsor logo.
- **Files:** `adapters/ingest/browserbaseProjectIngestor.ts`, wired in `app/api/audit/route.ts`.
- **What it actually does:** Creates a Browserbase session, connects Playwright over CDP, navigates to the user URL (30s timeout), runs an in-page `page.evaluate` that pulls title (`h1`), description (Devpost-shaped selectors `#app-details-left p`, `.app-details p`, `.project-description p`, with `main`/`article`/`[role=main]`/`.content` fallback), built-with tags (`#built-with .software-list-content span`, `#built-with span.cp-tag-secondary`, `[data-field='built-with'] span`, `.built-with-section span`), and the first `github.com` link that isn't `/login` or `/marketplace`.
- **Core or add-on:** Core to the Level-3 product flow (Devpost URL → audit). The Level-2 manual flow does not depend on it.
- **Failure / fallback:** Returns `null` if either env var is missing, on any thrown error, or on the 45 s overall `Promise.race` timeout. The route then runs `mockProjectIngestor` and, if Browserbase was attempted, prefixes the warnings with "Browserbase ingestion encountered an error". The UI's `IngestMetaCard` colour-codes the three states (indigo for Browserbase, amber for fallback).
- **Judge demo proof:** Show the integration-status card with **Browserbase: enabled**. Paste a public Devpost URL. The report header shows an indigo **Project URL extraction · Browserbase** card with the *real* extracted title and built-with tags, followed by the actual audit running on the page's own description text.

### 3.2 GitHub scanner

- **Depth: strong (for hackathon scope).** Hand-rolled REST client with no SDK dependency, real quotas, real parallelism, real budget control.
- **Files:** `adapters/github/realScanner.ts`, `utils/parseGitHubUrl.ts`, `pipeline/scanRepo.ts`.
- **What it actually does:** Parses HTTPS or SSH URLs through a strict per-segment regex. Calls `GET /repos/{o}/{r}` for the default branch, `GET /git/trees/{sha}?recursive=1` for the full tree, then in parallel pulls README, `package.json`, and five Python dep files (`requirements.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, `setup.py`). Filters the tree by extension allowlist (`.ts/.tsx/.js/.jsx/.py/.go/.rs/.java`), skip-dir prefixes, lockfiles, and a 200 KB pre-fetch size guard; then fetches up to 15 source files, each truncated to 8 KB. Uses `GITHUB_TOKEN` if set (Bearer) but works unauthenticated.
- **Core or add-on:** Core. Evidence quality collapses to "text-only" without it.
- **Failure / fallback:** Returns `RepoScan` with `source: "unavailable"` on any failed `fetchJSON` (HTTP errors, network errors, all caught). The pipeline marks the step as `fallback`, the UI shows a yellow "Repository scan unavailable" note with token guidance, and the LLM judge receives `repoUnavailable: true` (constrains it to `Unsupported by repository evidence` or `No implementation evidence found`).
- **Judge demo proof:** Paste any popular public repo (e.g. a known LangGraph or Pinecone sample), run audit, scroll to a claim card showing concrete file-tree paths (e.g. `agents/planner.py`) plus a real package.json hit. Then paste an obviously-empty repo to show the contrast.

### 3.3 OpenAI / Anthropic LLM provider

- **Depth: strong.** Two providers, two call sites each (extractor + judge), four prompts, strict JSON-schema validation, defensive `null`-returns at every error boundary, deterministic and identical-system-prompt parity between providers.
- **Files:** `adapters/llm/provider.ts`, `adapters/llm/{openai,anthropic}ClaimExtractor.ts`, `adapters/llm/{openai,anthropic}ClaimJudge.ts`, `adapters/llm/types.ts`. Wired through `pipeline/extractClaims.ts` and `pipeline/judgeClaims.ts`.
- **What it actually does:** `selectProvider()` reads `LLM_PROVIDER` (defaults `auto`) and the two key env vars; auto prefers Anthropic. **Extractor:** sends user description with a six-category enum prompt; both providers asked for strict JSON; the parsing validators discard claims whose `category` isn't in the allowed set. **Judge:** receives the scored claims + evidence and `repoUnavailable` flag; system prompt encodes the five verdict labels and grounding rules ("Strongly supported only when ≥2 positive evidence items from different source types"); validator rejects any output that omits a claim ID or returns an unknown label and triggers deterministic fallback. OpenAI calls go through native `fetch` to `chat/completions` with `response_format: json_object`; Anthropic uses the official SDK with `claude-haiku-4-5-20251001`.
- **Core or add-on:** Core for narrative ("the LLM judges the evidence"). System still works end-to-end without any LLM key — keyword extractor + deterministic threshold judge.
- **Failure / fallback:** Any non-200, parse error, or schema violation → `null` → pipeline records `keyword-fallback` or `deterministic-fallback` source. The UI badges these in amber ("LLM call failed").
- **Judge demo proof:** Show the integration-status card with **LLM provider: anthropic** (or openai), then show "Claim extraction: LLM · Anthropic" and "Judge: LLM · Anthropic" in the report header, and the **Assessment** paragraph (rationale) under each claim card.

### 3.4 Sentry

- **Depth: moderate.** Real init, real event capture, real error capture. Not just installed.
- **Files:** `adapters/trace/sentryTraceAdapter.ts`, wired in `pipeline/index.ts` (trace export) and `app/api/audit/route.ts` (error capture).
- **What it actually does:** Lazy `Sentry.init({ dsn, tracesSampleRate: 0 })` on first use. After every audit, `exportTrace` posts a single `captureEvent` with `extra` metadata: audit mode, total duration, step count, scan/extraction/judge sources, step status map. **Critically does not send** project text, source code, or any key. On unhandled pipeline error, `captureSentryError` logs the exception with `Sentry.flush(2000)`.
- **Core or add-on:** Add-on observability. The local in-UI run-trace panel is independent and always works.
- **Failure / fallback:** Missing `SENTRY_DSN` → `tryInit` returns false → `exportTrace` returns `"disabled"`; thrown error → returns `"failed"`. The TracePanel labels both states.
- **Judge demo proof:** Run an audit; expand "Run trace"; point to **External trace export: Sentry** (green). Open Sentry dashboard and show the `BuildProof audit trace` event with the safe-metadata extras.

### 3.5 Band

- **Depth: moderate-to-strong as a Band integration, with a weak seam.** Four real Python agents with distinct prompts; uses the actual `band-sdk` API (verified against installed package). Packet generation is fully automated from the live audit. **The handoff to the Band room is a clipboard paste**, which is honest but limits the "wow" factor.
- **Files:** `band_agents/{lead_judge,claim_prosecutor,evidence_defender,repo_forensics}.py`, `band_agents/prompts/*.md`, `band_agents/agent_config{,.example}.yaml`, `band_agents/requirements.txt`; web side `lib/bandCourtPacket.ts` and `BandCourtPanel` in `app/page.tsx`.
- **What it actually does:** Each agent script loads env, reads its block from `agent_config.yaml`, loads the matching prompt markdown, constructs `AnthropicAdapter(provider_key=..., prompt=...)`, then `Agent.create(adapter=..., agent_id=..., api_key=...)`, then `await agent.run()` (long-running). The web app turns the audit report into a structured text packet (project name, scores, ingestion + scan status, per-claim verdict / detector / score / rationale, supporting evidence bullets, missing-evidence bullets, agent role docs and rules) and pre-builds a `@BuildProofLeadJudge` starter preamble that explicitly instructs the Lead Judge to delegate first. Lead Judge's prompt enforces a two-phase deliberation (call specialists in Phase 1, synthesize in Phase 2) so delegation is observable.
- **Core or add-on:** A second-pass auditor sitting on top of the deterministic first-pass result. Genuinely additive: the in-browser report stands on its own; Band is a debate layer.
- **Failure / fallback:** If agents aren't running, nothing happens after pasting — the report and packet are unaffected. The README and DEMO documents both call this out.
- **Judge demo proof:** Bring up the **Band Audit Court** panel (auto-expanded after audit) with its four colour-coded handles and three copy buttons. In a separate window, the four Python terminals should each show "Starting BuildProofX (@handle)…". Click *Copy combined Band room message*, paste into Band, send. Lead Judge opens court → @-mentions the three specialists → each replies in role → Lead Judge posts a **Final Consensus Verdict** that names each claim and its strongest evidence.

### 3.6 Other notable libraries

- **`playwright-core` (^1.61.0):** used only by the Browserbase ingestor for the CDP connection. Core to that integration.
- **`@browserbasehq/sdk` (^2.14.1):** session creation.
- **`@sentry/node` (^10.59.0):** error and event capture.
- **`@anthropic-ai/sdk` (^0.105.0):** Anthropic client; OpenAI uses native `fetch`.
- **No `openai` SDK in package.json** (deliberate — the extractor and judge call `chat/completions` directly via `fetch`). This is fine and reduces dependency surface.
- **No `octokit`/`@octokit/*`:** GitHub scanner is hand-rolled. Fine.
- **No `redis`, no `arize`, no `supabase`** despite CLAUDE.md mentioning them as candidates. These were not built and are absent from `package.json`; TODO.md acknowledges this explicitly. The integration-status card and DEMO.md do not advertise them, so there is no false-promise risk.

---

## 4. Core Product Logic Review

### 4.1 Claim extraction quality

- LLM extractor (both providers): tight six-category enum; same system prompt; user text passed verbatim. Parser strictly enforces that `category` is one of the six. Rich-but-imperfect — depends on the LLM not adding categories not in the spec.
- Keyword extractor: respects the bare-word boundary rule explicitly (comment cites `rag`/`storage` and `live`/`deliver` as the motivating false positives). Phrases and hyphenated terms allowed as substrings. The category keyword sets cover the obvious bases (e.g. RAG includes `pinecone`, `chroma`, `weaviate`, `faiss`, `pgvector`, `qdrant`). Will miss subtler claims.
- Dedupe: LLM result is de-duplicated by category before mapping back to internal definitions.

### 4.2 Evidence matching quality

- Each detector probes four orthogonal evidence channels: dep file (Node `package.json` + Python `requirements.txt`/`pyproject.toml`/`setup.cfg`/`Pipfile`/`setup.py`), file-tree pattern, README term, and source-file snippet match. Solid coverage.
- Python dep parser (`pyLineMatches`) handles both `crewai>=0.1`/`"crewai"`-quoted forms and strips comments. This is well above token-bucket level for a hackathon.
- Voice detector is the most thoughtful: deliberately treats `openai` and `groq-sdk` as **broad** deps that only count if there is also an in-source voice signal. This is exactly the kind of false-positive guard that makes a credibility tool credible.
- Source-snippet search is capped at one match per file with `slice(0, 2)` of overall matches per category — a sensible noise cap.

### 4.3 Detector quality

- All six detectors share a uniform skeleton (positives gathered → if none, single absence evidence → otherwise targeted absences appended to calibrate score). This makes them debuggable, scorable, and explainable. They are not "ELIZA matches": they read deps, paths, README, AND source code together.
- Pattern lists are concrete and current (`StateGraph`, `AgentExecutor`, `ultralytics`, `@modelcontextprotocol/sdk`, `text/event-stream`, `MediaRecorder`, `getUserMedia`, `cv2`, `YOLO`, etc.).
- Limits: case-insensitive substring checks can over-fire on common tokens (e.g. multi-agent `coordinator`, voice `audio`). The scoring model + targeted absences partially counterbalance this.

### 4.4 Scoring / verdict logic

- `scoreAuthenticity`: `positives / total * 100`. Pure, deterministic.
- `labelFromScore` thresholds: ≥76 / ≥51 / ≥26 / ≥1 / 0. Reasonable buckets.
- LLM judge overrides verdict label only; the score remains the deterministic ratio. This is a smart split: the LLM owns the *interpretation*, the math owns the *number*. Avoids the LLM making up its own scores.
- Judge prompt explicitly bans inventing evidence, requires "Strongly supported" to need ≥2 positive evidence items from *different* source types, and forces low verdicts when `repoUnavailable: true`. These constraints reduce hallucinated overclaims.
- One asymmetry: when the deterministic fallback fires, the verdict comes straight from `labelFromScore(score)`, but the LLM judge can return *any* label regardless of score. That is mostly fine (prompt grounding does the work), but you lose the "score ≥76 ⇒ Strongly supported" guarantee. If a sceptical judge asks "why is a 60/100 'Strongly supported'?", the answer is "the LLM said so" — defensible but worth knowing.

### 4.5 Safety language enforcement

- **Two independent layers.**
  1. `pipeline/applySafety.ts` runs over every verdict's `claim`, each evidence `text`, and `rationale` if present, replacing any of `fake | lying | scam | fraud | deceptive` (case-insensitive) with `[removed]`.
  2. Both LLM judge prompts and all four Band agent prompts explicitly forbid the same list. The Lead Judge prompt also pins the five allowed verdict labels.
- Verdict labels themselves are constrained by the `VerdictLabel` union and the LLM judge's enum validator — they cannot ever contain a banned word.
- **What the sanitizer does *not* cover:** `projectName`, `report.githubUrl`, `ingestMeta.title`, `ingestMeta.builtWith`, the trace messages, and the Band court packet body (which is built from already-sanitized verdicts, but joins them with literal labels like "Missing evidence:"). In practice these come from URL parsing or the user's own paste, so accusatory wording can only appear if the user typed it themselves. Low concrete risk, worth noting.
- **Sanitizer scope subtlety:** `new RegExp(word, "gi")` does substring matching, so legitimate words containing these letter sequences (e.g. a hypothetical product called "Snakemake" — which contains `make` not `fake`, so the actual collisions are rare) would also be altered. The conservative choice is intentional and acceptable.
- **Verified by grep:** No accusatory word appears in `components/`, `app/`, or `app/api/`. The only files that contain the banned list are (a) `applySafety.ts` (definition), (b) LLM judge prompts (instructions to avoid), and (c) Band agent prompts (instructions to avoid). The product surface is clean.

### 4.6 Does the system avoid unsupported accusations?

- Yes. The five-label vocabulary itself avoids accusation: the worst label is "No implementation evidence found" (evidence-shaped, not character-shaped). The judge prompt forces low verdicts when no repo is scannable. Even after an LLM hallucinated "Strongly supported", the score on the card stays based on real evidence counts.
- A reasonable judge will read this and conclude the tool measures *evidence presence*, not *intent to deceive*. That framing is consistent across UI, packet, and Band prompts.

### 4.7 Is the report understandable to a judge/user?

- Yes, comfortably. The report layout: project header → overall score with coloured bar and human label → detector grid → per-claim cards with claim quote → evidence list with `✓`/`✗` and `[source]` tag → optional Assessment paragraph from the LLM. Plus a collapsible Run trace and the Band panel.
- Integration-status card surfaces every fallback up front. Judge never has to guess whether a path is mocked.

---

## 5. Band Audit Court Review

### 5.1 Is Band used meaningfully?

Yes. Four distinct agents with distinct prompts and distinct evidence-classification responsibilities, talking to each other through a real Band room. The integration is not "Band logo in footer" — it is a working second-pass deliberation flow. Lead Judge's prompt enforces two phases (delegate first, synthesize after), which is exactly the structure that justifies multi-agent over a single LLM call.

### 5.2 Is the four-agent structure well-designed?

- **Lead Judge** owns coordination and the consensus verdict; will not skip Phase 1.
- **Prosecutor** evaluates against an evidence-strength hierarchy (README < dependency < file-path < source-pattern) and recommends a downgrade verdict where overstated.
- **Defender** presents the strongest honest case using the same hierarchy, with explicit "do not overclaim" rules.
- **Forensics** classifies signals into README / dependency / source-implementation / combined and states what each *technically* proves vs. what it does not.

This is a clean adversarial-collaborative split, not four cosmetic personas. The prompts are short, role-specific, and reference the same evidence vocabulary the packet uses. Good design.

### 5.3 Does the app naturally generate the packet?

Yes, automatically and deterministically. `generateBandCourtPacket(report)` is a pure function called on render — no extra server round trip. The packet includes every field that the agents need to evaluate (project name, scores, ingestion source, scan source, claim extraction source, judge source, per-claim evidence with positive/negative sign, agent role docs, allowed verdict labels, banned-language rule). Output is stable and free of secrets, source code, and env values.

### 5.4 Is the manual paste bridge acceptable for hackathon demo?

Acceptable, but the weakest seam. Pros: zero risk of OAuth/SSO bugs during demo, judge can read the packet on screen first, the same packet can be re-used across rooms. Cons: feels less "automated" than the rest of the pipeline; one extra hop the judge will notice. If asked, frame it explicitly: *"The packet is generated by BuildProof; Band is the deliberation venue; the bridge is intentional because it lets us inspect and audit what we send."*

### 5.5 Is Lead Judge delegation clear?

Yes — twice over. (1) The starter preamble in `BAND_STARTER_PREAMBLE` explicitly says "do not give a final verdict immediately. First, call the three specialist agents yourself" and names them. (2) The Lead Judge's own system prompt repeats this in Phase 1 with the exact @-mentions to use. The Lead Judge alone is the only handle @-mentioned by BuildProof; the specialists are addressed by the Lead Judge, which is the right narrative.

### 5.6 Transcript pattern to produce for the Band sponsor booth

Aim to capture a transcript that looks like this:

1. **You (paste):** combined Band room message — preamble + packet.
2. **@BuildProofLeadJudge:** ~5-sentence opening — names project, states overall score, calls each specialist by handle with one specific instruction each. *No verdict yet.*
3. **@BuildProofClaimProsecutor:** bulleted per-claim challenges — "README-only", "dependency without source usage", "verdict X is higher than tier supports".
4. **@BuildProofEvidenceDefender:** bulleted per-claim defences — names the strongest evidence item, admits gaps.
5. **@BuildProofRepoForensics:** classification block per claim — Signals/Classification/Technical finding.
6. **@BuildProofLeadJudge (Phase 2):** the **Final Consensus Verdict** template — Strongly / Partially / Unsupported buckets, repo notes, recommended safer wording, 2–3 sentence final verdict.

If something fails live, fall back to the screenshot of a saved transcript from a dry run. Record at least one good run beforehand.

---

## 6. Demo Readiness Checklist

### 6.1 Must be running

- [ ] Next.js dev server: `npm run dev` from `/Users/sanghyun/BuildProof` → http://localhost:3000
- [ ] (For Band demo only) all four Python agents in separate terminals; each prints "Starting BuildProof<Role> (@handle)…" within a few seconds
- [ ] (For Band demo only) the four agents added as members of one Band room; you have that room open in the foreground

### 6.2 Env variables needed (names only — do not print values)

| Env var | Purpose | Required for demo? |
|---|---|---|
| `GITHUB_TOKEN` | Raise GitHub rate limit from 60→5,000 req/hr | Strongly recommended for repeated audits |
| `ANTHROPIC_API_KEY` | Anthropic claim extraction + LLM judge | Recommended (powers the headline "LLM judge" story) |
| `OPENAI_API_KEY` | OpenAI claim extraction + LLM judge (alternative) | Optional |
| `LLM_PROVIDER` | `auto` / `anthropic` / `openai` | Optional; default `auto` |
| `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | Real Devpost URL ingestion | Required only if you want to demo Project-URL mode against a real URL; otherwise mock fallback is shown clearly |
| `SENTRY_DSN` | Server-side trace + error export | Optional but is the only proof of the Sentry integration |
| `ANTHROPIC_API_KEY` in `band_agents/.env` | Powers Band agents | Required only for live Band demo |

All env files (`.env.local`, `band_agents/.env`, `band_agents/agent_config.yaml`) are gitignored. Verify with `git check-ignore .env.local band_agents/agent_config.yaml band_agents/.env` before any push.

### 6.3 Commands to run (in order, separate terminals)

```bash
# Terminal 1 — main app
cd /Users/sanghyun/BuildProof && npm run dev

# Optional: Band demo
cd /Users/sanghyun/BuildProof/band_agents && python lead_judge.py        # T2
cd /Users/sanghyun/BuildProof/band_agents && python claim_prosecutor.py  # T3
cd /Users/sanghyun/BuildProof/band_agents && python evidence_defender.py # T4
cd /Users/sanghyun/BuildProof/band_agents && python repo_forensics.py    # T5
```

### 6.4 Buttons to click (judge demo path)

1. Open http://localhost:3000.
2. Confirm the **Integration status** card on the form shows the keys you expect (green where they should be, yellow/grey otherwise).
3. **Manual tab:** click the **RAG + MCP** preset → paste a real public GitHub URL → **Run Audit**.
4. Walk one *Strongly supported* claim card: claim, ✓ evidence bullets (README, dep, file path, source), Assessment paragraph (LLM rationale).
5. Walk one *No implementation evidence found* / *README-only* card for contrast.
6. Expand **Run trace** — point at all-green steps including the **External trace export: Sentry** line.
7. **Project URL tab:** paste a Devpost URL. Show the indigo **Project URL extraction · Browserbase** card with the real title and built-with tags. Re-run audit, show the report on the *real* description text.
8. Expand **Band Audit Court** panel — point at four agent handles → click **Copy combined Band room message** → paste into Band → watch deliberation unfold.

### 6.5 Proof per sponsor integration

| Sponsor | On-screen proof |
|---|---|
| **GitHub** | Green "GitHub scan succeeded" + concrete file paths in claim cards |
| **OpenAI or Anthropic** | "Claim extraction: LLM · {provider}" + "Judge: LLM · {provider}" + Assessment paragraph |
| **Browserbase** | Indigo "Project URL extraction · Browserbase" card with real extracted title and tags |
| **Sentry** | Run trace shows "External trace export: Sentry" in green; corroborate with the Sentry web dashboard event |
| **Band** | Four agent terminals printing handles; Band room transcript showing delegation → specialist replies → Final Consensus Verdict |

### 6.6 What can fail and live-recovery

| Failure mode | Visible signal | Recovery |
|---|---|---|
| GitHub rate-limited or repo private | Yellow "Repository scan unavailable" note | Have `GITHUB_TOKEN` exported; otherwise narrate "evidence falls back to text-only — still useful" |
| LLM key invalid / quota exceeded | Amber "LLM call failed — keyword fallback" badge in report | Continue — keyword + deterministic judge still produces a defensible report |
| Browserbase session 5xx or page hang | Amber "demo data · Browserbase fallback" card | Switch to **Manual** tab and paste description + GitHub URL; narrate manual fallback script |
| Sentry export hits a network blip | "External trace export: export failed" in trace | The audit is unaffected; mention that local trace still works and Sentry retries on next run |
| Band agent disconnects or didn't start | No reply from the missing handle in the room | Restart that one agent script (others stay up); meanwhile show the local audit report alone — it stands on its own |
| Browser clipboard permission denied | Copy button shows old text | Use the *Preview court packet* expander and select-all manually |

### 6.7 Things to *not* do live

- Do not commit anything during the demo (might surface the credentials in `agent_config.example.yaml`).
- Do not enter a private/throwaway-token-protected repo URL; the unauth path's 60 req/hr limit is shared and you may have spent some already.
- Do not type a URL in Project-URL mode without confirming you set both Browserbase env vars unless you want the demo-fallback card.

---

## 7. Objective Depth Rating

| Dimension | Score (1–10) | Note |
|---|---|---|
| **Technical depth** | 8 | Real REST scanner with budgets, six detectors with dep+tree+README+source signals, dual LLM providers with strict JSON validation, Browserbase via CDP+Playwright, working Band SDK integration. Above hackathon median. Held back from 9–10 by lack of caching, lack of unit tests, and one minor gap (deterministic judge vs LLM verdict-vs-score asymmetry). |
| **Product clarity** | 9 | "Does the repo match the pitch?" is the entire pitch and the entire UI. Claim → Evidence → Verdict is reflected at every layer. Every fallback is visible to the user. |
| **Sponsor integration quality** | 7.5 | GitHub: strong. LLM providers: strong. Browserbase: moderate-real. Sentry: moderate-real. Band: moderate-real with a manual seam. No fake integrations. CLAUDE.md mentions Redis/Arize/Supabase that were not built, but the *visible* product does not advertise them, so no false-promise risk. |
| **Demo reliability** | 7 | Build clean, type-check clean, fallback paths everywhere, integration-status card removes guesswork. Risks: lint command broken (cosmetic), Browserbase selectors brittle to Devpost DOM changes, Band live demo depends on four local processes + room state. |
| **Novelty** | 7 | Devpost-claim auditor is a fresh hackathon problem framing. The two-phase Band deliberation pattern (Lead Judge delegates first) is non-trivial. The Claim → Evidence → Verdict formulation plus the safety-vocabulary discipline is more thoughtful than the average "AI judge" project. Not 9+ because the underlying detectors are pattern-based; the novelty is in framing, not algorithms. |
| **Judge impressiveness** | 8 | Tight UX with always-visible diagnostics will read as "shipped product, not prototype". The Band court is a strong second-act moment if the live transcript lands. Could be 9 if the Band bridge were a one-click POST to a webhook instead of a paste. |

**Overall: 7.7/10.** A well-engineered hackathon project that is honest about its boundaries, degrades gracefully under any failure, and tells one clear story end-to-end.

---

## 8. Critical Bugs / Risks

### 8.1 Must fix before demo

1. **Real Band credentials are committed in `band_agents/agent_config.example.yaml`.** The file contains four `agent_id` UUIDs and `band_a_…` API keys that are NOT placeholder strings; the gitignored `agent_config.yaml` is byte-identical. Anyone with repo read access has working keys. Action: rotate all four Band API keys in the Band dashboard, replace the values in `agent_config.example.yaml` with obvious placeholders (e.g. `"REPLACE_WITH_BAND_AGENT_UUID"`, `"REPLACE_WITH_BAND_API_KEY"`), keep the real values only in the gitignored `agent_config.yaml`. Recommendation only — no code change has been made.
2. **`npm run lint` is broken under Next.js 16.** `next lint` was removed; the script in `package.json` errors out with `"Invalid project directory provided, no such directory: /Users/sanghyun/BuildProof/lint"`. Not a runtime risk, but anyone running the listed script before the demo will see a confusing failure. Action: either delete the `lint` script, or replace with `eslint .` after adding an `.eslintrc`.
3. **Verify the Band agent UUIDs/keys actually correspond to live Band agents before the demo.** If they were spun up and torn down during development, the agents will fail to `agent.run()`. Boot one and watch for "Starting…" output ahead of time.

### 8.2 Nice to fix

4. **Browserbase selector chain is brittle.** Devpost-shaped class names (`#app-details-left p`, `#built-with .software-list-content span`) are not stable. Add a smoke test or a known-good cached URL to demo against. Files: `adapters/ingest/browserbaseProjectIngestor.ts`.
5. **Deterministic-judge vs LLM-judge label/score asymmetry.** When LLM returns "Strongly supported" but the underlying score is 50, the card shows the verdict + a 50/100 number. Consider either (a) constraining LLM labels to deterministic-equivalent bands when the score is unambiguous, or (b) explaining the divergence in the Assessment paragraph. Files: `pipeline/judgeClaims.ts`.
6. **`mockScanner.ts` is dead code.** No import path runs it; `pipeline/scanRepo.ts` only references `realScanner`. Either delete or wire it as the test fixture it was originally intended to be. Files: `adapters/github/mockScanner.ts`, `pipeline/scanRepo.ts`.
7. **Trace per-step duration is not recorded.** Total only. The `Run trace` panel would land harder with per-step timings (especially to show LLM judge vs detectors). Files: `lib/trace.ts`, `pipeline/index.ts`.
8. **No unit tests.** Pipeline stages are pure and trivially testable. A handful of detector cases (positive, negative, README-only) would harden against regressions. Files: `pipeline/*`, `detectors/*`.
9. **Banned-word regex uses substring matching.** Low-impact — the choice is conservatively safe — but worth a word-boundary upgrade so legitimate words containing the letters (`make`, `aware`, etc.) are not altered. Files: `pipeline/applySafety.ts`.
10. **`projectName`, `ingestMeta.title`, `ingestMeta.builtWith` are not passed through `applySafety`.** Low concrete risk (they come from URL parse or user paste), but the Band court packet inlines them verbatim. Files: `pipeline/applySafety.ts`, `lib/bandCourtPacket.ts`.
11. **In `browserbaseProjectIngestor`, the inner `page.evaluate` callback runs on a fresh page context; the chosen `context.pages()[0]` may be a Browserbase about:blank.** Usually fine, but worth defensively `await page.waitForLoadState("networkidle")` after `goto` for SPA-heavy pages.

### 8.3 Do not fix now / too risky

12. **Switching the OpenAI adapter to the `openai` SDK.** Native `fetch` is working and adds zero dependency surface. Don't churn before demo.
13. **Wiring Redis / Arize / Supabase.** TODO.md lists these; CLAUDE.md mentions them. Building any of them now would risk the demo path. The visible product never advertises them, so there is no credibility cost to leaving them un-built.
14. **Refactoring the deterministic judge thresholds.** Changing the score buckets would re-shuffle every demo audit's verdicts and invalidate the sample transcripts. Lock for demo.
15. **Replacing the manual Band paste with an HTTP webhook.** Pleasant idea but introduces a new failure mode the day before demo. Defer.

---

## 9. Recommended Final Polish Plan

Five highest-impact items, ranked by impact-per-time.

### 9.1 Rotate and scrub the Band keys (15 min · LOW risk · CRITICAL)

- **Why it matters:** real API keys in a committed `*.example.yaml` is the kind of mistake that costs sponsor goodwill and could result in unauthorised use of your account on demo day.
- **Steps:** in the Band dashboard, regenerate each agent's API key; update `band_agents/agent_config.yaml` (gitignored) with the new values; overwrite `band_agents/agent_config.example.yaml` with obvious placeholder strings; `git log --diff-filter=A band_agents/agent_config.example.yaml` to confirm the leaked keys live in history and rotate them rather than try to scrub git history.
- **Files:** `band_agents/agent_config.example.yaml`, `band_agents/agent_config.yaml`.

### 9.2 Pre-record a Band Audit Court transcript and screenshot (30 min · LOW risk · HIGH judge impact)

- **Why it matters:** the Band live demo has many moving parts (four processes, room state, network). A 60-second pre-recorded GIF or screenshot is your insurance policy and also makes the asynchronous Lead-Judge → specialists → consensus arc easy to follow even if the live run is fast.
- **Steps:** trigger an audit on a real repo, paste the combined Band room message, let the deliberation finish, capture the room. Save under `data/` (already gitignored if your data path follows the existing pattern) or include as a static asset.
- **Files:** new `public/band-demo-screenshot.png` or similar.

### 9.3 Replace the broken `lint` script and add a minimal eslint config (20 min · LOW risk · prevents demo-prep confusion)

- **Why it matters:** the script error is small but visible. Easy win.
- **Steps:** either (a) delete `"lint": "next lint"` from `package.json` and remove the eslint deps, or (b) keep eslint and add an `eslint.config.mjs` with `next/core-web-vitals` extends and re-point the script.
- **Files:** `package.json`, possibly new `eslint.config.mjs`.

### 9.4 Add per-step durations to the trace panel (45 min · LOW risk · noticeable polish)

- **Why it matters:** showing "GitHub scan: 1,820 ms · LLM judge: 940 ms · detectors: 12 ms" reads as a real production-grade tool. Currently shows only total.
- **Steps:** capture `Date.now()` at the start of each `collector.add` block in `pipeline/index.ts` and record an explicit `durationMs` per step (the `AuditTraceStep` interface already declares `durationMs?: number`). Render in `TracePanel`.
- **Files:** `lib/trace.ts`, `pipeline/index.ts`, `app/page.tsx`.

### 9.5 Cache GitHub scans by `owner/repo` for the session (30 min · LOW risk · saves rate-limit headroom)

- **Why it matters:** the demo will re-audit the same repo several times during a single sitting. Each audit is ~24 requests. An in-memory `Map<string, RepoScan>` keyed by `${owner}/${repo}` cuts that to one. No persistence needed.
- **Steps:** in `adapters/github/realScanner.ts`, wrap `scan()` with an in-process cache; clear on server restart. No types change.
- **Files:** `adapters/github/realScanner.ts`.

---

## 10. Commands Run (verification results)

All commands run read-only against the local working tree. No API calls were made to any sponsor service. No secrets were printed.

### 10.1 `npx tsc --noEmit`

```
EXIT_CODE=0
```
**Result:** PASS — zero type errors across the entire `**/*.ts(x)` set covered by `tsconfig.json`.

### 10.2 `npm run build`

```
> buildproof@0.1.0 build
> next build

▲ Next.js 16.2.9 (Turbopack)
- Environments: .env.local
  Creating an optimized production build ...
✓ Compiled successfully in 1787ms
  Running TypeScript ...
  Finished TypeScript in 1053ms ...
  Collecting page data using 6 workers ...
✓ Generating static pages using 6 workers (5/5) in 334ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/audit
└ ƒ /api/status
```
**Result:** PASS — clean compile, all routes resolved, `/api/audit` and `/api/status` correctly registered as dynamic.

### 10.3 `npm run lint`

```
> buildproof@0.1.0 lint
> next lint
Invalid project directory provided, no such directory: /Users/sanghyun/BuildProof/lint
```
**Result:** FAIL — `next lint` no longer exists in Next.js 16 (it interprets `lint` as a project directory). No `.eslintrc*` file exists either; a direct `npx eslint` run also fails with "couldn't find a configuration file". **Cosmetic only — no runtime impact.** See recommendation 9.3.

### 10.4 Safe Python checks for `band_agents/`

Syntax check (no execution):

```
OK  syntax: lead_judge.py
OK  syntax: claim_prosecutor.py
OK  syntax: evidence_defender.py
OK  syntax: repo_forensics.py
```

Import availability inside `band_agents/.venv`:

```
OK  yaml
OK  dotenv
OK  anthropic
OK  band
OK  band.adapters.anthropic
```

SDK signature compatibility check — the installed `band-sdk` accepts the call shapes used by every agent:

```
AnthropicAdapter(
  model='claude-sonnet-4-5-20250929',
  provider_key=None,
  system_prompt=None,
  prompt=None,           # ← used by every agent
  ...
  api_key=None,
  custom_section=None,
  ...
)

Agent.create(
  adapter,               # ← used
  agent_id,              # ← used
  api_key,               # ← used
  ws_url='wss://app.band.ai/api/v1/socket/websocket',
  rest_url='https://app.band.ai',
  config=None,
  ...
)
```

**Result:** PASS — the Band agent scripts compile, the imports resolve in the bundled venv, and the constructor signatures match. The "Known issue" in `band_agents/README.md` ("Band SDK package name and exact API should be verified") is in fact satisfied by the installed version.

### 10.5 Forbidden-word scan in user-facing surfaces

```
grep -E "\b(fake|fraud|scam|lying|deceptive)\b" components/ app/ app/api/  →  no matches
```

The five banned tokens appear only in:

1. `pipeline/applySafety.ts` — definition of `BANNED_WORDS` (intended).
2. `adapters/llm/openaiClaimJudge.ts`, `adapters/llm/anthropicClaimJudge.ts` — system prompts forbidding their use (intended).
3. `band_agents/prompts/{lead_judge,claim_prosecutor,evidence_defender,repo_forensics}.md` — agent prompts forbidding their use (intended).
4. `CLAUDE.md` — project rule definitions (developer-facing only).

**Result:** PASS — no banned word reaches a user-facing component or verdict label.

### 10.6 Env / config redaction (no values printed)

```
ls -la confirms these files exist and are gitignored:
  .env.local                                (660 bytes)
  band_agents/.env                          (129 bytes)
  band_agents/agent_config.yaml             (1228 bytes)
  band_agents/agent_config.example.yaml     (1228 bytes — IDENTICAL to .yaml, see Section 8.1)

Env var names defined in .env.local (no values printed):
  GITHUB_TOKEN, OPENAI_API_KEY, BROWSERBASE_API_KEY,
  BROWSERBASE_PROJECT_ID, SENTRY_DSN, ANTHROPIC_API_KEY, LLM_PROVIDER

Env var names defined in band_agents/.env (no values printed):
  ANTHROPIC_API_KEY
```

**Result:** All sponsor integrations are env-gated and the variables are present locally. `.gitignore` excludes `.env.local`, `band_agents/.env`, and `band_agents/agent_config.yaml`. *Section 8.1 remains the only credentials concern.*

---
*End of review. All findings above are recommendations only — no source files were modified.*
