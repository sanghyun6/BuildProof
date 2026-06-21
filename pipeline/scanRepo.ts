import type { ProjectInput, RepoScan } from "../types/pipeline";
import { parseGitHubUrl } from "../utils/parseGitHubUrl";
import { realScanner } from "../adapters/github/realScanner";

export async function scanRepo(input: ProjectInput): Promise<RepoScan> {
  const parsed = parseGitHubUrl(input.githubUrl);

  if (!parsed) {
    return {
      githubUrl: input.githubUrl,
      owner: null,
      repo: null,
      source: "invalid-url",
      defaultBranch: null,
      fileTree: [],
      packageJson: null,
      readmeText: null,
      sourceFiles: {},
      pythonDepFiles: {},
    };
  }

  return realScanner.scan(parsed.owner, parsed.repo, parsed.normalizedUrl);
}
