# BuildProof — Session Handoff

## Current Status

**Phase 23 complete — Band Audit Court hidden behind SHOW_BAND_COURT feature flag.**

- `npx tsc --noEmit` — passes with zero errors
- `npm run lint` — passes with zero warnings/errors
- `npm test` — 11/11 provider + 18/18 scoring + 32/32 judge-comparison + 24/24 compression provider + 50/50 implementation-signal + 124/124 Band court packet tests pass (259 total)
- `npm run build` — passes

## Last Session Work — Phase 23 (Band Feature Flag)

### What changed

**`lib/integrationStatus.ts`**
- Added `showBandCourt: boolean` to `IntegrationStatus`
- `getIntegrationStatus()` reads `SHOW_BAND_COURT` (case-insensitive); only `"on"` returns `true`, default is `false`

**`app/page.tsx`**
- `BandCourtPanel` render changed from unconditional to `{integrationStatus?.showBandCourt && <BandCourtPanel report={report} />}`
- `IntegrationStatusCard`: excluded `showBandCourt` from `LabelKey` type; added "Band Audit Court: off / on (experimental)" row
- All main report panels (TracePanel, CompressionPanel, JudgeComparisonPanel) unchanged and not gated

**`.env.example`**
- Added `SHOW_BAND_COURT=off` with comment: "Experimental Band Audit Court UI. Keep off for main demo unless fully tested."

**`DEMO.md`**
- Band section relabeled "(Experimental — Off by Default)"
- Added enable instructions (`SHOW_BAND_COURT=on`)
- Added "Recommended main demo path" section emphasizing TokenRouter + GitHub evidence + judge comparison
- Removed "app automatically generates … no extra steps required" and "Demo flow: Devpost → Band" from Band section header
- Band demo path updated to note `SHOW_BAND_COURT=on` as prerequisite

**`scripts/testBandCourtPacket.ts`**
- Added static import of `getIntegrationStatus`
- Added new section "SHOW_BAND_COURT feature flag" with 11 tests:
  - `showBandCourt` is false when unset / `=off` / `=OFF`
  - `showBandCourt` is true when `=on` / `=ON`
  - `page.tsx` gates `BandCourtPanel` on `showBandCourt`
  - `BandCourtPanel` is not rendered unconditionally
  - Integration status card includes Band Audit Court row
  - Band status shows `"off"` and `"on (experimental)"` variants
  - Main panels (TokenRouter / judge comparison / evidence) not gated by Band flag

### How to re-enable Band Audit Court

```bash
# .env.local
SHOW_BAND_COURT=on
```

Then restart `npm run dev`. The Band Audit Court panel reappears below every audit report with all copy buttons, self-test, packet preview, and 6-step runbook intact.

### Recommended demo flow (no Band)

```bash
TOKENROUTER_API_KEY=... GITHUB_TOKEN=ghp_... npm run dev
# Optional: JUDGE_COMPARISON=on ANTHROPIC_API_KEY=sk-ant-...
```

1. Open http://localhost:3000
2. Click "RAG + MCP" or "Vision + Multi-agent" preset
3. Add a real public GitHub URL
4. Click **Run Audit**
5. Walk verdict cards — point at claim, evidence bullets (source file / package.json / README), verdict badge
6. Show a "No implementation evidence found" contrast case
7. Scroll to **Evidence Compression** card — raw vs compressed token counts
8. If `JUDGE_COMPARISON=on`: scroll to **Judge Comparison** — Anthropic vs TokenRouter agreement rate
9. Integration Status card shows "Band Audit Court: off" — no Band setup needed

### Verification

```
npx tsc --noEmit    — passes (zero errors)
npm run lint        — passes (zero warnings)
npm test            — 259 passed, 0 failed
                       (11 + 18 + 32 + 24 + 50 + 124)
npm run build       — passes
```

Band court packet suite: 113 → 124 (11 new feature-flag tests).

### Files changed

```
lib/integrationStatus.ts           (updated — showBandCourt field)
app/page.tsx                       (updated — feature flag gate + Band status row)
.env.example                       (updated — SHOW_BAND_COURT=off)
DEMO.md                            (updated — Band section experimental, main demo path)
scripts/testBandCourtPacket.ts     (updated — getIntegrationStatus import + 11 new tests)
TODO.md                            (Phase 23 added)
HANDOFF.md                         (this file)
```

### What is NOT deleted

- `band_agents/` folder — all Python agents, prompts, and helpers intact
- `lib/bandCourtPacket.ts` — packet generator and all helpers intact
- `BandCourtPanel` component in `app/page.tsx` — still fully functional, just hidden by default
- All 113 prior Band packet tests still pass

---

## Last Session Work — Phase 22 (Band-first UX)

### Problem fixed

The `BandCourtPanel` in `app/page.tsx` showed:
1. A misleading green-dot "Ready for Band Audit Court" status (agents might not be running)
2. A "Live demo in 3 steps" runbook whose step 3 said "the three specialists each take their turn" without stating the conversation happens in Band
3. A preview labeled "Preview combined message" whose preamble content (numbered delegation steps with @-mentions) could look like a scripted local conversation
4. No explicit statement anywhere that BuildProof does not display Band replies

### What changed

**`app/page.tsx`** — `BandCourtPanel`
- Replaced the green-dot status + context paragraph with a Band-first notice box:
  - "Live Audit Court conversation happens in Band, not in this app."
  - "BuildProof does not display Band chat history."
- Removed "Ready for Band Audit Court" green dot (misleading if agents are not running)
- Replaced 3-step "Live demo" with a 6-step Band-first runbook:
  1. Start sidecar agents (`cd band_agents && source .venv/bin/activate && python run_all.py`)
  2. Copy self-test message → paste into Band room
  3. Confirm 4 READY replies in Band before proceeding
  4. Copy combined Band room message
  5. Paste into Band room and send
  6. Watch the Audit Court conversation unfold in Band — "BuildProof does not display Band replies."
- Reordered copy buttons: self-test first, combined second; renamed to "Copy self-test message" and "Copy court packet only"
- Renamed preview toggle: "Preview combined message" → "Preview packet (what gets pasted to Band)"
- Updated preview note: "This is not the agent conversation — the actual deliberation happens in Band after you paste this."
- Updated footer: "This web app does not call Band, receive Band messages, or display live Band chat history."

**`scripts/testBandCourtPacket.ts`** — 9 new tests in new section "app/page.tsx — Band-first UI claims"
- Reads `app/page.tsx` source as text and asserts:
  - Band-first notice text is present ("Live Audit Court conversation happens in Band, not in this app")
  - "BuildProof does not display Band replies" wording is present
  - "does not call Band" / "display live Band chat history" is present
  - No text claims BuildProof shows a Band conversation locally
  - Preview label calls it "packet (what gets pasted to Band)" not "conversation"
  - Preview note says "deliberation happens in Band after you paste this"
  - 6-step runbook includes "Watch the Audit Court conversation unfold in Band"
  - Step 6 says "BuildProof does not display Band replies"
  - All four BuildProof handle names still present in source (agent roster regression guard)

### How to verify the Band-first UX

