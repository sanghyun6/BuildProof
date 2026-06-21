import type { ProjectInput } from "../types/pipeline";

export function ingestProject(input: ProjectInput): ProjectInput {
  return {
    projectText: input.projectText.trim(),
    githubUrl: input.githubUrl.trim(),
  };
}
