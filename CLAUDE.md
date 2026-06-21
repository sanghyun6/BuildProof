# BuildProof — Claude Code Guide

## Product Summary

BuildProof is an AI project credibility auditor. It checks whether technical claims made in a Devpost page, README, or pitch are actually supported by implementation evidence in the project's GitHub repository.

**Core concept:** Claim → Evidence → Verdict

**Example:**
- Claim: "Uses MCP"
- Evidence: README mentions MCP / package.json has no @modelcontextprotocol/sdk / no MCP server or client code found
- Verdict: Unsupported by repository evidence

## Build Levels

| Level | Input method | Status |
|-------|-------------|--------|
| 2 | Manual text + GitHub URL input | Build first |
| 3 | Single Devpost/project URL (Browserbase) | Add later |

Always make Level 2 work before wiring Level 3.

## Core Pipeline

```
ingestProject
  → extractClaims
  → scanRepo
  → runDetectors
  → matchEvidence
  → scoreAuthenticity
  → judgeClaims
  → applySafety
  → generateReport
```

Each stage must be independently callable and testable. Each external integration must be behind an adapter.

## MVP Detectors

1. **Multi-agent detector** — looks for agent orchestration patterns, multi-agent frameworks
2. **MCP detector** — checks for @modelcontextprotocol/sdk, MCP server/client code
3. **RAG / vector DB detector** — looks for vector store imports, embedding calls, retrieval patterns
4. **Real-time / streaming detector** — checks for streaming APIs, WebSocket usage, SSE
5. **Voice / audio detector** — looks for audio processing libraries, speech APIs
6. **Computer vision / video AI detector** — checks for CV libraries, vision model calls

## Safety Wording Rules

**Never use:**
- fake
- lying
- scam
- fraud
- deceptive

**Use evidence-based language instead:**
- "No implementation evidence found"
- "Unsupported by repository evidence"
- "Partially supported"
- "Strongly supported"
- "README-only claim"

All verdict text must pass through `applySafety` before surfacing to the user.

## Architecture Rules

1. **Adapter-first:** Every external service (GitHub API, LLM API, Browserbase, Redis, Arize, Sentry, Band) must be behind an adapter interface. The app must work with mock/local adapters before any real integration is wired.
2. **Mock before real:** Each adapter must have a working mock. Real adapters are opt-in via environment variables.
3. **Level 2 before Level 3:** Manual input fallback must always work, even after Browserbase is added.
4. **TypeScript strict mode throughout.** No `any`. Co-locate tests with source files.
5. **One feature per session.** Read HANDOFF.md at session start. Implement only what is listed as next. Update TODO.md and HANDOFF.md before stopping.

## External Technology Candidates

| Service | Role | Adapter interface |
|---------|------|-------------------|
| GitHub API / Octokit | Repo scanning | `RepoAdapter` |
| LLM API | Claim extraction, evidence judging | `LLMAdapter` |
| Browserbase | Devpost page ingestion | `BrowserAdapter` |
| Redis | Evidence memory, audit caching | `CacheAdapter` |
| Arize | LLM judge tracing | `TraceAdapter` |
| Sentry | Error monitoring | `MonitorAdapter` |
| Band | Agent-to-agent collaboration | `CollabAdapter` |
| Armor IQ / custom | Safety guardrail | `SafetyAdapter` |

## Development Rules for Claude Code

- Read HANDOFF.md at the start of every session before writing any code.
- Implement only the next task listed in TODO.md. Do not skip ahead.
- Update TODO.md (mark completed item) and HANDOFF.md (status, changed files, next task) before stopping.
- Never overwrite unrelated existing work.
- No LLM API key assumed — all LLM paths use mock adapters until a real key is confirmed.
- No comments explaining what code does — only comments for non-obvious WHY.
- No trailing summaries in responses — the diff speaks for itself.
