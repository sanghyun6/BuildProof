# BuildProof — Architecture & External Technology Audit

*Investigation only. No code was changed. No keys were read or printed.*

---

## Executive Summary

BuildProof is a Next.js 16 app that performs evidence-based audits of project credibility:
given a project description (or a Devpost URL) and a GitHub URL, it (1) extracts technical
claims, (2) scans the repo, (3) runs six static detectors over the scan, (4) judges each
claim using an LLM with strict grounding rules, and (5) returns a labeled report with
trace, compression, and Band Audit Court packet panels.

**What is genuinely good**
- Clean stage-by-stage pipeline (`pipeline/index.ts`) with a `TraceCollector` that records
  every boundary.
- Disciplined adapter pattern: every external service is behind a typed interface, and
  every adapter returns `null` on failure so the pipeline never throws.
- TokenRouter integration is real and end-to-end (extractor + judge), with non-trivial
  infrastructure around it: reasoning-tag stripping, safe-body redaction, JSON-extraction
  fallback chain, dedicated smoke endpoint, integration-status surfacing.
- Strong "no LLM key required" demo path: keyword extractor + deterministic judge always work.
- Compression layer is a real, working local claim-aware compressor; the remote
  ("The Token Company") variant is correctly gated and falls back safely.

**What is genuinely weak**
- TokenRouter only uses **one** model (`MiniMax-M3`). The integration is reliable but it
  is not actually *routing* — the name "TokenRouter" deserves multi-model behavior.
- The Token Company endpoint is a **placeholder domain** (`api.thetokencompany.example`).
  Compression for demos is always the local compressor; the remote branch never fires
  unless a real URL is configured.
- The static detectors are well-curated keyword lists, not real code analysis. The
  authenticity `score` is just `positive / total` evidence ratio.
- No tests at all.
- The Band Audit Court is a **copy-paste** workflow — the four Python sidecar agents are
  real, but the app does not call into them; the user pastes a packet into Band manually.
- Auto-priority order in `selectProvider()` puts TokenRouter **third** (Anthropic →
  OpenAI → TokenRouter). If TokenRouter is the sponsor highlight, this ordering is
  working against the demo story.

**Overall hackathon score: 7 / 10.** Architecture and discipline are above hackathon
average. The TokenRouter integration is honest and well-engineered. The single biggest
opportunity to lift the project is to make TokenRouter visibly do something a single
provider cannot — a side-by-side Anthropic vs. MiniMax-M3 judge comparison panel is the
highest-leverage, lowest-risk depth play.

---

## 1. Current System Architecture

### 1.1 Layer map

| Layer | Files | What it does |
|---|---|---|
| UI / frontend | `app/page.tsx`, `components/{ClaimCard,DetectorSummary,EvidenceItem,ScoreBar,VerdictBadge}.tsx` | Manual + Project URL tabs, sample preset buttons, integration status, audit report, trace panel, compression panel, Band court panel |
| API / server | `app/api/audit/route.ts`, `app/api/status/route.ts`, `app/api/smoke/tokenrouter/route.ts` | POST audit (dual-mode: manual or URL); GET integration status; GET TokenRouter smoke test |
| Pipeline orchestration | `pipeline/index.ts` | Linear stage runner; wraps every stage in a `TraceCollector` entry |
| Claim extraction | `pipeline/extractClaims.ts`, `adapters/llm/{anthropicClaimExtractor,openaiClaimExtractor,tokenrouterClaimExtractor}.ts` | Provider routing with deterministic keyword fallback |
| Repository scanning | `pipeline/scanRepo.ts`, `adapters/github/{realScanner,types}.ts`, `utils/parseGitHubUrl.ts` | Native-fetch GitHub REST; returns `unavailable` on any failure |
| Detectors | `detectors/{mcp,rag,multiAgent,realtime,voice,computerVision}.ts`, `detectors/scan.ts`, `pipeline/runDetectors.ts` | Six static detectors over the `RepoScan`, plus Python dep file parser |
| Evidence matching & scoring | `pipeline/matchEvidence.ts`, `pipeline/scoreAuthenticity.ts` | Joins detector evidence to claims; `score = positive / total * 100` |
| Compression (judge input) | `pipeline/compressEvidenceContext.ts`, `adapters/compression/{provider,types,theTokenCompanyCompressor}.ts`, `lib/tokenEstimate.ts` | Compresses the LLM judge payload; remote provider with safe local fallback |
| Claim judging | `pipeline/judgeClaims.ts`, `adapters/llm/{anthropicClaimJudge,openaiClaimJudge,tokenrouterClaimJudge}.ts` | LLM judge with verdict label whitelist + ID validation; deterministic fallback by score threshold |
| LLM provider abstraction | `adapters/llm/provider.ts`, `adapters/llm/types.ts` | `selectProvider()` + `LLMClaimExtractor` / `LLMClaimJudge` interfaces |
| TokenRouter integration | `lib/tokenRouterClient.ts`, `adapters/llm/tokenrouter*.ts`, `app/api/smoke/tokenrouter/route.ts` | Shared client (timeout, redaction, reasoning strip), extractor, judge, smoke endpoint |
| Anthropic integration | `adapters/llm/anthropicClaim{Extractor,Judge}.ts`, `band_agents/*.py` | Direct `@anthropic-ai/sdk` calls; also drives the Band Python sidecars |
| Safety | `pipeline/applySafety.ts` | Strips `fake/lying/scam/fraud/deceptive` from all surfaced text |
| Trace / observability | `lib/trace.ts`, `adapters/trace/{sentryTraceAdapter,types}.ts` | Local `TraceCollector` always runs; Sentry export is opt-in |
| Ingestion (URL mode) | `adapters/ingest/{browserbaseProjectIngestor,mockProjectIngestor,types}.ts` | Browserbase + Playwright; falls back to fixture data |
| Band sidecar | `band_agents/{lead_judge,claim_prosecutor,evidence_defender,repo_forensics}.py`, `lib/bandCourtPacket.ts` | Generates a copy-pasteable packet; four Python remote agents run separately and reply in Band |
| Integration status | `lib/integrationStatus.ts` | Single source of truth for env-var visibility, surfaced in UI |
| Types | `types/pipeline.ts` | All shared types — clean and well-versioned |

