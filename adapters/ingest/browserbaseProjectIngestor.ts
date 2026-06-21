import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";
import type { ProjectIngestor, ProjectIngestInput, ProjectIngestResult } from "./types";

const OVERALL_TIMEOUT_MS = 45_000;

async function doIngest(
  apiKey: string,
  projectId: string,
  input: ProjectIngestInput,
): Promise<ProjectIngestResult | null> {
  let browser: Browser | null = null;
  try {
    const bb = new Browserbase({ apiKey });
    const session = await bb.sessions.create({ projectId });

    browser = await chromium.connectOverCDP(session.connectUrl);

    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0]! : await browser.newContext();
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0]! : await context.newPage();

    await page.goto(input.projectUrl, { waitUntil: "load", timeout: 30_000 });

    const extracted = await page.evaluate(() => {
      function getTitle(): string {
        return document.querySelector("h1")?.textContent?.trim() ?? "";
      }

      function getDescription(): string {
        const parts: string[] = [];
        document.querySelectorAll(
          "#app-details-left p, .app-details p, .project-description p"
        ).forEach((el) => {
          const text = el.textContent?.trim();
          if (text && text.length > 15) parts.push(text);
        });
        if (parts.length === 0) {
          const container =
            document.querySelector("main") ??
            document.querySelector("article") ??
            document.querySelector('[role="main"]') ??
            document.querySelector(".content");
          if (container) {
            container.querySelectorAll("p").forEach((el) => {
              const text = el.textContent?.trim();
              if (text && text.length > 15) parts.push(text);
            });
          }
        }
        return parts.slice(0, 15).join(" ");
      }

      function getBuiltWith(): string[] {
        const techs: string[] = [];
        document.querySelectorAll(
          "#built-with .software-list-content span, " +
            "#built-with span.cp-tag-secondary, " +
            "[data-field='built-with'] span, " +
            ".built-with-section span"
        ).forEach((el) => {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length < 50) techs.push(text);
        });
        return [...new Set(techs)];
      }

      function getGitHubUrl(): string {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href;
          if (
            href &&
            href.includes("github.com") &&
            !href.includes("github.com/login") &&
            !href.includes("github.com/marketplace") &&
            href !== "https://github.com/"
          ) {
            return href;
          }
        }
        return "";
      }

      return {
        title: getTitle(),
        description: getDescription(),
        builtWith: getBuiltWith(),
        githubUrl: getGitHubUrl(),
      };
    });

    const description = extracted.description.trim();
    const status: "success" | "partial" = description.length > 0 ? "success" : "partial";
    const warnings: string[] = [];
    if (status === "partial") {
      warnings.push(
        "Page content could not be fully extracted from this URL — description may be incomplete."
      );
    }

    return {
      title: extracted.title || "Untitled project",
      description:
        description || "(No project description could be extracted from the page)",
      builtWith: extracted.builtWith,
      githubUrl: extracted.githubUrl,
      source: "browserbase",
      status,
      warnings,
    };
  } catch (err) {
    console.error("[browserbaseProjectIngestor]", err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export const browserbaseProjectIngestor: ProjectIngestor = {
  async ingest(input: ProjectIngestInput): Promise<ProjectIngestResult | null> {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;

    if (!apiKey || !projectId) {
      return null;
    }

    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), OVERALL_TIMEOUT_MS),
    );
    return Promise.race([doIngest(apiKey, projectId, input), timeout]);
  },
};
