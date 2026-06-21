import type { RepoScan } from "../../types/pipeline";
import type { RepoScannerAdapter } from "./types";

const FIXTURE_FILE_TREE = [
  "README.md",
  "package.json",
  "src/index.ts",
  "src/agent.ts",
  "src/coordinator.ts",
];

const FIXTURE_PACKAGE_JSON: Record<string, unknown> = {
  name: "example-project",
  version: "0.1.0",
  dependencies: {},
};

const FIXTURE_README =
  "This project is a demonstration. No specific technology claims are made in this fixture.";

export const mockScanner: RepoScannerAdapter = {
  async scan(owner: string, repo: string, normalizedUrl: string): Promise<RepoScan> {
    return {
      githubUrl: normalizedUrl,
      owner,
      repo,
      source: "mock",
      defaultBranch: null,
      fileTree: FIXTURE_FILE_TREE,
      packageJson: FIXTURE_PACKAGE_JSON,
      readmeText: FIXTURE_README,
      sourceFiles: {},
      pythonDepFiles: {},
    };
  },
};