### 1.2 ASCII data flow

```
                  ┌─────────────────────────────────────────────┐
                  │  Browser (app/page.tsx)                      │
                  │  Manual tab           Project URL tab        │
                  │  • projectText        • projectUrl           │
                  │  • githubUrl                                 │
                  └──────────────────┬──────────────────────────┘
                                     │ POST /api/audit
                                     ▼
                  ┌─────────────────────────────────────────────┐
                  │  app/api/audit/route.ts                      │
                  │  • Project URL mode: Browserbase → mock      │
                  │  • Manual mode: passes input as-is           │
                  └──────────────────┬──────────────────────────┘
                                     ▼
              ┌──────────────────────────────────────────────────────┐
              │  pipeline/index.ts  (TraceCollector wraps all stages) │
              │                                                       │
              │  ingestProject ── ProjectInput (trimmed)              │
              │       │                                               │
              │       ▼                                               │
              │  extractClaims ─────── selectProvider() ───┬─ Anthropic
              │       │                                    ├─ OpenAI  ─► returns Claim[]
              │       │                                    ├─ TokenRouter (MiniMax-M3)
              │       │                                    └─ keyword fallback
              │       ▼                                               │
              │  scanRepo ─────── parseGitHubUrl + realScanner ──► RepoScan
              │       │           (native GitHub REST; no Octokit)    │
              │       ▼                                               │
              │  runDetectors ─── 6 deterministic detectors ─────► DetectorResult[]
              │       │           (keyword + path + dep lists)        │
              │       ▼                                               │
              │  matchEvidence ──► ClaimWithEvidence[]                │
              │       ▼                                               │
              │  scoreAuthenticity ── positive/total ratio ──► ScoredClaim[]
              │       │                                               │
              │       ▼                                               │
              │  ┌──── runCompression (off | local | token-company | auto) ────┐
              │  │     local: pipeline/compressEvidenceContext.ts (always works)│
              │  │     remote: adapters/compression/theTokenCompanyCompressor.ts│
              │  │             (placeholder URL — falls back to local)          │
              │  └────────────────────────────────────────────────────────────┘
              │       │                                               │
              │       ▼                                               │
              │  judgeClaims ── selectProvider() ───┬─ Anthropic Haiku 4.5
              │       │                              ├─ OpenAI
              │       │                              ├─ TokenRouter (MiniMax-M3)
              │       │                              └─ deterministic fallback
              │       ▼                                               │
              │  applySafety ── banned-word replace ──► ClaimVerdict[]│
              │       ▼                                               │
              │  generateReport ──► AuditReport (with trace + compression metadata)
              │       │                                               │
              │       ▼                                               │
              │  sentryTraceAdapter.exportTrace (server-only, opt-in) │
              └──────────────────────────────────────────────────────┘
                                     │
                                     ▼ JSON
                  ┌─────────────────────────────────────────────┐
                  │  Browser renders:                            │
                  │  • Score bar + project header                │
                  │  • Per-claim cards with evidence + rationale │
                  │  • TracePanel (collapsible)                  │
                  │  • CompressionPanel (raw / compressed / %)   │
                  │  • BandCourtPanel (copy packet to clipboard) │
                  └─────────────────────────────────────────────┘

Out-of-band: 4 Band agents (band_agents/*.py) listen in a Band room.
The user pastes the generated packet — no direct app→Band integration.
```

---

## 2. Step-by-Step Implementation Map

A user run, traced through real call sites:

