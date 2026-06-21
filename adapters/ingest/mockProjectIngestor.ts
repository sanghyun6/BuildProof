import type { ProjectIngestor, ProjectIngestInput, ProjectIngestResult } from "./types";

// Fixed fixture data — represents a plausible hackathon project claiming all six detector categories.
// The description is intentionally rich so the keyword extractor finds all six categories and
// the repo scan has something meaningful to evaluate.
const MOCK_RESULT: Omit<ProjectIngestResult, "source" | "status" | "warnings"> = {
  title: "MediScan AI (demo project)",
  description:
    "MediScan AI is a multi-agent health assistant that uses MCP (Model Context Protocol) " +
    "to expose clinical tools and resources. Medical records are retrieved using a RAG pipeline " +
    "backed by a vector database. Responses are streamed to the user in real time via " +
    "Server-Sent Events. Patients can speak to the assistant — voice input is processed with " +
    "speech-to-text transcription. A computer vision module analyzes uploaded medical images " +
    "for document classification and text extraction using OCR.",
  builtWith: [
    "Next.js",
    "OpenAI",
    "Pinecone",
    "@modelcontextprotocol/sdk",
    "Deepgram",
    "LangGraph",
    "PyTorch",
  ],
  githubUrl: "https://github.com/example-user/mediscan-ai",
};

export const mockProjectIngestor: ProjectIngestor = {
  async ingest(_input: ProjectIngestInput): Promise<ProjectIngestResult> {
    return {
      ...MOCK_RESULT,
      source: "mock",
      status: "success",
      warnings: [
        "Demo extraction only — content shown is sample fixture data, not retrieved from the project URL.",
        "Add BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID to enable real page extraction.",
      ],
    };
  },
};