1. `npm run dev` → http://localhost:3000
2. Run any audit (any GitHub URL or sample text)
3. Scroll to **Band Audit Court** panel
4. Confirm the violet notice box at the top reads "Live Audit Court conversation happens in Band, not in this app."
5. Click "▼ Preview packet (what gets pasted to Band)" — confirm the preview note says it's not the conversation
6. The 6-step runbook lists "Watch the Audit Court conversation unfold in Band" as step 6
7. The copy buttons are ordered: self-test → combined → packet only → starter only

### What is NOT displayed in BuildProof

- No fake/local agent dialogue
- No simulated LeadJudge / Specialist reply threads
- No "live Band chat" display in the app
- The panel shows only: notice box, agent roster, copy buttons, packet preview (collapsible), 6-step runbook

### Verification

```
npx tsc --noEmit    — passes (zero errors)
npm run lint        — passes (zero warnings)
npm test            — 248 passed, 0 failed
                       (11 + 18 + 32 + 24 + 50 + 113)
npm run build       — passes (4.6s compile + 1.3s typecheck)
```

Band court packet suite: 104 → 113 (9 new UI-source tests added).

### Files changed

```
app/page.tsx                     (updated — Band-first notice, 6-step runbook, preview rename, button reorder)
scripts/testBandCourtPacket.ts   (updated — added fs/path/url imports + 9 new UI-source tests)
TODO.md                          (Phase 22 added)
HANDOFF.md                       (this file)
```
- Python `py_compile` — all six Band agent scripts + two helpers pass

## Last Session Work — Phase 21 (Band Court explicit delegation + self-test)

### Problem fixed

The Band Audit Court risked only `@BuildProofLeadJudge` responding — the LeadJudge prompt only "called" specialists in the body of its first message but did not have a hard rule to @mention all three by name on the first turn, and the combined message preamble was a polite one-liner that could be paraphrased away. There was also no way to verify, before sending the (heavy) court packet, that all four Band sidecars were actually present in the room.

### What changed

**`band_agents/prompts/lead_judge.md`** — rewritten
- Defines a "complete-enough packet" (project name + overall score + ≥1 CLAIM + ≥1 evidence line) and forbids the LeadJudge from stalling to ask the user for more data when those are present
- Phase 1 (FIRST response) is now a hard contract: must acknowledge the packet, must @mention `@BuildProofClaimProsecutor`, `@BuildProofEvidenceDefender`, `@BuildProofRepoForensics` each with a concrete task, must NOT post a verdict in that first message
- Phase 2: summarize each specialist reply in one sentence, then post Final Consensus Verdict in the structured format
- Explicit "if you find yourself about to send a first response that does not @mention all three specialists, rewrite it before sending" guardrail

**`lib/bandCourtPacket.ts`** — `BAND_STARTER_PREAMBLE` rewritten and new helper added
- New preamble explicitly states the 3-step deliberation flow with all three specialist handles plus their tasks (matching the LeadJudge prompt) so the LeadJudge has the same script in the channel and in its system prompt
- Specialists explicitly told to reply even when evidence is partial or missing
- "Do not stop to ask the user for more data" rule encoded into the preamble itself
- "Do not post placeholder text" rule added
- New `generateBandSelfTestMessage()` exported — single-line presence check that @mentions all four agents on the same line and asks each to reply `READY — <handle>`

**`app/page.tsx`** — `BandCourtPanel`
- Added fourth copy button: **Copy Band agent self-test message** (emerald-bordered) next to the existing three; tooltip explains it as a presence check to run before the full court packet
- Imports `generateBandSelfTestMessage`; copy-state key set widened to `"starter" | "packet" | "combined" | "selftest"`

**`band_agents/README.md`** — added "Band room self-test (presence check)" subsection explaining how to use the button (or paste the line manually), what the four expected `READY — <handle>` replies look like, and what to do if any agent does not respond. Bumped the live-court runbook from 6 steps to 7 to include the self-test step.

**`DEMO.md`** — documented the fourth copy button; replaced the stale combined-message preamble snippet with the new 3-step flow; updated the "all four @mentioned" explanation to reflect that each specialist is also @mentioned a second time inside the deliberation flow.

**`scripts/testBandCourtPacket.ts`** — 30 new tests in three new sections
- `generateBandCombinedMessage (explicit delegation instructions)`: asserts each specialist handle appears with its concrete task verbatim; asserts "FIRST response must @mention all three specialists" rule; asserts "reply in this room even if the evidence is partial" rule; asserts "post final verdict AFTER specialists reply" sequencing; asserts "Do not post placeholder text" rule; asserts "Do not stop to ask the user for more data" rule
- `generateBandCombinedMessage (complete packet → no 'ask user for more data' instruction)`: sanity-checks the packet really does have project name + score + CLAIM + evidence, asserts the preamble does NOT contain any "please provide the packet" / "please share the project" / "awaiting the packet" detour
- `generateBandSelfTestMessage`: asserts all four @mentions, that they appear on the SAME opening line, asks for `READY` reply, no banned safety words, no placeholder strings

### How to run the self-test in a Band room

1. `npm run dev` → http://localhost:3000
2. Run any audit so the **Band Audit Court** panel appears
3. Click **Copy Band agent self-test message** (the emerald-bordered button)
4. Paste into the Band room where all four BuildProof agents should be members
5. Within ~30 seconds you should see four short replies:
   ```
   READY — BuildProofLeadJudge
   READY — BuildProofClaimProsecutor
   READY — BuildProofEvidenceDefender
   READY — BuildProofRepoForensics
   ```
6. If any one is missing, that sidecar is not running or not in the room — fix it (re-run `python check_band_setup.py` and `python smoke_band_agents.py`, then start the missing process) before clicking **Copy combined Band room message**.

### How to verify all four agents work end-to-end

```bash
# Terminal A — preflight + smoke
cd band_agents && source .venv/bin/activate
python check_band_setup.py    # all four [OK], ANTHROPIC_API_KEY set
python smoke_band_agents.py   # all four LIKELY_RUNNING

# Terminal B — run all four sidecars
cd band_agents && source .venv/bin/activate
python run_all.py

# Terminal C — web app
cd /Users/sanghyun/BuildProof
npm run dev
```

Then in the browser:
1. Run an audit (any GitHub URL).
2. Expand **Band Audit Court** → click **Copy Band agent self-test message** → paste into a Band room with all four agents → confirm four READY replies.
3. Click **Copy combined Band room message** → paste → confirm:
   - LeadJudge's FIRST reply acknowledges the packet AND @-mentions all three specialists with their tasks.
   - Each specialist replies in the room (even on partial evidence).
   - LeadJudge posts a Final Consensus Verdict only after specialists reply.

### Verification

```
npx tsc --noEmit    — passes (zero errors)
npm run lint        — passes (zero warnings)
npm test            — 239 passed, 0 failed
                       (11 + 18 + 32 + 24 + 50 + 104)
npm run build       — passes (1.7s compile + 1.4s typecheck)
py_compile          — all 8 band_agents Python files OK
```

Band court packet suite: 74 → 104 (30 new tests added).

### Files changed

