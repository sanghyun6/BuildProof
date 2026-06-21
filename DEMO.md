# BuildProof — Demo Guide

## What BuildProof Does

BuildProof audits whether technical claims made in a hackathon pitch or project description are backed by implementation evidence in the project's GitHub repository.

**Pipeline:** Claim → Evidence → Verdict

**Judge-friendly summary:**

- Extracts technical claims from the project text (MCP, RAG, real-time, voice, multi-agent, computer vision)
- Scans the linked GitHub repository for dependency files, source code, and README content
- Runs six static evidence detectors against what was found in the repo
- Returns grounded evidence bullets referencing specific files and dependency names
- Uses only evidence-based language — no accusatory conclusions
- Falls back to text-only analysis if the repo scan is unavailable

---

## How to Run Locally

### Without a GitHub token (quickest start)

```bash
cd /Users/sanghyun/BuildProof
npm run dev
```

Open http://localhost:3000.

- Public GitHub repos will scan correctly up to ~60 API requests per hour (unauthenticated)
- Each audit uses approximately 24 requests
- If the rate limit is hit, the scan falls back to text-only evidence

### With a GitHub token (recommended for demos with repeated scans)

```bash
GITHUB_TOKEN=ghp_... npm run dev
```

- Raises the GitHub API limit to 5,000 requests/hour (~200 audits/hour)
- Generate a token at https://github.com/settings/tokens (no scopes needed for public repos)
- Token is used only server-side and never exposed to the browser

### With Anthropic only

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

- `LLM_PROVIDER` defaults to `auto`, which prefers Anthropic when `ANTHROPIC_API_KEY` is set
- The integration status card shows **Anthropic: enabled** and **LLM provider: anthropic**
- The report header shows "Claim extraction: LLM · Anthropic" and "Judge: LLM · Anthropic"
- If the Anthropic call fails for any reason, keyword extraction and deterministic judge run automatically

### With OpenAI only

```bash
OPENAI_API_KEY=sk-... npm run dev
```

- Set `LLM_PROVIDER=openai` to explicitly use OpenAI, or leave `auto` with no Anthropic key
- The integration status card shows **OpenAI: enabled** and **LLM provider: openai**
- The report header shows "Claim extraction: LLM · OpenAI" and "Judge: LLM · OpenAI"
- OpenAI 429/quota errors fall back to keyword extraction and deterministic judge automatically

### With auto provider (both keys)

```bash
ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... npm run dev
```

- `LLM_PROVIDER=auto` prefers Anthropic when both keys are present
- To force OpenAI when both are set: `LLM_PROVIDER=openai ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... npm run dev`

### Without any LLM key (deterministic fallback)

```bash
npm run dev
```

- No LLM key required. Keyword extraction and deterministic judge run instead.
- The integration status card shows **LLM provider: auto** and both OpenAI/Anthropic as **fallback mode**
- The report header shows "Claim extraction: keyword" and "Judge: deterministic"
- All verdicts are based on score thresholds from static detector evidence — fully reproducible

### With Browserbase keys (real Project URL ingestion)

```bash
BROWSERBASE_API_KEY=... BROWSERBASE_PROJECT_ID=... npm run dev
```

- Enables the Project URL tab to fetch and parse real Devpost (or similar) project pages
- The report will show "Project URL extraction · Browserbase" in an indigo-bordered card
- If Browserbase ingestion fails for any reason, the audit automatically falls back to demo data

### With Sentry configured (optional — server-side trace export)

```bash
SENTRY_DSN=https://... npm run dev
```

- Enables server-side export of audit trace metadata and unexpected pipeline errors to Sentry
- The "Run trace" panel in the UI will show **External trace export: Sentry** when export succeeds
- Safe metadata only is sent — no user project text, no source code, no API keys
- If `SENTRY_DSN` is not set or Sentry fails, the audit is unaffected and the local trace panel still works

### Notes

