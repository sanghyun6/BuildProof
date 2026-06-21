import type { Evidence, RepoScan } from "../types/pipeline";
import {
  findMatchingPythonDep,
  hasAnyDependency,
  makeEvidence,
  matchingFilePaths,
  readmeMatchingTerms,
} from "./scan";

export interface SignalQuery {
  label: string;
  nodeDeps?: string[];
  pythonDeps?: string[];
  configFilenames?: string[];
  filePathPatterns?: string[];
  readmeTerms?: string[];
  importPackages?: string[];
  usagePatterns?: string[];
  absenceMessages?: {
    noDep?: string;
    noSource?: string;
    overall?: string;
  };
  maxImports?: number;
  maxUsages?: number;
  maxFilePaths?: number;
  maxConfigFiles?: number;
}

export interface SignalSummary {
  nodeDep: string | null;
  pythonDep: { name: string; file: string } | null;
  configFiles: string[];
  filePaths: string[];
  readmeHits: string[];
  imports: Array<{ path: string; pkg: string }>;
  usages: Array<{ path: string; pattern: string }>;
}

export interface ImplementationSignalResult {
  evidence: Evidence[];
  summary: SignalSummary;
  hasDependencyEvidence: boolean;
  hasSourceImplementation: boolean;
  hasReadmeMention: boolean;
  isReadmeOnly: boolean;
}

const EMPTY_SUMMARY: SignalSummary = {
  nodeDep: null,
  pythonDep: null,
  configFiles: [],
  filePaths: [],
  readmeHits: [],
  imports: [],
  usages: [],
};

function matchesImport(content: string, pkg: string): boolean {
  // Match an import/require/from statement that names the package exactly or as a subpath root.
  // JS/TS: `from "pkg"`, `from 'pkg'`, `from "pkg/...`, `require("pkg")`, `require("pkg/...`, dynamic `import("pkg")`
  // Python: `import pkg`, `import pkg.x`, `from pkg import ...`, `from pkg.sub import ...`
  const jsForms = [
    `from "${pkg}"`,
    `from '${pkg}'`,
    `from "${pkg}/`,
    `from '${pkg}/`,
    `require("${pkg}")`,
    `require('${pkg}')`,
    `require("${pkg}/`,
    `require('${pkg}/`,
    `import("${pkg}")`,
    `import('${pkg}')`,
  ];
  for (const f of jsForms) {
    if (content.includes(f)) return true;
  }
  // Python is case-sensitive; package names are conventionally lowercase. Use a tiny regex.
  // Escape regex special chars in pkg.
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pyImport = new RegExp(`(^|\\n)\\s*import\\s+${escaped}(\\b|\\.)`);
  const pyFrom = new RegExp(`(^|\\n)\\s*from\\s+${escaped}(\\b|\\.)\\s+import\\b`);
  return pyImport.test(content) || pyFrom.test(content);
}

function findImportMatches(
  sourceFiles: Record<string, string>,
  packages: string[],
): Array<{ path: string; pkg: string }> {
  const results: Array<{ path: string; pkg: string }> = [];
  for (const [path, content] of Object.entries(sourceFiles)) {
    for (const pkg of packages) {
      if (matchesImport(content, pkg)) {
        results.push({ path, pkg });
        break;
      }
    }
  }
  return results;
}

function findUsagePatterns(
  sourceFiles: Record<string, string>,
  patterns: string[],
): Array<{ path: string; pattern: string }> {
  const results: Array<{ path: string; pattern: string }> = [];
  for (const [path, content] of Object.entries(sourceFiles)) {
    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        results.push({ path, pattern });
        break;
      }
    }
  }
  return results;
}

function findConfigFiles(fileTree: string[], filenames: string[]): string[] {
  const wanted = new Set(filenames.map((f) => f.toLowerCase()));
  return fileTree.filter((p) => {
    const basename = (p.split("/").pop() ?? "").toLowerCase();
    return wanted.has(basename);
  });
}

