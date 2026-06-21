import type { Evidence, RepoScan } from "../types/pipeline";
import { findImplementationSignals } from "./implementationSignals";

const MULTI_AGENT_NODE_DEPS = [
  "@langchain/langgraph",
  "langgraph",
  "crewai",
  "autogen",
  "pyautogen",
  "uagents",
  "fetchai",
  "@fetchai/uagents",
  "agentops",
  "controlflow",
  "pydantic-ai",
  "agency-swarm",
  "taskweaver",
];

const MULTI_AGENT_PYTHON_DEPS = [
  ...MULTI_AGENT_NODE_DEPS,
  "microsoft-autogen",
  "autogen-agentchat",
  "autogen-core",
  "camel-ai",
  "swarm",
  "openai-swarm",
  "semantic-kernel",
  "phi-agent",
  "phidata",
  "bee-agent-framework",
  "smolagents",
  "openai-agents",
  "agno",
];

const MULTI_AGENT_FILE_PATH_PATTERNS = [
  "agent",
  "agents",
  "crew",
  "swarm",
  "orchestrat",
  "workflow",
  "planner",
  "executor",
  "reviewer",
  "coordinator",
  "supervisor",
  "graph_nodes",
  "graph_node",
];

const MULTI_AGENT_README_TERMS = [
  "multi-agent",
  "multi agent",
  "agent orchestration",
  "autonomous agents",
  "planner",
  "executor",
  "reviewer",
  "coordinator",
  "orchestrator",
  "supervisor",
  "swarm",
  "crewai",
  "langgraph",
  "autogen",
  "handoff",
];

const MULTI_AGENT_IMPORT_PACKAGES = [
  "langgraph",
  "@langchain/langgraph",
  "crewai",
  "autogen",
  "autogen_agentchat",
  "autogen_core",
  "pyautogen",
  "swarm",
  "semantic_kernel",
  "phi.agent",
  "phidata",
  "smolagents",
  "agents",
  "openai_agents",
  "agency_swarm",
  "uagents",
];

const MULTI_AGENT_USAGE_PATTERNS = [
  "StateGraph",
  "MessageGraph",
  "AgentExecutor",
  "AgentState",
  "CrewAI",
  "Crew(",
  "Agent(",
  "Task(",
  "create_react_agent",
  "create_swarm",
  "create_supervisor",
  "RoutedAgent",
  "AssistantAgent",
  "UserProxyAgent",
  "ConversableAgent",
  "GroupChat",
  "GroupChatManager",
  "Orchestrator",
  "multi_agent",
  "multiAgent",
  "handoff(",
  ".handoff(",
  "Handoff(",
  "register_agent",
  "add_node(",
  "add_edge(",
];

export function detectMultiAgent(scan: RepoScan): Evidence[] {
  const result = findImplementationSignals(scan, {
    label: "multi-agent",
    nodeDeps: MULTI_AGENT_NODE_DEPS,
    pythonDeps: MULTI_AGENT_PYTHON_DEPS,
    filePathPatterns: MULTI_AGENT_FILE_PATH_PATTERNS,
    readmeTerms: MULTI_AGENT_README_TERMS,
    importPackages: MULTI_AGENT_IMPORT_PACKAGES,
    usagePatterns: MULTI_AGENT_USAGE_PATTERNS,
    absenceMessages: {
      noDep:
        "No multi-agent framework dependency found (langgraph, crewai, autogen, swarm, semantic-kernel, etc.)",
      noSource:
        "No agent orchestration, supervisor, or handoff code found in source files",
    },
  });
  return result.evidence;
}
