import type { Evidence, RepoScan } from "../types/pipeline";

export function getDependencyNames(packageJson: Record<string, unknown>): string[] {
  const sections = ["dependencies", "devDependencies", "peerDependencies"] as const;
  const names = new Set<string>();
  for (const section of sections) {
    const deps = packageJson[section];
    if (deps !== null && typeof deps === "object") {
      for (const name of Object.keys(deps as Record<string, unknown>)) {
        names.add(name.toLowerCase());
      }
    }
  }
  return Array.from(names);
}

export function hasDependency(
  packageJson: Record<string, unknown> | null,
  name: string
): boolean {
  if (!packageJson) return false;
  return getDependencyNames(packageJson).includes(name.toLowerCase());
}

export function hasAnyDependency(
  packageJson: Record<string, unknown> | null,
  names: string[]
): string | null {
  if (!packageJson) return null;
  const deps = getDependencyNames(packageJson);
  const lower = names.map((n) => n.toLowerCase());
  const found = lower.find((n) => deps.includes(n));
  return found ?? null;
}

export function matchingFilePaths(fileTree: string[], patterns: string[]): string[] {
  const lower = patterns.map((p) => p.toLowerCase());
  return fileTree.filter((path) => {
    const lp = path.toLowerCase();
    return lower.some((p) => lp.includes(p));
  });
}

export function readmeMatchingTerms(
  readmeText: string | null,
  terms: string[]
): string[] {
  if (!readmeText) return [];
  const lower = readmeText.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}

export function sourceMatchingTerms(
  sourceFiles: Record<string, string>,
  terms: string[]
): Array<{ path: string; term: string }> {
  const results: Array<{ path: string; term: string }> = [];
  const lowerTerms = terms.map((t) => t.toLowerCase());
  for (const [path, content] of Object.entries(sourceFiles)) {
    const lc = content.toLowerCase();
    for (let i = 0; i < lowerTerms.length; i++) {
      if (lc.includes(lowerTerms[i])) {
        results.push({ path, term: terms[i] });
        break;
      }
    }
  }
  return results;
}

export function packageJsonRawIncludes(
  packageJson: Record<string, unknown> | null,
  term: string
): boolean {
  if (!packageJson) return false;
  return JSON.stringify(packageJson).toLowerCase().includes(term.toLowerCase());
}

export function makeEvidence(
  text: string,
  source: Evidence["source"],
  positive: boolean
): Evidence {
  return { text, source, positive };
}

// Returns the first matching dependency name from the scan, or null.
export function findMatchingDependency(
  scan: RepoScan,
  candidates: string[]
): string | null {
  return hasAnyDependency(scan.packageJson, candidates);
}

// Returns true if a requirements.txt-style or quoted dependency line names the candidate.
function pyLineMatches(line: string, candidate: string): boolean {
  const trimmed = line.trim().toLowerCase();
  const cand = candidate.toLowerCase();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return false;

  // requirements.txt / setup.cfg style: "crewai>=0.1" or "crewai"
  if (trimmed.startsWith(cand)) {
    const next = trimmed[cand.length];
    if (next === undefined || /[>=<![\s,;'"@]/.test(next)) return true;
  }

  // Quoted style in pyproject.toml / Pipfile: '"crewai"' or '"crewai>=0.1"'
  for (const q of ['"', "'"]) {
    const idx = trimmed.indexOf(q + cand);
    if (idx !== -1) {
      const next = trimmed[idx + 1 + cand.length];
      if (next === undefined || /[>=<![\s,;'"@[\]]/.test(next)) return true;
    }
  }

  return false;
}

/**
 * Searches pythonDepFiles (requirements.txt, pyproject.toml, etc.) for any of the
 * candidate package names. Returns the matched name and the source filename, or null.
 */
export function findMatchingPythonDep(
  scan: RepoScan,
  candidates: string[]
): { name: string; file: string } | null {
  for (const [filename, content] of Object.entries(scan.pythonDepFiles)) {
    for (const line of content.split("\n")) {
      for (const candidate of candidates) {
        if (pyLineMatches(line, candidate)) {
          return { name: candidate, file: filename };
        }
      }
    }
  }
  return null;
}
