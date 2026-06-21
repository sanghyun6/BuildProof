/**
 * Local-only benchmark for BuildProof's evidence compression layer.
 *
 * Runs multiple synthetic but realistic audit payloads through the local claim-aware
 * compressor and reports:
 *
 *   - raw vs compressed estimated tokens (and chars)
 *   - percent reduction per payload + aggregate average
 *   - claim count, positive/negative evidence count, unique file paths preserved
 *   - warnings if any claim lost all positive or all negative evidence (when the
 *     original had any)
 *   - deterministic "verdict signal" labels computed from raw and compressed payloads,
 *     and the agreement rate between them
 *
 * The signal heuristic is local and rule-based — NO LLM, NO network, NO API keys:
 *
 *   strong       — at least one positive source-file evidence AND at least one positive
 *                  dependency/file-path evidence
 *   partial      — at least one positive source-file OR positive dependency/path OR
 *                  positive README evidence (but not enough for strong)
 *   unsupported  — no positive evidence at all; only missing/negative evidence
 *   none         — no evidence of any kind
 *
 * Run:
 *   npx tsx scripts/compressionBenchmark.ts
 */
import type { LLMJudgeInput, LLMJudgeInputClaim } from "../adapters/llm/types";
import { compressEvidenceContextLocal } from "../pipeline/compressEvidenceContext";

type SignalLabel = "strong" | "partial" | "unsupported" | "none";

type EvidenceCategory = "src" | "dep" | "path" | "readme" | "miss" | "other";

function categorize(source: string): EvidenceCategory {
  const s = source.toLowerCase();
  if (s === "source_file" || s === "src") return "src";
  if (s === "package_json" || s === "dep") return "dep";
  if (s === "file_tree" || s === "path") return "path";
  if (s === "readme") return "readme";
  if (s === "absence" || s === "miss") return "miss";
  return "other";
}

function signalLabel(claim: LLMJudgeInputClaim): SignalLabel {
  let posSrc = 0;
  let posDepPath = 0;
  let posReadme = 0;
  let negative = 0;

  for (const e of claim.evidence) {
    const cat = categorize(e.source);
    if (e.positive) {
      if (cat === "src") posSrc++;
      else if (cat === "dep" || cat === "path") posDepPath++;
      else if (cat === "readme") posReadme++;
    } else {
      negative++;
    }
  }

  if (posSrc > 0 && posDepPath > 0) return "strong";
  if (posSrc > 0 || posDepPath > 0 || posReadme > 0) return "partial";
  if (negative > 0) return "unsupported";
  return "none";
}

interface Payload {
  name: string;
  description: string;
  input: LLMJudgeInput;
}

// --- Payload A: small project, 3 claims, mixed verdicts ------------------------------
const payloadA: Payload = {
  name: "A. Small hackathon project",
  description: "3 claims, ~5 evidence items each (typical lean repo)",
  input: {
    scanSource: "github-api",
    repoUnavailable: false,
    claims: [
      {
        id: "mcp",
        detector: "MCP",
        claim: "Uses MCP for tool integration",
        score: 80,
        evidence: [
          { source: "readme", positive: true, text: "README mentions MCP server exposing tools to the host." },
          { source: "package_json", positive: true, text: "package.json includes @modelcontextprotocol/sdk dependency." },
          { source: "source_file", positive: true, text: "src/mcp/server.ts:\nimport { Server } from '@modelcontextprotocol/sdk/server'\nconst s = new Server({ name: 'tools' })\ns.setRequestHandler(ListToolsRequestSchema, handler)" },
          { source: "file_tree", positive: true, text: "Repository contains src/mcp/server.ts and src/mcp/handlers.ts." },
        ],
      },
      {
        id: "rag",
        detector: "RAG / vector DB",
        claim: "Uses RAG with vector database",
        score: 35,
        evidence: [
          { source: "readme", positive: true, text: "README mentions retrieval-augmented generation pipeline." },
          { source: "readme", positive: true, text: "README again mentions semantic search via embeddings." },
          { source: "package_json", positive: false, text: "package.json has no vector database dependency (pinecone, weaviate, chroma, qdrant)." },
          { source: "absence", positive: false, text: "No embedding or retrieval code found in source." },
        ],
      },
      {
        id: "voice",
        detector: "Voice / audio",
        claim: "Supports voice input via microphone",
        score: 4,
        evidence: [
          { source: "package_json", positive: false, text: "package.json has no @deepgram/sdk or assemblyai dependency." },
          { source: "file_tree", positive: false, text: "No file matching /audio|voice|speech/ found." },
          { source: "absence", positive: false, text: "No MediaRecorder usage found in source." },
          { source: "absence", positive: false, text: "No Whisper API calls found in source." },
        ],
      },
    ],
  },
};