| Step | Where | Data shape in → out |
|---|---|---|
| 1 | User submits the form in `app/page.tsx:733 runAudit()` | `{projectUrl}` (URL mode) **or** `{projectText, githubUrl}` (manual) |
| 2 | `POST /api/audit` lands in `app/api/audit/route.ts:10 POST()` | `RequestBody → NextResponse` |
| 3 | URL mode: `browserbaseProjectIngestor.ingest()` first (`adapters/ingest/browserbaseProjectIngestor.ts:124`). Returns `null` if env vars missing or scrape fails. | `{projectUrl} → ProjectIngestResult \| null` |
| 4 | If Browserbase returned null: `mockProjectIngestor.ingest()` (`adapters/ingest/mockProjectIngestor.ts:27`) — fixed `MediScan AI` fixture | Same shape with `source: "mock"` |
| 5 | `runPipeline(input, {ingestMeta?})` (`pipeline/index.ts:14`) — creates `TraceCollector` and starts | `ProjectInput → AuditReport` |
| 6 | `ingestProject()` trims input | `ProjectInput → ProjectInput` |
| 7 | `extractClaims()` (`pipeline/extractClaims.ts:150`) calls `selectProvider()` from `adapters/llm/provider.ts:3`. Routes to one of the three LLM adapters; on `null`, runs `keywordExtract()` against `CLAIM_DEFINITIONS` | `ProjectInput → {claims: Claim[], source: ClaimExtractionSource}` |
| 8 | `scanRepo()` (`pipeline/scanRepo.ts:5`) calls `parseGitHubUrl()`. If parse fails: returns `{source: "invalid-url", ...}`. Otherwise `realScanner.scan(owner, repo, normalizedUrl)` (`adapters/github/realScanner.ts:89`) calls GitHub REST: `/repos`, `/git/trees?recursive=1`, `/readme`, `/contents/package.json`, five Python dep files in parallel, then up to 15 source files filtered by `shouldFetch()`. Network errors → `source: "unavailable"` | `ProjectInput → RepoScan` |
| 9 | `runDetectors()` (`pipeline/runDetectors.ts:23`) maps claims to the six detectors via `REAL_DETECTORS` table | `(Claim[], RepoScan) → DetectorResult[]` |
| 10 | Each detector follows the same template: positive findings from deps, file tree, README, and source files using helpers in `detectors/scan.ts`. If none: returns a single `{source: "absence"}` evidence item. Otherwise appends absences for missing dep and missing source signals. | `RepoScan → Evidence[]` |
| 11 | `matchEvidence()` joins by `claimId`; `scoreAuthenticity()` computes `Math.round(positive / total * 100)` | `(Claim[], DetectorResult[]) → ClaimWithEvidence[] → ScoredClaim[]` |
| 12 | `judgeClaims()` (`pipeline/judgeClaims.ts:56`): builds raw `LLMJudgeInput`; if `selectCompressionMode() !== "off"`, calls `runCompression()`. If compression throws: silently uses raw input | `(ScoredClaim[], ScanSource) → JudgeClaimsResult` |
| 13 | Provider routes to Anthropic / OpenAI / TokenRouter judge. Each validates: every input claim ID is present in output, every verdict is in `VALID_VERDICT_LABELS`. On any failure: returns `null` → deterministic fallback in `labelFromScore()` | `LLMJudgeInput → LLMJudgeResult \| null` |
| 14 | `applySafety()` sanitizes `claim`, `evidence.text`, and `rationale` via banned-word regex | `ClaimVerdict[] → ClaimVerdict[]` |
| 15 | `generateReport()` assembles the report and `sentryTraceAdapter.exportTrace()` runs (no-op without DSN) | `→ AuditReport` |
| 16 | UI re-renders: `ClaimCard` per verdict, `TracePanel`, `CompressionPanel`, `BandCourtPanel` | `AuditReport` |

### 2.1 Where external calls actually happen

- `realScanner.scan()` — `api.github.com` (real, used in every audit with a valid URL)
- `extractClaims()` → one of: `api.anthropic.com`, `api.openai.com`, `api.tokenrouter.com`
- `judgeClaims()` → same three providers
- `theTokenCompanyCompressor.compress()` — `api.thetokencompany.example` (placeholder)
- `browserbaseProjectIngestor.ingest()` — Browserbase + Playwright CDP
- `sentryTraceAdapter.exportTrace()` — Sentry SDK
- `app/api/smoke/tokenrouter/route.ts` — direct TokenRouter ping

### 2.2 Where local deterministic logic runs

- All six detectors (`detectors/*.ts`)
- Keyword extractor (`pipeline/extractClaims.ts:117`)
- Deterministic judge (`pipeline/judgeClaims.ts:16`)
- Local claim-aware compressor (`pipeline/compressEvidenceContext.ts:430`)
- `applySafety` banned-word replace
- Score computation
- All UI rendering

### 2.3 Weak links / unclear boundaries

1. **`score` is decoupled from `verdict`.** `scoreAuthenticity` computes a numeric score
   and `labelFromScore` (deterministic fallback) maps it to a label. But when the LLM
   judge runs, the **score is not recomputed** — the LLM verdict is applied to a score
   the LLM did not produce (`judgeClaims.ts:42`). So a "Strongly supported" verdict can
   coexist with a low score, which is visually confusing.
2. **The compression `MAX_EVIDENCE_PER_CLAIM` cap interacts with the re-balance.**
   `compressEvidenceContext.ts:359-373` does `capped.pop(); capped.push(candidate)` to
   force a positive/negative item back in. This can drop the highest-priority item, and
   it does not check whether the popped item was the only source-file evidence.
3. **`stripReasoning` + `extractJson` are duplicated** in `tokenrouterClaimExtractor.ts`
   and `tokenrouterClaimJudge.ts` — same lines, easy to drift.
4. **The Token Company endpoint is a `.example` placeholder.** It will always 404 or
   fail to resolve, so the remote branch never produces a real reduction in practice.
5. **Band Audit Court is conceptually outside the pipeline.** The packet generator is
   called in the UI; the agents run in a separate Python process; the user is the
   transport. Calling this a "multi-agent collaboration" overstates the integration.
6. **No tests.** The pipeline is structured beautifully *for* testing but there are zero
   unit tests, zero integration tests.

---

## 3. External Technologies — Audit Table

Listing each meaningful dependency or service. *Depth* is honest, not generous.

