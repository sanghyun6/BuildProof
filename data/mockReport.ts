import type { AuditReport } from "../types/pipeline";

export const mockReport: AuditReport = {
  projectName: "HealthBot AI Assistant",
  githubUrl: "https://github.com/example-user/healthbot-ai",
  auditedAt: "2026-06-20T10:00:00Z",
  overallScore: 42,
  scanSource: "mock",
  claimExtractionSource: "keyword",
  judgeSource: "deterministic",
  verdicts: [
    {
      id: "mcp",
      detector: "MCP",
      claim: "Uses MCP (Model Context Protocol) for tool integration",
      evidence: [
        {
          text: "README mentions MCP and describes tool calls",
          source: "readme",
          positive: true,
        },
        {
          text: "package.json has no @modelcontextprotocol/sdk dependency",
          source: "package_json",
          positive: false,
        },
        {
          text: "No MCP server or client files found in repository",
          source: "file_tree",
          positive: false,
        },
      ],
      verdict: "Unsupported by repository evidence",
      score: 5,
    },
    {
      id: "multi-agent",
      detector: "Multi-agent",
      claim: "Uses multi-agent architecture for parallel task processing",
      evidence: [
        {
          text: "README describes multiple agents handling different domains",
          source: "readme",
          positive: true,
        },
        {
          text: "Source contains modules named agent.ts and coordinator.ts",
          source: "source_file",
          positive: true,
        },
        {
          text: "No explicit orchestration framework (LangGraph, CrewAI, AutoGen) found",
          source: "absence",
          positive: false,
        },
      ],
      verdict: "Partially supported",
      score: 55,
    },
    {
      id: "voice",
      detector: "Voice / audio",
      claim: "Supports voice input via microphone for hands-free use",
      evidence: [
        {
          text: "package.json includes openai (with Whisper API usage pattern)",
          source: "package_json",
          positive: true,
        },
        {
          text: "Source contains MediaRecorder and microphone upload UI code",
          source: "source_file",
          positive: true,
        },
      ],
      verdict: "Strongly supported",
      score: 90,
    },
    {
      id: "rag",
      detector: "RAG / vector DB",
      claim: "Uses RAG with a vector database for medical knowledge retrieval",
      evidence: [
        {
          text: "README describes a retrieval-augmented generation pipeline",
          source: "readme",
          positive: true,
        },
        {
          text: "No vector database dependency found (pinecone, weaviate, chroma, qdrant)",
          source: "package_json",
          positive: false,
        },
        {
          text: "No embedding or retrieval code found in source",
          source: "absence",
          positive: false,
        },
      ],
      verdict: "README-only claim",
      score: 10,
    },
    {
      id: "realtime",
      detector: "Real-time / streaming",
      claim: "Streams AI responses token-by-token in real time",
      evidence: [
        {
          text: "Source uses ReadableStream and async iteration for SSE",
          source: "source_file",
          positive: true,
        },
        {
          text: "API route returns streaming response with Content-Type: text/event-stream",
          source: "source_file",
          positive: true,
        },
      ],
      verdict: "Strongly supported",
      score: 92,
    },
    {
      id: "cv",
      detector: "Computer vision / video AI",
      claim: "Analyzes medical images using computer vision",
      evidence: [
        {
          text: "README mentions image analysis for diagnostics",
          source: "readme",
          positive: true,
        },
        {
          text: "No CV library found (opencv, tensorflow, torchvision, roboflow)",
          source: "package_json",
          positive: false,
        },
        {
          text: "No image processing or model inference code found in source",
          source: "absence",
          positive: false,
        },
      ],
      verdict: "Unsupported by repository evidence",
      score: 8,
    },
  ],
};
