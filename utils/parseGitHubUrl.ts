export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  normalizedUrl: string;
}

const VALID_SEGMENT = /^[a-zA-Z0-9_.-]+$/;

export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  const trimmed = url.trim();

  // HTTPS: https://github.com/owner/repo[/anything]
  const httpsMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/.*)?$/
  );
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2].replace(/\.git$/, "");
    if (!VALID_SEGMENT.test(owner) || !VALID_SEGMENT.test(repo)) return null;
    return { owner, repo, normalizedUrl: `https://github.com/${owner}/${repo}` };
  }

  // SSH: git@github.com:owner/repo[.git]
  const sshMatch = trimmed.match(
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/
  );
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    if (!VALID_SEGMENT.test(owner) || !VALID_SEGMENT.test(repo)) return null;
    return { owner, repo, normalizedUrl: `https://github.com/${owner}/${repo}` };
  }

  return null;
}