| Technology | Where used | Why | Sensible? | Integration depth | Real work we do around it | Limitations / risks | Best improvement | Effort | Demo value |
|---|---|---|---|---|---|---|---|---|---|
| **TokenRouter** (`api.tokenrouter.com`) | `lib/tokenRouterClient.ts`, `adapters/llm/tokenrouter*.ts`, `app/api/smoke/tokenrouter/route.ts` | Sponsor-aligned LLM access; provides MiniMax-M3 | Yes | **Medium-deep**: real end-to-end (extractor + judge), with timeout, reasoning-strip, JSON-extract, redaction, smoke endpoint | Wrapper client with safe logging, `<think>` stripping, JSON extraction fallback, integration-status surfacing | Only one model in use (`MiniMax-M3`); not actually *routing*; auto-priority puts it third | Provider comparison vs Anthropic; multi-model per task type | medium | **high** |
| **MiniMax-M3 (via TokenRouter)** | Same as above | Model selected for extraction + judging | Yes | Real | Reasoning-tag stripping is specific to this model | Slow at times (12-14s for judge in handoff log); reasoning-tag bleed-through needed defensive code | Use a faster TokenRouter model for extraction; reserve MiniMax for judging | quick | medium |
| **Anthropic Claude Haiku 4.5** (`@anthropic-ai/sdk`) | `adapters/llm/anthropic*.ts`, `band_agents/*.py` | Default LLM provider; powers Band agents | Yes | **Real**: official SDK, native system+user prompt split | Strict response parsing, label validation, ID coverage check | First in auto-priority — TokenRouter is harder to demo when this is set | Make Anthropic the **comparison baseline**, not the default | quick | high |
| **OpenAI API** (native fetch) | `adapters/llm/openai*.ts` | Original LLM provider before Anthropic was added | Partially | Real but redundant if Anthropic + TokenRouter cover the space | Same parse / validate as Anthropic | Three providers + deterministic is overkill | Remove OpenAI **OR** repurpose it as a third comparison provider | quick | low |
| **GitHub REST API** (native fetch, no Octokit) | `adapters/github/realScanner.ts` | Repo scanning | Yes | **Deep for what's needed**: tree, README, package.json, 5 Python dep files, up to 15 source snippets, with size guard, dir skip, extension allowlist | Custom file selection, base64 decode, parallel fetch, file-size guard | Anonymous rate limit (60/hr); 15-file cap may miss evidence | Fetch evidence in **claim-aware** batches (only files matching keyword patterns) | medium | medium |
| **Browserbase + Playwright** (`@browserbasehq/sdk`, `playwright-core`) | `adapters/ingest/browserbaseProjectIngestor.ts` | Devpost scrape | Yes | **Real**: full CDP session, Devpost-specific selectors, 45s timeout, partial-extraction warnings | Custom Devpost DOM selectors, fallback selector chain, GitHub-URL discovery in DOM | Devpost selectors may rot; needs both keys; per-audit cost | Add a few more URL templates (DoraHacks, Lablab, Project Galaxy) | medium | medium |
| **Sentry** (`@sentry/node`) | `adapters/trace/sentryTraceAdapter.ts`, `app/api/audit/route.ts` | Server-side error capture + custom audit-trace event | Yes | Real but **minimal**: lazy init, `tracesSampleRate: 0`, custom `captureEvent` for traces | Safe metadata only — no user text, no keys | Currently only captures errors and a single info event per run | Add per-stage timing into Sentry custom events | quick | low |
| **Next.js 16 + React 19** | `app/`, `components/` | Web framework | Yes | Standard SSR + client-side fetch | Server actions used for API routes only | Next.js 16 is brand-new (Dec 2025) — could surface upstream bugs | Lock to a stable point release pre-demo | quick | low |
| **TypeScript 5 strict** | All `.ts(x)` | Type safety | Yes | Strict mode + `noImplicitAny`-style discipline; no `any` found | Discriminated unions for verdict labels and ingest sources | None significant | – | – | – |
| **Tailwind CSS 3** | `app/page.tsx`, `components/` | Styling | Yes | Standard | Custom color tokens per integration state | None significant | – | – | – |
| **Native `fetch` + `AbortController`** | `lib/tokenRouterClient.ts`, `adapters/github/realScanner.ts` | HTTP without extra SDK weight for GitHub & TokenRouter | Yes | Real and intentional | Custom timeout wrappers; explicit `clearTimeout` | – | – | – | – |
| **Band Remote Agents** (Python sidecar) | `band_agents/*.py`, `lib/bandCourtPacket.ts` | Multi-agent deliberation on the audit | Conditionally | **Shallow integration**: app generates a copy-paste packet; agents run separately; user is the bus | Custom packet generator + four role prompts | "Manual paste" is fragile in a live demo; agents may answer in a non-deterministic order | Use the Band webhook (if available) to POST the packet from the app | hard | high if it works |
| **Custom `TraceCollector`** | `lib/trace.ts`, `pipeline/index.ts` | In-process audit trace | Yes | Real | Records every stage with status, message, metadata | Status enum is small (success/skipped/fallback/error) | Add per-stage `durationMs` (currently always undefined) | quick | medium |
| **The Token Company / evidence compression** | `adapters/compression/*`, `pipeline/compressEvidenceContext.ts` | Reduce judge-input tokens | Yes (concept), No (current state) | **Local compressor is real and good** (claim-aware, polarity preserved, file paths preserved, safety wording stripped). **Remote adapter points at an `.example` placeholder URL** | Local compressor is genuinely sophisticated (~540 lines). Remote adapter is a stub | Cannot actually demo the remote provider until the real endpoint is supplied | Wire to a real Token Company endpoint, **or** rebrand this layer as our own "claim-aware compression" technique | quick to medium | medium |
| **`@anthropic-ai/sdk` (Python, in `band_agents/`)** | `band_agents/lead_judge.py` and three siblings | Drives the four Band agents | Yes | Real | Distinct system prompts per role, `.env` key gating | Each agent runs in its own terminal; no shared state | Add a single launcher that supervises all four | medium | medium |

**Honest summary of which integrations are deep vs. surface:**

- Deep: TokenRouter client, GitHub scanner, local compressor, Browserbase scraper, Anthropic adapters.
- Surface: OpenAI (redundant), Sentry (one event per run), The Token Company (placeholder), Band (manual paste).

