import { NextResponse } from "next/server";
import { getIntegrationStatus } from "../../../lib/integrationStatus";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getIntegrationStatus());
}