// --- Payload B: medium project, 6 claims, comprehensive audit ------------------------
const payloadB: Payload = {
  name: "B. Medium AI project",
  description: "6 claims, ~6 evidence items each (typical comprehensive audit)",
  input: {
    scanSource: "github-api",
    repoUnavailable: false,
    claims: [
      {
        id: "mcp",
        detector: "MCP",
        claim: "Uses MCP to expose tools",
        score: 30,
        evidence: [
          { source: "readme", positive: true, text: "README mentions MCP server exposing tools." },
          { source: "readme", positive: true, text: "README explains tool calls through Model Context Protocol." },
          { source: "package_json", positive: false, text: "package.json has no @modelcontextprotocol/sdk dependency." },
          { source: "file_tree", positive: false, text: "No /mcp/ directory found." },
          { source: "absence", positive: false, text: "No MCP server initialization found in source." },
          { source: "absence", positive: false, text: "No MCP tool registration found in source." },
        ],
      },
      {
        id: "rag",
        detector: "RAG / vector DB",
        claim: "Uses RAG with vector database",
        score: 78,
        evidence: [
          { source: "readme", positive: true, text: "README describes RAG pipeline backed by Pinecone vector DB." },
          { source: "package_json", positive: true, text: "package.json includes langchain and @pinecone-database/pinecone." },
          { source: "source_file", positive: true, text: "src/rag/retriever.ts:\nimport { PineconeStore } from 'langchain/vectorstores/pinecone'\nimport { OpenAIEmbeddings } from 'langchain/embeddings/openai'\nexport async function retrieve(q) {\n  const store = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings(), {})\n  return store.similaritySearch(q, 5)\n}" },
          { source: "file_tree", positive: true, text: "Repository contains src/rag/retriever.ts, src/rag/embeddings.ts, src/rag/store.ts." },
          { source: "absence", positive: false, text: "No reranker found in source." },
        ],
      },
      {
        id: "realtime",
        detector: "Real-time / streaming",
        claim: "Streams responses over SSE",
        score: 85,
        evidence: [
          { source: "readme", positive: true, text: "README describes SSE streaming for token-by-token output." },
          { source: "package_json", positive: true, text: "package.json includes openai dependency (supports streaming)." },
          { source: "source_file", positive: true, text: "app/api/chat/route.ts:\nconst stream = await openai.chat.completions.create({ stream: true })\nreturn new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })" },
          { source: "file_tree", positive: true, text: "Repository contains app/api/chat/route.ts and components/ChatStream.tsx." },
        ],
      },
      {
        id: "voice",
        detector: "Voice / audio",
        claim: "Supports voice via microphone",
        score: 12,
        evidence: [
          { source: "readme", positive: true, text: "README mentions voice input via microphone." },
          { source: "package_json", positive: false, text: "package.json has no @deepgram/sdk or assemblyai dependency." },
          { source: "package_json", positive: false, text: "package.json has no elevenlabs dependency." },
          { source: "file_tree", positive: false, text: "No /audio|voice|speech/ directory found." },
          { source: "absence", positive: false, text: "No MediaRecorder usage found in source." },
          { source: "absence", positive: false, text: "No Whisper API calls found in source." },
        ],
      },
      {
        id: "multi-agent",
        detector: "Multi-agent",
        claim: "Uses multi-agent architecture",
        score: 60,
        evidence: [
          { source: "readme", positive: true, text: "README describes planner and executor agents." },
          { source: "package_json", positive: false, text: "package.json has no langgraph, crewai, or autogen dependency." },
          { source: "file_tree", positive: true, text: "Repository contains agents/planner.ts, agents/executor.ts, agents/reviewer.ts." },
          { source: "source_file", positive: true, text: "agents/planner.ts:\nexport class Planner extends Agent {\n  async plan(task: string) {\n    return (await this.llm.generate(task)).split('\\n')\n  }\n}" },
          { source: "absence", positive: false, text: "No orchestration framework dependency found." },
        ],
      },
      {
        id: "cv",
        detector: "Computer vision / video AI",
        claim: "Performs object detection",
        score: 6,
        evidence: [
          { source: "readme", positive: true, text: "README mentions YOLO-based object detection." },
          { source: "package_json", positive: false, text: "package.json has no opencv-python, ultralytics, mediapipe, or torch dependency." },
          { source: "file_tree", positive: false, text: "No /vision|detect|frame|yolo/ directory found." },
          { source: "absence", positive: false, text: "No image processing code found in source." },
          { source: "absence", positive: false, text: "No model inference code found in source." },
        ],
      },
    ],
  },
};

