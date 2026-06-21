# BuildProof — Implementation Order

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Project Docs
- [x] Create CLAUDE.md, TODO.md, HANDOFF.md

## Phase 1 — Mock Audit Dashboard
- [x] Scaffold Next.js (or Vite + React) project with TypeScript strict mode
- [x] Hard-coded sample audit result (one project, six detector verdicts)
- [x] Verdict display: claim, evidence list, verdict badge (Strongly Supported / Partially Supported / Unsupported)
- [x] Basic layout: project header, claim cards, overall score bar

## Phase 2 — Mock Core Pipeline
- [x] Define TypeScript interfaces: `Claim`, `Evidence`, `Verdict`, `AuditReport`, `ProjectInput`, `RepoScan`, `DetectorResult`, `ClaimWithEvidence`, `ScoredClaim`
- [x] Implement pipeline stages as pure functions with mock data flowing through
- [x] `ingestProject` (mock) → `extractClaims` (keyword) → `scanRepo` (mock) → `runDetectors` (mock)
- [x] `matchEvidence` → `scoreAuthenticity` → `judgeClaims` → `applySafety` → `generateReport`
- [x] Wire pipeline to dashboard — replace hard-coded data with pipeline output
- [x] `extractClaims` uses keyword matching on user text — returns only detected claim categories
- [x] Empty state shown when no claims are detected
- [x] Keyword matching uses word boundaries for single-word terms to prevent substring false positives
- [ ] Unit tests for each pipeline stage

## Phase 3 — GitHub Repo Scanner
- [x] GitHub URL parser (`utils/parseGitHubUrl.ts`) — handles HTTPS and SSH URLs, returns owner/repo/normalizedUrl or null
- [x] Define `RepoScannerAdapter` interface (`adapters/github/types.ts`)
- [x] Implement `mockScanner` (`adapters/github/mockScanner.ts`) — returns fixture file tree, package.json, README
- [x] `scanRepo` uses URL parser + mock scanner; returns `source: "invalid-url"` for unparseable URLs
- [x] Implement `realScanner` using native fetch, no Octokit (env-gated by `GITHUB_TOKEN`; falls back to `source: "unavailable"` on error)
- [x] `scanRepo`: fetch real file tree, README, package.json, selected source snippets via GitHub REST API
- [x] Move pipeline execution server-side: `app/api/audit/route.ts` → `runPipeline()`; `page.tsx` uses `fetch("/api/audit")`
- [x] `ScanSource` extended with `"unavailable"`; `AuditReport` exposes `scanSource`; UI shows scan status note
- [ ] File content cache to avoid redundant API calls