---

## 4. TokenRouter-Specific Depth Audit

### 4.1 What is real

Walking the code:

- `lib/tokenRouterClient.ts:45 callTokenRouter()` is a real shared client. It:
  - reads `TOKENROUTER_API_KEY` internally so it never travels through call sites,
  - uses `AbortController` with explicit `clearTimeout`,
  - logs only `[TokenRouter] provider=tokenrouter model=X status=Y reason=Z durationMs=N`,
  - redacts bearer tokens and any 32+ alphanumeric blob in body previews (`safeBodyPreview`),
  - strips `<think>...</think>` blocks specific to MiniMax-M3 (`stripReasoning`),
  - returns a discriminated union (`{ok: true, content, model, durationMs}` vs error variants).
- `adapters/llm/tokenrouter{ClaimExtractor,ClaimJudge}.ts` use it for both pipeline halves. Both adapters:
  - use a belt-and-suspenders `extractJson` that strips reasoning, then prefers ```` ```json ```` blocks, then falls back to the first `{…}`,
  - validate the parsed shape rigorously, including verdict-label whitelist (`VALID_VERDICT_LABELS`) and "every input claim ID is present in output."
- `app/api/smoke/tokenrouter/route.ts` is a real GET endpoint that returns either
  `{status: "skipped", reason}`, `{status: "failed", reason, httpStatus?, bodyPreview?}`, or
  `{status: "success", model, durationMs, responsePreview}` — `responsePreview` capped at 60 chars.
- `lib/integrationStatus.ts:78` surfaces both the label and the active model name.
- `app/page.tsx:290-340` shows the TR model row only when TR is selected, and emits a
  ⚠ warning when `LLM_PROVIDER=tokenrouter` but the key is missing.
- The handoff documents a real successful run against `anthropics/anthropic-cookbook`
  with three claims, three judge-rationale outputs, and observed latency numbers.

This is **clearly more than "we just called an API."** The redaction, reasoning-strip,
JSON-extract fallback chain, smoke endpoint, and integration-status surface together
make a credible "production-style" integration story.

### 4.2 What is still shallow

- Only one model (`TOKENROUTER_MODEL = MiniMax-M3`). The system has **no actual routing
  decision** — TokenRouter's value proposition is being able to choose between models,
  and we never exercise that choice.
- No A/B comparison with Anthropic or OpenAI.
- No latency / cost / quality dashboard. The smoke endpoint gives a single duration; the
  trace step gives an end-to-end number; nothing is aggregated.
- No retry policy. A network blip drops to the deterministic judge.
- The `auto` priority puts Anthropic ahead of TokenRouter (`provider.ts:13`), so demos
  with both keys never actually route to TokenRouter.

### 4.3 Evidence to show judges

- Live smoke call: `curl http://localhost:3000/api/smoke/tokenrouter` → JSON with model
  + `durationMs` + 60-char safe preview.
- An audit with `LLM_PROVIDER=tokenrouter` set: trace panel shows
  `claim-extraction` and `judge` steps as success; per-claim cards show
  "Claim extraction: LLM · TokenRouter" and "Judge: LLM · TokenRouter".
- Server log demonstrating reasoning-tag stripping and durations.
- Integration status card showing **TR model: MiniMax-M3** and the green pill.

### 4.4 Five ways to deepen TokenRouter usage (ranked)

| # | Idea | Why it works for this project | Effort | Demo value | Risk |
|---|---|---|---|---|---|
| 1 | **Side-by-side Anthropic vs. MiniMax-M3 judge comparison.** Run both judges on the **same compressed payload**, show their verdicts in adjacent columns, highlight disagreements, and let the user click to see each rationale. | Anthropic and TokenRouter clients already exist. Wraps the existing judgement infrastructure. Demos the value of TokenRouter (multi-provider) without inventing new infra. | medium | **high** | low |
| 2 | **Per-stage routing.** Use TokenRouter for the **extractor** (fast, structured, cheap) and Anthropic for the **judge** (high stakes), or vice-versa. Document the choice in a one-line metadata field on the report. | Mirrors how teams actually use TokenRouter (fast/cheap on one stage, premium on the other). | quick | medium | low |
| 3 | **Confidence-based fallback.** If MiniMax-M3 judge returns a verdict with very short rationale OR omits a claim, automatically re-judge that claim via Anthropic and tag the verdict with `routed_to: "anthropic-on-low-confidence"`. | Reuses existing fallback discipline. Visible in the trace panel. | medium | high | medium (need confidence heuristic) |
| 4 | **Provider trace surfacing.** Add a "Provider Trace" section in the report showing every LLM call with `provider, model, durationMs, attempt, reason` rows. | Repurposes the existing safe-logging output; turns operator visibility into a judge-facing story. | quick | medium | low |
| 5 | **TokenRouter model picker.** Read `TOKENROUTER_MODELS` (comma-separated) from env, expose a model dropdown in `IntegrationStatusCard`, and pass the chosen model to `callTokenRouter`. | Honest acknowledgment that the product *does* route; trivial implementation. | quick | medium | low |

**Best three to ship for a hackathon:** #1 (the headline), plus #2 (per-stage routing) **or** #4 (provider trace) as a depth-multiplier.

---

## 5. Anthropic Integration Audit

### 5.1 Current role

Anthropic (`claude-haiku-4-5-20251001`) is:

- the first provider tried when `LLM_PROVIDER=auto` (`provider.ts:13`),
- the only provider used by the four Band Python sidecars (`band_agents/lead_judge.py:55` and siblings via `AnthropicAdapter`),
- a complete second LLM path with its own extractor + judge.