- **No LLM key is required.** Without any LLM key, the keyword extractor and deterministic judge run.
- **`LLM_PROVIDER`** controls which provider is used: `openai`, `anthropic`, or `auto` (default).
- **`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are independent.** Either, both, or neither may be set.
- **If any LLM call fails** (network error, quota exceeded, invalid response), the pipeline falls back to keyword extraction and deterministic judge without crashing.
- **`BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` are both optional.** Project URL mode uses Browserbase when both are set; otherwise the audit runs on sample fixture data and the report clearly says so.
- **`SENTRY_DSN` is optional.** Without it, all observability is local — the in-UI run trace panel always works.
- **No Supabase or external database.** The pipeline runs in-memory per request.

---

## Observability — Local Trace vs External Export

Every audit run produces a **local trace** showing each pipeline step (input, ingestion, claim extraction, GitHub scan, detectors, judge, safety, report). It appears as a collapsible "Run trace" section at the bottom of every audit report. It is always available — no configuration needed.

**External trace export** (Sentry) is optional:

| State | What the trace note shows |
|-------|--------------------------|
| `SENTRY_DSN` not set | External trace export: disabled |
| `SENTRY_DSN` set, export succeeded | External trace export: Sentry |
| `SENTRY_DSN` set, export failed | External trace export: export failed |

If Sentry export fails for any reason, the audit result and local trace are unaffected.

**What is sent to Sentry (safe metadata only):**
- Audit mode (manual or project-url)
- Total pipeline duration
- Number of claims detected
- Scan source, claim extraction source, judge source
- Per-step status map (success / skipped / fallback / error)

**What is never sent to Sentry:**
- Project text or description
- Source code snippets
- GitHub token, OpenAI key, Browserbase key, or any secret

---

## Project URL Mode — What to Expect

### With Browserbase configured

1. Enter any Devpost project URL (or similar public project page) in the **Project URL** tab
2. Click **Run Audit**
3. BuildProof will open the page via Browserbase, extract the title, description, and built-with tags, then run the audit pipeline on that content
4. The report shows an indigo "Project URL extraction · Browserbase" card with the ingested title and built-with technologies
5. If a GitHub URL was found on the page, the repo is scanned automatically

### Without Browserbase configured (demo mode)

1. The Project URL tab still accepts a URL but does not fetch it
2. The audit runs on a built-in sample project description instead
3. The report shows an amber "Project URL extraction · demo data · Browserbase not configured" card
4. This is clearly not data from the submitted URL — use Manual mode for real results

### If Browserbase extraction fails

The audit falls back to sample fixture data automatically. The report shows:

> "Browserbase ingestion encountered an error — showing demo fixture data as fallback."

**Manual fallback script:**

> "If Project URL extraction is unavailable, I can paste the project description and GitHub URL manually. The audit pipeline is the same after ingestion — claim extraction, repo scan, six detectors, verdicts."

Switch to the **Manual** tab, paste the project text, add the GitHub URL, and run the audit.

---

## Demo Script

### Opening line

> "BuildProof checks whether AI projects actually implement what they claim. You paste the project description, add the GitHub URL, and it tells you what's verified in the repo — and what isn't."

### Recommended flow

1. Open http://localhost:3000
2. Click a sample preset button to fill the description (e.g. "RAG + MCP")
3. Add a real public GitHub URL — ideally one that does or does not implement the claimed tech
4. Click **Run Audit**
5. Walk through a verdict card: point out the claim, the evidence bullets, and the verdict badge
6. Show a "No implementation evidence found" case to contrast

### If GitHub scan is unavailable

> "Even without a repo scan, BuildProof still extracts claims from the text and shows you what categories are being claimed. The evidence is lighter — text-only — but the claim detection still works."

### How to explain Claim → Evidence → Verdict

> "BuildProof finds phrases like 'we used MCP' or 'vector database' and treats those as claims. It then looks in the repo — package.json, requirements.txt, source files — for concrete proof. The verdict badge is the conclusion: Strongly Supported means both the claim and the code line up."

---

## Sample Project Texts and Expected Behavior

### Sample 1 — MCP + RAG

```
DocBot uses the Model Context Protocol to expose a documentation retrieval tool.
Queries are answered using a RAG pipeline backed by a vector database, with embeddings
generated from the project's technical documentation.
```

**Expected claims:** MCP, RAG / vector DB

| Condition | Expected behavior |
|-----------|-------------------|
| Repo has `@modelcontextprotocol/sdk` and `chromadb` | Strongly supported for both |
| Repo has README mentions only | README-only claim |
| No repo / scan unavailable | No implementation evidence found |

---

### Sample 2 — Voice + Real-time

```
VoiceFlow is a real-time voice assistant. Users speak into the microphone and get
live streaming transcriptions via speech-to-text. Responses are streamed back using
Server-Sent Events. Audio is processed using Deepgram for low-latency transcription.
```

**Expected claims:** Voice / audio, Real-time / streaming

| Condition | Expected behavior |
|-----------|-------------------|
| Repo has `@deepgram/sdk` and WebSocket/SSE code | Strongly supported for both |
| Repo has `ws` but no audio dep | Voice: README-only claim; Real-time: Partially supported |
| No repo | No implementation evidence found |

---

### Sample 3 — Computer Vision + Multi-agent

```
MediScan uses a multi-agent architecture with a planner agent, executor agents, and a
reviewer agent. The computer vision module performs real-time object detection and pose
estimation from camera frames using a fine-tuned YOLO model.
```

**Expected claims:** Computer vision / video AI, Multi-agent

| Condition | Expected behavior |
|-----------|-------------------|
| Repo has `ultralytics` and `crewai` | Strongly supported for both |
| Repo has agent file paths but no framework dep | Partially supported |
| No repo | No implementation evidence found |

---

### Sample 4 — No tracked claims

```
UniTrack is a simple task management app. Users create projects, assign tasks to
team members, and track progress on a shared dashboard. Built with React and a REST API.
```

**Expected claims:** None

**Expected behavior:** "No tracked technical claims detected" empty state card.

---

## What Each Detector Checks

| Detector | Dependencies checked | File/path signals | Source/README signals |
|----------|---------------------|-------------------|----------------------|
| MCP | `@modelcontextprotocol/sdk` | paths with `mcp` | "Model Context Protocol", MCP server code |
| RAG / vector DB | pinecone, chromadb, weaviate, qdrant, langchain, faiss, sentence-transformers | paths with `rag`, `vector`, `embed` | "embeddings", "vector search", "retriever" |
| Real-time / streaming | socket.io, ws, eventsource, websockets, aiohttp | paths with `websocket`, `stream`, `sse` | "WebSocket", "text/event-stream", "ReadableStream" |
| Voice / audio | @deepgram/sdk, assemblyai, elevenlabs, deepgram-sdk | paths with `audio`, `voice`, `speech`, `whisper` | "transcription", "speech-to-text", MediaRecorder |
| Multi-agent | crewai, langgraph, autogen, @langchain/langgraph | paths with `agent`, `crew`, `orchestrat` | "multi-agent", StateGraph, AgentExecutor |
| Computer vision | opencv-python, mediapipe, torch, ultralytics, @tensorflow/tfjs | paths with `vision`, `detect`, `frame`, `yolo` | "object detection", cv2, YOLO, VideoCapture |

---

## Verdict Labels

| Label | Meaning | Approximate score |
|-------|---------|-------------------|
| Strongly supported | Dependency and source code both found | ≥ 76 |
| Partially supported | Source code or dependency found, not both | 51–75 |
| README-only claim | Description mentions it; no code evidence | 26–50 |
| Unsupported by repository evidence | Weak signals only | 1–25 |
| No implementation evidence found | Nothing found in repo or text | 0 |

---

## Demo Checklist

Use this checklist to verify each integration mode before a live demo.

### Run without any keys (recommended baseline)

```bash
cd /Users/sanghyun/BuildProof
npm run dev
```

- [ ] Integration status card shows all four integrations as "fallback mode" or "not configured"
- [ ] Manual audit mode works end-to-end with a sample preset
- [ ] Project URL tab shows mock fixture data with amber "Browserbase not configured" card
- [ ] Run trace panel appears at bottom of report
- [ ] External trace export shows "disabled"

### Run with GITHUB_TOKEN

```bash
GITHUB_TOKEN=ghp_... npm run dev
```

- [ ] Integration status card shows GitHub token as "enabled"
- [ ] Manual audit with a real public GitHub URL returns "GitHub scan succeeded" in green
- [ ] File tree, package.json, README evidence bullets appear in claim cards

### Run with ANTHROPIC_API_KEY

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

- [ ] Integration status card shows Anthropic as "enabled" and LLM provider as "anthropic"
- [ ] Report header shows "Claim extraction: LLM · Anthropic" and "Judge: LLM · Anthropic"
- [ ] Claim cards show an "Assessment" rationale section from the Anthropic judge

### Run with OPENAI_API_KEY

```bash
OPENAI_API_KEY=sk-... npm run dev
```

- [ ] Integration status card shows OpenAI as "enabled" and LLM provider as "openai"
- [ ] Report header shows "Claim extraction: LLM · OpenAI" and "Judge: LLM · OpenAI"
- [ ] Claim cards show an "Assessment" rationale section from the OpenAI judge

### Run with Browserbase keys

```bash
BROWSERBASE_API_KEY=... BROWSERBASE_PROJECT_ID=... npm run dev
```

- [ ] Integration status card shows Browserbase as "enabled"
- [ ] Project URL tab fetches and parses a real Devpost page
- [ ] Report shows indigo "Project URL extraction · Browserbase" card
- [ ] Built-with tags and title extracted from the page appear in the card

### Run with SENTRY_DSN

```bash
SENTRY_DSN=https://...@sentry.io/... npm run dev
```

- [ ] Integration status card shows Sentry as "enabled"
- [ ] Run trace panel shows "External trace export: Sentry" after audit

### Recommended main demo path

The core demo does not require Band. It highlights: GitHub repo evidence → TokenRouter/MiniMax-M3 judge (or Anthropic) → weighted authenticity scoring → optional judge comparison.

```bash
TOKENROUTER_API_KEY=... GITHUB_TOKEN=ghp_... npm run dev
# Optional: add JUDGE_COMPARISON=on ANTHROPIC_API_KEY=sk-ant-... to show side-by-side comparison
```

1. Open http://localhost:3000
2. Click "RAG + MCP" (or "Vision + Multi-agent") preset to fill the description
3. Add a real public GitHub URL — ideally one that does or does not implement the claimed tech
4. Click **Run Audit**
5. Walk through verdict cards: point out the claim, evidence bullets (source file / package.json / README), and verdict badge
6. Show a "No implementation evidence found" case to contrast
7. Scroll to **Evidence Compression** card — show raw vs compressed token counts
8. If `JUDGE_COMPARISON=on`: scroll to **Judge Comparison** panel — show Anthropic vs TokenRouter agreement rate
9. Integration Status card shows "Band Audit Court: off" — no Band steps needed

### Recommended safe demo path (no keys required)

1. `npm run dev` — no keys
2. Open http://localhost:3000
3. Click "RAG + MCP" preset to fill the description
4. Leave the GitHub URL blank (text-only evidence)
5. Click **Run Audit**
6. Walk through the verdict cards and run trace panel
7. Switch to Project URL tab — show mock fallback behavior

### Manual audit fallback script

> "If Browserbase or GitHub scanning is unavailable, I can demonstrate the core audit pipeline in manual mode. Paste any project description into the Manual tab — claim extraction, six detectors, and verdicts all run without external services. The repo scan just shows text-only evidence instead of file-level evidence."

---

## Band Audit Court (Experimental — Off by Default)

> **Band Audit Court is hidden from the main demo by default.**
> Set `SHOW_BAND_COURT=on` in `.env.local` to enable the panel.
> The main demo focuses on: GitHub repo evidence → TokenRouter/MiniMax-M3 or Anthropic judge → weighted authenticity scoring → judge comparison.
> Band integration is experimental and not required for the core demo.

### How to enable

```bash
# .env.local
SHOW_BAND_COURT=on
```

Then restart `npm run dev`. The Band Audit Court panel appears at the bottom of each audit report.

BuildProof generates a court packet from the audit. You paste it into a Band room containing the four sidecar agents. The multi-agent deliberation happens in Band — BuildProof does not call Band, receive Band messages, or display agent replies.

### What the panel shows (when SHOW_BAND_COURT=on)

- **Status:** Ready for Band Audit Court (auto-generated from the audit result)
- **Four agents** with their roles:

| Agent | Handle | Role |
|-------|--------|------|
| Lead Judge | `@BuildProofLeadJudge` | Coordinates review; posts final consensus |
| Claim Prosecutor | `@BuildProofClaimProsecutor` | Challenges weak or README-only claims |
| Evidence Defender | `@BuildProofEvidenceDefender` | Defends claims with listed evidence |
| Repo Forensics | `@BuildProofRepoForensics` | Technical analysis of repo signals |

- **Four copy buttons:**
  - **Copy starter message** — the `@BuildProofLeadJudge` preamble (without the packet)
  - **Copy full court packet** — just the sanitized audit packet
  - **Copy combined Band room message** — preamble + packet, ready to paste directly into Band
  - **Copy Band agent self-test message** — a one-line presence check that @mentions all four agents and asks each to reply `READY — <handle>`; use this before sending the combined message to confirm every agent is active in the room.
- **Preview** court packet (collapsed by default)
- **3-step demo instructions**

### Band room self-test (presence check)

Before sending the full court packet, click **Copy Band agent self-test message** in the panel and paste the result into the Band room. It looks like:

```
@BuildProofLeadJudge @BuildProofClaimProsecutor @BuildProofEvidenceDefender @BuildProofRepoForensics Please each reply READY with your role name.
```

Each agent should reply `READY — BuildProofLeadJudge`, `READY — BuildProofClaimProsecutor`, etc. If any one of the four does not reply within ~30 seconds, that sidecar is not running or has not been added to the room. Fix that first (see `band_agents/README.md`), then send the combined court message.

### Combined Band room message format

The **Copy combined Band room message** button copies a single complete message — the preamble and the full court packet joined. No placeholder text. No manual editing required. The preamble explicitly forces the Lead Judge to @mention all three specialists in its first response, instructs specialists to reply even when evidence is partial, and forbids placeholder text.

```
@BuildProofLeadJudge — please convene the BuildProof Audit Court for the packet below.

