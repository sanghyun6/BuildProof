/**
 * Unit tests for the shared implementation-signal helper and the three upgraded
 * detectors (MCP, RAG, multi-agent). No network calls — all data is synthetic.
 *
 * Run with: npx tsx scripts/testImplementationSignals.ts
 */

import { findImplementationSignals } from "../detectors/implementationSignals";
import { detectMcp } from "../detectors/mcp";
import { detectRag } from "../detectors/rag";
import { detectMultiAgent } from "../detectors/multiAgent";
import type { Evidence, RepoScan } from "../types/pipeline";

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, extra?: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    if (extra) console.error(`        ${extra}`);
    failed++;
  }
}

function makeScan(overrides: Partial<RepoScan>): RepoScan {
  return {
    githubUrl: "https://github.com/test/repo",
    owner: "test",
    repo: "repo",
    source: "github-api",
    defaultBranch: "main",
    fileTree: [],
    packageJson: null,
    readmeText: null,
    sourceFiles: {},
    pythonDepFiles: {},
    ...overrides,
  };
}

function hasSource(evidence: Evidence[], source: Evidence["source"], positive: boolean): boolean {
  return evidence.some((e) => e.source === source && e.positive === positive);
}

function countSource(evidence: Evidence[], source: Evidence["source"], positive: boolean): number {
  return evidence.filter((e) => e.source === source && e.positive === positive).length;
}

// -----------------------------------------------------------------------------
// findImplementationSignals — helper-level tests
// -----------------------------------------------------------------------------

console.log("findImplementationSignals");

// 1. No data at all → single absence evidence
{
  const result = findImplementationSignals(makeScan({}), {
    label: "MCP",
    nodeDeps: ["@modelcontextprotocol/sdk"],
    readmeTerms: ["mcp"],
  });
  assert(
    "no signals → single absence evidence",
    result.evidence.length === 1 &&
      result.evidence[0].source === "absence" &&
      result.evidence[0].positive === false,
  );
  assert("no signals → isReadmeOnly false", result.isReadmeOnly === false);
}

// 2. README mention only → isReadmeOnly + readme positive + absence negatives
{
  const result = findImplementationSignals(
    makeScan({ readmeText: "This project uses Model Context Protocol." }),
    {
      label: "MCP",
      nodeDeps: ["@modelcontextprotocol/sdk"],
      pythonDeps: ["mcp"],
      readmeTerms: ["model context protocol"],
      importPackages: ["@modelcontextprotocol/sdk"],
      usagePatterns: ["McpServer"],
    },
  );
  assert("readme-only → isReadmeOnly true", result.isReadmeOnly === true);
  assert(
    "readme-only → exactly one readme positive evidence",
    countSource(result.evidence, "readme", true) === 1,
  );
  assert(
    "readme-only → has 'no dep' negative",
    hasSource(result.evidence, "package_json", false),
  );
  assert(
    "readme-only → has 'no source' absence",
    hasSource(result.evidence, "absence", false),
  );
  assert(
    "readme-only → no source_file positive",
    countSource(result.evidence, "source_file", true) === 0,
  );
}