It is genuinely useful and not deprecated.

### 5.2 Does it still make sense alongside TokenRouter?

Yes — but the **architectural role** should change.

- Right now Anthropic is the "default and TokenRouter is a fallback."
- For a hackathon where TokenRouter is the sponsor highlight, Anthropic should be the
  **comparison baseline** and **escalation path**, not the default. Concretely:
  - **Default LLM_PROVIDER should be `tokenrouter`** for the demo.
  - **Anthropic is invoked deliberately**: as the second column in a comparison panel,
    or as the escalation target when MiniMax-M3 returns low-confidence output.
  - **Band agents stay on Anthropic** — they are a separate demo lane (multi-agent
    deliberation) and not a routing decision.

### 5.3 Compelling Anthropic + TokenRouter combinations

- **Two-judge comparison panel** (#1 above) — Anthropic is the trusted "second opinion."
- **Debate**: if Anthropic and MiniMax disagree on a claim, surface the disagreement as
  an "Audit Court referral" — automatically pre-populate the Band packet with only the
  contested claims. This ties three integrations together in one narrative.
- **Cross-check rationale grounding**: ask the second model "did the first model's
  rationale rely only on the listed evidence?" This is a structured grounding check, not
  a free-form opinion — auditable.

### 5.4 What I would *not* do

- Don't remove Anthropic. It is the most reliable comparison point you have.
- Don't make both providers run on every audit by default — let the user opt in (toggle
  on the form) or trigger comparison only on a "Deep Audit" button.

---

## 6. Project Depth Evaluation

### 6.1 Brutally honest read

**Genuinely nontrivial parts:**
- The adapter discipline: every external dependency is gated, mocked, and degrades gracefully.
- The TokenRouter client (timeout, redaction, reasoning strip, JSON extract chain).
- The local compressor (~540 lines, claim-aware, polarity-preserving, safety-aware).
- The dual-mode `/api/audit` route with Browserbase → mock fallback.
- The trace + status + smoke endpoint trio gives real observability.

**Things that look more impressive than they are:**
- "Six detectors" — these are well-curated keyword + path lists, not real code analysis.
- "Multi-agent collaboration" — the Band agents are real but the integration is
  copy-paste; the app does not orchestrate them.
- "AI-powered judge" — the LLM judge does one classification call per audit. Useful, but
  not architecturally novel.
- "The Token Company / evidence compression" — local works, remote is a placeholder.

**Likely judge reactions:**
- *Impressed by:* "Claim → Evidence → Verdict" framing, the trace panel, the
  integration-status card, the fact that the app gracefully runs with zero keys.
- *Critical of:* the score formula being trivial, detectors being keyword lists, the
  Token Company URL being an `example.com` placeholder, the Band integration being
  manual.

### 6.2 Technical depth we can emphasize

- Strict response validation: every LLM output must contain every input claim ID and
  use only labels from a whitelist; failure → null → deterministic fallback. This is
  unusually disciplined for a hackathon project.
- Safety wording isn't aspirational — `applySafety` actually runs across `claim`,
  `evidence.text`, and `rationale`.
- The compressor preserves polarity (positive vs. negative evidence) and re-balances
  when the cap drops one side. This is real engineering.
- The TokenRouter integration handles MiniMax-M3's reasoning-tag bleed gracefully.

### 6.3 Technical depth we are missing

- AST or import-graph analysis instead of substring matches.
- A real evaluation harness comparing detector verdicts against a labeled ground-truth
  set of repositories.
- Per-claim provider routing.
- Caching (mentioned in TODO but not implemented).

### 6.4 Score card (1–10)

| Category | Score | Why |
|---|---|---|
| Architecture quality | **7.5** | Clean pipeline boundaries, disciplined adapter pattern, strict types, defensive fallback chains; loses points for zero tests, naive scoring formula, and Token Company placeholder |
| External tech integration depth | **6.5** | TokenRouter, GitHub, Browserbase, Anthropic all real; OpenAI redundant; Token Company placeholder; Band copy-paste |
| Product clarity | **8** | "Claim → Evidence → Verdict" is crisp; verdict labels are well-thought-out; UI explains scan source, judge source, and integration state without ambiguity |
| Technical originality | **6** | Concept is genuinely interesting and not a generic LLM wrapper; the compressor and safety pipeline show care; detectors themselves are not novel |
| Demo readiness | **8** | Works zero-keys, sample buttons present, status card surfaced before audit, fallback warnings visible; trace panel sells the engineering story |
| Robustness | **7** | Null-return discipline is excellent; timeouts are everywhere; no tests is the main robustness gap |
| Sponsor relevance | **6** | TokenRouter is real and visible; Anthropic visible; Token Company placeholder; Band sidecar requires manual orchestration |
| Overall hackathon competitiveness | **7** | Above average for a hackathon — but won't stand out without one more depth play in the LLM layer |

---

## 7. Improvement Roadmap

### A. Must do before demo

| What | Why | Files | Difficulty | Risk | Demo value | Sponsor lift |
|---|---|---|---|---|---|---|
| Flip `auto` priority so TokenRouter is first | Story alignment — sponsor highlight should win when both keys are set | `adapters/llm/provider.ts:13` | quick | low | medium | **high** |
| Add per-stage `durationMs` to trace steps | The trace panel currently has no per-step timing despite the type field existing | `lib/trace.ts`, `pipeline/index.ts` | quick | low | medium | low |
| Recompute `score` to reflect LLM verdict | "Strongly supported" + low score looks wrong to judges | `pipeline/judgeClaims.ts:42`, optional new helper | quick | low | medium | low |
| Settle the Token Company endpoint story | Either wire to a real endpoint **or** rename to "BuildProof claim-aware compression" and drop the remote adapter from the demo | `adapters/compression/theTokenCompanyCompressor.ts`, `app/page.tsx`, `DEMO.md` | quick | low | medium | medium (avoids embarrassing failure) |
| Pin Next.js to a known stable point release | Next.js 16 is brand new; surprises on a demo machine are bad | `package.json` | quick | low | low | low |