Required deliberation flow (do NOT skip steps):

1. @BuildProofLeadJudge — your FIRST response must @mention all three
   specialists below by name and give each a concrete task. Do not issue a
   verdict in that first response. Do not stop to ask the user for more
   data — the packet below already contains project name, overall score,
   claims, and evidence.

2. Specialists, you must each reply in this room even if the evidence is
   partial or missing.

   @BuildProofClaimProsecutor please identify unsupported or exaggerated claims.
   @BuildProofEvidenceDefender please defend claims using the listed evidence.
   @BuildProofRepoForensics please classify evidence quality and missing
   implementation signals.

3. @BuildProofLeadJudge — after the three specialists have replied, post the
   Final Consensus Verdict using the structure in your system prompt.

(If your Band workspace named the four agents differently, adjust the
@-handles before sending.)

=== BUILDPROOF AUDIT COURT PACKET ===

Project: <project name>
Audited: <ISO timestamp>
Overall Evidence Score: <N>/100

--- Ingestion & Scan Status ---
...

--- Claims & Evidence ---

CLAIM: <claim text>
Detector: <detector label>
Verdict: <verdict label>
Score: <N>/100
Supporting evidence:
  [source_file] <evidence text>
  [package_json] <evidence text>
Missing evidence:
  [package_json] <absence text>