// 3. Node dep only → package_json positive + no-source absence
{
  const result = findImplementationSignals(
    makeScan({
      packageJson: { dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" } },
    }),
    {
      label: "MCP",
      nodeDeps: ["@modelcontextprotocol/sdk"],
      importPackages: ["@modelcontextprotocol/sdk"],
      usagePatterns: ["McpServer"],
    },
  );
  assert(
    "node-dep-only → package_json positive present",
    hasSource(result.evidence, "package_json", true),
  );
  assert(
    "node-dep-only → no source_file positive",
    countSource(result.evidence, "source_file", true) === 0,
  );
  assert(
    "node-dep-only → has source absence",
    hasSource(result.evidence, "absence", false),
  );
  assert("node-dep-only → not readmeOnly", result.isReadmeOnly === false);
}

// 4. Python dep only → package_json positive from pythonDepFiles
{
  const result = findImplementationSignals(
    makeScan({
      pythonDepFiles: {
        "requirements.txt": "fastapi==0.110\nmcp>=1.0.0\nrequests",
      },
    }),
    {
      label: "MCP",
      pythonDeps: ["mcp"],
      importPackages: ["mcp"],
      usagePatterns: ["FastMCP"],
    },
  );
  assert(
    "python-dep-only → package_json positive present",
    hasSource(result.evidence, "package_json", true),
  );
  const labelled = result.evidence.find(
    (e) => e.source === "package_json" && e.positive && e.text.includes("requirements.txt"),
  );
  assert(
    "python-dep-only → evidence cites requirements.txt",
    labelled !== undefined,
    `evidence: ${JSON.stringify(result.evidence)}`,
  );
}

// 5. JS import line in a source file → source_file positive
{
  const result = findImplementationSignals(
    makeScan({
      sourceFiles: {
        "src/server.ts":
          `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\n` +
          `const server = new McpServer({});\n` +
          `server.tool("hello", () => "world");\n`,
      },
    }),
    {
      label: "MCP",
      nodeDeps: ["@modelcontextprotocol/sdk"],
      importPackages: ["@modelcontextprotocol/sdk"],
      usagePatterns: ["McpServer", "server.tool("],
    },
  );
  assert(
    "JS import → source_file positive present",
    hasSource(result.evidence, "source_file", true),
  );
  const importEvidence = result.evidence.find(
    (e) => e.source === "source_file" && e.positive && e.text.includes("imports"),
  );
  assert(
    "JS import → evidence labels the import",
    importEvidence !== undefined,
    `evidence: ${JSON.stringify(result.evidence)}`,
  );
}

// 6. Python import line `from pkg import x` matches
{
  const result = findImplementationSignals(
    makeScan({
      sourceFiles: {
        "app/server.py":
          `from mcp.server.fastmcp import FastMCP\n\n` +
          `mcp = FastMCP("demo")\n\n` +
          `@mcp.tool\ndef hello():\n    return "world"\n`,
      },
    }),
    {
      label: "MCP",
      importPackages: ["mcp"],
      usagePatterns: ["FastMCP", "@mcp.tool"],
    },
  );
  assert(
    "Python import → source_file positive present",
    hasSource(result.evidence, "source_file", true),
  );
}

// 7. Config file recognition → file_tree positive
{
  const result = findImplementationSignals(
    makeScan({ fileTree: ["config/mcp.json", "src/index.ts"] }),
    {
      label: "MCP",
      configFilenames: ["mcp.json"],
    },
  );
  const configEv = result.evidence.find(
    (e) => e.source === "file_tree" && e.positive && e.text.includes("config file"),
  );
  assert("config file → file_tree positive labelled", configEv !== undefined);
}

// 8. Source-path dedupe — when a file matches both import and usage, only one entry
{
  const result = findImplementationSignals(
    makeScan({
      sourceFiles: {
        "src/server.ts":
          `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\n` +
          `const s = new McpServer({});\n`,
      },
    }),
    {
      label: "MCP",
      importPackages: ["@modelcontextprotocol/sdk"],
      usagePatterns: ["McpServer"],
    },
  );
  // Should produce 1 import evidence; the usage on the same path is skipped.
  const sfPositives = result.evidence.filter(
    (e) => e.source === "source_file" && e.positive,
  );
  assert(
    "import + usage in same file → one source_file evidence",
    sfPositives.length === 1,
    `got ${sfPositives.length}: ${JSON.stringify(sfPositives)}`,
  );
}

// 9. Full signal: dep + import + readme → no absences appended
{
  const result = findImplementationSignals(
    makeScan({
      packageJson: { dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" } },
      readmeText: "This builds an MCP server.",
      sourceFiles: {
        "src/server.ts": `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`,
      },
    }),
    {
      label: "MCP",
      nodeDeps: ["@modelcontextprotocol/sdk"],
      readmeTerms: ["mcp server"],
      importPackages: ["@modelcontextprotocol/sdk"],
      usagePatterns: ["McpServer"],
    },
  );
  const negatives = result.evidence.filter((e) => !e.positive);
  assert(
    "full signal → no negative absence evidence",
    negatives.length === 0,
    `negatives: ${JSON.stringify(negatives)}`,
  );
  assert(
    "full signal → source/dep/readme all present",
    hasSource(result.evidence, "source_file", true) &&
      hasSource(result.evidence, "package_json", true) &&
      hasSource(result.evidence, "readme", true),
  );
}

// 10. False-positive guard: substring of an unrelated word should not match imports
{
  const result = findImplementationSignals(
    makeScan({
      sourceFiles: {
        "src/util.ts": `// note about mcp-shaped behaviour, but no real import\nconsole.log("hi");\n`,
      },
    }),
    {
      label: "MCP",
      importPackages: ["@modelcontextprotocol/sdk", "mcp"],
      usagePatterns: ["McpServer"],
    },
  );
  assert(
    "comment-only mention → no source_file positive",
    countSource(result.evidence, "source_file", true) === 0,
  );
}

// -----------------------------------------------------------------------------
// MCP detector
// -----------------------------------------------------------------------------

console.log("\ndetectMcp");

// 1. Dependency + source usage → strong evidence (source_file + package_json)
{
  const scan = makeScan({
    packageJson: { dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" } },
    sourceFiles: {
      "src/server.ts":
        `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\n` +
        `const server = new McpServer({ name: "demo", version: "1" });\n` +
        `server.tool("greet", () => "hi");\n`,
    },
  });
  const ev = detectMcp(scan);
  assert(
    "MCP dep + source → source_file positive",
    hasSource(ev, "source_file", true),
  );
  assert(
    "MCP dep + source → package_json positive",
    hasSource(ev, "package_json", true),
  );
  assert(
    "MCP dep + source → no absence negative",
    !hasSource(ev, "absence", false),
  );
}

// 2. README-only mention → weak (readme positive + 2 negatives, no source_file)
{
  const scan = makeScan({
    readmeText: "This project uses the Model Context Protocol via MCP server architecture.",
  });
  const ev = detectMcp(scan);
  assert(
    "MCP readme-only → no source_file positive",
    countSource(ev, "source_file", true) === 0,
  );
  assert(
    "MCP readme-only → readme positive present",
    hasSource(ev, "readme", true),
  );
  assert(
    "MCP readme-only → 'no dep' absence present",
    hasSource(ev, "package_json", false),
  );
  assert(
    "MCP readme-only → 'no source' absence present",
    hasSource(ev, "absence", false),
  );
}

// 3. Python MCP server: FastMCP import + @mcp.tool decorator → source_file positive
{
  const scan = makeScan({
    pythonDepFiles: { "requirements.txt": "mcp>=1.0.0" },
    sourceFiles: {
      "server.py":
        `from mcp.server.fastmcp import FastMCP\n\n` +
        `mcp = FastMCP("demo")\n\n` +
        `@mcp.tool\n` +
        `def hello() -> str:\n    return "world"\n`,
    },
  });
  const ev = detectMcp(scan);
  assert(
    "MCP Python → source_file positive",
    hasSource(ev, "source_file", true),
  );
  assert(
    "MCP Python → package_json positive (requirements.txt)",
    hasSource(ev, "package_json", true),
  );
}

// 4. False-positive guard: a file containing the substring "mcp" in a comment, with no real import
{
  const scan = makeScan({
    sourceFiles: {
      "src/util.ts": `// mcp is cool but we don't use it\nexport const x = 1;\n`,
    },
  });
  const ev = detectMcp(scan);
  assert(
    "MCP comment-only mention → no source_file positive",
    countSource(ev, "source_file", true) === 0,
  );
}

// -----------------------------------------------------------------------------
// RAG detector
// -----------------------------------------------------------------------------

console.log("\ndetectRag");

// 1. Vector DB dep + retrieval source usage → strong evidence
{
  const scan = makeScan({
    packageJson: { dependencies: { chromadb: "^0.5.0" } },
    sourceFiles: {
      "src/rag.ts":
        `import { Chroma } from "@langchain/community/vectorstores/chroma";\n` +
        `import { OpenAIEmbeddings } from "@langchain/openai";\n` +
        `const store = await Chroma.fromDocuments(docs, new OpenAIEmbeddings());\n` +
        `const retriever = store.asRetriever();\n`,
    },
  });
  const ev = detectRag(scan);
  assert(
    "RAG dep + source → source_file positive",
    hasSource(ev, "source_file", true),
  );
  assert(
    "RAG dep + source → package_json positive",
    hasSource(ev, "package_json", true),
  );
  assert(
    "RAG dep + source → no negative absence",
    !hasSource(ev, "absence", false),
  );
}

// 2. README-only RAG claim → weak (readme positive + 2 negatives, no source_file)
{
  const scan = makeScan({
    readmeText:
      "We use retrieval-augmented generation with a vector database for semantic search.",
  });
  const ev = detectRag(scan);
  assert(
    "RAG readme-only → readme positive present",
    hasSource(ev, "readme", true),
  );
  assert(
    "RAG readme-only → no source_file positive",
    countSource(ev, "source_file", true) === 0,
  );
  assert(
    "RAG readme-only → 'no dep' absence present",
    hasSource(ev, "package_json", false),
  );
  assert(
    "RAG readme-only → 'no source' absence present",
    hasSource(ev, "absence", false),
  );
}

// 3. Python RAG: langchain_community import + similarity_search → source_file positive
{
  const scan = makeScan({
    pythonDepFiles: {
      "requirements.txt": "langchain-community==0.2\nchromadb==0.5\nsentence-transformers",
    },
    sourceFiles: {
      "app/rag.py":
        `from langchain_community.vectorstores import Chroma\n` +
        `from langchain_openai import OpenAIEmbeddings\n\n` +
        `db = Chroma.from_documents(docs, OpenAIEmbeddings())\n` +
        `results = db.similarity_search("question", k=4)\n`,
    },
  });
  const ev = detectRag(scan);
  assert(
    "RAG Python → source_file positive",
    hasSource(ev, "source_file", true),
  );
  assert(
    "RAG Python → package_json positive",
    hasSource(ev, "package_json", true),
  );
}

// -----------------------------------------------------------------------------
// Multi-agent detector
// -----------------------------------------------------------------------------

console.log("\ndetectMultiAgent");

// 1. LangGraph dep + StateGraph + add_node → strong evidence
{
  const scan = makeScan({
    pythonDepFiles: { "requirements.txt": "langgraph>=0.2\nlangchain>=0.2" },
    sourceFiles: {
      "graph.py":
        `from langgraph.graph import StateGraph, END\n\n` +
        `graph = StateGraph(MyState)\n` +
        `graph.add_node("planner", planner_fn)\n` +
        `graph.add_node("executor", executor_fn)\n` +
        `graph.add_edge("planner", "executor")\n`,
    },
  });
  const ev = detectMultiAgent(scan);
  assert(
    "multi-agent LangGraph → source_file positive",
    hasSource(ev, "source_file", true),
  );
  assert(
    "multi-agent LangGraph → package_json positive",
    hasSource(ev, "package_json", true),
  );
  assert(
    "multi-agent LangGraph → no negative absence",
    !hasSource(ev, "absence", false),
  );
}

// 2. CrewAI dep + Crew/Agent/Task patterns → strong evidence
{
  const scan = makeScan({
    pythonDepFiles: { "requirements.txt": "crewai==0.50.0" },
    sourceFiles: {
      "crew.py":
        `from crewai import Crew, Agent, Task\n\n` +
        `researcher = Agent(role="researcher", goal="find facts")\n` +
        `writer = Agent(role="writer", goal="write up")\n` +
        `crew = Crew(agents=[researcher, writer], tasks=[Task(description="...")])\n`,
    },
  });
  const ev = detectMultiAgent(scan);
  assert(
    "multi-agent CrewAI → source_file positive",
    hasSource(ev, "source_file", true),
  );
  assert(
    "multi-agent CrewAI → package_json positive",
    hasSource(ev, "package_json", true),
  );
}

// 3. README-only multi-agent mention → weak (no source_file, has absences)
{
  const scan = makeScan({
    readmeText:
      "Our system is a multi-agent orchestrator with autonomous agents and a coordinator.",
  });
  const ev = detectMultiAgent(scan);
  assert(
    "multi-agent readme-only → readme positive present",
    hasSource(ev, "readme", true),
  );
  assert(
    "multi-agent readme-only → no source_file positive",
    countSource(ev, "source_file", true) === 0,
  );
  assert(
    "multi-agent readme-only → 'no dep' absence present",
    hasSource(ev, "package_json", false),
  );
  assert(
    "multi-agent readme-only → 'no source' absence present",
    hasSource(ev, "absence", false),
  );
}

// 4. No multi-agent signals at all → single absence evidence
{
  const scan = makeScan({
    packageJson: { dependencies: { express: "^4.0.0" } },
    sourceFiles: { "index.ts": `import express from "express"; const app = express();` },
  });
  const ev = detectMultiAgent(scan);
  assert(
    "multi-agent no signals → single absence evidence",
    ev.length === 1 && ev[0].source === "absence" && !ev[0].positive,
  );
}

// -----------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