### B. High-impact depth improvements

| What | Why | Files | Difficulty | Risk | Demo value | Sponsor lift |
|---|---|---|---|---|---|---|
| **Anthropic vs MiniMax-M3 judge comparison panel** | The single biggest depth play. Turns TokenRouter from "another provider" into "the routing layer the audit is judged against." | New `pipeline/compareJudges.ts`, `app/page.tsx` (new `ComparisonPanel`), `types/pipeline.ts` (new `JudgeComparison` type), wire into `/api/audit` behind a `comparisonMode` flag | medium | low (additive) | **high** | **high** |
| Provider trace section (every LLM call + provider + duration + result) | Repurposes existing safe logging; visible engineering depth | `lib/tokenRouterClient.ts`, `adapters/llm/anthropic*.ts`, `types/pipeline.ts`, `app/page.tsx` | medium | low | medium | medium |
| Per-stage provider routing (extractor on TokenRouter, judge on Anthropic — or vice versa) | Mirrors realistic TokenRouter use | `adapters/llm/provider.ts` (new `selectProviderFor(stage)`), `pipeline/{extractClaims,judgeClaims}.ts` | medium | low | medium | high |
| Claim-aware repo fetching (only fetch source files matching claim keywords) | Improves evidence quality; reduces GitHub API spend | `adapters/github/realScanner.ts`, new claim-aware filter | medium-hard | medium | medium | low |
| Replace one detector with real import/AST analysis (e.g., MCP — easy to grep for `@modelcontextprotocol/sdk` import statements) | Shows we can go beyond substring | `detectors/mcp.ts`, optional `detectors/imports.ts` helper | medium | low | medium | low |

### C. Nice-to-have if time remains

| What | Why | Files | Difficulty | Risk | Demo value | Sponsor lift |
|---|---|---|---|---|---|---|
| Audit permalink + export to JSON | Sharable demos | New `/api/report/[id]`, persistence layer (e.g., file-backed cache) | medium | low | medium | low |
| Compression metadata in Sentry events | More observable; mentioned in HANDOFF | `adapters/trace/sentryTraceAdapter.ts` | quick | low | low | low |
| In-app trigger for Band agents (HTTP webhook if Band supports it) | Closes the Band integration loop | `band_agents/`, `app/api/audit/route.ts` | hard | medium | high | high |
| 3–5 polished sample audits with real repos | Pre-loaded demo paths | new `data/samples/`, `app/page.tsx` | quick | low | medium | low |
| Token-comparison badge on each claim card | Visual depth — small but legible | `components/ClaimCard.tsx` | quick | low | medium | medium |

---

## 8. Best Next Implementation Choice (single pick)

**Side-by-side Anthropic vs. MiniMax-M3 (TokenRouter) judge comparison panel.**