## Phase 4 — Six Static Detectors
- [x] Detector helper utilities (`detectors/scan.ts`)
- [x] Multi-agent detector (`detectors/multiAgent.ts`) — real RepoScan analysis
- [x] MCP detector (`detectors/mcp.ts`) — real RepoScan analysis
- [x] RAG / vector DB detector (`detectors/rag.ts`) — real RepoScan analysis
- [x] Real-time / streaming detector (`detectors/realtime.ts`) — real RepoScan analysis
- [x] Voice / audio detector (`detectors/voice.ts`) — real RepoScan analysis
- [x] Computer vision / video AI detector (`detectors/computerVision.ts`) — real RepoScan analysis
- [x] `runDetectors` wires all six real detectors; unknown categories fall back to clean absence evidence
- [x] Python dependency file detection (`requirements.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, `setup.py`) wired into all six detectors

## Phase 5 — LLM Evidence Judge
- [x] Phase 5A: LLM claim extractor adapter (optional, env-gated by `OPENAI_API_KEY`)
  - `adapters/llm/types.ts` — `LLMClaimExtractor` interface and related types
  - `adapters/llm/openaiClaimExtractor.ts` — native-fetch OpenAI adapter; returns null on missing key or failure (keyword fallback used)
  - `pipeline/extractClaims.ts` — async; tries LLM if key exists, falls back to keyword; returns `{ claims, source }`
  - `types/pipeline.ts` — added `ClaimExtractionSource` type; `AuditReport` includes `claimExtractionSource`
  - `pipeline/generateReport.ts` — accepts and includes `claimExtractionSource`
  - `pipeline/index.ts` — awaits async `extractClaims`, threads source to report
  - `app/page.tsx` — `ClaimExtractionNote` shows "keyword" / "LLM" / "keyword fallback" in report
- [x] Phase 5B: LLM evidence judge (optional, env-gated by `OPENAI_API_KEY`)
  - `adapters/llm/types.ts` — added `VALID_VERDICT_LABELS`, `LLMVerdictLabel`, `LLMJudgeInput`, `LLMJudgedClaim`, `LLMJudgeResult`, `LLMClaimJudge`
  - `adapters/llm/openaiClaimJudge.ts` — native-fetch OpenAI judge; validates all claim IDs and verdict labels; returns null on failure
  - `pipeline/judgeClaims.ts` — async; tries LLM if key exists, falls back to deterministic; returns `{ verdicts, source }`
  - `pipeline/applySafety.ts` — also sanitizes `rationale` if present
  - `types/pipeline.ts` — added `JudgeSource`, `rationale?` on `ClaimVerdict`, `judgeSource` on `AuditReport`
  - `pipeline/generateReport.ts` — accepts and includes `judgeSource`
  - `pipeline/index.ts` — awaits async `judgeClaims`, threads `judgeSource` to report
  - `data/mockReport.ts` — added `judgeSource: "deterministic"`
  - `app/page.tsx` — `JudgeNote` shows "judge: deterministic/LLM/deterministic fallback" in report
  - `components/ClaimCard.tsx` — renders "Assessment" section when `rationale` is present

## Phase 6 — Level 2 Polish
- [x] Manual input form: paste README/Devpost text + GitHub URL
- [x] End-to-end flow: input → pipeline → audit dashboard
- [x] Sample preset buttons (RAG+MCP, Voice+Real-time, Vision+Multi-agent) fill project text
- [x] Richer scan status note (github-api / invalid-url / unavailable with guidance)
- [x] Demo guidance: GitHub URL optional, works without token
- [x] Scanner file-size guard: skip files >200 KB before fetching
- [x] Sentry error monitoring adapter (Phase 7B — server-side only, env-gated by SENTRY_DSN)
- [ ] Arize trace adapter (mock first, real SDK opt-in)
- [x] Demo guide (`DEMO.md`) with sample texts, expected behavior, detector reference table, verdict labels
- [ ] README with setup instructions and sample audit output

## Phase 6A — Project URL Audit Mode (mock ingestion)
- [x] `adapters/ingest/types.ts` — `ProjectIngestInput`, `ProjectIngestResult`, `ProjectIngestor` interface
- [x] `adapters/ingest/mockProjectIngestor.ts` — fixture data with `source: "mock"` and demo warnings
- [x] `types/pipeline.ts` — added `IngestMeta`, `IngestSource`, `IngestStatus`; optional `ingestMeta` on `AuditReport`
- [x] `pipeline/generateReport.ts` — uses `ingestMeta.title` as project name when present
- [x] `pipeline/index.ts` — accepts optional `{ ingestMeta? }` options, passes to `generateReport`
- [x] `app/api/audit/route.ts` — dual mode: `{ projectUrl }` → mock ingestion; `{ projectText, githubUrl }` → manual
- [x] `app/page.tsx` — Manual / Project URL tab switcher; URL input with demo disclaimer; `IngestMetaCard` in report

## Phase 7 — Browserbase Ingestion (Level 3)
- [x] Implement real `browserbaseProjectIngestor` (env-gated by `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`)
- [x] Wire into `/api/audit` URL mode: tries Browserbase first, falls back to mock on failure or missing keys
- [x] Manual input remains the stable fallback
- [x] UI distinguishes Browserbase extraction from mock demo data
- [x] IngestMetaCard labels three states: Browserbase success, demo (no keys), demo (Browserbase fallback)
- [x] 45-second overall timeout via Promise.race — never hangs /api/audit
- [x] .env.example with all optional keys and short comments
- [x] DEMO.md: Browserbase section, project URL mode expectations, manual fallback script
- [ ] Define standalone `BrowserAdapter` interface (separate from `ProjectIngestor`) if needed later

## Phase 7A — Local Audit Trace / Observability Foundation
- [x] `types/pipeline.ts` — added `TraceStepStatus`, `AuditTraceStep`, `AuditTrace`; `trace?` on `AuditReport`
- [x] `lib/trace.ts` — `TraceCollector` class; lightweight in-process step recorder
- [x] `adapters/trace/types.ts` — `TraceAdapter` interface for future Sentry / Arize export (not wired yet)
- [x] `pipeline/generateReport.ts` — accepts optional `AuditTrace`, includes in report
- [x] `pipeline/index.ts` — creates `TraceCollector`; records all major pipeline boundaries
- [x] `app/page.tsx` — `TracePanel` component: collapsible "Run trace" section in report

## Phase 8A — Integration Readiness Check (demo prep)
- [x] `lib/integrationStatus.ts` — env-var presence helper; returns safe labels only
- [x] `app/api/status/route.ts` — GET route returning integration status JSON
- [x] `app/page.tsx` — `IntegrationStatusCard` component fetched on mount; shown in input form
- [x] `DEMO.md` — added full demo checklist (no-key, per-integration, safe path, fallback script)
- [x] `.env.example` — already contained all five vars; no change needed

## Phase 8B — Anthropic LLM Provider
- [x] `@anthropic-ai/sdk` installed
- [x] `adapters/llm/provider.ts` — `selectProvider()` reads `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; returns `"openai" | "anthropic" | "none"`
- [x] `adapters/llm/anthropicClaimExtractor.ts` — Anthropic claim extractor; returns null on any failure; validates output strictly
- [x] `adapters/llm/anthropicClaimJudge.ts` — Anthropic evidence judge; validates verdict labels and claim IDs; returns null on failure
- [x] `types/pipeline.ts` — `ClaimExtractionSource` and `JudgeSource` extended with `"llm-openai"` and `"llm-anthropic"`
- [x] `pipeline/extractClaims.ts` — uses `selectProvider()`; routes to Anthropic, OpenAI, or keyword fallback
- [x] `pipeline/judgeClaims.ts` — uses `selectProvider()`; routes to Anthropic, OpenAI, or deterministic fallback
- [x] `pipeline/index.ts` — trace messages updated to show provider name (Anthropic/OpenAI) in LLM steps
- [x] `lib/integrationStatus.ts` — added `anthropic` label and `llmProvider` label; imports `selectProvider()`
- [x] `app/page.tsx` — `ClaimExtractionNote` and `JudgeNote` show provider; `IntegrationStatusCard` shows Anthropic row and LLM provider row
- [x] `.env.example` — added `ANTHROPIC_API_KEY` and `LLM_PROVIDER=auto`
- [x] `DEMO.md` — added Anthropic, OpenAI, auto, and no-key run instructions

## Phase 8 — Redis Evidence Memory and Cache
- [ ] Define `CacheAdapter` interface
- [ ] Implement `MemoryCacheAdapter` (in-process Map, always available)
- [ ] Implement `RedisAdapter` (env-gated)
- [ ] Cache `scanRepo` results and audit reports by repo URL + content hash

## Phase 9 — Arize Trace (real integration)
- [ ] Wire real `ArizeAdapter` (env-gated)
- [ ] Trace LLM judge calls: input prompt, output, latency, model
- [ ] Trace detector runs: claims in, evidence out

## Phase 10 — Sentry Monitoring (real integration)
- [ ] Wire real `SentryAdapter` (env-gated)
- [ ] Capture pipeline errors with structured context (stage, repo URL, claim)

## Phase 9A — Band Audit Court
- [x] `lib/bandCourtPacket.ts` — sanitized court packet generator from AuditReport
- [x] `app/page.tsx` — Band Audit Court panel (packet preview + copy button + setup steps)
- [x] `band_agents/lead_judge.py` — Lead Judge Band agent (AnthropicAdapter)
- [x] `band_agents/claim_prosecutor.py` — Claim Prosecutor Band agent
- [x] `band_agents/evidence_defender.py` — Evidence Defender Band agent
- [x] `band_agents/repo_forensics.py` — Repo Forensics Band agent
- [x] `band_agents/prompts/` — four agent system prompts
- [x] `band_agents/agent_config.example.yaml` — credential template (never commit real values)
- [x] `band_agents/requirements.txt` — Python dependencies
- [x] `band_agents/README.md` — Band agent setup and usage guide
- [x] `.gitignore` — excludes `band_agents/agent_config.yaml` and `band_agents/.env`
- [x] `DEMO.md` — Band Audit Court demo section

## Phase 11 — Band Agent Collaboration (superseded by Phase 9A)
- [x] Band integration implemented as Phase 9A — Band Audit Court with 4 agents

## Phase 12 — Safety Guardrail / Armor IQ
- [ ] Define `SafetyAdapter` interface
- [ ] Implement `RuleBasedSafetyAdapter` (banned word list, always available)
- [ ] Integrate Armor IQ if available and adds value beyond rule-based

## Phase 13 — Demo Samples and Pitch Polish
- [ ] 3–5 sample audits with real GitHub repos (mix of supported / unsupported claims)
- [ ] Shareable audit permalink
- [ ] Export audit as PDF or JSON
- [ ] Pitch deck alignment: product story, demo flow, live walkthrough

## Phase 14 — The Token Company / Evidence Compression
- [x] `lib/tokenEstimate.ts` — chars/4 estimator returning { estimatedTokens, chars }
- [x] `pipeline/compressEvidenceContext.ts` — local claim-aware compressor (pure function)
- [x] `adapters/compression/types.ts` — EvidenceCompressor + CompressionMetadata types
- [x] `adapters/compression/theTokenCompanyCompressor.ts` — env-gated remote adapter w/ TODO endpoint
- [x] `adapters/compression/provider.ts` — COMPRESSION_PROVIDER mode selector + safe fallback runner
- [x] `pipeline/judgeClaims.ts` — compresses LLM judge context; returns compression metadata
- [x] `pipeline/index.ts` — records compression as a trace step, threads metadata to report
- [x] `pipeline/generateReport.ts` — optional `compression` field on AuditReport
- [x] `types/pipeline.ts` — CompressionMetadataPublic / CompressionSource / PreservedSignals types
- [x] `lib/integrationStatus.ts` — `tokenCompany` label (enabled / local mode / fallback / disabled)
- [x] `app/page.tsx` — Evidence Compression card; IntegrationStatusCard adds Token Company row
- [x] `.env.example` — COMPRESSION_PROVIDER, TOKEN_COMPANY_API_KEY, TOKEN_COMPANY_API_URL
- [x] `DEMO.md` — "The Token Company / Evidence Compression Demo" section

## Phase 15 — Weighted Authenticity Score
- [x] `pipeline/scoreAuthenticity.ts` — replaced positive/total ratio with weighted formula (source_file=5, package_json=4, file_tree=2, readme=1, absence=0); each negative item dilutes denominator by 1
- [x] `scripts/testScoreAuthenticity.ts` — 18 test cases covering all source types, absence behavior, comparison ordering, and range assertions
- [x] `package.json` — added `npm test` script running both provider and scoring tests

## Phase 16 — Anthropic vs MiniMax-M3 Judge Comparison (optional, off by default)
- [x] `types/pipeline.ts` — `JudgeComparison`, `JudgeComparisonProviderResult`, `JudgeComparisonDisagreement`, `JudgeComparisonStatus`; `judgeComparison?` on `AuditReport`
- [x] `pipeline/compareJudges.ts` — `checkComparisonEligibility`, `runJudgeProvider`, `buildComparison`, `compareJudges` (parallel helper for tests)
- [x] `pipeline/judgeClaims.ts` — captures primary judge result + duration; runs only the *other* provider when eligible (active provider never called twice); skips comparison on deterministic fallback
- [x] `pipeline/index.ts` — `judge-comparison` trace step (status: success/partial/failed/skipped) with agreement metadata
- [x] `pipeline/generateReport.ts` — threads `judgeComparison` through to `AuditReport`
- [x] `lib/integrationStatus.ts` — `judgeComparison: enabled | disabled | not eligible`
- [x] `app/page.tsx` — `JudgeComparisonPanel` (per-provider cards + per-claim agreement rows + rationale previews); status card row
- [x] `.env.example` — `JUDGE_COMPARISON=off` with explanatory comment
- [x] `scripts/testJudgeComparison.ts` — 32 tests: eligibility matrix, agreement calc, disagreement detection, partial / failed states, no real API calls
- [x] `package.json` — test script runs the new test file

## Phase 18 — Detector Architecture Audit (implementation-signal helper)
- [x] `detectors/implementationSignals.ts` — shared `findImplementationSignals(scan, query)` helper covering: node + python dependency matches, JS/TS import + require + dynamic-import statement matching, Python `import pkg` / `from pkg import` / `from pkg.sub import` statement matching, case-sensitive source-code usage-pattern matching, config-filename detection, file-path pattern matching, README-only mention surfacing, deduped source-path citation, calibrated absence evidence
- [x] `detectors/mcp.ts` — rewritten on top of helper; signals: `@modelcontextprotocol/sdk` dep + Python `mcp`, MCP config filenames (`mcp.json`, `claude_desktop_config.json`), imports of `@modelcontextprotocol/sdk` / `modelcontextprotocol` / `mcp`, usage patterns `McpServer`, `StdioServerTransport`, `server.tool(`, `registerTool(`, `@server.tool`, `@mcp.tool`, `new Server(`
- [x] `detectors/rag.ts` — rewritten on top of helper; vector DB deps (pinecone, chromadb, weaviate, qdrant, faiss, lancedb), embedding/retriever import packages, usage patterns `VectorStore`, `similarity_search`, `as_retriever`, `from_documents`, `embed_documents`, `RecursiveCharacterTextSplitter`, `split_documents`, `OpenAIEmbeddings`, `PineconeStore`, `Chroma(`
- [x] `detectors/multiAgent.ts` — rewritten on top of helper; frameworks (langgraph, crewai, autogen, swarm, semantic-kernel, smolagents), usage patterns `StateGraph`, `MessageGraph`, `AgentExecutor`, `Crew(`, `Agent(`, `Task(`, `create_react_agent`, `create_supervisor`, `handoff(`, `add_node(`, `add_edge(`, `RoutedAgent`, `AssistantAgent`, `GroupChat`
- [x] `scripts/testImplementationSignals.ts` — 50 tests: helper coverage (no-signal absence, readme-only flag, node/python dep paths, JS/TS + Python import matching, config-file recognition, source-path dedupe, full-signal no-absence, comment-only false-positive guard) + per-detector dep+source / readme-only / Python / no-signal cases for MCP, RAG, multi-agent
- [x] `package.json` — `npm test` script extended to run new test file

## Phase 17 — Compression Architecture Audit (demo-safety)
- [x] `adapters/compression/theTokenCompanyCompressor.ts` — added `isPlaceholderUrl()` + `isTokenCompanyRemoteReady()` export; `compress()` returns null immediately (no fetch) when `TOKEN_COMPANY_API_URL` is blank or a placeholder
- [x] `adapters/compression/provider.ts` — replaced `hasTokenCompanyKey` gate with `isTokenCompanyRemoteReady()`; `auto` mode with key-only goes directly to local (no fallback flag); `token-company` mode with unconfigured remote returns `source: "fallback", fallbackUsed: true`
- [x] `lib/integrationStatus.ts` — imports `isTokenCompanyRemoteReady`; `tokenCompany` label now shows `"enabled"` only when key + real URL are both set; `"local mode"` when auto runs local; `"fallback mode"` when token-company mode is explicit but remote is not configured
- [x] `.env.example` — clarified that `TOKEN_COMPANY_API_URL` must be a real endpoint for remote to activate
- [x] `scripts/testCompressionProvider.ts` — 24 tests: `isTokenCompanyRemoteReady()` (8 cases), `selectCompressionMode()` (10 cases), `runCompression()` async (6 cases)
- [x] `package.json` — test script runs the new test file

## Phase 23 — Hide Band Audit Court behind SHOW_BAND_COURT feature flag
- [x] `lib/integrationStatus.ts` — added `showBandCourt: boolean` to `IntegrationStatus`; reads `SHOW_BAND_COURT` env var (only `=== "on"` enables it, default off)
- [x] `app/page.tsx` — `BandCourtPanel` render gated on `integrationStatus?.showBandCourt`; excluded `showBandCourt` from `LabelKey` type; added "Band Audit Court: off / on (experimental)" row to `IntegrationStatusCard`
- [x] `.env.example` — added `SHOW_BAND_COURT=off` with comment
- [x] `DEMO.md` — Band section relabeled "(Experimental — Off by Default)"; added enable instructions; main demo flow documents TokenRouter + GitHub evidence + judge comparison as the primary path
- [x] `scripts/testBandCourtPacket.ts` — imported `getIntegrationStatus`; added 11 new tests: default/off/ON/on flag values, page.tsx gates BandCourtPanel, Band status label variants, main panels not gated by Band flag

## Phase 22 — Band-first UX (remove local court appearance)
- [x] `app/page.tsx` — `BandCourtPanel` now opens with a Band-first notice box: "Live Audit Court conversation happens in Band, not in this app." / "BuildProof does not display Band chat history."
- [x] `app/page.tsx` — preview toggle renamed from "Preview combined message" → "Preview packet (what gets pasted to Band)"; preview note clarifies it is the paste content, not the conversation
- [x] `app/page.tsx` — 3-step "Live demo" replaced with a 6-step Band-first runbook: (1) start sidecars, (2) copy + paste self-test, (3) confirm 4 READY replies, (4) copy combined message, (5) paste to Band, (6) watch conversation in Band — with explicit "BuildProof does not display Band replies" on step 6
- [x] `app/page.tsx` — copy buttons reordered: self-test first, combined second; buttons renamed "Copy self-test message" and "Copy court packet only"
- [x] `app/page.tsx` — removed misleading green-dot "Ready for Band Audit Court" status indicator (agents may not actually be running); removed context paragraph that implied the conversation happened locally
- [x] `app/page.tsx` — footer paragraph updated: "BuildProof generates the packet and provides copy buttons only. Band is the agent-to-agent coordination layer — all deliberation happens there. This web app does not call Band, receive Band messages, or display live Band chat history."
- [x] `scripts/testBandCourtPacket.ts` — added imports (`fs`, `path`, `url`) + new "app/page.tsx — Band-first UI claims" test section (9 tests): confirms the Band-first notice text is present, BuildProof-does-not-display wording is present, preview label calls the preview "packet", preview note says deliberation happens in Band, 6-step runbook present, step-6 no-display statement present, agent handles still present in source

## Phase 21 — Band Court explicit delegation + self-test
- [x] `band_agents/prompts/lead_judge.md` — rewrote prompt to require: first response acknowledges packet, @mentions all three specialists with a concrete task each, explicitly waits for replies, then posts Final Consensus Verdict; added a "complete-enough packet" definition that forbids stalling to ask the user for more data when project name + score + claim + evidence are present
- [x] `lib/bandCourtPacket.ts` — `BAND_STARTER_PREAMBLE` now spells out the required deliberation flow (LeadJudge must @mention all three specialists in its FIRST reply, specialists must reply even on partial evidence, LeadJudge posts verdict only after specialist replies, no placeholder text, no asking the user for more data)
- [x] `lib/bandCourtPacket.ts` — added `generateBandSelfTestMessage()`: a one-line presence check @-mentioning all four agents and asking each to reply `READY — <handle>`
- [x] `app/page.tsx` — added "Copy Band agent self-test message" button alongside the existing three Band copy buttons in `BandCourtPanel`
- [x] `band_agents/README.md` + `DEMO.md` — documented the self-test and updated combined message format/flow narrative to match the new preamble
- [x] `scripts/testBandCourtPacket.ts` — added explicit-delegation tests, packet-completeness "do not ask user for more data" tests, and a full `generateBandSelfTestMessage` test block (all-four @mentions, READY-reply ask, no placeholders, no banned words)

## Phase 20 — Band Packet Copy Fix (placeholder → real packet)
- [x] Root cause: `DEMO.md` documented a stale combined message format ending with `[full court packet follows]` as a placeholder; `generateBandCombinedMessage` was already correct but the UI preview showed only the court packet instead of the full combined message
- [x] `app/page.tsx` — updated `BandCourtPanel` preview toggle: renamed "Preview court packet" → "Preview combined message"; preview now shows `combinedMessage` (preamble + packet) instead of `packet` alone, so the user can visually confirm exactly what the copy button will place on their clipboard
- [x] `scripts/testBandCourtPacket.ts` — added 20 new tests in two new sections: "generateBandCombinedMessage (content requirements)" and "generateBandCombinedMessage (empty verdicts — no placeholder fallback)"; asserts `[PASTE PACKET HERE]`, `[full court packet follows]`, and four other placeholder variants are absent; asserts all four @BuildProof* handles are present; asserts project name, score, at least one CLAIM: line, at least one "Supporting evidence:" block, both verdict labels, and GitHub URL are all present; asserts empty-verdicts path never generates placeholder text
- [x] `DEMO.md` — rewrote "Combined Band room message format" section to accurately document the current preamble (all four @mentions, no `[full court packet follows]` placeholder) and the full packet structure that follows; removed incorrect note claiming only `@BuildProofLeadJudge` is @mentioned

## Phase 19 — Band Runtime Safety Hardening
- [x] `band_agents/_runtime.py` — fixed misleading "online — connected" log; now prints "starting — attempting Band connection..." before `agent.start()` (REST init + WebSocket connect) and "running — waiting for Band messages." only after `agent.start()` returns successfully; split `agent.run()` into explicit `start()` + `run_forever()` + `stop(timeout=30.0)` to enable the interleaved log
- [x] `band_agents/README.md` — updated example startup log to match corrected wording
- [x] `band_agents/check_band_setup.py` — preflight config checker: loads `agent_config.yaml`, verifies all four role blocks exist, confirms `agent_id`/`api_key` are non-empty and non-placeholder (masked output only), confirms `ANTHROPIC_API_KEY` is set without printing it; exits 0 on pass, 1 on failure
- [x] `band_agents/smoke_band_agents.py` — live smoke tester: runs each agent script one at a time with a 12-second timeout; classifies outcome as `LIKELY_RUNNING` / `DEPENDENCY_MISSING` / `NO_ANTHROPIC_KEY` / `PLACEHOLDER_CONFIG` / `BAND_AUTH_FAILED` / `ERROR_DURING_RUN`; redacts secrets from any output shown
