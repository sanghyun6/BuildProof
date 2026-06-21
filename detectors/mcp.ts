import type { Evidence, RepoScan } from "../types/pipeline";
import { findImplementationSignals } from "./implementationSignals";

const MCP_NODE_DEPS = ["@modelcontextprotocol/sdk"];
const MCP_PYTHON_DEPS = ["mcp", "modelcontextprotocol"];

const MCP_CONFIG_FILENAMES = [
  "mcp.json",
  "mcp.config.json",
  ".mcp.json",
  "claude_desktop_config.json",
];

const MCP_FILE_PATH_PATTERNS = ["mcp"];

const MCP_README_TERMS = [
  "model context protocol",
  "mcp server",
  "mcp client",
  "@modelcontextprotocol",
];

const MCP_IMPORT_PACKAGES = [
  "@modelcontextprotocol/sdk",
  "modelcontextprotocol",
  "mcp",
];

const MCP_USAGE_PATTERNS = [
  "McpServer",
  "StdioServerTransport",
  "SSEServerTransport",
  "server.tool(",
  "registerTool(",
  "register_tool(",
  "mcp.connect",
  "mcp.tool",
  "@server.tool",
  "@mcp.tool",
  "new Server(",
  "Server({",
];

export function detectMcp(scan: RepoScan): Evidence[] {
  const result = findImplementationSignals(scan, {
    label: "MCP",
    nodeDeps: MCP_NODE_DEPS,
    pythonDeps: MCP_PYTHON_DEPS,
    configFilenames: MCP_CONFIG_FILENAMES,
    filePathPatterns: MCP_FILE_PATH_PATTERNS,
    readmeTerms: MCP_README_TERMS,
    importPackages: MCP_IMPORT_PACKAGES,
    usagePatterns: MCP_USAGE_PATTERNS,
    absenceMessages: {
      noDep: `No @modelcontextprotocol/sdk dependency found in package.json`,
      noSource: "No MCP server or client implementation found in source files",
    },
  });
  return result.evidence;
}
