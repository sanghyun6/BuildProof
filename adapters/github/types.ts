import type { RepoScan } from "../../types/pipeline";

export interface RepoScannerAdapter {
  scan(owner: string, repo: string, normalizedUrl: string): Promise<RepoScan>;
}
