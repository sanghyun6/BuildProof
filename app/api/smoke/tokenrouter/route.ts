import { NextResponse } from "next/server";
import { callTokenRouter, tokenRouterModel } from "../../../../lib/tokenRouterClient";

export interface SmokeResult {
  status: "success" | "failed" | "skipped";
  model: string;
  durationMs?: number;
  reason?: string;
  httpStatus?: number;
  bodyPreview?: string;
  responsePreview?: string;
}

export async function GET(): Promise<NextResponse<SmokeResult>> {
  const model = tokenRouterModel();

  if (!process.env.TOKENROUTER_API_KEY) {
    return NextResponse.json({
      status: "skipped",
      model,
      reason: "TOKENROUTER_API_KEY not configured — add it to .env.local",
    });
  }

  const result = await callTokenRouter({
    messages: [{ role: "user", content: "Return only the word OK." }],
    timeoutMs: 15_000,
  });

  if (!result.ok) {
    return NextResponse.json({
      status: "failed",
      model,
      durationMs: result.durationMs,
      reason: result.reason,
      ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
      ...(result.bodyPreview ? { bodyPreview: result.bodyPreview } : {}),
    });
  }

  return NextResponse.json({
    status: "success",
    model: result.model,
    durationMs: result.durationMs,
    responsePreview: result.content.slice(0, 60),
  });
}
