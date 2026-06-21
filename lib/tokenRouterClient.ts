const TOKENROUTER_ENDPOINT = "https://api.tokenrouter.com/v1/chat/completions";

export interface TokenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface TokenRouterCallOptions {
  messages: TokenRouterMessage[];
  timeoutMs?: number;
}

export type TokenRouterResult =
  | { ok: true; content: string; model: string; durationMs: number }
  | { ok: false; reason: string; httpStatus?: number; durationMs: number; bodyPreview?: string };

export function tokenRouterConfigured(): boolean {
  return !!process.env.TOKENROUTER_API_KEY;
}

export function tokenRouterModel(): string {
  return process.env.TOKENROUTER_MODEL ?? "MiniMax-M3";
}

/** Safe body snippet: strips any token-like strings, caps at 200 chars. */
function safeBodyPreview(raw: string): string {
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/"[a-zA-Z0-9_\-]{32,}"/g, '"[redacted]"')
    .slice(0, 200);
}

/**
 * Removes <think>...</think> reasoning blocks that models like MiniMax-M3 emit
 * before their actual answer. Works on incomplete tags (no closing tag) too.
 */
export function stripReasoning(text: string): string {
  // Remove complete <think>...</think> blocks (including multiline)
  let result = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Remove any dangling opening tag and everything before the first non-tag content
  result = result.replace(/<think>[\s\S]*/gi, "");
  return result.trim();
}

export async function callTokenRouter(
  options: TokenRouterCallOptions,
): Promise<TokenRouterResult> {
  const apiKey = process.env.TOKENROUTER_API_KEY;
  const model = tokenRouterModel();
  const timeoutMs = options.timeoutMs ?? 30_000;

  if (!apiKey) {
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=skipped reason=no-key",
      model,
    );
    return { ok: false, reason: "no-key", durationMs: 0 };
  }

  const start = Date.now();
  let response: Response;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(TOKENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages: options.messages }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    const reason =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "network-error";
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=error reason=%s durationMs=%d",
      model,
      reason,
      durationMs,
    );
    return { ok: false, reason, durationMs };
  }

  const durationMs = Date.now() - start;

  if (!response.ok) {
    let bodyPreview: string | undefined;
    try {
      const rawBody = await response.text();
      bodyPreview = safeBodyPreview(rawBody);
    } catch {
      // ignore — body reading is best-effort
    }
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=error http=%d durationMs=%d body=%s",
      model,
      response.status,
      durationMs,
      bodyPreview ?? "(unreadable)",
    );
    return { ok: false, reason: `http-${response.status}`, httpStatus: response.status, durationMs, bodyPreview };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=error reason=invalid-json durationMs=%d",
      model,
      durationMs,
    );
    return { ok: false, reason: "invalid-json", durationMs };
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).choices) ||
    (data as { choices: unknown[] }).choices.length === 0
  ) {
    const bodyPreview = safeBodyPreview(JSON.stringify(data));
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=error reason=malformed-response durationMs=%d body=%s",
      model,
      durationMs,
      bodyPreview,
    );
    return { ok: false, reason: "malformed-response", durationMs, bodyPreview };
  }

  type Choices = Array<{ message?: { content?: string | null } }>;
  const content = (data as { choices: Choices }).choices[0]?.message?.content;

  if (typeof content !== "string" || !content) {
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=error reason=empty-content durationMs=%d",
      model,
      durationMs,
    );
    return { ok: false, reason: "empty-content", durationMs };
  }

  const stripped = stripReasoning(content);
  if (!stripped) {
    console.log(
      "[TokenRouter] provider=tokenrouter model=%s status=error reason=empty-after-stripping durationMs=%d",
      model,
      durationMs,
    );
    return { ok: false, reason: "empty-after-stripping", durationMs };
  }

  console.log(
    "[TokenRouter] provider=tokenrouter model=%s status=success durationMs=%d",
    model,
    durationMs,
  );
  return { ok: true, content: stripped, model, durationMs };
}
