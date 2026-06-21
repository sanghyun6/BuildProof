import type { RepoScan } from "../../types/pipeline";
import type { RepoScannerAdapter } from "./types";

const GITHUB_API = "https://api.github.com";

const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
]);

// Directories whose contents are not useful for detector evidence
const SKIP_DIR_PREFIXES = [
  "node_modules/", ".git/", "dist/", "build/", ".next/", "coverage/",
  "__pycache__/", ".venv/", "venv/", "vendor/",
];

const SKIP_FILENAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
  "Cargo.lock", "go.sum",
]);

// Max individual source file fetches per audit — conserves GitHub API quota
const SOURCE_FILE_LIMIT = 15;
// Max characters per fetched source file
const SOURCE_FILE_MAX_CHARS = 8000;
// Skip files larger than this from the tree (bytes) — avoids fetching large generated files
const MAX_SOURCE_FILE_BYTES = 200_000;

interface GitHubRepoResponse {
  default_branch?: string;
  message?: string;
}

interface GitHubTreeItem {
  path: string;
  type: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeItem[];
  truncated?: boolean;
  message?: string;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
  message?: string;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // GITHUB_TOKEN is only accessible server-side; never use NEXT_PUBLIC_GITHUB_TOKEN
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function shouldFetch(path: string): boolean {
  for (const prefix of SKIP_DIR_PREFIXES) {
    if (path.startsWith(prefix) || path.includes("/" + prefix)) return false;
  }
  const filename = path.split("/").pop() ?? path;
  if (SKIP_FILENAMES.has(filename)) return false;
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) return false;
  return ALLOWED_EXTENSIONS.has(filename.slice(dotIdx));
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/\n/g, ""), "base64").toString("utf-8");
}

async function fetchJSON<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export const realScanner: RepoScannerAdapter = {
  async scan(owner: string, repo: string, normalizedUrl: string): Promise<RepoScan> {
    const headers = buildHeaders();

    const empty: RepoScan = {
      githubUrl: normalizedUrl,
      owner,
      repo,
      source: "unavailable",
      defaultBranch: null,
      fileTree: [],
      packageJson: null,
      readmeText: null,
      sourceFiles: {},
      pythonDepFiles: {},
    };

    // 1. Repo info — get default branch; failure means repo is inaccessible
    const repoData = await fetchJSON<GitHubRepoResponse>(
      `${GITHUB_API}/repos/${owner}/${repo}`,
      headers,
    );
    if (!repoData || repoData.message) return empty;

    const defaultBranch = repoData.default_branch ?? "main";

    // 2. Recursive file tree — keep path list and a size map for pre-fetch filtering
    let fileTree: string[] = [];
    const fileSizes = new Map<string, number>();
    const treeData = await fetchJSON<GitHubTreeResponse>(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      headers,
    );
    if (treeData?.tree) {
      fileTree = treeData.tree
        .filter((item) => item.type === "blob")
        .map((item) => {
          if (item.size !== undefined) fileSizes.set(item.path, item.size);
          return item.path;
        });
    }

    // 3. README, package.json, and Python dep files in parallel
    const PYTHON_DEP_FILENAMES = [
      "requirements.txt",
      "pyproject.toml",
      "setup.cfg",
      "Pipfile",
      "setup.py",
    ];

    const [readmeData, pkgData, ...pyDepResults] = await Promise.all([
      fetchJSON<GitHubContentResponse>(
        `${GITHUB_API}/repos/${owner}/${repo}/readme`,
        headers,
      ),
      fetchJSON<GitHubContentResponse>(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/package.json`,
        headers,
      ),
      ...PYTHON_DEP_FILENAMES.map((filename) =>
        fetchJSON<GitHubContentResponse>(
          `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`,
          headers,
        ).then((data) => ({ filename, data })),
      ),
    ]);

    const readmeText =
      readmeData?.content && readmeData.encoding === "base64"
        ? decodeBase64(readmeData.content)
        : null;

    let packageJson: Record<string, unknown> | null = null;
    if (pkgData?.content && pkgData.encoding === "base64") {
      try {
        packageJson = JSON.parse(decodeBase64(pkgData.content)) as Record<string, unknown>;
      } catch {
        // malformed package.json — leave null
      }
    }

    const pythonDepFiles: Record<string, string> = {};
    for (const result of pyDepResults) {
      const { filename, data } = result as { filename: string; data: GitHubContentResponse | null };
      if (data?.content && data.encoding === "base64") {
        try {
          pythonDepFiles[filename] = decodeBase64(data.content);
        } catch {
          // skip undecodable file
        }
      }
    }

    // 4. Selected source file snippets — skip files over the size limit before fetching
    const sourceFilePaths = fileTree
      .filter((path) => shouldFetch(path) && (fileSizes.get(path) ?? 0) <= MAX_SOURCE_FILE_BYTES)
      .slice(0, SOURCE_FILE_LIMIT);
    const sourceFiles: Record<string, string> = {};

    await Promise.all(
      sourceFilePaths.map(async (path) => {
        const data = await fetchJSON<GitHubContentResponse>(
          `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
          headers,
        );
        if (data?.content && data.encoding === "base64") {
          try {
            sourceFiles[path] = decodeBase64(data.content).slice(0, SOURCE_FILE_MAX_CHARS);
          } catch {
            // skip undecodable file
          }
        }
      }),
    );

    return {
      githubUrl: normalizedUrl,
      owner,
      repo,
      source: "github-api",
      defaultBranch,
      fileTree,
      packageJson,
      readmeText,
      sourceFiles,
      pythonDepFiles,
    };
  },
};