// --- Payload C: evidence-heavy worst case ---------------------------------------------
const payloadC: Payload = {
  name: "C. Evidence-heavy worst case",
  description: "6 claims with repeated README mentions, long source snippets, many missing items",
  input: {
    scanSource: "github-api",
    repoUnavailable: false,
    claims: [
      {
        id: "mcp",
        detector: "MCP",
        claim: "Uses MCP (Model Context Protocol) to expose tools and resources",
        score: 35,
        evidence: [
          { source: "readme", positive: true, text: "README mentions the project uses Model Context Protocol (MCP) to expose tools and resources to the host." },
          { source: "readme", positive: true, text: "README explains that the MCP server is the integration boundary for tool calls." },
          { source: "readme", positive: true, text: "README again mentions MCP tool integration via Model Context Protocol — see Architecture section." },
          { source: "readme", positive: true, text: "README again mentions MCP tool integration via Model Context Protocol — see Architecture section." },
          { source: "package_json", positive: false, text: "package.json has no @modelcontextprotocol/sdk dependency in dependencies or devDependencies." },
          { source: "file_tree", positive: false, text: "No directory or file matching /mcp/ found in the repository file tree." },
          { source: "absence", positive: false, text: "No MCP server initialization code found in source files." },
          { source: "absence", positive: false, text: "No MCP tool registration patterns found in source files." },
          { source: "absence", positive: false, text: "No MCP client setup found in source files." },
        ],
      },
      {
        id: "rag",
        detector: "RAG / vector DB",
        claim: "Uses RAG with a vector database for semantic search and document retrieval",
        score: 68,
        evidence: [
          { source: "readme", positive: true, text: "README describes a RAG pipeline backed by a vector database for semantic search." },
          { source: "readme", positive: true, text: "README mentions embedding generation from the project's documentation corpus." },
          { source: "readme", positive: true, text: "README mentions the retriever returns top-k chunks." },
          { source: "package_json", positive: true, text: "package.json includes langchain dependency that is commonly used in RAG pipelines for retrieval orchestration." },
          { source: "package_json", positive: true, text: "package.json includes @pinecone-database/pinecone for vector storage." },
          { source: "file_tree", positive: true, text: "Repository file tree contains src/rag/retriever.ts and src/rag/embeddings.ts and src/rag/index.ts and src/rag/store.ts." },
          { source: "source_file", positive: true, text: "src/rag/retriever.ts:\nimport { OpenAIEmbeddings } from 'langchain/embeddings/openai'\nimport { PineconeStore } from 'langchain/vectorstores/pinecone'\nimport { Pinecone } from '@pinecone-database/pinecone'\n\nexport async function retrieve(query: string, topK = 5) {\n  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })\n  const idx = pc.Index('docs')\n  const emb = new OpenAIEmbeddings()\n  const store = await PineconeStore.fromExistingIndex(emb, { pineconeIndex: idx })\n  return await store.similaritySearch(query, topK)\n}\n\nfunction unrelatedHelper() { return null }" },
          { source: "source_file", positive: true, text: "src/rag/embeddings.ts:\nimport { OpenAIEmbeddings } from 'langchain/embeddings/openai'\nexport function makeEmbedder() {\n  return new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' })\n}\nfunction logSomething() { console.log('debug') }" },
          { source: "absence", positive: false, text: "No reranker found in source files." },
        ],
      },
      {
        id: "realtime",
        detector: "Real-time / streaming",
        claim: "Streams AI responses token-by-token over Server-Sent Events",
        score: 82,
        evidence: [
          { source: "readme", positive: true, text: "README describes real-time streaming chat responses over SSE." },
          { source: "readme", positive: true, text: "README explains tokens are emitted as they are produced for low latency." },
          { source: "package_json", positive: true, text: "package.json includes openai dependency that supports streaming responses." },
          { source: "source_file", positive: true, text: "app/api/chat/route.ts:\nimport OpenAI from 'openai'\nexport async function POST(req: Request) {\n  const { messages } = await req.json()\n  const stream = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, stream: true })\n  const encoder = new TextEncoder()\n  const readable = new ReadableStream({\n    async start(controller) {\n      for await (const part of stream) {\n        const chunk = part.choices[0]?.delta?.content ?? ''\n        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\\n\\n`))\n      }\n      controller.close()\n    }\n  })\n  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })\n}" },
          { source: "source_file", positive: true, text: "components/ChatStream.tsx:\nconst es = new EventSource('/api/chat')\nes.onmessage = (e) => setTokens((t) => t + JSON.parse(e.data).chunk)" },
          { source: "file_tree", positive: true, text: "Repository contains app/api/chat/route.ts and components/ChatStream.tsx and lib/sse.ts." },
        ],
      },
      {
        id: "voice",
        detector: "Voice / audio",
        claim: "Supports voice input via the microphone using speech-to-text",
        score: 18,
        evidence: [
          { source: "readme", positive: true, text: "README mentions voice input via microphone for hands-free use." },
          { source: "readme", positive: true, text: "README again mentions speech-to-text transcription powered by Whisper." },
          { source: "package_json", positive: false, text: "package.json has no @deepgram/sdk dependency." },
          { source: "package_json", positive: false, text: "package.json has no assemblyai dependency." },
          { source: "package_json", positive: false, text: "package.json has no elevenlabs dependency." },
          { source: "file_tree", positive: false, text: "No directory or file matching /audio|voice|speech|whisper/ found in repo." },
          { source: "absence", positive: false, text: "No MediaRecorder usage found in source files." },
          { source: "absence", positive: false, text: "No Whisper API calls found in source files." },
          { source: "absence", positive: false, text: "No microphone permission requests found in source files." },
          { source: "absence", positive: false, text: "No audio upload endpoints found in source files." },
        ],
      },
      {
        id: "multi-agent",
        detector: "Multi-agent",
        claim: "Uses a multi-agent architecture with planner and executor agents",
        score: 55,
        evidence: [
          { source: "readme", positive: true, text: "README describes a multi-agent system with planner and executor agents." },
          { source: "readme", positive: true, text: "README mentions agents collaborate through a shared scratchpad." },
          { source: "readme", positive: true, text: "README mentions a reviewer agent that validates planner output." },
          { source: "package_json", positive: false, text: "package.json has no langgraph, crewai, autogen, or @langchain/langgraph dependency listed." },
          { source: "file_tree", positive: true, text: "Repository contains agents/planner.ts and agents/executor.ts and agents/reviewer.ts and agents/coordinator.ts." },
          { source: "source_file", positive: true, text: "agents/planner.ts:\nimport { Agent } from './base'\nexport class Planner extends Agent {\n  async plan(task: string) {\n    const steps = await this.llm.generate(`Plan ${task}`)\n    return steps.split('\\n').filter(Boolean)\n  }\n}\nfunction unrelated() { return 1 }" },
          { source: "absence", positive: false, text: "No explicit orchestration framework (LangGraph, CrewAI, AutoGen) found in source files." },
        ],
      },
      {
        id: "cv",
        detector: "Computer vision / video AI",
        claim: "Performs real-time object detection and pose estimation from camera frames",
        score: 8,
        evidence: [
          { source: "readme", positive: true, text: "README mentions image analysis for diagnostics including object detection." },
          { source: "readme", positive: true, text: "README again mentions a fine-tuned YOLO model for pose estimation." },
          { source: "package_json", positive: false, text: "package.json has no opencv-python, ultralytics, mediapipe, torch, or @tensorflow/tfjs dependency." },
          { source: "file_tree", positive: false, text: "No directory or file matching /vision|detect|frame|yolo/ found in repo file tree." },
          { source: "absence", positive: false, text: "No image processing code found in source files." },
          { source: "absence", positive: false, text: "No model inference code found in source files." },
          { source: "absence", positive: false, text: "No VideoCapture calls found in source files." },
          { source: "absence", positive: false, text: "No cv2 imports found in source files." },
        ],
      },
    ],
  },
};

