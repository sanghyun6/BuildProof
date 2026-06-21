import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "../../../pipeline";
import { browserbaseProjectIngestor } from "../../../adapters/ingest/browserbaseProjectIngestor";
import { mockProjectIngestor } from "../../../adapters/ingest/mockProjectIngestor";
import { captureSentryError } from "../../../adapters/trace/sentryTraceAdapter";
import type { ProjectInput } from "../../../types/pipeline";

type RequestBody = Record<string, unknown>;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    // Mode B: project URL audit
    if (typeof body.projectUrl === "string") {
      const projectUrl = body.projectUrl.trim();
      if (!projectUrl) {
        return NextResponse.json({ error: "projectUrl must not be empty" }, { status: 400 });
      }

      const hasBrowserbaseKeys =
        !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID;

      // Try Browserbase first (returns null if env vars missing or ingestion fails)
      let ingestResult = await browserbaseProjectIngestor.ingest({ projectUrl });
      const browserbaseFailed = hasBrowserbaseKeys && ingestResult === null;

      // Fall back to mock if Browserbase was not used or failed
      if (ingestResult === null) {
        const mockResult = await mockProjectIngestor.ingest({ projectUrl });
        if (mockResult === null) {
          return NextResponse.json(
            { error: "Project URL could not be ingested" },
            { status: 422 },
          );
        }
        ingestResult = browserbaseFailed
          ? {
              ...mockResult,
              warnings: [
                "Browserbase ingestion encountered an error — showing demo fixture data as fallback.",
                ...mockResult.warnings,
              ],
            }
          : mockResult;
      }

      if (ingestResult === null) {
        return NextResponse.json(
          { error: "Project URL could not be ingested" },
          { status: 422 },
        );
      }

      const input: ProjectInput = {
        projectText: ingestResult.description,
        githubUrl: ingestResult.githubUrl,
      };

      const report = await runPipeline(input, {
        ingestMeta: {
          title: ingestResult.title,
          builtWith: ingestResult.builtWith,
          source: ingestResult.source,
          status: ingestResult.status,
          warnings: ingestResult.warnings,
        },
      });
      return NextResponse.json(report);
    }

    // Mode A: manual audit
    if (typeof body.projectText === "string" && typeof body.githubUrl === "string") {
      const input: ProjectInput = {
        projectText: body.projectText,
        githubUrl: body.githubUrl,
      };
      const report = await runPipeline(input);
      return NextResponse.json(report);
    }

    return NextResponse.json(
      { error: "Request must include projectUrl (URL mode) or projectText + githubUrl (manual mode)" },
      { status: 400 },
    );
  } catch (err) {
    await captureSentryError(err);
    const message = err instanceof Error ? err.message : "Pipeline error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