...

--- Agent Instructions ---
...

=== END OF BUILDPROOF AUDIT COURT PACKET ===
```

All four agents are @mentioned in the preamble so Band notifies each one, and the preamble also @mentions each specialist by name a second time inside the deliberation flow so the Lead Judge has an explicit, hard-coded delegation script to follow. You do not need to @mention any specialist yourself.

### Demo path (requires SHOW_BAND_COURT=on)

1. Set `SHOW_BAND_COURT=on` in `.env.local` and restart `npm run dev`.
2. **Enter a Devpost URL** (or use Manual mode with a paste + GitHub URL).
3. **Click Run Audit** — BuildProof scans the repo and generates the report.
4. **Band Audit Court panel** appears at the bottom of the report.
5. **Set up agent config** (first time only):
   ```bash
   cd band_agents
   cp agent_config.example.yaml agent_config.yaml
   # fill in agent_id, api_key, handle for each of the 4 agents
   pip install -r requirements.txt
   ```
6. **Start all 4 agents** in separate terminals:
   ```bash
   cd band_agents && ANTHROPIC_API_KEY=sk-ant-... python lead_judge.py
   cd band_agents && ANTHROPIC_API_KEY=sk-ant-... python claim_prosecutor.py
   cd band_agents && ANTHROPIC_API_KEY=sk-ant-... python evidence_defender.py
   cd band_agents && ANTHROPIC_API_KEY=sk-ant-... python repo_forensics.py
   ```
7. **Open a Band room** and add all 4 agents as members.
8. **Click "Copy combined Band room message"** in the panel.
9. **Paste into Band and send** — `@BuildProofLeadJudge` opens deliberation and delegates to the specialists.
10. **Show Lead Judge delegating** to `BuildProofClaimProsecutor`, `BuildProofEvidenceDefender`, `BuildProofRepoForensics`.
11. **Show final consensus** — Lead Judge synthesizes and posts a verdict per claim.

### What the Band Court Packet contains

- Project name, audit timestamp, overall evidence score
- Ingestion source and GitHub scan status
- Claim extraction source and judge source
- Each claim: detector, verdict, score, supporting evidence, missing evidence
- Agent instructions (roles, rules, allowed verdict labels)

### What the packet does NOT contain

- API keys or environment variables
- Full source code snippets
- Personal data

### Fallback

The main BuildProof app works without Band. If no agents are running, the audit report and packet are still generated — you just paste the packet manually when ready.

---

## The Token Company / Evidence Compression Demo

BuildProof compresses the **LLM judge context** before sending it to the model. The compressed
payload preserves verdict-critical information: claim text, source-file snippets, file paths,
positive/negative polarity, dependency evidence, and missing-signal markers. Repeated README
mentions and absence-evidence lists are condensed.

### Where compression happens in the pipeline

```
ingestProject → extractClaims → scanRepo → runDetectors → matchEvidence → scoreAuthenticity
              → compressEvidenceContext  ← (this layer)
              → judgeClaims (LLM judge sees compressed context)
              → applySafety → generateReport