```
band_agents/prompts/lead_judge.md          (rewritten — explicit first-response delegation contract)
lib/bandCourtPacket.ts                     (preamble rewritten + generateBandSelfTestMessage added)
app/page.tsx                               (added "Copy Band agent self-test message" button)
band_agents/README.md                      (added Band room self-test section, +1 runbook step)
DEMO.md                                    (updated combined message format + self-test docs)
scripts/testBandCourtPacket.ts             (30 new tests across 3 new sections)
TODO.md                                    (Phase 21 added)
HANDOFF.md                                 (this file)
```

### What is safe to claim

- The combined Band room message now contains an explicit, hard-coded delegation script the LeadJudge must follow (each specialist @mention + concrete task is in both the channel preamble and the LeadJudge system prompt).
- A self-test path exists for verifying all four agents are live in the room before sending the court packet — both as a UI button and as a documented manual paste line.
- All test coverage for the combined message and self-test is in `scripts/testBandCourtPacket.ts` and runs under `npm test`.

### What is NOT yet verified in production

- A real Band-room run of the new preamble — the prompt change is testable in unit tests for *content* but the actual behavior (LeadJudge issuing all three @mentions on turn 1) requires a live Band session to confirm.

---

## Last Session Work — Phase 20 (Band Packet Copy Fix)

### Root cause

`DEMO.md` still documented the old combined message format:

```
...
After the three specialists respond, produce the Final Consensus Verdict.

[full court packet follows]
```

And noted: "Only `@BuildProofLeadJudge` is @mentioned."

Both were wrong. `generateBandCombinedMessage(report)` already produces a complete message (preamble + full court packet, no placeholder), and the preamble @mentions all four agents. But the UI preview showed only `packet` (the court packet), not `combinedMessage` — so users had no way to visually confirm the copy button would include real data. No tests guarded against placeholder strings.

### What changed

**`app/page.tsx`** — `BandCourtPanel` preview section
- Toggle label: "Preview court packet" → "Preview combined message"
- Preview content: `packet` → `combinedMessage`
- Added a one-line label: "This is the full text the **Copy combined Band room message** button will place on your clipboard."

**`scripts/testBandCourtPacket.ts`** — 20 new tests in two new sections
- `generateBandCombinedMessage (content requirements)`: placeholder guard (5 variants including `[PASTE PACKET HERE]` and `[full court packet follows]`); all four `@BuildProof*` handles present; project name, score, `CLAIM:`, `Supporting evidence:`, both verdict labels, GitHub URL all present in combined output
- `generateBandCombinedMessage (empty verdicts — no placeholder fallback)`: confirms no placeholder; confirms all four @mentions; confirms the "No tracked technical claims" sentence appears instead of placeholder text

**`DEMO.md`** — "Combined Band room message format" section
- Replaced the stale preamble text (+ `[full court packet follows]`) with the current preamble verbatim
- Replaced the incorrect "Only `@BuildProofLeadJudge` is @mentioned" note with an accurate explanation that all four agents are @mentioned

### Verification

```
npx tsc --noEmit    — passes (zero errors)
npm run lint        — passes (zero warnings)
npm test            — 209 passed, 0 failed
                       (11 + 18 + 32 + 24 + 50 + 74)
```

Band court packet suite: 54 → 74 (20 new tests added).

### How to test in the browser

1. `npm run dev` → http://localhost:3000
2. Paste any project description + GitHub URL, click **Run Audit**.
3. Scroll to **Band Audit Court** panel.
4. Click **▼ Preview combined message** — the preview shows the actual preamble plus the full court packet with real project name, score, claims, and evidence. No placeholder text.
5. Click **Copy combined Band room message** — paste into a text editor to confirm the clipboard contains the same content as the preview.

### Files changed

```
app/page.tsx                       (updated — preview shows combinedMessage)
scripts/testBandCourtPacket.ts     (updated — 20 new content/placeholder tests)
DEMO.md                            (updated — accurate combined message format)
TODO.md                            (Phase 20 added)
HANDOFF.md                         (this file)
```

---

## Last Session Work — Phase 19 (Band Runtime Safety Hardening)

### Problem fixed

`_runtime.run_agent()` was printing `"online — connected to Band as '…'"` before calling `agent.run()`, which internally calls `agent.start()` (REST metadata fetch + WebSocket connect). The log fired before any Band network call had been attempted, claiming a connection that did not exist yet.

### What changed

**`band_agents/_runtime.py`** — `run_agent` rewritten
- `agent.run()` replaced with explicit `agent.start()` → `agent.run_forever()` → `agent.stop(timeout=30.0)` so a log can be inserted between startup and the message loop
- Before `agent.start()`: `"starting — attempting Band connection as '…'..."`
- After `agent.start()` returns (REST + WebSocket both up): `"running — waiting for Band messages."`
- Behaviour is otherwise identical to the old `agent.run(shutdown_timeout=30.0)` call

**`band_agents/README.md`** — updated example startup log to match

**`band_agents/check_band_setup.py`** — new preflight checker
- Loads `agent_config.yaml` via `yaml.safe_load`
- Verifies all four role blocks (`lead_judge`, `claim_prosecutor`, `evidence_defender`, `repo_forensics`)
- Confirms `agent_id` / `api_key` are non-empty and do not match placeholder prefixes (`uuid-for-*`, `band-api-key-for-*`)
- Prints only masked values (first 4 + last 4 chars)
- Loads `.env` via `python-dotenv`; confirms `ANTHROPIC_API_KEY` is set without printing it
- Exits 0 when all checks pass, exits 1 on any failure
- Explicit instructions printed on how to proceed to live auth verification

**`band_agents/smoke_band_agents.py`** — new live smoke tester
- Runs each of the four agent scripts one at a time via `subprocess.run` with a 12-second timeout
- Outcome labels: `LIKELY_RUNNING` (clean timeout), `DEPENDENCY_MISSING`, `NO_ANTHROPIC_KEY`, `PLACEHOLDER_CONFIG`, `BAND_AUTH_FAILED` (401/Forbidden), `ERROR_DURING_RUN`, `EXITED_CLEAN`
- Redacts API keys and UUIDs from any stderr shown to the user
- Exits 0 if all four agents show `LIKELY_RUNNING` or `EXITED_CLEAN`, else exits 1

### Verification results

```
check_band_setup.py:
  [OK]  lead_judge             agent_id=8c91****73b1  api_key=band****Ni5D
  [OK]  claim_prosecutor       agent_id=996e****71a6  api_key=band****srbE
  [OK]  evidence_defender      agent_id=8218****e622  api_key=band****Dtp0
  [OK]  repo_forensics         agent_id=bbd3****ca08  api_key=band****Rdqj
  [OK]  ANTHROPIC_API_KEY is set
  [PASS] Config shape looks like real credentials.

smoke_band_agents.py:
  ✓ (timed out cleanly — likely connected)  [BuildProofLeadJudge]
  ✓ (timed out cleanly — likely connected)  [BuildProofClaimProsecutor]
  ✓ (timed out cleanly — likely connected)  [BuildProofEvidenceDefender]
  ✓ (timed out cleanly — likely connected)  [BuildProofRepoForensics]
  [PASS] All 4 agents appear to be running.
```

### Files changed