export function findImplementationSignals(
  scan: RepoScan,
  query: SignalQuery,
): ImplementationSignalResult {
  const summary: SignalSummary = { ...EMPTY_SUMMARY };

  if (query.nodeDeps && query.nodeDeps.length > 0) {
    summary.nodeDep = hasAnyDependency(scan.packageJson, query.nodeDeps);
  }

  if (query.pythonDeps && query.pythonDeps.length > 0) {
    summary.pythonDep = findMatchingPythonDep(scan, query.pythonDeps);
  }

  if (query.configFilenames && query.configFilenames.length > 0) {
    summary.configFiles = findConfigFiles(scan.fileTree, query.configFilenames);
  }

  if (query.filePathPatterns && query.filePathPatterns.length > 0) {
    summary.filePaths = matchingFilePaths(scan.fileTree, query.filePathPatterns);
  }

  if (query.readmeTerms && query.readmeTerms.length > 0) {
    summary.readmeHits = readmeMatchingTerms(scan.readmeText, query.readmeTerms);
  }

  if (query.importPackages && query.importPackages.length > 0) {
    summary.imports = findImportMatches(scan.sourceFiles, query.importPackages);
  }

  if (query.usagePatterns && query.usagePatterns.length > 0) {
    summary.usages = findUsagePatterns(scan.sourceFiles, query.usagePatterns);
  }

  const hasDependencyEvidence =
    summary.nodeDep !== null || summary.pythonDep !== null;
  const hasSourceImplementation =
    summary.imports.length > 0 || summary.usages.length > 0;
  const hasReadmeMention = summary.readmeHits.length > 0;
  const hasConfigEvidence = summary.configFiles.length > 0;
  const hasFilePathEvidence = summary.filePaths.length > 0;

  const isReadmeOnly =
    hasReadmeMention &&
    !hasDependencyEvidence &&
    !hasSourceImplementation &&
    !hasConfigEvidence &&
    !hasFilePathEvidence;

  const maxImports = query.maxImports ?? 2;
  const maxUsages = query.maxUsages ?? 2;
  const maxFilePaths = query.maxFilePaths ?? 3;
  const maxConfigFiles = query.maxConfigFiles ?? 2;

  // Track unique source-file paths cited so we do not duplicate the same path.
  const citedSourcePaths = new Set<string>();
  const evidence: Evidence[] = [];

  // Strongest: source-file imports first.
  for (const imp of summary.imports.slice(0, maxImports)) {
    evidence.push(
      makeEvidence(
        `${imp.path} imports ${imp.pkg}`,
        "source_file",
        true,
      ),
    );
    citedSourcePaths.add(imp.path);
  }

  // Then source-code usage patterns, skipping paths already cited as imports.
  let usageAdded = 0;
  for (const usage of summary.usages) {
    if (usageAdded >= maxUsages) break;
    if (citedSourcePaths.has(usage.path)) continue;
    evidence.push(
      makeEvidence(
        `${usage.path} uses ${query.label} pattern ("${usage.pattern}")`,
        "source_file",
        true,
      ),
    );
    citedSourcePaths.add(usage.path);
    usageAdded++;
  }

  // Dependency evidence: prefer Node, fall back to Python — never both for the same detector run.
  if (summary.nodeDep) {
    evidence.push(
      makeEvidence(`package.json includes ${summary.nodeDep}`, "package_json", true),
    );
  } else if (summary.pythonDep) {
    evidence.push(
      makeEvidence(
        `${summary.pythonDep.file} includes ${summary.pythonDep.name}`,
        "package_json",
        true,
      ),
    );
  }

  // Config files are stronger than generic path matches — surface them as file_tree evidence.
  for (const cf of summary.configFiles.slice(0, maxConfigFiles)) {
    evidence.push(
      makeEvidence(`${cf} is a ${query.label} config file`, "file_tree", true),
    );
  }

  // Generic file-path matches, deduped against config files already cited.
  const citedFilePaths = new Set(summary.configFiles.slice(0, maxConfigFiles));
  let pathsAdded = 0;
  for (const path of summary.filePaths) {
    if (pathsAdded >= maxFilePaths) break;
    if (citedFilePaths.has(path)) continue;
    evidence.push(
      makeEvidence(`${path} suggests ${query.label} implementation`, "file_tree", true),
    );
    citedFilePaths.add(path);
    pathsAdded++;
  }

  // README mention — the weakest positive signal.
  if (hasReadmeMention) {
    evidence.push(
      makeEvidence(`README mentions "${summary.readmeHits[0]}"`, "readme", true),
    );
  }

  if (evidence.length === 0) {
    return {
      evidence: [
        makeEvidence(
          query.absenceMessages?.overall ?? "No implementation evidence found",
          "absence",
          false,
        ),
      ],
      summary,
      hasDependencyEvidence,
      hasSourceImplementation,
      hasReadmeMention,
      isReadmeOnly: false,
    };
  }

  if (!hasDependencyEvidence) {
    evidence.push(
      makeEvidence(
        query.absenceMessages?.noDep ?? `No ${query.label} dependency found`,
        "package_json",
        false,
      ),
    );
  }
  if (!hasSourceImplementation) {
    evidence.push(
      makeEvidence(
        query.absenceMessages?.noSource ??
          `No ${query.label} implementation found in source files`,
        "absence",
        false,
      ),
    );
  }

  return {
    evidence,
    summary,
    hasDependencyEvidence,
    hasSourceImplementation,
    hasReadmeMention,
    isReadmeOnly,
  };
}