```

The compression layer sits **immediately before** the LLM judge call. It does **not** change
the user-facing report — every claim card still shows the full, uncompressed evidence list.

### How to enable

```bash
# Use the local claim-aware compressor (no API key)
COMPRESSION_PROVIDER=local npm run dev

# Try The Token Company API (with safe local fallback if missing/fails)
COMPRESSION_PROVIDER=auto TOKEN_COMPANY_API_KEY=... npm run dev

# Disable entirely
COMPRESSION_PROVIDER=off npm run dev
```

`auto` (the default) uses The Token Company when `TOKEN_COMPANY_API_KEY` is set,
otherwise falls through to the local compressor.

### What the UI shows

After every audit, an **Evidence Compression** card appears with:

- **Status** — Active · Local | Active · Remote | Fallback | Disabled
- **Source** — local claim-aware | The Token Company | local fallback | disabled
- **Raw estimated tokens** vs **Compressed estimated tokens**
- **% reduction** and **compression ratio**
- **Preserved signals** — claim count, positive/negative evidence counts, source-file count,
  dependency count, README count, missing-signal count, unique file path count
- **Fallback used: yes/no**

### How it preserves source implementation evidence

The local claim-aware compressor:

- Keeps every claim ID, claim text, detector category, and (if present) verdict label
- Keeps every source-file evidence item, with snippets trimmed to the lines most relevant to the
  claim's keywords
- Keeps every package.json / dependency evidence item (trimmed if very long)
- Keeps every file-tree path evidence item
- Condenses repeated README mentions into "README mentions (N): …"
- Condenses missing-implementation absence items into "Missing signals (N): …"
- Deduplicates evidence with the same source, polarity, and text
- Source-file evidence is sorted ahead of README evidence so the judge sees implementation
  evidence first
- Never removes all evidence for a claim — if everything was filtered, a single explicit
  missing-evidence marker is inserted
- Never introduces unsafe words (fake / lying / scam / fraud / deceptive are stripped)

### The Token Company adapter

The adapter (`adapters/compression/theTokenCompanyCompressor.ts`) is env-gated behind
`TOKEN_COMPANY_API_KEY` and (optionally) `TOKEN_COMPANY_API_URL`. It sends an already-locally-
compressed payload as the base so the remote call can never increase context size. If the
remote response is larger than the local baseline, BuildProof keeps the local baseline.

If the adapter call fails for any reason — missing key, network error, malformed response —
the pipeline transparently falls back to the local claim-aware compressor and the UI shows
**Fallback** status. The audit itself never fails because of compression.

### Tradeoff to explain to judges

> "Reducing input tokens to the LLM judge means lower latency and lower per-audit cost. The
> claim-aware compressor preserves the signals the judge actually uses — claim text, source
> evidence, polarity, file paths, and missing-signal markers. The visible audit report below
> is unchanged: users still see the full evidence list per claim. Compression only shrinks
> what we send to the model, not what we show to the user."

### Metrics to show during the demo

1. Open the report after any audit
2. Expand the **Evidence Compression** card
3. Point at the **Raw tokens → Compressed → % Reduction** trio
4. Walk through the **Preserved signals** chips and explain that claim text + positive +
   negative + source-file evidence are all preserved verbatim
5. Show that compression is independent of LLM provider — Anthropic, OpenAI, or deterministic
   fallback all benefit

---

## The Token Company / Compression Benchmark

A local-only benchmark proves the evidence compression layer reduces LLM judge input size
while preserving the signals needed for verdict assignment.

### How to run

```bash
npx tsx scripts/compressionBenchmark.ts
```

- **No network calls.** No LLM, no Anthropic, no OpenAI, no The Token Company API.
- **No API keys read or written.** Safe to run any time.
- Uses three synthetic but realistic audit payloads:
  - **A.** Small hackathon project (3 claims, ~5 evidence items each)
  - **B.** Medium AI project (6 claims, ~6 evidence items each)
  - **C.** Evidence-heavy worst case (6 claims, heavy README repetition, long source snippets)
- Exits non-zero if any warning was produced — usable as a soft regression check.

### What it measures

For each payload:

- raw vs compressed estimated tokens, chars, percent reduction
- positive evidence count: raw vs preserved
- negative/missing evidence count: raw vs preserved
- unique source file paths preserved
- per-claim deterministic **signal label** computed from both raw and compressed evidence:
  - `strong` — at least one positive source-file AND positive dependency/path evidence
  - `partial` — at least one positive source-file OR dep/path OR README evidence
  - `unsupported` — only missing/negative evidence
  - `none` — no evidence at all
- **signal agreement %** between raw and compressed labels (this is the local heuristic
  proxy for verdict-quality preservation — no LLM is called)
- Warnings if any claim:
  - lost all positive evidence (when the original had some)
  - lost all negative/missing evidence (when the original had some)
  - has zero evidence items after compression

### Numbers to show judges

From the current run:

| Payload | Raw tokens | Compressed | Reduction | Signal agreement |
|---|---|---|---|---|
| A. Small | 433 | 340 | 21% | 100% (3/3) |
| B. Medium | 1,074 | 806 | 25% | 100% (6/6) |
| C. Heavy | 2,074 | 1,217 | 41% | 100% (6/6) |
| **Aggregate** | **3,581** | **2,363** | **34% overall · 29% avg / payload** | **100% (15/15)** |

- **Zero warnings**: every claim retained ≥1 positive evidence item (where it originally
  had some), ≥1 negative item (where it originally had some), and ≥1 total evidence item.
- The bigger the payload, the bigger the win: evidence-heavy worst case sees 41% reduction.

### How to explain the tradeoff

> "We compress what we send to the LLM judge, not what we show to users. The benchmark uses
> a deterministic signal heuristic — strong / partial / unsupported — computed independently
> from both the raw and the compressed payload. On three synthetic audits totaling 15 claims,
> the compressed payload produces the *same* signal label as the raw payload 100% of the
> time, while sending 34% fewer tokens to the model. Token reduction with preserved verdict
> signal quality."

> "If you ever want to re-verify, run `npx tsx scripts/compressionBenchmark.ts`. It runs
> offline and exits non-zero if any claim lost critical evidence — so it doubles as a
> regression check whenever someone touches the compression module."

---

## What BuildProof Is Not

- Not a plagiarism checker
- Not an AI judge that renders legal or ethical opinions
- Not a guarantee of project quality
- All verdicts are based solely on evidence found in the repository at the time of audit