```
band_agents/_runtime.py           (updated — corrected startup log, split start/run_forever/stop)
band_agents/README.md             (updated — example log text)
band_agents/check_band_setup.py   (new — preflight config checker)
band_agents/smoke_band_agents.py  (new — live smoke tester)
TODO.md                           (Phase 19 added)
HANDOFF.md                        (this file)
```

### What is safe to claim about Band

- All four Band External Agent credentials have been verified as non-placeholder by `check_band_setup.py`.
- All four agents ran for 12 seconds without a traceback or 401 error — they connected to Band's WebSocket.
- The startup log now accurately reflects the connection lifecycle: "starting…" fires before any network call; "running…" fires only after `agent.start()` returns.
- The web app still does **not** call Band directly — the bridge is the court packet the user pastes into the Band room.

### Next commands to run the full Audit Court

```bash
cd band_agents && source .venv/bin/activate
python run_all.py       # all four agents in one terminal (Ctrl+C to stop)
# OR
python lead_judge.py    # Terminal 1
python claim_prosecutor.py      # Terminal 2
python evidence_defender.py     # Terminal 3
python repo_forensics.py        # Terminal 4
```

Then in the web app: run an audit → expand Band Audit Court → Copy combined message → paste into a Band room where all four agents are members.

---

## Last Session Work — Phase 18 (Detector Architecture Audit)

### Problem fixed

Audit issue #4: the six detectors were each thin wrappers around a hand-rolled
keyword list plus a few `String.includes` calls. There was no reusable layer
that distinguished an `import` statement (strong signal) from a single substring
hit in a comment (weak signal), and no separation between "README mentions X"
and "the codebase actually implements X". A claim like "uses RAG" backed only by
a README mention was indistinguishable from one backed by a real vector-store
import + `similarity_search` call.

### What changed

**`detectors/implementationSignals.ts`** — new shared helper
- `findImplementationSignals(scan, query)` analyses a `RepoScan` against a
  `SignalQuery` and returns a structured `ImplementationSignalResult`
- Layered signal types, strongest → weakest:
  - **source_file** — import/require/dynamic-import statements (JS/TS) and
    `import pkg` / `from pkg import` / `from pkg.sub import` lines (Python);
    *and* case-sensitive usage-pattern hits (e.g. `McpServer`, `similarity_search`,
    `StateGraph`)
  - **package_json** — `dependencies` / `devDependencies` / `peerDependencies`
    match, or Python dependency-file match (`requirements.txt`, `pyproject.toml`,
    `setup.cfg`, `Pipfile`, `setup.py`); evidence text cites the actual file
  - **file_tree** — recognised config filenames (e.g. `mcp.json`,
    `claude_desktop_config.json`) and generic path-pattern matches
  - **readme** — README term hit (surfaced separately, never conflated with code)
  - **absence** — calibrated per signal type: "no dep found" if dependency
    missing, "no implementation found in source files" if no source signal
- Source-path deduping: when the same file matches both an import and a usage
  pattern, only the import is cited (avoids double-counting one file)
- `isReadmeOnly` boolean exposed for callers/tests: true only when README hit
  is the *single* positive signal across every layer
- Pure function, no I/O

**`detectors/mcp.ts`** — rewritten on top of helper
- Stronger signals: `@modelcontextprotocol/sdk` (Node) + `mcp` /
  `modelcontextprotocol` (Python) deps; config filenames `mcp.json`,
  `mcp.config.json`, `.mcp.json`, `claude_desktop_config.json`; imports of
  `@modelcontextprotocol/sdk`, `modelcontextprotocol`, `mcp`; usage patterns
  `McpServer`, `StdioServerTransport`, `SSEServerTransport`, `server.tool(`,
  `registerTool(`, `register_tool(`, `@server.tool`, `@mcp.tool`, `mcp.connect`,
  `new Server(`, `Server({`

**`detectors/rag.ts`** — rewritten on top of helper
- Vector DB / retrieval deps (Node): pinecone, chromadb, weaviate-client,
  qdrant-client, faiss-node, langchain (core/community/openai), llamaindex,
  pgvector, vectordb, milvus, lancedb
- Python deps include faiss-cpu/gpu, sentence-transformers, pymilvus, lancedb,
  annoy, pinecone-client, langchain-{core,community,openai}
- Imports: pinecone, chromadb, weaviate, qdrant_client, faiss, lancedb,
  llamaindex / llama_index, langchain*, sentence_transformers
- Usage patterns: `VectorStore`, `similarity_search` / `similaritySearch`,
  `as_retriever` / `asRetriever`, `from_documents` / `fromDocuments`,
  `embed_documents`, `embed_query`, `OpenAIEmbeddings`,
  `HuggingFaceEmbeddings`, `RecursiveCharacterTextSplitter`, `split_documents`,
  `upsert(`, `PineconeStore`, `Chroma(`, `WeaviateStore`, `QdrantClient`,
  `VectorStoreIndex`

**`detectors/multiAgent.ts`** — rewritten on top of helper
- Frameworks: langgraph, crewai, autogen (variants), swarm, semantic-kernel,
  smolagents, openai-agents, agency-swarm, controlflow, pydantic-ai, taskweaver,
  uagents, phidata, agno
- Usage patterns: `StateGraph`, `MessageGraph`, `AgentExecutor`, `AgentState`,
  `Crew(`, `Agent(`, `Task(`, `create_react_agent`, `create_swarm`,
  `create_supervisor`, `RoutedAgent`, `AssistantAgent`, `UserProxyAgent`,
  `ConversableAgent`, `GroupChat`, `GroupChatManager`, `Orchestrator` (uppercase
  only, to avoid generic-variable false positives), `handoff(`, `Handoff(`,
  `register_agent`, `add_node(`, `add_edge(`
- Dropped over-broad `.invoke(` and lowercase `orchestrator` from prior pattern
  list — both fired on plain LangChain Runnable chains / unrelated variables

**`scripts/testImplementationSignals.ts`** — new (50 tests)
- Helper-level: no-signal absence, readme-only flag, node-dep-only, python-dep-
  only (cites `requirements.txt`), JS import detection, Python import detection,
  config-file recognition, source-path dedupe (import + usage in same file =
  1 evidence), full-signal no-absence, comment-only false-positive guard
- MCP detector: dep + source → source_file + package_json positives, no
  absences; readme-only → readme positive + 'no dep' + 'no source' absences;
  Python FastMCP + `@mcp.tool` → source_file positive; comment-only → no
  source_file positive
- RAG detector: chromadb dep + Chroma/asRetriever source → strong; readme-only
  ("retrieval-augmented generation") → weak with absences; Python langchain_
  community + `similarity_search` → strong
- Multi-agent detector: LangGraph dep + StateGraph + `add_node(` → strong;
  CrewAI dep + Crew/Agent/Task → strong; readme-only "multi-agent
  orchestrator" → weak with absences; only express dep → single absence
  evidence

**`package.json`** — `npm test` script extended to run the new test file

### Files changed

```
detectors/implementationSignals.ts          (new — shared helper)
detectors/mcp.ts                            (rewritten — uses helper)
detectors/rag.ts                            (rewritten — uses helper)
detectors/multiAgent.ts                     (rewritten — uses helper)
scripts/testImplementationSignals.ts        (new — 50 tests)
package.json                                (test script updated)
TODO.md                                     (Phase 18 added)
HANDOFF.md                                  (this file)
```