const PAYLOADS: Payload[] = [payloadA, payloadB, payloadC];

interface PayloadResult {
  name: string;
  rawTokens: number;
  compressedTokens: number;
  rawChars: number;
  compressedChars: number;
  percentReduction: number;
  claims: number;
  rawPositive: number;
  rawNegative: number;
  compressedPositive: number;
  compressedNegative: number;
  uniqueFilePaths: number;
  agreement: number;
  totalClaims: number;
  agreementByClaim: Array<{ id: string; raw: SignalLabel; compressed: SignalLabel; match: boolean }>;
  warnings: string[];
}

function evaluate(payload: Payload): PayloadResult {
  const compressed = compressEvidenceContextLocal(payload.input);
  const meta = compressed.metadata;

  let rawPositive = 0;
  let rawNegative = 0;
  for (const c of payload.input.claims) {
    for (const e of c.evidence) {
      if (e.positive) rawPositive++;
      else rawNegative++;
    }
  }

  const warnings: string[] = [];
  const agreementByClaim: PayloadResult["agreementByClaim"] = [];
  let agreed = 0;

  for (const rawClaim of payload.input.claims) {
    const compClaim = compressed.compressedInput.claims.find((c) => c.id === rawClaim.id);
    if (!compClaim) {
      warnings.push(`claim "${rawClaim.id}" missing from compressed output`);
      continue;
    }
    const rawHasPos = rawClaim.evidence.some((e) => e.positive);
    const rawHasNeg = rawClaim.evidence.some((e) => !e.positive);
    const compHasPos = compClaim.evidence.some((e) => e.positive);
    const compHasNeg = compClaim.evidence.some((e) => !e.positive);

    if (rawHasPos && !compHasPos) {
      warnings.push(`claim "${rawClaim.id}" lost ALL positive evidence`);
    }
    if (rawHasNeg && !compHasNeg) {
      warnings.push(`claim "${rawClaim.id}" lost ALL negative/missing evidence`);
    }
    if (compClaim.evidence.length === 0) {
      warnings.push(`claim "${rawClaim.id}" has zero evidence items — judge cannot evaluate`);
    }

    const rawLabel = signalLabel(rawClaim);
    const compLabel = signalLabel(compClaim);
    const match = rawLabel === compLabel;
    if (match) agreed++;
    agreementByClaim.push({ id: rawClaim.id, raw: rawLabel, compressed: compLabel, match });
  }

  const totalClaims = payload.input.claims.length;
  const agreement = totalClaims === 0 ? 1 : agreed / totalClaims;

  return {
    name: payload.name,
    rawTokens: meta.rawEstimatedTokens,
    compressedTokens: meta.compressedEstimatedTokens,
    rawChars: meta.rawChars,
    compressedChars: meta.compressedChars,
    percentReduction: meta.percentReduction,
    claims: meta.preservedSignals.claims,
    rawPositive,
    rawNegative,
    compressedPositive: meta.preservedSignals.positiveEvidence,
    compressedNegative: meta.preservedSignals.negativeEvidence,
    uniqueFilePaths: meta.preservedSignals.uniqueFilePaths,
    agreement,
    totalClaims,
    agreementByClaim,
    warnings,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function printPayloadResult(r: PayloadResult, desc: string) {
  console.log(`\n── ${r.name} ──`);
  console.log(`   ${desc}`);
  console.log(
    `   tokens: ${pad(r.rawTokens.toLocaleString(), 7)} → ${pad(r.compressedTokens.toLocaleString(), 7)} (${r.percentReduction}% reduction)`,
  );
  console.log(
    `   chars : ${pad(r.rawChars.toLocaleString(), 7)} → ${pad(r.compressedChars.toLocaleString(), 7)}`,
  );
  console.log(
    `   evidence: positive ${r.rawPositive} → ${r.compressedPositive}   negative ${r.rawNegative} → ${r.compressedNegative}`,
  );
  console.log(`   unique file paths preserved: ${r.uniqueFilePaths}`);
  console.log(`   signal agreement: ${pct(r.agreement)} (${r.agreementByClaim.filter((c) => c.match).length}/${r.totalClaims})`);
  for (const a of r.agreementByClaim) {
    const flag = a.match ? "✓" : "✗";
    console.log(`     ${flag} ${pad(a.id, 14)} raw=${pad(a.raw, 12)} compressed=${a.compressed}`);
  }
  if (r.warnings.length > 0) {
    console.log(`   ⚠ warnings:`);
    for (const w of r.warnings) console.log(`     - ${w}`);
  } else {
    console.log(`   ✓ no warnings — every claim retained sufficient evidence to judge`);
  }
}

function main() {
  console.log("=== BuildProof Evidence Compression Benchmark ===");
  console.log("Local-only. No LLM, no network, no API keys. Heuristic signal labels only.\n");

  const results: PayloadResult[] = [];
  for (const p of PAYLOADS) {
    const r = evaluate(p);
    printPayloadResult(r, p.description);
    results.push(r);
  }

  const totalRaw = results.reduce((n, r) => n + r.rawTokens, 0);
  const totalCompressed = results.reduce((n, r) => n + r.compressedTokens, 0);
  const avgReduction =
    results.reduce((n, r) => n + r.percentReduction, 0) / Math.max(1, results.length);
  const totalClaims = results.reduce((n, r) => n + r.totalClaims, 0);
  const totalAgreed = results.reduce(
    (n, r) => n + r.agreementByClaim.filter((c) => c.match).length,
    0,
  );
  const overallAgreement = totalClaims === 0 ? 1 : totalAgreed / totalClaims;
  const totalWarnings = results.reduce((n, r) => n + r.warnings.length, 0);

  console.log("\n=== Aggregate ===");
  console.log(`   total tokens     : ${totalRaw.toLocaleString()} → ${totalCompressed.toLocaleString()}`);
  console.log(
    `   absolute reduction: ${(totalRaw - totalCompressed).toLocaleString()} tokens (${Math.round((1 - totalCompressed / Math.max(1, totalRaw)) * 100)}% overall)`,
  );
  console.log(`   average reduction : ${Math.round(avgReduction)}% per payload`);
  console.log(`   signal agreement  : ${pct(overallAgreement)} (${totalAgreed}/${totalClaims} claims)`);
  console.log(`   warnings          : ${totalWarnings}`);

  if (totalWarnings === 0) {
    console.log("\n✓ benchmark passed: every claim retained sufficient evidence to judge, no positive/negative evidence dropped entirely");
  } else {
    console.log("\n⚠ benchmark produced warnings — see per-payload output above");
  }

  // Non-zero exit on warnings makes this usable as a soft regression check
  process.exitCode = totalWarnings === 0 ? 0 : 1;
}

main();