Why this one wins:
- **Highest judging impact**: turns a single-judge audit into a *multi-judge* audit that
  is itself transparent — strong narrative ("BuildProof audits credibility, and lets you
  audit the auditor").
- **Reasonable difficulty**: both judges already exist; both already produce strictly
  validated output with the same `LLMJudgeResult` shape. The new work is one new
  pipeline function (`compareJudges`), one UI panel, and one wire-up in `/api/audit`.
- **Strongest external-tech depth**: in one feature, MiniMax-M3 via TokenRouter and
  Anthropic Haiku 4.5 both run on every audit. Both are visibly used in the report.
- **Strongest connection to existing architecture**: reuses `judgeClaims` plumbing,
  reuses compression, reuses safety, reuses trace. No new adapters.
- **Lowest risk of breaking the app**: comparison runs alongside the existing single
  judge — the canonical verdict stays unchanged. A failure in the comparison call falls
  back silently.

### Implementation prompt to use next (if approved)

> Implement a TokenRouter vs. Anthropic judge comparison feature without changing the
> existing single-judge pipeline output. Specifically:
>
> 1. Add a new file `pipeline/compareJudges.ts` exporting
>    `runJudgeComparison(scored, scanSource, compressedInput)` that runs the Anthropic
>    judge and the TokenRouter judge in parallel **on the same already-compressed
>    `LLMJudgeInput`** (not on raw input — reuse `compression.compressedInput`). It
>    must return `{anthropic: LLMJudgeResult | null, tokenrouter: LLMJudgeResult | null,
>    agreementRate: number, disagreements: Array<{claimId, anthropicVerdict,
>    tokenrouterVerdict}>}`. Use `Promise.allSettled`. Both adapters already return
>    `null` on failure — preserve that behavior; do not throw.
>
> 2. In `pipeline/judgeClaims.ts`, when a new env var `JUDGE_COMPARISON=on` is set AND
>    both `ANTHROPIC_API_KEY` and `TOKENROUTER_API_KEY` are present, run the comparison
>    after the primary judge produces verdicts. Pass the compressed input through. Do
>    not change the primary judge selection. Add the comparison result to the return
>    shape as optional `comparison?: JudgeComparison`.
>
> 3. Add `JudgeComparison` to `types/pipeline.ts` with `anthropicVerdicts`,
>    `tokenrouterVerdicts`, `agreementRate`, `disagreements`, `durations`. Thread it
>    through `JudgeClaimsResult`, `runPipeline`, `generateReport`, and `AuditReport`.
>
> 4. Record one `judge-comparison` trace step in `pipeline/index.ts` with status
>    `success` (both returned), `fallback` (one returned), or `skipped` (off).
>
> 5. Add a `JudgeComparisonPanel` component in `app/page.tsx` that renders side-by-side
>    columns when `report.comparison` is present: per-claim agreement check (✓ / ⚠),
>    each side's verdict + rationale stub, and an aggregate agreement-rate header. Do
>    not change the existing per-claim cards.
>
> 6. Update `lib/integrationStatus.ts` and the `IntegrationStatusCard` to expose a
>    `judgeComparison: "enabled" | "disabled" | "not eligible"` row.
>
> 7. Update `.env.example` to document `JUDGE_COMPARISON=off|on` (default `off`).
>
> 8. Do not modify `.env.local`. Do not change the existing primary-judge behavior or
>    fallback semantics. Do not introduce new dependencies.
>
> Acceptance: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass; an
> audit with both keys + `JUDGE_COMPARISON=on` shows a comparison panel with per-claim
> agreement marks; an audit with `JUDGE_COMPARISON=off` (default) shows no comparison
> panel and identical behavior to before.

---

## 9. Judge-Facing Explanation

### 9.1 30-second version

BuildProof checks whether the technical claims in a project's pitch are actually
implemented in its GitHub repo. We extract claims, scan the repo, run six static
detectors, and ask an LLM judge to assign a grounded verdict per claim — using only the
listed evidence. Verdicts use safe, evidence-based labels: *Strongly supported*,
*Partially supported*, *README-only claim*, *Unsupported by repository evidence*, or
*No implementation evidence found*.

### 9.2 90-second version

BuildProof is an evidence-based credibility auditor. Drop in a project description and
a GitHub URL — or a Devpost URL we ingest via Browserbase — and we run a
seven-stage pipeline: claim extraction (LLM with keyword fallback), real GitHub
scanning, six detectors (multi-agent, MCP, RAG, real-time, voice, computer vision),
evidence matching, scoring, an LLM judge with strictly whitelisted verdict labels and a
required claim-ID coverage check, and a safety pass that removes inflammatory language.
Every stage is behind an adapter so any external service can drop to a local fallback,
and every stage logs into a trace panel the user can open inline. We integrate
TokenRouter (running MiniMax-M3) for LLM calls, Anthropic Claude Haiku 4.5 as a baseline,
Browserbase for Devpost ingestion, Sentry for observability, and a Band Audit Court
packet for multi-agent deliberation. The app runs end-to-end with **zero API keys** —
the demo path never hard-fails.

### 9.3 Technical deep-dive version

BuildProof's pipeline has nine well-defined stages, each behind a typed adapter
interface that returns `null` rather than throwing. The repo scanner uses the GitHub
REST API directly (no Octokit) with parallel fetches for the file tree, README,
`package.json`, five Python dep files, and up to 15 source-file snippets — with file-
size guards, directory skips, and extension allowlisting. The six detectors examine
dependencies, file paths, README terms, and source content with helpers that handle
both `package.json` and Python (`requirements.txt`, `pyproject.toml`, `setup.cfg`,
`Pipfile`, `setup.py`) dependency formats. The LLM judge is reachable through three
provider adapters (Anthropic, OpenAI, TokenRouter) selected by `LLM_PROVIDER`. Every
LLM output is strictly validated: every input claim ID must appear in the output, every
verdict must be one of five whitelisted labels, and any failure cleanly degrades to a
deterministic score-based judge. The TokenRouter client adds reasoning-tag stripping
(MiniMax-M3 emits `<think>...</think>` blocks), a belt-and-suspenders JSON extractor
that prefers fenced code blocks, body-text redaction for bearer tokens and API-key-
shaped strings, and a dedicated smoke endpoint that returns a 60-char safe preview.
Before LLM judging, we run a claim-aware compressor that shrinks per-claim evidence to
≤6 items, preserves polarity (positive vs. negative), preserves source-file evidence
and file paths, and re-balances if the cap drops the only positive or negative item.
A `TraceCollector` records every stage transition; the trace is rendered inline and
optionally exported to Sentry as a custom event with safe metadata only. The UI shows
the active provider, the TokenRouter model, integration status per service, scan
source, claim-extraction source, judge source, and a Band Audit Court packet ready to
paste into a Band room with four Python sidecar agents.

### 9.4 TokenRouter sponsor pitch

BuildProof uses TokenRouter as a first-class LLM provider for both claim extraction and
evidence judging. Beyond the basic API call, we built defensive infrastructure that
makes the integration credible in production: timeouts via `AbortController`, body
redaction so logs never leak bearer tokens, reasoning-tag stripping for MiniMax-M3's
`<think>` output, a JSON-extraction fallback chain (reasoning-strip → fenced code block
→ first `{...}`), a smoke endpoint at `/api/smoke/tokenrouter` for diagnosing
configuration without revealing content, and a model-name surfacing in the integration
status card. Provider selection is explicit (`LLM_PROVIDER=tokenrouter`) and the LLM
output is strictly validated against a verdict-label whitelist and full claim-ID
coverage — meaning a TokenRouter judge call that drifts off-spec degrades cleanly to a
deterministic fallback instead of corrupting the report. The next step in this
integration (planned) is a side-by-side Anthropic vs. MiniMax-M3 judge comparison so the
audit can show *both* models' verdicts on the same compressed payload and surface
disagreements — turning TokenRouter from "another provider" into the routing layer the
credibility audit itself is judged against.

---

*End of audit.*