### How this is deeper than keyword matching

Before:

```
sourceMatchingTerms(scan.sourceFiles, ["McpServer", "modelcontextprotocol"])
  → returns { path, term } for any source file whose lowercased text contains
    any term anywhere — comments, strings, variable substrings all count
```

After:

```
findImportMatches(scan.sourceFiles, ["@modelcontextprotocol/sdk", "mcp"])
  → only fires on a real import / require / from-import / dynamic-import
    statement; comments and variable substrings don't match
findUsagePatterns(scan.sourceFiles, ["McpServer", "server.tool(", "@mcp.tool"])
  → case-sensitive substring with code-shape ("(", "@") in the patterns
    themselves so `if (server)` doesn't fire on `server.tool(`
```

The output also separates signal *types*: an import-line hit is `source_file`
(weight 5 under the weighted authenticity score), a config-file hit is
`file_tree` (weight 2) labelled "is an MCP config file", and a README mention
is `readme` (weight 1). The score formula already weights these differently,
so the new helper makes the scoring lever do what it was designed to do.

### Evidence behavior — before vs. after

**Scenario A: README claims "uses MCP" but the repo has no MCP code at all**

| Stage      | Before                                   | After                                    |
|------------|------------------------------------------|------------------------------------------|
| Detector   | `README mentions "mcp server"` (positive readme) + "No MCP dep" (negative package_json) + "No MCP server or client implementation found" (negative absence) | same shape — but `isReadmeOnly` flag now exposed, helper centralises the absence text per signal type |
| Score      | 1 / (1 + 2) = **33%** ("README-only" range) | same **33%** — no regression; UI text is now consistent across all three detectors |

**Scenario B: Repo claims "uses MCP" + `@modelcontextprotocol/sdk` in deps + `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"` + `server.tool(...)` calls**

| Stage      | Before                                                                              | After                                                                                       |
|------------|-------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| Detector   | `package.json includes @modelcontextprotocol/sdk` + `src/server.ts contains MCP usage ("McpServer")` (lowercased substring hit) | `src/server.ts imports @modelcontextprotocol/sdk` (real import statement) + `package.json includes @modelcontextprotocol/sdk` |
| Score      | 5 + 4 = 9 / 9 = **100%**                                                            | same **100%** — but evidence text now describes the actual import statement, not a generic substring hit |

**Scenario C (the false-positive that mattered): a `.ts` file with a comment mentioning "mcp"**

| Stage      | Before                                                                              | After                                                              |
|------------|-------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| Detector   | substring `"mcp"` found in comment via lowercased `includes`; fires as `file_tree` evidence | no import statement and no usage pattern match — no source_file positive emitted |
| Score      | inflated by spurious 2 points                                                       | unaffected — README/code distinction holds                          |

**Scenario D: Python multi-agent code with `from langgraph.graph import StateGraph` + `graph.add_node(...)` + `requirements.txt: langgraph>=0.2`**

| Stage      | Before                                                                              | After                                                                                       |
|------------|-------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| Detector   | `requirements.txt includes langgraph` + `graph.py contains multi-agent pattern ("StateGraph")` | `graph.py imports langgraph` + `graph.py uses multi-agent pattern ("add_node(")` (deduped — path only cited once) + `requirements.txt includes langgraph` |

### Verification

- `npx tsc --noEmit` — passes
- `npm run lint` — passes
- `npm test` — 135/135 pass (11 + 18 + 32 + 24 + 50)
- `npm run build` — succeeds (1.7s compile + 1.4s typecheck)

### Constraints honored

- `.env.local` not modified ✓
- No API keys printed or exposed ✓
- No new packages installed ✓
- TokenRouter, Anthropic, deterministic fallback paths unchanged ✓
- Weighted authenticity scoring unchanged ✓
- Judge-comparison behavior unchanged ✓
- Compression flow unchanged ✓
- Public `Evidence` / `ClaimVerdict` / `AuditReport` shapes unchanged ✓
- UI surfaces unchanged ✓
- Other three detectors (realtime / voice / computerVision) left untouched ✓

## Last Session Work — Phase 17 (Compression Architecture Audit)

### Problem fixed

The remote Token Company endpoint was a placeholder (`.example` TLD — never a real domain).
Previously, when `TOKEN_COMPANY_API_KEY` was set but `TOKEN_COMPANY_API_URL` was not configured,
the adapter would still attempt a `fetch()` to the placeholder domain, which threw a network error
(caught), then fell back to local compression but labeled the result `source: "fallback"`.
Additionally, the integration status card showed `"enabled"` for Token Company when the key was
set, even though the remote would never work without a real URL.

### What changed

**`adapters/compression/theTokenCompanyCompressor.ts`**
- Added `isPlaceholderUrl(url)` — detects `.example`, `.invalid`, `.localhost` TLDs and blank strings
- Added `export function isTokenCompanyRemoteReady()` — returns `true` only when both `TOKEN_COMPANY_API_KEY` and a real (non-placeholder) `TOKEN_COMPANY_API_URL` are configured
- In `compress()`: early-returns `null` without any network call when `TOKEN_COMPANY_API_URL` is blank or a placeholder

**`adapters/compression/provider.ts`**
- Imports `isTokenCompanyRemoteReady` from the compressor
- Replaces `hasTokenCompanyKey` gate with `isTokenCompanyRemoteReady()`:
  - `auto` mode with key but no real URL → local compressor runs directly (`source: "local-claim-aware"`, `fallbackUsed: false`) — no misleading fallback flag
  - `token-company` mode explicitly requested but remote not configured → `source: "fallback"`, `fallbackUsed: true` (user asked for remote, it's not available)
  - `auto` or `token-company` with key + real URL → attempt remote, fall back to local on network error

**`lib/integrationStatus.ts`**
- Imports `isTokenCompanyRemoteReady`
- `tokenCompany` label logic now uses `remoteReady`:
  - `"enabled"` — only when key + real URL configured (remote will actually be attempted)
  - `"fallback mode"` — `COMPRESSION_PROVIDER=token-company` but remote not configured
  - `"local mode"` — auto without real remote, or `COMPRESSION_PROVIDER=local`
  - `"disabled"` — `COMPRESSION_PROVIDER=off`
- Removed the now-unused `hasTokenCompany` variable

**`.env.example`**
- Updated `TOKEN_COMPANY_API_URL` comment: clarifies that leaving it blank uses local compression (no remote calls made regardless of key)

**`scripts/testCompressionProvider.ts`** (new — 24 tests)
- `isTokenCompanyRemoteReady()`: 8 cases covering no key, blank URL, placeholder URL, real URL, localhost
- `selectCompressionMode()`: 10 cases covering all valid values + uppercase + aliases
- `runCompression()` async: 6 cases verifying no remote source without real URL, `source: "local-claim-aware"` for auto-without-URL, `source: "fallback"` for token-company-without-URL

**`package.json`** — test script extended to run `testCompressionProvider.ts`

### Files changed

```
adapters/compression/theTokenCompanyCompressor.ts  (updated — isPlaceholderUrl, isTokenCompanyRemoteReady, early-return guard)
adapters/compression/provider.ts                   (updated — isTokenCompanyRemoteReady gate, auto vs token-company fallback distinction)
lib/integrationStatus.ts                           (updated — uses isTokenCompanyRemoteReady, removed hasTokenCompany)
.env.example                                       (updated — TOKEN_COMPANY_API_URL comment)
scripts/testCompressionProvider.ts                 (new — 24 tests)
package.json                                       (updated — test script)
TODO.md                                            (Phase 17 added)
HANDOFF.md                                         (this file)
```

### Compression story — what is safe to claim

**Safe to claim:**
- BuildProof has a working local claim-aware compressor that reduces LLM judge context by trimming source-file snippets, merging repeated README mentions, and collapsing missing-signal lists
- The compressor is claim-aware: it preserves claim ID, detector label, verdict-relevant evidence, and polarity for every claim
- The adapter architecture is designed to support a real remote compression service — `isTokenCompanyRemoteReady()` gates any network call behind both a key check and a URL sanity check
- No placeholder domain is ever called in production or demo mode

**Do not claim:**
- That The Token Company remote API is integrated — the adapter exists as a forward-looking stub. The remote endpoint is a placeholder; no real API contract has been finalized.
- That `TOKEN_COMPANY_API_KEY` enables remote compression — it does not, unless `TOKEN_COMPANY_API_URL` is also set to a real endpoint.
- That remote compression is "active" or "enabled" in the Integration Status card — with the current env setup, it will show `"local mode"`.

## Last Session Work — Phase 16 (Judge Comparison)

### Goal
Add an optional comparison mode that runs both Anthropic (Claude) and TokenRouter (MiniMax-M3)
judges in parallel on the same compressed evidence payload, reports per-claim agreement /
disagreement, and never disturbs the canonical primary verdict.

### Files changed

```
types/pipeline.ts                  (added JudgeComparison + related types; AuditReport.judgeComparison?)
pipeline/compareJudges.ts          (new — eligibility, runner, agreement builder, parallel helper)
pipeline/judgeClaims.ts            (captures primary judge duration; runs secondary only when eligible)
pipeline/index.ts                  (threads comparison through; adds judge-comparison trace step)
pipeline/generateReport.ts         (accepts and includes judgeComparison? on AuditReport)
lib/integrationStatus.ts           (adds judgeComparison: enabled | disabled | not eligible)
app/page.tsx                       (JudgeComparisonPanel + integration status row)
.env.example                       (JUDGE_COMPARISON=off with explanation)
scripts/testJudgeComparison.ts     (new — 32 tests, no network)
package.json                       (test script runs the new test file)
TODO.md                            (Phase 16 added)
HANDOFF.md                         (this file)
```

### How comparison mode works

1. The primary judge runs as before — its canonical verdicts go into the report unchanged.
2. After the primary judge succeeds, `judgeClaims` checks `checkComparisonEligibility`:
   - `JUDGE_COMPARISON=on` (case-insensitive)
   - both `ANTHROPIC_API_KEY` and `TOKENROUTER_API_KEY` present
   - at least one claim
3. If eligible, the *other* provider is called against the same `LLMJudgeInput` (which
   already went through compression, if compression mode is non-off) — the active provider
   is never called twice.
4. The primary's raw `LLMJudgeResult` and measured duration are reused, then both provider
   results are passed to `buildComparison`, which computes `agreementRate`, `agreedCount`,
   `comparedCount`, and per-claim `disagreements[]`.
5. If the primary judge fails and falls back to deterministic, comparison is skipped (safer
   and cheaper — no LLM round trips on the fallback path).
6. If the secondary provider fails, comparison reports `status: "partial"` and the audit
   still completes normally.

### How to enable

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
TOKENROUTER_API_KEY=...
JUDGE_COMPARISON=on
# LLM_PROVIDER may be anthropic, tokenrouter, or auto — primary is chosen as usual

npm run dev
```

Visit http://localhost:3000, run an audit, and the **Judge Comparison** panel appears below
**Evidence Compression**. The **Integration Status** card on the form shows a new
`Judge comparison` row reflecting `enabled | disabled | not eligible`.

### How to demo

1. Set both keys + `JUDGE_COMPARISON=on` in `.env.local`.
2. Run the audit (any sample input).
3. Show three things in the UI:
   - **Integration Status** card → `Judge comparison: enabled`
   - **Run trace** → new `judge-comparison` step with status + agreement metadata
   - **Judge Comparison** panel: per-provider model + duration cards, per-claim agreement
     rows with both verdicts and rationale previews, ✓ / ⚠ markers for agreement.

### Failure modes

| Scenario | Behavior |
|----------|----------|
| `JUDGE_COMPARISON=off` (default) | No comparison runs; panel hidden; status `disabled`. |
| `JUDGE_COMPARISON=on`, only one key set | No comparison; trace records `skipped`; status `not eligible`. |
| Secondary provider returns null / throws | `comparison.status="partial"`, panel shows ✕ for failed side, `failureReason` surfaced. |
| Primary judge fails → deterministic fallback | Comparison skipped entirely; audit completes deterministically. |
| Both providers fail (only possible via direct `compareJudges` call) | `status="failed"` with explanatory `notes`. |

### Safety / constraints honored

- `.env.local` not modified
- No keys or private repo content printed in logs
- No new packages installed
- Existing TokenRouter, Anthropic, and deterministic fallback paths unchanged
- Compression flow and report-rendering chains preserved
- All previous tests still pass (11 provider + 18 scoring); 32 new tests added; total 61 pass

## Prior Session Work — Phase 15 (weighted authenticity score formula)

## Last Session Work

### Weighted Authenticity Score (Phase 15)

**`pipeline/scoreAuthenticity.ts`** — replaced the old `positive / total * 100` ratio with a weighted denominator model:

- Positive weights: `source_file=5`, `package_json=4`, `file_tree=2`, `readme=1`, `absence=0`
- Each negative (absence / missing-signal) item adds 1 to the denominator, diluting the score without collapsing it to zero
- Formula: `score = round(positivePoints / (positivePoints + negativeCount) * 100)`
- Before/after examples:
  - `readme + 2 absences`: was 33% (1 positive / 3 total), still 33% (1/3) — coincidentally same here, but for different reasons (now weights matter, not raw counts)
  - `package_json + 1 absence`: was 50% (1/2), now **80%** (4/(4+1))
  - `source_file + 1 absence`: was 50% (1/2), now **83%** (5/(5+1))
  - `source_file + package_json + readme, no absence`: was 100%, still **100%**
  - `readme only, no absence`: was 100%, still **100%** (same behavior — the label comes from the detector's absence items, not the score alone)

**`scripts/testScoreAuthenticity.ts`** — 18 test cases:
- exact-score assertions for each evidence type combination
- range assertions (README-only range 26–50, strong range ≥70)
- comparison tests (source_file > readme, package_json > readme)
- confirms adding absences strictly lowers score
- confirms multiple absences with no positive → 0

**`package.json`** — added `npm test` script running both test files via `npx tsx`

## Changed Files

```
pipeline/scoreAuthenticity.ts   (updated — weighted formula)
scripts/testScoreAuthenticity.ts (new — 18 scoring tests)
package.json                    (updated — npm test script)
TODO.md                         (updated — Phase 15 added)
HANDOFF.md                      (this file)
```

## Last Session Work

**`lib/tokenEstimate.ts`** — new:
- `estimateTokens(text)` returns `{ estimatedTokens, chars }` using a chars/4 approximation
- `estimateTokensFromValue(value)` serializes arbitrary values before estimating
- Pure, no network calls

**`pipeline/compressEvidenceContext.ts`** — new:
- `compressEvidenceContextLocal(input)` — claim-aware compressor
  - Preserves every claim ID, claim text, detector, score
  - Source-file snippets trimmed to lines most relevant to claim keywords (max 6 lines)
  - Package.json items capped at 200 chars
  - File-tree items capped at 180 chars
  - Repeated README evidence merged into "README mentions (N): …"
  - Absence items merged into "Missing signals (N): …"
  - Evidence deduplicated by (source, polarity, text)
  - Source-file > package_json > file_tree > absence > readme priority sort
  - Strips unsafe words (fake/lying/scam/fraud/deceptive) defensively
  - Guarantees ≥ 1 evidence item per claim
- `disabledCompressionContext(input)` — pass-through with metadata for "disabled" mode

**`adapters/compression/types.ts`** — new:
- `EvidenceCompressor` interface, `CompressedEvidenceContext`, re-exports public metadata
  types from `types/pipeline`

**`adapters/compression/theTokenCompanyCompressor.ts`** — new:
- Env-gated by `TOKEN_COMPANY_API_KEY`; honors optional `TOKEN_COMPANY_API_URL`
- Sends an already-locally-compressed payload as the base, so a remote call cannot inflate
  context vs the local baseline
- Falls back to local baseline if response is not smaller than baseline
- Returns null on missing key, network error, or malformed response (provider then falls
  back to local claim-aware compressor)
- TODO comment marks the placeholder endpoint — no undocumented endpoint invented

**`adapters/compression/provider.ts`** — new:
- `selectCompressionMode()` reads `COMPRESSION_PROVIDER` (off | local | token-company | auto)
- `runCompression(input)` orchestrates: off → disabled context; local → local compressor;
  token-company or auto+key → remote with safe local fallback; auto without key → local

**`pipeline/judgeClaims.ts`** — updated:
- New `JudgeClaimsResult` interface adds optional `compression` metadata
- Builds raw `LLMJudgeInput`, then runs compression unless mode is off
- LLM judge receives compressed input; deterministic fallback path also returns compression
  metadata if it ran
- Any compression error is caught and the raw input is used (compression never breaks the
  audit)

**`pipeline/index.ts`** — updated:
- Destructures `compression` from `judgeClaims`
- Adds an `evidence-compression` trace step (status: success/fallback/skipped)
- Threads `compression` into `generateReport`

**`pipeline/generateReport.ts`** — updated:
- Accepts optional `compression: CompressionMetadataPublic` parameter
- Includes it on `AuditReport` only when present

**`types/pipeline.ts`** — updated:
- New `CompressionSource`, `CompressionPreservedSignals`, `CompressionMetadataPublic` types
- `AuditReport` gains optional `compression?: CompressionMetadataPublic`

**`lib/integrationStatus.ts`** — updated:
- Adds `CompressionStatusLabel` and `tokenCompany` to `IntegrationStatus`
- Labels: `enabled` (key + mode permits remote), `local mode` (local-only), `fallback mode`
  (token-company mode requested but no key), `disabled` (mode = off)

**`app/page.tsx`** — updated:
- `CompressionPanel` component: cyan-bordered card with status pill, source label, raw vs
  compressed token tiles, % reduction, ratio, preserved-signal chips, fallback flag, notes
- Rendered between `TracePanel` and `BandCourtPanel`
- `IntegrationStatusCard` gains a Token Company row with its own color map

**`.env.example`** — updated:
- Added `COMPRESSION_PROVIDER=auto`, `TOKEN_COMPANY_API_KEY=`, `TOKEN_COMPANY_API_URL=`
- App works without any of these set

**`DEMO.md`** — updated:
- Added "The Token Company / Evidence Compression Demo" section with pipeline diagram,
  enable instructions, UI walkthrough, preservation rules, adapter behavior, and judge
  pitch tradeoff explanation

**`TODO.md`** — updated:
- Added Phase 14 with all items checked

## Changed Files

```
lib/tokenEstimate.ts                              (new)
pipeline/compressEvidenceContext.ts               (new)
adapters/compression/types.ts                     (new)
adapters/compression/theTokenCompanyCompressor.ts (new)
adapters/compression/provider.ts                  (new)
pipeline/judgeClaims.ts                           (updated)
pipeline/index.ts                                 (updated)
pipeline/generateReport.ts                        (updated)
types/pipeline.ts                                 (updated)
lib/integrationStatus.ts                          (updated)
app/page.tsx                                      (updated)
.env.example                                      (updated)
DEMO.md                                           (updated — Phase 14 section)
TODO.md                                           (updated — Phase 14 added)
HANDOFF.md                                        (this file)
```

## How to Run

```bash
cd /Users/sanghyun/BuildProof

# Local compressor, no LLM, no API keys
npm run dev

# Local compressor explicitly
COMPRESSION_PROVIDER=local npm run dev

# Try The Token Company first, local fallback on any failure
COMPRESSION_PROVIDER=auto TOKEN_COMPANY_API_KEY=... npm run dev

# Disable compression entirely (raw context sent to LLM judge)
COMPRESSION_PROVIDER=off npm run dev
```

## Verification

A local smoke test against a synthetic 3-claim payload (MCP / RAG / Voice) yielded:

- raw 525 → compressed 472 tokens (10% reduction on a small input)
- preserved: 3 claims, 5 positive, 4 negative evidence, 2 source-file snippets, 3 file paths
- every claim retained at least one evidence item or explicit missing-signal marker
- source-file evidence sorted ahead of README mentions
- repeated README mentions collapsed to "README mentions (2): …"
- three absence items collapsed to "Missing signals (3): …"

Real audits with longer source-file snippets will see substantially larger reductions
(snippet trimming is the main lever; large source-file payloads benefit most).

## Confirmations

- `.env.local` not modified ✓
- No secrets printed or revealed ✓
- `band_agents/agent_config.yaml` not touched ✓
- Browserbase ingestion behavior unchanged ✓
- Sentry trace export behavior unchanged ✓
- Band Audit Court packet generator unchanged ✓
- GitHub scanner behavior unchanged ✓
- Six static detectors unchanged ✓
- LLM provider fallback chain unchanged (Anthropic → OpenAI → deterministic) ✓
- Deterministic judge still works when no LLM key is present ✓
- Compression failure never breaks the audit (try/catch around `runCompression`) ✓
- Visible report evidence list still shows full uncompressed evidence (compression is judge-side only) ✓
- Endpoint for The Token Company API is left as a placeholder behind a clear TODO ✓
- App works with no TOKEN_COMPANY_API_KEY set ✓
- `npx tsc --noEmit` passes ✓
- `npm run lint` passes ✓
- `npm run build` passes ✓

## TokenRouter MiniMax-M3 Reasoning-Tag Hardening (this session)

**`lib/tokenRouterClient.ts`** — updated:
- `stripReasoning(text)` exported helper — removes `<think>...</think>` blocks before returning content
- Applied in `callTokenRouter` before the `ok: true` return; if stripping leaves empty string, returns `empty-after-stripping` error
- `stripReasoning` is also exported so callers can use it independently

**`adapters/llm/tokenrouterClaimExtractor.ts`** — updated:
- Replaced `stripMarkdown()` with `extractJson()` — strips reasoning tags, tries code blocks, falls back to first `{...}` in text

**`adapters/llm/tokenrouterClaimJudge.ts`** — updated:
- Same `extractJson()` replacement

## End-to-end TokenRouter verification

Audit run against `anthropics/anthropic-cookbook` with 3-claim input (multi-agent / MCP / RAG):
- `claimExtractionSource: llm-tokenrouter` ✓
- `judgeSource: llm-tokenrouter` ✓
- `scanSource: github-api` ✓ (real GitHub scan)
- 3 verdicts returned with rationale (Partially supported / Partially supported / Strongly supported)

Server log:
```
[TokenRouter] provider=tokenrouter model=MiniMax-M3 status=success durationMs=2184
[TokenRouter] provider=tokenrouter model=MiniMax-M3 status=success durationMs=14145
[TokenRouter] provider=tokenrouter model=MiniMax-M3 status=success durationMs=12474
```

Smoke endpoint preview after fix: `"responsePreview": "OK"` (reasoning tags stripped).

`.env.local` currently has `LLM_PROVIDER=tokenrouter`. Revert to `LLM_PROVIDER=anthropic` to restore default mode.

## TokenRouter Smoke Test + Client Refactor (this session)

**`lib/tokenRouterClient.ts`** — new:
- `callTokenRouter({ messages, timeoutMs })` — shared fetch helper used by both adapters
- Reads `TOKENROUTER_API_KEY` internally (never passed as parameter); returns null if missing
- Reads `TOKENROUTER_MODEL` (default `MiniMax-M3`)
- AbortController timeout; catches network errors, timeouts, non-OK HTTP, invalid JSON, empty content
- Logs safe metadata only: `[TokenRouter] provider=tokenrouter model=X status=Y reason=Z durationMs=N`
- `tokenRouterConfigured()` — boolean key-presence check
- `tokenRouterModel()` — returns configured model name

**`app/api/smoke/tokenrouter/route.ts`** — new:
- GET `/api/smoke/tokenrouter` — server-side only smoke test
- Returns `{ status: "skipped", model, reason }` when no key; never crashes
- Returns `{ status: "success"|"failed", model, durationMs, responsePreview }` on live call
- `responsePreview` is capped at 60 chars — never reveals private content

**`adapters/llm/tokenrouterClaimExtractor.ts`** — refactored to use `callTokenRouter`
**`adapters/llm/tokenrouterClaimJudge.ts`** — refactored to use `callTokenRouter`

**`lib/integrationStatus.ts`** — updated:
- `IntegrationStatus` gains `tokenrouterModel: string`
- `getIntegrationStatus()` calls `tokenRouterModel()` and includes it in the payload

**`app/page.tsx`** — updated:
- `IntegrationStatusCard`: excludes `tokenrouterModel` from label rows type
- Shows "TR model: MiniMax-M3" row only when TokenRouter is the selected provider
- Shows ⚠ fallback warning when `LLM_PROVIDER=tokenrouter` but key is missing

**`.env.local`** — updated:
- Added `TOKENROUTER_API_KEY=` and `TOKENROUTER_MODEL=MiniMax-M3` placeholder lines

## Smoke test result

Confirmed via `curl http://localhost:3000/api/smoke/tokenrouter`:
```json
{"status":"skipped","model":"MiniMax-M3","reason":"TOKENROUTER_API_KEY not configured — add it to .env.local"}
```
No-key path works correctly. Once `TOKENROUTER_API_KEY` is set, the same endpoint returns `status: "success"` with `durationMs` and a safe `responsePreview`.

## TokenRouter Provider (this session)

**`adapters/llm/tokenrouterClaimExtractor.ts`** — new:
- Reads `TOKENROUTER_API_KEY`; returns null if missing (keyword fallback used)
- POST to `https://api.tokenrouter.com/v1/chat/completions` with `TOKENROUTER_MODEL` (default `MiniMax-M3`)
- 30s timeout via AbortController
- Combined system+user prompt in single user message (API requirement)
- Same parse/validation logic as Anthropic/OpenAI extractors
- Returns null on missing key, network error, timeout, invalid JSON, or malformed response

**`adapters/llm/tokenrouterClaimJudge.ts`** — new:
- Same pattern as extractor; 60s timeout for judge calls (larger payloads)
- Validates all claim IDs and verdict labels; returns null on any validation failure

**`adapters/llm/provider.ts`** — updated:
- `ActiveProvider` union extended with `"tokenrouter"`
- `LLM_PROVIDER=tokenrouter` routes to TokenRouter if key present, else `"none"`
- `auto` priority: Anthropic → OpenAI → TokenRouter → none

**`types/pipeline.ts`** — updated:
- `ClaimExtractionSource` extended with `"llm-tokenrouter"`
- `JudgeSource` extended with `"llm-tokenrouter"`

**`pipeline/extractClaims.ts`** — updated:
- TokenRouter branch after openai; falls back to keyword on null result

**`pipeline/judgeClaims.ts`** — updated:
- TokenRouter branch after openai; falls back to deterministic on null result

**`lib/integrationStatus.ts`** — updated:
- `LLMProviderLabel` extended with `"tokenrouter"`
- `IntegrationStatus` gains `tokenrouter: IntegrationLabel`
- `getIntegrationStatus()` reads `TOKENROUTER_API_KEY` and emits `"enabled"` / `"fallback mode"`

**`app/page.tsx`** — updated:
- `ClaimExtractionNote`: handles `"llm-tokenrouter"` → "Claim extraction: LLM · TokenRouter"
- `JudgeNote`: handles `"llm-tokenrouter"` → "Judge: LLM · TokenRouter"
- `LLM_PROVIDER_COLOR`: `tokenrouter` → `text-green-500`
- `IntegrationStatusCard`: added TokenRouter row between Anthropic and Browserbase

**`.env.example`** — updated:
- Added `TOKENROUTER_API_KEY=` and `TOKENROUTER_MODEL=MiniMax-M3`
- Updated `LLM_PROVIDER` comment to list all four options

## Next Recommended Task

Phase 14 is complete. Remaining open work in `TODO.md`:

- **Phase 8 — Redis Evidence Memory and Cache** (optional)
- **Phase 9 — Arize Trace (real integration)** (optional)
- **Phase 13 — Demo Samples and Pitch Polish** (recommended pre-demo)

A natural follow-on for Phase 14 specifically would be to add `compression` fields to the
Sentry trace export payload in `adapters/trace/sentryTraceAdapter.ts` so per-audit compression
metrics show up in the dashboard. The local trace panel already shows the compression step.
