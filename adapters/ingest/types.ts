export type IngestSource = "mock" | "browserbase";
export type IngestStatus = "success" | "partial" | "failed";

export interface ProjectIngestInput {
  projectUrl: string;
}

export interface ProjectIngestResult {
  title: string;
  description: string;
  builtWith: string[];
  githubUrl: string;
  source: IngestSource;
  status: IngestStatus;
  warnings: string[];
}

/** Returns null if the URL could not be ingested at all. */
export interface ProjectIngestor {
  ingest(input: ProjectIngestInput): Promise<ProjectIngestResult | null>;
}
