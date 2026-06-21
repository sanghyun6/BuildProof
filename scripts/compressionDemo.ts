/**
 * Local-only safe demo for the evidence compression layer.
 *
 * Build a realistic 6-claim audit payload (heavy README repetition, long source snippets,
 * many missing-signal items, duplicates) and compare raw vs compressed estimated tokens.
 *
 * No network calls. No real API keys. Safe to run any time:
 *   npx tsx scripts/compressionDemo.ts
 */
import type { LLMJudgeInput } from "../adapters/llm/types";
import { compressEvidenceContextLocal } from "../pipeline/compressEvidenceContext";

const sample: LLMJudgeInput = {
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
        { source: "source_file", positive: true, text: "src/rag/embeddings.ts:\nimport { OpenAIEmbeddings } from 'langchain/embeddings/openai'\n\nexport function makeEmbedder() {\n  return new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' })\n}\n\nfunction logSomething() { console.log('debug') }" },
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
};

function summarize(label: string, text: string) {
  console.log(`${label}: ${text.length.toLocaleString()} chars`);
}

function main() {
  const result = compressEvidenceContextLocal(sample);
  const rawText = JSON.stringify(sample);

  console.log("=== Evidence Compression — local claim-aware ===");
  summarize("Raw   ", rawText);
  summarize("Comp. ", result.compressedText);
  console.log("");

  console.log("Metadata:");
  console.log(JSON.stringify(result.metadata, null, 2));
  console.log("");

  console.log("Per-claim sanity check (every claim must keep ≥ 1 positive if original had one, and ≥ 1 negative if original had one):");
  for (const original of sample.claims) {
    const compressed = result.compressedInput.claims.find((c) => c.id === original.id)!;
    const oP = original.evidence.filter((e) => e.positive).length;
    const oN = original.evidence.filter((e) => !e.positive).length;
    const cP = compressed.evidence.filter((e) => e.positive).length;
    const cN = compressed.evidence.filter((e) => !e.positive).length;
    const positiveOk = oP === 0 || cP >= 1;
    const negativeOk = oN === 0 || cN >= 1;
    const flag = positiveOk && negativeOk ? "✓" : "✗";
    console.log(
      `  ${flag} ${original.id.padEnd(12)} ev: ${original.evidence.length} → ${compressed.evidence.length}  positive: ${oP} → ${cP}  negative: ${oN} → ${cN}`,
    );
  }
  console.log("");

  console.log("Compressed evidence sample (first 2 claims):");
  for (const c of result.compressedInput.claims.slice(0, 2)) {
    console.log(`\n# ${c.id} (${c.detector}) — score ${c.score}`);
    console.log(`  claim: ${c.claim}`);
    for (const e of c.evidence) {
      console.log(`  [${e.source}|${e.positive ? "+" : "-"}] ${e.text}`);
    }
  }
}

main();
