import type { Evidence, RepoScan } from "../types/pipeline";
import {
  findMatchingDependency,
  findMatchingPythonDep,
  matchingFilePaths,
  readmeMatchingTerms,
  sourceMatchingTerms,
  makeEvidence,
} from "./scan";

const REALTIME_DEPS = [
  "socket.io",
  "socket.io-client",
  "ws",
  "websocket",
  "eventsource",
  "@microsoft/fetch-event-source",
  "reconnecting-websocket",
  "uws",
  "sockjs",
  "sockjs-client",
  "pusher",
  "pusher-js",
  "ably",
  "liveblocks",
  "@liveblocks/client",
];

// Python package names for real-time / streaming
const REALTIME_PYTHON_EXTRA_DEPS = [
  "websockets",
  "aiohttp",
  "flask-socketio",
  "channels",
  "django-channels",
  "starlette",
  "fastapi",
  "sse-starlette",
  "python-socketio",
];

const REALTIME_FILE_PATTERNS = [
  "websocket",
  "realtime",
  "real-time",
  "streaming",
  "stream",
  "sse",
  "socket",
];

const REALTIME_README_TERMS = [
  "websocket",
  "server-sent events",
  "event stream",
  "text/event-stream",
  "streaming response",
  "real-time",
  "realtime",
  "live updates",
  "sse",
  "socket.io",
];

const REALTIME_SOURCE_TERMS = [
  "WebSocket",
  "websocket",
  "text/event-stream",
  "ReadableStream",
  "EventSource",
  "socket.io",
  "onmessage",
  "new WebSocket",
  "streamText",
  "streamObject",
  "createEventStream",
  "TransformStream",
];

export function detectRealtime(scan: RepoScan): Evidence[] {
  const positive: Evidence[] = [];

  const foundNodeDep = findMatchingDependency(scan, REALTIME_DEPS);
  if (foundNodeDep) {
    positive.push(makeEvidence(`package.json includes ${foundNodeDep}`, "package_json", true));
  } else {
    const foundPyDep = findMatchingPythonDep(scan, [...REALTIME_DEPS, ...REALTIME_PYTHON_EXTRA_DEPS]);
    if (foundPyDep) {
      positive.push(
        makeEvidence(`${foundPyDep.file} includes ${foundPyDep.name}`, "package_json", true)
      );
    }
  }

  const rtFiles = matchingFilePaths(scan.fileTree, REALTIME_FILE_PATTERNS);
  for (const path of rtFiles.slice(0, 3)) {
    positive.push(
      makeEvidence(`${path} suggests real-time or streaming implementation`, "file_tree", true)
    );
  }

  const readmeHits = readmeMatchingTerms(scan.readmeText, REALTIME_README_TERMS);
  if (readmeHits.length > 0) {
    positive.push(makeEvidence(`README mentions "${readmeHits[0]}"`, "readme", true));
  }

  const srcHits = sourceMatchingTerms(scan.sourceFiles, REALTIME_SOURCE_TERMS);
  for (const hit of srcHits.slice(0, 2)) {
    positive.push(
      makeEvidence(`${hit.path} contains streaming pattern ("${hit.term}")`, "source_file", true)
    );
  }

  if (positive.length === 0) {
    return [makeEvidence("No implementation evidence found", "absence", false)];
  }

  const evidence: Evidence[] = [...positive];

  const hasDepEvidence = positive.some((e) => e.source === "package_json");
  const hasSourceEvidence = positive.some(
    (e) => e.source === "source_file" || e.source === "file_tree"
  );

  if (!hasDepEvidence) {
    evidence.push(
      makeEvidence(
        "No real-time dependency found (socket.io, ws, eventsource, websockets, etc.)",
        "package_json",
        false
      )
    );
  }
  if (!hasSourceEvidence) {
    evidence.push(
      makeEvidence(
        "No WebSocket, SSE, or streaming implementation found in source files",
        "absence",
        false
      )
    );
  }

  return evidence;
}
